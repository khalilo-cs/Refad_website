import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { queryOne, getDb } from "@/lib/db/sqlite";
import { normalizePermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

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
 * PATCH /api/admin/roles/[id] — تعديل اسم الدور أو وصفه أو صلاحياته.
 *
 * قيود السلامة:
 * - لا يمكن إزالة صلاحية «كل الصلاحيات» من دور مدير النظام الأساسي،
 *   حتى لا يقفل المدير الباب على نفسه.
 * - مفتاح الدور لا يُعدَّل بعد الإنشاء، لأن الكود يشير إليه في مسارات
 *   الصلاحيات؛ تغييره يفتح ثغرة صامتة.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json({ message: "تعديل الأدوار مقصور على مدير النظام" }, { status: 403 });
    }

    const { id } = await params;
    const role = queryOne<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      permissions: string;
    }>("SELECT id, key, name, description, permissions FROM roles WHERE id = ?", [id]);

    if (!role) {
      return NextResponse.json({ message: "الدور غير موجود" }, { status: 404 });
    }

    const body = await request.json();
    const name = body?.name !== undefined ? String(body.name).trim() : undefined;
    const description =
      body?.description !== undefined
        ? body.description
          ? String(body.description).trim()
          : null
        : undefined;

    if (name !== undefined && name.length < 2) {
      return NextResponse.json({ message: "اسم الدور قصير جداً" }, { status: 400 });
    }

    let permissions: Record<string, boolean> | undefined;
    if (body?.permissions !== undefined) {
      try {
        permissions = normalizePermissions(body.permissions);
      } catch (e: any) {
        return NextResponse.json({ message: e.message }, { status: 400 });
      }

      if (role.key === "SUPER_ADMIN" && !permissions.all) {
        return NextResponse.json(
          {
            message:
              "لا يمكن إزالة صلاحية «كل الصلاحيات» من دور مدير المنصة — منعاً لإغلاق النظام على نفسك",
          },
          { status: 409 }
        );
      }
    }

    getDb()
      .prepare(
        `UPDATE roles SET name = COALESCE(?, name),
                          description = COALESCE(?, description),
                          permissions = COALESCE(?, permissions)
         WHERE id = ?`
      )
      .run(
        name ?? null,
        description === undefined ? null : description,
        permissions ? JSON.stringify(permissions) : null,
        id
      );

    auditLog({
      userId: session.userId,
      action: "ROLE_UPDATED",
      entityType: "Role",
      entityId: id,
      oldValues: { name: role.name, permissions: parsePermissions(role.permissions) },
      newValues: { name, permissions },
    });

    return NextResponse.json({ message: "تم تحديث الدور" });
  } catch {
    return NextResponse.json({ message: "تعذّر تحديث الدور" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/roles/[id]
 *
 * لا يُحذف دور أساسي، ولا دور مرتبط بمستخدمين — لأن حذفه يُفقد
 * أصحابه صلاحياتهم بصمت. المطلوب أولاً نقل المستخدمين إلى دور آخر.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json({ message: "حذف الأدوار مقصور على مدير النظام" }, { status: 403 });
    }

    const { id } = await params;
    const role = queryOne<{ id: string; key: string; is_system: number; name: string }>(
      "SELECT id, key, is_system, name FROM roles WHERE id = ?",
      [id]
    );

    if (!role) {
      return NextResponse.json({ message: "الدور غير موجود" }, { status: 404 });
    }
    if (role.is_system === 1) {
      return NextResponse.json(
        { message: "الأدوار الأساسية لا تُحذف — يمكن تعديل صلاحياتها بدل ذلك" },
        { status: 409 }
      );
    }

    const used = queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM users WHERE role_id = ?",
      [id]
    );
    if ((used?.c ?? 0) > 0) {
      return NextResponse.json(
        {
          message: `هذا الدور مرتبط بـ ${used?.c} مستخدم. انقلهم إلى دور آخر قبل الحذف.`,
          usersCount: used?.c ?? 0,
        },
        { status: 409 }
      );
    }

    getDb().prepare("DELETE FROM roles WHERE id = ?").run(id);

    auditLog({
      userId: session.userId,
      action: "ROLE_DELETED",
      entityType: "Role",
      entityId: id,
      oldValues: { key: role.key, name: role.name },
    });

    return NextResponse.json({ message: "تم حذف الدور" });
  } catch {
    return NextResponse.json({ message: "تعذّر حذف الدور" }, { status: 500 });
  }
}
