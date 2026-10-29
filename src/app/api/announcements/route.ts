import { NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid } from "@/lib/db/sqlite";
import { clientIp } from "@/lib/security";
import { notify } from "@/lib/notify";
import { arr, targets, userTargets } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER", "PARENT"];
const WRITE_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL"];
const SCHOOL_AUDIENCE = ["TEACHER", "PARENT", "QUALITY_COORDINATOR"];

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });
/** GET /api/announcements — المنشورة الموجَّهة للمستخدم، والمسودات لصاحبها ومدير المنصة فقط. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!READ_ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);

  const rows = query<any>(
    `SELECT a.id, a.title, a.content, a.audience_roles, a.directorate_ids, a.school_ids, a.published_at, a.expires_at, a.created_at, a.created_by_id,
            u.name AS created_by_name,
            (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
            EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS is_read
     FROM announcements a LEFT JOIN users u ON u.id = a.created_by_id
     WHERE (a.expires_at IS NULL OR datetime(a.expires_at) >= datetime('now'))
     ORDER BY COALESCE(a.published_at, a.created_at) DESC LIMIT 200`, [session.userId]);
  const t = userTargets(session);
  const visible = rows.map((r) => ({ ...r, audience_roles: arr(r.audience_roles), directorate_ids: arr(r.directorate_ids), school_ids: arr(r.school_ids), is_draft: !r.published_at, is_read: !!r.is_read }))
    .filter((r) => {
      if (session.roleKey === "SUPER_ADMIN") return true;
      if (r.created_by_id === session.userId) return true;
      if (!r.published_at) return false; // المسودة لا يراها غير صاحبها
      return targets(r, session.roleKey, t);
    })
    .map((r) => ({ ...r, read_count: r.created_by_id === session.userId || session.roleKey === "SUPER_ADMIN" ? r.read_count : undefined }));
  const mine = visible.filter((r) => r.created_by_id === session.userId || session.roleKey === "SUPER_ADMIN");
  return NextResponse.json({
    announcements: visible,
    canWrite: WRITE_ROLES.includes(session.roleKey),
    stats: { total: visible.length, published: mine.filter((r) => r.published_at).length, drafts: mine.filter((r) => !r.published_at).length, unread: visible.filter((r) => r.published_at && !r.is_read).length },
  });
}

/** POST — إنشاء إعلان. مدير المدرسة يقتصر على مدرسته وعلى جمهور المدرسة. */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!WRITE_ROLES.includes(session.roleKey)) return bad("نشر الإعلانات لمدير النظام ومدير الإدارة التعليمية ومدير المدرسة", 403);
  const body: any = await request.json().catch(() => null);
  if (!body) return bad("صيغة الطلب غير صحيحة");

  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (title.length < 3) return bad("عنوان الإعلان قصير جداً");
  if (content.length < 10) return bad("نص الإعلان قصير جداً (10 أحرف على الأقل)");
  let roles = arr(body.audienceRoles);
  let schools = arr(body.schoolIds);
  let dirs = arr(body.directorateIds);
  if (session.roleKey === "SCHOOL_PRINCIPAL") {
    if (!session.schoolId) return bad("حسابك غير مرتبط بمدرسة");
    schools = [session.schoolId]; dirs = [];
    roles = roles.filter((r) => SCHOOL_AUDIENCE.includes(r));
  } else if (session.roleKey === "EDUCATION_DIRECTOR") {
    if (!session.directorateId) return bad("حسابك غير مرتبط بمديرية");
    dirs = [session.directorateId];
    const own = query<{ id: string }>("SELECT id FROM schools WHERE directorate_id = ?", [session.directorateId]).map((s) => s.id);
    schools = schools.filter((s) => own.includes(s));
  }
  const publish = body.publish === true;
  let expires: string | null = null;
  if (body.expiresAt) { if (Number.isNaN(Date.parse(String(body.expiresAt)))) return bad("تاريخ الانتهاء غير صالح"); expires = String(body.expiresAt); }
  const id = uuid();
  getDb().prepare(
    `INSERT INTO announcements (id, title, content, audience_roles, directorate_ids, school_ids, published_at, expires_at, created_by_id)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, title.slice(0, 200), content.slice(0, 4000), JSON.stringify(roles), JSON.stringify(dirs), JSON.stringify(schools), publish ? new Date().toISOString() : null, expires, session.userId);
  auditLog({ userId: session.userId, action: publish ? "PUBLISH_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT_DRAFT", entityType: "announcement", entityId: id, newValues: { title, publish }, ipAddress: clientIp(request) });
  if (publish) notifyAudience(id, title, { roles, schools, dirs }, session.userId);
  return NextResponse.json({ id, message: publish ? "تم نشر الإعلان" : "تم حفظ الإعلان كمسودة" }, { status: 201 });
}

/** يرسل إشعاراً للمستهدفين (حتى 500 مستخدم). */
function notifyAudience(id: string, title: string, a: { roles: string[]; schools: string[]; dirs: string[] }, exceptUserId: string) {
  const users = query<any>(
    `SELECT u.id, u.school_id, u.directorate_id, r.key AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_active = 1 AND u.id <> ? LIMIT 2000`, [exceptUserId]);
  const ids: string[] = [];
  for (const u of users) {
    const t = userTargets({ userId: u.id, roleKey: u.role, schoolId: u.school_id, directorateId: u.directorate_id });
    if (targets({ audience_roles: a.roles, school_ids: a.schools, directorate_ids: a.dirs }, u.role, t)) ids.push(u.id);
    if (ids.length >= 500) break;
  }
  notify(ids, "إعلان جديد", title, { link: "/communication", type: "INFO" });
}

/** مالك الإعلان أو مدير المنصة فقط. */
function ownerOrAdmin(session: { userId: string; roleKey: string }, row: { created_by_id: string }) {
  return session.roleKey === "SUPER_ADMIN" || row.created_by_id === session.userId;
}

/** PATCH — { id, action: "publish" | "unpublish" | "read" } أو تعديل { id, title, content } */
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!READ_ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);
  const body: any = await request.json().catch(() => null);
  if (!body) return bad("صيغة الطلب غير صحيحة");
  const row = queryOne<any>("SELECT * FROM announcements WHERE id = ?", [String(body.id ?? "")]);
  if (!row) return bad("الإعلان غير موجود", 404);
  const db = getDb();

  if (body.action === "read") {
    if (row.published_at) db.prepare("INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?,?)").run(row.id, session.userId);
    return NextResponse.json({ ok: true });
  }
  if (!WRITE_ROLES.includes(session.roleKey) || !ownerOrAdmin(session, row)) return bad("لا تملك صلاحية تعديل هذا الإعلان", 403);

  if (body.action === "publish") {
    db.prepare("UPDATE announcements SET published_at = COALESCE(published_at, datetime('now')) WHERE id = ?").run(row.id);
    auditLog({ userId: session.userId, action: "PUBLISH_ANNOUNCEMENT", entityType: "announcement", entityId: row.id, ipAddress: clientIp(request) });
    if (!row.published_at) notifyAudience(row.id, row.title, { roles: arr(row.audience_roles), schools: arr(row.school_ids), dirs: arr(row.directorate_ids) }, session.userId);
    return NextResponse.json({ message: "تم نشر الإعلان" });
  }
  if (body.action === "unpublish") {
    db.prepare("UPDATE announcements SET published_at = NULL WHERE id = ?").run(row.id);
    return NextResponse.json({ message: "أُعيد الإعلان إلى المسودات" });
  }
  const title = body.title !== undefined ? String(body.title).trim() : row.title;
  const content = body.content !== undefined ? String(body.content).trim() : row.content;
  if (title.length < 3) return bad("عنوان الإعلان قصير جداً");
  if (content.length < 10) return bad("نص الإعلان قصير جداً");
  db.prepare("UPDATE announcements SET title = ?, content = ? WHERE id = ?").run(title.slice(0, 200), content.slice(0, 4000), row.id);
  auditLog({ userId: session.userId, action: "UPDATE_ANNOUNCEMENT", entityType: "announcement", entityId: row.id, oldValues: { title: row.title }, newValues: { title }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حفظ التعديل" });
}

/** DELETE ?id= */
export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!WRITE_ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);
  const row = queryOne<any>("SELECT * FROM announcements WHERE id = ?", [new URL(request.url).searchParams.get("id") ?? ""]);
  if (!row) return bad("الإعلان غير موجود", 404);
  if (!ownerOrAdmin(session, row)) return bad("لا تملك صلاحية حذف هذا الإعلان", 403);
  getDb().prepare("DELETE FROM announcements WHERE id = ?").run(row.id);
  auditLog({ userId: session.userId, action: "DELETE_ANNOUNCEMENT", entityType: "announcement", entityId: row.id, oldValues: { title: row.title }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حذف الإعلان" });
}
