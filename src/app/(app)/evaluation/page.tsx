"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ClipboardList, CloudOff, CloudUpload, FastForward, Lock, RefreshCw, Search, Send, Undo2, X,
} from "lucide-react";
import { Alert, EmptyState, Modal, PageHeader } from "@/components/ui";
import { ConfirmDialog, ScoreBar, ScoreRing, StatusBadge } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { IndicatorCard, type Indicator, type Rating } from "@/components/evaluation/indicator-card";
import { EvidenceDrawer } from "@/components/evaluation/evidence-drawer";
import {
  countConflicts, countPending, deleteLocalScore, flushPending, getLocalScores, saveLocalScore, type LocalScore,
} from "@/lib/offline/drafts";
import { RATING_LABEL, SCORE_COLOR, VISIT_STATUS, fmtDate, fmtPercent, scoreTone } from "@/lib/labels";

type SubCriterion = { subCriterionId: string; code: string; title: string; weight: number; achievementPercent: number | null; contribution: number | null; completionPercent: number; evaluatedIndicators: number; totalIndicators: number; indicators: Indicator[] };
type Criterion = { criterionId: string; code: string; title: string; weight: number; achievementPercent: number | null; contribution: number | null; completionPercent: number; subCriteria: SubCriterion[] };
type Payload = {
  visit: { id: string; school_id: string; school_name: string; inspector_name: string; status: string; completion: number; visit_date: string | null; locked: boolean; strengths: string | null; gaps: string | null };
  maxScore: number; ratingScale: Rating[]; criteria: Criterion[]; weightErrors: string[];
  result: { totalScore: number | null; evaluatedPartPercent: number | null; completionPercent: number; totalIndicators: number; evaluatedIndicators: number; notEvaluatedIndicators: number; reportState: "COMPLETE" | "DRAFT_INCOMPLETE"; warnings: string[] };
};
type Filter = "all" | "todo" | "done" | "weak" | "noEvidence";
type Patch = { status?: "EVALUATED" | "NOT_EVALUATED"; score?: number | null; notes?: string | null; methods?: string[] };

export default function EvaluationPage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><EvaluationInner /></Suspense>;
}

function EvaluationInner() {
  const { user } = useSession();
  const { add } = useToast();
  const router = useRouter();
  const sp = useSearchParams();

  const [visits, setVisits] = useState<any[]>([]);
  const [visitId, setVisitId] = useState<string>(sp.get("visitId") ?? "");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [activeCrit, setActiveCrit] = useState<string>("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [drafts, setDrafts] = useState<Record<string, LocalScore>>({});
  const [pending, setPending] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [evidenceFor, setEvidenceFor] = useState<Indicator | null>(null);
  const [historyFor, setHistoryFor] = useState<Indicator | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [reasonAsk, setReasonAsk] = useState<{ ind: Indicator; patch: Patch } | null>(null);
  const [conflict, setConflict] = useState<{ ind: Indicator; patch: Patch; server: any } | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [strengths, setStrengths] = useState("");
  const [gaps, setGaps] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const dataRef = useRef<Payload | null>(null);
  dataRef.current = data;

  const canEvaluate = !!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user.roleKey);
  const canReview = !!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user.roleKey);

  /* ---------- الزيارات ---------- */
  useEffect(() => {
    fetch("/api/visits?limit=100", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { visits: [] }))
      .then((d) => {
        const list = (d.visits ?? []).filter((v: any) => v.status !== "CANCELLED");
        setVisits(list);
        if (!visitId) {
          const pick = list.find((v: any) => v.status === "IN_PROGRESS") ?? list.find((v: any) => v.status === "SCHEDULED") ?? list[0];
          if (pick) setVisitId(pick.id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- التحميل ---------- */
  const load = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/evaluations/visit/${id}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      const local = await getLocalScores(id);
      setDrafts(local);
      // دمج المسودات المحلية فوق نسخة الخادم لتبقى مرئية للمستخدم
      if (Object.keys(local).length) {
        for (const c of json.criteria) for (const sc of c.subCriteria) for (const ind of sc.indicators) {
          const l = local[ind.indicatorId];
          if (l) { ind.status = l.status; ind.score = l.score; if (l.notes !== undefined) ind.notes = l.notes; if (l.methods) ind.methods = l.methods; ind.draft = l.state ?? "pending"; }
        }
      }
      setData(json);
      setActiveCrit((cur) => cur || json.criteria[0]?.criterionId || "");
      setPending(await countPending(id));
      setConflictCount(await countConflicts(id));
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل التقييم" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [add]);

  useEffect(() => { if (visitId) { setData(null); setActiveCrit(""); void load(visitId); } }, [visitId, load]);

  /* ---------- الاتصال والمزامنة ---------- */
  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const { synced, conflicts } = await flushPending();
      if (synced) add({ type: "success", message: `تمت مزامنة ${synced} تعديل محفوظ محلياً` });
      if (conflicts) add({ type: "error", message: `${conflicts} تعديل متعارض مع نسخة أحدث على الخادم — راجعه قبل المتابعة` });
      if (visitId) await load(visitId, true);
    } finally { setSyncing(false); }
  }, [add, load, visitId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void syncNow(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [syncNow]);

  /* ---------- الحفظ ---------- */
  const mutateLocal = (indicatorId: string, fn: (i: Indicator) => void) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      for (const c of next.criteria) for (const sc of c.subCriteria) for (const i of sc.indicators) if (i.indicatorId === indicatorId) fn(i);
      return next;
    });
  };

  const send = useCallback(async (ind: Indicator, patch: Patch, reason?: string, force?: { version: number }) => {
    const cur = dataRef.current;
    if (!cur) return;
    const full = {
      indicatorId: ind.indicatorId,
      status: patch.status ?? ind.status,
      score: patch.status === "NOT_EVALUATED" ? null : patch.score !== undefined ? patch.score : ind.score,
      notes: patch.notes !== undefined ? patch.notes : ind.notes,
      methods: patch.methods ?? ind.methods,
      reason: reason || undefined,
      expectedVersion: force ? force.version : ind.version > 0 ? ind.version : undefined,
    };
    setSaving((s) => new Set(s).add(ind.indicatorId));
    // تحديث تفاؤلي
    mutateLocal(ind.indicatorId, (i) => { i.status = full.status as any; i.score = full.score as any; i.notes = full.notes as any; i.methods = full.methods; });
    try {
      const res = await fetch(`/api/evaluations/visit/${cur.visit.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(full) });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) { setConflict({ ind, patch, server: json.server }); await load(cur.visit.id, true); return; }
      if (res.status === 422 && json.needReason) { await load(cur.visit.id, true); setReasonAsk({ ind, patch }); return; }
      if (res.status === 423) { add({ type: "error", message: json.message }); await load(cur.visit.id, true); return; }
      if (!res.ok) throw new Error(json.message || "تعذّر حفظ الدرجة");
      await deleteLocalScore(cur.visit.id, ind.indicatorId);
      await load(cur.visit.id, true);
    } catch (e: any) {
      const isNetwork = e instanceof TypeError || !navigator.onLine;
      if (isNetwork) {
        await saveLocalScore({ visitId: cur.visit.id, indicatorId: ind.indicatorId, status: full.status as any, score: full.score as any, notes: full.notes, methods: full.methods, reason: reason ?? null, baseVersion: ind.version > 0 ? ind.version : null });
        mutateLocal(ind.indicatorId, (i) => { i.draft = "pending"; });
        setPending(await countPending(cur.visit.id));
        add({ type: "info", message: "لا اتصال — حُفظ التعديل على هذا الجهاز وسيُزامَن عند عودة الشبكة." });
      } else {
        add({ type: "error", message: e.message || "تعذّر الحفظ" });
        await load(cur.visit.id, true);
      }
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(ind.indicatorId); return n; });
    }
  }, [add, load]);

  /** أي تغيير على درجة سبق تقييمها يتطلب سبباً. */
  const requestRate = useCallback((ind: Indicator, status: "EVALUATED" | "NOT_EVALUATED", score: number | null) => {
    if (ind.status === "EVALUATED" && (status !== "EVALUATED" || ind.score !== score)) setReasonAsk({ ind, patch: { status, score } });
    else if (!(ind.status === "NOT_EVALUATED" && status === "NOT_EVALUATED")) void send(ind, { status, score });
  }, [send]);
  const onNotes = useCallback((ind: Indicator, notes: string) => void send(ind, { notes: notes.trim() || null }), [send]);
  const onMethods = useCallback((ind: Indicator, methods: string[]) => void send(ind, { methods }), [send]);
  const openHistory = useCallback(async (ind: Indicator) => {
    setHistoryFor(ind); setHistory(null);
    const r = await fetch(`/api/evaluations/visit/${visitId}?history=${ind.indicatorId}`, { credentials: "include" });
    const d = await r.json();
    setHistory(d.history ?? []);
  }, [visitId]);

  /* ---------- إجراءات الزيارة ---------- */
  const visitAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!data) return;
    setBusyAction(true);
    try {
      if (action === "submit" && data.visit.status === "SCHEDULED") {
        await fetch(`/api/visits/${visitId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      }
      const r = await fetch(`/api/visits/${visitId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      setSubmitOpen(false); setReturnOpen(false); setApproveOpen(false);
      await load(visitId, true);
      setVisits((vs) => vs.map((v) => (v.id === visitId ? { ...v, status: d.status } : v)));
      if (action === "submit" || action === "approve") router.push(`/reports?visitId=${visitId}`);
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally { setBusyAction(false); }
  };

  /* ---------- الاشتقاقات ---------- */
  const flat = useMemo(() => (data ? data.criteria.flatMap((c) => c.subCriteria.flatMap((s) => s.indicators.map((i) => ({ i, c, s })))) : []), [data]);
  const matches = (i: Indicator) => {
    if (query.trim() && !(`${i.code} ${i.title}`.includes(query.trim()))) return false;
    if (filter === "todo") return i.status === "NOT_EVALUATED";
    if (filter === "done") return i.status === "EVALUATED";
    if (filter === "weak") return i.status === "EVALUATED" && (i.score ?? 9) <= 1;
    if (filter === "noEvidence") return i.status === "EVALUATED" && i.evidenceTotal === 0;
    return true;
  };
  const crit = data?.criteria.find((c) => c.criterionId === activeCrit) ?? data?.criteria[0];
  const searching = query.trim() !== "" || filter !== "all";
  const searchResults = useMemo(() => (searching ? flat.filter((x) => matches(x.i)) : []), [flat, query, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = () => {
    const next = flat.find((x) => x.i.status === "NOT_EVALUATED");
    if (!next) return add({ type: "success", message: "كل المؤشرات مقيَّمة" });
    setQuery(""); setFilter("all"); setActiveCrit(next.c.criterionId);
    setTimeout(() => document.getElementById(`ind-${next.i.indicatorId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    setTimeout(() => document.getElementById(`ind-${next.i.indicatorId}`)?.focus({ preventScroll: true }), 400);
  };

  const v = data?.visit;
  const locked = !!v?.locked || !canEvaluate;
  const mine = user?.roleKey === "INSPECTOR";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="التقييم الميداني"
        subtitle="التقييم الميداني الذي يجريه المفتش أثناء الزيارة — 109 مؤشراً في 7 معايير. يُحفظ كل تغيير تلقائياً مع سجل بمن عدّل ومتى ولماذا."
        actions={
          <>
            {(!online || pending > 0) && (
              <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium ${online ? "border-warning/30 bg-warning-soft text-warning" : "border-gray-300 bg-gray-100 text-gray-600"}`}>
                {online ? <CloudUpload className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
                {online ? `${pending} تعديل بانتظار المزامنة` : "غير متصل — الحفظ على الجهاز"}
                {online && <button onClick={() => void syncNow()} disabled={syncing} aria-label="مزامنة"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /></button>}
              </span>
            )}
            <select value={visitId} onChange={(e) => setVisitId(e.target.value)} className="input min-w-[260px] !py-2" aria-label="الزيارة">
              {visits.length === 0 && <option value="">لا توجد زيارات</option>}
              {visits.map((x) => <option key={x.id} value={x.id}>{x.school_name} — {VISIT_STATUS[x.status]?.label ?? x.status} — {fmtDate(x.visit_date)}</option>)}
            </select>
          </>
        }
      />

      {!visitId && <div className="card"><EmptyState icon={ClipboardList} title="لا توجد زيارات متاحة" description="أنشئ زيارة ميدانية أولاً ثم ابدأ التقييم." action={canEvaluate ? <Link href="/visits?new=1" className="btn btn-primary btn-sm">جدولة زيارة</Link> : undefined} /></div>}
      {loading && !data && <div className="space-y-3"><div className="skeleton h-36 rounded-3xl" /><div className="skeleton h-96 rounded-2xl" /></div>}

      {data && v && (
        <>
          {/* ملخص الزيارة */}
          <section className="relative overflow-hidden rounded-3xl bg-aurora p-5 text-white shadow-lg sm:p-6">
            <div className="pattern-geo pointer-events-none absolute inset-0 opacity-[0.07]" />
            <div className="relative grid items-center gap-5 md:grid-cols-[auto_1fr_auto]">
              <ScoreRing value={data.result.evaluatedPartPercent} size={112} stroke={10} label="التحقق" sub="على المقيَّم" dark />
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-xl font-bold sm:text-2xl">{v.school_name}</h2>
                  <StatusBadge map={VISIT_STATUS} value={v.status} />
                  {v.locked && <span className="badge badge-neutral"><Lock className="h-3 w-3" /> للقراءة فقط</span>}
                </div>
                <p className="text-[12.5px] text-white/70">المفتش: {v.inspector_name} · {fmtDate(v.visit_date)}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {([["الدرجة الكلية", data.result.totalScore == null ? "—" : `${data.result.totalScore} / 100`], ["المقيَّم", `${data.result.evaluatedIndicators}/${data.result.totalIndicators}`], ["الإكمال", `${Math.round(data.result.completionPercent)}%`]] as [string, string][]).map(([l, val]) => (
                    <div key={l} className="rounded-xl bg-white/10 px-3 py-2"><p className="text-[10.5px] text-white/60">{l}</p><p className="font-heading text-[17px] font-bold"><bdi dir="ltr">{val}</bdi></p></div>
                  ))}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gold-bright transition-all duration-700" style={{ width: `${data.result.completionPercent}%` }} /></div>
              </div>
              <div className="flex flex-wrap gap-2 md:flex-col">
                <button onClick={goNext} className="btn btn-gold btn-sm justify-center"><FastForward className="h-3.5 w-3.5" /> التالي غير المقيَّم</button>
                {canEvaluate && !v.locked && (!mine || true) && <button onClick={() => { setStrengths(v.strengths ?? ""); setGaps(v.gaps ?? ""); setSubmitOpen(true); }} className="btn btn-sm justify-center border border-white/25 bg-white/10 text-white hover:bg-white/20"><Send className="h-3.5 w-3.5" /> تقديم للمراجعة</button>}
                {canReview && v.status === "SUBMITTED" && (
                  <>
                    <button onClick={() => setApproveOpen(true)} className="btn btn-sm justify-center bg-emerald text-white hover:brightness-110"><CheckCircle2 className="h-3.5 w-3.5" /> اعتماد</button>
                    <button onClick={() => setReturnOpen(true)} className="btn btn-sm justify-center border border-white/25 bg-white/10 text-white hover:bg-white/20"><Undo2 className="h-3.5 w-3.5" /> إعادة للتعديل</button>
                  </>
                )}
                {canReview && v.status === "COMPLETED" && <button onClick={() => setReturnOpen(true)} className="btn btn-sm justify-center border border-white/25 bg-white/10 text-white hover:bg-white/20"><Undo2 className="h-3.5 w-3.5" /> إعادة فتح</button>}
              </div>
            </div>
          </section>

          {conflictCount > 0 && <Alert tone="danger" title="تعديلات متعارضة">لديك {conflictCount} تعديل محفوظ محلياً يتعارض مع نسخة أحدث على الخادم. افتح المؤشرات المعلَّمة «تعارض» واختر النسخة الصحيحة.</Alert>}
          {data.result.warnings.length > 0 && !v.locked && <Alert tone="warning">{data.result.warnings[data.result.warnings.length - 1]}</Alert>}
          {data.weightErrors.length > 0 && <Alert tone="danger" title="خطأ في أوزان الاستمارة">{data.weightErrors.join(" · ")}</Alert>}
          {!canEvaluate && <Alert tone="info">عرض للقراءة فقط: التقييم الميداني مقصور على المفتش والإدارة.</Alert>}

          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            {/* ===== المتصفح الجانبي ===== */}
            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div className="card p-3">
                <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="input pr-9 !py-2 text-[13px]" placeholder="بحث بالرمز أو النص…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث في المؤشرات" />{query && <button className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setQuery("")} aria-label="مسح"><X className="h-4 w-4" /></button>}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([["all", "الكل"], ["todo", "لم يُقيَّم"], ["done", "مقيَّم"], ["weak", "ضعيف"], ["noEvidence", "بلا دليل"]] as [Filter, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${filter === k ? "border-navy bg-navy text-white" : "border-gray-200 text-gray-600 hover:border-navy/40"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <nav className="card divide-y divide-gray-100 overflow-hidden" aria-label="المعايير">
                {data.criteria.map((c) => {
                  const done = c.subCriteria.reduce((a, s) => a + s.evaluatedIndicators, 0);
                  const total = c.subCriteria.reduce((a, s) => a + s.totalIndicators, 0);
                  const on = !searching && crit?.criterionId === c.criterionId;
                  return (
                    <button key={c.criterionId} onClick={() => { setQuery(""); setFilter("all"); setActiveCrit(c.criterionId); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`flex w-full items-center gap-3 px-3.5 py-3 text-right transition ${on ? "bg-turquoise-soft/60" : "hover:bg-gray-50"}`} aria-current={on ? "true" : undefined}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold ${on ? "bg-navy text-gold-bright" : "bg-gray-100 text-navy"}`}>{c.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-navy">{c.title}</span>
                        <span className="mt-1 flex items-center gap-2"><span className="flex-1"><ScoreBar value={c.completionPercent} height={4} /></span><span className="font-mono text-[10.5px] text-gray-500">{done}/{total}</span></span>
                      </span>
                      <span className="font-mono text-[12px] font-bold" style={{ color: SCORE_COLOR[scoreTone(c.achievementPercent)] }}>{c.achievementPercent == null ? "—" : fmtPercent(c.achievementPercent, 0)}</span>
                    </button>
                  );
                })}
              </nav>
              <details className="card p-3 text-[11.5px] leading-relaxed text-gray-600">
                <summary className="cursor-pointer font-semibold text-navy">كيف تُحسب الدرجة؟</summary>
                <ul className="mt-2 list-disc space-y-1 pr-4">
                  <li>نسبة المعيار الفرعي = متوسط المؤشرات المقيَّمة ÷ {data.maxScore} × 100</li>
                  <li>المساهمة = النسبة × وزن المعيار الفرعي ÷ 100</li>
                  <li>الدرجة الكلية = مجموع المساهمات من 100</li>
                  <li>«لم يُقيَّم» حالة منفصلة: لا تُحتسب صفراً ولا نجاحاً</li>
                  <li>اختصارات: 0..{data.maxScore} للتقدير، Delete لمسحه (بعد تحديد البطاقة)</li>
                </ul>
              </details>
            </aside>

            {/* ===== المؤشرات ===== */}
            <div className="min-w-0 space-y-5">
              {searching ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-gray-600">{searchResults.length} مؤشراً مطابقاً</p>
                  {searchResults.length === 0 && <div className="card"><EmptyState icon={Search} title="لا نتائج" /></div>}
                  {searchResults.slice(0, 60).map(({ i, c }) => (
                    <div key={i.indicatorId}><p className="mb-1 text-[11.5px] text-gray-500">المعيار {c.code}: {c.title}</p><IndicatorCard ind={i} scale={data.ratingScale} locked={locked} saving={saving.has(i.indicatorId)} onRate={requestRate} onNotes={onNotes} onMethods={onMethods} onEvidence={setEvidenceFor} onHistory={openHistory} /></div>
                  ))}
                </div>
              ) : crit && (
                <>
                  <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <h2 className="font-heading text-lg font-bold text-navy">المعيار {crit.code}: {crit.title}</h2>
                      <p className="text-[12px] text-gray-500">الوزن {crit.weight}% · المساهمة في الدرجة الكلية {crit.contribution ?? "—"}</p>
                    </div>
                    <span className="font-heading text-2xl font-bold" style={{ color: SCORE_COLOR[scoreTone(crit.achievementPercent)] }}>{crit.achievementPercent == null ? "لم يُقيَّم" : fmtPercent(crit.achievementPercent)}</span>
                  </div>
                  {crit.subCriteria.map((sc) => (
                    <section key={sc.subCriterionId} className="space-y-3">
                      {crit.subCriteria.length > 1 || sc.title !== crit.title ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                          <h3 className="flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><span className="rounded-lg bg-gold-soft px-2 py-0.5 font-mono text-[11.5px] text-[#7A6112]">{sc.code}</span>{sc.title}<span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-600">الوزن {sc.weight}%</span></h3>
                          <span className="text-[12px] text-gray-500">{sc.achievementPercent == null ? "لم يُقيَّم" : fmtPercent(sc.achievementPercent)} · {sc.evaluatedIndicators}/{sc.totalIndicators} · المساهمة {sc.contribution ?? "—"}</span>
                        </div>
                      ) : null}
                      {sc.indicators.map((i) => (
                        <IndicatorCard key={i.indicatorId} ind={i} scale={data.ratingScale} locked={locked} saving={saving.has(i.indicatorId)} onRate={requestRate} onNotes={onNotes} onMethods={onMethods} onEvidence={setEvidenceFor} onHistory={openHistory} />
                      ))}
                    </section>
                  ))}
                  <div className="flex justify-between">
                    {(() => { const idx = data.criteria.findIndex((c) => c.criterionId === crit.criterionId); const nxt = data.criteria[idx + 1]; return nxt ? <button className="btn btn-primary btn-sm ms-auto" onClick={() => { setActiveCrit(nxt.criterionId); window.scrollTo({ top: 0, behavior: "smooth" }); }}>المعيار التالي <ChevronLeft className="h-4 w-4" /></button> : null; })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== نوافذ ===== */}
      {data && (
        <EvidenceDrawer open={!!evidenceFor} onClose={() => setEvidenceFor(null)} schoolId={data.visit.school_id} visitId={data.visit.id} indicator={evidenceFor} canUpload={canEvaluate && !data.visit.locked} onChanged={() => void load(visitId, true)} />
      )}

      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title="سجل تعديلات المؤشر" description={historyFor ? `${historyFor.code}` : ""} width="lg">
        {!history ? <div className="skeleton h-24" /> : history.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">لا تعديلات مسجَّلة.</p> : (
          <ul className="divide-y divide-gray-100 text-[13px]">
            {history.map((h, i) => (
              <li key={i} className="py-2.5">
                <p><b className="text-navy">{h.changed_by ?? "—"}</b> عدّل <b>{({ score: "الدرجة", status: "الحالة", notes: "الملاحظات", methods: "وسائل التحقق" } as any)[h.field] ?? h.field}</b> · <span className="text-gray-500">{fmtDate(h.changed_at, true)}</span></p>
                <p className="mt-1 text-gray-600">{fmtHist(h.field, h.old_value)} ← {fmtHist(h.field, h.new_value)}</p>
                {h.reason && <p className="mt-1 rounded-lg bg-gold-soft/60 px-2 py-1 text-[12px] text-[#7A6112]">السبب: {h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog open={!!reasonAsk} tone="primary" title="تعديل درجة مقيَّمة سابقاً" message="سُجّلت لهذا المؤشر درجة من قبل. اذكر سبب التعديل ليُحفظ في سجل المؤشر."
        requireReason={{ label: "سبب التعديل", min: 3 }} confirmLabel="حفظ التعديل" onClose={() => setReasonAsk(null)}
        onConfirm={(reason) => { const a = reasonAsk; setReasonAsk(null); if (a) void send(a.ind, a.patch, reason); }} />

      <Modal open={!!conflict} onClose={() => setConflict(null)} title="تعارض في التعديل" description="عُدِّل هذا المؤشر على الخادم بعد آخر تحميل لديك." width="md">
        {conflict && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 p-3"><p className="text-[11.5px] font-semibold text-gray-500">نسخة الخادم (الأحدث)</p><p className="mt-1 font-semibold text-navy">{conflict.server?.status === "EVALUATED" ? RATING_LABEL[conflict.server.score] : "لم يُقيَّم"}</p><p className="text-[12px] text-gray-500">{conflict.server?.ratedBy} · {fmtDate(conflict.server?.ratedAt, true)}</p>{conflict.server?.notes && <p className="mt-1 text-[12px] text-gray-600">{conflict.server.notes}</p>}</div>
              <div className="rounded-xl border border-turquoise/40 bg-turquoise-soft/40 p-3"><p className="text-[11.5px] font-semibold text-gray-500">تعديلك</p><p className="mt-1 font-semibold text-navy">{(conflict.patch.status ?? conflict.ind.status) === "EVALUATED" ? RATING_LABEL[(conflict.patch.score ?? conflict.ind.score) as number] ?? "—" : "لم يُقيَّم"}</p>{conflict.patch.notes && <p className="mt-1 text-[12px] text-gray-600">{conflict.patch.notes}</p>}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={async () => { await deleteLocalScore(visitId, conflict.ind.indicatorId); setConflict(null); await load(visitId, true); }}>إبقاء نسخة الخادم</button>
              <button className="btn btn-primary btn-sm" onClick={() => { const c = conflict; setConflict(null); setReasonAsk(null); void send(c.ind, c.patch, "حسم تعارض: اعتماد تعديل المفتش", { version: c.server.version }); }}>اعتماد تعديلي</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title="تقديم الزيارة للمراجعة" description="بعد التقديم تُقفل المؤشرات للتعديل حتى يعتمدها المدير أو يعيدها." width="md">
        {data && (
          <div className="space-y-4">
            {data.result.notEvaluatedIndicators > 0 && <Alert tone="warning" title="التقييم غير مكتمل">{data.result.notEvaluatedIndicators} مؤشراً لم يُقيَّم. سيُصنَّف التقرير «مسودة غير مكتملة» ولن تُنسب إليه درجة نهائية.</Alert>}
            {pending > 0 && <Alert tone="danger" title="تعديلات غير مرفوعة">لديك {pending} تعديل محفوظ محلياً. زامنها أولاً حتى لا تُفقد.</Alert>}
            <div><label className="label">أبرز نقاط القوة</label><textarea className="input min-h-[80px]" value={strengths} onChange={(e) => setStrengths(e.target.value)} maxLength={4000} /></div>
            <div><label className="label">الفجوات المكتشفة</label><textarea className="input min-h-[80px]" value={gaps} onChange={(e) => setGaps(e.target.value)} maxLength={4000} /></div>
            <div className="flex justify-end gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setSubmitOpen(false)}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={busyAction || pending > 0 || !online} onClick={() => visitAction("submit", { strengths, gaps })}><Send className="h-3.5 w-3.5" /> تقديم</button></div>
            {!online && <p className="text-[11.5px] text-gray-500">التقديم يتطلب اتصالاً بالخادم.</p>}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={approveOpen} tone="primary" title="اعتماد الزيارة" message="سيُعتمد التقييم وتُشعر المدرسة والمفتش. يمكن إعادة فتحه لاحقاً بسبب مسجَّل." confirmLabel="اعتماد" busy={busyAction} onConfirm={() => visitAction("approve")} onClose={() => setApproveOpen(false)} />
      <ConfirmDialog open={returnOpen} title="إعادة الزيارة للتعديل" message="ستُفتح المؤشرات للتعديل من جديد ويُشعَر المفتش." requireReason={{ label: "سبب الإعادة" }} confirmLabel="إعادة" busy={busyAction} onConfirm={(reason) => visitAction("return", { reason })} onClose={() => setReturnOpen(false)} />
    </div>
  );
}

function fmtHist(field: string, v: string | null) {
  if (v == null || v === "") return "—";
  if (field === "score") return RATING_LABEL[Number(v)] ?? v;
  if (field === "status") return v === "EVALUATED" ? "مقيَّم" : "لم يُقيَّم";
  if (field === "methods") { try { const a = JSON.parse(v); return a.length ? a.join("، ") : "—"; } catch { return v; } }
  return v.length > 80 ? v.slice(0, 80) + "…" : v;
}
