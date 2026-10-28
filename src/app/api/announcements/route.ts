import { NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb } from "@/lib/db/sqlite";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const READ_ROLES = [
  "SUPER_ADMIN",
  "EDUCATION_DIRECTOR",
  "INSPECTOR",
  "SCHOOL_PRINCIPAL",
  "QUALITY_COORDINATOR",
  "TEACHER",
  "PARENT",
];

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function parseIdList(raw: unknown): string {
  if (raw == null) return "[]";
  if (Array.isArray(raw)) return JSON.stringify(raw.filter(Boolean).map(String));
  return "[]";
}

/** GET /api/announcements */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: READ_ROLES });
  if (!allowed) return bad("غير مصرح", 403);

  const rows = query<any>(
    `SELECT a.id, a.title, a.content, a.audience_roles, a.directorate_ids, a.school_ids,
            a.published_at, a.expires_at, a.created_at,
            u.name AS created_by_name
     FROM announcements a
     LEFT JOIN users u ON u.id = a.created_by_id
     WHERE (a.expires_at IS NULL OR datetime(a.expires_at) >= datetime('now'))
     ORDER BY COALESCE(a.published_at, a.created_at) DESC
     LIMIT 100`
  );

  // تصفية حسب الصلاحية والجهة
  const visible = rows.filter((r) => {
    if (session.roleKey === "SUPER_ADMIN") return true;
    let roles: string[] = [];
    let schools: string[] = [];
    let dirs: string[] = [];
    try {
      roles = JSON.parse(r.audience_roles ?? "[]");
      schools = JSON.parse(r.school_ids ?? "[]");
      dirs = JSON.parse(r.directorate_ids ?? "[]");
    } catch {}

    if (doArraysTarget(roles, schools, dirs, session)) return true;
    // بلا استهداف = للجميع
    return roles.length === 0 && schools.length === 0 && dirs.length === 0;
  });

  const stats = {
    total: rows.length,
    published: rows.filter((r) => r.published_at).length,
    drafts: rows.filter((r) => !r.published_at).length,
  };

  return NextResponse.json({
    announcements: visible.map((r) => ({
      ...r,
      is_draft: !r.published_at,
      audience_roles: safeArr(r.audience_roles),
      directorate_ids: safeArr(r.directorate_ids),
      school_ids: safeArr(r.school_ids),
    })),
    stats,
  });
}

function safeArr(raw: string): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function doArraysTarget(
  roles: string[],
  schools: string[],
  dirs: string[],
  session: { roleKey: string; schoolId: string | null; directorateId: string | null }
): boolean {
  if (roles.length > 0 && !roles.includes(session.roleKey)) return false;
  if (schools.length > 0 && (!session.schoolId || !schools.includes(session.schoolId)))
    return false;
  if (dirs.length > 0 && (!session.directorateId || !dirs.includes(session.directorateId)))
    return false;
  return true;
}

/** POST /api/announcements — إنشاء إعلان (مدير النظام/مدير التعليم) */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return bad("نشر الإعلانات متاح لمدير النظام ومدير التعليم", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (title.length < 3) return bad("عنوان الإعلان قصير جداً");
  if (content.length < 10) return bad("نص الإعلان قصير جداً (10 أحرف على الأقل)");

  const publish = body.publish === true;
  const id = randomUUID();

  getDb()
    .prepare(
      `INSERT INTO announcements (id, title, content, audience_roles, directorate_ids, school_ids,
         published_at, expires_at, created_by_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`
    )
    .run(
      id,
      title.slice(0, 200),
      content.slice(0, 4000),
      parseIdList(body.audienceRoles),
      parseIdList(body.directorateIds),
      parseIdList(body.schoolIds),
      publish ? new Date().toISOString() : null,
      body.expiresAt ? String(body.expiresAt) : null,
      session.userId
    );

  auditLog({
    userId: session.userId,
    action: publish ? "PUBLISH_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT_DRAFT",
    entityType: "announcement",
    entityId: id,
    newValues: { title, publish },
  });

  return NextResponse.json(
    { id, message: publish ? "تم نشر الإعلان" : "تم حفظ الإعلان كمسودة" },
    { status: 201 }
  );
}

/** PATCH /api/announcements — نشر مسودة أو تعديل */
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return bad("غير مصرح", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const id = String(body.id ?? "");
  const row = queryOne<any>("SELECT * FROM announcements WHERE id = ?", [id]);
  if (!row) return bad("الإعلان غير موجود", 404);

  const db = getDb();
  if (body.action === "publish") {
    db.prepare(
      "UPDATE announcements SET published_at = COALESCE(published_at, datetime('now')) WHERE id = ?"
    ).run(id);
    auditLog({ userId: session.userId, action: "PUBLISH_ANNOUNCEMENT", entityType: "announcement", entityId: id });
    return NextResponse.json({ message: "تم نشر الإعلان" });
  }

  if (body.action === "unpublish") {
    db.prepare("UPDATE announcements SET published_at = NULL WHERE id = ?").run(id);
    return NextResponse.json({ message: "أُعيد الإعلان إلى المسودات" });
  }

  const title = body.title !== undefined ? String(body.title).trim() : row.title;
  const content = body.content !== undefined ? String(body.content).trim() : row.content;
  if (title.length < 3) return bad("عنوان الإعلان قصير جداً");
  if (content.length < 10) return bad("نص الإعلان قصير جداً");

  db.prepare("UPDATE announcements SET title = ?, content = ? WHERE id = ?").run(
    title.slice(0, 200),
    content.slice(0, 4000),
    id
  );
  auditLog({
    userId: session.userId,
    action: "UPDATE_ANNOUNCEMENT",
    entityType: "announcement",
    entityId: id,
    oldValues: { title: row.title },
    newValues: { title },
  });
  return NextResponse.json({ message: "تم حفظ التعديل" });
}

/** DELETE /api/announcements?id= */
export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return bad("غير مصرح", 403);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  const row = queryOne<any>("SELECT * FROM announcements WHERE id = ?", [id]);
  if (!row) return bad("الإعلان غير موجود", 404);

  getDb().prepare("DELETE FROM announcements WHERE id = ?").run(id);
  auditLog({
    userId: session.userId,
    action: "DELETE_ANNOUNCEMENT",
    entityType: "announcement",
    entityId: id,
    oldValues: row,
  });
  return NextResponse.json({ message: "تم حذف الإعلان" });
}
