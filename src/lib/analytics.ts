/**
 * طبقة التحليلات: تحسب نتائج الزيارات بمحرك الدرجات الرسمي (scoring.ts)
 * ولا تعيد حساب أي شيء بصيغة مختلفة، فتبقى كل الأرقام قابلة للتتبع إلى المؤشرات.
 */
import { query, queryOne } from "./db/sqlite";
import {
  computeEvaluation,
  normalizeCriteria,
  type EvaluationResult,
  type RawCriterionInput,
  type IndicatorInput,
} from "./scoring";

type CriterionRow = { id: string; code: string; title: string; weight: number };
type SubRow = { id: string; code: string; title: string; weight: number; criterion_id: string };
type IndRow = { id: string; code: string; title: string; sub_criterion_id: string | null; criterion_id: string | null };

export type Tree = {
  criteria: CriterionRow[];
  subs: SubRow[];
  indicators: IndRow[];
  maxScore: number;
};

let treeCache: { at: number; tree: Tree } | null = null;

/** بنية المعايير (تُخزَّن مؤقتاً لثوانٍ لأنها نادرة التغيّر). */
export function loadTree(force = false): Tree {
  if (!force && treeCache && Date.now() - treeCache.at < 15_000) return treeCache.tree;
  const criteria = query<CriterionRow>("SELECT id, code, title, weight FROM criteria ORDER BY order_index");
  const subs = query<SubRow>("SELECT id, code, title, weight, criterion_id FROM sub_criteria ORDER BY order_index");
  const indicators = query<IndRow>("SELECT id, code, title, sub_criterion_id, criterion_id FROM indicators ORDER BY order_index");
  const m = queryOne<{ m: number }>("SELECT MAX(score) AS m FROM rating_scale WHERE is_active = 1");
  const tree = { criteria, subs, indicators, maxScore: m?.m && m.m > 0 ? m.m : 3 };
  treeCache = { at: Date.now(), tree };
  return tree;
}

export function resetTreeCache(): void {
  treeCache = null;
}

export type SavedEval = { indicator_id: string; status: string; score: number };

/** يحسب نتيجة زيارة من تقييماتها المحفوظة. */
export function computeFromSaved(saved: SavedEval[], tree: Tree = loadTree()): EvaluationResult {
  const map = new Map(saved.map((s) => [s.indicator_id, s]));
  const mk = (i: IndRow, fallbackSub: string): IndicatorInput => {
    const s = map.get(i.id);
    const ok = s?.status === "EVALUATED";
    return {
      indicatorId: i.id,
      code: i.code,
      title: i.title,
      subCriterionId: i.sub_criterion_id ?? fallbackSub,
      status: ok ? "EVALUATED" : "NOT_EVALUATED",
      score: ok ? s!.score : null,
    };
  };
  const raws: RawCriterionInput[] = tree.criteria.map((c) => {
    const subs = tree.subs.filter((x) => x.criterion_id === c.id);
    if (subs.length) {
      return {
        criterionId: c.id, code: c.code, title: c.title, weight: c.weight,
        subCriteria: subs.map((x) => ({
          subCriterionId: x.id, code: x.code, title: x.title, weight: x.weight,
          indicators: tree.indicators.filter((i) => i.sub_criterion_id === x.id).map((i) => mk(i, x.id)),
        })),
        flatIndicators: null,
      };
    }
    return {
      criterionId: c.id, code: c.code, title: c.title, weight: c.weight, subCriteria: null,
      flatIndicators: tree.indicators.filter((i) => i.criterion_id === c.id && !i.sub_criterion_id).map((i) => mk(i, `${c.id}-flat`)),
    };
  });
  return computeEvaluation(normalizeCriteria(raws), tree.maxScore);
}

/** نتيجة زيارة واحدة. */
export function computeVisitResult(visitId: string, tree: Tree = loadTree()): EvaluationResult {
  const saved = query<SavedEval>("SELECT indicator_id, status, score FROM evaluations WHERE visit_id = ?", [visitId]);
  return computeFromSaved(saved, tree);
}

/** نتائج عدة زيارات بدفعة واحدة. */
export function computeVisitResults(visitIds: string[], tree: Tree = loadTree()): Map<string, EvaluationResult> {
  const out = new Map<string, EvaluationResult>();
  if (!visitIds.length) return out;
  const marks = visitIds.map(() => "?").join(",");
  const rows = query<SavedEval & { visit_id: string }>(
    `SELECT visit_id, indicator_id, status, score FROM evaluations WHERE visit_id IN (${marks})`,
    visitIds
  );
  const by = new Map<string, SavedEval[]>();
  for (const r of rows) {
    const a = by.get(r.visit_id) ?? [];
    a.push(r);
    by.set(r.visit_id, a);
  }
  for (const id of visitIds) out.set(id, computeFromSaved(by.get(id) ?? [], tree));
  return out;
}

/** تصنيف الموضوعات المتكررة حسب المعيار الفرعي. */
export const TOPIC_OF_SUB: Record<string, { key: string; label: string }> = {
  "5-2": { key: "safety", label: "الأمن والسلامة" },
  "5-1": { key: "facilities", label: "المرافق والبنية التحتية" },
  "3": { key: "learners", label: "المتعلمون" },
  "4-1": { key: "teaching", label: "التعليم والتعلم" },
  "4-2": { key: "teaching", label: "التعليم والتعلم" },
  "4-3": { key: "teaching", label: "التعليم والتعلم" },
  "4-4": { key: "teaching", label: "التعليم والتعلم" },
  "2-1": { key: "training", label: "تدريب المعلمين" },
  "2-2": { key: "training", label: "تدريب الكوادر" },
  "6": { key: "community", label: "الشراكة المجتمعية" },
};
