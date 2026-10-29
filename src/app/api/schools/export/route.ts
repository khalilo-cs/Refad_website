import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { getServerSession, auditLog } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/schools/export?format=xlsx|csv — تصدير المدارس ضمن نطاق المستخدم. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (["PARENT", "GUEST", "TEACHER"].includes(session.roleKey)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const sc = await schoolScope(session, "s");
  const where = [sc.sql];
  const params: unknown[] = [...sc.params];
  if (sp.get("directorateId")) { where.push("s.directorate_id = ?"); params.push(sp.get("directorateId")); }
  const rows = await query<any>(
    `SELECT s.code, s.name, g.name AS gov, d.name AS dir, s.type, s.stage, s.address, s.contact_phone, s.contact_email,
            s.principal_name, s.latitude, s.longitude, s.status, s.data_source, s.last_updated_at
     FROM schools s JOIN governorates g ON g.id = s.governorate_id JOIN directorates d ON d.id = s.directorate_id
     WHERE ${where.join(" AND ")} ORDER BY s.name`, params);
  const headers = ["الكود", "الاسم", "المحافظة", "المديرية", "النوع", "المرحلة", "العنوان", "الهاتف", "البريد", "مدير المدرسة", "خط العرض", "خط الطول", "الحالة", "المصدر", "آخر تحديث"];
  const data = rows.map((r) => [r.code, r.name, r.gov, r.dir, r.type, r.stage, r.address, r.contact_phone, r.contact_email, r.principal_name, r.latitude, r.longitude, r.status, r.data_source, r.last_updated_at]);
  await auditLog({ userId: session.userId, action: "EXPORT_SCHOOLS", entityType: "School", newValues: { count: rows.length }, ipAddress: clientIp(request) });

  if (sp.get("format") === "csv") {
    // حماية من حقن الصيغ في Excel: نبادئ القيم التي تبدأ برموز الصيغ بفاصلة عليا
    const esc = (v: unknown) => {
      let t = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const csv = "﻿" + [headers, ...data].map((r) => r.map(esc).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=schools.csv", "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("المدارس", { views: [{ rightToLeft: true }] });
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } }; });
  for (const r of data) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v)));
  ws.columns.forEach((c) => { c.width = 20; });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=schools.xlsx", "Cache-Control": "no-store" } });
}
