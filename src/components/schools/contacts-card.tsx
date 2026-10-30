"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Modal } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/extra";
import { PhoneActions } from "@/components/ui/contact";
import { useToast } from "@/components/providers";
import { CONTACT_ROLES } from "@/lib/school-contacts-shared";

type Contact = { id: string; role: string; name: string; phone: string | null; hasWhatsapp: boolean; email: string | null; notes: string | null };
type Data = {
  primary: { role: string; name: string | null; phone: string | null; hasWhatsapp: boolean; email: string | null };
  contacts: Contact[];
  canEdit: boolean;
};

/** جهات اتصال المدرسة: المدير (من ملف المدرسة) + جهات إضافية، مع أزرار الاتصال والواتساب. */
export function SchoolContactsCard({ schoolId, onEditPrimary, refreshKey = 0 }: { schoolId: string; onEditPrimary?: () => void; refreshKey?: number }) {
  const { add } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "add" } | { mode: "edit"; contact: Contact } | null>(null);
  const [del, setDel] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/schools/${schoolId}/contacts`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message || "تعذّر تحميل جهات الاتصال");
    }
  }, [schoolId]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const remove = async () => {
    if (!del) return;
    const r = await fetch(`/api/schools/${schoolId}/contacts/${del.id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json();
    setDel(null);
    add({ type: r.ok ? "success" : "error", message: d.message });
    if (r.ok) void load();
  };

  if (error) return <p className="text-[12.5px] text-gray-500">{error}</p>;
  if (!data) return <div className="skeleton h-24 rounded-xl" />;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-[15px] font-bold text-navy">جهات الاتصال</h3>
        {data.canEdit && (
          <button className="btn btn-ghost btn-sm" onClick={() => setForm({ mode: "add" })}><Plus className="h-3.5 w-3.5" /> إضافة</button>
        )}
      </div>
      <ul className="divide-y divide-gray-100">
        <ContactRow role={data.primary.role} name={data.primary.name} phone={data.primary.phone} hasWhatsapp={data.primary.hasWhatsapp} email={data.primary.email}
          action={data.canEdit && onEditPrimary ? <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy" onClick={onEditPrimary} aria-label="تعديل بيانات المدير" title="يُعدَّل من بيانات المدرسة"><Pencil className="h-3.5 w-3.5" /></button> : null} />
        {data.contacts.map((c) => (
          <ContactRow key={c.id} role={c.role} name={c.name} phone={c.phone} hasWhatsapp={c.hasWhatsapp} email={c.email} notes={c.notes}
            action={data.canEdit ? (
              <span className="flex gap-0.5">
                <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy" onClick={() => setForm({ mode: "edit", contact: c })} aria-label="تعديل" title="تعديل"><Pencil className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1.5 text-gray-400 hover:bg-danger/10 hover:text-danger" onClick={() => setDel(c)} aria-label="حذف" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            ) : null} />
        ))}
      </ul>
      {data.contacts.length === 0 && !data.primary.name && !data.primary.phone && (
        <p className="py-3 text-center text-[12.5px] text-gray-400">لا جهات اتصال بعد{data.canEdit ? " — أضف أول جهة." : "."}</p>
      )}

      {form && (
        <ContactFormModal
          schoolId={schoolId}
          contact={form.mode === "edit" ? form.contact : null}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); void load(); }}
        />
      )}
      <ConfirmDialog open={!!del} title="حذف جهة الاتصال" message={`سيُحذف «${del?.name}» من جهات اتصال المدرسة.`} confirmLabel="حذف" onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  );
}

function ContactRow({ role, name, phone, hasWhatsapp, email, notes, action }: { role: string; name: string | null; phone: string | null; hasWhatsapp: boolean; email: string | null; notes?: string | null; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/5 text-navy"><UserRound className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-navy">{name || <span className="font-normal text-gray-400">غير مسجَّل</span>}</p>
          <p className="truncate text-[11.5px] text-gray-500">{role}{email ? ` · ${email}` : ""}</p>
          {notes && <p className="truncate text-[11px] text-gray-400">{notes}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PhoneActions phone={phone} hasWhatsapp={hasWhatsapp} name={name ?? undefined} />
        {action}
      </div>
    </li>
  );
}

function ContactFormModal({ schoolId, contact, onClose, onSaved }: { schoolId: string; contact: Contact | null; onClose: () => void; onSaved: () => void }) {
  const { add } = useToast();
  const [f, setF] = useState({ role: contact?.role ?? "وكيل المدرسة", name: contact?.name ?? "", phone: contact?.phone ?? "", hasWhatsapp: contact?.hasWhatsapp ?? true, email: contact?.email ?? "", notes: contact?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [allowInvalid, setAllowInvalid] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setPhoneError(null);
    try {
      const r = await fetch(contact ? `/api/schools/${schoolId}/contacts/${contact.id}` : `/api/schools/${schoolId}/contacts`, {
        method: contact ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, phone: f.phone || null, email: f.email || null, notes: f.notes || null, allowInvalidPhone: allowInvalid }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.invalidPhone) setPhoneError(d.message);
        throw new Error(d.message || "تعذّر الحفظ");
      }
      add({ type: "success", message: d.message });
      onSaved();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={contact ? "تعديل جهة اتصال" : "إضافة جهة اتصال"} description="رقم الجوال اليمني 9 خانات يبدأ بـ7 (مثال: 73 877 0724)" width="sm">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
        <div>
          <label className="label">المسمى</label>
          <input className="input" list="contact-roles" value={f.role} onChange={(e) => set("role", e.target.value)} maxLength={60} required />
          <datalist id="contact-roles">{CONTACT_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div><label className="label">الاسم</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required /></div>
        <div>
          <label className="label">رقم الهاتف</label>
          <input className="input" dir="ltr" inputMode="tel" placeholder="77X XXX XXX" value={f.phone} onChange={(e) => { set("phone", e.target.value); setPhoneError(null); setAllowInvalid(false); }} />
          {phoneError && (
            <div className="mt-1.5 rounded-lg bg-warning/10 p-2 text-[12px] text-warning">
              <p>{phoneError}</p>
              <label className="mt-1 flex items-center gap-1.5 text-gray-700"><input type="checkbox" checked={allowInvalid} onChange={(e) => setAllowInvalid(e.target.checked)} /> احفظ الرقم كما هو رغم ذلك</label>
            </div>
          )}
          <label className="mt-2 flex items-center gap-2 text-[12.5px] text-gray-700"><input type="checkbox" checked={f.hasWhatsapp} onChange={(e) => set("hasWhatsapp", e.target.checked)} /> هذا الرقم عليه واتساب</label>
        </div>
        <div><label className="label">البريد الإلكتروني (اختياري)</label><input className="input" type="email" dir="ltr" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="label">ملاحظات (اختياري)</label><input className="input" value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} placeholder="مثال: متاح بعد الظهر" /></div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {contact ? "حفظ" : "إضافة"}</button>
        </div>
      </form>
    </Modal>
  );
}
