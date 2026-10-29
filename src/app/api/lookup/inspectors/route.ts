import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";

export const runtime = "nodejs";

/** المفتشون المتاحون لإسناد الزيارات (ضمن مديرية المستخدم إن كان مدير مديرية). */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (!["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const where = ["r.key = 'INSPECTOR'", "u.is_active = 1"];
  const params: unknown[] = [];
  if (session.roleKey === "EDUCATION_DIRECTOR" && session.directorateId) { where.push("u.directorate_id = ?"); params.push(session.directorateId); }
  if (session.roleKey === "INSPECTOR") { where.push("u.id = ?"); params.push(session.userId); }
  return NextResponse.json(query(`SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where.join(" AND ")} ORDER BY u.name`, params));
}
