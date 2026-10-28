import { NextResponse } from "next/server";
import { getServerSession, authorize } from "@/lib/auth";
import { query, queryOne, getDb } from "@/lib/db/sqlite";

export const runtime = "nodejs";

function scopeFilter(user: {
  userId: string;
  roleKey: string;
  schoolId: string | null;
  directorateId: string | null;
}): { school?: string; directorate?: string; inspector?: string } {
  if (user.roleKey === "SUPER_ADMIN") return {};
  if (user.roleKey === "EDUCATION_DIRECTOR")
    return { directorate: user.directorateId ?? undefined };
  if (user.roleKey === "SCHOOL_PRINCIPAL") return { school: user.schoolId ?? undefined };
  if (user.roleKey === "INSPECTOR") return { inspector: user.userId };
  return {};
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  }
  const { allowed } = authorize(session, {
    roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"],
  });
  if (!allowed) {
    return NextResponse.json({ message: "غير مصرح لك بعرض اللوحة" }, { status: 403 });
  }

  try {
    const scope = scopeFilter(session);
  const s = scope.school ? `AND s.id = '${scope.school}'` : "";
  const d = scope.directorate ? `AND s.directorate_id = '${scope.directorate}'` : "";
  const i = scope.inspector ? `AND v.inspector_id = '${scope.inspector}'` : "";

  const num = (sql: string): number => {
    const row = queryOne<{ n: number }>(sql);
    return row ? row.n : 0;
  };

  // 1. المدارس
  const schoolsTotal = num(
    `SELECT COUNT(*) n FROM schools s WHERE s.status = 'ACTIVE' ${s} ${d}`
  );
  const schoolsActive = num(
    `SELECT COUNT(*) n FROM schools s WHERE s.status = 'ACTIVE' ${s} ${d}`
  );

  // 2-3. الزيارات
  const visitsToday = num(
    `SELECT COUNT(*) n FROM visits v JOIN schools s ON s.id = v.school_id WHERE date(v.created_at) = date('now') AND v.status <> 'CANCELLED' ${s} ${d} ${i}`
  );
  const byStatus = query<{ status: string; n: number }>(
    `SELECT v.status AS status, COUNT(*) n FROM visits v JOIN schools s ON s.id = v.school_id WHERE 1=1 ${s} ${d} ${i} GROUP BY v.status`
  );

  // 4. متوسط تحقيق المعايير
  const avgRow = queryOne<{ avgScore: number | null; n: number }>(
    `SELECT AVG(e.score * 100.0 / 3) AS avgScore, COUNT(*) n FROM evaluations e
     JOIN visits v ON v.id = e.visit_id
     JOIN schools s ON s.id = v.school_id
     WHERE e.status <> 'NOT_EVALUATED' ${s} ${d} ${i}`
  );

  // 5. نسبة الأدلة المرفقة
  const evRow = queryOne<{ evals: number; withEvidence: number }>(
    `SELECT COUNT(DISTINCT e.id) AS evals, COUNT(DISTINCT ev.id) AS withEvidence
     FROM evaluations e
     JOIN visits v ON v.id = e.visit_id
     JOIN schools s ON s.id = v.school_id
     LEFT JOIN evidence ev ON ev.evaluation_id = e.id
     WHERE e.status <> 'NOT_EVALUATED' ${s} ${d} ${i}`
  );

  // 6. خطط تحسن مفتوحة وإجراءات متأخرة
  const plansOpen = num(
    `SELECT COUNT(*) n FROM improvement_plans p JOIN schools s ON s.id = p.school_id WHERE p.status = 'ACTIVE' ${s} ${d}`
  );
  const actionsOverdue = num(
    `SELECT COUNT(*) n FROM corrective_actions a
     JOIN improvement_plans p ON p.id = a.plan_id
     JOIN schools s ON s.id = p.school_id
     WHERE a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED')
       AND datetime(a.due_date) < datetime('now') ${s} ${d}`
  );

  // 7. مدارس تحتاج متابعة عاجلة
  const urgentSchools = query<{
    id: string;
    code: string;
    name: string;
    avgScore: number | null;
  }>(
    `SELECT s.id, s.code, s.name,
            ROUND(AVG(CASE WHEN e.status <> 'NOT_EVALUATED' THEN e.score * 100.0 / 3 END), 1) AS avgScore
     FROM schools s
     LEFT JOIN visits v ON v.school_id = s.id AND v.status = 'COMPLETED'
     LEFT JOIN evaluations e ON e.visit_id = v.id AND e.status <> 'NOT_EVALUATED'
     WHERE s.status = 'ACTIVE' ${s} ${d}
     GROUP BY s.id
     HAVING avgScore < 50 OR avgScore IS NULL
     ORDER BY avgScore IS NULL, avgScore ASC
     LIMIT 5`
  );

  // 8. مقارنة التحسن (آخر 30 يومًا مقابل 30 يومًا قبلها)
  const trendRow = queryOne<{ thisMonth: number | null; lastMonth: number | null }>(
    `SELECT 
       ROUND(AVG(CASE WHEN date(v.updated_at) >= date('now','-30 day') AND e.status <> 'NOT_EVALUATED' THEN e.score * 100.0 / 3 END), 1) AS thisMonth,
       ROUND(AVG(CASE WHEN date(v.updated_at) BETWEEN date('now','-60 day') AND date('now','-31 day') AND e.status <> 'NOT_EVALUATED' THEN e.score * 100.0 / 3 END), 1) AS lastMonth
     FROM evaluations e
     JOIN visits v ON v.id = e.visit_id
     JOIN schools s ON s.id = v.school_id
     WHERE 1=1 ${s} ${d} ${i}`
  );

  // 8ب. التوزيع الجغرافي بحسب المديرية
  const byDirectorate = query<{ name: string; count: number }>(
    `SELECT COALESCE(dir.name, 'غير محددة') AS name, COUNT(s.id) AS count
     FROM schools s
     LEFT JOIN directorates dir ON dir.id = s.directorate_id
     WHERE s.status = 'ACTIVE' ${s} ${d}
     GROUP BY dir.id
     ORDER BY count DESC
     LIMIT 8`
  );

  // 9. الخريطة
  const mapSchools = query<{
    id: string;
    code: string;
    name: string;
    latitude: number;
    longitude: number;
  }>(
    `SELECT id, code, name, latitude, longitude FROM schools WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status = 'ACTIVE' ${s} ${d}`
  );

  // 10. نشاط المفتشين
  const inspectorActivity = query<{
    inspectorName: string;
    visitsCount: number;
    completedCount: number;
  }>(
    `SELECT u.name AS inspectorName,
            COUNT(v.id) AS visitsCount,
            SUM(CASE WHEN v.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedCount
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN visits v ON v.inspector_id = u.id ${i}
     WHERE r.key = 'INSPECTOR' ${scope.inspector ? `AND u.id = '${scope.inspector}'` : ""}
     GROUP BY u.id
     ORDER BY visitsCount DESC
     LIMIT 10`
  );

  // 11. المشكلات المتكررة
  const recurringProblems = query<{
    indicatorCode: string;
    indicatorTitle: string;
    actionsCount: number;
  }>(
    `SELECT i.code AS indicatorCode, i.title AS indicatorTitle, COUNT(a.id) AS actionsCount
     FROM corrective_actions a
     JOIN indicators i ON i.id = a.indicator_id
     JOIN evaluations e ON e.id = a.evaluation_id
     JOIN visits v ON v.id = e.visit_id
     JOIN schools s ON s.id = v.school_id
     WHERE 1=1 ${s} ${d} ${i}
     GROUP BY i.id
     ORDER BY actionsCount DESC
     LIMIT 6`
  );

  // 12. الإعلانات الصالحة لنطاق المستخدم
  const announcements = num(
    `SELECT COUNT(*) n FROM announcements WHERE (json_array_length(directorate_ids) = 0 OR EXISTS (SELECT 1 FROM json_each(directorate_ids) WHERE value = '${scope.directorate ?? ""}'))`
  );

  return NextResponse.json({
      schools: { total: schoolsTotal, active: schoolsActive },
      visits: {
        today: visitsToday,
        byStatus: Object.fromEntries(byStatus.map((x) => [x.status, x.n])),
      },
      criteriaAverage: avgRow?.avgScore ? Math.round(avgRow.avgScore * 10) / 10 : 0,
      evaluatedIndicators: avgRow?.n ?? 0,
      evidenceCompletion: (() => { const e = evRow?.evals ?? 0; const w = evRow?.withEvidence ?? 0; return e ? Math.round((w / e) * 100) : 0; })(),
      improvement: { plansOpen, actionsOverdue },
      urgentSchools,
      trend: { thisMonth: trendRow?.thisMonth ?? 0, lastMonth: trendRow?.lastMonth ?? 0 },
      map: mapSchools,
      byDirectorate,
      inspectors: inspectorActivity,
      recurringProblems,
      announcements,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ message: "فشل تحميل الإحصائيات", debug: e?.message }, { status: 500 });
  }
}
