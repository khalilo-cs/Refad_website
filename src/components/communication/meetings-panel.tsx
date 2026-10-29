"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { EmptyState, Modal } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

export default function MeetingsPanel() {
  const { user } = useSession();
  const { add } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<any>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/communication/meetings", { credentials: "include" });
    const d = await r.json();
    if (r.ok) setRows(d.meetings); else add({ type: "error", message: d.message });
  }, [add]);
  useEffect(() => { void load(); }, [load]);
  const doDel = async () => {
    const r = await fetch(`/api/communication/meetings?id=${del.id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json(); setDel(null);
    add({ type: r.ok ? "success" : "error", message: d.message }); if (r.ok) void load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between"><p className="text-[13px] text-gray-600">سجل الاجتماعات والمتابعات بمحاضرها وقراراتها وإجراءات المتابعة.</p><button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> اجتماع جديد</button></div>
      {!rows ? <div className="skeleton h-32 rounded-2xl" /> : rows.length === 0 ? <div className="card"><EmptyState icon={CalendarCheck} title="لا اجتماعات مسجّلة" /></div> : (
        <div className="space-y-3">
          {rows.map((m) => (
            <article key={m.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="font-heading text-[16px] font-bold text-navy">{m.title}</h3><p className="text-[12px] text-gray-500">{fmtDate(m.meeting_date)} · {m.school_name ?? "عام"} · سجّله {m.created_by_name}</p></div>
                {(m.created_by_id === user?.userId || user?.roleKey === "SUPER_ADMIN") && <button className="btn btn-ghost btn-sm !px-2 text-danger" aria-label="حذف" onClick={() => setDel(m)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              <dl className="mt-3 grid gap-3 text-[13px] md:grid-cols-2">
                {[["الحضور", m.attendees], ["المحضر", m.minutes], ["القرارات", m.decisions], ["المتابعة المطلوبة", m.follow_up]].filter(([, v]) => v).map(([k, v]) => <div key={k as string} className="rounded-xl bg-gray-50 p-3"><dt className="text-[11.5px] font-semibold text-gray-500">{k}</dt><dd className="mt-0.5 whitespace-pre-line leading-[1.8] text-gray-700">{v}</dd></div>)}
              </dl>
            </article>
          ))}
        </div>
      )}
      <MeetingModal open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void load(); }} />
      <ConfirmDialog open={!!del} title="حذف السجل" message="سيُحذف سجل الاجتماع نهائياً." confirmLabel="حذف" onConfirm={doDel} onClose={() => setDel(null)} />
    </div>
  );
}

function MeetingModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useSession();
  const { add } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ meetingDate: new Date().toISOString().slice(0, 10), schoolId: user?.schoolId ?? "" }); fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => r.json()).then((d) => setSchools(d.schools ?? [])).catch(() => {}); } }, [open, user?.schoolId]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/communication/meetings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message }); onDone();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="تسجيل اجتماع" width="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">العنوان</label><input className="input" value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">التاريخ</label><input type="date" className="input" value={f.meetingDate ?? ""} onChange={(e) => setF({ ...f, meetingDate: e.target.value })} /></div>
        {!user?.schoolId && <div><label className="label">المدرسة</label><select className="input" value={f.schoolId ?? ""} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">عام</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div className="sm:col-span-2"><label className="label">الحضور</label><input className="input" value={f.attendees ?? ""} onChange={(e) => setF({ ...f, attendees: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">المحضر</label><textarea className="input min-h-[90px]" value={f.minutes ?? ""} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div>
        <div><label className="label">القرارات</label><textarea className="input min-h-[70px]" value={f.decisions ?? ""} onChange={(e) => setF({ ...f, decisions: e.target.value })} /></div>
        <div><label className="label">المتابعة المطلوبة</label><textarea className="input min-h-[70px]" value={f.followUp ?? ""} onChange={(e) => setF({ ...f, followUp: e.target.value })} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={busy || (f.title ?? "").trim().length < 3} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ</button></div>
    </Modal>
  );
}
