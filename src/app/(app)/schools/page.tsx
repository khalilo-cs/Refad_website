"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canSeeHref } from "@/lib/nav";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Building2, Download, FileUp, Loader2, MapPin, Plus, Search, TriangleAlert } from "lucide-react";
import { EmptyState, Modal, PageHeader, LoadingRows } from "@/components/ui";
import { Pagination, useDebounced } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";
import { LocationActions, PhoneActions } from "@/components/ui/contact";
import { SchoolFormModal } from "@/components/schools/school-form-modal";

type School = {
  id: string; code: string; name: string; type: string; stage: string; status: string; data_source: string;
  directorate: string; governorate: string; visitsCount: number; last_updated_at: string; latitude: number | null; longitude: number | null;
  contact_phone: string | null; has_whatsapp: number | null; principal_name: string | null;
};

const SORTS: { key: string; label: string; cls?: string }[] = [
  { key: "name", label: "اسم المدرسة" },
  { key: "code", label: "الكود" },
  { key: "directorate", label: "المديرية", cls: "hidden md:table-cell" },
  { key: "visits", label: "الزيارات" },
  { key: "updated", label: "آخر تحديث", cls: "hidden lg:table-cell" },
];
const STATUS_AR: Record<string, string> = { ACTIVE: "نشطة", INACTIVE: "غير نشطة", SUSPENDED: "موقوفة", ARCHIVED: "مؤرشفة" };

export default function SchoolsPage() {
  const { user } = useSession();
  const { add } = useToast();
  const canManage = user?.roleKey === "SUPER_ADMIN" || user?.roleKey === "EDUCATION_DIRECTOR";

  const [rows, setRows] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [directorateId, setDirectorateId] = useState("");
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [dirs, setDirs] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const q = useDebounced(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search: q, status, page: String(page), limit: "20", sort, dir, ...(directorateId ? { directorateId } : {}) });
      const res = await fetch(`/api/schools?${qs}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setRows(data.schools ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e: any) {
      add({ type: "error", message: e.message || "فشل تحميل المدارس" });
    } finally {
      setLoading(false);
    }
  }, [q, status, page, sort, dir, directorateId, add]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/lookup/directorates", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setDirs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const toggleSort = (k: string) => {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k); setDir("asc"); }
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="المدارس"
        subtitle="السجل المركزي للمدارس — بحث وفرز وتصدير، وإضافة يدوية أو استيراد من Excel/CSV مع فحص قبل الحفظ"
        icon={Building2}
        actions={
          <>
            <a href={`/api/schools/export?format=xlsx${directorateId ? `&directorateId=${directorateId}` : ""}`} className="btn btn-ghost btn-sm"><Download className="h-3.5 w-3.5" /> Excel</a>
            <a href={`/api/schools/export?format=csv${directorateId ? `&directorateId=${directorateId}` : ""}`} className="btn btn-ghost btn-sm"><Download className="h-3.5 w-3.5" /> CSV</a>
            {canSeeHref(user?.roleKey, (user as any)?.permissions, "/map") && <Link href="/map" className="btn btn-ghost btn-sm"><MapPin className="h-3.5 w-3.5" /> الخريطة</Link>}
            {canManage && (
              <>
                <button onClick={() => setImportOpen(true)} className="btn btn-ghost btn-sm"><FileUp className="h-3.5 w-3.5" /> استيراد</button>
                <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-sm"><Plus className="h-3.5 w-3.5" /> إضافة مدرسة</button>
              </>
            )}
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className="input pr-9" placeholder="ابحث باسم المدرسة أو الرمز…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="بحث" />
          </div>
          <select className="input md:w-48" value={directorateId} onChange={(e) => { setDirectorateId(e.target.value); setPage(1); }} aria-label="المديرية">
            <option value="">كل المديريات</option>
            {dirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="input md:w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="الحالة">
            <option value="ACTIVE">النشطة</option>
            <option value="INACTIVE">غير النشطة</option>
            <option value="SUSPENDED">الموقوفة</option>
            <option value="">الكل</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60 text-gray-500">
                {SORTS.map((c) => (
                  <th key={c.key} className={`px-4 py-3 text-right font-medium ${c.cls ?? ""}`}>
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 transition hover:text-navy" aria-label={`فرز حسب ${c.label}`}>
                      {c.label}{sort === c.key && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">النوع / المرحلة</th>
                <th className="px-4 py-3 text-right font-medium">الحالة</th>
                <th className="px-4 py-3 text-right font-medium">اتصال وتوجيه</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows cols={8} rows={6} /> : rows.map((s, i) => (
                <motion.tr key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="group border-b border-gray-50 transition hover:bg-turquoise-soft/30">
                  <td className="px-4 py-3">
                    <Link href={`/schools/${s.id}`} className="font-semibold text-navy hover:text-turquoise hover:underline">{s.name}</Link>
                    {s.data_source !== "OFFICIAL" && s.code.startsWith("RIFAD-DEMO") && <span className="badge badge-gold ms-2">تجريبية</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600">{s.code}</td>
                  <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{s.directorate}</td>
                  <td className="px-4 py-3 font-mono">{s.visitsCount}</td>
                  <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">{fmtDate(s.last_updated_at)}</td>
                  <td className="px-4 py-3 text-gray-600">{s.type} / {s.stage}</td>
                  <td className="px-4 py-3"><span className={`badge ${s.status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}>{STATUS_AR[s.status] ?? s.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <PhoneActions phone={s.contact_phone} hasWhatsapp={s.has_whatsapp !== 0} name={s.principal_name ?? s.name} showNumber={false} />
                      <LocationActions lat={s.latitude} lng={s.longitude} />
                      {s.latitude == null && canManage && <Link href={`/schools/${s.id}?tab=contacts`} className="text-[11px] text-warning hover:underline" title="لم يُحدَّد موقع المدرسة">بلا موقع</Link>}
                    </div>
                  </td>
                </motion.tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8}>
                  <EmptyState icon={Building2} title="لا توجد مدارس مطابقة" description={canManage ? "أضف مدرسة يدوياً أو استورد السجل من ملف Excel/CSV." : "لا مدارس ضمن نطاق صلاحيتك بهذه المرشحات."}
                    action={canManage ? <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> إضافة مدرسة</button> : undefined} />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-3"><Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} /></div>
      </div>

      <SchoolFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); void load(); }} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); void load(); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* الاستيراد على مرحلتين: فحص ثم تأكيد                                  */
/* ------------------------------------------------------------------ */
function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { add } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setFile(null); setPreview(null); } }, [open]);

  const run = async (f: File, commit: boolean) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/schools/import${commit ? "?commit=true" : ""}`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "تعذّر قراءة الملف");
      if (commit) { add({ type: "success", message: data.message }); onDone(); }
      else { setFile(f); setPreview(data); }
    } catch (e: any) {
      add({ type: "error", message: e.message });
      if (!commit) setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const errorReport = useMemo(() => {
    if (!preview?.errors?.length) return null;
    const csv = "﻿" + ["الصف,الحقل,الخطأ", ...preview.errors.map((e: any) => `${e.row},${e.field},"${String(e.message).replace(/"/g, '""')}"`)].join("\r\n");
    return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }, [preview]);

  return (
    <Modal open={open} onClose={onClose} title="استيراد المدارس من Excel أو CSV" description="لا يُحفظ شيء قبل تأكيدك. الصفوف المكررة أو الخاطئة تُستبعد وتُعرض أسبابها." width="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-gray-600">
          <span>الأعمدة: الكود، الاسم، المحافظة، المديرية، النوع، المرحلة، العنوان، الهاتف، البريد، مدير المدرسة، خط العرض، خط الطول.</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/schools/import/template" className="btn btn-ghost btn-sm"><Download className="h-3.5 w-3.5" /> تنزيل القالب</a>
        </div>
        <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 transition ${busy ? "opacity-60" : "border-gray-200 hover:border-turquoise hover:bg-turquoise-soft/30"}`}>
          {busy ? <Loader2 className="h-6 w-6 animate-spin text-turquoise" /> : <FileUp className="h-6 w-6 text-turquoise" />}
          <span className="text-sm font-semibold text-navy">{file ? file.name : "اختر ملف xlsx أو csv"}</span>
          <input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f, false); }} />
        </label>

        {preview && (
          <div className="space-y-3 animate-fade-up">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="صفوف صالحة" v={preview.validCount} tone="success" />
              <Stat label="صفوف بها أخطاء" v={new Set((preview.errors ?? []).map((e: any) => e.row)).size} tone="danger" />
              <Stat label="إجمالي الصفوف" v={preview.totalRows ?? preview.validCount} tone="navy" />
            </div>
            {preview.sample?.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 text-gray-500"><tr><th className="px-2 py-1.5 text-right">الكود</th><th className="px-2 py-1.5 text-right">الاسم</th><th className="px-2 py-1.5 text-right">المديرية</th><th className="px-2 py-1.5 text-right">النوع</th></tr></thead>
                  <tbody>{preview.sample.map((r: any, i: number) => <tr key={i} className="border-t border-gray-100"><td className="px-2 py-1.5 font-mono text-navy">{r.code}</td><td className="px-2 py-1.5">{r.name}</td><td className="px-2 py-1.5 text-gray-600">{r.directorate}</td><td className="px-2 py-1.5 text-gray-600">{r.type}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {preview.warnings?.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-warning"><TriangleAlert className="h-3.5 w-3.5" /> تنبيهات (لا تمنع الحفظ)</p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-warning/25 bg-warning/5">
                  <table className="w-full text-[12px]"><tbody>{preview.warnings.map((w: any, i: number) => <tr key={i} className="border-b border-gray-100 last:border-0"><td className="w-16 px-2 py-1 font-mono text-gray-500">صف {w.row}</td><td className="px-2 py-1 text-gray-700">{w.message}</td></tr>)}</tbody></table>
                </div>
              </div>
            )}
            {preview.errors?.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="flex items-center gap-1 text-[12px] font-semibold text-danger"><TriangleAlert className="h-3.5 w-3.5" /> أخطاء يجب تصحيحها</p>
                  {errorReport && <a href={errorReport} download="import-report.csv" className="text-[12px] font-semibold text-turquoise hover:underline">تصدير تقرير الأخطاء</a>}
                </div>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-danger/20">
                  <table className="w-full text-[12px]"><tbody>{preview.errors.map((e: any, i: number) => <tr key={i} className="border-b border-gray-100 last:border-0"><td className="w-16 px-2 py-1 font-mono text-gray-500">صف {e.row}</td><td className="px-2 py-1 text-gray-600">{e.message}</td></tr>)}</tbody></table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
              <button className="btn btn-primary btn-sm" disabled={busy || preview.validCount === 0} onClick={() => file && run(file, true)}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} تأكيد وحفظ {preview.validCount} مدرسة
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone: "success" | "danger" | "navy" }) {
  const c = { success: "border-success/25 bg-success-soft text-success", danger: "border-danger/25 bg-danger-soft text-danger", navy: "border-gray-200 bg-gray-50 text-navy" }[tone];
  return <div className={`rounded-xl border px-3 py-2.5 ${c}`}><p className="text-[11px] text-gray-600">{label}</p><p className="font-mono text-xl font-bold">{v}</p></div>;
}
