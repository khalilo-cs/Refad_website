"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { FileText, Download, Plus, CheckCircle2, XCircle, Clock, Send, FileBarChart, Eye, Printer, X } from "lucide-react";
import { generateArabicPdf } from "@/lib/pdf";

type Report = {
  id: string;
  number: string;
  title: string;
  status: string;
  school_name: string | null;
  generated_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  verification_code: string;
  summary: string | null;
  rejection_reason: string | null;
  created_at: string;
  period_start: string | null;
  period_end: string | null;
};

const STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  DRAFT: { label: "مسودة", cls: "bg-gray-100 text-gray-700", icon: Clock },
  UNDER_REVIEW: { label: "قيد المراجعة", cls: "bg-warning/10 text-warning", icon: Send },
  APPROVED: { label: "معتمد", cls: "bg-success/10 text-success", icon: CheckCircle2 },
  REJECTED: { label: "مرفوض", cls: "bg-error/10 text-error", icon: XCircle },
};

export default function ReportsPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports?limit=50", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setReports(json.reports ?? []);
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل التقارير" });
    } finally {
      setLoading(false);
    }
  }, [add]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/visits?limit=50", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { visits: [] }))
      .then((d) => setVisits(d.visits ?? []))
      .catch(() => {});
  }, [open]);

  const generate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: fd.get("visitId"),
          title: fd.get("title") || undefined,
          status: "DRAFT",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: `${json.message} — ${json.number}` });
      setOpen(false);
      load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (id: string, status: string, reason?: string) => {
    try {
      const res = await fetch(`/api/reports/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionReason: reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
      setRejecting(null);
      load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    }
  };

  const exportPdf = async (r: Report) => {
    try {
      const summary = r.summary ? JSON.parse(r.summary) : null;
      if (!summary) throw new Error("التقرير لا يحتوي بيانات محسوبة");

      await generateArabicPdf({
        number: r.number,
        title: r.title,
        schoolName: r.school_name ?? "—",
        inspectorName: r.generated_by_name ?? "—",
        date: new Date(r.created_at).toLocaleDateString("ar-YE"),
        totalScore: summary.totalScore ?? null,
        completionPercent: summary.completionPercent ?? 0,
        reportState: summary.reportState ?? "DRAFT_INCOMPLETE",
        evaluatedIndicators: summary.evaluatedIndicators ?? 0,
        totalIndicators: summary.totalIndicators ?? 0,
        verificationCode: r.verification_code,
        warnings: summary.warnings ?? [],
        criteria: (summary.criteria ?? []).map((c: any) => ({
          code: c.code,
          title: c.title,
          weight: c.weight,
          achievementPercent: c.achievementPercent,
          contribution: c.contribution,
        })),
        subCriteria: [],
      });
      add({ type: "success", message: "تم تصدير ملف PDF" });
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر التصدير" });
    }
  };

  const canGenerate = user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user.roleKey);
  const canReview = user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user.roleKey);

  return (
    <div className="space-y-5">
      <PageHeader
        title="التقارير"
        subtitle="تقارير التقييم بحالاتها الأربع — كل تقرير يحمل رمز تحقق عاماً ورمز QR"
        icon={FileBarChart}
        actions={
          canGenerate && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-soft transition"
          >
            <Plus className="w-4 h-4" /> توليد تقرير
          </button>
          )
        }
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="py-3 pr-4 font-medium text-right">الرقم</th>
              <th className="py-3 pr-4 font-medium text-right">العنوان</th>
              <th className="py-3 pr-4 font-medium text-right">المدرسة</th>
              <th className="py-3 pr-4 font-medium text-right">المُولِّد</th>
              <th className="py-3 pr-4 font-medium text-right">الحالة</th>
              <th className="py-3 pr-4 font-medium text-right">رمز التحقق</th>
              <th className="py-3 pr-4 font-medium text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">جارٍ التحميل…</td></tr>
            )}
            {!loading && reports.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">لا توجد تقارير بعد.</td></tr>
            )}
            {reports.map((r) => {
              const st = STATUS[r.status] ?? STATUS.DRAFT;
              const Icon = st.icon;
              const summary = r.summary ? JSON.parse(r.summary) : null;
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 align-top">
                  <td className="py-3 pr-4 font-mono text-xs text-navy">{r.number}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-navy">{r.title}</div>
                    <div className="text-[11px] text-gray-500">
                      الدرجة: {summary?.totalScore ?? "—"} · الإكمال: {summary?.completionPercent ?? 0}%
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-600">{r.school_name ?? "—"}</td>
                  <td className="py-3 pr-4 text-gray-600">{r.generated_by_name ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${st.cls}`}>
                      <Icon className="w-3 h-3" />
                      {st.label}
                    </span>
                    {r.status === "APPROVED" && r.approved_by_name && (
                      <div className="text-[10px] text-gray-500 mt-1">
                        اعتمده {r.approved_by_name}
                        {r.approved_at ? ` — ${new Date(r.approved_at).toLocaleDateString("ar-YE")}` : ""}
                      </div>
                    )}
                    {r.status === "REJECTED" && r.rejection_reason && (
                      <div className="text-[10px] text-error mt-1">السبب: {r.rejection_reason}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-gray-600">{r.verification_code}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => exportPdf(r)}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-turquoise transition hover:border-turquoise/40 hover:bg-turquoise-soft/40"
                        title="تصدير PDF مع رمز تحقق و QR"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                      <a
                        href={`/api/reports/${r.id}/export?format=xlsx`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-emerald transition hover:border-emerald/40 hover:bg-turquoise-soft/40"
                        title="تصدير Excel"
                      >
                        <Download className="w-3.5 h-3.5" /> Excel
                      </a>
                      <a
                        href={`/api/reports/${r.id}/export?format=csv`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                        title="تصدير CSV"
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </a>
                      <PreviewButton report={r} />
                      {r.status === "DRAFT" && (
                        <button
                          onClick={() => changeStatus(r.id, "UNDER_REVIEW")}
                          className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          رفع للمراجعة
                        </button>
                      )}
                      {canReview && r.status === "UNDER_REVIEW" && (
                        <>
                          <button
                            onClick={() => changeStatus(r.id, "APPROVED")}
                            className="text-[11px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20"
                          >
                            اعتماد
                          </button>
                          <button
                            onClick={() => setRejecting(r.id)}
                            className="text-[11px] px-2 py-1 rounded bg-error/10 text-error hover:bg-error/20"
                          >
                            رفض
                          </button>
                        </>
                      )}
                    </div>
                    {rejecting === r.id && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          changeStatus(r.id, "REJECTED", String(fd.get("reason") ?? ""));
                        }}
                        className="mt-2 space-y-1"
                      >
                        <input
                          name="reason"
                          required
                          minLength={5}
                          placeholder="سبب الرفض (إلزامي)"
                          className="w-full text-[11px] px-2 py-1 rounded border border-gray-200"
                        />
                        <div className="flex gap-1">
                          <button className="text-[11px] px-2 py-1 rounded bg-error text-white">تأكيد الرفض</button>
                          <button
                            type="button"
                            onClick={() => setRejecting(null)}
                            className="text-[11px] px-2 py-1 rounded border border-gray-200"
                          >
                            إلغاء
                          </button>
                        </div>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        التقرير لا يُوصف بأنه معتمد إلا بعد تسجيل اعتماد موثّق بالاسم والتاريخ. لا تُدرج أي أختام أو تواقيع حكومية في الملفات المصدَّرة.
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-heading text-navy font-bold mb-4">توليد تقرير</h2>
            <form onSubmit={generate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">الزيارة*</label>
                <select name="visitId" required className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                  <option value="">اختر الزيارة…</option>
                  {visits.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.school_name} — {new Date(v.visit_date).toLocaleDateString("ar-YE")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">عنوان التقرير</label>
                <input
                  name="title"
                  placeholder="يُولَّد تلقائياً إن تُرك فارغاً"
                  className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button disabled={busy} className="flex-1 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold disabled:opacity-60">
                  {busy ? "جارٍ التوليد…" : "توليد"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600">
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

/* ==========================================================
   معاينة التقرير قبل الطباعة
   ========================================================== */
function PreviewButton({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/export?format=json`, {
        credentials: "include",
      });
      const j = await res.json();
      setData(j.summary ? j : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary;
  const STATUS_LABEL: Record<string, string> = {
    APPROVED: "معتمد",
    UNDER_REVIEW: "قيد المراجعة",
    REJECTED: "مرفوض",
    DRAFT: "مسودة",
  };

  return (
    <>
      <button
        onClick={load}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-navy transition hover:border-navy/30 hover:bg-gray-50"
        title="معاينة قبل الطباعة"
      >
        <Eye className="h-3.5 w-3.5" /> معاينة
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-deep/55 p-3 py-8 backdrop-blur-sm print:static print:block print:bg-white print:p-0"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-3xl animate-fade-up print:max-w-none print:border-0 print:shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 print:hidden">
              <h3 className="font-heading text-[16px] font-bold text-navy">
                معاينة التقرير — {report.number}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="btn btn-primary btn-sm">
                  <Printer className="h-3.5 w-3.5" /> طباعة
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-5 print:p-0">
              <div className="mb-4 border-b border-gray-200 pb-3 text-center">
                <p className="font-heading text-[19px] font-bold text-navy">{report.title}</p>
                <p className="mt-1 font-mono text-[11px] text-gray-500">{report.number}</p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {report.school_name ?? "—"} ·{" "}
                  {new Date(report.created_at).toLocaleDateString("ar-YE")}
                </p>
              </div>

              {loading && (
                <p className="py-8 text-center text-[12px] text-gray-400">جارٍ التحميل…</p>
              )}

              {!loading && !summary && (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-warning">
                  لا توجد بيانات محسوبة محفوظة لهذا التقرير.
                </p>
              )}

              {summary && (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["الدرجة الكلية", summary.totalScore != null ? `${summary.totalScore}` : "—"],
                      ["نسبة التحقق", `${summary.achievementPercent ?? 0}%`],
                      ["نسبة الاكتمال", `${summary.completionPercent ?? 0}%`],
                      [
                        "مؤشرات مقيَّمة",
                        `${summary.evaluatedIndicators ?? 0}/${summary.totalIndicators ?? 0}`,
                      ],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[10px] text-gray-400">{l}</p>
                        <p className="font-mono text-[14px] font-bold text-navy">{v}</p>
                      </div>
                    ))}
                  </div>

                  <table className="w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="border border-gray-200 px-2 py-1.5 text-right">المعيار</th>
                        <th className="border border-gray-200 px-2 py-1.5 text-center">الوزن</th>
                        <th className="border border-gray-200 px-2 py-1.5 text-center">نسبة التحقق</th>
                        <th className="border border-gray-200 px-2 py-1.5 text-center">المساهمة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary.criteria ?? []).map((c: any) => (
                        <tr key={c.code}>
                          <td className="border border-gray-200 px-2 py-1.5 text-navy">
                            {c.code} — {c.title}
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center font-mono">
                            {c.weight}%
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center font-mono">
                            {c.achievementPercent ?? 0}%
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center font-mono">
                            {c.contribution ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-gray-200 pt-3">
                    <div className="text-[10px] leading-relaxed text-gray-500">
                      <p>
                        رمز التحقق: <span className="font-mono">{report.verification_code}</span>
                      </p>
                      <p className="mt-0.5">
                        تحقق عبر:{" "}
                        <span className="font-mono">
                          {typeof window !== "undefined" ? window.location.origin : ""}/verify
                        </span>
                      </p>
                      <p className="mt-1 text-gray-400">
                        لا يُعدّ هذا التقرير معتمداً رسمياً إلا إذا حمل حالة «معتمد» وسجلَ
                        اعتمادٍ موثّقاً باسم المعتمِد وتاريخه.
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 px-3 py-1.5 text-center">
                      <p className="text-[9px] text-gray-400">الحالة</p>
                      <p className="text-[12px] font-bold text-navy">
                        {STATUS_LABEL[report.status] ?? report.status}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
