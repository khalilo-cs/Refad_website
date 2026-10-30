"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Lock, LockOpen, LogOut, Pencil, Power, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Modal, PageHeader } from "@/components/ui";
import { ConfirmDialog, Pagination, useDebounced } from "@/components/ui/extra";
import { PhoneActions } from "@/components/ui/contact";
import { BulkPrincipalsModal } from "@/components/users/bulk-principals-modal";
import { CredentialsModal, type Credentials } from "@/components/users/credentials-card";
import { useSession, useToast } from "@/components/providers";

type U = {
  id: string; name: string; email: string; username: string | null; phone: string | null; has_whatsapp: number; job_title: string | null;
  must_change_password: number; role_key: string; role_name: string; is_active: number; is_locked: number;
  school_id: string | null; directorate_id: string | null; school_name: string | null; school_code: string | null; directorate_name: string | null; last_login_at: string | null;
};
type Lookup = { id: string; name: string; code?: string; directorate_id?: string };

const STATUS = [
  ["", "كل الحالات"], ["active", "نشط"], ["inactive", "معطّل"], ["locked", "مقفل"], ["never", "لم يدخل بعد"], ["mustchange", "ينتظر تغيير كلمة المرور"],
] as const;
const SCHOOL_ROLES = ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];
const DIR_ROLES = ["INSPECTOR", "EDUCATION_DIRECTOR"];

export default function UsersPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [rows, setRows] = useState<U[]>([]);
  const [roles, setRoles] = useState<{ key: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const search = useDebounced(q, 350);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [schools, setSchools] = useState<Lookup[]>([]);
  const [dirs, setDirs] = useState<Lookup[]>([]);
  const [form, setForm] = useState<{ user: U | null } | null>(null);
  const [creds, setCreds] = useState<{ name: string; phone: string | null; hasWhatsapp: boolean; credentials: Credentials } | null>(null);
  const [confirm, setConfirm] = useState<{ u: U; kind: "reset" | "lock" | "unlock" | "disable" | "enable" | "revoke" } | null>(null);
  const [bulk, setBulk] = useState(false);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ search, limit: String(limit), page: String(page) });
      if (role) p.set("role", role);
      if (status) p.set("status", status);
      const res = await fetch(`/api/users?${p}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setRows(json.users ?? []);
      setRoles(json.roles ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل المستخدمين" });
    } finally {
      setLoading(false);
    }
  }, [search, role, status, page, add]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, role, status]);
  useEffect(() => {
    fetch("/api/lookup/schools", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setSchools(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/lookup/directorates", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setDirs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const patch = async (u: U, body: object, ok?: string) => {
    const r = await fetch(`/api/users/${u.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) return add({ type: "error", message: d.message }), null;
    add({ type: "success", message: ok ?? d.message });
    void load();
    return d;
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { u, kind } = confirm;
    setConfirm(null);
    if (kind === "reset") {
      const d = await patch(u, { resetPassword: true });
      if (d?.credentials) setCreds({ name: u.name, phone: u.phone, hasWhatsapp: u.has_whatsapp !== 0, credentials: d.credentials });
    } else if (kind === "lock") await patch(u, { isLocked: true }, "تم قفل الحساب");
    else if (kind === "unlock") await patch(u, { isLocked: false }, "تم فتح الحساب");
    else if (kind === "disable") await patch(u, { isActive: false }, "تم تعطيل الحساب");
    else if (kind === "enable") await patch(u, { isActive: true }, "تم تفعيل الحساب");
    else await patch(u, { revokeSessions: true }, "أُنهيت جلسات المستخدم");
  };

  if (user && user.roleKey !== "SUPER_ADMIN") {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-10 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-gray-400" />
        <h2 className="mb-1 font-heading font-bold text-navy">غير مصرّح</h2>
        <p className="text-sm text-gray-600">إدارة المستخدمين مقصورة على مدير النظام.</p>
      </div>
    );
  }

  const CONFIRM_TEXT = {
    reset: ["إعادة تعيين كلمة المرور", "ستُولَّد كلمة مرور مؤقتة جديدة وتُنهى جلسات المستخدم، وسيُطلب منه تغييرها عند الدخول."],
    lock: ["قفل الحساب", "لن يستطيع المستخدم الدخول حتى تفتح الحساب."],
    unlock: ["فتح الحساب", "سيستطيع المستخدم الدخول مجدداً."],
    disable: ["تعطيل الحساب", "سيُنهى دخول المستخدم ولن يستطيع الدخول حتى تعيد تفعيله."],
    enable: ["تفعيل الحساب", "سيستطيع المستخدم الدخول مجدداً."],
    revoke: ["إنهاء كل الجلسات", "سيُطلب من المستخدم تسجيل الدخول من جديد على كل أجهزته."],
  } as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="المستخدمون والأدوار"
        subtitle="إنشاء الحسابات وتسليم بيانات الدخول والتواصل مع أصحابها، والصلاحيات مطبَّقة في الخادم"
        icon={Users}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setBulk(true)} className="btn btn-ghost btn-sm"><Users className="h-4 w-4" /> حسابات مدراء المدارس</button>
            <button onClick={() => setForm({ user: null })} className="btn btn-primary btn-sm"><UserPlus className="h-4 w-4" /> مستخدم جديد</button>
          </div>
        }
      />

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث: اسم، بريد، اسم دخول، هاتف، مدرسة…" className="input ps-9" aria-label="بحث" />
          </div>
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="الدور">
            <option value="">كل الأدوار</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="ms-auto text-[12px] text-gray-500">{total} مستخدم</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                {["المستخدم", "الدخول", "الاتصال", "الدور والنطاق", "الحالة", "آخر دخول", ""].map((h) => <th key={h} className="py-3 pe-4 ps-3 text-right font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="py-8 text-center text-gray-500">جارٍ التحميل…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">لا مستخدمين مطابقون</td></tr>}
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 align-top hover:bg-gray-50/50">
                  <td className="py-3 pe-4 ps-3">
                    <p className="font-medium text-navy">{u.name}</p>
                    {u.job_title && <p className="text-[11.5px] text-gray-500">{u.job_title}</p>}
                  </td>
                  <td className="py-3 pe-4 ps-3 font-mono text-[11.5px] text-gray-600" dir="ltr">
                    {u.username ?? (u.email.endsWith("@no-email.invalid") ? "—" : u.email)}
                  </td>
                  <td className="py-3 pe-4 ps-3"><PhoneActions phone={u.phone} hasWhatsapp={u.has_whatsapp !== 0} name={u.name} /></td>
                  <td className="py-3 pe-4 ps-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2 py-1 text-[11px] text-navy"><ShieldCheck className="h-3 w-3" />{u.role_name}</span>
                    <p className="mt-1 text-[11.5px] text-gray-500">{u.school_name ?? u.directorate_name ?? "—"}</p>
                  </td>
                  <td className="py-3 pe-4 ps-3 text-[11.5px]">
                    {u.is_locked === 1 ? <span className="inline-flex items-center gap-1 text-danger"><Lock className="h-3 w-3" /> مقفل</span>
                      : u.is_active === 1 ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> نشط</span>
                      : <span className="text-gray-500">معطّل</span>}
                    {u.must_change_password === 1 && <p className="mt-0.5 text-warning">بانتظار تغيير كلمة المرور</p>}
                  </td>
                  <td className="py-3 pe-4 ps-3 text-[11.5px] text-gray-600">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("ar-YE") : "لم يدخل بعد"}</td>
                  <td className="py-3 pe-3 ps-1">
                    <div className="flex gap-0.5">
                      <IconBtn label="تعديل" onClick={() => setForm({ user: u })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn label="إعادة تعيين كلمة المرور" onClick={() => setConfirm({ u, kind: "reset" })}><KeyRound className="h-3.5 w-3.5" /></IconBtn>
                      {u.is_locked === 1
                        ? <IconBtn label="فتح الحساب" onClick={() => setConfirm({ u, kind: "unlock" })}><LockOpen className="h-3.5 w-3.5" /></IconBtn>
                        : <IconBtn label="قفل الحساب" onClick={() => setConfirm({ u, kind: "lock" })} disabled={u.id === user?.userId}><Lock className="h-3.5 w-3.5" /></IconBtn>}
                      <IconBtn label={u.is_active === 1 ? "تعطيل" : "تفعيل"} onClick={() => setConfirm({ u, kind: u.is_active === 1 ? "disable" : "enable" })} disabled={u.id === user?.userId}><Power className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn label="إنهاء الجلسات" onClick={() => setConfirm({ u, kind: "revoke" })}><LogOut className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3"><Pagination page={page} totalPages={Math.max(1, Math.ceil(total / limit))} onPage={setPage} total={total} /></div>
      </div>

      {form && (
        <UserFormModal
          user={form.user} roles={roles} schools={schools} dirs={dirs}
          onClose={() => setForm(null)}
          onSaved={(c, u) => { setForm(null); void load(); if (c) setCreds({ name: u.name, phone: u.phone, hasWhatsapp: u.hasWhatsapp, credentials: c }); }}
        />
      )}
      {bulk && <BulkPrincipalsModal onClose={() => setBulk(false)} onDone={load} />}
      {creds && <CredentialsModal name={creds.name} phone={creds.phone} hasWhatsapp={creds.hasWhatsapp} credentials={creds.credentials} onClose={() => setCreds(null)} />}
      <ConfirmDialog
        open={!!confirm} tone={confirm && ["lock", "disable"].includes(confirm.kind) ? "danger" : "primary"}
        title={confirm ? `${CONFIRM_TEXT[confirm.kind][0]} — ${confirm.u.name}` : ""} message={confirm ? CONFIRM_TEXT[confirm.kind][1] : ""}
        confirmLabel="تأكيد" onConfirm={runConfirm} onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function IconBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-navy disabled:cursor-not-allowed disabled:opacity-30">{children}</button>
  );
}

function UserFormModal({ user, roles, schools, dirs, onClose, onSaved }: {
  user: U | null; roles: { key: string; name: string }[]; schools: Lookup[]; dirs: Lookup[];
  onClose: () => void; onSaved: (c: Credentials | null, u: { name: string; phone: string | null; hasWhatsapp: boolean }) => void;
}) {
  const { add } = useToast();
  const [f, setF] = useState({
    name: user?.name ?? "", username: user?.username ?? "", email: user && !user.email.endsWith("@no-email.invalid") ? user.email : "",
    roleKey: user?.role_key ?? "", schoolId: user?.school_id ?? "", directorateId: user?.directorate_id ?? "", phone: user?.phone ?? "",
    hasWhatsapp: user ? user.has_whatsapp !== 0 : true, jobTitle: user?.job_title ?? "", manualPw: "", mustChange: true,
  });
  const [schoolQ, setSchoolQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [phoneBad, setPhoneBad] = useState<string | null>(null);
  const [allowBad, setAllowBad] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const needSchool = SCHOOL_ROLES.includes(f.roleKey);
  const needDir = DIR_ROLES.includes(f.roleKey);
  const shown = schools.filter((s) => !schoolQ || s.name.includes(schoolQ) || (s.code ?? "").toLowerCase().includes(schoolQ.toLowerCase()));

  const submit = async () => {
    setBusy(true);
    setPhoneBad(null);
    try {
      const body: any = {
        name: f.name, username: f.username || (user ? null : undefined), phone: f.phone || null, hasWhatsapp: f.hasWhatsapp, jobTitle: f.jobTitle || null,
        roleKey: f.roleKey, schoolId: needSchool ? f.schoolId || undefined : null, directorateId: needDir ? f.directorateId || undefined : null, allowInvalidPhone: allowBad,
      };
      if (f.email) body.email = f.email;
      if (!user) { body.mustChangePassword = f.mustChange; if (f.manualPw) body.password = f.manualPw; }
      const res = await fetch(user ? `/api/users/${user.id}` : "/api/users", { method: user ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { if (d.invalidPhone) setPhoneBad(d.message); throw new Error(d.message || "تعذّر الحفظ"); }
      add({ type: "success", message: d.message });
      onSaved(d.credentials ?? null, { name: f.name, phone: f.phone || null, hasWhatsapp: f.hasWhatsapp });
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={user ? "تعديل مستخدم" : "مستخدم جديد"} description={user ? undefined : "اترك كلمة المرور فارغة لتُولَّد تلقائياً وتُسلَّم لصاحبها"} width="lg">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">الاسم الكامل *</label><input className="input" required minLength={3} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className="label">المسمى الوظيفي</label><input className="input" value={f.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="مثال: مدير المدرسة" maxLength={80} /></div>
          <div>
            <label className="label">اسم المستخدم للدخول</label>
            <input className="input" dir="ltr" value={f.username} onChange={(e) => set("username", e.target.value.toLowerCase())} placeholder="مثال: school.001" autoCapitalize="none" />
            <p className="mt-1 text-[11px] text-gray-400">حروف لاتينية صغيرة وأرقام (3–40). مناسب لمن لا يملك بريداً.</p>
          </div>
          <div><label className="label">البريد الإلكتروني (اختياري مع اسم المستخدم)</label><input className="input" type="email" dir="ltr" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div>
            <label className="label">الدور *</label>
            <select className="input" required value={f.roleKey} onChange={(e) => set("roleKey", e.target.value)}>
              <option value="">اختر…</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">هاتف المستخدم</label>
            <input className="input" dir="ltr" inputMode="tel" placeholder="77X XXX XXX" value={f.phone} onChange={(e) => { set("phone", e.target.value); setPhoneBad(null); setAllowBad(false); }} />
            {phoneBad && <div className="mt-1 rounded-lg bg-warning/10 p-2 text-[12px] text-warning"><p>{phoneBad}</p><label className="mt-1 flex items-center gap-1.5 text-gray-700"><input type="checkbox" checked={allowBad} onChange={(e) => setAllowBad(e.target.checked)} /> احفظ الرقم كما هو رغم ذلك</label></div>}
            <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-gray-700"><input type="checkbox" checked={f.hasWhatsapp} onChange={(e) => set("hasWhatsapp", e.target.checked)} /> هذا الرقم عليه واتساب</label>
          </div>
        </div>
        {needSchool && (
          <div>
            <label className="label">المدرسة *</label>
            <input className="input mb-1.5" placeholder="ابحث عن المدرسة بالاسم أو الرمز…" value={schoolQ} onChange={(e) => setSchoolQ(e.target.value)} />
            <select className="input" required value={f.schoolId} onChange={(e) => set("schoolId", e.target.value)} size={Math.min(6, Math.max(2, shown.length + 1))}>
              <option value="">اختر المدرسة…</option>{shown.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` — ${s.code}` : ""}</option>)}
            </select>
          </div>
        )}
        {needDir && (
          <div>
            <label className="label">المديرية *</label>
            <select className="input" required value={f.directorateId} onChange={(e) => set("directorateId", e.target.value)}>
              <option value="">اختر…</option>{dirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {!user && (
          <fieldset className="rounded-xl border border-gray-200 p-3">
            <legend className="px-2 text-[12px] font-semibold text-gray-600">كلمة المرور</legend>
            <input className="input" dir="ltr" type="text" autoComplete="off" value={f.manualPw} onChange={(e) => set("manualPw", e.target.value)} placeholder="فارغة = توليد كلمة قوية تلقائياً (موصى به)" />
            <label className="mt-2 flex items-center gap-2 text-[12.5px] text-gray-700"><input type="checkbox" checked={f.mustChange} onChange={(e) => set("mustChange", e.target.checked)} /> إلزامه بتغيير كلمة المرور عند أول دخول</label>
          </fieldset>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {user ? "حفظ" : "إنشاء"}</button>
        </div>
      </form>
    </Modal>
  );
}
