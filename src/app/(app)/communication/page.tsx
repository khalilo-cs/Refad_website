"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  Plus,
  Send,
  Trash2,
  Pencil,
  X,
  Megaphone,
  FileEdit,
  Users,
  CalendarClock,
  AlertCircle,
} from "lucide-react";
import { useSession, useToast } from "@/components/providers";
import { PageHeader, StatCard, EmptyState, Alert } from "@/components/ui";

type Announcement = {
  id: string;
  title: string;
  content: string;
  audience_roles: string[];
  directorate_ids: string[];
  school_ids: string[];
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by_name: string | null;
  is_draft: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "مدير النظام",
  EDUCATION_DIRECTOR: "مدير التعليم",
  INSPECTOR: "مفتش",
  SCHOOL_PRINCIPAL: "مدير مدرسة",
  QUALITY_COORDINATOR: "منسق جودة",
  TEACHER: "معلم",
  PARENT: "ولي أمر",
  GUEST: "زائر",
};

export default function CommunicationPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user?.roleKey ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/announcements", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "تعذّر التحميل");
      setRows(json.announcements ?? []);
      setStats(json.stats ?? {});
    } catch (e: any) {
      setError(e?.message ?? "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const payload: any = {
      title: fd.get("title"),
      content: fd.get("content"),
      publish: fd.get("publish") === "on",
      expiresAt: fd.get("expiresAt") || null,
      audienceRoles: ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "INSPECTOR", "TEACHER"].filter(
        (r) => fd.get(`role_${r}`) === "on"
      ),
    };
    setBusy(true);
    try {
      const isEdit = editing !== "new" && editing !== null;
      const res = await fetch("/api/announcements", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(isEdit ? { ...payload, id: (editing as Announcement).id } : payload),
      });
      const json = await res.json();
      if (!res.ok) {
        add({ type: "error", message: json.message || "تعذّر الحفظ" });
        return;
      }
      add({ type: "success", message: json.message });
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const publish = async (row: Announcement) => {
    const res = await fetch("/api/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: row.id, action: row.published_at ? "unpublish" : "publish" }),
    });
    const json = await res.json();
    if (!res.ok) {
      add({ type: "error", message: json.message || "تعذّر التحديث" });
      return;
    }
    add({ type: "success", message: json.message });
    await load();
  };

  const remove = async (row: Announcement) => {
    if (!confirm(`حذف الإعلان «${row.title}»؟`)) return;
    const res = await fetch(`/api/announcements?id=${row.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok) {
      add({ type: "error", message: json.message || "تعذّر الحذف" });
      return;
    }
    add({ type: "success", message: "تم الحذف" });
    await load();
  };

  const editRow = editing && editing !== "new" ? editing : null;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Mail}
        title="التواصل والإعلانات"
        subtitle="انشر تعميماً لكل المدارس أو لدور ومديريات محددة، وتابع المسودات قبل النشر."
        actions={
          canManage ? (
            <button onClick={() => setEditing("new")} className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> إعلان جديد
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <StatCard label="الإعلانات" value={stats.total ?? 0} icon={Megaphone} tone="navy" />
        <StatCard label="منشورة" value={stats.published ?? 0} icon={Send} tone="teal" delay={60} />
        <StatCard label="مسودات" value={stats.drafts ?? 0} icon={FileEdit} tone="gold" delay={120} />
      </div>

      {error && (
        <Alert tone="danger" title="تعذّر التحميل">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Megaphone}
            title="لا توجد إعلانات"
            description="لم يُنشر أي تعميم بعد. أنشئ أول إعلان لإبلاغ المدارس بالتحديثات والمهام."
            action={
              canManage ? (
                <button onClick={() => setEditing("new")} className="btn btn-primary btn-sm">
                  <Plus className="h-3.5 w-3.5" /> إعلان جديد
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <article
              key={r.id}
              className={`card relative overflow-hidden p-4 ${
                r.is_draft ? "border-r-[3px] border-r-warning" : "border-r-[3px] border-r-turquoise"
              }`}
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <h3 className="font-heading text-[15px] font-bold text-navy">{r.title}</h3>
                <span className={`badge shrink-0 ${r.is_draft ? "badge-warning" : "badge-success"}`}>
                  {r.is_draft ? "مسودة" : "منشور"}
                </span>
              </div>

              <p className="whitespace-pre-line text-[12.5px] leading-[1.9] text-gray-600">
                {r.content}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2.5 text-[10.5px] text-gray-400">
                {r.audience_roles.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {r.audience_roles.map((k) => ROLE_LABELS[k] ?? k).join(" · ")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> للجميع
                  </span>
                )}
                <span>{r.created_by_name ?? "—"}</span>
                <span>
                  {new Date(r.published_at ?? r.created_at).toLocaleDateString("ar-YE")}
                </span>
                {r.expires_at && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <CalendarClock className="h-3 w-3" />
                    ينتهي {r.expires_at}
                  </span>
                )}
              </div>

              {canManage && (
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => publish(r)} className="btn btn-ghost btn-sm !py-1 !text-[11px]">
                    <Send className="h-3 w-3" />
                    {r.published_at ? "إلغاء النشر" : "نشر"}
                  </button>
                  <button
                    onClick={() => setEditing(r)}
                    className="btn btn-ghost btn-sm !py-1 !text-[11px]"
                  >
                    <Pencil className="h-3 w-3" /> تعديل
                  </button>
                  <button
                    onClick={() => remove(r)}
                    className="btn btn-ghost btn-sm !py-1 !text-[11px] !text-danger hover:!bg-danger-soft"
                  >
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-deep/50 p-4 py-10 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className="card w-full max-w-xl animate-fade-up p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-[16.5px] font-bold text-navy">
                {editRow ? "تعديل الإعلان" : "إعلان جديد"}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-navy"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(e.currentTarget);
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="label">العنوان *</label>
                <input
                  name="title"
                  defaultValue={editRow?.title ?? ""}
                  required
                  minLength={3}
                  maxLength={200}
                  className="input"
                  placeholder="تعميم بخصوص موعد الزيارات"
                />
              </div>
              <div>
                <label className="label">النص *</label>
                <textarea
                  name="content"
                  defaultValue={editRow?.content ?? ""}
                  required
                  minLength={10}
                  rows={5}
                  className="input resize-y"
                  placeholder="نص التعميم…"
                />
              </div>

              <div>
                <label className="label">الجهة المستهدفة</label>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-gray-200 p-2.5">
                  {["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "INSPECTOR", "TEACHER"].map((r) => (
                    <label key={r} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-600">
                      <input
                        type="checkbox"
                        name={`role_${r}`}
                        defaultChecked={editRow?.audience_roles.includes(r) ?? false}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-turquoise"
                      />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-gray-400">
                  إن لم تحدد أي دور، يُعرض الإعلان للجميع.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">تاريخ الانتهاء</label>
                  <input
                    name="expiresAt"
                    type="date"
                    defaultValue={editRow?.expires_at?.slice(0, 10) ?? ""}
                    className="input"
                    dir="ltr"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-navy">
                    <input
                      type="checkbox"
                      name="publish"
                      defaultChecked={!!editRow?.published_at}
                      className="h-4 w-4 rounded border-gray-300 text-turquoise"
                    />
                    نشر فور الحفظ
                  </label>
                </div>
              </div>

              <div className="rounded-lg bg-info-soft px-3 py-2 text-[10.5px] leading-relaxed text-info">
                <AlertCircle className="mb-0.5 inline h-3 w-3" /> الإعلان المنشور يظهر
                للمستخدمين وفق أدوارهم. المسودة لا تظهر لأحد عدا مديري التعليم.
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? "جارٍ الحفظ…" : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
