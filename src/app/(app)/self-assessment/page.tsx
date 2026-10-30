"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck, Clock, Flag, History, Loader2, Lock, PlayCircle, RotateCcw, Search, Send, ShieldCheck, Sparkles, Target, TrendingUp, Unlock,
} from "lucide-react";
import { Modal, PageHeader } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

type Status = "NONE" | "NEEDS_PLAN" | "PLANNED" | "IN_PROGRESS" | "IMPROVED" | "VERIFIED";
type Ind = {
  indicatorId: string; code: string; title: string; itemId: string | null; score: number | null; baselineScore: number | null; isWeak: boolean; status: Status;
  plan: { action: string | null; responsible: string | null; dueDate: string | null; successMeasure: string | null; setAt: string | null };
  progressNote: string | null; improvedAt: string | null; reviewNote: string | null; verifiedAt: string | null; verifiedBy: string | null; overdue: boolean;
};
type Crit = { id: string; code: string; title: string; achieved: boolean; percent: number | null; subs: { id: string; code: string; title: string; indicators: Ind[] }[] };
type Summary = { total: number; rated: number; weak: number; needsPlan: number; planned: number; inProgress: number; improved: number; verified: number; overdue: number; percent: number | null; achievedCriteria: number };
type Data = {
  school: { id: string; name: string; code: string; principal_name: string | null; directorate_name: string };
  year: string; years: string[]; assessment: { id: string; status: string; submittedAt: string | null } | null;
  canFill: boolean; canReview: boolean; locked: boolean; scale: { key: string; label_ar: string; score: number }[]; maxScore: number;
  criteria: Crit[]; summary: Summary; blockers: string[];
};

/** ألوان الحالة: أحمر ضعيف بلا خطة، برتقالي خطة، أزرق تنفيذ، أخضر فاتح تحسّن بانتظار الاعتماد، أخضر معتمد. */
const STATUS: Record<Status, { label: string; bar: string; chip: string }> = {
  NONE: { label: "", bar: "border-s-gray-200", chip: "" },
  NEEDS_PLAN: { label: "ضعيف — يحتاج خطة", bar: "border-s-danger", chip: "bg-danger/10 text-danger" },
  PLANNED: { label: "خطة موضوعة", bar: "border-s-warning", chip: "bg-warning/10 text-warning" },
  IN_PROGRESS: { label: "قيد التنفيذ", bar: "border-s-sky-500", chip: "bg-sky-500/10 text-sky-700" },
  IMPROVED: { label: "تحسّن — بانتظار الاعتماد", bar: "border-s-emerald-400", chip: "bg-emerald-400/15 text-emerald-700" },
  VERIFIED: { label: "تحسّن معتمد", bar: "border-s-success", chip: "bg-success/10 text-success" },
};
const SCORE_BTN = ["bg-danger text-white", "bg-orange-500 text-white", "bg-warning text-white", "bg-success text-white"];

type Filter = "all" | "todo" | "weak" | "NEEDS_PLAN" | "active" | "IMPROVED" | "VERIFIED" | "overdue";
const FILTERS: [Filter, string][] = [
  ["all", "الكل"], ["todo", "غير مقيّم"], ["weak", "نقاط الضعف"], ["NEEDS_PLAN", "بانتظار خطة"], ["active", "قيد المعالجة"], ["IMPROVED", "بانتظار الاعتماد"], ["VERIFIED", "تحسّن معتمد"], ["overdue", "متأخر عن موعده"],
];

export default function SelfAssessmentPage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><Inner /></Suspense>;
}

function Inner() {
  const { user } = useSession();
  const { add } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const schoolId = sp.get("schoolId") ?? "";
  const yearParam = sp.get("year") ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schools, setSchools] = useState<{ id: string; name: string; code: string }[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<{ ind: Ind; required: boolean } | null>(null);
  const [improveFor, setImproveFor] = useState<Ind | null>(null);
  const [reviewFor, setReviewFor] = useState<{ ind: Ind; kind: "verify" | "return" } | null>(null);
  const [historyFor, setHistoryFor] = useState<Ind | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const isSchool = !!user && ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user.roleKey);

  const load = useCallback(async () => {
    if (!isSchool && !schoolId) { setData(null); return; }
    const p = new URLSearchParams();
    if (schoolId) p.set("schoolId", schoolId);
    if (yearParam) p.set("year", yearParam);
    try {
      const r = await fetch(`/api/self-assessment?${p}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
      setError(null);
      setOpen((o) => (o.size ? o : new Set(d.criteria.slice(0, 1).map((c: Crit) => c.id))));
    } catch (e: any) {
      setError(e.message || "تعذّر التحميل");
    }
  }, [isSchool, schoolId, yearParam]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  useEffect(() => {
    if (!user || isSchool) return;
    fetch("/api/lookup/schools", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setSchools(Array.isArray(d) ? d : [])).catch(() => {});
  }, [user, isSchool]);

  const nav = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`/self-assessment?${p}`);
  };

  const call = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.message || "تعذّر الحفظ"), { data: d });
    return d;
  };

  const rate = async (ind: Ind, patch: { score?: number; isWeak?: boolean }) => {
    if (!data) return;
    setBusy(ind.indicatorId);
    try {
      const d = await call("/api/self-assessment", "PUT", { schoolId: data.school.id, year: data.year, indicatorId: ind.indicatorId, ...patch });
      await load();
      // الضعف يُلزم بخطة فوراً
      if (d.needsPlan) setPlanFor({ ind: { ...ind, itemId: d.itemId, status: "NEEDS_PLAN", isWeak: true, score: patch.score ?? ind.score }, required: true });
      else if (patch.isWeak === false) add({ type: "success", message: "أُلغي تحديد الضعف" });
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(null);
    }
  };

  const step = async (ind: Ind, body: object, ok?: () => void) => {
    if (!ind.itemId) return;
    setBusy(ind.indicatorId);
    try {
      const d = await call(`/api/self-assessment/items/${ind.itemId}`, "POST", body);
      add({ type: "success", message: d.message });
      ok?.();
      await load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (action: "submit" | "reopen") => {
    if (!data) return;
    setConfirmSubmit(false);
    try {
      const d = await call("/api/self-assessment/submit", "POST", { schoolId: data.school.id, year: data.year, action });
      add({ type: "success", message: d.message });
      await load();
    } catch (e: any) {
      add({ type: "error", message: e.data?.blockers?.join("، ") || e.message });
    }
  };

  const match = useCallback((i: Ind) => {
    const t = q.trim();
    if (t && !i.title.includes(t) && !i.code.includes(t)) return false;
    switch (filter) {
      case "todo": return i.score == null;
      case "weak": return i.isWeak;
      case "NEEDS_PLAN": return i.status === "NEEDS_PLAN";
      case "active": return i.status === "PLANNED" || i.status === "IN_PROGRESS";
      case "IMPROVED": return i.status === "IMPROVED";
      case "VERIFIED": return i.status === "VERIFIED";
      case "overdue": return i.overdue;
      default: return true;
    }
  }, [q, filter]);

  const visible = useMemo(() => (data?.criteria ?? []).map((c) => ({ ...c, subs: c.subs.map((s) => ({ ...s, indicators: s.indicators.filter(match) })).filter((s) => s.indicators.length) })).filter((c) => c.subs.length), [data, match]);
  const filtering = filter !== "all" || !!q.trim();

  if (!user) return <div className="skeleton h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <PageHeader icon={ClipboardCheck} title="استمارة التقييم الذاتي"
        subtitle={data ? `${data.school.name} — العام الدراسي \u2066${data.year}\u2069` : "قيّم مؤشرات مدرستك، حدّد نقاط الضعف، وضع خطة لكل منها، ثم حدّث حالتها حتى تعتمد الإدارة التحسّن"} />

      {!isSchool && (
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <label className="text-[12.5px] text-gray-600" htmlFor="sa-school">المدرسة:</label>
          <select id="sa-school" className="input w-auto min-w-[260px] flex-1 sm:flex-none" value={schoolId} onChange={(e) => nav({ schoolId: e.target.value })}>
            <option value="">اختر مدرسة لعرض استمارتها…</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.code}</option>)}
          </select>
        </div>
      )}

      {error && <div className="card p-6 text-center text-[13px] text-danger">{error}</div>}
      {!data && !error && (isSchool || schoolId) && <div className="skeleton h-64 rounded-2xl" />}
      {!isSchool && !schoolId && <div className="card p-10 text-center text-[13px] text-gray-500">اختر مدرسة، أو افتح «متابعة الجودة» لرؤية كل المدارس.</div>}

      {data && (
        <>
          <StatusBanner data={data} onSubmit={() => setConfirmSubmit(true)} onReopen={() => submit("reopen")} onYear={(y) => nav({ year: y })} />
          <SummaryCards s={data.summary} onFilter={setFilter} />

          <div className="card flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="input ps-9" placeholder="ابحث في المؤشرات…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في المؤشرات" />
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="تصفية المؤشرات">
              {FILTERS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={`rounded-full border px-3 py-1 text-[12px] transition ${filter === k ? "border-navy bg-navy text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{l}</button>
              ))}
            </div>
          </div>

          {visible.length === 0 && <div className="card p-8 text-center text-[13px] text-gray-400">لا مؤشرات مطابقة.</div>}
          <div className="space-y-3">
            {visible.map((c) => {
              const isOpen = filtering || open.has(c.id);
              const full = data.criteria.find((x) => x.id === c.id)!;
              const all = full.subs.flatMap((s) => s.indicators);
              const weak = all.filter((i) => i.isWeak && i.status !== "VERIFIED").length;
              return (
                <section key={c.id} className="card overflow-hidden">
                  <button type="button" className="flex w-full items-center gap-3 p-4 text-start hover:bg-gray-50/60" aria-expanded={isOpen}
                    onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}>
                    <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-navy/5 px-2 font-heading text-[13px] font-bold text-navy">{c.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading text-[14.5px] font-bold text-navy">{c.title}</span>
                      <span className="mt-0.5 block text-[11.5px] text-gray-500">
                        {all.filter((i) => i.score != null).length}/{all.length} مقيّم{full.percent != null ? ` · تحقق ${full.percent}%` : ""}{weak ? ` · ${weak} نقاط ضعف مفتوحة` : ""}
                      </span>
                    </span>
                    {full.achieved && <span className="hidden items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" /> معيار محقَّق</span>}
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      {c.subs.map((s) => (
                        <div key={s.id}>
                          <p className="bg-gray-50/80 px-4 py-2 text-[12px] font-semibold text-gray-600">{s.code} — {s.title}</p>
                          <ul className="divide-y divide-gray-100">
                            {s.indicators.map((i) => (
                              <IndicatorRow key={i.indicatorId} ind={i} data={data} busy={busy === i.indicatorId}
                                onRate={(score) => rate(i, { score })} onWeak={(v) => rate(i, { isWeak: v })}
                                onPlan={() => setPlanFor({ ind: i, required: i.status === "NEEDS_PLAN" })} onStart={() => step(i, { action: "start" })}
                                onImprove={() => setImproveFor(i)} onReview={(kind) => setReviewFor({ ind: i, kind })} onHistory={() => setHistoryFor(i)} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {planFor && data && (
        <PlanModal ind={planFor.ind} required={planFor.required} onClose={() => setPlanFor(null)}
          onSave={(body) => step(planFor.ind, { action: "plan", ...body }, () => setPlanFor(null))} />
      )}
      {improveFor && data && (
        <ImproveModal ind={improveFor} scale={data.scale} onClose={() => setImproveFor(null)}
          onSave={(body) => step(improveFor, { action: "improve", ...body }, () => setImproveFor(null))} />
      )}
      {reviewFor && (
        <ReviewModal ind={reviewFor.ind} kind={reviewFor.kind} onClose={() => setReviewFor(null)}
          onSave={(note) => step(reviewFor.ind, { action: reviewFor.kind, note }, () => setReviewFor(null))} />
      )}
      {historyFor && <HistoryModal ind={historyFor} onClose={() => setHistoryFor(null)} />}
      <ConfirmDialog open={confirmSubmit} tone="primary" title="إرسال الاستمارة للإدارة"
        message="بعد الإرسال يُقفل التقييم، وتستمر في تحديث حالة خطط التحسين (بدء التنفيذ، ثم إعلان التحسّن) حتى تعتمدها الإدارة."
        confirmLabel="إرسال" onConfirm={() => submit("submit")} onClose={() => setConfirmSubmit(false)} />
    </div>
  );
}

function StatusBanner({ data, onSubmit, onReopen, onYear }: { data: Data; onSubmit: () => void; onReopen: () => void; onYear: (y: string) => void }) {
  const submitted = data.assessment?.status === "SUBMITTED";
  return (
    <div className={`card flex flex-wrap items-center gap-3 p-4 ${submitted ? "border-success/30" : ""}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${submitted ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
        {submitted ? <Lock className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="font-heading text-[14px] font-bold text-navy">
          {!data.assessment ? "لم تبدأ المدرسة التعبئة بعد" : submitted ? `مُرسلة للإدارة ${data.assessment.submittedAt ? `في ${fmtDate(data.assessment.submittedAt)}` : ""}` : "مسودة — قيد التعبئة"}
        </p>
        {data.canFill && !submitted && data.blockers.length > 0 && <p className="text-[12px] text-gray-500">قبل الإرسال: {data.blockers.join(" · ")}</p>}
        {submitted && data.canFill && <p className="text-[12px] text-gray-500">التقييم مقفل. تابع خطط التحسين وحدّث حالتها.</p>}
      </div>
      <select className="input w-auto" value={data.year} onChange={(e) => onYear(e.target.value)} aria-label="العام الدراسي">
        {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      {data.canFill && !submitted && (
        <button className="btn btn-primary btn-sm" disabled={data.blockers.length > 0} onClick={onSubmit} title={data.blockers.join("، ")}><Send className="h-4 w-4" /> إرسال للإدارة</button>
      )}
      {data.canReview && submitted && <button className="btn btn-ghost btn-sm" onClick={onReopen}><Unlock className="h-4 w-4" /> إعادة فتح للمدرسة</button>}
    </div>
  );
}

function SummaryCards({ s, onFilter }: { s: Summary; onFilter: (f: Filter) => void }) {
  const pct = s.total ? Math.round((s.rated / s.total) * 100) : 0;
  const cards: [string, number | string, string, Filter][] = [
    ["نسبة التحقق", s.percent != null ? `${s.percent}%` : "—", "text-navy", "all"],
    ["نقاط الضعف", s.weak, "text-danger", "weak"],
    ["بانتظار خطة", s.needsPlan, "text-danger", "NEEDS_PLAN"],
    ["قيد المعالجة", s.planned + s.inProgress, "text-sky-700", "active"],
    ["بانتظار الاعتماد", s.improved, "text-emerald-700", "IMPROVED"],
    ["تحسّن معتمد", s.verified, "text-success", "VERIFIED"],
    ["متأخر عن موعده", s.overdue, "text-warning", "overdue"],
  ];
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px]"><span className="text-gray-600">اكتمال التقييم: {s.rated} من {s.total} مؤشراً</span><b className="text-navy">{pct}%</b></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="اكتمال التقييم">
          <div className="h-full rounded-full bg-turquoise transition-all" style={{ width: `${pct}%` }} />
        </div>
        {s.achievedCriteria > 0 && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-success"><Sparkles className="h-3.5 w-3.5" /> {s.achievedCriteria} معايير محقَّقة بالكامل</p>}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map(([l, v, c, f]) => (
          <button key={l} type="button" onClick={() => onFilter(f)} className="card p-3 text-start transition hover:shadow-md">
            <p className="text-[11px] text-gray-600">{l}</p>
            <p className={`font-heading text-xl font-bold ${c}`}>{v}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function IndicatorRow({ ind, data, busy, onRate, onWeak, onPlan, onStart, onImprove, onReview, onHistory }: {
  ind: Ind; data: Data; busy: boolean; onRate: (s: number) => void; onWeak: (v: boolean) => void; onPlan: () => void; onStart: () => void; onImprove: () => void;
  onReview: (k: "verify" | "return") => void; onHistory: () => void;
}) {
  const st = STATUS[ind.status];
  const canRate = data.canFill && !data.locked;
  const inCycle = ["IN_PROGRESS", "IMPROVED", "VERIFIED"].includes(ind.status);
  return (
    <li className={`border-s-4 px-4 py-3 ${st.bar} ${ind.status === "NEEDS_PLAN" ? "bg-danger/[0.03]" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-[220px] flex-1">
          <p className="text-[13px] leading-relaxed text-navy"><b className="me-1 font-mono text-[11.5px] text-gray-500">{ind.code}</b>{ind.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {st.label && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.chip}`}>{st.label}</span>}
            {ind.overdue && <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"><AlertTriangle className="h-3 w-3" /> تجاوز موعد الخطة</span>}
            {ind.baselineScore != null && ind.score != null && ind.score > ind.baselineScore && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success"><TrendingUp className="h-3 w-3" /> {label(data, ind.baselineScore)} ← {label(data, ind.score)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`تقدير المؤشر ${ind.code}`}>
          {data.scale.map((r, idx) => {
            const on = ind.score === r.score;
            return (
              <button key={r.key} type="button" role="radio" aria-checked={on} disabled={!canRate || busy || inCycle} onClick={() => onRate(r.score)} title={r.label_ar}
                className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] transition disabled:cursor-not-allowed ${on ? `${SCORE_BTN[Math.min(idx, 3)]} border-transparent` : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-60"}`}>
                {r.label_ar}
              </button>
            );
          })}
          {canRate && !inCycle && (
            <button type="button" disabled={busy} onClick={() => onWeak(!ind.isWeak)} aria-pressed={ind.isWeak}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition ${ind.isWeak ? "border-danger bg-danger/10 text-danger" : "border-gray-200 text-gray-500 hover:border-danger/40 hover:text-danger"}`}
              title="ضع إشارة الضعف على هذا المؤشر">
              <Flag className="h-3.5 w-3.5" /> {ind.isWeak ? "نقطة ضعف" : "ضعف"}
            </button>
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
      </div>

      {ind.isWeak && (
        <div className="mt-2.5 rounded-xl bg-gray-50 p-3 text-[12px]">
          {ind.plan.action ? (
            <div className="space-y-1 text-gray-700">
              <p><b className="text-navy">خطة التحسين:</b> {ind.plan.action}</p>
              <p className="text-gray-500">المسؤول: {ind.plan.responsible} · الموعد: {ind.plan.dueDate}{ind.plan.successMeasure ? ` · مؤشر النجاح: ${ind.plan.successMeasure}` : ""}</p>
              {ind.progressNote && <p><b className="text-emerald-700">ما نُفّذ:</b> {ind.progressNote}</p>}
              {ind.reviewNote && <p><b className={ind.status === "VERIFIED" ? "text-success" : "text-warning"}>ملاحظة الإدارة:</b> {ind.reviewNote}</p>}
              {ind.verifiedAt && <p className="text-success">اعتمده {ind.verifiedBy ?? "—"} في {fmtDate(ind.verifiedAt)}</p>}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 font-semibold text-danger"><AlertTriangle className="h-3.5 w-3.5" /> هذا المؤشر ضعيف ويحتاج خطة تحسين.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.canFill && ["NEEDS_PLAN", "PLANNED", "IN_PROGRESS"].includes(ind.status) && (
              <button className={`btn btn-sm ${ind.status === "NEEDS_PLAN" ? "btn-primary" : "btn-ghost"}`} onClick={onPlan}><Target className="h-3.5 w-3.5" /> {ind.plan.action ? "تعديل الخطة" : "وضع خطة التحسين"}</button>
            )}
            {data.canFill && ind.status === "PLANNED" && <button className="btn btn-ghost btn-sm" onClick={onStart}><PlayCircle className="h-3.5 w-3.5" /> بدأنا التنفيذ</button>}
            {data.canFill && ["PLANNED", "IN_PROGRESS"].includes(ind.status) && <button className="btn btn-primary btn-sm" onClick={onImprove}><TrendingUp className="h-3.5 w-3.5" /> تمّت المعالجة وتحسّن</button>}
            {data.canReview && ind.status === "IMPROVED" && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => onReview("verify")}><CheckCircle2 className="h-3.5 w-3.5" /> اعتماد التحسّن</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onReview("return")}><RotateCcw className="h-3.5 w-3.5" /> إعادة للمتابعة</button>
              </>
            )}
            {data.canReview && ind.status === "VERIFIED" && <button className="btn btn-ghost btn-sm" onClick={() => onReview("return")}><RotateCcw className="h-3.5 w-3.5" /> سحب الاعتماد</button>}
            {ind.itemId && <button className="btn btn-ghost btn-sm" onClick={onHistory}><History className="h-3.5 w-3.5" /> تاريخ المؤشر</button>}
          </div>
        </div>
      )}
      {!ind.isWeak && ind.itemId && ind.score != null && (
        <button className="mt-1 text-[11px] text-gray-400 hover:text-navy" onClick={onHistory}>تاريخ المؤشر</button>
      )}
    </li>
  );
}

const label = (d: Data, score: number) => d.scale.find((r) => r.score === score)?.label_ar ?? String(score);

function PlanModal({ ind, required, onClose, onSave }: { ind: Ind; required: boolean; onClose: () => void; onSave: (b: object) => Promise<void> }) {
  const [f, setF] = useState({ planAction: ind.plan.action ?? "", responsible: ind.plan.responsible ?? "", dueDate: ind.plan.dueDate ?? "", successMeasure: ind.plan.successMeasure ?? "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={required ? "مطلوب: خطة تحسين لنقطة الضعف" : "خطة التحسين"} description={`${ind.code} — ${ind.title}`} width="md">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(f); setBusy(false); }}>
        {required && <p className="rounded-lg bg-danger/5 p-2.5 text-[12.5px] text-danger">حدّدتَ هذا المؤشر نقطة ضعف. ضع الإجراء الذي ستعالجه به، ولن تُرسل الاستمارة قبل وجود خطة لكل نقطة ضعف.</p>}
        <div><label className="label">الإجراء المطلوب لمعالجة الضعف *</label><textarea className="input min-h-[90px]" required minLength={10} value={f.planAction} onChange={(e) => setF({ ...f, planAction: e.target.value })} placeholder="مثال: عقد ورشتين للمعلمين حول إعداد الخطط الفصلية ومتابعة تطبيقها أسبوعياً" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">المسؤول عن التنفيذ *</label><input className="input" required value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} placeholder="مثال: وكيل المدرسة" /></div>
          <div><label className="label">موعد الإنجاز *</label><input className="input" type="date" required value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
        </div>
        <div><label className="label">كيف نعرف أن الضعف عولج؟ (مؤشر النجاح)</label><input className="input" value={f.successMeasure} onChange={(e) => setF({ ...f, successMeasure: e.target.value })} placeholder="مثال: 100% من المعلمين لديهم خطط فصلية معتمدة" /></div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{required ? "لاحقاً" : "إلغاء"}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ الخطة</button>
        </div>
      </form>
    </Modal>
  );
}

function ImproveModal({ ind, scale, onClose, onSave }: { ind: Ind; scale: Data["scale"]; onClose: () => void; onSave: (b: object) => Promise<void> }) {
  const higher = scale.filter((r) => r.score > (ind.score ?? -1));
  const [note, setNote] = useState("");
  const [score, setScore] = useState<number>(higher[higher.length - 1]?.score ?? 0);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="إعلان معالجة الضعف" description={`${ind.code} — ${ind.title}`} width="md">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave({ note, newScore: score }); setBusy(false); }}>
        <div><label className="label">ما الذي نُفّذ فعلياً؟ *</label><textarea className="input min-h-[90px]" required minLength={10} value={note} onChange={(e) => setNote(e.target.value)} placeholder="اذكر ما تم وأين تجد الإدارة الشواهد (محاضر، صور، سجلات…)" /></div>
        <div>
          <label className="label">التقدير بعد المعالجة *</label>
          <div className="flex flex-wrap gap-1.5">
            {higher.map((r) => (
              <button key={r.key} type="button" onClick={() => setScore(r.score)} className={`rounded-lg border px-3 py-1.5 text-[12px] ${score === r.score ? "border-success bg-success text-white" : "border-gray-200 text-gray-600"}`}>{r.label_ar}</button>
            ))}
          </div>
        </div>
        <p className="text-[11.5px] text-gray-500">سيظهر المؤشر باللون الأخضر الفاتح حتى تعتمده الإدارة، ثم يصبح أخضر ويُحسب في شهادات التكريم.</p>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !higher.length}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إرسال للاعتماد</button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewModal({ ind, kind, onClose, onSave }: { ind: Ind; kind: "verify" | "return"; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={kind === "verify" ? "اعتماد التحسّن" : "إعادة المؤشر للمتابعة"} description={`${ind.code} — ${ind.title}`} width="sm">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(note); setBusy(false); }}>
        {ind.progressNote && <p className="rounded-lg bg-gray-50 p-2.5 text-[12.5px] text-gray-700"><b>ما أعلنته المدرسة:</b> {ind.progressNote}</p>}
        <div><label className="label">{kind === "verify" ? "ملاحظة (اختياري)" : "سبب الإعادة *"}</label><textarea className="input min-h-[80px]" required={kind === "return"} minLength={kind === "return" ? 5 : 0} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "verify" ? "مثال: تحقق المشرف من الشواهد في زيارة ميدانية" : "ما الذي ينقص المعالجة؟"} /></div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {kind === "verify" ? "اعتماد" : "إعادة"}</button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({ ind, onClose }: { ind: Ind; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    fetch(`/api/self-assessment/items/${ind.itemId}`, { credentials: "include" }).then((r) => r.json()).then((d) => setRows(d.history ?? [])).catch(() => setRows([]));
  }, [ind.itemId]);
  const DOT: Record<string, string> = { WEAK_FLAGGED: "bg-danger", PLAN_SET: "bg-warning", PLAN_UPDATED: "bg-warning", STARTED: "bg-sky-500", IMPROVED: "bg-emerald-400", VERIFIED: "bg-success", RETURNED: "bg-orange-500" };
  return (
    <Modal open onClose={onClose} title="تاريخ المؤشر" description={`${ind.code} — ${ind.title}`} width="md">
      {rows === null ? <div className="skeleton h-32 rounded-xl" /> : rows.length === 0 ? <p className="py-6 text-center text-gray-400">لا سجل بعد.</p> : (
        <ol className="relative space-y-4 border-s-2 border-gray-100 ps-5">
          {rows.map((r, i) => (
            <li key={i} className="relative">
              <span className={`absolute -start-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${DOT[r.event] ?? "bg-gray-300"}`} />
              <p className="text-[13px] font-semibold text-navy">{r.label}</p>
              <p className="text-[11.5px] text-gray-500">{r.user_name ?? "—"} · {fmtDate(r.created_at, true)}</p>
              {r.note && <p className="mt-1 text-[12px] text-gray-700">{r.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
