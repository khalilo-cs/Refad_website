"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Download, Layers, Loader2, Paperclip, Plus, ShieldCheck, Trash2, UploadCloud, Wrench, XCircle,
} from "lucide-react";
import { EmptyState, Modal, PageHeader } from "@/components/ui";
import { ConfirmDialog, ScoreBar, StatusBadge, Tabs } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { ACTION_STATUS, EVIDENCE_STATUS, PRIORITY, fmtDate } from "@/lib/labels";

type View = "board" | "plans";
const COLS = [
  { key: "NEW", label: "جديدة", tone: "bg-info", test: (a: any) => a.status === "NEW" && !a.is_overdue },
  { key: "IN_PROGRESS", label: "قيد التنفيذ", tone: "bg-warning", test: (a: any) => ["IN_PROGRESS", "CLOSED_REJECTED"].includes(a.status) && !a.is_overdue },
  { key: "OVERDUE", label: "متأخرة", tone: "bg-danger", test: (a: any) => !!a.is_overdue },
  { key: "COMPLETED", label: "تحتاج إلى تحقق", tone: "bg-gold", test: (a: any) => a.status === "COMPLETED" },
  { key: "CLOSED_VERIFIED", label: "مغلقة بعد التحقق", tone: "bg-success", test: (a: any) => a.status === "CLOSED_VERIFIED" },
];

export default function ImprovementPage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><ImprovementInner /></Suspense>;
}

function ImprovementInner() {
  const { user } = useSession();
  const { add } = useToast();
  const sp = useSearchParams();
  const [view, setView] = useState<View>("board");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [schoolFilter, setSchoolFilter] = useState(sp.get("schoolId") ?? "");
  const [colFilter, setColFilter] = useState(sp.get("status") ?? "");
  const [planModal, setPlanModal] = useState(false);
  const [actionModal, setActionModal] = useState<{ planId?: string; preset?: any } | null>(sp.get("new") === "action" ? { preset: { indicatorId: sp.get("indicatorId") ?? "", schoolId: sp.get("schoolId") ?? "" } } : null);
  const [detail, setDetail] = useState<any>(null);
  const [delPlan, setDelPlan] = useState<any>(null);
  const [required, setRequired] = useState<RequiredItem[]>([]);
  const [showRequired, setShowRequired] = useState(sp.get("required") === "1");

  const role = user?.roleKey ?? "";
  const canCreate = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(role);
  const canDeletePlan = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL"].includes(role);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (schoolFilter) qs.set("schoolId", schoolFilter);
      const r = await fetch(`/api/improvement?${qs}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
      setDetail((cur: any) => (cur ? d.actions.find((a: any) => a.id === cur.id) ?? null : null));
    } catch (e: any) { add({ type: "error", message: e.message || "تعذّر تحميل الخطط" }); } finally { setLoading(false); }
  }, [schoolFilter, add]);
  useEffect(() => { void load(); }, [load]);
  const loadRequired = useCallback(async () => {
    const qs = schoolFilter ? `?schoolId=${schoolFilter}` : "";
    const r = await fetch(`/api/improvement/required${qs}`, { credentials: "include" }).catch(() => null);
    if (r?.ok) setRequired((await r.json()).items ?? []);
  }, [schoolFilter]);
  useEffect(() => { void loadRequired(); }, [loadRequired]);

  const schools = useMemo(() => [...new Map((data?.plans ?? []).map((p: any) => [p.school_id, p.school_name])).entries()], [data]);
  const actions: any[] = data?.actions ?? [];
  const t = data?.totals ?? {};

  const delPlanGo = async () => {
    const r = await fetch(`/api/improvement?planId=${delPlan.id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json();
    setDelPlan(null);
    if (!r.ok) return add({ type: "error", message: d.message });
    add({ type: "success", message: d.message });
    void load();
  };
  const setPlanStatus = async (planId: string, status: string) => {
    const r = await fetch("/api/improvement", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, status }) });
    const d = await r.json();
    add({ type: r.ok ? "success" : "error", message: d.message });
    if (r.ok) void load();
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={Wrench} title="خطط التحسين والإجراءات التصحيحية" subtitle="حوّل كل قصور إلى إجراء بمسؤول وموعد ومؤشر نجاح. لا يُغلق الإجراء إلا بعد دليل مقبول وتحقق المفتش."
        actions={canCreate ? <><button className="btn btn-ghost btn-sm" onClick={() => setPlanModal(true)}><Layers className="h-3.5 w-3.5" /> خطة جديدة</button><button className="btn btn-primary btn-sm" onClick={() => setActionModal({})}><Plus className="h-3.5 w-3.5" /> إجراء تصحيحي</button></> : undefined} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["الخطط", data?.plans?.length ?? 0, ClipboardList, "text-navy"], ["إجراءات مفتوحة", (t.total ?? 0) - (t.done ?? 0), Wrench, "text-info"], ["متأخرة", t.overdue ?? 0, AlertTriangle, "text-danger"], ["بانتظار التحقق", t.awaiting ?? 0, ShieldCheck, "text-gold"]].map(([l, v, Icon, c]: any) => (
          <div key={l} className="card p-4"><div className="flex items-center justify-between"><span className="text-[12px] text-gray-600">{l}</span><Icon className={`h-4 w-4 ${c}`} /></div><p className={`mt-2 font-heading text-3xl font-bold ${c}`}>{v}</p></div>
        ))}
      </div>

      {required.length > 0 && (
        <RequiredPanel items={required} open={showRequired} onToggle={() => setShowRequired((x) => !x)} canCreate={canCreate}
          onCreate={(it) => setActionModal({ preset: {
            schoolId: it.schoolId, indicatorId: it.indicatorId, evaluationId: it.evaluationId, schoolName: it.schoolName,
            problemDescription: `المؤشر ${it.code} قُيِّم «${it.score === 0 ? "غير متحقق" : "متحقق بدرجة ضعيفة"}» في زيارة ${fmtDate(it.visitDate)}: ${it.title}`,
            priority: it.score === 0 ? "HIGH" : "MEDIUM",
          } })} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<View> value={view} onChange={setView} tabs={[{ key: "board", label: "لوحة الإجراءات" }, { key: "plans", label: "الخطط", count: data?.plans?.length ?? 0 }]} />
        {schools.length > 1 && <select className="input !py-2 w-60" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}><option value="">كل المدارس</option>{schools.map(([id, n]: any) => <option key={id} value={id}>{n}</option>)}</select>}
      </div>

      {loading ? <div className="skeleton h-72 rounded-2xl" /> : view === "board" ? (
        actions.length === 0 ? <div className="card"><EmptyState icon={Wrench} title="لا إجراءات تصحيحية" description="أنشئ خطة تحسين ثم أضف إجراءات مرتبطة بالمؤشرات الضعيفة." action={canCreate ? <button className="btn btn-primary btn-sm" onClick={() => setPlanModal(true)}>إنشاء خطة</button> : undefined} /></div> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {COLS.map((c) => {
              const list = actions.filter(c.test);
              return (
                <section key={c.key} className={`rounded-2xl bg-gray-100/70 p-2.5 ${colFilter && colFilter !== c.key ? "opacity-50" : ""}`}>
                  <button className="mb-2 flex w-full items-center justify-between px-1.5 text-right" onClick={() => setColFilter(colFilter === c.key ? "" : c.key)}>
                    <span className="flex items-center gap-2 text-[13px] font-bold text-navy"><span className={`h-2.5 w-2.5 rounded-full ${c.tone}`} />{c.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-gray-600">{list.length}</span>
                  </button>
                  <div className="space-y-2.5">
                    {list.length === 0 && <p className="py-6 text-center text-[12px] text-gray-400">لا إجراءات</p>}
                    {list.map((a, i) => <ActionCard key={a.id} a={a} i={i} onClick={() => setDetail(a)} />)}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {(data?.plans ?? []).length === 0 && <div className="card"><EmptyState icon={Layers} title="لا خطط" /></div>}
          {(data?.plans ?? []).map((p: any) => (
            <div key={p.id} id={`plan-${p.id}`} className={`card p-4 ${sp.get("planId") === p.id ? "ring-2 ring-turquoise/40" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-[16px] font-bold text-navy">{p.title}</h3>
                    <span className={`badge ${p.status === "ACTIVE" ? "badge-info" : p.status === "COMPLETED" ? "badge-success" : "badge-neutral"}`}>{({ ACTIVE: "نشطة", COMPLETED: "مكتملة", ON_HOLD: "معلّقة", CANCELLED: "ملغاة" } as any)[p.status]}</span>
                    {p.actions_overdue > 0 && <span className="badge badge-danger">{p.actions_overdue} متأخر</span>}</div>
                  <p className="mt-1 text-[12px] text-gray-500">{p.school_name} · أنشأها {p.created_by_name} · {fmtDate(p.created_at)}</p>
                  {p.description && <p className="mt-1 text-[13px] text-gray-600">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {canCreate && p.status === "ACTIVE" && <button className="btn btn-ghost btn-sm" onClick={() => setActionModal({ planId: p.id })}><Plus className="h-3.5 w-3.5" /> إجراء</button>}
                  {canCreate && p.status === "ACTIVE" && <button className="btn btn-ghost btn-sm" onClick={() => setPlanStatus(p.id, "COMPLETED")}>إكمال الخطة</button>}
                  {canCreate && p.status !== "ACTIVE" && <button className="btn btn-ghost btn-sm" onClick={() => setPlanStatus(p.id, "ACTIVE")}>إعادة تفعيل</button>}
                  {canDeletePlan && <button className="btn btn-ghost btn-sm !px-2 text-danger" aria-label="حذف" onClick={() => setDelPlan(p)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3"><div className="flex-1"><ScoreBar value={p.actions_count ? (p.actions_done / p.actions_count) * 100 : 0} height={6} /></div><span className="font-mono text-[11.5px] text-gray-500">{p.actions_done}/{p.actions_count} مغلق بعد التحقق</span></div>
              {p.actions.length > 0 && <ul className="mt-3 divide-y divide-gray-100">{p.actions.map((a: any) => (
                <li key={a.id}><button className="flex w-full items-center gap-3 py-2 text-right transition hover:bg-gray-50" onClick={() => setDetail(a)}>
                  <StatusBadge map={PRIORITY} value={a.priority} /><span className="min-w-0 flex-1 truncate text-[13px] text-gray-700">{a.proposed_action}</span>
                  <span className="text-[11.5px] text-gray-400">{a.responsible_name}</span><span className={`text-[11.5px] ${a.is_overdue ? "font-bold text-danger" : "text-gray-500"}`}>{a.due_date}</span>
                  <StatusBadge map={ACTION_STATUS} value={a.is_overdue ? "OVERDUE" : a.status} /></button></li>
              ))}</ul>}
            </div>
          ))}
        </div>
      )}

      <PlanModal open={planModal} onClose={() => setPlanModal(false)} onDone={() => { setPlanModal(false); void load(); }} />
      {actionModal && <ActionModal ctx={actionModal} plans={data?.plans ?? []} people={data?.people ?? []} onPlansChanged={load} onClose={() => setActionModal(null)} onDone={() => { setActionModal(null); void load(); void loadRequired(); }} />}
      <ActionDetail a={detail} canVerify={!!data?.canVerify} meId={user?.userId ?? ""} onClose={() => setDetail(null)} onChanged={load} />
      <ConfirmDialog open={!!delPlan} title="حذف خطة التحسين" message={`سيُحذف «${delPlan?.title}» بكل إجراءاتها نهائياً.`} confirmLabel="حذف" onConfirm={delPlanGo} onClose={() => setDelPlan(null)} />
    </div>
  );
}

type RequiredItem = { schoolId: string; schoolName: string; visitId: string; visitDate: string; evaluationId: string; indicatorId: string; code: string; title: string; score: number };

/** المؤشرات الضعيفة في آخر تقييم والتي لم يُنشأ لها إجراء تصحيحي بعد. */
function RequiredPanel({ items, open, onToggle, onCreate, canCreate }: { items: RequiredItem[]; open: boolean; onToggle: () => void; onCreate: (it: RequiredItem) => void; canCreate: boolean }) {
  const bySchool = useMemo(() => {
    const m = new Map<string, { name: string; list: RequiredItem[] }>();
    for (const it of items) {
      const g = m.get(it.schoolId) ?? { name: it.schoolName, list: [] };
      g.list.push(it);
      m.set(it.schoolId, g);
    }
    return [...m.entries()];
  }, [items]);
  return (
    <section className="overflow-hidden rounded-2xl border border-warning/30 bg-warning/5">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right" aria-expanded={open}>
        <span className="flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {items.length} مؤشراً ضعيفاً بلا إجراء تصحيحي
          <span className="text-[12px] font-normal text-gray-500">في {bySchool.length} مدرسة</span>
        </span>
        <span className="text-[12px] font-semibold text-turquoise">{open ? "إخفاء" : "عرض"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-warning/20 bg-white/60 px-4 py-4">
          <p className="text-[12px] text-gray-600">وفق خطة المشروع، كل مؤشر قُيِّم بدرجة 0 أو 1 في آخر تقييم يحتاج إجراءً بمسؤول وموعد ومؤشر نجاح.</p>
          {bySchool.map(([sid, g]) => (
            <div key={sid}>
              <h3 className="mb-2 text-[13px] font-bold text-navy">{g.name}</h3>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                {g.list.map((it) => (
                  <li key={it.evaluationId} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="shrink-0 rounded bg-navy px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-gold-bright">{it.code}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700" title={it.title}>{it.title}</span>
                    <span className={`badge ${it.score === 0 ? "badge-danger" : "badge-warning"}`}>{it.score === 0 ? "غير متحقق" : "ضعيف"}</span>
                    {canCreate && <button className="btn btn-primary btn-sm shrink-0" onClick={() => onCreate(it)}><Plus className="h-3.5 w-3.5" /> إجراء</button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionCard({ a, i, onClick }: { a: any; i: number; onClick: () => void }) {
  const days = Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86400000);
  return (
    <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }} onClick={onClick}
      className="block w-full rounded-xl border border-gray-200 bg-white p-3 text-right shadow-xs transition hover:-translate-y-0.5 hover:border-turquoise/50 hover:shadow-md">
      <div className="flex items-center justify-between gap-2"><StatusBadge map={PRIORITY} value={a.priority} />{a.indicator_code && <span className="rounded bg-navy px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-gold-bright">{a.indicator_code}</span>}</div>
      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-gray-800">{a.proposed_action}</p>
      <p className="mt-1 truncate text-[11.5px] text-gray-400">{a.school_name}</p>
      <div className="mt-2.5 flex items-center justify-between text-[11.5px]">
        <span className="text-gray-600">{a.responsible_name}</span>
        <span className={`flex items-center gap-1 ${a.is_overdue ? "font-bold text-danger" : days <= 3 ? "font-semibold text-warning" : "text-gray-500"}`}><CalendarClock className="h-3 w-3" />{a.is_overdue ? `متأخر ${Math.abs(days)} يوماً` : days === 0 ? "اليوم" : `بعد ${days} يوماً`}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500"><Paperclip className="h-3 w-3" />{a.evidence_total ? `${a.evidence_accepted}/${a.evidence_total} دليل مقبول` : "لا أدلة"}{a.status === "CLOSED_REJECTED" && <span className="ms-auto badge badge-danger">رُفض التحقق</span>}</div>
    </motion.button>
  );
}

function PlanModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useSession();
  const { add } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ schoolId: user?.schoolId ?? "" }); fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => r.json()).then((d) => setSchools(d.schools ?? [])).catch(() => {}); } }, [open, user?.schoolId]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/improvement", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "plan", ...f }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onDone();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="خطة تحسين جديدة" width="sm">
      <div className="space-y-3">
        {!user?.schoolId && <div><label className="label">المدرسة</label><select className="input" value={f.schoolId ?? ""} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">اختر…</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div><label className="label">عنوان الخطة</label><input className="input" value={f.title ?? ""} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">وصف</label><textarea className="input min-h-[80px]" value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="flex justify-end gap-2"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={busy || !f.schoolId || (f.title ?? "").trim().length < 3} onClick={submit}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إنشاء</button></div>
      </div>
    </Modal>
  );
}

function ActionModal({ ctx, plans, people, onClose, onDone, onPlansChanged }: { ctx: { planId?: string; preset?: any }; plans: any[]; people: any[]; onClose: () => void; onDone: () => void; onPlansChanged: () => Promise<void> }) {
  const { user } = useSession();
  const { add } = useToast();
  const [indicators, setIndicators] = useState<any[]>([]);
  const preset = ctx.preset ?? {};
  const [f, setF] = useState<any>({
    planId: ctx.planId ?? "", priority: preset.priority ?? "MEDIUM", indicatorId: preset.indicatorId ?? "", evaluationId: preset.evaluationId ?? "",
    problemDescription: preset.problemDescription ?? "", responsibleId: user?.userId ?? "", dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  });
  const [creatingPlan, setCreatingPlan] = useState(false);
  const createPlanForSchool = async () => {
    setCreatingPlan(true);
    try {
      const r = await fetch("/api/improvement", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "plan", schoolId: preset.schoolId, title: `خطة تحسين ${new Date().getFullYear()} — ${preset.schoolName ?? ""}`.trim(), description: "أُنشئت لمعالجة المؤشرات الضعيفة في آخر تقييم." }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      await onPlansChanged();
      setF((x: any) => ({ ...x, planId: d.id }));
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setCreatingPlan(false); }
  };
  const [busy, setBusy] = useState(false);
  const activePlans = plans.filter((p) => p.status === "ACTIVE" && (!preset.schoolId || p.school_id === preset.schoolId));
  useEffect(() => { fetch("/api/lookup/indicators", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setIndicators(Array.isArray(d) ? d : [])).catch(() => {}); }, []);
  useEffect(() => { if (!f.planId && activePlans.length === 1) setF((x: any) => ({ ...x, planId: activePlans[0].id })); }, [activePlans.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/improvement", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "action", ...f }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onDone();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  const ok = f.planId && (f.problemDescription ?? "").trim().length >= 5 && (f.proposedAction ?? "").trim().length >= 5 && f.dueDate;
  return (
    <Modal open onClose={onClose} title="إجراء تصحيحي" description="يرتبط بمؤشر نتج عنه القصور، وبمسؤول وموعد ومؤشر نجاح" width="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">الخطة</label><select className="input" value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}><option value="">اختر خطة…</option>{activePlans.map((p) => <option key={p.id} value={p.id}>{p.title} — {p.school_name}</option>)}</select>{activePlans.length === 0 && (preset.schoolId
          ? <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={creatingPlan} onClick={createPlanForSchool}>{creatingPlan && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إنشاء خطة تحسين لهذه المدرسة</button>
          : <p className="mt-1 text-[11.5px] text-warning">لا خطط نشطة — أنشئ خطة أولاً.</p>)}</div>
        <div className="sm:col-span-2"><label className="label">المؤشر المرتبط</label><select className="input" value={f.indicatorId} onChange={(e) => setF({ ...f, indicatorId: e.target.value })}><option value="">بلا ربط</option>{indicators.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.title.slice(0, 80)}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">وصف المشكلة</label><textarea className="input min-h-[64px]" value={f.problemDescription ?? ""} onChange={(e) => setF({ ...f, problemDescription: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">السبب (إن عُرف)</label><input className="input" value={f.rootCause ?? ""} onChange={(e) => setF({ ...f, rootCause: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">الإجراء المقترح</label><textarea className="input min-h-[64px]" value={f.proposedAction ?? ""} onChange={(e) => setF({ ...f, proposedAction: e.target.value })} /></div>
        <div><label className="label">المسؤول عن التنفيذ</label><select className="input" value={f.responsibleId} onChange={(e) => setF({ ...f, responsibleId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}</select></div>
        <div><label className="label">الأولوية</label><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label className="label">الموعد النهائي</label><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
        <div><label className="label">الموارد المطلوبة</label><input className="input" value={f.resources ?? ""} onChange={(e) => setF({ ...f, resources: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">مؤشر قياس النجاح</label><input className="input" value={f.successIndicator ?? ""} onChange={(e) => setF({ ...f, successIndicator: e.target.value })} placeholder="مثال: رفع دليل مقبول يثبت وجود الخطة المعتمدة" /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={busy || !ok} onClick={submit}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إضافة</button></div>
    </Modal>
  );
}

function ActionDetail({ a, canVerify, meId, onClose, onChanged }: { a: any; canVerify: boolean; meId: string; onClose: () => void; onChanged: () => void }) {
  const { add } = useToast();
  const [ev, setEv] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<"reject" | "verify" | "reopen" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const loadEv = useCallback(async () => {
    if (!a) return;
    const r = await fetch(`/api/evidence?schoolId=${a.school_id}`, { credentials: "include" });
    const d = await r.json();
    setEv((d.evidence ?? []).filter((e: any) => e.action_id === a.id));
  }, [a]);
  useEffect(() => { setEv([]); void loadEv(); }, [loadEv]);

  const move = async (status: string, notes?: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/improvement", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: a.id, status, notes }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      setDlg(null);
      onChanged();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  const upload = (file: File) => {
    const fd = new FormData();
    fd.append("file", file); fd.append("schoolId", a.school_id); fd.append("actionId", a.id); fd.append("documentType", "تقرير"); fd.append("description", "دليل إنجاز إجراء تصحيحي");
    if (a.indicator_id) fd.append("indicatorId", a.indicator_id);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/evidence"); xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { setProgress(null); let b: any = {}; try { b = JSON.parse(xhr.responseText); } catch { /* */ } if (xhr.status < 300) { add({ type: "success", message: b.message }); void loadEv(); onChanged(); } else add({ type: "error", message: b.message ?? "تعذّر الرفع" }); };
    xhr.onerror = () => { setProgress(null); add({ type: "error", message: "انقطع الاتصال" }); };
    setProgress(0); xhr.send(fd);
  };

  if (!a) return null;
  const mine = a.responsible_id === meId;
  return (
    <>
      <Modal open onClose={onClose} title="تفاصيل الإجراء التصحيحي" description={`${a.school_name} — ${a.plan_title}`} width="lg">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge map={ACTION_STATUS} value={a.is_overdue ? "OVERDUE" : a.status} /><StatusBadge map={PRIORITY} value={a.priority} />{a.indicator_code && <span className="rounded bg-navy px-2 py-0.5 font-mono text-[11px] font-bold text-gold-bright">{a.indicator_code}</span>}{a.status === "CLOSED_REJECTED" && <span className="badge badge-danger">رُفض التحقق</span>}</div>
          {a.indicator_title && <p className="text-[12.5px] text-gray-500">المؤشر: {a.indicator_title}</p>}
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            {[["المشكلة", a.problem_description], ["السبب", a.root_cause], ["الإجراء المقترح", a.proposed_action], ["مؤشر النجاح", a.success_indicator], ["الموارد", a.resources], ["المسؤول", a.responsible_name], ["الموعد النهائي", a.due_date]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-gray-50 p-3"><dt className="text-[11.5px] font-semibold text-gray-500">{k}</dt><dd className="mt-0.5 text-navy">{v}</dd></div>
            ))}
          </dl>
          {a.verification_notes && <p className="rounded-xl bg-gold-soft/60 px-3 py-2 text-[13px] text-[#7A6112]">ملاحظة التحقق{a.verified_by_name ? ` (${a.verified_by_name})` : ""}: {a.verification_notes}</p>}

          <section>
            <div className="mb-2 flex items-center justify-between"><h4 className="font-heading font-bold text-navy">أدلة الإنجاز</h4>
              {a.status !== "CLOSED_VERIFIED" && <><button className="btn btn-ghost btn-sm" disabled={progress !== null} onClick={() => input.current?.click()}>{progress !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} رفع دليل</button><input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></>}</div>
            {progress !== null && <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-turquoise transition-all" style={{ width: `${progress}%` }} /></div>}
            {ev.length === 0 ? <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-[12.5px] text-gray-500">لم يُرفع دليل بعد. لا يُحدَّد الإجراء «مكتملاً» قبل رفع دليل، ولا يُغلق قبل قبوله.</p> : (
              <ul className="divide-y divide-gray-100">{ev.map((e) => <li key={e.id} className="flex items-center gap-3 py-2 text-[13px]"><Paperclip className="h-4 w-4 text-gray-400" /><span className="flex-1 truncate">{e.name}</span><StatusBadge map={EVIDENCE_STATUS} value={e.review_status} /><a href={`/api/evidence/${e.id}/file`} className="btn btn-ghost btn-sm !px-2" aria-label="تنزيل"><Download className="h-3.5 w-3.5" /></a></li>)}</ul>
            )}
            {canVerify && ev.some((e) => e.review_status === "PENDING") && <Link href={`/evidence?schoolId=${a.school_id}&status=PENDING`} className="mt-2 inline-block text-[12px] font-semibold text-turquoise hover:underline">راجع الأدلة المعلّقة في صفحة الأدلة ←</Link>}
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
            {a.status === "NEW" && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => move("IN_PROGRESS")}>بدء التنفيذ</button>}
            {["IN_PROGRESS", "CLOSED_REJECTED"].includes(a.status) && <button className="btn btn-primary btn-sm" disabled={busy || ev.length === 0} title={ev.length === 0 ? "أرفق دليلاً أولاً" : ""} onClick={() => move("COMPLETED")}><CheckCircle2 className="h-3.5 w-3.5" /> تم الإنجاز — طلب التحقق</button>}
            {a.status === "CLOSED_REJECTED" && !mine && null}
            {a.status === "COMPLETED" && canVerify && (
              <>
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setDlg("reject")}><XCircle className="h-3.5 w-3.5" /> عدم قبول الإنجاز</button>
                <button className="btn btn-sm bg-emerald text-white hover:brightness-110" disabled={busy} onClick={() => setDlg("verify")}><ShieldCheck className="h-3.5 w-3.5" /> تحقق وإغلاق</button>
              </>
            )}
            {a.status === "COMPLETED" && !canVerify && <span className="text-[12px] text-gray-500">بانتظار تحقق المفتش من الدليل.</span>}
            {a.status === "CLOSED_VERIFIED" && canVerify && <button className="btn btn-ghost btn-sm" onClick={() => setDlg("reopen")}>إعادة فتح</button>}
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={dlg === "verify"} tone="primary" title="التحقق من الإنجاز" message="تأكد من أن الدليل المقبول يثبت معالجة المشكلة فعلاً. سيُغلق الإجراء ويُشعَر المسؤول." confirmLabel="إغلاق بعد التحقق" requireReason={{ label: "ملاحظات التحقق (اختياري)", min: 0 }} busy={busy} onConfirm={(n) => move("CLOSED_VERIFIED", n)} onClose={() => setDlg(null)} />
      <ConfirmDialog open={dlg === "reject"} title="عدم قبول الإنجاز" message="سيُعاد الإجراء للمسؤول مع السبب." requireReason={{ label: "سبب عدم القبول", min: 5 }} confirmLabel="رفض" busy={busy} onConfirm={(n) => move("CLOSED_REJECTED", n)} onClose={() => setDlg(null)} />
      <ConfirmDialog open={dlg === "reopen"} tone="primary" title="إعادة فتح الإجراء" message="يعود الإجراء إلى «قيد التنفيذ»." requireReason={{ label: "سبب إعادة الفتح", min: 5 }} confirmLabel="إعادة فتح" busy={busy} onConfirm={(n) => move("IN_PROGRESS", n)} onClose={() => setDlg(null)} />
    </>
  );
}
