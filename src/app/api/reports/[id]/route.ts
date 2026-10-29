import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { getDb } from "@/lib/db/sqlite";
import { getReportRow, parseContent } from "@/lib/reports/service";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reports/[id] — تفاصيل التقرير ومحتواه المثبَّت للمعاينة. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  const { id } = await params;
  const row = getReportRow(session, id);
  if (!row) return NextResponse.json({ message: "التقرير غير موجود" }, { status: 404 });
  const content = parseContent(row);
  const { content: _c, params: _p, ...meta } = row;
  return NextResponse.json({ report: meta, content });
}

/** DELETE — حذف مسودة أو تقرير مرفوض فقط (لصاحبه أو مدير المنصة). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  const { id } = await params;
  const row = getReportRow(session, id);
  if (!row) return NextResponse.json({ message: "التقرير غير موجود" }, { status: 404 });
  if (!["DRAFT", "REJECTED"].includes(row.status)) return NextResponse.json({ message: "لا يمكن حذف تقرير قيد المراجعة أو معتمد" }, { status: 409 });
  if (row.generated_by_id !== session.userId && session.roleKey !== "SUPER_ADMIN") return NextResponse.json({ message: "لا تملك صلاحية الحذف" }, { status: 403 });
  getDb().prepare("DELETE FROM reports WHERE id = ?").run(id);
  auditLog({ userId: session.userId, action: "REPORT_DELETED", entityType: "report", entityId: id, oldValues: { number: row.number, status: row.status }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حذف التقرير" });
}
