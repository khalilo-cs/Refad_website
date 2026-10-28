import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getServerSession,
  authorize,
  auditLog,
} from "@/lib/auth";
import { query, queryOne, exec, uuid, nowISO, getDb } from "@/lib/db/sqlite";

export const runtime = "nodejs";

const schoolSchema = z.object({
  code: z.string().min(2).max(30).optional(),
  name: z.string().min(3).optional(),
  governorateId: z.string().uuid().optional(),
  directorateId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional().nullable(),
  address: z.string().optional().nullable(),
  latitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional().nullable()),
  longitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional().nullable()),
  type: z.string().optional(),
  stage: z.string().optional(),
  contactPhone: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  principalName: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

function canAccessSchool(session: { roleKey: string; schoolId: string | null; directorateId: string | null }, schoolId: string): boolean {
  if (session.roleKey === "SUPER_ADMIN") return true;
  if (session.roleKey === "EDUCATION_DIRECTOR") {
    // يتحقق من انتماء المدرسة لمديريته
    const row = queryOne<{ directorate_id: string }>("SELECT directorate_id FROM schools WHERE id = ?", [schoolId]);
    return !!row && row.directorate_id === session.directorateId;
  }
  if (session.roleKey === "SCHOOL_PRINCIPAL") return session.schoolId === schoolId;
  if (session.roleKey === "INSPECTOR" && session.directorateId) {
    const row = queryOne<{ directorate_id: string }>("SELECT directorate_id FROM schools WHERE id = ?", [schoolId]);
    return !!row && row.directorate_id === session.directorateId;
  }
  return false;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { id } = await params;
  if (!canAccessSchool(session, id)) {
    return NextResponse.json({ message: "لا يمكنك الوصول إلى هذه المدرسة" }, { status: 403 });
  }

  const school = queryOne<any>(
    `SELECT s.*, g.name AS governorate_name, d.name AS directorate_name, a.name AS area_name,
            u.name AS principal_user_name
     FROM schools s
     JOIN governorates g ON g.id = s.governorate_id
     JOIN directorates d ON d.id = s.directorate_id
     LEFT JOIN areas a ON a.id = s.area_id
     LEFT JOIN users u ON u.id = s.principal_user_id
     WHERE s.id = ?`,
    [id]
  );
  if (!school) return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 404 });

  const stats = {
    visits: queryOne<{ n: number }>("SELECT COUNT(*) n FROM visits WHERE school_id = ?", [id]),
    evaluations: queryOne<{ n: number }>("SELECT COUNT(*) n FROM evaluations e JOIN visits v ON v.id = e.visit_id WHERE v.school_id = ?", [id]),
    evidence: queryOne<{ n: number }>("SELECT COUNT(*) n FROM evidence WHERE school_id = ?", [id]),
    plans: queryOne<{ n: number }>("SELECT COUNT(*) n FROM improvement_plans WHERE school_id = ?", [id]),
  };

  return NextResponse.json({ school, stats });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { id } = await params;
  if (!canAccessSchool(session, id)) {
    return NextResponse.json({ message: "لا يمكنك تعديل هذه المدرسة" }, { status: 403 });
  }

  const old = queryOne("SELECT * FROM schools WHERE id = ?", [id]);
  if (!old) return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "بيانات غير صالحة" }, { status: 400 }); }
  const parsed = schoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات غير صحيحة", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const setField = (col: string, val: unknown) => { if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); } };
  setField("code", parsed.data.code);
  setField("name", parsed.data.name);
  setField("governorate_id", parsed.data.governorateId);
  setField("directorate_id", parsed.data.directorateId);
  setField("area_id", parsed.data.areaId);
  setField("address", parsed.data.address);
  setField("latitude", parsed.data.latitude);
  setField("longitude", parsed.data.longitude);
  setField("type", parsed.data.type);
  setField("stage", parsed.data.stage);
  setField("contact_phone", parsed.data.contactPhone);
  setField("contact_email", parsed.data.contactEmail);
  setField("principal_name", parsed.data.principalName);
  setField("status", parsed.data.status);
  if (fields.length === 0) return NextResponse.json({ message: "لا يوجد تعديل" }, { status: 400 });

  fields.push("last_updated_at = ?");
  values.push(nowISO());
  values.push(id);

  const db = getDb();
  db.prepare(`UPDATE schools SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  auditLog({
    userId: session.userId,
    action: "UPDATE",
    entityType: "School",
    entityId: id,
    oldValues: old,
    newValues: parsed.data,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ message: "تم تحديث بيانات المدرسة" });
}

/**
 * DELETE /api/schools/[id]
 * أرشفة المدرسة (حذف منطقي) بدل الحذف النهائي — يحفظ التاريخ والتقييمات.
 * الحذف النهائي متاح لمدير النظام فقط، وفقط لمدرسة بلا زيارات.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    const { id } = await params;
    const isAdmin = authorize(session, { roles: ["SUPER_ADMIN"] }).allowed;
    const isDirector = authorize(session, { roles: ["EDUCATION_DIRECTOR"] }).allowed;

    if (!isAdmin && !isDirector) {
      return NextResponse.json({ message: "حذف المدارس مقصور على المدير" }, { status: 403 });
    }
    if (!canAccessSchool(session, id) && !isAdmin) {
      return NextResponse.json({ message: "المدرسة خارج نطاق صلاحيتك" }, { status: 403 });
    }

    const school = queryOne<{ id: string; name: string; status: string }>(
      "SELECT id, name, status FROM schools WHERE id = ?",
      [id]
    );
    if (!school) {
      return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const hard = searchParams.get("hard") === "true";

    if (hard) {
      if (!isAdmin) {
        return NextResponse.json(
          { message: "الحذف النهائي مقصور على مدير النظام" },
          { status: 403 }
        );
      }
      const visits = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM visits WHERE school_id = ?",
        [id]
      );
      if ((visits?.n ?? 0) > 0) {
        return NextResponse.json(
          {
            message: `لا يمكن الحذف النهائي: للمدرسة ${visits?.n} زيارة مسجلة. استخدم الأرشفة بدلاً منها.`,
          },
          { status: 409 }
        );
      }
      getDb().prepare("DELETE FROM schools WHERE id = ?").run(id);
      auditLog({
        userId: session.userId,
        action: "SCHOOL_DELETED_PERMANENTLY",
        entityType: "School",
        entityId: id,
        oldValues: school,
        ipAddress: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      });
      return NextResponse.json({ message: "تم حذف المدرسة نهائياً" });
    }

    getDb()
      .prepare("UPDATE schools SET status = 'ARCHIVED', last_updated_at = ? WHERE id = ?")
      .run(nowISO(), id);

    auditLog({
      userId: session.userId,
      action: "SCHOOL_ARCHIVED",
      entityType: "School",
      entityId: id,
      oldValues: school,
      newValues: { status: "ARCHIVED" },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ message: "تمت أرشفة المدرسة مع حفظ بياناتها" });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر حذف المدرسة",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
