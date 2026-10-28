import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { queryOne, getDb, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "governorate" | "directorate" | "area";

const TABLES: Record<Kind, string> = {
  governorate: "governorates",
  directorate: "directorates",
  area: "areas",
};

/**
 * PATCH /api/admin/reference/[id]?type=governorate
 * يعدّل الاسم أو الرمز. مقصور على مدير النظام.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json({ message: "التعديل مقصور على مدير النظام" }, { status: 403 });
    }

    const { id } = await params;
    const type = new URL(request.url).searchParams.get("type") as Kind | null;
    if (!type || !TABLES[type]) {
      return NextResponse.json({ message: "نوع البيانات غير صالح" }, { status: 400 });
    }

    const table = TABLES[type];
    const existing = queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM ${table} WHERE id = ?`,
      [id]
    );
    if (!existing) {
      return NextResponse.json({ message: "العنصر غير موجود" }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, parentId } = body ?? {};

    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
      return NextResponse.json({ message: "الاسم غير صالح" }, { status: 400 });
    }

    const sets: string[] = [];
    const args: (string | null)[] = [];

    if (name !== undefined) {
      sets.push("name = ?");
      args.push(name.trim());
    }

    if (type !== "area" && code !== undefined) {
      sets.push("code = ?");
      args.push(typeof code === "string" && code.trim() ? code.trim() : null);
    }

    // نقل مديرية إلى محافظة أخرى، أو منطقة إلى مديرية أخرى
    if (type === "directorate" && parentId) {
      const gov = queryOne<{ id: string }>("SELECT id FROM governorates WHERE id = ?", [parentId]);
      if (!gov) return NextResponse.json({ message: "المحافظة غير موجودة" }, { status: 404 });
      sets.push("governorate_id = ?");
      args.push(parentId);
    }
    if (type === "area" && parentId) {
      const dir = queryOne<{ id: string }>("SELECT id FROM directorates WHERE id = ?", [parentId]);
      if (!dir) return NextResponse.json({ message: "المديرية غير موجودة" }, { status: 404 });
      sets.push("directorate_id = ?");
      args.push(parentId);
    }

    if (sets.length === 0) {
      return NextResponse.json({ message: "لا توجد حقول للتعديل" }, { status: 400 });
    }

    args.push(id);
    getDb()
      .prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`)
      .run(...args);

    auditLog({
      userId: session.userId,
      action: `${type.toUpperCase()}_UPDATED`,
      entityType: type,
      entityId: id,
      oldValues: existing,
      newValues: body,
    });

    return NextResponse.json({ message: "تم حفظ التعديل" });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر حفظ التعديل",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/reference/[id]?type=directorate
 * يمنع الحذف إذا كانت هناك مدارس مرتبطة، حتى لا تُفقد بيانات.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json({ message: "الحذف مقصور على مدير النظام" }, { status: 403 });
    }

    const { id } = await params;
    const type = new URL(request.url).searchParams.get("type") as Kind | null;
    if (!type || !TABLES[type]) {
      return NextResponse.json({ message: "نوع البيانات غير صالح" }, { status: 400 });
    }

    const table = TABLES[type];
    const existing = queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM ${table} WHERE id = ?`,
      [id]
    );
    if (!existing) {
      return NextResponse.json({ message: "العنصر غير موجود" }, { status: 404 });
    }

    // فحص الارتباطات المباشرة قبل الحذف
    let blockers: { schools: number; children: number };
    if (type === "governorate") {
      blockers = {
        schools: queryOne<{ n: number }>(
          "SELECT COUNT(*) AS n FROM schools WHERE governorate_id = ?",
          [id]
        )?.n ?? 0,
        children: queryOne<{ n: number }>(
          "SELECT COUNT(*) AS n FROM directorates WHERE governorate_id = ?",
          [id]
        )?.n ?? 0,
      };
    } else if (type === "directorate") {
      blockers = {
        schools: queryOne<{ n: number }>(
          "SELECT COUNT(*) AS n FROM schools WHERE directorate_id = ?",
          [id]
        )?.n ?? 0,
        children: queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM areas WHERE directorate_id = ?", [
          id,
        ])?.n ?? 0,
      };
    } else {
      blockers = {
        schools: queryOne<{ n: number }>(
          "SELECT COUNT(*) AS n FROM schools WHERE area_id = ?",
          [id]
        )?.n ?? 0,
        children: 0,
      };
    }

    if (blockers.schools > 0) {
      return NextResponse.json(
        {
          message: `لا يمكن الحذف: ${blockers.schools} مدرسة مرتبطة بهذا العنصر. انقلها أو غيّر ارتباطها أولاً.`,
          blockers,
        },
        { status: 409 }
      );
    }
    if (blockers.children > 0) {
      return NextResponse.json(
        {
          message: `لا يمكن الحذف: يوجد ${blockers.children} عنصر فرعي مرتبط. احذفه أولاً.`,
          blockers,
        },
        { status: 409 }
      );
    }

    getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

    auditLog({
      userId: session.userId,
      action: `${type.toUpperCase()}_DELETED`,
      entityType: type,
      entityId: id,
      oldValues: existing,
    });

    return NextResponse.json({ message: "تم الحذف" });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر الحذف",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
