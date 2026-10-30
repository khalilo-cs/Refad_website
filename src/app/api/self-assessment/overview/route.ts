import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";
import { normalizeYear, REVIEWER_ROLES } from "@/lib/self-assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/self-assessment/overview?year= — لوحة متابعة الإدارة: حالة كل مدرسة في دورة التحسين. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  if (!REVIEWER_ROLES.includes(session.roleKey) || session.mustChangePassword) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const year = normalizeYear(request.nextUrl.searchParams.get("year"));
  const scope = await schoolScope(session, "s");
  const total = (await query<{ n: number }>("SELECT COUNT(*) n FROM indicators"))[0]?.n ?? 0;
  const max = (await query<{ m: number }>("SELECT MAX(score) m FROM rating_scale WHERE is_active = 1"))[0]?.m || 3;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await query<any>(
    `SELECT s.id, s.name, s.code, s.principal_name, d.name AS directorate_name, a.id AS assessment_id, a.status, a.submitted_at, a.updated_at,
       COUNT(i.id) FILTER (WHERE i.score IS NOT NULL) AS rated,
       SUM(CASE WHEN i.score IS NOT NULL THEN i.score ELSE 0 END) AS score_sum,
       COUNT(i.id) FILTER (WHERE i.is_weak = 1) AS weak,
       COUNT(i.id) FILTER (WHERE i.improvement_status = 'NEEDS_PLAN') AS needs_plan,
       COUNT(i.id) FILTER (WHERE i.improvement_status = 'PLANNED') AS planned,
       COUNT(i.id) FILTER (WHERE i.improvement_status = 'IN_PROGRESS') AS in_progress,
       COUNT(i.id) FILTER (WHERE i.improvement_status = 'IMPROVED') AS improved,
       COUNT(i.id) FILTER (WHERE i.improvement_status = 'VERIFIED') AS verified,
       COUNT(i.id) FILTER (WHERE i.improvement_status IN ('PLANNED','IN_PROGRESS') AND i.plan_due_date < ?) AS overdue
     FROM schools s
     JOIN directorates d ON d.id = s.directorate_id
     LEFT JOIN self_assessments a ON a.school_id = s.id AND a.academic_year = ?
     LEFT JOIN self_assessment_items i ON i.assessment_id = a.id
     WHERE s.status = 'ACTIVE' AND ${scope.sql}
     GROUP BY s.id ORDER BY s.name`,
    [today, year, ...scope.params]
  );
  const schools = rows.map((r) => ({
    id: r.id, name: r.name, code: r.code, principalName: r.principal_name, directorate: r.directorate_name,
    status: r.assessment_id ? r.status : "NOT_STARTED", submittedAt: r.submitted_at, updatedAt: r.updated_at,
    rated: Number(r.rated), total, percent: Number(r.rated) ? Math.round((Number(r.score_sum) / (Number(r.rated) * max)) * 100) : null,
    weak: Number(r.weak), needsPlan: Number(r.needs_plan), planned: Number(r.planned), inProgress: Number(r.in_progress),
    improved: Number(r.improved), verified: Number(r.verified), overdue: Number(r.overdue),
  }));
  const sum = (k: keyof (typeof schools)[number]) => schools.reduce((a, s) => a + (Number(s[k]) || 0), 0);
  return NextResponse.json({
    year,
    totals: {
      schools: schools.length,
      started: schools.filter((s) => s.status !== "NOT_STARTED").length,
      submitted: schools.filter((s) => s.status === "SUBMITTED").length,
      weak: sum("weak"), needsPlan: sum("needsPlan"), inProgress: sum("inProgress") + sum("planned"), improved: sum("improved"), verified: sum("verified"), overdue: sum("overdue"),
    },
    schools,
  });
}
