import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/users/export?format=xlsx|csv — تصدير قائمة المستخدمين. SUPER_ADMIN فقط. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
    return NextResponse.json({ message: "تصدير المستخدمين مقصور على مدير النظام" }, { status: 403 });
  }

  const rows = await query<any>(
    `SELECT u.name, u.email, u.username, u.phone, u.job_title,
            r.name AS role_name, s.name AS school_name, s.code AS school_code,
            COALESCE(d.name, sd.name) AS directorate_name,
            CASE WHEN u.is_locked = 1 THEN 'مقفل' WHEN u.is_active = 1 THEN 'نشط' ELSE 'معطّل' END AS status,
            u.last_login_at, u.created_at
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN schools s ON u.school_id = s.id
     LEFT JOIN directorates d ON u.directorate_id = d.id
     LEFT JOIN directorates sd ON s.directorate_id = sd.id
     WHERE u.deleted_at IS NULL
     ORDER BY u.name`
  );

  const headers = ["الاسم", "البريد", "اسم الدخول", "الهاتف", "المسمى الوظيفي", "الدور", "المدرسة", "رمز المدرسة", "المديرية", "الحالة", "آخر دخول", "تاريخ الإنشاء"];
  const data = rows.map((r) => [
    r.name, r.email, r.username, r.phone, r.job_title,
    r.role_name, r.school_name, r.school_code, r.directorate_name,
    r.status, r.last_login_at, r.created_at,
  ]);

  await auditLog({ userId: session.userId, action: "EXPORT_USERS", entityType: "User", newValues: { count: rows.length }, ipAddress: clientIp(request) });

  const sp = request.nextUrl.searchParams;
  if (sp.get("format") === "csv") {
    const esc = (v: unknown) => {
      let t = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const csv = "﻿" + [headers, ...data].map((r) => r.map(esc).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=users.csv", "Cache-Control": "no-store" } });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("المستخدمون", { views: [{ rightToLeft: true }] });
  ws.addRow(headers);
  ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } }; });
  for (const r of data) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v)));
  ws.columns.forEach((c) => { c.width = 20; });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=users.xlsx", "Cache-Control": "no-store" } });
}
