/**
 * ترتيب المدارس وفئات التكريم — من السجلات الفعلية فقط.
 *
 * القواعد:
 *  - أساس الترتيب آخر زيارة مقدَّمة أو معتمدة لكل مدرسة، بمحرك الدرجات الرسمي.
 *  - لا تدخل الترتيب إلا مدرسة اكتمل تقييمها بنسبة RANKING_MIN_COMPLETION فأكثر،
 *    لأن نسبة التحقق على جزء صغير من المؤشرات لا تصلح للمقارنة.
 *  - مقدار التحسّن = الفرق بين آخر زيارتين مؤهلتين للمدرسة نفسها.
 *  - المدارس التي لم تُقيَّم تُعرض كما هي، ولا تُمنح أي درجة افتراضية.
 */
import { query } from "./db/sqlite";
import { computeVisitResults, loadTree } from "./analytics";
import { schoolScope, type ScopeUser } from "./scope";

export const RANKING_MIN_COMPLETION = 70;

export type Tier = { key: "EXCELLENT" | "ADVANCED" | "ACCEPTABLE" | "SUPPORT"; label: string; min: number };

export const TIERS: Tier[] = [
  { key: "EXCELLENT", label: "متميّز", min: 90 },
  { key: "ADVANCED", label: "متقدّم", min: 75 },
  { key: "ACCEPTABLE", label: "مقبول", min: 60 },
  { key: "SUPPORT", label: "بحاجة إلى دعم", min: 0 },
];

export function tierFor(percent: number): Tier {
  return TIERS.find((t) => percent >= t.min) ?? TIERS[TIERS.length - 1];
}

export type RankedSchool = {
  schoolId: string;
  code: string;
  name: string;
  directorate: string;
  rank: number | null;
  percent: number | null;
  totalScore: number | null;
  completion: number;
  tier: Tier | null;
  delta: number | null;
  previousPercent: number | null;
  visitId: string;
  visitStatus: string;
  evaluatedAt: string;
  actions: { total: number; closed: number; overdue: number };
  strongest: { code: string; title: string; percent: number } | null;
  weakest: { code: string; title: string; percent: number } | null;
};

export type RankingResult = {
  ranked: RankedSchool[];
  partial: RankedSchool[];
  notEvaluated: { schoolId: string; code: string; name: string; directorate: string }[];
  mostImproved: RankedSchool[];
  tierCounts: Record<Tier["key"], number>;
  minCompletion: number;
};

export async function computeRankings(user: ScopeUser, opts: { directorateId?: string } = {}): Promise<RankingResult> {
  const scope = await schoolScope(user, "s");
  const where = [scope.sql, "s.status = 'ACTIVE'"];
  const params: unknown[] = [...scope.params];
  if (opts.directorateId) {
    where.push("s.directorate_id = ?");
    params.push(opts.directorateId);
  }

  const schools = await query<{ id: string; code: string; name: string; directorate: string }>(
    `SELECT s.id, s.code, s.name, d.name AS directorate FROM schools s JOIN directorates d ON d.id = s.directorate_id
     WHERE ${where.join(" AND ")} ORDER BY s.name`,
    params
  );
  if (!schools.length) {
    return { ranked: [], partial: [], notEvaluated: [], mostImproved: [], tierCounts: { EXCELLENT: 0, ADVANCED: 0, ACCEPTABLE: 0, SUPPORT: 0 }, minCompletion: RANKING_MIN_COMPLETION };
  }

  const ids = schools.map((s) => s.id);
  const marks = ids.map(() => "?").join(",");
  const visits = await query<{ id: string; school_id: string; status: string; at: string }>(
    `SELECT v.id, v.school_id, v.status, COALESCE(v.ended_at, v.submitted_at, v.updated_at) AS at
     FROM visits v WHERE v.school_id IN (${marks}) AND v.status IN ('SUBMITTED','COMPLETED')
     ORDER BY at DESC`,
    ids
  );
  const tree = await loadTree();
  const results = await computeVisitResults(visits.map((v) => v.id), tree);

  const bySchool = new Map<string, typeof visits>();
  for (const v of visits) {
    const list = bySchool.get(v.school_id) ?? [];
    list.push(v);
    bySchool.set(v.school_id, list);
  }

  const actionRows = await query<{ school_id: string; total: number; closed: number; overdue: number }>(
    `SELECT p.school_id,
            COUNT(a.id) AS total,
            SUM(CASE WHEN a.status = 'CLOSED_VERIFIED' THEN 1 ELSE 0 END) AS closed,
            SUM(CASE WHEN a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND a.due_date IS NOT NULL AND date(a.due_date) < date('now') THEN 1 ELSE 0 END) AS overdue
     FROM improvement_plans p JOIN corrective_actions a ON a.plan_id = p.id
     WHERE p.school_id IN (${marks}) GROUP BY p.school_id`,
    ids
  );
  const actionsOf = new Map(actionRows.map((r) => [r.school_id, { total: Number(r.total) || 0, closed: Number(r.closed) || 0, overdue: Number(r.overdue) || 0 }]));

  const critTitle = new Map(tree.criteria.map((c) => [c.id, { code: c.code, title: c.title }]));
  const rows: RankedSchool[] = [];
  const notEvaluated: RankingResult["notEvaluated"] = [];

  for (const s of schools) {
    const list = bySchool.get(s.id) ?? [];
    const latest = list[0];
    const r = latest ? results.get(latest.id) : undefined;
    if (!latest || !r || r.evaluatedIndicators === 0) {
      notEvaluated.push({ schoolId: s.id, code: s.code, name: s.name, directorate: s.directorate });
      continue;
    }
    const prev = list.slice(1).map((v) => results.get(v.id)).find((x) => x && x.completionPercent >= RANKING_MIN_COMPLETION && x.evaluatedPartPercent !== null);
    const percent = r.evaluatedPartPercent;
    const crit = r.criteria
      .filter((c) => c.achievementPercent !== null)
      .map((c) => ({ ...critTitle.get(c.criterionId)!, percent: c.achievementPercent as number }));
    crit.sort((a, b) => b.percent - a.percent);

    rows.push({
      schoolId: s.id,
      code: s.code,
      name: s.name,
      directorate: s.directorate,
      rank: null,
      percent,
      totalScore: r.totalScore,
      completion: r.completionPercent,
      tier: percent !== null && r.completionPercent >= RANKING_MIN_COMPLETION ? tierFor(percent) : null,
      delta: percent !== null && prev?.evaluatedPartPercent != null ? Math.round((percent - prev.evaluatedPartPercent) * 10) / 10 : null,
      previousPercent: prev?.evaluatedPartPercent ?? null,
      visitId: latest.id,
      visitStatus: latest.status,
      evaluatedAt: latest.at,
      actions: actionsOf.get(s.id) ?? { total: 0, closed: 0, overdue: 0 },
      strongest: crit[0] ?? null,
      weakest: crit.length > 1 ? crit[crit.length - 1] : null,
    });
  }

  const eligible = rows.filter((r) => r.tier !== null).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || b.completion - a.completion);
  // ترتيب تنافسي: المتساوون في النسبة يتقاسمون المرتبة نفسها
  eligible.forEach((r, i) => {
    r.rank = i > 0 && eligible[i - 1].percent === r.percent ? eligible[i - 1].rank : i + 1;
  });
  const partial = rows.filter((r) => r.tier === null).sort((a, b) => b.completion - a.completion);

  const tierCounts = { EXCELLENT: 0, ADVANCED: 0, ACCEPTABLE: 0, SUPPORT: 0 } as Record<Tier["key"], number>;
  for (const r of eligible) tierCounts[r.tier!.key]++;

  const mostImproved = eligible.filter((r) => (r.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 5);

  return { ranked: eligible, partial, notEvaluated, mostImproved, tierCounts, minCompletion: RANKING_MIN_COMPLETION };
}
