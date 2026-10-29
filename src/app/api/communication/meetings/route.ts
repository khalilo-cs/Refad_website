import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec, query, queryOne, uuid } from "@/lib/db/sqlite";
import { canAccessSchool, schoolScope } from "@/lib/scope";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];
const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET — سجل الاجتماعات والمتابعات ضمن نطاق المستخدم. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!WRITE.includes(session.roleKey)) return bad("غير مصرح", 403);
  const sc = schoolScope(session, "s");
  const rows = query(
    `SELECT m.*, s.name AS school_name, u.name AS created_by_name FROM meetings m LEFT JOIN schools s ON s.id = m.school_id JOIN users u ON u.id = m.created_by_id
     WHERE (m.school_id IS NULL AND m.created_by_id = ?) OR (m.school_id IS NOT NULL AND ${sc.sql}) ORDER BY date(m.meeting_date) DESC LIMIT 200`, [session.userId, ...sc.params]);
  return NextResponse.json({ meetings: rows, canWrite: true });
}

/** POST — تسجيل اجتماع/متابعة. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!WRITE.includes(session.roleKey)) return bad("غير مصرح", 403);
  const b: any = await request.json().catch(() => null);
  const title = String(b?.title ?? "").trim();
  if (title.length < 3) return bad("عنوان الاجتماع مطلوب");
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(b?.meetingDate ?? ""))) return bad("تاريخ الاجتماع غير صالح");
  const schoolId = String(b?.schoolId ?? session.schoolId ?? "") || null;
  if (schoolId && (!queryOne("SELECT id FROM schools WHERE id = ?", [schoolId]) || !canAccessSchool(session, schoolId))) return bad("المدرسة خارج نطاق صلاحيتك", 403);
  const id = uuid();
  const cut = (v: unknown, n: number) => (String(v ?? "").trim().slice(0, n) || null);
  exec("INSERT INTO meetings (id, school_id, title, meeting_date, attendees, minutes, decisions, follow_up, created_by_id) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, schoolId, title.slice(0, 200), String(b.meetingDate).slice(0, 10), cut(b.attendees, 1000), cut(b.minutes, 6000), cut(b.decisions, 4000), cut(b.followUp, 4000), session.userId]);
  auditLog({ userId: session.userId, action: "MEETING_CREATED", entityType: "meeting", entityId: id, ipAddress: clientIp(request) });
  return NextResponse.json({ id, message: "سُجّل الاجتماع" }, { status: 201 });
}

/** DELETE ?id= — منشئ السجل أو مدير المنصة. */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const row = queryOne<any>("SELECT * FROM meetings WHERE id = ?", [request.nextUrl.searchParams.get("id") ?? ""]);
  if (!row) return bad("السجل غير موجود", 404);
  if (row.created_by_id !== session.userId && session.roleKey !== "SUPER_ADMIN") return bad("لا تملك صلاحية الحذف", 403);
  exec("DELETE FROM meetings WHERE id = ?", [row.id]);
  auditLog({ userId: session.userId, action: "MEETING_DELETED", entityType: "meeting", entityId: row.id, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "حُذف السجل" });
}
