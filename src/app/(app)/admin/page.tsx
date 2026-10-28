"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, useToast } from "@/components/providers";
import { Building2, MapPin, Users, SlidersHorizontal, Plus, Pencil, Trash2, ShieldAlert, Search, Save, KeyRound, Ban, CheckCircle2, Layers, ListTree, ShieldCheck, History, Download } from "lucide-react";
import {
  PageHeader,
  Modal,
  Alert,
  TableShell,
  LoadingRows,
  EmptyState,
} from "@/components/ui";
import StructureManager from "@/components/admin/structure-manager";
import RolesManager from "@/components/admin/roles-manager";
import AuditLog from "@/components/admin/audit-log";

type Tab = "schools" | "geo" | "users" | "structure" | "scale" | "roles" | "audit";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "schools", label: "المدارس", icon: Building2 },
  { key: "geo", label: "المحافظات والمديريات", icon: MapPin },
  { key: "users", label: "المستخدمون", icon: Users },
  { key: "structure", label: "المعايير والمؤشرات", icon: ListTree },
  { key: "scale", label: "مقياس التقدير", icon: SlidersHorizontal },
  { key: "roles", label: "الأدوار والصلاحيات", icon: ShieldCheck },
  { key: "audit", label: "سجل التدقيق", icon: History },
];

/** مسارات مرجعية قد تُرجع مصفوفة مباشرة أو كائناً مغلَّفاً بالمفتاح. */
function listOf<T = any>(data: any, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data[key])) return data[key] as T[];
  return [];
}

export default function AdminPage() {
  const { user, loading: sessionLoading } = useSession();
  const { add } = useToast();
  const [tab, setTab] = useState<Tab>("schools");

  // حالة كل قسم
  const [schools, setSchools] = useState<any[]>([]);
  const [geo, setGeo] = useState<any>({ governorates: [], directorates: [], areas: [] });
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<
    | null
    | { kind: "school" }
    | { kind: "governorate" }
    | { kind: "directorate" }
    | { kind: "area" }
    | { kind: "user" }
    | { kind: "editUser"; data: any }
    | { kind: "password"; data: any }
    | { kind: "editGeo"; data: any; type: string }
  >(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    | null
    | { kind: "school"; id: string; label: string }
    | { kind: "geo"; id: string; type: string; label: string }
  >(null);

  const isAdmin = user?.roleKey === "SUPER_ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "schools") {
        const res = await fetch(`/api/schools?limit=100&search=${encodeURIComponent(search)}&status=ALL`, {
          credentials: "include",
        });
        const json = await res.json();
        setSchools(json.schools ?? []);
      } else if (tab === "geo") {
        const res = await fetch("/api/admin/reference", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setGeo(json);
      } else if (tab === "users") {
        const res = await fetch("/api/users?limit=200", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setUsers(json.users ?? []);
        setRoles(json.roles ?? []);
      } else {
        const res = await fetch("/api/settings", { credentials: "include" });
        const json = await res.json();
        setRatings(json.ratingScale ?? []);
      }
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل البيانات" });
    } finally {
      setLoading(false);
    }
  }, [tab, search, add]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- عمليات ---------- */

  const post = async (url: string, body: any, method = "POST") => {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "فشلت العملية");
    return json;
  };

  const submit = async (fn: () => Promise<any>, okMsg?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      add({ type: "success", message: okMsg ?? r?.message ?? "تم الحفظ" });
      setModal(null);
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      let res: Response;
      if (confirmDelete.kind === "school") {
        res = await fetch(`/api/schools/${confirmDelete.id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } else {
        res = await fetch(
          `/api/admin/reference/${confirmDelete.id}?type=${confirmDelete.type}`,
          { method: "DELETE", credentials: "include" }
        );
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (sessionLoading) {
    return <div className="skeleton h-64 w-full" />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-10 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <h2 className="font-heading text-xl font-bold text-navy">صلاحية غير كافية</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            لوحة الإدارة الشاملة مقصورة على مدير النظام. تُفحص الصلاحية في الخادم أيضاً،
            وليس في هذه الشاشة وحدها.
          </p>
        </div>
      </div>
    );
  }

  const totalSchools = schools.length;
  const activeSchools = schools.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title="لوحة الإدارة الشاملة"
        subtitle="المدارس، البيانات المرجعية، المستخدمون، المعايير والمؤشرات، مقياس التقدير، الأدوار والصلاحيات، وسجل التدقيق — كل ما تحتاجه من مكان واحد، بلا تعديل في الكود."
        actions={
          <>
            <a
              href="/api/admin/backup"
              className="btn btn-ghost btn-sm"
              title="تنزيل نسخة متسقة من قاعدة البيانات"
            >
              <Download className="h-3.5 w-3.5" /> نسخة احتياطية
            </a>
            <button onClick={() => setTab("audit")} className="btn btn-primary btn-sm">
              <History className="h-3.5 w-3.5" /> سجل التدقيق
            </button>
          </>
        }
      />

      {/* تبويبات */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-gray-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
                active
                  ? "bg-gradient-to-br from-navy to-navy-soft text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ============ المدارس ============ */}
      {tab === "schools" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الكود…"
                className="input pl-9"
              />
            </div>
            <button onClick={() => setModal({ kind: "school" })} className="btn btn-primary">
              <Plus className="h-4 w-4" /> إضافة مدرسة
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-3">
              <p className="text-[11px] text-gray-600">إجمالي المدارس</p>
              <p className="font-heading text-xl font-bold text-navy">{totalSchools}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] text-gray-600">النشطة</p>
              <p className="font-heading text-xl font-bold text-success">{activeSchools}</p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] text-gray-600">المؤرشفة</p>
              <p className="font-heading text-xl font-bold text-gray-400">
                {schools.filter((s) => s.status === "ARCHIVED").length}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[11px] text-gray-600">المديريات المغطاة</p>
              <p className="font-heading text-xl font-bold text-turquoise">
                {new Set(schools.map((s) => s.directorate)).size}
              </p>
            </div>
          </div>

          <TableShell>
            <table className="table-clean">
              <thead>
                <tr>
                  <th>المدرسة</th>
                  <th>الكود</th>
                  <th>المديرية</th>
                  <th>النوع</th>
                  <th>الحالة</th>
                  <th className="text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRows cols={6} />}
                {!loading && schools.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={Building2}
                        title="لا توجد مدارس"
                        description="أضف أول مدرسة أو استوردها من ملف Excel."
                        action={
                          <button onClick={() => setModal({ kind: "school" })} className="btn btn-teal btn-sm">
                            <Plus className="h-3.5 w-3.5" /> إضافة مدرسة
                          </button>
                        }
                      />
                    </td>
                  </tr>
                )}
                {!loading &&
                  schools.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-medium text-navy">{s.name}</div>
                        <div className="text-[11px] text-gray-400">{s.governorate}</div>
                      </td>
                      <td className="font-mono text-xs text-gray-600">{s.code}</td>
                      <td className="text-gray-600">{s.directorate}</td>
                      <td className="text-gray-600">
                        {s.type} · {s.stage}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            s.status === "ACTIVE"
                              ? "badge-success"
                              : s.status === "ARCHIVED"
                                ? "badge-neutral"
                                : "badge-warning"
                          }`}
                        >
                          {s.status === "ACTIVE"
                            ? "نشطة"
                            : s.status === "ARCHIVED"
                              ? "مؤرشفة"
                              : "غير نشطة"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <a
                            href={`/schools/${s.id}`}
                            className="btn btn-ghost btn-sm"
                            title="عرض الملف"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </a>
                          <button
                            onClick={() =>
                              setConfirmDelete({ kind: "school", id: s.id, label: s.name })
                            }
                            className="btn btn-danger btn-sm"
                            title="أرشفة"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}

      {/* ============ البيانات الجغرافية ============ */}
      {tab === "geo" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              أضف المحافظات والمديريات والمناطق التي تعمل فيها المنصة. يُمنع الحذف إذا كانت
              هناك مدارس مرتبطة.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setModal({ kind: "governorate" })} className="btn btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> محافظة
              </button>
              <button onClick={() => setModal({ kind: "directorate" })} className="btn btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> مديرية
              </button>
              <button onClick={() => setModal({ kind: "area" })} className="btn btn-ghost btn-sm">
                <Plus className="h-3.5 w-3.5" /> منطقة
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* المحافظات */}
            <div className="card overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50/60 px-4 py-2.5">
                <h3 className="font-heading text-sm font-bold text-navy">
                  المحافظات ({geo.governorates?.length ?? 0})
                </h3>
              </div>
              <ul className="divide-y divide-gray-100">
                {loading && (
                  <li className="p-4">
                    <div className="skeleton h-4 w-full" />
                  </li>
                )}
                {geo.governorates?.map((g: any) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy">{g.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {g.code} · {g.usage} مدرسة
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() =>
                          setModal({ kind: "editGeo", data: g, type: "governorate" })
                        }
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
                        title="تعديل"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            kind: "geo",
                            id: g.id,
                            type: "governorate",
                            label: g.name,
                          })
                        }
                        className="rounded p-1.5 text-gray-400 hover:bg-danger-soft hover:text-danger"
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
                {!loading && geo.governorates?.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-gray-500">لا توجد محافظات</li>
                )}
              </ul>
            </div>

            {/* المديريات */}
            <div className="card overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50/60 px-4 py-2.5">
                <h3 className="font-heading text-sm font-bold text-navy">
                  المديريات ({geo.directorates?.length ?? 0})
                </h3>
              </div>
              <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
                {geo.directorates?.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy">{d.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {d.governorate_name} · {d.usage} مدرسة
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() => setModal({ kind: "editGeo", data: d, type: "directorate" })}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            kind: "geo",
                            id: d.id,
                            type: "directorate",
                            label: d.name,
                          })
                        }
                        className="rounded p-1.5 text-gray-400 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
                {!loading && geo.directorates?.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-gray-500">لا توجد مديريات</li>
                )}
              </ul>
            </div>

            {/* المناطق */}
            <div className="card overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50/60 px-4 py-2.5">
                <h3 className="font-heading text-sm font-bold text-navy">
                  المناطق ({geo.areas?.length ?? 0})
                </h3>
              </div>
              <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
                {geo.areas?.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy">{a.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {a.directorate_name} · {a.usage} مدرسة
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() => setModal({ kind: "editGeo", data: a, type: "area" })}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDelete({ kind: "geo", id: a.id, type: "area", label: a.name })
                        }
                        className="rounded p-1.5 text-gray-400 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
                {!loading && geo.areas?.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-gray-500">لا توجد مناطق</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ============ المستخدمون ============ */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              إدارة الحسابات والأدوار. أي تعديل على الدور أو كلمة المرور يُبطل جلسات المستخدم.
            </p>
            <button onClick={() => setModal({ kind: "user" })} className="btn btn-primary">
              <Plus className="h-4 w-4" /> مستخدم جديد
            </button>
          </div>

          <TableShell>
            <table className="table-clean">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>البريد</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th className="text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRows cols={5} />}
                {!loading &&
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium text-navy">{u.name}</td>
                      <td className="font-mono text-xs text-gray-600">{u.email}</td>
                      <td>
                        <span className="badge badge-info">{u.role_name}</span>
                      </td>
                      <td>
                        {u.is_locked === 1 ? (
                          <span className="badge badge-danger">مقفل</span>
                        ) : u.is_active === 1 ? (
                          <span className="badge badge-success">نشط</span>
                        ) : (
                          <span className="badge badge-neutral">معطّل</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setModal({ kind: "editUser", data: u })}
                            className="btn btn-ghost btn-sm"
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setModal({ kind: "password", data: u })}
                            className="btn btn-ghost btn-sm"
                            title="إعادة تعيين كلمة المرور"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              submit(() =>
                                post(`/api/users/${u.id}`, { isLocked: u.is_locked !== 1 })
                              )
                            }
                            className={`btn btn-sm ${u.is_locked === 1 ? "btn-teal" : "btn-danger"}`}
                            title={u.is_locked === 1 ? "فك القفل" : "قفل الحساب"}
                          >
                            {u.is_locked === 1 ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}

      {/* ============ مقياس التقدير ============ */}
      {/* ============ المعايير والمؤشرات ============ */}
      {tab === "structure" && <StructureManager />}
      {tab === "roles" && <RolesManager />}
      {tab === "audit" && <AuditLog />}

      {/* ============ مقياس التقدير ============ */}
      {tab === "scale" && (
        <div className="space-y-4">
          <Alert tone="info" title="أثر التعديل">
            تغيير الدرجة العظمى يؤثر على حساب نسبة تحقق كل معيار فرعي في التقييمات الجديدة.
            لا تكرّر الدرجة نفسها مرتين.
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2">
            {ratings.map((r) => (
              <form
                key={r.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  submit(() =>
                    post("/api/settings", {
                      ratingId: r.id,
                      label_ar: fd.get("label"),
                      score: Number(fd.get("score")),
                    })
                  );
                }}
                className="card p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-soft font-heading text-lg font-bold text-gold-bright">
                    {r.score}
                  </span>
                  <input
                    name="label"
                    defaultValue={r.label_ar}
                    className="input flex-1"
                    aria-label="تسمية الدرجة"
                  />
                  <input
                    name="score"
                    type="number"
                    min={0}
                    defaultValue={r.score}
                    className="input w-16 text-center"
                    aria-label="قيمة الدرجة"
                  />
                  <button disabled={busy} className="btn btn-primary btn-sm" title="حفظ">
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`حذف المستوى «${r.label_ar}»؟`)) return;
                      submit(async () => {
                        const res = await fetch(`/api/settings?ratingId=${r.id}`, {
                          method: "DELETE",
                          credentials: "include",
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.message);
                        return json;
                      });
                    }}
                    className="rounded-lg border border-danger/25 p-2 text-danger transition hover:bg-danger-soft"
                    title="حذف المستوى"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            ))}
          </div>

          {/* إضافة مستوى جديد */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              submit(() =>
                post("/api/settings", {
                  label_ar: fd.get("label_ar"),
                  score: Number(fd.get("score")),
                })
              ).then(() => (e.target as HTMLFormElement).reset());
            }}
            className="card border-dashed p-4"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-navy">
              <Plus className="h-3.5 w-3.5" /> إضافة مستوى إلى المقياس
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                name="label_ar"
                required
                minLength={2}
                placeholder="تسمية المستوى (مثال: متحقق بدرجة ممتازة)"
                className="input flex-1 text-[12px]"
              />
              <input
                name="score"
                type="number"
                min={0}
                required
                placeholder="الدرجة"
                className="input w-24 text-center text-[12px]"
              />
              <button disabled={busy} className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" /> إضافة
              </button>
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              الدرجة العظمى تُحتسب تلقائياً من أعلى قيمة في المقياس.
            </p>
          </form>
        </div>
      )}

      {/* ============ النوافذ المنبثقة ============ */}

      {/* مدرسة */}
      <Modal
        open={modal?.kind === "school"}
        onClose={() => setModal(null)}
        title="إضافة مدرسة"
        description="تُسجَّل المدرسة في نطاق مديريتك، وتظهر فوراً في قائمة المدارس."
        width="lg"
      >
        <SchoolForm
          busy={busy}
          onSubmit={(data) => submit(() => post("/api/schools", data))}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* محافظة */}
      <Modal
        open={modal?.kind === "governorate"}
        onClose={() => setModal(null)}
        title="إضافة محافظة"
      >
        <GeoForm
          busy={busy}
          withCode
          onSubmit={(data) => submit(() => post("/api/admin/reference", { ...data, type: "governorate" }))}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* مديرية */}
      <Modal
        open={modal?.kind === "directorate"}
        onClose={() => setModal(null)}
        title="إضافة مديرية"
      >
        <GeoForm
          busy={busy}
          withCode
          selectLabel="المحافظة"
          options={geo.governorates?.map((g: any) => ({ id: g.id, name: g.name })) ?? []}
          onSubmit={(data) =>
            submit(() =>
              post("/api/admin/reference", {
                type: "directorate",
                name: data.name,
                code: data.code,
                governorateId: data.parentId,
              })
            )
          }
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* منطقة */}
      <Modal open={modal?.kind === "area"} onClose={() => setModal(null)} title="إضافة منطقة">
        <GeoForm
          busy={busy}
          withCode={false}
          selectLabel="المديرية"
          options={geo.directorates?.map((d: any) => ({ id: d.id, name: d.name })) ?? []}
          onSubmit={(data) =>
            submit(() =>
              post("/api/admin/reference", {
                type: "area",
                name: data.name,
                directorateId: data.parentId,
              })
            )
          }
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* تعديل عنصر جغرافي */}
      <Modal
        open={modal?.kind === "editGeo"}
        onClose={() => setModal(null)}
        title="تعديل عنصر"
      >
        {modal?.kind === "editGeo" && (
          <GeoForm
            busy={busy}
            withCode={modal.type !== "area"}
            options={
              modal.type === "directorate"
                ? geo.governorates?.map((g: any) => ({ id: g.id, name: g.name })) ?? []
                : modal.type === "area"
                  ? geo.directorates?.map((d: any) => ({ id: d.id, name: d.name })) ?? []
                  : []
            }
            selectLabel={modal.type === "directorate" ? "المحافظة" : "المديرية"}
            initial={{
              name: modal.data.name,
              code: modal.data.code ?? "",
              parentId:
                modal.type === "directorate"
                  ? modal.data.governorate_id
                  : modal.data.directorate_id,
            }}
            onSubmit={(data) =>
              submit(() =>
                post(
                  `/api/admin/reference/${modal.data.id}?type=${modal.type}`,
                  { name: data.name, code: data.code, parentId: data.parentId },
                  "PATCH"
                )
              )
            }
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* مستخدم جديد */}
      <Modal
        open={modal?.kind === "user"}
        onClose={() => setModal(null)}
        title="مستخدم جديد"
        width="lg"
      >
        <UserForm
          busy={busy}
          roles={roles}
          onSubmit={(data) => submit(() => post("/api/users", data))}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* تعديل مستخدم */}
      <Modal
        open={modal?.kind === "editUser"}
        onClose={() => setModal(null)}
        title="تعديل مستخدم"
        width="lg"
      >
        {modal?.kind === "editUser" && (
          <UserForm
            busy={busy}
            roles={roles}
            initial={modal.data}
            isEdit
            onSubmit={(data) =>
              submit(() => post(`/api/users/${modal.data.id}`, data, "PATCH"))
            }
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* كلمة المرور */}
      <Modal
        open={modal?.kind === "password"}
        onClose={() => setModal(null)}
        title="إعادة تعيين كلمة المرور"
        description="ستُلغى جميع جلسات المستخدم القائمة فوراً."
      >
        {modal?.kind === "password" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              submit(() =>
                post(`/api/users/${modal.data.id}`, { password: fd.get("password") }, "PATCH")
              );
            }}
            className="space-y-4"
          >
            <div>
              <label className="label">كلمة المرور الجديدة ({modal.data.name})</label>
              <input
                name="password"
                type="password"
                required
                minLength={10}
                placeholder="10 أحرف على الأقل، حروف وأرقام"
                className="input"
              />
            </div>
            <div className="flex gap-2">
              <button disabled={busy} className="btn btn-primary flex-1">
                {busy ? "جارٍ الحفظ…" : "تعيين كلمة المرور"}
              </button>
              <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">
                إلغاء
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* تأكيد الحذف */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.kind === "school" ? "أرشفة المدرسة" : "حذف العنصر"}
        width="sm"
      >
        <div className="space-y-4">
          <Alert tone="warning">
            {confirmDelete?.kind === "school" ? (
              <>
                ستُؤرشف «{confirmDelete?.label}»: تختفي من القوائم النشطة مع الاحتفاظ بكل
                زياراتها وتقييماتها وتقاريرها. لا تُحذف أي بيانات تاريخية.
              </>
            ) : (
              <>سيُحذف «{confirmDelete?.label}» نهائياً. لا يمكن التراجع.</>
            )}
          </Alert>
          <div className="flex gap-2">
            <button onClick={doDelete} disabled={busy} className="btn btn-danger flex-1">
              {busy ? "جارٍ التنفيذ…" : confirmDelete?.kind === "school" ? "أرشفة" : "حذف نهائي"}
            </button>
            <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost">
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ==========================================================
   النماذج
   ========================================================== */

function GeoForm({
  onSubmit,
  onCancel,
  busy,
  withCode,
  options,
  selectLabel,
  initial,
}: {
  onSubmit: (d: { name: string; code?: string; parentId?: string }) => void;
  onCancel: () => void;
  busy: boolean;
  withCode: boolean;
  options?: { id: string; name: string }[];
  selectLabel?: string;
  initial?: { name?: string; code?: string; parentId?: string };
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          name: String(fd.get("name") ?? ""),
          code: fd.get("code") ? String(fd.get("code")) : undefined,
          parentId: fd.get("parentId") ? String(fd.get("parentId")) : undefined,
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className="label">الاسم *</label>
        <input name="name" required minLength={2} defaultValue={initial?.name} className="input" />
      </div>
      {withCode && (
        <div>
          <label className="label">الرمز (اختياري)</label>
          <input name="code" defaultValue={initial?.code} className="input font-mono" />
        </div>
      )}
      {options && options.length > 0 && (
        <div>
          <label className="label">{selectLabel} *</label>
          <select name="parentId" required defaultValue={initial?.parentId} className="input">
            <option value="">اختر…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button disabled={busy} className="btn btn-primary flex-1">
          {busy ? "جارٍ الحفظ…" : "حفظ"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          إلغاء
        </button>
      </div>
    </form>
  );
}

function SchoolForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (d: any) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [govs, setGovs] = useState<any[]>([]);
  const [dirs, setDirs] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [govId, setGovId] = useState("");

  useEffect(() => {
    fetch("/api/lookup/governorates", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { governorates: [] }))
      .then((d) => setGovs(listOf(d, "governorates")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!govId) {
      setDirs([]);
      return;
    }
    fetch(`/api/lookup/directorates?governorateId=${govId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { directorates: [] }))
      .then((d) => setDirs(listOf(d, "directorates")))
      .catch(() => {});
  }, [govId]);

  const onDirChange = (dirId: string) => {
    if (!dirId) {
      setAreas([]);
      return;
    }
    fetch(`/api/lookup/areas?directorateId=${dirId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { areas: [] }))
      .then((d) => setAreas(listOf(d, "areas")))
      .catch(() => {});
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          code: fd.get("code"),
          name: fd.get("name"),
          governorateId: fd.get("governorateId"),
          directorateId: fd.get("directorateId"),
          areaId: fd.get("areaId") || undefined,
          type: fd.get("type"),
          stage: fd.get("stage"),
          contactPhone: fd.get("contactPhone") || undefined,
          contactEmail: fd.get("contactEmail") || undefined,
          principalName: fd.get("principalName") || undefined,
          address: fd.get("address") || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">الكود المدرسي *</label>
          <input name="code" required placeholder="RIFAD-001" className="input font-mono" />
        </div>
        <div>
          <label className="label">اسم المدرسة *</label>
          <input name="name" required className="input" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">المحافظة *</label>
          <select
            name="governorateId"
            required
            value={govId}
            onChange={(e) => setGovId(e.target.value)}
            className="input"
          >
            <option value="">اختر…</option>
            {govs.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">المديرية *</label>
          <select
            name="directorateId"
            required
            onChange={(e) => onDirChange(e.target.value)}
            className="input"
            disabled={!govId}
          >
            <option value="">اختر…</option>
            {dirs.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">المنطقة</label>
          <select name="areaId" className="input" disabled={areas.length === 0}>
            <option value="">—</option>
            {areas.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">النوع *</label>
          <select name="type" className="input">
            <option value="حكومية">حكومية</option>
            <option value="أهلية">أهلية</option>
          </select>
        </div>
        <div>
          <label className="label">المرحلة *</label>
          <select name="stage" className="input">
            <option value="أساسي">أساسي</option>
            <option value="ثانوي">ثانوي</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">مدير المدرسة</label>
          <input name="principalName" className="input" />
        </div>
        <div>
          <label className="label">الهاتف</label>
          <input name="contactPhone" className="input" dir="ltr" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">البريد الإلكتروني</label>
          <input name="contactEmail" type="email" className="input" dir="ltr" />
        </div>
        <div>
          <label className="label">العنوان</label>
          <input name="address" className="input" />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button disabled={busy} className="btn btn-primary flex-1">
          {busy ? "جارٍ الحفظ…" : "حفظ المدرسة"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          إلغاء
        </button>
      </div>
    </form>
  );
}

function UserForm({
  onSubmit,
  onCancel,
  busy,
  roles,
  initial,
  isEdit,
}: {
  onSubmit: (d: any) => void;
  onCancel: () => void;
  busy: boolean;
  roles: any[];
  initial?: any;
  isEdit?: boolean;
}) {
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [directorates, setDirectorates] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/schools?limit=100&status=ACTIVE", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((d) => setSchools(d.schools ?? []))
      .catch(() => {});
    fetch("/api/lookup/directorates", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { directorates: [] }))
      .then((d) => setDirectorates(listOf(d, "directorates")))
      .catch(() => {});
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data: any = {
          name: fd.get("name"),
          email: fd.get("email"),
          roleKey: fd.get("roleKey"),
          schoolId: fd.get("schoolId") || undefined,
          directorateId: fd.get("directorateId") || undefined,
        };
        if (!isEdit) data.password = fd.get("password");
        onSubmit(data);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">الاسم الكامل *</label>
          <input name="name" required minLength={3} defaultValue={initial?.name} className="input" />
        </div>
        <div>
          <label className="label">البريد الإلكتروني *</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={initial?.email}
            className="input"
            dir="ltr"
          />
        </div>
      </div>

      {!isEdit && (
        <div>
          <label className="label">كلمة المرور *</label>
          <input
            name="password"
            type="password"
            required
            minLength={10}
            placeholder="10 أحرف على الأقل، حروف وأرقام"
            className="input"
          />
        </div>
      )}

      <div>
        <label className="label">الدور *</label>
        <select name="roleKey" required defaultValue={initial?.role_key} className="input">
          <option value="">اختر الدور…</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">المدرسة</label>
          <select name="schoolId" className="input">
            <option value="">— بلا مدرسة —</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">المديرية</label>
          <select name="directorateId" className="input">
            <option value="">— بلا مديرية —</option>
            {directorates.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
        المدرسة إلزامية لمدير المدرسة ومنسق الجودة، والمديرية إلزامية للمفتش.
      </p>

      <div className="flex gap-2 pt-1">
        <button disabled={busy} className="btn btn-primary flex-1">
          {busy ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إنشاء المستخدم"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          إلغاء
        </button>
      </div>
    </form>
  );
}
