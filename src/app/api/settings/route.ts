import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** قراءة كل الإعدادات (للمدير) أو العامة فقط. */
export async function GET() {
  try {
    const session = await getServerSession();

    const ratingScale = query<{
      id: string;
      key: string;
      label_ar: string;
      score: number;
      order_index: number;
      is_active: number;
    }>("SELECT id, key, label_ar, score, order_index, is_active FROM rating_scale ORDER BY order_index");

    const isAdmin = !!session && authorize(session, { roles: ["SUPER_ADMIN"] }).allowed;
    const settings = query<{ key: string; value: string; updated_at: string }>(
      "SELECT key, value, updated_at FROM settings ORDER BY key"
    );

    return NextResponse.json({
      ratingScale,
      settings: isAdmin ? settings : settings.filter((s) => !s.key.startsWith("file.")),
      canEdit: !!isAdmin,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحميل الإعدادات",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings — تعديل إعداد أو مقياس تقدير. مقصور على مدير النظام.
 * الجسم: { key, value }  أو  { ratingId, label_ar, score }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "تعديل الإعدادات مقصور على مدير النظام" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const db = getDb();
    const now = nowISO();

    // تعديل مقياس التقدير
    if (body?.ratingId) {
      const { ratingId, label_ar, score, is_active } = body;

      const existing = queryOne<{ id: string; score: number }>(
        "SELECT id, score FROM rating_scale WHERE id = ?",
        [ratingId]
      );
      if (!existing) {
        return NextResponse.json({ message: "مقياس التقدير غير موجود" }, { status: 404 });
      }

      if (label_ar !== undefined && (typeof label_ar !== "string" || label_ar.trim().length < 2)) {
        return NextResponse.json({ message: "التسمية مطلوبة" }, { status: 400 });
      }
      if (score !== undefined) {
        if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
          return NextResponse.json(
            { message: "الدرجة يجب أن تكون عدداً صحيحاً غير سالب" },
            { status: 400 }
          );
        }
        // منع تكرار الدرجة نفسها في مقياس واحد
        const dup = queryOne<{ id: string }>(
          "SELECT id FROM rating_scale WHERE score = ? AND id != ?",
          [score, ratingId]
        );
        if (dup) {
          return NextResponse.json(
            { message: "توجد درجة أخرى بالقيمة نفسها في المقياس" },
            { status: 409 }
          );
        }
      }

      db.prepare(
        `UPDATE rating_scale SET label_ar = COALESCE(?, label_ar),
                                 score = COALESCE(?, score),
                                 is_active = COALESCE(?, is_active)
         WHERE id = ?`
      ).run(
        label_ar !== undefined ? label_ar.trim() : null,
        score !== undefined ? score : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        ratingId
      );

      auditLog({
        userId: session.userId,
        action: "RATING_SCALE_UPDATED",
        entityType: "rating_scale",
        entityId: ratingId,
        oldValues: { score: existing.score },
        newValues: { label_ar, score, is_active },
        ipAddress: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      });

      return NextResponse.json({ message: "تم تحديث مقياس التقدير" });
    }

    // تعديل إعداد عام
    const { key, value } = body ?? {};
    if (!key || typeof key !== "string") {
      return NextResponse.json({ message: "مفتاح الإعداد مطلوب" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._-]{2,64}$/.test(key)) {
      return NextResponse.json({ message: "مفتاح الإعداد غير صالح" }, { status: 400 });
    }

    const old = queryOne<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);

    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), now);

    auditLog({
      userId: session.userId,
      action: "SETTING_UPDATED",
      entityType: "settings",
      entityId: key,
      oldValues: old ? JSON.parse(old.value) : null,
      newValues: value,
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ message: "تم حفظ الإعداد" });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر حفظ الإعدادات",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings — إضافة مستوى جديد إلى مقياس التقدير.
 * الجسم: { label_ar, score }
 *
 * لا يُسمح بقيمة مكرّرة، ولا يقل المقياس عن مستويين، لأن حساب
 * الدرجة العظمى يعتمد على أعلى قيمة في المقياس.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "تعديل مقياس التقدير مقصور على مدير النظام" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const label_ar = String(body?.label_ar ?? "").trim();
    const score = body?.score;

    if (label_ar.length < 2) {
      return NextResponse.json({ message: "تسمية المستوى مطلوبة" }, { status: 400 });
    }
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
      return NextResponse.json(
        { message: "الدرجة يجب أن تكون عدداً صحيحاً بين 0 و100" },
        { status: 400 }
      );
    }

    const dup = queryOne<{ id: string }>("SELECT id FROM rating_scale WHERE score = ?", [score]);
    if (dup) {
      return NextResponse.json(
        { message: "توجد درجة بالمقياس بالقيمة نفسها" },
        { status: 409 }
      );
    }

    const next = queryOne<{ n: number }>(
      "SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM rating_scale"
    );
    const id = uuid();

    getDb()
      .prepare(
        `INSERT INTO rating_scale (id, key, label_ar, score, order_index, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(id, `LEVEL_${score}`, label_ar, score, next?.n ?? 1);

    auditLog({
      userId: session.userId,
      action: "RATING_SCALE_CREATED",
      entityType: "rating_scale",
      entityId: id,
      newValues: { label_ar, score },
    });

    return NextResponse.json({ message: "تمت إضافة المستوى", id }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "تعذّر إضافة المستوى" }, { status: 500 });
  }
}

/**
 * DELETE /api/settings?ratingId=...  أو  ?key=...
 *
 * حماية:
 * - لا يُحذف مستوى إن كان المقياس سيصير أقل من مستويين.
 * - لا تُحذف إعدادات النظام الحرجة (الاسم، المؤسسة، مقياس التقدير).
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "تعديل الإعدادات مقصور على مدير النظام" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const ratingId = searchParams.get("ratingId");
    const key = searchParams.get("key");
    const db = getDb();

    if (ratingId) {
      const level = queryOne<{ id: string; score: number; label_ar: string }>(
        "SELECT id, score, label_ar FROM rating_scale WHERE id = ?",
        [ratingId]
      );
      if (!level) {
        return NextResponse.json({ message: "المستوى غير موجود" }, { status: 404 });
      }

      const count = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM rating_scale");
      if ((count?.c ?? 0) <= 2) {
        return NextResponse.json(
          { message: "لا يمكن حذف المستوى — يجب أن يبقى مستويان على الأقل" },
          { status: 409 }
        );
      }

      db.prepare("DELETE FROM rating_scale WHERE id = ?").run(ratingId);

      auditLog({
        userId: session.userId,
        action: "RATING_SCALE_DELETED",
        entityType: "rating_scale",
        entityId: ratingId,
        oldValues: { score: level.score, label_ar: level.label_ar },
      });

      return NextResponse.json({ message: "تم حذف المستوى" });
    }

    if (key) {
      const PROTECTED = ["system.name", "system.institution", "ratings.scale"];
      if (PROTECTED.includes(key)) {
        return NextResponse.json(
          { message: "هذا إعداد جوهري لا يُحذف — يمكن تعديل قيمته فقط" },
          { status: 409 }
        );
      }

      const old = queryOne<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
      if (!old) {
        return NextResponse.json({ message: "الإعداد غير موجود" }, { status: 404 });
      }

      db.prepare("DELETE FROM settings WHERE key = ?").run(key);

      auditLog({
        userId: session.userId,
        action: "SETTING_DELETED",
        entityType: "settings",
        entityId: key,
        oldValues: { value: old.value },
      });

      return NextResponse.json({ message: "تم حذف الإعداد" });
    }

    return NextResponse.json(
      { message: "حدّد المستوى أو مفتاح الإعداد المطلوب حذفه" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ message: "تعذّر الحذف" }, { status: 500 });
  }
}
