import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog, authorize } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["PERIODIC", "FOLLOW_UP", "EXPLORATORY", "EMERGENCY"] as const;
const VALID_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/** يبني شرط النطاق حسب دور المستخدم. */
function scopeClause(
  session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>
): { sql: string; params: string[] } {
  switch (session.roleKey) {
    case "SUPER_ADMIN":
    case "EDUCATION_DIRECTOR":
      return { sql: "AND 1 = 1", params: [] };
    case "INSPECTOR":
      return { sql: "AND v.inspector_id = ?", params: [session.userId] };
    case "SCHOOL_PRINCIPAL":
    case "QUALITY_COORDINATOR":
      return { sql: "AND v.school_id = ?", params: [session.schoolId ?? ""] };
    default:
      return { sql: "AND 1 = 0", params: [] };
  }
}

/**
 * GET /api/visits — قائمة الزيارات بنطاق الدور.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 100);
    const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1);
    const offset = (page - 1) * limit;
    const schoolId = searchParams.get("schoolId");
    const status = searchParams.get("status");

    const scope = scopeClause(session);
    let where = `WHERE 1 = 1 ${scope.sql}`;
    const params: string[] = [...scope.params];

    if (schoolId) {
      where += " AND v.school_id = ?";
      params.push(schoolId);
    }
    if (status && VALID_STATUSES.includes(status as any)) {
      where += " AND v.status = ?";
      params.push(status);
    }

    const total = queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM visits v ${where}`,
      params
    );

    const visits = query(
      `SELECT v.id, v.school_id, v.inspector_id, v.type, v.status, v.completion,
              COALESCE(v.started_at, v.scheduled_at, v.created_at) AS visit_date,
              s.name AS school_name, s.code AS code, u.name AS inspector_name
       FROM visits v
       JOIN schools s ON v.school_id = s.id
       JOIN users u ON v.inspector_id = u.id
       ${where}
       ORDER BY COALESCE(v.started_at, v.scheduled_at, v.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    return NextResponse.json({
      visits,
      total: total?.n ?? 0,
      page,
      limit,
      totalPages: Math.ceil((total?.n ?? 0) / limit),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحميل الزيارات",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/visits — إنشاء زيارة جديدة. يقصرها على المفتش المسؤول والمدير.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    }

    const canCreate =
      ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey) ||
      authorize(session, { permission: "createVisits" }).allowed;
    if (!canCreate) {
      return NextResponse.json(
        { message: "إنشاء الزيارات مقصور على المفتشين ومديري التعليم" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { schoolId, type, purpose, scheduledAt } = body ?? {};

    if (!schoolId || typeof schoolId !== "string") {
      return NextResponse.json({ message: "المدرسة مطلوبة" }, { status: 400 });
    }
    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ message: "نوع الزيارة غير صالح" }, { status: 400 });
    }

    const school = queryOne<{ id: string; directorate_id: string }>(
      "SELECT id, directorate_id FROM schools WHERE id = ?",
      [schoolId]
    );
    if (!school) {
      return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 404 });
    }

    // المفتش لا ينشئ زيارة خارج مديريته.
    if (session.roleKey === "INSPECTOR" && session.directorateId) {
      if (school.directorate_id !== session.directorateId) {
        return NextResponse.json(
          { message: "لا يمكن إنشاء زيارة لمدرسة خارج مديريتك" },
          { status: 403 }
        );
      }
    }

    // المفتش هو المسؤول افتراضياً؛ المدير يمكنه تعيين مفتش آخر.
    const inspectorId =
      session.roleKey === "INSPECTOR" ? session.userId : (body?.inspectorId ?? session.userId);

    const inspector = queryOne<{ id: string; role_key: string }>(
      `SELECT u.id, r.key AS role_key FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [inspectorId]
    );
    if (!inspector || inspector.role_key !== "INSPECTOR") {
      return NextResponse.json(
        { message: "المفتش المعيَّن غير موجود أو ليس مفتشاً" },
        { status: 400 }
      );
    }

    const id = uuid();
    const now = nowISO();
    getDb()
      .prepare(
        `INSERT INTO visits (id, school_id, inspector_id, type, purpose, scheduled_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`
      )
      .run(
        id,
        schoolId,
        inspectorId,
        type ?? "PERIODIC",
        typeof purpose === "string" ? purpose.trim() : null,
        typeof scheduledAt === "string" && scheduledAt ? scheduledAt : null,
        now,
        now
      );

    auditLog({
      userId: session.userId,
      action: "VISIT_CREATED",
      entityType: "visit",
      entityId: id,
      newValues: { schoolId, inspectorId, type },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ id, message: "تم إنشاء الزيارة" }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر إنشاء الزيارة",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
