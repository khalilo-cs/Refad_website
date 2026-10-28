"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Users as UsersIcon,
  X,
  Check,
  AlertTriangle,
  Search,
} from "lucide-react";
import { useToast } from "@/components/providers";

type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: string;
  permissions: Record<string, boolean>;
  is_system: number;
  users_count: number;
  created_at: string;
};

type CatalogGroup = {
  key: string;
  label: string;
  description: string;
  permissions: { key: string; label: string; hint: string }[];
};

const emptyForm = {
  key: "",
  name: "",
  description: "",
  permissions: {} as Record<string, boolean>,
};

export default function RolesManager() {
  const { add } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setRoles(json.roles ?? []);
      setCatalog(json.catalog ?? []);
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل الأدوار" });
    } finally {
      setLoading(false);
    }
  }, [add]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.includes(q) ||
        r.key.toLowerCase().includes(q.toLowerCase()) ||
        (r.description ?? "").includes(q)
    );
  }, [roles, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({
      key: r.key,
      name: r.name,
      description: r.description ?? "",
      permissions: { ...r.permissions },
    });
    setOpen(true);
  };

  const toggle = (key: string) => {
    setForm((f) => {
      const next = { ...f.permissions };
      if (key === "all") {
        return { ...f, permissions: next.all ? {} : { all: true } };
      }
      if (next.all) {
        add({ type: "info", message: "أزل «كل الصلاحيات» أولاً لتخصيص صلاحيات فردية" });
        return f;
      }
      if (next[key]) delete next[key];
      else next[key] = true;
      return { ...f, permissions: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        description: form.description,
        permissions: form.permissions,
      };
      if (!editing) payload.key = form.key;

      const res = await fetch(
        editing ? `/api/admin/roles/${editing.id}` : "/api/admin/roles",
        {
          method: editing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);

      add({ type: "success", message: json.message });
      setOpen(false);
      await load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/admin/roles/${confirmDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
      setConfirmDelete(null);
      await load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
      setConfirmDelete(null);
    }
  };

  const grantedCount = (p: Record<string, boolean>) =>
    p.all ? 999 : Object.values(p).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-[17px] font-bold text-navy">
            <ShieldCheck className="h-5 w-5 text-turquoise" /> الأدوار والصلاحيات
          </h2>
          <p className="mt-1 text-[12px] text-gray-600">
            أنشئ أدواراً جديدة أو عدّل صلاحيات الأدوار القائمة. التغيير يسري فوراً على
            الخادم، ولا يحتاج إعادة نشر.
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary btn-sm shrink-0">
          <Plus className="h-3.5 w-3.5" /> دور جديد
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم الدور أو مفتاحه…"
          className="input pr-9 text-[12px]"
        />
      </div>

      {loading && <p className="py-8 text-center text-[12px] text-gray-400">جارٍ التحميل…</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((r) => (
          <div key={r.id} className="card p-4 transition hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-heading text-[14px] font-bold text-navy">{r.name}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-gray-400">{r.key}</p>
              </div>
              {r.is_system === 1 && (
                <span className="badge badge-neutral shrink-0 text-[9px]">
                  <Lock className="h-2.5 w-2.5" /> أساسي
                </span>
              )}
            </div>

            {r.description && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-gray-500">
                {r.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="badge badge-success text-[9.5px]">
                {r.permissions.all ? "كل الصلاحيات" : `${grantedCount(r.permissions)} صلاحية`}
              </span>
              <span className="badge text-[9.5px]">
                <UsersIcon className="h-2.5 w-2.5" /> {r.users_count} مستخدم
              </span>
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-3">
              <button
                onClick={() => openEdit(r)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10.5px] font-medium text-navy transition hover:bg-gray-50"
              >
                <Pencil className="h-3 w-3" /> تعديل الصلاحيات
              </button>
              {r.is_system === 0 && (
                <button
                  onClick={() => setConfirmDelete(r)}
                  className="inline-flex items-center gap-1 rounded-md border border-danger/25 px-2 py-1 text-[10.5px] font-medium text-danger transition hover:bg-danger-soft"
                >
                  <Trash2 className="h-3 w-3" /> حذف
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* نافذة الإنشاء/التعديل */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-deep/55 p-3 py-8 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-3xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="font-heading text-[16px] font-bold text-navy">
                {editing ? `تعديل دور: ${editing.name}` : "دور جديد"}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">اسم الدور *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                    placeholder="مثال: مسؤول متابعة الجودة"
                  />
                </div>
                <div>
                  <label className="label">المفتاح *</label>
                  <input
                    value={form.key}
                    onChange={(e) =>
                      setForm({ ...form, key: e.target.value.toUpperCase().replace(/\s/g, "_") })
                    }
                    disabled={!!editing}
                    dir="ltr"
                    className="input font-mono disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="QUALITY_OFFICER"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    {editing
                      ? "المفتاح لا يُعدَّل بعد الإنشاء لأنه مرتبط بفحوص الصلاحيات."
                      : "أحرف إنجليزية كبيرة وأرقام وشرطات سفلية — يُستخدم داخلياً."}
                  </p>
                </div>
              </div>

              <div>
                <label className="label">الوصف</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input"
                  placeholder="ماذا يفعل صاحب هذا الدور؟"
                />
              </div>

              <div className="rounded-xl border border-warning/25 bg-warning-soft/60 px-3 py-2">
                <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  الأدوار الأساسية في النظام (المفتش، مدير المدرسة…) تبقى تعمل كما هي.
                  الصلاحيات الفردية تمنح وصولاً إضافياً للأدوار الجديدة؛ وبعض الشاشات
                  الإدارية تظل حصراً على مدير النظام.
                </p>
              </div>

              {catalog.map((group) => (
                <div key={group.key} className="rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-3 py-2">
                    <div>
                      <p className="text-[12px] font-semibold text-navy">{group.label}</p>
                      <p className="text-[10px] text-gray-400">{group.description}</p>
                    </div>
                    {group.key === "admin" && (
                      <span className="badge badge-danger text-[9px]">حساس</span>
                    )}
                  </div>
                  <div className="grid gap-1.5 p-3 sm:grid-cols-2">
                    {group.permissions.map((p) => {
                      const active = !!form.permissions[p.key];
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => toggle(p.key)}
                          title={p.hint}
                          className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-right transition ${
                            active
                              ? "border-turquoise/50 bg-turquoise-soft/60"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              active
                                ? "border-turquoise bg-turquoise text-white"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {active && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[11.5px] font-medium text-navy">
                              {p.label}
                            </span>
                            <span className="block text-[10px] leading-snug text-gray-400">
                              {p.hint}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
              <p className="text-[10px] text-gray-400">
                {form.permissions.all
                  ? "هذا الدور يملك كل الصلاحيات"
                  : `${grantedCount(form.permissions)} صلاحية محددة`}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
                  إلغاء
                </button>
                <button
                  onClick={save}
                  disabled={saving || !form.name.trim() || (!editing && !form.key.trim())}
                  className="btn btn-primary btn-sm"
                >
                  {saving ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إنشاء الدور"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/55 p-4 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-[15px] font-bold text-navy">حذف الدور؟</h3>
            <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
              سيُحذف الدور «{confirmDelete.name}» نهائياً. لا يمكن الحذف إن كان مرتبطاً
              بمستخدمين — انقلهم إلى دور آخر أولاً.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-sm">
                إلغاء
              </button>
              <button onClick={remove} className="btn btn-danger btn-sm">
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
