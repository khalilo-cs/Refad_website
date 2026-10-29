"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, FileText, Printer, Send, Trash2, XCircle } from "lucide-react";
import { Alert } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/extra";
import ReportView from "@/components/reports/report-view";
import { useSession, useToast } from "@/components/providers";

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const { add } = useToast();
  const [data, setData] = useState<{ report: any; content: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dlg, setDlg] = useState<"approve" | "reject" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/reports/${id}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
    } catch (e: any) { setError(e.message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (status: string, rejectionReason?: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/reports/${id}/status`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, rejectionReason }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      setDlg(null);
      await load();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    const r = await fetch(`/api/reports/${id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return add({ type: "error", message: d.message });
    add({ type: "success", message: d.message });
    router.push("/reports");
  };

  if (error) return <Alert tone="danger" title="تعذّر عرض التقرير">{error}</Alert>;
  if (!data) return <div className="skeleton mx-auto h-[600px] max-w-[820px] rounded-2xl" />;
  const { report, content } = data;
  const canReview = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user?.roleKey ?? "");
  const isOwner = report.generated_by_id === user?.userId;
  const st = report.status;

  return (
    <div className="space-y-5">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link href="/reports" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-turquoise hover:underline"><ArrowRight className="h-3.5 w-3.5" /> كل التقارير</Link>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost btn-sm" href={`/api/reports/${id}/export?format=pdf`}><Download className="h-3.5 w-3.5" /> PDF</a>
          <a className="btn btn-ghost btn-sm" href={`/api/reports/${id}/export?format=xlsx`}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</a>
          <a className="btn btn-ghost btn-sm" href={`/api/reports/${id}/export?format=csv`}><FileText className="h-3.5 w-3.5" /> CSV</a>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> طباعة</button>
        </div>
      </div>

      <div className="print:hidden card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-[13px] text-gray-600">
          <span className="font-semibold text-navy">سير الاعتماد:</span> مسودة ← قيد المراجعة ← معتمد
          {st === "DRAFT" && content.state === "INCOMPLETE" && <span className="ms-2 text-warning">· التقرير غير مكتمل ولا يُرفع للمراجعة</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {["DRAFT", "REJECTED"].includes(st) && (isOwner || canReview) && <button disabled={busy || content.state === "INCOMPLETE"} className="btn btn-primary btn-sm" onClick={() => setStatus("UNDER_REVIEW")}><Send className="h-3.5 w-3.5" /> رفع للمراجعة</button>}
          {st === "UNDER_REVIEW" && canReview && (!isOwner || user?.roleKey === "SUPER_ADMIN") && (
            <>
              <button className="btn btn-sm bg-emerald text-white hover:brightness-110" onClick={() => setDlg("approve")}><CheckCircle2 className="h-3.5 w-3.5" /> اعتماد</button>
              <button className="btn btn-danger btn-sm" onClick={() => setDlg("reject")}><XCircle className="h-3.5 w-3.5" /> رفض</button>
            </>
          )}
          {st === "UNDER_REVIEW" && canReview && isOwner && user?.roleKey !== "SUPER_ADMIN" && <span className="text-[12px] text-gray-500">لا يمكنك اعتماد تقرير أنشأته؛ يعتمده مدير آخر.</span>}
          {["DRAFT", "REJECTED"].includes(st) && (isOwner || user?.roleKey === "SUPER_ADMIN") && <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDlg("delete")}><Trash2 className="h-3.5 w-3.5" /> حذف</button>}
        </div>
      </div>

      <ReportView report={report} content={content} />

      <ConfirmDialog open={dlg === "approve"} tone="primary" title="اعتماد التقرير" message="سيُسجَّل اسمك وتاريخ الاعتماد ويصبح التقرير غير قابل للتعديل، ويُتاح التحقق منه برمز QR." confirmLabel="اعتماد" busy={busy} onConfirm={() => setStatus("APPROVED")} onClose={() => setDlg(null)} />
      <ConfirmDialog open={dlg === "reject"} title="رفض التقرير" message="سيُعاد التقرير إلى صاحبه مع السبب." requireReason={{ label: "سبب الرفض", min: 5 }} confirmLabel="رفض" busy={busy} onConfirm={(r) => setStatus("REJECTED", r)} onClose={() => setDlg(null)} />
      <ConfirmDialog open={dlg === "delete"} title="حذف التقرير" message="سيُحذف هذا التقرير نهائياً." confirmLabel="حذف" busy={busy} onConfirm={remove} onClose={() => setDlg(null)} />
    </div>
  );
}
