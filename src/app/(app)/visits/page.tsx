"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, CalendarPlus, CheckCircle2, ClipboardList, Loader2, MoreHorizontal, Pause, Play, Undo2, XCircle } from "lucide-react";
import { EmptyState, Modal, PageHeader, LoadingRows } from "@/components/ui";
import { ConfirmDialog, Pagination, StatusBadge, Tabs } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { VISIT_STATUS, VISIT_TYPE, fmtDate } from "@/lib/labels";

type StatusTab = "" | "SCHEDULED" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "OVERDUE";

export default function VisitsPage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><VisitsInner /></Suspense>;
}

function VisitsInner() {
  const { user } = useSession();
  const { add } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<StatusTab>((sp.get("status") as StatusTab) ?? "");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(sp.get("new") === "1");
  const [menu, setMenu] = useState<string | null>(null);
  const [act, setAct] = useState<{ v: any; action: "postpone" | "cancel" | "return" | "approve" | "reschedule" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState("");

  const canPlan = !!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user.roleKey);
  const canReview = !!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user.roleKey);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "15" });
      if (tab) qs.set("status", tab);
      for (const k of ["inspectorId", "schoolId", "type"]) if (sp.get(k)) qs.set(k, sp.get(k)!);
      const r = await fetch(`/api/visits?${qs}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setRows(d.visits ?? []); setTotal(d.total ?? 0); setPages(d.totalPages ?? 1);
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل الزيارات" });
    } finally { setLoading(false); }
  }, [tab, page, sp, add]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const c = () => setMenu(null); window.addEventListener("click", c); return () => window.removeEventListener("click", c); }, []);

  const run = async (v: any, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/visits/${v.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      setAct(null);
      await load();
      return true;
    } catch (e: any) { add({ type: "error", message: e.message }); return false; } finally { setBusy(false); }
  };

  const start = async (v: any) => {
    if (v.status !== "IN_PROGRESS") { const ok = await run(v, "start"); if (!ok) return; }
    router.push(`/evaluation?visitId=${v.id}`);
  };

  const tabs: { key: StatusTab; label: string }[] = [
    { key: "", label: "الكل" }, { key: "SCHEDULED", label: "مجدولة" }, { key: "IN_PROGRESS", label: "جارية" },
    { key: "SUBMITTED", label: "بانتظار المراجعة" }, { key: "COMPLETED", label: "معتمدة" }, { key: "OVERDUE", label: "متأخرة" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarDays} title="الزيارات الميدانية" subtitle="جدولة الزيارات ومتابعة حالتها من الجدولة حتى الاعتماد"
        actions={canPlan ? <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-sm"><CalendarPlus className="h-3.5 w-3.5" /> زيارة جديدة</button> : undefined} />

      <Tabs<StatusTab> tabs={tabs} value={tab} onChange={(t) => { setTab(t); setPage(1); }} />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50/60 text-gray-500">
              {["المدرسة", "النوع", "الموعد", "المفتش", "الحالة", "الإكمال", ""].map((h, i) => <th key={i} className="px-4 py-3 text-right font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {loading ? <LoadingRows cols={7} rows={5} /> : rows.map((v, i) => (
                <motion.tr key={v.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="border-b border-gray-50 hover:bg-turquoise-soft/25">
                  <td className="px-4 py-3"><Link href={`/schools/${v.school_id}`} className="font-semibold text-navy hover:text-turquoise hover:underline">{v.school_name}</Link><p className="text-[11px] text-gray-400">{v.directorate_name}</p></td>
                  <td className="px-4 py-3 text-gray-600">{VISIT_TYPE[v.type] ?? v.type}{v.purpose && <p className="max-w-[200px] truncate text-[11px] text-gray-400">{v.purpose}</p>}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(v.visit_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{v.inspector_name}</td>
                  <td className="px-4 py-3"><StatusBadge map={VISIT_STATUS} value={v.is_overdue ? "OVERDUE" : v.status} /></td>
                  <td className="px-4 py-3 font-mono text-gray-600">{v.completion}%</td>
                  <td className="relative px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {["SCHEDULED", "POSTPONED", "IN_PROGRESS"].includes(v.status) && canPlan && (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => start(v)}>{v.status === "IN_PROGRESS" ? <ClipboardList className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{v.status === "IN_PROGRESS" ? "متابعة" : "بدء"}</button>
                      )}
                      {["SUBMITTED", "COMPLETED"].includes(v.status) && <Link href={`/evaluation?visitId=${v.id}`} className="btn btn-ghost btn-sm">عرض</Link>}
                      {canPlan && !["CANCELLED"].includes(v.status) && (
                        <div className="relative">
                          <button className="btn btn-ghost btn-sm !px-2" aria-label="المزيد" onClick={(e) => { e.stopPropagation(); setMenu(menu === v.id ? null : v.id); }}><MoreHorizontal className="h-4 w-4" /></button>
                          {menu === v.id && (
                            <div className="absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-[12.5px] shadow-lg animate-fade-up" onClick={(e) => e.stopPropagation()}>
                              {v.status === "SCHEDULED" && <MenuItem icon={Pause} label="تأجيل" onClick={() => { setMenu(null); setAct({ v, action: "postpone" }); }} />}
                              {["SCHEDULED", "POSTPONED"].includes(v.status) && <MenuItem icon={CalendarDays} label="تغيير الموعد" onClick={() => { setMenu(null); setNewDate(""); setAct({ v, action: "reschedule" }); }} />}
                              {canReview && v.status === "SUBMITTED" && <MenuItem icon={CheckCircle2} label="اعتماد" onClick={() => { setMenu(null); setAct({ v, action: "approve" }); }} />}
                              {canReview && ["SUBMITTED", "COMPLETED"].includes(v.status) && <MenuItem icon={Undo2} label="إعادة للتعديل" onClick={() => { setMenu(null); setAct({ v, action: "return" }); }} />}
                              {canReview && ["SCHEDULED", "POSTPONED", "IN_PROGRESS"].includes(v.status) && <MenuItem icon={XCircle} label="إلغاء" danger onClick={() => { setMenu(null); setAct({ v, action: "cancel" }); }} />}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={7}><EmptyState icon={CalendarDays} title="لا زيارات" description="لا توجد زيارات بهذه الحالة ضمن نطاقك." action={canPlan ? <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>جدولة زيارة</button> : undefined} /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-3"><Pagination page={page} totalPages={pages} total={total} onPage={setPage} /></div>
      </div>

      <CreateVisitModal open={createOpen} onClose={() => { setCreateOpen(false); if (sp.get("new")) router.replace("/visits"); }} onCreated={() => { setCreateOpen(false); router.replace("/visits"); void load(); }} presetSchoolId={sp.get("schoolId") ?? ""} />

      <ConfirmDialog open={act?.action === "postpone"} title="تأجيل الزيارة" message="سيُشعَر مدير المدرسة بالتأجيل." requireReason={{ label: "سبب التأجيل" }} busy={busy} confirmLabel="تأجيل" onClose={() => setAct(null)} onConfirm={(reason) => act && run(act.v, "postpone", { reason })} />
      <ConfirmDialog open={act?.action === "cancel"} title="إلغاء الزيارة" message="لا يمكن التراجع عن الإلغاء." requireReason={{ label: "سبب الإلغاء" }} busy={busy} confirmLabel="إلغاء الزيارة" onClose={() => setAct(null)} onConfirm={(reason) => act && run(act.v, "cancel", { reason })} />
      <ConfirmDialog open={act?.action === "return"} title="إعادة الزيارة للتعديل" message="ستُفتح المؤشرات للتعديل ويُشعَر المفتش." requireReason={{ label: "سبب الإعادة" }} busy={busy} confirmLabel="إعادة" tone="primary" onClose={() => setAct(null)} onConfirm={(reason) => act && run(act.v, "return", { reason })} />
      <ConfirmDialog open={act?.action === "approve"} title="اعتماد الزيارة" message="سيُعتمد التقييم وتُشعَر المدرسة." tone="primary" busy={busy} confirmLabel="اعتماد" onClose={() => setAct(null)} onConfirm={() => act && run(act.v, "approve")} />
      <Modal open={act?.action === "reschedule"} onClose={() => setAct(null)} title="تغيير موعد الزيارة" width="sm">
        <div className="space-y-4"><div><label className="label">الموعد الجديد</label><input type="datetime-local" className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setAct(null)}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={!newDate || busy} onClick={() => act && run(act.v, "reschedule", { scheduledAt: new Date(newDate).toISOString() })}>حفظ</button></div></div>
      </Modal>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-2 text-right transition hover:bg-gray-50 ${danger ? "text-danger hover:bg-danger-soft" : "text-gray-700"}`}><Icon className="h-3.5 w-3.5" />{label}</button>;
}

function CreateVisitModal({ open, onClose, onCreated, presetSchoolId }: { open: boolean; onClose: () => void; onCreated: () => void; presetSchoolId: string }) {
  const { user } = useSession();
  const { add } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [inspectors, setInspectors] = useState<any[]>([]);
  const [f, setF] = useState<any>({ type: "PERIODIC" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({ type: "PERIODIC", schoolId: presetSchoolId });
    fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => r.json()).then((d) => setSchools(d.schools ?? [])).catch(() => {});
    fetch("/api/lookup/inspectors", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setInspectors(Array.isArray(d) ? d : [])).catch(() => {});
  }, [open, presetSchoolId]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: any = { schoolId: f.schoolId, type: f.type, purpose: f.purpose || undefined, scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined };
      if (f.inspectorId) body.inspectorId = f.inspectorId;
      const r = await fetch("/api/visits", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onCreated();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="جدولة زيارة ميدانية" description="يُشعَر المفتش ومدير المدرسة تلقائياً" width="md">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        <div><label className="label">المدرسة</label><select className="input" required value={f.schoolId ?? ""} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">اختر…</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">نوع الزيارة</label><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(VISIT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label">الموعد</label><input type="datetime-local" className="input" value={f.scheduledAt ?? ""} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></div>
        </div>
        {user?.roleKey !== "INSPECTOR" && (
          <div><label className="label">المفتش المسؤول</label><select className="input" value={f.inspectorId ?? ""} onChange={(e) => setF({ ...f, inspectorId: e.target.value })}><option value="">أنا</option>{inspectors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        )}
        <div><label className="label">هدف الزيارة</label><textarea className="input min-h-[70px]" maxLength={500} value={f.purpose ?? ""} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button type="submit" className="btn btn-primary btn-sm" disabled={busy || !f.schoolId}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} جدولة</button></div>
      </form>
    </Modal>
  );
}
