"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { Building, Plus, Search, Filter, FileUp, ChevronRight, Building2 } from "lucide-react";

type School = {
  id: string;
  code: string;
  name: string;
  type: string;
  stage: string;
  contact_phone: string | null;
  status: string;
  data_source: string;
  directorate: string;
  governorate: string;
  visitsCount: number;
};

export default function SchoolsPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [directorateId, setDirectorateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, status, page: String(page), limit: "20",
        ...(directorateId ? { directorateId } : {}),
      });
      const res = await fetch(`/api/schools?${qs}`, { credentials: "include" });
      const data = await res.json();
      setSchools(data.schools ?? []);
      setTotal(data.total ?? 0);
    } catch {
      add({ type: "error", message: "فشل تحميل المدارس" });
    } finally {
      setLoading(false);
    }
  }, [search, status, page, directorateId, add]);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  const handleCreate = async (formData: FormData) => {
    setCreateLoading(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formData.get("code"),
          name: formData.get("name"),
          governorateId: formData.get("governorateId"),
          directorateId: formData.get("directorateId"),
          areaId: formData.get("areaId") || undefined,
          address: formData.get("address") || undefined,
          type: formData.get("type"),
          stage: formData.get("stage"),
          contactPhone: formData.get("contactPhone") || undefined,
          contactEmail: formData.get("contactEmail") || undefined,
          principalName: formData.get("principalName") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "فشل الإضافة");
      add({ type: "success", message: data.message });
      setOpenCreate(false);
      fetchSchools();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setCreateLoading(false);
    }
  };

  /* ====== الاستيراد على مرحلتين: فحص أولاً ثم تأكيد ====== */
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    validCount: number;
    errorCount: number;
    errors: Array<{ row: number; field: string; message: string }>;
    sample: any[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const resetImport = () => {
    setImportFile(null);
    setPreview(null);
    setImporting(false);
  };

  const runPreview = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/schools/import`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "تعذّر قراءة الملف");
      setImportFile(file);
      setPreview(data);
    } catch (e: any) {
      add({ type: "error", message: e.message });
      setPreview(null);
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await fetch(`/api/schools/import?commit=true`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "فشل الاستيراد");
      add({ type: "success", message: data.message });
      setOpenImport(false);
      resetImport();
      fetchSchools();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة المدارس"
        subtitle="سجل المدارس في مديرية الجراحي — إضافة وتعديل واستيراد مع فحص قبل الحفظ"
        icon={Building2}
        actions={
        <div className="flex gap-2">
          <button onClick={() => setOpenCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-soft transition">
            <Plus className="w-4 h-4" /> إضافة مدرسة
          </button>
          <button onClick={() => setOpenImport(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
            <FileUp className="w-4 h-4" /> استيراد Excel/CSV
          </button>
        </div>
        }
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="ابحث باسم المدرسة أو الكود..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none text-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none text-sm"
          >
            <option value="ACTIVE">النشطة فقط</option>
            <option value="ALL">الكل</option>
          </select>
          <button
            onClick={() => setPage(1)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
          >
            <Filter className="w-4 h-4" /> الفلترة
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="py-3 pr-4 font-medium">اسم المدرسة</th>
                <th className="py-3 pr-4 font-medium">الكود</th>
                <th className="py-3 pr-4 font-hidden md:table-cell font-medium">المحافظة</th>
                <th className="py-3 pr-4 font-hidden md:table-cell font-medium">المديرية</th>
                <th className="py-3 pr-4 font-medium">النوع / المرحلة</th>
                <th className="py-3 pr-4 font-medium">الزيارات</th>
                <th className="py-3 pr-4 font-medium">الحالة</th>
                <th className="py-3 pr-4 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id} className="border-b border-gray-50/50 hover:bg-gray-50 group">
                  <td className="py-3 pr-4 font-medium text-navy">
                    <a href={`/(app)/schools/${s.id}`} className="hover:underline">{s.name}</a>
                  </td>
                  <td className="py-3 pr-4 font-mono text-gray-600">{s.code}</td>
                  <td className="py-3 pr-4 font-hidden md:table-cell text-gray-600">{s.governorate}</td>
                  <td className="py-3 pr-4 font-hidden md:table-cell text-gray-600">{s.directorate}</td>
                  <td className="py-3 pr-4 text-gray-600">{s.type} / {s.stage}</td>
                  <td className="py-3 pr-4 font-mono">{s.visitsCount}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      s.status === "ACTIVE" ? "bg-success/10 text-success border border-success/20" : "bg-gray-100 text-gray-600 border border-gray-200"
                    }`}>{s.status === "ACTIVE" ? "نشطة" : s.status === "INACTIVE" ? "غير نشطة" : "مقيدة"}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <a href={`/(app)/schools/${s.id}`} className="text-turquoise text-sm font-medium hover:underline flex items-center gap-1">
                      عرض <ChevronRight className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">لا توجد مدارس مطابقة.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-600">الصفحة {page} من {Math.ceil(total / 20) || 1} — إجمالي {total} مدرسة</div>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">السابقة</button>
            <button disabled={page * 20 >= total} onClick={() => setPage(page + 1)} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">التالي</button>
          </div>
        </div>
      </div>

      {/* نموذج إضافة مدرسة */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm ${
          openCreate ? "" : "hidden"
        }`}
      >
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-heading text-navy font-bold mb-2">
            استيراد المدارس من ملف Excel أو CSV
          </h2>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-sm text-gray-600">
              الأعمدة المتوقعة: الكود، الاسم، المحافظة، المديرية، النوع، المرحلة، العنوان،
              الهاتف، البريد، مدير المدرسة. لا تُحفظ أي سجلات قبل تأكيدك.
            </p>
            <a
              href="/api/schools/import/template"
              className="shrink-0 rounded-lg border border-turquoise/40 bg-turquoise-soft/50 px-3 py-1.5 text-[11.5px] font-medium text-emerald-deep transition hover:bg-turquoise-soft"
            >
              تنزيل القالب
            </a>
          </div>

          <label
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 transition ${
              importing ? "border-gray-200 opacity-60" : "border-gray-200 hover:border-turquoise hover:bg-turquoise-soft/30"
            }`}
          >
            <FileUp className="h-6 w-6 text-turquoise" />
            <span className="text-sm font-medium text-navy">
              {importFile ? importFile.name : "اختر ملف (xlsx, xls, csv)"}
            </span>
            <span className="text-[11px] text-gray-400">
              {importFile ? "اختر ملفاً آخر لاستبداله" : "سيُعرض تقرير فحص أولاً قبل الحفظ"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runPreview(f);
              }}
            />
          </label>

          {importing && (
            <p className="mt-4 text-center text-[12px] text-gray-500">
              جارٍ {preview ? "الحفظ" : "فحص"} الملف…
            </p>
          )}

          {preview && !importing && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-success/25 bg-success-soft px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-600">صفوف صالحة</p>
                  <p className="font-mono text-lg font-bold text-success">{preview.validCount}</p>
                </div>
                <div className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-600">صفوف بها أخطاء</p>
                  <p className="font-mono text-lg font-bold text-danger">{preview.errorCount}</p>
                </div>
              </div>

              {preview.sample?.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-gray-600">عيّنة من الصفوف الصالحة</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-2 py-1.5 text-right">الكود</th>
                          <th className="px-2 py-1.5 text-right">الاسم</th>
                          <th className="px-2 py-1.5 text-right">المديرية</th>
                          <th className="px-2 py-1.5 text-right">النوع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((r: any, i: number) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 font-mono text-navy">{r.code}</td>
                            <td className="px-2 py-1.5">{r.name}</td>
                            <td className="px-2 py-1.5 text-gray-600">{r.directorate}</td>
                            <td className="px-2 py-1.5 text-gray-600">{r.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.errors?.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-danger">
                    أخطاء يجب تصحيحها في الملف (تُعرض أول 100)
                  </p>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-danger/20">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {preview.errors.map((e, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="w-16 px-2 py-1 font-mono text-gray-500">صف {e.row}</td>
                            <td className="px-2 py-1 text-gray-600">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                <button
                  onClick={confirmImport}
                  disabled={preview.validCount === 0}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  تأكيد وحفظ {preview.validCount} مدرسة
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
                >
                  اختيار ملف آخر
                </button>
                <span className="text-[10px] text-gray-400">
                  الصفوف التي بها أخطاء لا تُحفظ؛ صحّحها ثم أعد الفحص.
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setOpenImport(false);
              resetImport();
            }}
            className="mt-4 text-sm text-gray-600 hover:underline"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
