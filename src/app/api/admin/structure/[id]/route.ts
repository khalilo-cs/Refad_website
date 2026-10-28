import { NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { queryOne, getDb } from "@/lib/db/sqlite";

export const runtime = "nodejs";

const TABLES: Record<string, string> = {
  criterion: "criteria",
  subCriterion: "sub_criteria",
  indicator: "indicators",
};

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function parseJsonArray(raw: unknown): string | null {
  if (raw == null || raw === "") return "[]";
  if (Array.isArray(raw)) return JSON.stringify(raw.map((x) => String(x).trim()).filter(Boolean));
  if (typeof raw === "string") {
    const parts = raw
      .split(/\r?\n|،|;/)
      .map((x) => x.trim())
      .filter(Boolean);
    return JSON.stringify(parts);
  }
  return null;
}

/** PATCH /api/admin/structure/[id]?kind=criterion|subCriterion|indicator */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN"] });
  if (!allowed) return bad("غير مصرح", 403);

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "";
  const table = TABLES[kind];
  if (!table) return bad("نوع العنصر غير معروف");

  const existing = queryOne<any>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!existing) return bad("العنصر غير موجود", 404);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.title !== undefined || body.name !== undefined) {
    const name = String(body.title ?? body.name).trim();
    if (name.length < 2) return bad("الاسم قصير جداً");
    if (name.length > 500) return bad("الاسم طويل جداً");
    sets.push("title = ?");
    params.push(name);
  }

  if (body.code !== undefined && kind !== "indicator") {
    const code = String(body.code).trim();
    if (!/^[0-9]+(-[0-9]+)?$/.test(code)) return bad("الرمز يجب أن يكون رقمياً");
    const clash = queryOne(`SELECT id FROM ${table} WHERE code = ? AND id <> ?`, [code, id]);
    if (clash) return bad("الرمز مستخدم في عنصر آخر");
    sets.push("code = ?");
    params.push(code);
  }

  if (body.weight !== undefined && kind !== "indicator") {
    const weight = Number(body.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100)
      return bad("الوزن يجب أن يكون بين 0 و100");
    sets.push("weight = ?");
    params.push(Math.round(weight));
  }

  if (body.orderIndex !== undefined) {
    const o = Number(body.orderIndex);
    if (!Number.isFinite(o)) return bad("ترتيب غير صالح");
    sets.push("order_index = ?");
    params.push(Math.round(o));
  }

  if (kind === "indicator") {
    if (body.evidence !== undefined) {
      const ev = parseJsonArray(body.evidence);
      if (ev === null) return bad("صيغة قائمة الأدلة غير صحيحة");
      sets.push("evidence = ?");
      params.push(ev);
    }
    if (body.verificationTools !== undefined) {
      const vt = parseJsonArray(body.verificationTools);
      if (vt === null) return bad("صيغة أدوات التحقق غير صحيحة");
      sets.push("verification_tools = ?");
      params.push(vt);
    }
    if (body.subCriterionId !== undefined) {
      const subId = body.subCriterionId ? String(body.subCriterionId) : null;
      if (subId) {
        const sub = queryOne<{ criterion_id: string }>(
          "SELECT criterion_id FROM sub_criteria WHERE id = ?",
          [subId]
        );
        if (!sub) return bad("المعيار الفرعي غير موجود");
        sets.push("sub_criterion_id = ?", "criterion_id = ?");
        params.push(subId, sub.criterion_id);
      } else {
        sets.push("sub_criterion_id = ?");
        params.push(null);
      }
    }
  }

  if (kind === "subCriterion" && body.criterionId !== undefined) {
    const cid = String(body.criterionId);
    if (!queryOne("SELECT id FROM criteria WHERE id = ?", [cid]))
      return bad("المعيار الأب غير موجود");
    sets.push("criterion_id = ?");
    params.push(cid);
  }

  if (sets.length === 0) return bad("لا توجد تعديلات");

  try {
    params.push(id);
    db.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`).run(...(params as any[]));
    auditLog({
      userId: session.userId,
      action: `UPDATE_${kind.toUpperCase()}`,
      entityType: kind === "subCriterion" ? "sub_criterion" : kind,
      entityId: id,
      oldValues: existing,
      newValues: body,
    });
    return NextResponse.json({ message: "تم حفظ التعديل" });
  } catch (e: any) {
    return bad("تعذّر الحفظ: " + (e?.message ?? "خطأ غير معروف"), 500);
  }
}

/** DELETE /api/admin/structure/[id]?kind=…&force=true */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN"] });
  if (!allowed) return bad("غير مصرح", 403);

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "";
  const force = searchParams.get("force") === "true";
  const table = TABLES[kind];
  if (!table) return bad("نوع العنصر غير معروف");

  const existing = queryOne<any>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!existing) return bad("العنصر غير موجود", 404);

  const db = getDb();

  try {
    // منع حذف هيكل جرى تقييمه فعلياً إلا بموافقة صريحة
    if (!force) {
      let usedCount = 0;
      if (kind === "indicator") {
        usedCount =
          queryOne<{ c: number }>("SELECT COUNT(*) c FROM evaluations WHERE indicator_id = ?", [
            id,
          ])?.c ?? 0;
      } else if (kind === "subCriterion") {
        usedCount =
          queryOne<{ c: number }>(
            `SELECT COUNT(*) c FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
             WHERE i.sub_criterion_id = ?`,
            [id]
          )?.c ?? 0;
      } else {
        usedCount =
          queryOne<{ c: number }>(
            `SELECT COUNT(*) c FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
             WHERE i.criterion_id = ?`,
            [id]
          )?.c ?? 0;
      }
      if (usedCount > 0) {
        return NextResponse.json(
          {
            message: `لا يمكن الحذف: يوجد ${usedCount} تقييماً مرتبطاً بهذا العنصر. أرشِفه بدل حذفه أو أعد المحاولة مع التأكيد الصريح.`,
            blockers: { evaluations: usedCount },
          },
          { status: 409 }
        );
      }
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    auditLog({
      userId: session.userId,
      action: `DELETE_${kind.toUpperCase()}`,
      entityType: kind === "subCriterion" ? "sub_criterion" : kind,
      entityId: id,
      oldValues: existing,
    });
    return NextResponse.json({ message: "تم الحذف" });
  } catch (e: any) {
    return bad("تعذّر الحذف: " + (e?.message ?? "خطأ غير معروف"), 500);
  }
}
