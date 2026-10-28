import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** أنواع البيانات المرجعية القابلة للإدارة. */
export const REFERENCE_TYPES = ["governorate", "directorate", "area"] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

type Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;

/** الإدارة الكاملة للبيانات المرجعية مقصورة على مدير النظام. */
function requireAdmin(session: Session | null): boolean {
  return !!session && authorize(session, { roles: ["SUPER_ADMIN"] }).allowed;
}

/**
 * GET /api/admin/reference
 * يعيد المحافظات والمديريات والمناطق مع أعداد المدارس المرتبطة بكل منها،
 * حتى يعرف المدير أثر الحذف قبل تنفيذه.
 */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { message: "إدارة البيانات المرجعية مقصورة على مدير النظام" },
        { status: 403 }
      );
    }

    const governorates = query<{ id: string; name: string; code: string; usage: number }>(
      `SELECT g.id, g.name, g.code,
              (SELECT COUNT(*) FROM schools s WHERE s.governorate_id = g.id) AS usage
       FROM governorates g ORDER BY g.name`
    );

    const directorates = query<{
      id: string;
      name: string;
      code: string;
      governorate_id: string;
      governorate_name: string;
      usage: number;
    }>(
      `SELECT d.id, d.name, d.code, d.governorate_id, g.name AS governorate_name,
              (SELECT COUNT(*) FROM schools s WHERE s.directorate_id = d.id) AS usage
       FROM directorates d
       JOIN governorates g ON d.governorate_id = g.id
       ORDER BY g.name, d.name`
    );

    const areas = query<{
      id: string;
      name: string;
      directorate_id: string;
      directorate_name: string;
      usage: number;
    }>(
      `SELECT a.id, a.name, a.directorate_id, d.name AS directorate_name,
              (SELECT COUNT(*) FROM schools s WHERE s.area_id = a.id) AS usage
       FROM areas a
       JOIN directorates d ON a.directorate_id = d.id
       ORDER BY d.name, a.name`
    );

    return NextResponse.json({ governorates, directorates, areas });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحميل البيانات المرجعية",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/reference
 * ينشئ محافظة أو مديرية أو منطقة.
 * الجسم: { type, name, code?, governorateId?, directorateId? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { message: "الإضافة مقصورة على مدير النظام" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type, name, code, governorateId, directorateId } = body ?? {};

    if (!REFERENCE_TYPES.includes(type)) {
      return NextResponse.json({ message: "نوع البيانات غير صالح" }, { status: 400 });
    }
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ message: "الاسم مطلوب (حرفان على الأقل)" }, { status: 400 });
    }

    const db = getDb();
    const id = uuid();
    const now = nowISO();
    const cleanName = name.trim();

    if (type === "governorate") {
      const cleanCode = (typeof code === "string" && code.trim()) || cleanName.slice(0, 3);
      const dup = queryOne<{ id: string }>(
        "SELECT id FROM governorates WHERE name = ? OR code = ?",
        [cleanName, cleanCode]
      );
      if (dup) {
        return NextResponse.json(
          { message: "توجد محافظة بالاسم أو الرمز نفسه" },
          { status: 409 }
        );
      }
      db.prepare("INSERT INTO governorates (id, name, code, created_at) VALUES (?, ?, ?, ?)").run(
        id,
        cleanName,
        cleanCode,
        now
      );
      auditLog({
        userId: session.userId,
        action: "GOVERNORATE_CREATED",
        entityType: "governorate",
        entityId: id,
        newValues: { name: cleanName, code: cleanCode },
      });
      return NextResponse.json({ id, message: "تمت إضافة المحافظة" }, { status: 201 });
    }

    if (type === "directorate") {
      if (!governorateId) {
        return NextResponse.json({ message: "المحافظة مطلوبة" }, { status: 400 });
      }
      const gov = queryOne<{ id: string }>("SELECT id FROM governorates WHERE id = ?", [
        governorateId,
      ]);
      if (!gov) {
        return NextResponse.json({ message: "المحافظة غير موجودة" }, { status: 404 });
      }
      const cleanCode = (typeof code === "string" && code.trim()) || cleanName.slice(0, 4);
      const dup = queryOne<{ id: string }>(
        "SELECT id FROM directorates WHERE name = ? AND governorate_id = ?",
        [cleanName, governorateId]
      );
      if (dup) {
        return NextResponse.json(
          { message: "توجد مديرية بالاسم نفسه في هذه المحافظة" },
          { status: 409 }
        );
      }
      db.prepare(
        "INSERT INTO directorates (id, name, code, governorate_id, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, cleanName, cleanCode, governorateId, now);
      auditLog({
        userId: session.userId,
        action: "DIRECTORATE_CREATED",
        entityType: "directorate",
        entityId: id,
        newValues: { name: cleanName, governorateId },
      });
      return NextResponse.json({ id, message: "تمت إضافة المديرية" }, { status: 201 });
    }

    // area
    if (!directorateId) {
      return NextResponse.json({ message: "المديرية مطلوبة" }, { status: 400 });
    }
    const dir = queryOne<{ id: string }>("SELECT id FROM directorates WHERE id = ?", [
      directorateId,
    ]);
    if (!dir) {
      return NextResponse.json({ message: "المديرية غير موجودة" }, { status: 404 });
    }
    const dupArea = queryOne<{ id: string }>(
      "SELECT id FROM areas WHERE name = ? AND directorate_id = ?",
      [cleanName, directorateId]
    );
    if (dupArea) {
      return NextResponse.json(
        { message: "توجد منطقة بالاسم نفسه في هذه المديرية" },
        { status: 409 }
      );
    }
    db.prepare("INSERT INTO areas (id, name, directorate_id, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      cleanName,
      directorateId,
      now
    );
    auditLog({
      userId: session.userId,
      action: "AREA_CREATED",
      entityType: "area",
      entityId: id,
      newValues: { name: cleanName, directorateId },
    });
    return NextResponse.json({ id, message: "تمت إضافة المنطقة" }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّرت الإضافة",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
