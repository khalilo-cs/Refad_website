/**
 * بُناة محتوى التقارير. كل دالة تقرأ سجلات فعلية من قاعدة البيانات وتبني ReportContent
 * يُثبَّت كلقطة عند الإنشاء. لا تُختلق أرقام: عند غياب البيانات يُذكر ذلك صراحةً.
 */
import { query, queryOne } from "../db/sqlite";
import { computeVisitResult, computeVisitResults, loadTree } from "../analytics";
import type { EvaluationResult } from "../scoring";
import { schoolScope, type ScopeUser } from "../scope";
import { SPECIAL_TOPICS, type Cell, type ReportContent, type Section } from "./types";

export class ReportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const RATING: Record<number, string> = { 0: "غير متحقق", 1: "ضعيف", 2: "متوسط", 3: "متحقق" };
const VISIT_TYPE: Record<string, string> = { PERIODIC: "دورية", FOLLOW_UP: "متابعة", EXPLORATORY: "استطلاعية", EMERGENCY: "طارئة" };
const VISIT_STATUS: Record<string, string> = { SCHEDULED: "مجدولة", IN_PROGRESS: "جارية", SUBMITTED: "بانتظار المراجعة", COMPLETED: "معتمدة", POSTPONED: "مؤجلة", CANCELLED: "ملغاة" };
const ACTION_STATUS: Record<string, string> = { NEW: "جديد", IN_PROGRESS: "قيد التنفيذ", OVERDUE: "متأخر", COMPLETED: "يحتاج تحقق", CLOSED_VERIFIED: "مغلق بعد التحقق", CLOSED_REJECTED: "مرفوض التحقق" };
const PRIORITY: Record<string, string> = { LOW: "منخفضة", MEDIUM: "متوسطة", HIGH: "عالية", CRITICAL: "حرجة" };

export const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${Number(v.toFixed(d))}%`);
const dateAr = (iso?: string | null, time = false) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ar-YE", { year: "numeric", month: "long", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
};
const trunc = (s: string | null | undefined, n: number) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);
const now = () => new Date().toISOString();

/* ---------------------------------------------------------------------- */
/* 1) تقرير الزيارة الميدانية اليومية                                     */
/* ---------------------------------------------------------------------- */
export async function buildVisitDaily(visitId: string): Promise<ReportContent> {
  const v = await queryOne<any>(
    `SELECT v.*, s.name AS school_name, s.code AS school_code, d.name AS directorate_name, g.name AS governorate_name,
            u.name AS inspector_name, sb.name AS submitted_by_name
     FROM visits v JOIN schools s ON s.id = v.school_id JOIN directorates d ON d.id = s.directorate_id
     JOIN governorates g ON g.id = s.governorate_id JOIN users u ON u.id = v.inspector_id
     LEFT JOIN users sb ON sb.id = v.submitted_by_id WHERE v.id = ?`, [visitId]);
  if (!v) throw new ReportError("الزيارة غير موجودة", 404);
  const tree = await loadTree();
  const r: EvaluationResult = await computeVisitResult(visitId, tree);

  const evals = await query<any>(
    `SELECT i.id AS indicator_id, i.code, i.title, i.order_index, e.score, e.notes, e.verification_methods, e.id AS eval_id,
            (SELECT COUNT(*) FROM evidence x WHERE x.evaluation_id = e.id) AS ev_total,
            (SELECT COUNT(*) FROM evidence x WHERE x.evaluation_id = e.id AND x.review_status = 'ACCEPTED') AS ev_ok,
            c.code AS crit_code
     FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
     JOIN criteria c ON c.id = COALESCE(i.criterion_id, (SELECT criterion_id FROM sub_criteria WHERE id = i.sub_criterion_id))
     WHERE e.visit_id = ? AND e.status = 'EVALUATED' ORDER BY i.order_index`, [visitId]);
  const weak = evals.filter((e) => e.score <= 1);
  const strong = evals.filter((e) => e.score === 3);

  const actions = await query<any>(
    `SELECT a.problem_description, a.proposed_action, a.priority, a.due_date, a.status, a.success_indicator, ru.name AS responsible, i.code
     FROM corrective_actions a JOIN evaluations e ON e.id = a.evaluation_id JOIN users ru ON ru.id = a.responsible_id
     LEFT JOIN indicators i ON i.id = a.indicator_id WHERE e.visit_id = ? ORDER BY a.due_date`, [visitId]);
  const actionIndicators = new Set((await query<any>("SELECT a.indicator_id FROM corrective_actions a JOIN evaluations e ON e.id = a.evaluation_id WHERE e.visit_id = ?", [visitId])).map((x) => x.indicator_id));
  const evidence = await query<any>(
    `SELECT x.name, x.document_type, x.review_status, i.code FROM evidence x LEFT JOIN indicators i ON i.id = x.indicator_id WHERE x.visit_id = ? ORDER BY x.created_at`, [visitId]);
  const EV: Record<string, string> = { PENDING: "بانتظار المراجعة", ACCEPTED: "مقبول", REJECTED: "مرفوض" };

  const reviewed = r.criteria.filter((c) => c.evaluatedIndicators > 0);
  const sections: Section[] = [
    {
      kind: "stats", items: [
        { label: "نسبة التحقق (على المقيَّم)", value: pct(r.evaluatedPartPercent), hint: "من الجزء المقيَّم فقط" },
        { label: "الدرجة الكلية", value: r.totalScore == null ? "—" : `${r.totalScore} / 100`, hint: r.isComplete ? "تقييم مكتمل" : "جزئية — غير نهائية" },
        { label: "المؤشرات المقيَّمة", value: `${r.evaluatedIndicators} / ${r.totalIndicators}` },
        { label: "نسبة الإكمال", value: pct(r.completionPercent, 0) },
      ],
    },
    {
      kind: "table", title: "المعايير التي تمت مراجعتها",
      columns: [{ key: "c", label: "المعيار", width: 5 }, { key: "w", label: "الوزن", width: 1, align: "center" }, { key: "n", label: "المقيَّم", width: 1.2, align: "center" }, { key: "a", label: "التحقق", width: 1.2, align: "center" }, { key: "k", label: "المساهمة", width: 1.2, align: "center" }],
      rows: r.criteria.map((c) => [`${c.code}. ${c.title}`, `${c.weight}%`, `${c.evaluatedIndicators}/${c.totalIndicators}`, c.evaluatedIndicators ? pct(c.achievementPercent) : "لم يُقيَّم", c.contribution == null ? "—" : c.contribution]),
      note: reviewed.length < r.criteria.length ? `لم تُراجع ${r.criteria.length - reviewed.length} معايير بعد.` : undefined,
    },
    {
      kind: "table", title: "درجات المؤشرات",
      columns: [{ key: "c", label: "الرمز", width: 1.2, align: "center" }, { key: "t", label: "المؤشر", width: 6 }, { key: "r", label: "التقدير", width: 1.6, align: "center" }, { key: "e", label: "الأدلة المقبولة", width: 1.4, align: "center" }, { key: "n", label: "ملاحظات", width: 3 }],
      rows: evals.map((e) => [e.code, trunc(e.title, 110), RATING[e.score] ?? e.score, `${e.ev_ok}/${e.ev_total}`, trunc(e.notes, 100)]),
      emptyText: "لم تُقيَّم أي مؤشرات في هذه الزيارة بعد.",
    },
    { kind: "bullets", title: "أبرز نقاط القوة", items: [...(v.strengths ? [v.strengths] : []), ...(strong.length ? [`${strong.length} مؤشراً بتقدير «متحقق»، منها: ${strong.slice(0, 4).map((s) => s.code).join("، ")}`] : [])], emptyText: "لم تُسجَّل نقاط قوة." },
    { kind: "bullets", title: "الفجوات المكتشفة", items: [...(v.gaps ? [v.gaps] : []), ...weak.slice(0, 25).map((w) => `${w.code}: ${trunc(w.title, 120)} — ${RATING[w.score]}`)], emptyText: "لم تُرصد فجوات." },
    {
      kind: "table", title: "الإجراءات التصحيحية والمواعيد المستهدفة",
      columns: [{ key: "i", label: "المؤشر", width: 1 }, { key: "p", label: "المشكلة", width: 3 }, { key: "a", label: "الإجراء", width: 3 }, { key: "r", label: "المسؤول", width: 1.6 }, { key: "d", label: "الموعد", width: 1.5, align: "center" }, { key: "s", label: "الحالة", width: 1.4, align: "center" }],
      rows: actions.map((a) => [a.code ?? "—", trunc(a.problem_description, 90), trunc(a.proposed_action, 90), a.responsible, a.due_date?.slice(0, 10), ACTION_STATUS[a.status] ?? a.status]),
      emptyText: "لا إجراءات تصحيحية مسجَّلة لهذه الزيارة.",
      note: weak.filter((w) => !actionIndicators.has(w.indicator_id)).length ? `${weak.filter((w) => !actionIndicators.has(w.indicator_id)).length} مؤشراً ضعيفاً لم يُنشأ له إجراء تصحيحي بعد.` : undefined,
    },
    {
      kind: "table", title: "الأدلة المرفقة",
      columns: [{ key: "i", label: "المؤشر", width: 1 }, { key: "n", label: "الملف", width: 4 }, { key: "t", label: "النوع", width: 2 }, { key: "s", label: "المراجعة", width: 1.6, align: "center" }],
      rows: evidence.map((e) => [e.code ?? "—", trunc(e.name, 70), e.document_type ?? "—", EV[e.review_status] ?? e.review_status]),
      emptyText: "لم تُرفق أدلة بهذه الزيارة.",
    },
  ];

  return {
    type: "VISIT_DAILY",
    title: `تقرير الزيارة الميدانية — ${v.school_name}`,
    subtitle: `الزيارة بتاريخ ${dateAr(v.started_at ?? v.scheduled_at ?? v.created_at)}`,
    generatedAt: now(),
    state: r.isComplete ? "COMPLETE" : "INCOMPLETE",
    meta: [
      ["المدرسة", v.school_name], ["الرمز المدرسي", v.school_code], ["المديرية", v.directorate_name], ["المحافظة", v.governorate_name],
      ["تاريخ الزيارة", dateAr(v.started_at ?? v.scheduled_at ?? v.created_at)], ["وقت الزيارة", v.started_at ? dateAr(v.started_at, true) : "—"],
      ["المفتش", v.inspector_name], ["الجهة المشرفة", `إدارة التربية والتعليم — ${v.directorate_name}`],
      ["نوع الزيارة", VISIT_TYPE[v.type] ?? v.type], ["حالة الزيارة", VISIT_STATUS[v.status] ?? v.status],
      ...(v.purpose ? ([["هدف الزيارة", v.purpose]] as [string, string][]) : []),
    ],
    notices: r.isComplete ? [] : r.warnings.slice(-1),
    sections,
  };
}

/* ---------------------------------------------------------------------- */
/* 2) التقرير اليومي للإدارة التعليمية                                      */
/* ---------------------------------------------------------------------- */
export async function buildDirectorateDaily(directorateId: string | null, date: string, user: ScopeUser): Promise<ReportContent> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ReportError("تاريخ غير صالح");
  const dir = directorateId ? await queryOne<any>("SELECT d.name, g.name AS gov FROM directorates d JOIN governorates g ON g.id = d.governorate_id WHERE d.id = ?", [directorateId]) : null;
  if (directorateId && !dir) throw new ReportError("المديرية غير موجودة", 404);
  const sc = await schoolScope(user, "s");
  const where = [sc.sql];
  const params: unknown[] = [...sc.params];
  if (directorateId) { where.push("s.directorate_id = ?"); params.push(directorateId); }
  const W = where.join(" AND ");

  const schoolsTarget = (await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM schools s WHERE s.status = 'ACTIVE' AND ${W}`, params))?.n ?? 0;
  const dayVisits = await query<any>(
    `SELECT v.id, v.type, v.status, v.completion, v.scheduled_at, v.started_at, s.name AS school_name, u.name AS inspector_name
     FROM visits v JOIN schools s ON s.id = v.school_id JOIN users u ON u.id = v.inspector_id
     WHERE ${W} AND v.status <> 'CANCELLED' AND (date(v.scheduled_at) = date(?) OR date(v.started_at) = date(?) OR date(v.ended_at) = date(?))
     ORDER BY s.name`, [...params, date, date, date]);
  const tree = await loadTree();
  const results = await computeVisitResults(dayVisits.map((x) => x.id), tree);
  const planned = dayVisits.length;
  const executed = dayVisits.filter((x) => ["SUBMITTED", "COMPLETED"].includes(x.status)).length;
  const postponed = dayVisits.filter((x) => x.status === "POSTPONED").length;
  const inProg = dayVisits.filter((x) => x.status === "IN_PROGRESS").length;
  const completeSchools = new Set(dayVisits.filter((x) => results.get(x.id)?.isComplete).map((x) => x.school_name)).size;
  const rate = planned ? Math.round((executed / planned) * 100) : null;

  const recurring = await query<any>(
    `SELECT i.code, i.title, COUNT(DISTINCT v.school_id) AS schools FROM evaluations e JOIN visits v ON v.id = e.visit_id JOIN schools s ON s.id = v.school_id
     JOIN indicators i ON i.id = e.indicator_id
     WHERE ${W} AND e.status = 'EVALUATED' AND e.score <= 1 AND date(v.updated_at) >= date(?, '-30 day')
     GROUP BY i.id HAVING schools >= 1 ORDER BY schools DESC, i.order_index LIMIT 10`, [...params, date]);
  const overdueActions = await query<any>(
    `SELECT s.name AS school_name, COUNT(*) AS n FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
     WHERE ${W} AND a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(a.due_date) < date(?) GROUP BY s.id ORDER BY n DESC`, [...params, date]);
  const pendingVisits = await query<any>(`SELECT s.name AS school_name, u.name AS inspector_name FROM visits v JOIN schools s ON s.id = v.school_id JOIN users u ON u.id = v.inspector_id WHERE ${W} AND v.status = 'SUBMITTED'`, params);
  const pendingReports = (await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM reports r LEFT JOIN schools s ON s.id = r.school_id WHERE r.status = 'UNDER_REVIEW' AND (r.school_id IS NULL OR ${W})`, params))?.n ?? 0;
  const pendingEvidence = (await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM evidence x JOIN schools s ON s.id = x.school_id WHERE x.review_status = 'PENDING' AND ${W}`, params))?.n ?? 0;
  const urgent = await urgentSchools(W, params);

  return {
    type: "DIRECTORATE_DAILY",
    title: `التقرير اليومي للإدارة التعليمية${dir ? ` — ${dir.name}` : ""}`,
    subtitle: `ليوم ${dateAr(date)}`,
    generatedAt: now(),
    state: "INFO",
    meta: [["الجهة", dir ? `إدارة التربية والتعليم — ${dir.name}` : "كل المديريات ضمن النطاق"], ["المحافظة", dir?.gov ?? "—"], ["تاريخ التقرير", dateAr(date)]],
    notices: planned === 0 ? ["لا توجد زيارات مجدولة أو منفَّذة في هذا اليوم ضمن النطاق."] : [],
    sections: [
      { kind: "stats", items: [
        { label: "المدارس المستهدفة", value: String(schoolsTarget) },
        { label: "زيارات مخططة", value: String(planned) },
        { label: "زيارات منفَّذة", value: String(executed), hint: inProg ? `${inProg} جارية` : undefined },
        { label: "زيارات مؤجلة", value: String(postponed) },
        { label: "مدارس أكملت التقييم", value: String(completeSchools) },
        { label: "إنجاز العمل اليومي", value: rate == null ? "—" : `${rate}%` },
      ] },
      { kind: "table", title: "زيارات اليوم",
        columns: [{ key: "s", label: "المدرسة", width: 4 }, { key: "i", label: "المفتش", width: 2.4 }, { key: "t", label: "النوع", width: 1.4 }, { key: "st", label: "الحالة", width: 1.6, align: "center" }, { key: "c", label: "الإكمال", width: 1.2, align: "center" }, { key: "p", label: "التحقق", width: 1.2, align: "center" }],
        rows: dayVisits.map((x) => [x.school_name, x.inspector_name, VISIT_TYPE[x.type] ?? x.type, VISIT_STATUS[x.status] ?? x.status, `${x.completion}%`, pct(results.get(x.id)?.evaluatedPartPercent)]),
        emptyText: "لا زيارات في هذا اليوم." },
      { kind: "table", title: "أهم المشكلات المتكررة (آخر 30 يوماً)",
        columns: [{ key: "c", label: "الرمز", width: 1.2, align: "center" }, { key: "t", label: "المؤشر", width: 7 }, { key: "n", label: "عدد المدارس", width: 1.6, align: "center" }],
        rows: recurring.map((x) => [x.code, trunc(x.title, 120), x.schools]), emptyText: "لا مشكلات متكررة مرصودة." },
      { kind: "table", title: "الاحتياجات العاجلة",
        columns: [{ key: "s", label: "المدرسة", width: 4 }, { key: "p", label: "التحقق", width: 1.2, align: "center" }, { key: "r", label: "الأسباب", width: 6 }],
        rows: urgent.map((u) => [u.name, pct(u.score), u.reasons.join(" · ")]), emptyText: "لا مدارس تستدعي المتابعة العاجلة." },
      { kind: "bullets", title: "الإجراءات المطلوبة من الإدارة", items: [
        ...(pendingVisits.length ? [`اعتماد ${pendingVisits.length} زيارة بانتظار المراجعة: ${pendingVisits.slice(0, 5).map((x) => x.school_name).join("، ")}`] : []),
        ...(pendingReports ? [`مراجعة ${pendingReports} تقرير قيد المراجعة`] : []),
        ...(pendingEvidence ? [`مراجعة ${pendingEvidence} دليل بانتظار القبول أو الرفض`] : []),
        ...overdueActions.map((o) => `متابعة ${o.n} إجراء تصحيحي متأخر في ${o.school_name}`),
      ], emptyText: "لا إجراءات معلّقة على الإدارة." },
    ],
  };
}

/** مدارس تحتاج متابعة عاجلة بمعايير صريحة. */
export async function urgentSchools(schoolWhere: string, params: unknown[]) {
  const tree = await loadTree();
  const schools = await query<any>(`SELECT s.id, s.name FROM schools s WHERE s.status = 'ACTIVE' AND ${schoolWhere}`, params);
  const basis = await query<any>(
    `SELECT v.id, v.school_id, COALESCE(v.ended_at, v.submitted_at, v.updated_at) AS at FROM visits v JOIN schools s ON s.id = v.school_id
     WHERE v.status IN ('SUBMITTED','COMPLETED') AND ${schoolWhere} ORDER BY at DESC`, params);
  const first = new Map<string, any>();
  for (const b of basis) if (!first.has(b.school_id)) first.set(b.school_id, b);
  const results = await computeVisitResults([...first.values()].map((b) => b.id), tree);
  const overdue = new Map((await query<any>(
    `SELECT p.school_id, COUNT(*) n FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
     WHERE a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(a.due_date) < date('now') AND ${schoolWhere} GROUP BY p.school_id`, params)).map((r) => [r.school_id, r.n]));
  const out: { name: string; score: number | null; reasons: string[] }[] = [];
  for (const s of schools) {
    const b = first.get(s.id);
    const reasons: string[] = [];
    let score: number | null = null;
    if (!b) reasons.push("لا زيارة معتمدة أو مقدَّمة");
    else {
      score = results.get(b.id)?.evaluatedPartPercent ?? null;
      if (score !== null && score < 50) reasons.push(`نسبة التحقق ${score}% أقل من 50%`);
      const age = (Date.now() - new Date(b.at).getTime()) / 86400000;
      if (age > 90) reasons.push(`آخر زيارة قبل ${Math.floor(age)} يوماً`);
    }
    const od = overdue.get(s.id) ?? 0;
    if (od) reasons.push(`${od} إجراء تصحيحي متأخر`);
    if (reasons.length) out.push({ name: s.name, score, reasons });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length).slice(0, 15);
}

/* ---------------------------------------------------------------------- */
/* 3) التقرير الدوري                                                       */
/* ---------------------------------------------------------------------- */
export type PeriodKind = "week" | "month" | "quarter" | "year";
const PERIOD_LABEL: Record<PeriodKind, string> = { week: "أسبوعي", month: "شهري", quarter: "فصلي", year: "سنوي" };

function periodRange(kind: PeriodKind, anchor: string): { from: string; to: string; pFrom: string; pTo: string } {
  const d = new Date(anchor + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) throw new ReportError("تاريخ غير صالح");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const add = (x: Date, days: number) => new Date(x.getTime() + days * 86400000);
  let from: Date, to: Date, pFrom: Date, pTo: Date;
  if (kind === "week") { to = d; from = add(d, -6); pTo = add(from, -1); pFrom = add(pTo, -6); }
  else if (kind === "month") { from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); pFrom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); pTo = add(from, -1); }
  else if (kind === "quarter") { const q = Math.floor(d.getUTCMonth() / 3); from = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)); to = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)); pFrom = new Date(Date.UTC(d.getUTCFullYear(), q * 3 - 3, 1)); pTo = add(from, -1); }
  else { from = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); to = new Date(Date.UTC(d.getUTCFullYear(), 11, 31)); pFrom = new Date(Date.UTC(d.getUTCFullYear() - 1, 0, 1)); pTo = add(from, -1); }
  return { from: iso(from), to: iso(to), pFrom: iso(pFrom), pTo: iso(pTo) };
}

export async function buildPeriodic(kind: PeriodKind, anchor: string, directorateId: string | null, user: ScopeUser): Promise<ReportContent> {
  if (!PERIOD_LABEL[kind]) throw new ReportError("نوع الفترة غير صالح");
  const { from, to, pFrom, pTo } = periodRange(kind, anchor);
  const dir = directorateId ? await queryOne<any>("SELECT name FROM directorates WHERE id = ?", [directorateId]) : null;
  const sc = await schoolScope(user, "s");
  const where = [sc.sql];
  const params: unknown[] = [...sc.params];
  if (directorateId) { where.push("s.directorate_id = ?"); params.push(directorateId); }
  const W = where.join(" AND ");
  const tree = await loadTree();

  const load = async (a: string, b: string) => {
    const vs = await query<any>(
      `SELECT v.id, v.school_id, s.name AS school_name, COALESCE(v.ended_at, v.submitted_at, v.updated_at) AS at FROM visits v JOIN schools s ON s.id = v.school_id
       WHERE ${W} AND v.status IN ('SUBMITTED','COMPLETED') AND date(COALESCE(v.ended_at, v.submitted_at, v.updated_at)) BETWEEN date(?) AND date(?) ORDER BY at DESC`, [...params, a, b]);
    const latest = new Map<string, any>();
    for (const v of vs) if (!latest.has(v.school_id)) latest.set(v.school_id, v);
    const results = await computeVisitResults([...latest.values()].map((x) => x.id), tree);
    return { vs, latest, results };
  };
  const cur = await load(from, to);
  const prev = await load(pFrom, pTo);
  const avg = (m: { latest: Map<string, any>; results: Map<string, EvaluationResult> }) => {
    const a = [...m.latest.values()].map((x) => m.results.get(x.id)?.evaluatedPartPercent).filter((x): x is number => typeof x === "number");
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const critAvg = (m: { latest: Map<string, any>; results: Map<string, EvaluationResult> }, cid: string) => {
    const a = [...m.latest.values()].map((x) => m.results.get(x.id)?.criteria.find((c) => c.criterionId === cid)?.achievementPercent).filter((x): x is number => typeof x === "number");
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const delta = (c: number | null, p: number | null) => (c == null || p == null ? null : Math.round((c - p) * 10) / 10);
  const trendWord = (d: number | null) => (d == null ? "—" : d > 2 ? "تحسّن" : d < -2 ? "تراجع" : "ثبات");
  const a1 = avg(cur), a0 = avg(prev);

  const allSchools = await query<any>(`SELECT s.id, s.name FROM schools s WHERE s.status = 'ACTIVE' AND ${W} ORDER BY s.name`, params);
  const rows: Cell[][] = allSchools.map((s) => {
    const c = cur.latest.get(s.id) ? cur.results.get(cur.latest.get(s.id).id)?.evaluatedPartPercent ?? null : null;
    const p = prev.latest.get(s.id) ? prev.results.get(prev.latest.get(s.id).id)?.evaluatedPartPercent ?? null : null;
    const d = delta(c, p);
    const support = c == null ? "لا زيارة في الفترة" : c < 50 ? "نعم — دون 50%" : d != null && d < -10 ? "نعم — تراجع حاد" : "لا";
    return [s.name, pct(c), pct(p), d == null ? "—" : `${d > 0 ? "+" : ""}${d}`, trendWord(d), support];
  });
  const planned = (await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM visits v JOIN schools s ON s.id = v.school_id WHERE ${W} AND v.status <> 'CANCELLED' AND date(COALESCE(v.started_at, v.scheduled_at, v.created_at)) BETWEEN date(?) AND date(?)`, [...params, from, to]))?.n ?? 0;

  return {
    type: "PERIODIC",
    title: `التقرير الدوري ${PERIOD_LABEL[kind]} للمدارس${dir ? ` — ${dir.name}` : ""}`,
    subtitle: `الفترة من ${dateAr(from)} إلى ${dateAr(to)}`,
    generatedAt: now(),
    state: "INFO",
    meta: [["الفترة الحالية", `${dateAr(from)} — ${dateAr(to)}`], ["الفترة السابقة للمقارنة", `${dateAr(pFrom)} — ${dateAr(pTo)}`], ["النطاق", dir ? `مديرية ${dir.name}` : "كل المدارس ضمن النطاق"]],
    notices: cur.vs.length === 0 ? ["لا توجد زيارات مقدَّمة أو معتمدة في هذه الفترة؛ المقارنات المعروضة غير متاحة."] : [],
    sections: [
      { kind: "stats", items: [
        { label: "متوسط التحقق الحالي", value: pct(a1) },
        { label: "متوسط الفترة السابقة", value: pct(a0) },
        { label: "التغيّر", value: delta(a1, a0) == null ? "—" : `${delta(a1, a0)! > 0 ? "+" : ""}${delta(a1, a0)} نقطة`, hint: trendWord(delta(a1, a0)) },
        { label: "زيارات الفترة", value: String(planned), hint: `${cur.vs.length} مقدَّمة/معتمدة` },
      ] },
      { kind: "table", title: "مقارنة المعايير السبعة",
        columns: [{ key: "c", label: "المعيار", width: 5 }, { key: "w", label: "الوزن", width: 1, align: "center" }, { key: "a", label: "الحالية", width: 1.3, align: "center" }, { key: "b", label: "السابقة", width: 1.3, align: "center" }, { key: "d", label: "التغيّر", width: 1.2, align: "center" }, { key: "t", label: "الاتجاه", width: 1.2, align: "center" }],
        rows: tree.criteria.map((c) => { const x = critAvg(cur, c.id), y = critAvg(prev, c.id), d = delta(x, y); return [`${c.code}. ${c.title}`, `${c.weight}%`, pct(x), pct(y), d == null ? "—" : `${d > 0 ? "+" : ""}${d}`, trendWord(d)]; }) },
      { kind: "table", title: "أداء المدارس: التحسن والتراجع والحاجة للدعم",
        columns: [{ key: "s", label: "المدرسة", width: 4 }, { key: "a", label: "الحالية", width: 1.2, align: "center" }, { key: "b", label: "السابقة", width: 1.2, align: "center" }, { key: "d", label: "التغيّر", width: 1.1, align: "center" }, { key: "t", label: "الاتجاه", width: 1.2, align: "center" }, { key: "n", label: "تحتاج دعماً إضافياً", width: 2.4 }],
        rows, emptyText: "لا مدارس ضمن النطاق." },
    ],
  };
}

/* ---------------------------------------------------------------------- */
/* 4) تقرير الجودة التفصيلي                                                */
/* ---------------------------------------------------------------------- */
export async function buildQualityDetailed(schoolId: string, visitId: string | null): Promise<ReportContent> {
  const school = await queryOne<any>(`SELECT s.*, d.name AS directorate_name FROM schools s JOIN directorates d ON d.id = s.directorate_id WHERE s.id = ?`, [schoolId]);
  if (!school) throw new ReportError("المدرسة غير موجودة", 404);
  const v = visitId
    ? await queryOne<any>("SELECT v.*, u.name AS inspector_name FROM visits v JOIN users u ON u.id = v.inspector_id WHERE v.id = ? AND v.school_id = ?", [visitId, schoolId])
    : await queryOne<any>(`SELECT v.*, u.name AS inspector_name FROM visits v JOIN users u ON u.id = v.inspector_id WHERE v.school_id = ? AND v.status IN ('SUBMITTED','COMPLETED') ORDER BY COALESCE(v.ended_at, v.submitted_at, v.updated_at) DESC LIMIT 1`, [schoolId]);
  if (!v) throw new ReportError("لا توجد زيارة مقدَّمة أو معتمدة لهذه المدرسة لبناء تقرير الجودة التفصيلي", 409);
  const tree = await loadTree();
  const r = await computeVisitResult(v.id, tree);

  const inds = await query<any>(
    `SELECT i.id, i.code, i.title, i.evidence AS required, i.order_index, sc.code AS sub_code, e.id AS eval_id, e.status, e.score, e.notes,
            (SELECT COUNT(*) FROM evidence x WHERE x.evaluation_id = e.id AND x.review_status = 'ACCEPTED') AS ev_ok,
            (SELECT COUNT(*) FROM evidence x WHERE x.evaluation_id = e.id AND x.review_status = 'PENDING') AS ev_pending,
            (SELECT COUNT(*) FROM evidence x WHERE x.evaluation_id = e.id AND x.review_status = 'REJECTED') AS ev_rej
     FROM indicators i LEFT JOIN sub_criteria sc ON sc.id = i.sub_criterion_id LEFT JOIN evaluations e ON e.indicator_id = i.id AND e.visit_id = ?
     ORDER BY i.order_index`, [v.id]);
  const evidenceOk = inds.filter((i) => i.status === "EVALUATED" && i.ev_ok > 0).length;
  const evaluated = inds.filter((i) => i.status === "EVALUATED");
  const missing = evaluated.filter((i) => i.ev_ok === 0);

  const plan = await query<any>(
    `SELECT a.problem_description, a.proposed_action, a.priority, a.due_date, a.status, a.success_indicator, a.resources, ru.name AS responsible, i.code
     FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN users ru ON ru.id = a.responsible_id LEFT JOIN indicators i ON i.id = a.indicator_id
     WHERE p.school_id = ? ORDER BY a.due_date`, [schoolId]);

  const subRows: Cell[][] = r.criteria.flatMap((c) => c.subCriteria.map((s) => [`${s.code}`, s.title, `${s.weight}%`, `${s.evaluatedIndicators}/${s.totalIndicators}`, s.achievementPercent == null ? "لم يُقيَّم" : pct(s.achievementPercent), s.contribution == null ? "—" : s.contribution]));

  return {
    type: "QUALITY_DETAILED",
    title: `تقرير الجودة التفصيلي — ${school.name}`,
    subtitle: `استناداً إلى زيارة ${dateAr(v.ended_at ?? v.submitted_at ?? v.started_at ?? v.created_at)}`,
    generatedAt: now(),
    state: r.isComplete ? "COMPLETE" : "INCOMPLETE",
    meta: [["المدرسة", school.name], ["الرمز", school.code], ["المديرية", school.directorate_name], ["المفتش", v.inspector_name], ["حالة الزيارة", VISIT_STATUS[v.status] ?? v.status], ["تاريخ الزيارة", dateAr(v.started_at ?? v.created_at)]],
    notices: r.isComplete ? [] : r.warnings.slice(-1),
    sections: [
      { kind: "stats", items: [
        { label: "الدرجة الكلية", value: r.totalScore == null ? "—" : `${r.totalScore} / 100`, hint: r.isComplete ? "مكتمل" : "جزئية" },
        { label: "التحقق على المقيَّم", value: pct(r.evaluatedPartPercent) },
        { label: "الشواهد المقبولة", value: `${evidenceOk} / ${evaluated.length}`, hint: "مؤشرات مقيَّمة لها دليل مقبول" },
        { label: "الإكمال", value: pct(r.completionPercent, 0) },
      ] },
      { kind: "table", title: "درجات المعايير السبعة ومساهمتها",
        columns: [{ key: "c", label: "المعيار", width: 5 }, { key: "w", label: "الوزن", width: 1, align: "center" }, { key: "n", label: "المقيَّم", width: 1.2, align: "center" }, { key: "a", label: "التحقق", width: 1.3, align: "center" }, { key: "k", label: "المساهمة", width: 1.3, align: "center" }],
        rows: r.criteria.map((c) => [`${c.code}. ${c.title}`, `${c.weight}%`, `${c.evaluatedIndicators}/${c.totalIndicators}`, c.achievementPercent == null ? "لم يُقيَّم" : pct(c.achievementPercent), c.contribution == null ? "—" : c.contribution]),
        note: "الدرجة الكلية = مجموع مساهمات المعايير الفرعية. المؤشر غير المقيَّم حالة منفصلة ولا يُحسب صفراً." },
      { kind: "table", title: "نتائج المعايير الفرعية",
        columns: [{ key: "k", label: "الرمز", width: 1, align: "center" }, { key: "t", label: "المعيار الفرعي", width: 5 }, { key: "w", label: "الوزن", width: 1, align: "center" }, { key: "n", label: "المقيَّم", width: 1.2, align: "center" }, { key: "a", label: "التحقق", width: 1.3, align: "center" }, { key: "c", label: "المساهمة", width: 1.3, align: "center" }],
        rows: subRows },
      { kind: "table", title: "حالة كل مؤشر والشواهد",
        columns: [{ key: "c", label: "الرمز", width: 1.2, align: "center" }, { key: "t", label: "المؤشر", width: 5.5 }, { key: "r", label: "الحالة", width: 1.6, align: "center" }, { key: "e", label: "شواهد (مقبول/معلّق/مرفوض)", width: 2.2, align: "center" }, { key: "n", label: "ملاحظات", width: 2.6 }],
        rows: inds.map((i) => [i.code, trunc(i.title, 100), i.status === "EVALUATED" ? RATING[i.score] : "لم يُقيَّم", i.status === "EVALUATED" ? `${i.ev_ok} / ${i.ev_pending} / ${i.ev_rej}` : "—", trunc(i.notes, 90)]) },
      { kind: "bullets", title: "شواهد ناقصة: مؤشرات مقيَّمة بلا دليل مقبول", items: missing.slice(0, 40).map((i) => `${i.code}: ${trunc(i.title, 90)}`), emptyText: "كل المؤشرات المقيَّمة لها دليل مقبول." },
      { kind: "table", title: "خطة التحسين: المسؤوليات والمواعيد ومؤشرات الإنجاز",
        columns: [{ key: "i", label: "المؤشر", width: 1 }, { key: "p", label: "المشكلة", width: 2.8 }, { key: "a", label: "الإجراء", width: 2.8 }, { key: "r", label: "المسؤول", width: 1.6 }, { key: "d", label: "الموعد", width: 1.4, align: "center" }, { key: "k", label: "مؤشر الإنجاز", width: 2 }, { key: "s", label: "الحالة", width: 1.3, align: "center" }],
        rows: plan.map((a) => [a.code ?? "—", trunc(a.problem_description, 70), trunc(a.proposed_action, 70), a.responsible, a.due_date?.slice(0, 10), trunc(a.success_indicator, 60), ACTION_STATUS[a.status] ?? a.status]),
        emptyText: "لا خطة تحسين مسجَّلة." },
    ],
  };
}

/* ---------------------------------------------------------------------- */
/* 5) التقارير الإدارية الخاصة                                             */
/* ---------------------------------------------------------------------- */
export async function buildSpecial(topic: string, schoolId: string | null, directorateId: string | null, from: string | null, to: string | null, user: ScopeUser): Promise<ReportContent> {
  const cfg = SPECIAL_TOPICS[topic];
  if (!cfg) throw new ReportError("موضوع التقرير غير معروف");
  const sc = await schoolScope(user, "s");
  const where = [sc.sql];
  const params: unknown[] = [...sc.params];
  if (schoolId) { where.push("s.id = ?"); params.push(schoolId); }
  if (directorateId) { where.push("s.directorate_id = ?"); params.push(directorateId); }
  const W = where.join(" AND ");
  const scopeName = schoolId ? (await queryOne<any>("SELECT name FROM schools WHERE id = ?", [schoolId]))?.name : directorateId ? `مديرية ${(await queryOne<any>("SELECT name FROM directorates WHERE id = ?", [directorateId]))?.name}` : "كل المدارس ضمن النطاق";
  const sections: Section[] = [];
  const notices: string[] = ["تقرير إداري مساند: لا يُعدّ جزءاً من التقييم الرسمي الوارد في استمارة التقييم الذاتي، ولا تُنسب إليه معايير لم ترد فيها."];
  const period = from || to ? `${from ? dateAr(from) : "البداية"} — ${to ? dateAr(to) : "اليوم"}` : "كل الفترات";

  if (cfg.kind === "attendance") {
    const dateCond = [from ? "date(ar.date) >= date(?)" : "", to ? "date(ar.date) <= date(?)" : ""].filter(Boolean);
    const dparams = [from, to].filter(Boolean) as string[];
    const rows = await query<any>(
      `SELECT s.name, COUNT(*) AS total,
              SUM(CASE WHEN ar.status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN ar.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN ar.status NOT IN ('PRESENT','ABSENT') THEN 1 ELSE 0 END) AS other
       FROM attendance_records ar JOIN students st ON st.id = ar.student_id JOIN schools s ON s.id = st.school_id
       WHERE ${W} ${dateCond.length ? "AND " + dateCond.join(" AND ") : ""} GROUP BY s.id ORDER BY s.name`, [...params, ...dparams]);
    if (rows.length === 0) notices.push("لا توجد بيانات حضور وغياب موثَّقة مُدخلة لهذه الفترة والنطاق، فلم تُحسب أي نسب.");
    const tot = rows.reduce((a, r) => a + r.total, 0), abs = rows.reduce((a, r) => a + r.absent, 0);
    sections.push({ kind: "stats", items: [{ label: "سجلات الحضور", value: String(tot) }, { label: "نسبة الحضور", value: tot ? pct(((tot - abs) / tot) * 100) : "—" }, { label: "نسبة الغياب", value: tot ? pct((abs / tot) * 100) : "—" }] });
    sections.push({ kind: "table", title: "الحضور والغياب حسب المدرسة", columns: [{ key: "s", label: "المدرسة", width: 4 }, { key: "t", label: "السجلات", width: 1.2, align: "center" }, { key: "p", label: "حاضر", width: 1.2, align: "center" }, { key: "a", label: "غائب", width: 1.2, align: "center" }, { key: "r", label: "نسبة الحضور", width: 1.6, align: "center" }],
      rows: rows.map((r) => [r.name, r.total, r.present, r.absent, pct((r.present / r.total) * 100)]), emptyText: "لا بيانات حضور موثَّقة." });
  } else if (cfg.kind === "results") {
    const rows = await query<any>(
      `SELECT s.name, ar.subject, ar.term, COUNT(*) AS n, AVG(ar.score * 100.0 / ar.max_score) AS avg
       FROM academic_results ar JOIN students st ON st.id = ar.student_id JOIN schools s ON s.id = st.school_id
       WHERE ${W} ${from ? "AND date(ar.recorded_at) >= date(?)" : ""} ${to ? "AND date(ar.recorded_at) <= date(?)" : ""} GROUP BY s.id, ar.subject, ar.term ORDER BY s.name, ar.subject`, [...params, ...([from, to].filter(Boolean) as string[])]);
    if (rows.length === 0) notices.push("لا توجد نتائج دراسية موثَّقة مُدخلة لهذا النطاق، فلم تُحسب أي نسب.");
    sections.push({ kind: "table", title: "متوسط التحصيل الدراسي", columns: [{ key: "s", label: "المدرسة", width: 3.5 }, { key: "j", label: "المادة", width: 2.2 }, { key: "t", label: "الفصل", width: 1.6 }, { key: "n", label: "عدد النتائج", width: 1.3, align: "center" }, { key: "a", label: "المتوسط", width: 1.3, align: "center" }],
      rows: rows.map((r) => [r.name, r.subject, r.term, r.n, pct(r.avg)]), emptyText: "لا نتائج موثَّقة." });
  } else {
    const codes = cfg.codes ?? [];
    const cc = cfg.criterionCodes ?? [];
    const conds: string[] = [];
    const ip: unknown[] = [];
    if (codes.length) { conds.push(`i.code IN (${codes.map(() => "?").join(",")})`); ip.push(...codes); }
    if (cc.length) { conds.push(`(sc.code IN (${cc.map(() => "?").join(",")}) OR c.code IN (${cc.map(() => "?").join(",")}))`); ip.push(...cc, ...cc); }
    const inds = await query<any>(
      `SELECT i.id, i.code, i.title FROM indicators i LEFT JOIN sub_criteria sc ON sc.id = i.sub_criterion_id JOIN criteria c ON c.id = COALESCE(i.criterion_id, sc.criterion_id)
       WHERE ${conds.join(" OR ")} ORDER BY i.order_index`, ip);
    const schools = await query<any>(`SELECT s.id, s.name FROM schools s WHERE s.status = 'ACTIVE' AND ${W} ORDER BY s.name`, params);
    const basisByS = new Map<string, string>();
    for (const b of await query<any>(`SELECT v.id, v.school_id FROM visits v JOIN schools s ON s.id = v.school_id WHERE v.status IN ('SUBMITTED','COMPLETED') AND ${W} ${from ? "AND date(v.updated_at) >= date(?)" : ""} ${to ? "AND date(v.updated_at) <= date(?)" : ""} ORDER BY COALESCE(v.ended_at, v.submitted_at, v.updated_at) DESC`, [...params, ...([from, to].filter(Boolean) as string[])]))
      if (!basisByS.has(b.school_id)) basisByS.set(b.school_id, b.id);
    const evals = new Map<string, any>();
    if (basisByS.size && inds.length) {
      const vids = [...basisByS.values()];
      for (const e of await query<any>(`SELECT e.visit_id, e.indicator_id, e.status, e.score FROM evaluations e WHERE e.visit_id IN (${vids.map(() => "?").join(",")}) AND e.indicator_id IN (${inds.map(() => "?").join(",")})`, [...vids, ...inds.map((i) => i.id)]))
        evals.set(`${e.visit_id}:${e.indicator_id}`, e);
    }
    const tableRows: Cell[][] = [];
    let sum = 0, cnt = 0;
    for (const s of schools) {
      const vid = basisByS.get(s.id);
      const sc2: number[] = [];
      for (const i of inds) { const e = vid ? evals.get(`${vid}:${i.id}`) : null; if (e?.status === "EVALUATED") sc2.push(e.score); }
      const a = sc2.length ? (sc2.reduce((x, y) => x + y, 0) / sc2.length / (await loadTree()).maxScore) * 100 : null;
      if (a != null) { sum += a; cnt++; }
      tableRows.push([s.name, vid ? `${sc2.length}/${inds.length}` : "لا زيارة", pct(a)]);
    }
    if (cnt === 0) notices.push("لا توجد تقييمات مقدَّمة لمؤشرات هذا الموضوع في النطاق والفترة، فلم تُحسب أي نسب.");
    sections.push({ kind: "stats", items: [{ label: "متوسط التحقق", value: cnt ? pct(sum / cnt) : "—" }, { label: "مدارس لها تقييم", value: `${cnt} / ${schools.length}` }, { label: "عدد المؤشرات المعتمدة", value: String(inds.length) }] });
    sections.push({ kind: "table", title: "نتائج المدارس في هذا الموضوع", columns: [{ key: "s", label: "المدرسة", width: 5 }, { key: "n", label: "المؤشرات المقيَّمة", width: 2, align: "center" }, { key: "a", label: "نسبة التحقق", width: 1.6, align: "center" }], rows: tableRows, emptyText: "لا مدارس ضمن النطاق." });
    sections.push({ kind: "table", title: "المؤشرات المعتمدة في هذا التقرير (من الاستمارة)", columns: [{ key: "c", label: "الرمز", width: 1.2, align: "center" }, { key: "t", label: "نص المؤشر", width: 8 }], rows: inds.map((i) => [i.code, trunc(i.title, 150)]) });
    if (topic === "facilities") {
      const prof = await query<any>(`SELECT s.name, p.* FROM school_profiles p JOIN schools s ON s.id = p.school_id WHERE ${W} ORDER BY s.name`, params);
      const yn = (x: any) => (x == null ? "غير محدد" : x ? "متوفر" : "غير متوفر");
      sections.push({ kind: "table", title: "ملف المرافق المُدخل", columns: [{ key: "s", label: "المدرسة", width: 3 }, { key: "a", label: "معمل علوم", width: 1.2, align: "center" }, { key: "b", label: "معمل حاسوب", width: 1.2, align: "center" }, { key: "c", label: "مكتبة", width: 1.2, align: "center" }, { key: "d", label: "مقصف", width: 1.2, align: "center" }, { key: "v", label: "موثّق", width: 1, align: "center" }],
        rows: prof.map((p) => [p.name, yn(p.has_science_lab), yn(p.has_computer_lab), yn(p.has_library), yn(p.has_canteen), p.verified ? "نعم" : "لا"]), emptyText: "لا ملفات مرافق مُدخلة." });
    }
  }

  return {
    type: "SPECIAL",
    title: `تقرير ${cfg.label}`,
    subtitle: scopeName,
    generatedAt: now(),
    state: "INFO",
    meta: [["الموضوع", cfg.label], ["النطاق", scopeName ?? "—"], ["الفترة", period]],
    notices,
    sections,
  };
}
