import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";
import { computeVisitResults, loadTree } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/schools/[id]/overview
 * صفحة تفاصيل المدرسة: بيانات أساسية، ملف المرافق، نتائج المعايير، المؤشرات الأضعف،
 * تاريخ الزيارات، الأدلة، خطط التحسين، والتقارير — كلها من سجلات فعلية.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { id } = await params;
  if (!await canAccessSchool(session, id)) return NextResponse.json({ message: "لا يمكنك الوصول إلى هذه المدرسة" }, { status: 403 });

  const school = await queryOne<any>(
    `SELECT s.*, g.name AS governorate_name, d.name AS directorate_name, a.name AS area_name
     FROM schools s JOIN governorates g ON g.id = s.governorate_id JOIN directorates d ON d.id = s.directorate_id
     LEFT JOIN areas a ON a.id = s.area_id WHERE s.id = ?`, [id]
  );
  if (!school) return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 404 });

  const isParent = session.roleKey === "PARENT";
  const profile = await queryOne<any>("SELECT * FROM school_profiles WHERE school_id = ?", [id]);
  const tree = await loadTree();

  // أولياء الأمور يرون المعلومات العامة فقط
  if (isParent) {
    return NextResponse.json({
      school: { id: school.id, name: school.name, code: school.code, stage: school.stage, type: school.type,
        directorate_name: school.directorate_name, governorate_name: school.governorate_name, contact_phone: school.contact_phone },
      restricted: true,
    });
  }

  const visits = await query<any>(
    `SELECT v.id, v.type, v.status, v.completion, v.scheduled_at, v.started_at, v.ended_at, v.submitted_at,
            COALESCE(v.ended_at, v.submitted_at, v.started_at, v.scheduled_at, v.created_at) AS at, u.name AS inspector_name
     FROM visits v JOIN users u ON u.id = v.inspector_id WHERE v.school_id = ? AND v.status <> 'CANCELLED'
     ORDER BY at DESC LIMIT 30`, [id]
  );
  const basis = visits.filter((v) => ["SUBMITTED", "COMPLETED"].includes(v.status));
  const results = await computeVisitResults(basis.map((v) => v.id), tree);
  const withScores = visits.map((v) => {
    const r = results.get(v.id);
    return { ...v, totalScore: r?.totalScore ?? null, partPercent: r?.evaluatedPartPercent ?? null, isComplete: r?.isComplete ?? false };
  });
  const latestId = basis[0]?.id;
  const latest = latestId ? results.get(latestId) ?? null : null;
  const previous = basis[1] ? results.get(basis[1].id) ?? null : null;

  const criteria = tree.criteria.map((c) => {
    const cur = latest?.criteria.find((x) => x.criterionId === c.id);
    const prev = previous?.criteria.find((x) => x.criterionId === c.id);
    return {
      id: c.id, code: c.code, title: c.title, weight: c.weight,
      achievement: cur?.achievementPercent ?? null, contribution: cur?.contribution ?? null,
      completion: cur?.completionPercent ?? 0, previous: prev?.achievementPercent ?? null,
      subCriteria: (cur?.subCriteria ?? []).map((sc) => ({
        id: sc.subCriterionId, code: sc.code, title: sc.title, weight: sc.weight,
        achievement: sc.achievementPercent, contribution: sc.contribution, completion: sc.completionPercent,
      })),
    };
  });

  const weakIndicators = latestId
    ? await query<any>(
        `SELECT i.id, i.code, i.title, e.score, e.notes,
                (SELECT COUNT(*) FROM evidence x WHERE x.evaluation_id = e.id AND x.review_status = 'ACCEPTED') AS accepted_evidence
         FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
         WHERE e.visit_id = ? AND e.status = 'EVALUATED' AND e.score <= 1 ORDER BY e.score, i.order_index LIMIT 12`, [latestId])
    : [];

  const evidence = await queryOne<any>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN review_status='ACCEPTED' THEN 1 ELSE 0 END),0) AS accepted,
            COALESCE(SUM(CASE WHEN review_status='PENDING' THEN 1 ELSE 0 END),0) AS pending,
            COALESCE(SUM(CASE WHEN review_status='REJECTED' THEN 1 ELSE 0 END),0) AS rejected
     FROM evidence WHERE school_id = ?`, [id]);
  const plans = await query<any>(
    `SELECT p.id, p.title, p.status,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id) AS actions,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id AND a.status IN ('COMPLETED','CLOSED_VERIFIED')) AS done,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id AND a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(a.due_date) < date('now')) AS overdue
     FROM improvement_plans p WHERE p.school_id = ? ORDER BY p.created_at DESC LIMIT 10`, [id]);
  const reports = await query<any>(
    `SELECT id, number, title, type, status, created_at FROM reports WHERE school_id = ? ORDER BY created_at DESC LIMIT 10`, [id]);
  const staff = await query<any>(
    `SELECT u.name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.school_id = ? AND u.is_active = 1 ORDER BY r.key`, [id]);
  const assigned = await query<any>(
    `SELECT u.id, u.name FROM school_assignments a JOIN users u ON u.id = a.user_id WHERE a.school_id = ?`, [id]);

  return NextResponse.json({
    school, profile, staff, assigned, visits: withScores, criteria,
    result: latest ? {
      visitId: latestId, totalScore: latest.totalScore, partPercent: latest.evaluatedPartPercent,
      completion: latest.completionPercent, isComplete: latest.isComplete,
      evaluated: latest.evaluatedIndicators, total: latest.totalIndicators, warnings: latest.warnings,
    } : null,
    weakIndicators, evidence, plans, reports,
    trend: [...withScores].filter((v) => v.partPercent !== null).reverse().map((v) => ({ at: v.at, percent: v.partPercent })),
  });
}
