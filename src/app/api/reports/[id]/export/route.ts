import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec, uuid } from "@/lib/db/sqlite";
import { getReportRow, parseContent } from "@/lib/reports/service";
import { renderReportPdf } from "@/lib/reports/render-pdf";
import { contentToCsv, contentToXlsx } from "@/lib/reports/export";
import { clientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_AR: Record<string, string> = { DRAFT: "مسودة", UNDER_REVIEW: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض" };

/** GET /api/reports/[id]/export?format=pdf|xlsx|csv — يُنشأ الملف من لقطة المحتوى المثبَّتة. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const rl = rateLimit(`export:${session.userId}`, 30, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ message: "عدد كبير من عمليات التصدير. حاول لاحقاً." }, { status: 429 });

  const { id } = await params;
  const format = (request.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
  const row = getReportRow(session, id);
  if (!row) return NextResponse.json({ message: "التقرير غير موجود" }, { status: 404 });
  const content = parseContent(row);
  if (!content) return NextResponse.json({ message: "هذا التقرير قديم ولا يحمل محتوى مثبَّتاً. ولّد تقريراً جديداً." }, { status: 409 });

  const base = process.env.APP_URL ?? new URL(request.url).origin;
  const extra: [string, string][] = [["رقم التقرير", row.number], ["الحالة", STATUS_AR[row.status] ?? row.status], ["رمز التحقق", row.verification_code]];
  if (row.approved_by_name) extra.push(["اعتُمد بواسطة", row.approved_by_name]);
  const safeName = row.number.replace(/[^A-Za-z0-9-]/g, "");

  exec("INSERT INTO export_logs (id, type, filters, created_by_id) VALUES (?,?,?,?)", [uuid(), `REPORT_${format.toUpperCase()}`, JSON.stringify({ id, number: row.number }), session.userId]);
  auditLog({ userId: session.userId, action: "REPORT_EXPORT", entityType: "report", entityId: id, newValues: { format }, ipAddress: clientIp(request) });
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

  if (format === "csv") {
    return new NextResponse(contentToCsv(content, extra), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}.csv"` } });
  }
  if (format === "xlsx") {
    const buf = await contentToXlsx(content, extra);
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${safeName}.xlsx"` } });
  }
  if (format === "pdf") {
    const buf = await renderReportPdf(content, {
      number: row.number, status: row.status, verificationCode: row.verification_code,
      verifyUrl: `${base}/verify?code=${row.verification_code}`, approvedBy: row.approved_by_name, approvedAt: row.approved_at, rejectionReason: row.rejection_reason,
      issuer: row.directorate_name ? `الجمهورية اليمنية — محافظة الحديدة — مديرية ${row.directorate_name}` : undefined,
    });
    const inline = request.nextUrl.searchParams.get("inline") === "1";
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}.pdf"` } });
  }
  return NextResponse.json({ message: "الصيغة المدعومة: pdf أو xlsx أو csv" }, { status: 400 });
}
