"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Megaphone, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { EmptyState, Modal } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

const ROLE_LABELS: Record<string, string> = { EDUCATION_DIRECTOR: "مدير التعليم", INSPECTOR: "مفتش", SCHOOL_PRINCIPAL: "مدير مدرسة", QUALITY_COORDINATOR: "منسق جودة", TEACHER: "معلم", PARENT: "ولي أمر" };

export default function AnnouncementsPanel() {
  const { user } = useSession();
  const { add } = useToast();
  const [data, setData] = useState<any>(null);
  const [edit, setEdit] = useState<any | "new" | null>(null);
  const [del, setDel] = useState<any>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/announcements", { credentials: "include" });
    const d = await r.json();
    if (r.ok) setData(d); else add({ type: "error", message: d.message });
  }, [add]);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: string) => {
    const r = await fetch("/api/announcements", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const d = await r.json();
    if (action !== "read") add({ type: r.ok ? "success" : "error", message: d.message });
    if (r.ok) void load();
  };
  const doDelete = async () => {
    const r = await fetch(`/api/announcements?id=${del.id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json();
    setDel(null);
    add({ type: r.ok ? "success" : "error", message: d.message });
    if (r.ok) void load();
  };

  if (!data) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>;
  const mineOrAdmin = (a: any) => user?.roleKey === "SUPER_ADMIN" || a.created_by_id === user?.userId;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-gray-600">{data.stats.unread > 0 ? <b className="text-danger">{data.stats.unread} إعلان غير مقروء</b> : "لا إعلانات غير مقروءة"} · {data.stats.total} إعلان</p>
        {data.canWrite && <button className="btn btn-primary btn-sm" onClick={() => setEdit("new")}><Plus className="h-3.5 w-3.5" /> إعلان جديد</button>}
      </div>
      {data.announcements.length === 0 ? <div className="card"><EmptyState icon={Megaphone} title="لا إعلانات" description="لم يُنشر أي إعلان موجَّه لك بعد." /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.announcements.map((a: any) => (
            <article key={a.id} onMouseEnter={() => { if (!a.is_draft && !a.is_read) void act(a.id, "read"); }} className={`card p-4 [border-inline-start:3px_solid] ${a.is_draft ? "[border-inline-start-color:var(--warning)]" : "[border-inline-start-color:var(--turquoise)]"}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading text-[15.5px] font-bold text-navy">{!a.is_read && !a.is_draft && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-danger align-middle" />}{a.title}</h3>
                <span className={`badge shrink-0 ${a.is_draft ? "badge-warning" : "badge-success"}`}>{a.is_draft ? "مسودة" : "منشور"}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-[1.9] text-gray-600">{a.content}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2.5 text-[11px] text-gray-400">
                <span>{a.created_by_name}</span><span>{fmtDate(a.published_at ?? a.created_at)}</span>
                {a.audience_roles.length > 0 && <span>الجمهور: {a.audience_roles.map((k: string) => ROLE_LABELS[k] ?? k).join("، ")}</span>}
                {a.read_count !== undefined && !a.is_draft && <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {a.read_count} قراءة</span>}
                {data.canWrite && mineOrAdmin(a) && (
                  <span className="ms-auto flex items-center gap-1">
                    {a.is_draft ? <button className="btn btn-ghost btn-sm" onClick={() => act(a.id, "publish")}><Send className="h-3.5 w-3.5" /> نشر</button> : <button className="btn btn-ghost btn-sm" onClick={() => act(a.id, "unpublish")}><Undo2 className="h-3.5 w-3.5" /></button>}
                    <button className="btn btn-ghost btn-sm !px-2" aria-label="تعديل" onClick={() => setEdit(a)}><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="btn btn-ghost btn-sm !px-2 text-danger" aria-label="حذف" onClick={() => setDel(a)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && <EditModal row={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void load(); }} />}
      <ConfirmDialog open={!!del} title="حذف الإعلان" message={`سيُحذف «${del?.title}» نهائياً.`} confirmLabel="حذف" onConfirm={doDelete} onClose={() => setDel(null)} />
    </div>
  );
}

function EditModal({ row, onClose, onDone }: { row: any | null; onClose: () => void; onDone: () => void }) {
  const { user } = useSession();
  const { add } = useToast();
  const [f, setF] = useState<any>({ title: row?.title ?? "", content: row?.content ?? "", audienceRoles: row?.audience_roles ?? [], expiresAt: row?.expires_at?.slice(0, 10) ?? "" });
  const [busy, setBusy] = useState(false);
  const principal = user?.roleKey === "SCHOOL_PRINCIPAL";
  const roles = principal ? ["TEACHER", "PARENT", "QUALITY_COORDINATOR"] : Object.keys(ROLE_LABELS);
  const toggle = (k: string) => setF((x: any) => ({ ...x, audienceRoles: x.audienceRoles.includes(k) ? x.audienceRoles.filter((y: string) => y !== k) : [...x.audienceRoles, k] }));

  const save = async (publish: boolean) => {
    setBusy(true);
    try {
      const r = row
        ? await fetch("/api/announcements", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, title: f.title, content: f.content }) })
        : await fetch("/api/announcements", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: f.title, content: f.content, audienceRoles: f.audienceRoles, expiresAt: f.expiresAt || undefined, publish }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onDone();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={row ? "تعديل الإعلان" : "إعلان جديد"} description={principal ? "يُنشر لمدرستك فقط" : "اترك الجمهور فارغاً لإرساله للجميع ضمن نطاقك"} width="lg">
      <div className="space-y-3">
        <div><label className="label">العنوان</label><input className="input" maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">النص</label><textarea className="input min-h-[140px]" maxLength={4000} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></div>
        {!row && (
          <>
            <div><label className="label">الجمهور</label><div className="flex flex-wrap gap-2">{roles.map((k) => <button type="button" key={k} onClick={() => toggle(k)} className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${f.audienceRoles.includes(k) ? "border-turquoise bg-turquoise-soft text-emerald-deep" : "border-gray-200 text-gray-600"}`}>{ROLE_LABELS[k]}</button>)}</div></div>
            <div className="max-w-[220px]"><label className="label">ينتهي في (اختياري)</label><input type="date" className="input" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></div>
          </>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          {!row && <button className="btn btn-ghost btn-sm" disabled={busy || f.title.trim().length < 3 || f.content.trim().length < 10} onClick={() => save(false)}>حفظ كمسودة</button>}
          <button className="btn btn-primary btn-sm" disabled={busy || f.title.trim().length < 3 || f.content.trim().length < 10} onClick={() => save(!row)}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{row ? "حفظ" : "نشر"}</button>
        </div>
      </div>
    </Modal>
  );
}
