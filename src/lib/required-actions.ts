/**
 * المؤشرات التي تستوجب إجراءً تصحيحياً.
 *
 * وفق خطة المشروع: عند انخفاض مؤشر لدى مدرسة تُلزَم بإنشاء خطة تحسين.
 * المؤشر «مستوجِب» إذا قُيِّم بدرجة 0 أو 1 في آخر زيارة مقدَّمة أو معتمدة
 * للمدرسة، ولم يُربط به إجراء تصحيحي، ولا يوجد إجراء مفتوح على المؤشر نفسه
 * في خطط المدرسة.
 */
import { query } from "./db/sqlite";
import { schoolScope, type ScopeUser } from "./scope";

export type RequiredAction = {
  schoolId: string;
  schoolName: string;
  visitId: string;
  visitDate: string;
  evaluationId: string;
  indicatorId: string;
  code: string;
  title: string;
  score: number;
};

export async function requiredActions(user: ScopeUser, opts: { schoolId?: string; visitId?: string } = {}): Promise<RequiredAction[]> {
  const sc = await schoolScope(user, "s");
  const where = [sc.sql, "e.status = 'EVALUATED'", "e.score <= 1"];
  const params: unknown[] = [...sc.params];
  if (opts.schoolId) {
    where.push("s.id = ?");
    params.push(opts.schoolId);
  }
  if (opts.visitId) {
    where.push("v.id = ?");
    params.push(opts.visitId);
  } else {
    where.push(`v.id = (SELECT v2.id FROM visits v2 WHERE v2.school_id = v.school_id AND v2.status IN ('SUBMITTED','COMPLETED')
                        ORDER BY COALESCE(v2.ended_at, v2.submitted_at, v2.updated_at) DESC LIMIT 1)`);
  }
  return query<RequiredAction>(
    `SELECT s.id AS schoolId, s.name AS schoolName, v.id AS visitId,
            COALESCE(v.ended_at, v.submitted_at, v.updated_at) AS visitDate,
            e.id AS evaluationId, i.id AS indicatorId, i.code, i.title, e.score
     FROM evaluations e
     JOIN visits v ON v.id = e.visit_id
     JOIN schools s ON s.id = v.school_id
     JOIN indicators i ON i.id = e.indicator_id
     WHERE ${where.join(" AND ")}
       AND NOT EXISTS (SELECT 1 FROM corrective_actions a WHERE a.evaluation_id = e.id)
       AND NOT EXISTS (
         SELECT 1 FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id
         WHERE p.school_id = s.id AND a.indicator_id = e.indicator_id
           AND a.status NOT IN ('CLOSED_VERIFIED','CLOSED_REJECTED') AND p.status IN ('ACTIVE','ON_HOLD'))
     ORDER BY s.name, e.score, i.order_index`,
    params
  );
}
