import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { query, queryOne, exec, uuid, getDb } from "@/lib/db/sqlite";
import { clientIp } from "@/lib/security";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** GET — قائمة الحوادث الأمنية (مدير المنصة فقط). */
export async function GET() {
  const session = await getServerSession();
  if (!session || session.roleKey !== "SUPER_ADMIN") return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const rows = query(
    `SELECT i.*, ru.name AS related_user_name, ru.email AS related_user_email, rp.name AS reported_by_name, ru.is_locked AS related_user_locked
     FROM security_incidents i LEFT JOIN users ru ON ru.id = i.related_user_id LEFT JOIN users rp ON rp.id = i.reported_by_id
     ORDER BY CASE i.status WHEN 'OPEN' THEN 0 WHEN 'INVESTIGATING' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 200`
  );
  return NextResponse.json({ incidents: rows });
}

/** POST — الإبلاغ عن حادث. متاح لكل مستخدم مسجّل (الإبلاغ مفتوح، المعالجة للمدير). */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const title = String(b?.title ?? "").trim();
  const description = String(b?.description ?? "").trim();
  const severity = SEVERITIES.includes(b?.severity) ? b.severity : "MEDIUM";
  if (title.length < 4 || description.length < 10) return NextResponse.json({ message: "العنوان والوصف مطلوبان" }, { status: 400 });
  const relatedUserId = session.roleKey === "SUPER_ADMIN" && b?.relatedUserId ? String(b.relatedUserId) : null;
  const id = uuid();
  exec(
    "INSERT INTO security_incidents (id, title, description, severity, related_user_id, reported_by_id) VALUES (?,?,?,?,?,?)",
    [id, title.slice(0, 200), description.slice(0, 4000), severity, relatedUserId, session.userId]
  );
  const admins = query<{ id: string }>("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = 'SUPER_ADMIN' AND u.is_active = 1");
  notify(admins.map((a) => a.id), "بلاغ أمني جديد", title, { link: "/admin", type: "DANGER" });
  auditLog({ userId: session.userId, action: "SECURITY_INCIDENT_REPORTED", entityType: "incident", entityId: id, newValues: { severity }, ipAddress: clientIp(request) });
  return NextResponse.json({ id, message: "تم تسجيل البلاغ وإشعار مدير المنصة" }, { status: 201 });
}

/**
 * PATCH — { id, status?, resolution?, suspendUser?: boolean }
 * إيقاف الحساب المشتبه به يبطل جلساته فوراً (رفع token_version).
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session || session.roleKey !== "SUPER_ADMIN") return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const inc = queryOne<any>("SELECT * FROM security_incidents WHERE id = ?", [String(b?.id ?? "")]);
  if (!inc) return NextResponse.json({ message: "البلاغ غير موجود" }, { status: 404 });
  const db = getDb();

  if (b?.suspendUser) {
    if (!inc.related_user_id) return NextResponse.json({ message: "لا يوجد حساب مرتبط بالبلاغ" }, { status: 400 });
    if (inc.related_user_id === session.userId) return NextResponse.json({ message: "لا يمكنك إيقاف حسابك" }, { status: 400 });
    db.prepare("UPDATE users SET is_locked = 1, locked_reason = ?, token_version = token_version + 1 WHERE id = ?").run(`بلاغ أمني: ${inc.title}`.slice(0, 200), inc.related_user_id);
    auditLog({ userId: session.userId, action: "USER_SUSPENDED_BY_INCIDENT", entityType: "User", entityId: inc.related_user_id, newValues: { incident: inc.id }, ipAddress: clientIp(request) });
  }
  if (b?.unsuspendUser && inc.related_user_id) {
    db.prepare("UPDATE users SET is_locked = 0, locked_reason = NULL, failed_login = 0, locked_until = NULL WHERE id = ?").run(inc.related_user_id);
    auditLog({ userId: session.userId, action: "USER_UNSUSPENDED", entityType: "User", entityId: inc.related_user_id, ipAddress: clientIp(request) });
  }
  const status = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"].includes(b?.status) ? b.status : inc.status;
  const resolved = status === "RESOLVED" || status === "DISMISSED";
  db.prepare(
    `UPDATE security_incidents SET status = ?, resolution = COALESCE(?, resolution), resolved_by_id = ?, resolved_at = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, b?.resolution ? String(b.resolution).slice(0, 2000) : null, resolved ? session.userId : null, resolved ? new Date().toISOString() : null, inc.id);
  auditLog({ userId: session.userId, action: "SECURITY_INCIDENT_UPDATED", entityType: "incident", entityId: inc.id, newValues: { status }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم تحديث البلاغ" });
}

/** GET نشاط حساب (سجل التدقيق للمستخدم) يتم عبر /api/admin/audit?userId= */
