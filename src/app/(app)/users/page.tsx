"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { UserPlus, Search, ShieldCheck, Lock, CheckCircle2, Users } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  role_key: string;
  role_name: string;
  is_active: number;
  is_locked: number;
  school_name: string | null;
  directorate_name: string | null;
  last_login_at: string | null;
};

export default function UsersPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [directorates, setDirectorates] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users?search=${encodeURIComponent(search)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setUsers(json.users ?? []);
      setRoles(json.roles ?? []);
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل المستخدمين" });
    } finally {
      setLoading(false);
    }
  }, [search, add]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/schools?limit=100", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((d) => setSchools(d.schools ?? []))
      .catch(() => {});
    fetch("/api/lookup/directorates", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { directorates: [] }))
      .then((d) => setDirectorates(d.directorates ?? []))
      .catch(() => {});
  }, [open]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          roleKey: fd.get("roleKey"),
          schoolId: fd.get("schoolId") || undefined,
          directorateId: fd.get("directorateId") || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
      setOpen(false);
      load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (user && user.roleKey !== "SUPER_ADMIN") {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <h2 className="font-heading font-bold text-navy mb-1">غير مصرّح</h2>
        <p className="text-sm text-gray-600">إدارة المستخدمين مقصورة على مدير النظام.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="المستخدمون والأدوار"
        subtitle="الصلاحيات مطبَّقة في الخادم وقاعدة البيانات، لا في الواجهة فقط"
        icon={Users}
        actions={
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-soft transition"
        >
          <UserPlus className="w-4 h-4" /> مستخدم جديد
        </button>
        }
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-4 font-medium text-right">الاسم</th>
                <th className="py-3 pr-4 font-medium text-right">البريد</th>
                <th className="py-3 pr-4 font-medium text-right">الدور</th>
                <th className="py-3 pr-4 font-medium text-right">النطاق</th>
                <th className="py-3 pr-4 font-medium text-right">الحالة</th>
                <th className="py-3 pr-4 font-medium text-right">آخر دخول</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">جارٍ التحميل…</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 pr-4 font-medium text-navy">{u.name}</td>
                  <td className="py-3 pr-4 text-gray-600 font-mono text-xs">{u.email}</td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-navy/5 text-navy">
                      <ShieldCheck className="w-3 h-3" />
                      {u.role_name}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-600 text-xs">
                    {u.school_name ?? u.directorate_name ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {u.is_locked === 1 ? (
                      <span className="text-[11px] text-error inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> مقفل
                      </span>
                    ) : u.is_active === 1 ? (
                      <span className="text-[11px] text-success inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> نشط
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-500">معطّل</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-600 text-xs font-mono">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("ar-YE") : "لم يدخل بعد"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-heading text-navy font-bold mb-4">مستخدم جديد</h2>
            <form onSubmit={create} className="space-y-3">
              <input name="name" required minLength={3} placeholder="الاسم الكامل*"
                className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm" />
              <input name="email" type="email" required placeholder="البريد الإلكتروني*"
                className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm" />
              <input name="password" type="password" required minLength={10}
                placeholder="كلمة المرور (10 أحرف، حروف وأرقام)*"
                className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm" />
              <select name="roleKey" required className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                <option value="">اختر الدور*</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
              <select name="schoolId" className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                <option value="">المدرسة (لأدوار المدرسة)</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select name="directorateId" className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                <option value="">المديرية (للمفتش)</option>
                {directorates.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <div className="flex gap-2 pt-1">
                <button disabled={busy} className="flex-1 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold disabled:opacity-60">
                  {busy ? "جارٍ الإنشاء…" : "إنشاء"}
                </button>
                <button type="button" onClick={() => setOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
