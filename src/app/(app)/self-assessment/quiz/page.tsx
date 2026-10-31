"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Award, CheckCircle2, ClipboardCheck, Flag, Lightbulb, ListChecks, Loader2, Printer, RotateCcw, Send, Sparkles, Target,
} from "lucide-react";
import { PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { suggestScore } from "@/lib/self-assessment-shared";
import { EvidenceDrawer } from "@/components/evaluation/evidence-drawer";

type Ind = {
  indicatorId: string; code: string; title: string; itemId: string | null; score: number | null; isWeak: boolean; status: string;
  evidence: string[]; evidenceHave: string[]; methods: string[]; notes: string | null; plan: { action: string | null }; files: number;
};
type Data = {
  school: { id: string; name: string }; year: string; canFill: boolean; locked: boolean; assessment: { status: string } | null;
  scale: { key: string; label_ar: string; score: number }[]; maxScore: number; blockers: string[];
  criteria: { id: string; code: string; title: string; weight: number | null; percent: number | null; achieved: boolean; subs: { code: string; title: string; indicators: Ind[] }[] }[];
  summary: { total: number; rated: number; weak: number; needsPlan: number; percent: number | null; achievedCriteria: number };
};
type Step = { ind: Ind; crit: Data["criteria"][number]; sub: { code: string; title: string } };

const METHODS = ["فحص وثائق", "ملاحظة", "مقابلة"];
const SCORE_STYLE = ["border-danger bg-danger text-white", "border-orange-500 bg-orange-500 text-white", "border-warning bg-warning text-white", "border-success bg-success text-white"];

/**
 * الاختبار التفاعلي: يمرّ المدير على المؤشرات واحداً واحداً، يحدّد ما يملكه فعلاً من أدلة،
 * فيُقترح التقدير تلقائياً، ويُطلب منه خطة فور ظهور ضعف، وينتهي بنتيجة مفصّلة.
 */
export default function SelfAssessmentQuiz() {
  const { user } = useSession();
  const { add } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [onlyTodo, setOnlyTodo] = useState(true);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  // إجابة المؤشر الحالي
  const [have, setHave] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [touchedScore, setTouchedScore] = useState(false);
  const [notes, setNotes] = useState("");
  // خطة فورية للضعف
  const [planFor, setPlanFor] = useState<{ itemId: string; step: Step } | null>(null);
  const [plan, setPlan] = useState({ planAction: "", responsible: "", dueDate: "" });
  const [filesOpen, setFilesOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/self-assessment", { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
      return d as Data;
    } catch (e: any) {
      setError(e.message || "تعذّر التحميل");
      return null;
    }
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const all: Step[] = useMemo(() => (data?.criteria ?? []).flatMap((crit) => crit.subs.flatMap((sub) => sub.indicators.map((ind) => ({ ind, crit, sub })))), [data]);
  const steps = useMemo(() => (onlyTodo ? all.filter((s) => s.ind.score == null) : all), [all, onlyTodo]);
  const cur = steps[Math.min(idx, Math.max(steps.length - 1, 0))];
  const scores = useMemo(() => (data?.scale ?? []).map((r) => r.score), [data]);

  // تهيئة الإجابة عند الانتقال لمؤشر
  useEffect(() => {
    if (!cur) return;
    setHave(cur.ind.evidenceHave);
    setMethods(cur.ind.methods);
    setScore(cur.ind.score);
    setTouchedScore(cur.ind.score != null);
    setNotes(cur.ind.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.ind.indicatorId]);

  const suggested = cur ? suggestScore(have.length, cur.ind.evidence.length, scores) : null;
  const effective = touchedScore ? score : suggested;
  const weakMax = 1;
  const label = (s: number | null) => data?.scale.find((r) => r.score === s)?.label_ar ?? "—";

  const save = async (): Promise<boolean> => {
    if (!data || !cur || effective == null) return false;
    setBusy(true);
    try {
      const r = await fetch("/api/self-assessment", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: data.school.id, year: data.year, indicatorId: cur.ind.indicatorId, score: effective, evidenceHave: have, methods, notes: notes.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      if (d.needsPlan) {
        setPlan({ planAction: "", responsible: "", dueDate: "" });
        setPlanFor({ itemId: d.itemId, step: cur });
      }
      return !d.needsPlan;
    } catch (e: any) {
      add({ type: "error", message: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    const fresh = await load();
    if (!fresh) return;
    if (onlyTodo) {
      // القائمة تتقلص بعد الحفظ؛ نبقى على نفس الموضع وهو المؤشر التالي
      const remaining = fresh.criteria.flatMap((c) => c.subs.flatMap((s) => s.indicators)).filter((i) => i.score == null).length;
      if (remaining === 0) setFinished(true);
      else setIdx((i) => Math.min(i, remaining - 1));
    } else if (idx >= all.length - 1) setFinished(true);
    else setIdx(idx + 1);
  };

  const next = async () => {
    const ok = await save();
    if (ok) await advance();
  };

  const savePlan = async (skip = false) => {
    if (!planFor) return;
    if (!skip) {
      setBusy(true);
      try {
        const r = await fetch(`/api/self-assessment/items/${planFor.itemId}`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", ...plan }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        add({ type: "success", message: "حُفظت خطة التحسين" });
      } catch (e: any) {
        add({ type: "error", message: e.message });
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setPlanFor(null);
    await advance();
  };

  if (!user) return <div className="skeleton h-64 rounded-2xl" />;
  if (error) return <div className="card p-8 text-center text-danger">{error}</div>;
  if (!data) return <div className="skeleton h-96 rounded-2xl" />;

  const header = <PageHeader icon={ListChecks} title="الاختبار التفاعلي للتقييم الذاتي" subtitle={`${data.school.name} — مؤشر بمؤشر: حدّد ما أنجزته فعلاً، ونقترح لك التقدير`} />;

  if (!data.canFill) {
    return <div className="space-y-5">{header}<div className="card p-8 text-center text-[13px] text-gray-600">الاختبار التفاعلي لمدير المدرسة ومنسق الجودة. <Link className="text-turquoise underline" href="/self-assessment">افتح الاستمارة</Link></div></div>;
  }
  if (data.locked) {
    return (
      <div className="space-y-5">{header}
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-success" />
          <p className="font-heading font-bold text-navy">أرسلتَ الاستمارة للإدارة</p>
          <p className="mt-1 text-[13px] text-gray-600">التقييم مقفل الآن. تابع خطط التحسين من الاستمارة.</p>
          <Link href="/self-assessment" className="btn btn-primary btn-sm mt-4">فتح الاستمارة</Link>
        </div>
      </div>
    );
  }

  if (finished || (onlyTodo && steps.length === 0)) return <div className="space-y-5">{header}<Results data={data} onRestart={() => { setOnlyTodo(false); setIdx(0); setFinished(false); }} /></div>;
  if (!cur) return null;

  const position = all.findIndex((s) => s.ind.indicatorId === cur.ind.indicatorId) + 1;
  const pct = Math.round((data.summary.rated / Math.max(data.summary.total, 1)) * 100);

  return (
    <div className="space-y-5">
      {header}
      <div className="card p-4">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span className="text-gray-600">أجبت عن <b className="text-navy">{data.summary.rated}</b> من {data.summary.total} مؤشراً · المؤشر الحالي {position}</span>
          <label className="flex items-center gap-1.5 text-gray-600"><input type="checkbox" checked={onlyTodo} onChange={(e) => { setOnlyTodo(e.target.checked); setIdx(0); }} /> غير المُجاب فقط</label>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="تقدّم الاختبار">
          <div className="h-full rounded-full bg-gradient-to-l from-turquoise to-navy transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-gray-100 bg-navy/[0.03] px-5 py-3 text-[12px] text-gray-600">
          المعيار {cur.crit.code}: {cur.crit.title}{cur.crit.weight ? ` (${cur.crit.weight}%)` : ""} ← المعيار الفرعي {cur.sub.code}: {cur.sub.title}
        </div>
        <div className="space-y-5 p-5">
          <div>
            <p className="mb-1 font-mono text-[12px] text-gray-500">المؤشر {cur.ind.code}</p>
            <h2 className="font-heading text-[18px] font-bold leading-relaxed text-navy">{cur.ind.title}</h2>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-navy"><ClipboardCheck className="h-4 w-4 text-turquoise" /> أيّ هذه الأدلة متوفرة لديك فعلاً في المدرسة؟</p>
            {cur.ind.evidence.length === 0 ? <p className="text-[12.5px] text-gray-500">لا أدلة محددة لهذا المؤشر في الاستمارة — اختر التقدير مباشرة.</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {cur.ind.evidence.map((e) => {
                  const on = have.includes(e);
                  return (
                    <button key={e} type="button" aria-pressed={on} onClick={() => setHave(on ? have.filter((x) => x !== e) : [...have, e])}
                      className={`flex items-center gap-3 rounded-xl border-2 p-3 text-start text-[13px] transition ${on ? "border-success bg-success/5 text-navy" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-success bg-success text-white" : "border-gray-300"}`}>{on && <CheckCircle2 className="h-4 w-4" />}</span>
                      {e}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button type="button" onClick={() => setFilesOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-turquoise/40 px-3 py-1.5 text-[12.5px] font-semibold text-turquoise hover:bg-turquoise/5">
            📎 أرفق صورة أو ملفاً للشواهد (اختياري){cur.ind.files ? ` — ${cur.ind.files} مرفوع` : ""}
          </button>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-navy">كيف تحققت من ذلك؟</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => {
                const on = methods.includes(m);
                return <button key={m} type="button" aria-pressed={on} onClick={() => setMethods(on ? methods.filter((x) => x !== m) : [...methods, m])}
                  className={`rounded-lg border px-3 py-1.5 text-[12.5px] ${on ? "border-navy bg-navy text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{on ? "✓ " : ""}{m}</button>;
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4">
            {suggested != null && (
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-gray-700">
                <Lightbulb className="h-4 w-4 text-gold" /> بحسب الأدلة المتوفرة ({have.length} من {cur.ind.evidence.length}) التقدير المقترح: <b className="text-navy">{label(suggested)}</b>
                {touchedScore && score !== suggested && <button className="ms-1 text-turquoise underline" onClick={() => { setTouchedScore(false); setScore(null); }}>اعتماد المقترح</button>}
              </p>
            )}
            <p className="mb-2 text-[13px] font-semibold text-navy">تقديرك للمؤشر</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="التقدير">
              {data.scale.map((r, i) => {
                const on = effective === r.score;
                return <button key={r.key} type="button" role="radio" aria-checked={on} onClick={() => { setScore(r.score); setTouchedScore(true); }}
                  className={`rounded-xl border-2 px-4 py-2 text-[13px] font-semibold transition ${on ? SCORE_STYLE[Math.min(i, 3)] : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>{r.label_ar}</button>;
              })}
            </div>
            {effective != null && effective <= weakMax && (
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-danger"><Flag className="h-3.5 w-3.5" /> هذا المؤشر سيُسجَّل نقطة ضعف، وستُطلب منك خطة تحسين بعد الحفظ.</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="q-notes">ملاحظات (اختياري)</label>
            <textarea id="q-notes" className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="أي توضيح يفيد الإدارة عند المراجعة" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3">
          <button className="btn btn-ghost btn-sm" disabled={busy || onlyTodo || idx === 0} onClick={() => setIdx(idx - 1)}><ArrowRight className="h-4 w-4" /> السابق</button>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => (onlyTodo ? setIdx((i) => (i + 1) % Math.max(steps.length, 1)) : setIdx(Math.min(idx + 1, all.length - 1)))}>تخطٍّ مؤقتاً</button>
            <button className="btn btn-primary btn-sm" disabled={busy || effective == null} onClick={next}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} حفظ والتالي <ArrowLeft className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <EvidenceDrawer open={filesOpen} onClose={() => setFilesOpen(false)} schoolId={data.school.id}
        indicator={{ indicatorId: cur.ind.indicatorId, code: cur.ind.code, title: cur.ind.title }} canUpload onChanged={() => void load()} />

      {planFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4" role="dialog" aria-modal="true" aria-label="خطة تحسين">
          <form className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl" onSubmit={(e) => { e.preventDefault(); void savePlan(); }}>
            <p className="flex items-center gap-2 font-heading text-[16px] font-bold text-danger"><Target className="h-5 w-5" /> نقطة ضعف: ضع خطة التحسين الآن</p>
            <p className="text-[12.5px] text-gray-600">{planFor.step.ind.code} — {planFor.step.ind.title}</p>
            <div><label className="label">ما الإجراء الذي ستعالج به الضعف؟ *</label><textarea className="input min-h-[80px]" required minLength={10} value={plan.planAction} onChange={(e) => setPlan({ ...plan, planAction: e.target.value })} placeholder={`مثال: توفير «${planFor.step.ind.evidence.find((e) => !have.includes(e)) ?? "الأدلة الناقصة"}» واعتمادها خلال الفصل`} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">المسؤول *</label><input className="input" required value={plan.responsible} onChange={(e) => setPlan({ ...plan, responsible: e.target.value })} placeholder="مثال: وكيل المدرسة" /></div>
              <div><label className="label">موعد الإنجاز *</label><input className="input" type="date" required value={plan.dueDate} onChange={(e) => setPlan({ ...plan, dueDate: e.target.value })} /></div>
            </div>
            <div className="flex justify-between gap-2 border-t border-gray-100 pt-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => savePlan(true)}>لاحقاً (لن تُرسل الاستمارة قبلها)</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الخطة والمتابعة</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Results({ data, onRestart }: { data: Data; onRestart: () => void }) {
  const s = data.summary;
  const weak = data.criteria.flatMap((c) => c.subs.flatMap((x) => x.indicators)).filter((i) => i.isWeak);
  const ready = data.blockers.length === 0;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-5 p-6">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(#0f9d8a ${(s.percent ?? 0) * 3.6}deg, #eef2f6 0)` }}>
          <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-white">
            <b className="font-heading text-2xl text-navy">{s.percent ?? 0}%</b><span className="text-[10.5px] text-gray-500">نسبة التحقق</span>
          </div>
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="flex items-center gap-2 font-heading text-[18px] font-bold text-navy"><Award className="h-5 w-5 text-gold" /> نتيجة تقييمك الذاتي</p>
          <p className="mt-1 text-[13px] text-gray-600">أجبت عن {s.rated} من {s.total} مؤشراً · {s.weak} نقاط ضعف · {s.achievedCriteria} معايير محقَّقة بالكامل</p>
          {s.needsPlan > 0 && <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-danger"><AlertTriangle className="h-3.5 w-3.5" /> {s.needsPlan} نقاط ضعف بلا خطة — ضعها من الاستمارة قبل الإرسال.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/self-assessment" className={`btn btn-sm ${ready ? "btn-primary" : "btn-ghost"}`}>{ready ? <Send className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />} {ready ? "راجع وأرسل للإدارة" : "أكمل في الاستمارة"}</Link>
          <a href={`/print/self-assessment?schoolId=${data.school.id}&year=${data.year}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm"><Printer className="h-4 w-4" /> طباعة</a>
          <button className="btn btn-ghost btn-sm" onClick={onRestart}><RotateCcw className="h-4 w-4" /> مراجعة كل الإجابات</button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 font-heading text-[15px] font-bold text-navy">أداؤك في كل معيار</h3>
        <div className="space-y-3">
          {data.criteria.map((c) => (
            <div key={c.id}>
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="text-gray-700">المعيار {c.code}: {c.title}{c.achieved && <span className="ms-2 inline-flex items-center gap-1 text-success"><Sparkles className="h-3 w-3" /> محقَّق</span>}</span>
                <b className="text-navy">{c.percent != null ? `${c.percent}%` : "—"}</b>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${(c.percent ?? 0) >= 80 ? "bg-success" : (c.percent ?? 0) >= 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${c.percent ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {weak.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-2 font-heading text-[15px] font-bold text-danger">نقاط الضعف التي حددتها ({weak.length})</h3>
          <ul className="divide-y divide-gray-100 text-[13px]">
            {weak.map((i) => (
              <li key={i.indicatorId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b className="me-1 font-mono text-[11.5px] text-gray-500">{i.code}</b>{i.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.plan.action ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"}`}>{i.plan.action ? "لها خطة" : "بلا خطة"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
