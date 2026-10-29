"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Download, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import { EmptyState, Modal } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

export default function MaterialsPanel() {
  const { user } = useSession();
  const { add } = useToast();
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<any>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/communication/materials", { credentials: "include" });
    const d = await r.json();
    if (r.ok) setData(d); else add({ type: "error", message: d.message });
  }, [add]);
  useEffect(() => { void load(); }, [load]);
  const doDel = async () => {
    const r = await fetch(`/api/communication/materials?id=${del.id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json(); setDel(null);
    add({ type: r.ok ? "success" : "error", message: d.message }); if (r.ok) void load();
  };
  if (!data) return <div className="skeleton h-40 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between"><p className="text-[13px] text-gray-600">مواد تعليمية يشاركها المعلمون والإدارة مع المدرسة وأولياء الأمور إلكترونياً.</p>{data.canWrite && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> مادة جديدة</button>}</div>
      {data.materials.length === 0 ? <div className="card"><EmptyState icon={BookOpen} title="لا مواد مشتركة" /></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.materials.map((m: any) => (
            <article key={m.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy text-gold-bright"><BookOpen className="h-5 w-5" /></span>
                <div className="min-w-0"><h3 className="truncate font-heading font-bold text-navy">{m.title}</h3><p className="text-[11.5px] text-gray-500">{m.school_name} · {m.created_by_name} · {fmtDate(m.created_at)}</p>{m.description && <p className="mt-1 text-[12.5px] text-gray-600">{m.description}</p>}</div></div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className={`badge ${m.audience === "PARENTS" ? "badge-success" : "badge-info"}`}>{m.audience === "PARENTS" ? "لأولياء الأمور" : "لمجتمع المدرسة"}</span>
                <span className="flex gap-1"><a className="btn btn-ghost btn-sm" href={`/api/evidence/${m.evidence_id}/file`}><Download className="h-3.5 w-3.5" /> تنزيل</a>{(m.created_by_name && (user?.roleKey === "SUPER_ADMIN" || user?.roleKey === "SCHOOL_PRINCIPAL" || user?.roleKey === "EDUCATION_DIRECTOR" || m.created_by_id === user?.userId)) && <button className="btn btn-ghost btn-sm !px-2 text-danger" aria-label="حذف" onClick={() => setDel(m)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>
              </div>
            </article>
          ))}
        </div>
      )}
      <UploadModal open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void load(); }} />
      <ConfirmDialog open={!!del} title="حذف المادة" message={`ستُحذف «${del?.title}» من المشاركة.`} confirmLabel="حذف" onConfirm={doDel} onClose={() => setDel(null)} />
    </div>
  );
}

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useSession();
  const { add } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [f, setF] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setFile(null); setF({ schoolId: user?.schoolId ?? "", audience: "SCHOOL" }); if (!user?.schoolId) fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => r.json()).then((d) => setSchools(d.schools ?? [])).catch(() => {}); } }, [open, user?.schoolId]);
  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("title", f.title ?? ""); fd.append("schoolId", f.schoolId); fd.append("audience", f.audience); if (f.description) fd.append("description", f.description);
      const r = await fetch("/api/communication/materials", { method: "POST", credentials: "include", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message }); onDone();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="مشاركة مادة تعليمية" width="md">
      <div className="space-y-3">
        <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-5 transition hover:border-turquoise"><UploadCloud className="h-6 w-6 text-turquoise" /><span className="text-sm font-semibold text-navy">{file ? file.name : "اختر الملف (PDF، صورة، Word، Excel)"}</span></button>
        <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div><label className="label">العنوان</label><input className="input" value={f.title ?? ""} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">وصف</label><input className="input" value={f.description ?? ""} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        {!user?.schoolId && <div><label className="label">المدرسة</label><select className="input" value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">اختر…</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div><label className="label">المتاحة لـ</label><select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="SCHOOL">مجتمع المدرسة</option><option value="PARENTS">أولياء الأمور</option></select></div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={busy || !file || (f.title ?? "").trim().length < 3 || !f.schoolId} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} نشر</button></div>
      </div>
    </Modal>
  );
}
