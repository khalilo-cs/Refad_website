import { NextResponse } from "next/server";
import { getServerSession, authorize } from "@/lib/auth";
import { query, queryOne } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";
import { computeVisitResults, loadTree, TOPIC_OF_SUB } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URGENT_THRESHOLD = 50; // نسبة التحقق (على الجزء المقيَّم) دون هذا الحد
const STALE_DAYS = 90; // لا زيارة معتمدة منذ هذه المدة

/**
 * GET /api/dashboard/stats
 * مرشحات: directorateId, schoolId, type, from, to, criterionId, inspectorId, reportStatus
 * كل رقم هنا مشتق من سجلات فعلية في قاعدة البيانات، ويحمل رابطاً للسجلات المكوِّنة له.
 * الدرجات تُحسب بمحرك scoring.ts نفسه المستخدم في التقييم والتقارير.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { allowed } = authorize(session, {
    roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"],
  });
  if (!allowed) return NextResponse.json({ message: "غير مصرح لك بعرض اللوحة" }, { status: 403 });

  try {
    const sp = new URL(request.url).searchParams;
    const f = {
      directorateId: sp.get("directorateId") || "",
      schoolId: sp.get("schoolId") || "",
      type: sp.get("type") || "",
      from: sp.get("from") || "",
      to: sp.get("to") || "",
      criterionId: sp.get("criterionId") || "",
      inspectorId: sp.get("inspectorId") || "",
      reportStatus: sp.get("reportStatus") || "",
    };

    // مدارس النطاق + المرشحات
    const sc = await schoolScope(session, "s");
    const sWhere: string[] = [sc.sql];
    const sParams: unknown[] = [...sc.params];
    if (f.directorateId) { sWhere.push("s.directorate_id = ?"); sParams.push(f.directorateId); }
    if (f.schoolId) { sWhere.push("s.id = ?"); sParams.push(f.schoolId); }
    const schoolWhere = sWhere.join(" AND ");

    // مرشحات الزيارات
    const vWhere: string[] = [];
    const vParams: unknown[] = [];
    if (session.roleKey === "INSPECTOR") { vWhere.push("v.inspector_id = ?"); vParams.push(session.userId); }
    if (f.type) { vWhere.push("v.type = ?"); vParams.push(f.type); }
    if (f.inspectorId) { vWhere.push("v.inspector_id = ?"); vParams.push(f.inspectorId); }
    if (f.from) { vWhere.push("date(COALESCE(v.started_at, v.scheduled_at, v.created_at)) >= date(?)"); vParams.push(f.from); }
    if (f.to) { vWhere.push("date(COALESCE(v.started_at, v.scheduled_at, v.created_at)) <= date(?)"); vParams.push(f.to); }
    const visitWhere = [schoolWhere, ...vWhere].join(" AND ");
    const visitParams = [...sParams, ...vParams];

    const num = async (sql: string, p: unknown[] = []) => (await queryOne<{ n: number }>(sql, p))?.n ?? 0;

    // 1) المدارس
    const schoolsTotal = await num(`SELECT COUNT(*) n FROM schools s WHERE ${schoolWhere}`, sParams);
    const schoolsActive = await num(`SELECT COUNT(*) n FROM schools s WHERE s.status = 'ACTIVE' AND ${schoolWhere}`, sParams);

    // 2-3) الزيارات
    const byStatusRows = await query<{ status: string; n: number }>(
      `SELECT v.status, COUNT(*) n FROM visits v JOIN schools s ON s.id = v.school_id WHERE ${visitWhere} GROUP BY v.status`,
      visitParams
    );
    const byStatus: Record<string, number> = Object.fromEntries(byStatusRows.map((r) => [r.status, r.n]));
    const visitsToday = await num(
      `SELECT COUNT(*) n FROM visits v JOIN schools s ON s.id = v.school_id
       WHERE ${visitWhere} AND v.status <> 'CANCELLED'
         AND (date(v.started_at) = date('now') OR date(v.scheduled_at) = date('now'))`,
      visitParams
    );
    const overdueVisits = await num(
      `SELECT COUNT(*) n FROM visits v JOIN schools s ON s.id = v.school_id
       WHERE ${visitWhere} AND v.status = 'SCHEDULED' AND v.scheduled_at IS NOT NULL AND datetime(v.scheduled_at) < datetime('now','-1 day')`,
      visitParams
    );
    const visitedToday = await num(
      `SELECT COUNT(DISTINCT v.school_id) n FROM visits v JOIN schools s ON s.id = v.school_id
       WHERE ${visitWhere} AND v.status <> 'CANCELLED' AND (date(v.started_at) = date('now') OR date(v.ended_at) = date('now'))`,
      visitParams
    );

    // الزيارات المعتمدة/المقدَّمة هي أساس الدرجات
    const rStatusClause = f.reportStatus === "APPROVED" ? "v.status = 'COMPLETED'" : f.reportStatus === "PENDING" ? "v.status = 'SUBMITTED'" : "v.status IN ('SUBMITTED','COMPLETED')";
    const basisVisits = await query<{ id: string; school_id: string; school_name: string; school_code: string; lat: number | null; lng: number | null; directorate: string; at: string; status: string }>(
      `SELECT v.id, v.school_id, s.name AS school_name, s.code AS school_code, s.latitude AS lat, s.longitude AS lng,
              d.name AS directorate, COALESCE(v.ended_at, v.submitted_at, v.updated_at) AS at, v.status
       FROM visits v JOIN schools s ON s.id = v.school_id JOIN directorates d ON d.id = s.directorate_id
       WHERE ${visitWhere} AND ${rStatusClause}
       ORDER BY at DESC`,
      visitParams
    );
    const tree = await loadTree();
    const results = await computeVisitResults(basisVisits.map((v) => v.id), tree);

    // آخر زيارة لكل مدرسة
    const latestBySchool = new Map<string, (typeof basisVisits)[number]>();
    for (const v of basisVisits) if (!latestBySchool.has(v.school_id)) latestBySchool.set(v.school_id, v);
    const latest = [...latestBySchool.values()];

    // 4) متوسط التحقق لكل معيار من المعايير السبعة (آخر زيارة لكل مدرسة)
    const criteriaAverages = tree.criteria.map((c) => {
      const vals: number[] = [];
      for (const v of latest) {
        const r = results.get(v.id)?.criteria.find((x) => x.criterionId === c.id);
        if (r && r.achievementPercent !== null) vals.push(r.achievementPercent);
      }
      return {
        id: c.id, code: c.code, title: c.title, weight: c.weight,
        average: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
        schools: vals.length,
        href: `/reports?criterionId=${c.id}`,
      };
    });
    const overallVals = latest
      .map((v) => results.get(v.id)?.evaluatedPartPercent)
      .filter((x): x is number => typeof x === "number");
    const overallAverage = overallVals.length ? Math.round((overallVals.reduce((a, b) => a + b, 0) / overallVals.length) * 10) / 10 : null;
    const completeCount = latest.filter((v) => results.get(v.id)?.isComplete).length;

    // 5) اكتمال الأدلة: مؤشرات مقيَّمة لها دليل مقبول
    const ev = await queryOne<{ evaluated: number; withAccepted: number; withAny: number; pending: number }>(
      `SELECT COUNT(*) AS evaluated,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM evidence x WHERE x.evaluation_id = e.id AND x.review_status = 'ACCEPTED') THEN 1 ELSE 0 END) AS withAccepted,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM evidence x WHERE x.evaluation_id = e.id) THEN 1 ELSE 0 END) AS withAny,
              (SELECT COUNT(*) FROM evidence x JOIN schools s2 ON s2.id = x.school_id WHERE x.review_status = 'PENDING' AND ${schoolWhere.replace(/\bs\./g, "s2.")}) AS pending
       FROM evaluations e JOIN visits v ON v.id = e.visit_id JOIN schools s ON s.id = v.school_id
       WHERE e.status = 'EVALUATED' AND ${visitWhere}`,
      [...sParams, ...visitParams]
    );
    const evidenceCompletion = ev && ev.evaluated ? Math.round(((ev.withAccepted ?? 0) / ev.evaluated) * 100) : null;

    // 6) خطط التحسين والإجراءات
    const plansOpen = await num(`SELECT COUNT(*) n FROM improvement_plans p JOIN schools s ON s.id = p.school_id WHERE p.status = 'ACTIVE' AND ${schoolWhere}`, sParams);
    const actionsByStatus = await query<{ status: string; n: number }>(
      `SELECT a.status, COUNT(*) n FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
       WHERE ${schoolWhere} GROUP BY a.status`, sParams
    );
    const actionsOverdue = await num(
      `SELECT COUNT(*) n FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
       WHERE a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(a.due_date) < date('now') AND ${schoolWhere}`, sParams
    );
    const actionsDueSoon = await num(
      `SELECT COUNT(*) n FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
       WHERE a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(a.due_date) BETWEEN date('now') AND date('now','+7 day') AND ${schoolWhere}`, sParams
    );

    // 7) مدارس تحتاج متابعة عاجلة — بمعايير صريحة قابلة للتدقيق
    const overdueBySchool = new Map(
      (await query<{ school_id: string; n: number }>(
        `SELECT p.school_id, COUNT(*) n FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
         WHERE a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(a.due_date) < date('now') AND ${schoolWhere} GROUP BY p.school_id`, sParams
      )).map((r) => [r.school_id, r.n])
    );
    const allSchools = await query<{ id: string; name: string; code: string }>(`SELECT s.id, s.name, s.code FROM schools s WHERE s.status = 'ACTIVE' AND ${schoolWhere}`, sParams);
    const urgent: { id: string; name: string; code: string; score: number | null; reasons: string[]; href: string }[] = [];
    for (const s of allSchools) {
      const v = latestBySchool.get(s.id);
      const reasons: string[] = [];
      let score: number | null = null;
      if (!v) reasons.push("لا توجد زيارة معتمدة أو مقدَّمة");
      else {
        score = results.get(v.id)?.evaluatedPartPercent ?? null;
        if (score !== null && score < URGENT_THRESHOLD) reasons.push(`نسبة التحقق ${score}% أقل من ${URGENT_THRESHOLD}%`);
        const ageDays = (Date.now() - new Date(v.at).getTime()) / 86400000;
        if (ageDays > STALE_DAYS) reasons.push(`آخر زيارة قبل ${Math.floor(ageDays)} يوماً`);
      }
      const od = overdueBySchool.get(s.id) ?? 0;
      if (od > 0) reasons.push(`${od} إجراء تصحيحي متأخر`);
      if (reasons.length) urgent.push({ id: s.id, name: s.name, code: s.code, score, reasons, href: `/schools/${s.id}` });
    }
    urgent.sort((a, b) => b.reasons.length - a.reasons.length || (a.score ?? -1) - (b.score ?? -1));

    // 8) الاتجاه الشهري + التحسن مقارنة بالفترة السابقة
    const monthly = new Map<string, number[]>();
    for (const v of basisVisits) {
      const m = (v.at ?? "").slice(0, 7);
      const p = results.get(v.id)?.evaluatedPartPercent;
      if (m && typeof p === "number") monthly.set(m, [...(monthly.get(m) ?? []), p]);
    }
    const trend = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([month, a]) => ({ month, average: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10, visits: a.length }));
    const nowMs = Date.now();
    const inWindow = (at: string, fromD: number, toD: number) => { const d = (nowMs - new Date(at).getTime()) / 86400000; return d >= fromD && d < toD; };
    const avgOf = (vs: typeof basisVisits) => { const a = vs.map((v) => results.get(v.id)?.evaluatedPartPercent).filter((x): x is number => typeof x === "number"); return a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null; };
    const current = avgOf(basisVisits.filter((v) => inWindow(v.at, 0, 90)));
    const previous = avgOf(basisVisits.filter((v) => inWindow(v.at, 90, 180)));
    const improvementDelta = current !== null && previous !== null ? Math.round((current - previous) * 10) / 10 : null;

    // 9) الخريطة والتوزيع الجغرافي
    const mapRows = await query<{ id: string; code: string; name: string; latitude: number; longitude: number; directorate: string }>(
      `SELECT s.id, s.code, s.name, s.latitude, s.longitude, d.name AS directorate FROM schools s JOIN directorates d ON d.id = s.directorate_id
       WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND s.status = 'ACTIVE' AND ${schoolWhere}`, sParams
    );
    const map = mapRows.map((m) => {
      const v = latestBySchool.get(m.id);
      return { ...m, score: v ? results.get(v.id)?.evaluatedPartPercent ?? null : null, href: `/schools/${m.id}` };
    });
    const byDirectorate = (await query<{ id: string; name: string; count: number }>(
      `SELECT d.id, d.name, COUNT(s.id) AS count FROM schools s JOIN directorates d ON d.id = s.directorate_id
       WHERE s.status = 'ACTIVE' AND ${schoolWhere} GROUP BY d.id ORDER BY count DESC LIMIT 12`, sParams
    )).map((r) => ({ ...r, href: `/schools?directorateId=${r.id}` }));

    // 10) نشاط المفتشين: المخطط مقابل المنفَّذ
    const inspectors = (await query<{ id: string; name: string; planned: number; done: number; overdue: number }>(
      `SELECT u.id, u.name,
              COUNT(v.id) AS planned,
              SUM(CASE WHEN v.status IN ('SUBMITTED','COMPLETED') THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN v.status = 'SCHEDULED' AND v.scheduled_at IS NOT NULL AND datetime(v.scheduled_at) < datetime('now','-1 day') THEN 1 ELSE 0 END) AS overdue
       FROM visits v JOIN users u ON u.id = v.inspector_id JOIN schools s ON s.id = v.school_id
       WHERE ${visitWhere} AND v.status <> 'CANCELLED'
       GROUP BY u.id ORDER BY planned DESC LIMIT 10`, visitParams
    )).map((r) => ({ ...r, done: r.done ?? 0, overdue: r.overdue ?? 0, rate: r.planned ? Math.round(((r.done ?? 0) / r.planned) * 100) : 0, href: `/visits?inspectorId=${r.id}` }));

    // 11) المشكلات المتكررة: مؤشرات ضعيفة/غير متحققة عبر عدة مدارس + تجميع بالموضوع
    const weak = (await query<{ indicator_id: string; code: string; title: string; sub_code: string | null; crit_code: string; schools: number }>(
      `SELECT i.id AS indicator_id, i.code, i.title, sc.code AS sub_code, c.code AS crit_code, COUNT(DISTINCT v.school_id) AS schools
       FROM evaluations e JOIN visits v ON v.id = e.visit_id JOIN schools s ON s.id = v.school_id
       JOIN indicators i ON i.id = e.indicator_id
       LEFT JOIN sub_criteria sc ON sc.id = i.sub_criterion_id
       JOIN criteria c ON c.id = COALESCE(i.criterion_id, sc.criterion_id)
       WHERE e.status = 'EVALUATED' AND e.score <= 1 AND ${visitWhere}
       GROUP BY i.id ORDER BY schools DESC, i.order_index LIMIT 8`, visitParams
    )).map((r) => ({ ...r, href: `/reports?indicatorId=${r.indicator_id}` }));
    const topicCounts = new Map<string, { label: string; n: number }>();
    for (const w of weak) {
      const t = TOPIC_OF_SUB[w.sub_code ?? ""] ?? TOPIC_OF_SUB[w.crit_code];
      if (t) topicCounts.set(t.key, { label: t.label, n: (topicCounts.get(t.key)?.n ?? 0) + w.schools });
    }

    // 12) التدريب والتواصل والشراكة المجتمعية (متوسط تحقق مؤشرات محددة من الاستمارة)
    const groupAvg = async (codes: string[]) => {
      const marks = codes.map(() => "?").join(",");
      const r = await queryOne<{ a: number | null; n: number }>(
        `SELECT AVG(e.score * 100.0 / ?) AS a, COUNT(*) n FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
         JOIN visits v ON v.id = e.visit_id JOIN schools s ON s.id = v.school_id
         WHERE e.status = 'EVALUATED' AND i.code IN (${marks}) AND ${visitWhere}`,
        [tree.maxScore, ...codes, ...visitParams]
      );
      return { average: r?.a != null ? Math.round(r.a * 10) / 10 : null, evaluated: r?.n ?? 0 };
    };
    const programs = {
      training: { label: "التدريب والتنمية المهنية", ...await groupAvg(["3-1-2", "4-1-2", "8-1-2", "3-2-2", "4-2-2", "8-2-2"]) },
      communication: { label: "التواصل مع المجتمع وأولياء الأمور", ...await groupAvg(["9-2-1", "14-2-1", "15-2-1", "18-2-1", "4-6"]) },
      community: { label: "الشراكة المجتمعية", ...await groupAvg(["1-6", "2-6", "3-6", "4-6", "5-6", "6-6"]) },
    };

    // التقارير
    const reportsByStatus = await query<{ status: string; n: number }>(
      `SELECT r.status, COUNT(*) n FROM reports r LEFT JOIN schools s ON s.id = r.school_id
       WHERE (r.school_id IS NULL OR ${schoolWhere}) GROUP BY r.status`, sParams
    );

    return NextResponse.json({
      filters: f,
      schools: { total: schoolsTotal, active: schoolsActive, visitedToday },
      visits: {
        today: visitsToday,
        scheduled: byStatus.SCHEDULED ?? 0,
        inProgress: byStatus.IN_PROGRESS ?? 0,
        executed: (byStatus.SUBMITTED ?? 0) + (byStatus.COMPLETED ?? 0),
        overdue: overdueVisits,
        byStatus,
      },
      scoring: {
        overallAverage,
        basisSchools: latest.length,
        completeEvaluations: completeCount,
        method: "نسبة التحقق على الجزء المقيَّم، من آخر زيارة مقدَّمة أو معتمدة لكل مدرسة",
      },
      criteriaAverages,
      evidence: { completion: evidenceCompletion, evaluated: ev?.evaluated ?? 0, withAccepted: ev?.withAccepted ?? 0, pending: ev?.pending ?? 0 },
      improvement: {
        plansOpen, actionsOverdue, actionsDueSoon,
        byStatus: Object.fromEntries(actionsByStatus.map((r) => [r.status, r.n])),
      },
      urgentSchools: urgent.slice(0, 8),
      urgentCriteria: [`نسبة التحقق دون ${URGENT_THRESHOLD}%`, `لا زيارة معتمدة منذ ${STALE_DAYS} يوماً أو أكثر`, "وجود إجراءات تصحيحية متأخرة", "عدم وجود أي زيارة معتمدة"],
      trend,
      improvementLevel: { current, previous, delta: improvementDelta, windowDays: 90 },
      map,
      byDirectorate,
      inspectors,
      recurringProblems: weak,
      recurringTopics: [...topicCounts.values()].sort((a, b) => b.n - a.n),
      programs,
      reports: Object.fromEntries(reportsByStatus.map((r) => [r.status, r.n])),
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "فشل تحميل الإحصائيات", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined },
      { status: 500 }
    );
  }
}
