"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Upload,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Download,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileType2,
  Filter,
  X,
  AlertTriangle,
} from "lucide-react";
import { useSession, useToast } from "@/components/providers";
import { PageHeader, StatCard, EmptyState, Alert } from "@/components/ui";

type Evidence = {
  id: string;
  name: string;
  original_name: string;
  mime_type: string;
  size: number;
  url: string;
  review_status: "PENDING" | "ACCEPTED" | "REJECTED";
  review_notes: string | null;
  created_at: string;
  school_name: string;
  uploaded_by_name: string | null;
  indicator_code: string | null;
  indicator_title: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  PENDING: { label: "بانتظار المراجعة", cls: "badge-warning", icon: Clock },
  ACCEPTED: { label: "مقبول", cls: "badge-success", icon: CheckCircle2 },
  REJECTED: { label: "مرفوض", cls: "badge-danger", icon: XCircle },
};

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.includes("word")) return FileType2;
  return FileText;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

export default function EvidencePage() {
  const { user } = useSession();
  const { add } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Evidence[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openUpload, setOpenUpload] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Evidence | null>(null);
  const [rejecting, setRejecting] = useState<Evidence | null>(null);

  const canReview = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(
    user?.roleKey ?? ""
  );
  const canDelete = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user?.roleKey ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`/api/evidence?${qs}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "تعذّر التحميل");
      setRows(json.evidence ?? []);
      setCounts(json.counts ?? {});
    } catch (e: any) {
      setError(e?.message ?? "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/schools?limit=100", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((d) => setSchools(d.schools ?? []))
      .catch(() => {});
  }, []);

  const upload = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setBusy(true);
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        add({ type: "error", message: json.message || "تعذّر الرفع" });
        return;
      }
      add({ type: "success", message: "تم رفع الدليل وبانتظار المراجعة" });
      setOpenUpload(false);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch {
      add({ type: "error", message: "خطأ في الاتصال" });
    } finally {
      setBusy(false);
    }
  };

  const review = async (row: Evidence, status: string, notes = "") => {
    const res = await fetch("/api/evidence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: row.id, status, notes }),
    });
    const json = await res.json();
    if (!res.ok) {
      add({ type: "error", message: json.message || "تعذّرت المراجعة" });
      return false;
    }
    add({ type: "success", message: json.message });
    await load();
    return true;
  };

  const remove = async (row: Evidence) => {
    if (!confirm(`حذف الدليل «${row.name}» نهائياً؟`)) return;
    const res = await fetch(`/api/evidence?id=${row.id}`, {
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

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim();
    return (
      r.name.includes(q) ||
      r.school_name.includes(q) ||
      (r.indicator_code ?? "").includes(q) ||
      (r.indicator_title ?? "").includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="الأدلة والشواهد"
        subtitle="ارفع أدلة تحقق المؤشرات وربطها بالمدارس، وراجعها قبل اعتمادها في التقييم."
        actions={
          <button onClick={() => setOpenUpload(true)} className="btn btn-primary btn-sm">
            <Upload className="h-3.5 w-3.5" /> رفع دليل
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="إجمالي الأدلة" value={counts.total ?? 0} icon={FileText} tone="navy" />
        <StatCard
          label="بانتظار المراجعة"
          value={counts.pending ?? 0}
          icon={Clock}
          tone="gold"
          delay={60}
        />
        <StatCard
          label="مقبولة"
          value={counts.accepted ?? 0}
          icon={CheckCircle2}
          tone="emerald"
          delay={120}
        />
        <StatCard
          label="مرفوضة"
          value={counts.rejected ?? 0}
          icon={XCircle}
          tone="rose"
          delay={180}
        />
      </div>

      {error && (
        <Alert tone="danger" title="تعذّر تحميل الأدلة">
          {error}
        </Alert>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الدليل أو المدرسة أو رمز المؤشر…"
            className="input pr-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto min-w-[150px]"
          >
            <option value="">كل الحالات</option>
            <option value="PENDING">بانتظار المراجعة</option>
            <option value="ACCEPTED">مقبول</option>
            <option value="REJECTED">مرفوض</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="لا توجد أدلة"
            description={
              rows.length === 0
                ? "لم يُرفع أي دليل بعد. ابدأ برفع أول شاهد يدعم تقييم المؤشرات."
                : "لا توجد نتائج مطابقة للبحث أو التصفية الحالية."
            }
            action={
              <button onClick={() => setOpenUpload(true)} className="btn btn-primary btn-sm">
                <Upload className="h-3.5 w-3.5" /> رفع أول دليل
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>الدليل</th>
                  <th>المدرسة</th>
                  <th className="hidden md:table-cell">المؤشر</th>
                  <th>الحالة</th>
                  <th className="hidden lg:table-cell">رافعه</th>
                  <th className="text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const Icon = fileIcon(r.mime_type);
                  const meta = STATUS_META[r.review_status] ?? STATUS_META.PENDING;
                  const StatusIcon = meta.icon;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy/6 text-navy">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold text-navy">
                              {r.name}
                            </p>
                            <p className="text-[10.5px] text-gray-400">
                              {humanSize(r.size)} ·{" "}
                              {new Date(r.created_at).toLocaleDateString("ar-YE")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-[12px] text-gray-600">{r.school_name}</td>
                      <td className="hidden md:table-cell">
                        {r.indicator_code ? (
                          <span className="font-mono text-[10.5px] text-gray-500">
                            {r.indicator_code}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${meta.cls} gap-1`}>
                          <StatusIcon className="h-2.5 w-2.5" />
                          {meta.label}
                        </span>
                        {r.review_status === "REJECTED" && r.review_notes && (
                          <p className="mt-1 text-[10px] text-danger">{r.review_notes}</p>
                        )}
                      </td>
                      <td className="hidden text-[11.5px] text-gray-500 lg:table-cell">
                        {r.uploaded_by_name ?? "—"}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPreview(r)}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
                            title="معاينة"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={r.url}
                            download={r.original_name}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-turquoise"
                            title="تنزيل"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          {canReview && r.review_status !== "ACCEPTED" && (
                            <button
                              onClick={() => review(r, "ACCEPTED")}
                              className="rounded-md p-1.5 text-gray-400 transition hover:bg-success-soft hover:text-success"
                              title="قبول"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canReview && r.review_status !== "REJECTED" && (
                            <button
                              onClick={() => setRejecting(r)}
                              className="rounded-md p-1.5 text-gray-400 transition hover:bg-danger-soft hover:text-danger"
                              title="رفض"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => remove(r)}
                              className="rounded-md p-1.5 text-gray-300 transition hover:bg-danger-soft hover:text-danger"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== نافذة الرفع ===== */}
      {openUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-sm"
          onClick={() => setOpenUpload(false)}
        >
          <div
            className="card w-full max-w-lg animate-fade-up p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-[17px] font-bold text-navy">رفع دليل جديد</h3>
              <button
                onClick={() => setOpenUpload(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-navy"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                upload(e.currentTarget);
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="label">المدرسة *</label>
                <select name="schoolId" required className="input">
                  <option value="">— اختر المدرسة —</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">اسم الدليل</label>
                <input
                  name="name"
                  placeholder="مثال: محضر اجتماع مجلس المعلمين"
                  className="input"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="label">الملف *</label>
                <input
                  ref={fileRef}
                  type="file"
                  name="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                  className="block w-full cursor-pointer rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-[12px] text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white hover:border-turquoise/50"
                />
                <p className="mt-1 text-[10.5px] text-gray-400">
                  PDF أو صورة أو Word أو Excel — بحد أقصى 15 ميجابايت.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpenUpload(false)}
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  <Upload className="h-3.5 w-3.5" />
                  {busy ? "جارٍ الرفع…" : "رفع"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== نافذة الرفض ===== */}
      {rejecting && (
        <RejectDialog
          title={rejecting.name}
          onCancel={() => setRejecting(null)}
          onSubmit={async (notes) => {
            const ok = await review(rejecting, "REJECTED", notes);
            if (ok) setRejecting(null);
          }}
        />
      )}

      {/* ===== المعاينة ===== */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/60 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            className="card w-full max-w-3xl animate-fade-up overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-heading text-[15px] font-bold text-navy">
                  {preview.name}
                </p>
                <p className="text-[10.5px] text-gray-400">{preview.original_name}</p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto bg-gray-50 p-4">
              {preview.mime_type.startsWith("image/") ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="mx-auto max-w-full rounded-lg"
                />
              ) : preview.mime_type === "application/pdf" ? (
                <iframe src={preview.url} className="h-[60vh] w-full rounded-lg" title={preview.name} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12">
                  <AlertTriangle className="h-8 w-8 text-warning" />
                  <p className="text-[12.5px] text-gray-600">
                    لا يمكن معاينة هذا النوع داخل المتصفح.
                  </p>
                  <a href={preview.url} download={preview.original_name} className="btn btn-primary btn-sm">
                    <Download className="h-3.5 w-3.5" /> تنزيل الملف
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RejectDialog({
  title,
  onCancel,
  onSubmit,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const valid = notes.trim().length >= 5;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-md animate-fade-up p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="font-heading text-[16px] font-bold text-navy">رفض الدليل</h3>
        <p className="mt-1 text-[12.5px] text-gray-600">
          الدليل: <span className="font-semibold">{title}</span>
        </p>
        <label className="label mt-3">سبب الرفض *</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input resize-y"
          placeholder="وضّح سبب الرفض حتى يتمكن الرافع من تصحيحه (5 أحرف على الأقل)"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-ghost btn-sm">
            إلغاء
          </button>
          <button
            onClick={() => onSubmit(notes.trim())}
            disabled={!valid}
            className="btn btn-danger btn-sm"
          >
            تأكيد الرفض
          </button>
        </div>
      </div>
    </div>
  );
}
