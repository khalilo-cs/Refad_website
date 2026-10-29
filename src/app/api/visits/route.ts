import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog, authorize } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";
import { schoolScope, canAccessSchool } from "@/lib/scope";
import { notify, schoolUsers } from "@/lib/notify";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const VISIT_TYPES = ["PERIODIC", "FOLLOW_UP", "EXPLORATORY", "EMERGENCY"] as const;
export const VISIT_STATUSES = ["SCHEDULED", "IN_PROGRESS", "SUBMITTED", "COMPLETED", "POSTPONED", "CANCELLED"] as const;

/**
 * GET /api/visits — قائمة الزيارات بنطاق الدور مع تصفية بالمدرسة والحالة والنوع والمفتش والفترة.
 * الزيارة «متأخرة» إذا كانت مجدولة وفات موعدها دون بدء.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    const sp = new URL(request.url).searchParams;
    const limit = Math.min(Number(sp.get("limit") ?? 20) || 20, 200);
    const page = Math.max(Number(sp.get("page") ?? 1) || 1, 1);
    const offset = (page - 1) * limit;

    const scope = schoolScope(session, "s");
    const where: string[] = [scope.sql];
    const params: unknown[] = [...scope.params];
    // المفتش يرى زياراته هو فقط داخل مدارسه
    if (session.roleKey === "INSPECTOR") {
      where.push("v.inspector_id = ?");
      params.push(session.userId);
    }

    const schoolId = sp.get("schoolId");
    const status = sp.get("status");
    const type = sp.get("type");
    const inspectorId = sp.get("inspectorId");
    const directorateId = sp.get("directorateId");
    const from = sp.get("from");
    const to = sp.get("to");
    if (schoolId) { where.push("v.school_id = ?"); params.push(schoolId); }
    if (directorateId) { where.push("s.directorate_id = ?"); params.push(directorateId); }
    if (inspectorId) { where.push("v.inspector_id = ?"); params.push(inspectorId); }
    if (type && (VISIT_TYPES as readonly string[]).includes(type)) { where.push("v.type = ?"); params.push(type); }
    if (status === "OVERDUE") {
      where.push("v.status = 'SCHEDULED' AND v.scheduled_at IS NOT NULL AND datetime(v.scheduled_at) < datetime('now', '-1 day')");
    } else if (status && (VISIT_STATUSES as readonly string[]).includes(status)) {
      where.push("v.status = ?");
      params.push(status);
    }
    if (from) { where.push("date(COALESCE(v.started_at, v.scheduled_at, v.created_at)) >= date(?)"); params.push(from); }
    if (to) { where.push("date(COALESCE(v.started_at, v.scheduled_at, v.created_at)) <= date(?)"); params.push(to); }
    const whereSql = where.join(" AND ");

    const total = queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM visits v JOIN schools s ON v.school_id = s.id WHERE ${whereSql}`,
      params
    );

    const visits = query(
      `SELECT v.id, v.school_id, v.inspector_id, v.type, v.purpose, v.status, v.completion,
              v.scheduled_at, v.started_at, v.ended_at, v.submitted_at,
              COALESCE(v.started_at, v.scheduled_at, v.created_at) AS visit_date,
              CASE WHEN v.status = 'SCHEDULED' AND v.scheduled_at IS NOT NULL
                        AND datetime(v.scheduled_at) < datetime('now', '-1 day') THEN 1 ELSE 0 END AS is_overdue,
              s.name AS school_name, s.code AS code, d.name AS directorate_name, u.name AS inspector_name
       FROM visits v
       JOIN schools s ON v.school_id = s.id
       JOIN directorates d ON d.id = s.directorate_id
       JOIN users u ON v.inspector_id = u.id
       WHERE ${whereSql}
       ORDER BY COALESCE(v.started_at, v.scheduled_at, v.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
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
      { message: "تعذّر تحميل الزيارات", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined },
      { status: 500 }
    );
  }
}

/** POST /api/visits — جدولة زيارة جديدة. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    const canCreate =
      ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey) ||
      authorize(session, { permission: "createVisits" }).allowed;
    if (!canCreate) {
      return NextResponse.json({ message: "إنشاء الزيارات مقصور على المفتشين ومديري التعليم" }, { status: 403 });
    }

    const body = await request.json();
    const { schoolId, type, purpose, scheduledAt } = body ?? {};

    if (!schoolId || typeof schoolId !== "string") {
      return NextResponse.json({ message: "المدرسة مطلوبة" }, { status: 400 });
    }
    if (type && !(VISIT_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ message: "نوع الزيارة غير صالح" }, { status: 400 });
    }
    if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) {
      return NextResponse.json({ message: "موعد الزيارة غير صالح" }, { status: 400 });
    }

    const school = queryOne<{ id: string; name: string }>("SELECT id, name FROM schools WHERE id = ?", [schoolId]);
    if (!school) return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 404 });
    if (!canAccessSchool(session, schoolId)) {
      return NextResponse.json({ message: "المدرسة خارج نطاق صلاحيتك" }, { status: 403 });
    }

    const inspectorId = session.roleKey === "INSPECTOR" ? session.userId : (body?.inspectorId ?? session.userId);
    const inspector = queryOne<{ id: string; role_key: string }>(
      `SELECT u.id, r.key AS role_key FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ? AND u.is_active = 1`,
      [inspectorId]
    );
    if (!inspector || !["INSPECTOR", "SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(inspector.role_key)) {
      return NextResponse.json({ message: "المفتش المعيَّن غير موجود أو ليس مفتشاً" }, { status: 400 });
    }

    const id = uuid();
    const now = nowISO();
    getDb()
      .prepare(
        `INSERT INTO visits (id, school_id, inspector_id, type, purpose, scheduled_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`
      )
      .run(
        id, schoolId, inspector.id, type ?? "PERIODIC",
        typeof purpose === "string" && purpose.trim() ? purpose.trim().slice(0, 500) : null,
        typeof scheduledAt === "string" && scheduledAt ? scheduledAt : null,
        now, now
      );

    notify([inspector.id], "زيارة ميدانية جديدة", `جُدولت زيارة إلى ${school.name}`, { link: `/visits`, type: "INFO" });
    notify(schoolUsers(schoolId, ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"]), "زيارة مجدولة لمدرستكم",
      `ستُجرى زيارة ميدانية${scheduledAt ? " بتاريخ " + String(scheduledAt).slice(0, 10) : ""}`, { link: `/visits`, type: "INFO" });

    auditLog({
      userId: session.userId, action: "VISIT_CREATED", entityType: "visit", entityId: id,
      newValues: { schoolId, inspectorId: inspector.id, type }, ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ id, message: "تم إنشاء الزيارة" }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: "تعذّر إنشاء الزيارة", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined },
      { status: 500 }
    );
  }
}
