import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";
import { normalizePermissions, PERMISSION_GROUPS } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: string;
  permissions: Record<string, boolean>;
  is_system: number;
  created_at: string;
  users_count: number;
};

function parsePermissions(raw: unknown): Record<string, boolean> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * GET /api/admin/roles
 * يعيد الأدوار مع عدد المستخدمين في كل دور، وكتالوج الصلاحيات
 * المعروف حتى تبني الواجهة مصفوفة الصلاحيات من مصدر واحد.
 */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "إدارة الأدوار مقصورة على مدير النظام" },
        { status: 403 }
      );
    }

    const rows = query<Omit<RoleRow, "permissions"> & { permissions: unknown }>(
      `SELECT r.id, r.key, r.name, r.description, r.scope, r.permissions,
              r.is_system, r.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS users_count
       FROM roles r
       ORDER BY r.is_system DESC, r.name`
    );

    return NextResponse.json({
      roles: rows.map((r) => ({ ...r, permissions: parsePermissions(r.permissions) })),
      catalog: PERMISSION_GROUPS,
    });
  } catch {
    return NextResponse.json({ message: "تعذّر تحميل الأدوار" }, { status: 500 });
  }
}

/**
 * POST /api/admin/roles — إنشاء دور جديد.
 * الجسم: { key, name, description?, permissions }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "إنشاء الأدوار مقصور على مدير النظام" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const key = String(body?.key ?? "").trim().toUpperCase();
    const name = String(body?.name ?? "").trim();
    const description = body?.description ? String(body.description).trim() : null;

    if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(key)) {
      return NextResponse.json(
        {
          message:
            "مفتاح الدور يجب أن يبدأ بحرف إنجليزي ويتكوّن من أحرف كبيرة وأرقام وشرطات سفلية (3–40 حرفاً)",
        },
        { status: 400 }
      );
    }
    if (name.length < 2) {
      return NextResponse.json({ message: "اسم الدور مطلوب" }, { status: 400 });
    }

    let permissions: Record<string, boolean>;
    try {
      permissions = normalizePermissions(body?.permissions);
    } catch (e: any) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }

    const exists = queryOne<{ id: string }>("SELECT id FROM roles WHERE key = ?", [key]);
    if (exists) {
      return NextResponse.json({ message: "يوجد دور بالمفتاح نفسه" }, { status: 409 });
    }

    const id = uuid();
    const now = nowISO();

    getDb()
      .prepare(
        `INSERT INTO roles (id, key, name, description, scope, permissions, is_system, created_at)
         VALUES (?, ?, ?, ?, 'system', ?, 0, ?)`
      )
      .run(id, key, name, description, JSON.stringify(permissions), now);

    auditLog({
      userId: session.userId,
      action: "ROLE_CREATED",
      entityType: "Role",
      entityId: id,
      newValues: { key, name, permissions },
    });

    return NextResponse.json({ message: "تم إنشاء الدور", id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ message: "تعذّر إنشاء الدور" }, { status: 500 });
  }
}
