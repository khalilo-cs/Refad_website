/**
 * التقييم الذاتي ودورة معالجة الضعف:
 *   المدير يقيّم كل مؤشر ← يحدّد الضعف ← يُلزَم بخطة تحسين ← ينفّذ ← يعلن التحسّن ← تعتمده الإدارة.
 * كل خطوة تُسجَّل في سجل لا يُعدَّل، ليظهر للإدارة تاريخ المؤشر كاملاً، وتُبنى عليه شهادات التكريم.
 */
import { exec, nowISO, query, queryOne, uuid } from "./db/sqlite";
import { canAccessSchool } from "./scope";
import { notify } from "./notify";

export type ImprovementStatus = "NONE" | "NEEDS_PLAN" | "PLANNED" | "IN_PROGRESS" | "IMPROVED" | "VERIFIED";

export const STATUS_LABEL: Record<ImprovementStatus, string> = {
  NONE: "لا يحتاج معالجة",
  NEEDS_PLAN: "ضعيف — بانتظار خطة",
  PLANNED: "خطة موضوعة",
  IN_PROGRESS: "قيد التنفيذ",
  IMPROVED: "تحسّن — بانتظار الاعتماد",
  VERIFIED: "تحسّن معتمد",
};

export const EVENT_LABEL: Record<string, string> = {
  RATED: "تقييم المؤشر",
  WEAK_FLAGGED: "تحديد المؤشر كنقطة ضعف",
  WEAK_CLEARED: "إلغاء تحديد الضعف",
  PLAN_SET: "وضع خطة التحسين",
  PLAN_UPDATED: "تعديل خطة التحسين",
  STARTED: "بدء التنفيذ",
  IMPROVED: "إعلان التحسّن",
  VERIFIED: "اعتماد التحسّن من الإدارة",
  RETURNED: "إعادة للمتابعة من الإدارة",
  SUBMITTED: "إرسال الاستمارة",
  REOPENED: "إعادة فتح الاستمارة",
};

/** الأدوار التي تعبّئ استمارة مدرستها، والأدوار التي تتابع وتعتمد. */
export const SCHOOL_ROLES = ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];
export const REVIEWER_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];

/** درجة الضعف: «غير متحقق» و«متحقق بدرجة ضعيفة» في المقياس الافتراضي (0–1 من 3). */
export const WEAK_MAX_SCORE = 1;
export const isWeakScore = (s: number | null | undefined) => s != null && s <= WEAK_MAX_SCORE;

/** العام الدراسي يبدأ في أغسطس/سبتمبر: 2025-2026. */
export function currentAcademicYear(d = new Date()): string {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
export const YEAR_RE = /^\d{4}-\d{4}$/;
export function normalizeYear(raw: string | null | undefined): string {
  const y = (raw ?? "").trim();
  if (YEAR_RE.test(y) && Number(y.slice(5)) === Number(y.slice(0, 4)) + 1) return y;
  return currentAcademicYear();
}

type Session = { userId: string; roleKey: string; schoolId: string | null; directorateId: string | null; name?: string };

/** المدير ومنسق الجودة يديران استمارة مدرستهم فقط. */
export function canFill(s: Session, schoolId: string): boolean {
  return SCHOOL_ROLES.includes(s.roleKey) && !!s.schoolId && s.schoolId === schoolId;
}
/** المتابعة والاعتماد: الإدارة ضمن نطاقها. */
export async function canReview(s: Session, schoolId: string): Promise<boolean> {
  return REVIEWER_ROLES.includes(s.roleKey) && (await canAccessSchool(s as any, schoolId));
}
export async function canView(s: Session, schoolId: string): Promise<boolean> {
  return canFill(s, schoolId) || (await canReview(s, schoolId));
}

export async function getAssessment(schoolId: string, year: string) {
  return queryOne<any>("SELECT * FROM self_assessments WHERE school_id = ? AND academic_year = ?", [schoolId, year]);
}

export async function getOrCreateAssessment(schoolId: string, year: string) {
  const existing = await getAssessment(schoolId, year);
  if (existing) return existing;
  const id = uuid();
  await exec(
    "INSERT INTO self_assessments (id, school_id, academic_year) VALUES (?, ?, ?) ON CONFLICT(school_id, academic_year) DO NOTHING",
    [id, schoolId, year]
  );
  return (await getAssessment(schoolId, year))!;
}

export async function logEvent(itemId: string, event: string, userId: string, from?: unknown, to?: unknown, note?: string | null) {
  await exec(
    "INSERT INTO self_assessment_history (id, item_id, event, from_value, to_value, note, user_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [uuid(), itemId, event, from == null ? null : String(from), to == null ? null : String(to), note ?? null, userId, nowISO()]
  );
}

/** عنصر مع ما يلزم للتحقق من الصلاحية. */
export async function loadItem(itemId: string) {
  return queryOne<any>(
    `SELECT i.*, a.school_id, a.academic_year, a.status AS assessment_status, ind.code AS indicator_code, ind.title AS indicator_title, s.name AS school_name
     FROM self_assessment_items i
     JOIN self_assessments a ON a.id = i.assessment_id
     JOIN indicators ind ON ind.id = i.indicator_id
     JOIN schools s ON s.id = a.school_id
     WHERE i.id = ?`,
    [itemId]
  );
}

/** من يُبلَّغ في الإدارة عن مدرسة: مدراء النظام، ومدير إدارة المديرية، ومفتشو المدرسة المسندون. */
export async function reviewersOf(schoolId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1 AND (
       r.key = 'SUPER_ADMIN'
       OR (r.key = 'EDUCATION_DIRECTOR' AND u.directorate_id = (SELECT directorate_id FROM schools WHERE id = ?))
       OR (r.key = 'INSPECTOR' AND u.id IN (SELECT user_id FROM school_assignments WHERE school_id = ?))
     )`,
    [schoolId, schoolId]
  );
  return rows.map((r) => r.id);
}

export async function notifyReviewers(schoolId: string, title: string, body: string, type: "INFO" | "WARNING" | "SUCCESS" = "INFO") {
  await notify(await reviewersOf(schoolId), title, body, { type, link: `/self-assessment?schoolId=${schoolId}` });
}

export type TreeIndicator = {
  indicatorId: string; code: string; title: string; itemId: string | null;
  score: number | null; baselineScore: number | null; isWeak: boolean; status: ImprovementStatus;
  plan: { action: string | null; responsible: string | null; dueDate: string | null; successMeasure: string | null; setAt: string | null };
  progressNote: string | null; improvedAt: string | null; reviewNote: string | null; verifiedAt: string | null; verifiedBy: string | null;
  notes: string | null; overdue: boolean; updatedAt: string | null;
};
export type TreeSub = { id: string; code: string; title: string; indicators: TreeIndicator[] };
export type TreeCriterion = { id: string; code: string; title: string; subs: TreeSub[]; achieved: boolean; percent: number | null };

export type Summary = {
  total: number; rated: number; weak: number; needsPlan: number; planned: number; inProgress: number; improved: number; verified: number; overdue: number;
  percent: number | null; achievedCriteria: number;
};

/** يبني الاستمارة كاملة (معيار ← معيار فرعي ← مؤشر) مع حالة كل مؤشر وملخص. */
export async function buildTree(assessmentId: string | null): Promise<{ criteria: TreeCriterion[]; summary: Summary; maxScore: number }> {
  const maxScore = (await queryOne<{ m: number }>("SELECT MAX(score) m FROM rating_scale WHERE is_active = 1"))?.m || 3;
  const crit = await query<any>("SELECT id, code, title FROM criteria ORDER BY order_index, code");
  const subs = await query<any>("SELECT id, code, title, criterion_id FROM sub_criteria ORDER BY order_index, code");
  const inds = await query<any>("SELECT id, code, title, criterion_id, sub_criterion_id FROM indicators ORDER BY order_index, code");
  const items = assessmentId
    ? await query<any>(
        `SELECT i.*, v.name AS verified_by_name FROM self_assessment_items i LEFT JOIN users v ON v.id = i.verified_by_id WHERE i.assessment_id = ?`,
        [assessmentId]
      )
    : [];
  const byInd = new Map(items.map((i) => [i.indicator_id, i]));
  const today = new Date().toISOString().slice(0, 10);

  const toInd = (r: any): TreeIndicator => {
    const it = byInd.get(r.id);
    const status = (it?.improvement_status ?? "NONE") as ImprovementStatus;
    return {
      indicatorId: r.id, code: r.code, title: r.title, itemId: it?.id ?? null,
      score: it?.score ?? null, baselineScore: it?.baseline_score ?? null, isWeak: !!it?.is_weak, status,
      plan: { action: it?.plan_action ?? null, responsible: it?.plan_responsible ?? null, dueDate: it?.plan_due_date ?? null, successMeasure: it?.plan_success_measure ?? null, setAt: it?.plan_set_at ?? null },
      progressNote: it?.progress_note ?? null, improvedAt: it?.improved_at ?? null, reviewNote: it?.review_note ?? null,
      verifiedAt: it?.verified_at ?? null, verifiedBy: it?.verified_by_name ?? null, notes: it?.notes ?? null,
      overdue: !!it?.plan_due_date && it.plan_due_date < today && (status === "PLANNED" || status === "IN_PROGRESS"),
      updatedAt: it?.updated_at ?? null,
    };
  };

  const summary: Summary = { total: 0, rated: 0, weak: 0, needsPlan: 0, planned: 0, inProgress: 0, improved: 0, verified: 0, overdue: 0, percent: null, achievedCriteria: 0 };
  let scoreSum = 0;

  const criteria: TreeCriterion[] = crit.map((c) => {
    const cSubs: TreeSub[] = subs.filter((s) => s.criterion_id === c.id).map((s) => ({
      id: s.id, code: s.code, title: s.title, indicators: inds.filter((i) => i.sub_criterion_id === s.id).map(toInd),
    }));
    const direct = inds.filter((i) => i.criterion_id === c.id && !i.sub_criterion_id).map(toInd);
    if (direct.length) cSubs.unshift({ id: `${c.id}-direct`, code: c.code, title: c.title, indicators: direct });
    const all = cSubs.flatMap((s) => s.indicators);
    const rated = all.filter((i) => i.score != null);
    for (const i of all) {
      summary.total++;
      if (i.score != null) { summary.rated++; scoreSum += i.score; }
      if (i.isWeak) summary.weak++;
      if (i.status === "NEEDS_PLAN") summary.needsPlan++;
      if (i.status === "PLANNED") summary.planned++;
      if (i.status === "IN_PROGRESS") summary.inProgress++;
      if (i.status === "IMPROVED") summary.improved++;
      if (i.status === "VERIFIED") summary.verified++;
      if (i.overdue) summary.overdue++;
    }
    // المعيار «محقَّق» إن قُيّمت كل مؤشراته، ولا ضعف قائماً فيه (الضعف المعالَج المعتمد لا يُحسب)،
    // ونسبة التحقق 80% فأكثر.
    const percent = rated.length ? Math.round((rated.reduce((a, i) => a + (i.score ?? 0), 0) / (rated.length * maxScore)) * 100) : null;
    const openWeak = all.some((i) => i.isWeak && i.status !== "VERIFIED");
    const achieved = all.length > 0 && rated.length === all.length && !openWeak && (percent ?? 0) >= 80;
    if (achieved) summary.achievedCriteria++;
    return { id: c.id, code: c.code, title: c.title, subs: cSubs, achieved, percent };
  });
  summary.percent = summary.rated ? Math.round((scoreSum / (summary.rated * maxScore)) * 100) : null;
  return { criteria, summary, maxScore };
}

/** أسباب منع الإرسال: مؤشرات غير مقيّمة، أو ضعف بلا خطة. */
export function submitBlockers(summary: Summary): string[] {
  const out: string[] = [];
  if (summary.rated < summary.total) out.push(`لم تُقيَّم ${summary.total - summary.rated} مؤشرات بعد`);
  if (summary.needsPlan > 0) out.push(`${summary.needsPlan} مؤشرات ضعيفة تحتاج خطة تحسين قبل الإرسال`);
  return out;
}
