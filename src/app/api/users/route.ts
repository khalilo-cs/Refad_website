import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/users — قائمة المستخدمين. مقصورة على مدير النظام.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "إدارة المستخدمين مقصورة على مدير النظام" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
    const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1);
    const offset = (page - 1) * limit;
    const search = (searchParams.get("search") ?? "").trim();

    let where = "WHERE 1 = 1";
    const params: string[] = [];
    if (search) {
      where += " AND (u.name LIKE ? OR u.email LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const total = queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM users u ${where}`, params);

    const users = query(
      `SELECT u.id, u.name, u.email, u.is_active, u.is_locked, u.last_login_at,
              u.created_at, r.key AS role_key, r.name AS role_name,
              s.name AS school_name, d.name AS directorate_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN directorates d ON u.directorate_id = d.id
       ${where}
       ORDER BY u.created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    const roles = query(`SELECT key, name FROM roles ORDER BY name`);

    return NextResponse.json({ users, roles, total: total?.n ?? 0, page, limit });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحميل المستخدمين",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users — إنشاء مستخدم. مقصور على مدير النظام.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json({ message: "غير مصرّح بإنشاء المستخدمين" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, roleKey, schoolId, directorateId } = body ?? {};

    if (!name || typeof name !== "string" || name.trim().length < 3) {
      return NextResponse.json({ message: "الاسم مطلوب (3 أحرف على الأقل)" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "بريد إلكتروني غير صالح" }, { status: 400 });
    }
    // سياسة كلمة المرور: لا كلمات ضعيفة.
    if (!password || typeof password !== "string" || password.length < 10) {
      return NextResponse.json(
        { message: "كلمة المرور يجب أن تكون 10 أحرف على الأقل" },
        { status: 400 }
      );
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { message: "كلمة المرور يجب أن تحتوي حروفاً وأرقاماً" },
        { status: 400 }
      );
    }

    const role = queryOne<{ id: string }>("SELECT id FROM roles WHERE key = ?", [roleKey]);
    if (!role) {
      return NextResponse.json({ message: "الدور غير صالح" }, { status: 400 });
    }

    const existing = queryOne<{ id: string }>("SELECT id FROM users WHERE email = ?", [
      email.toLowerCase().trim(),
    ]);
    if (existing) {
      return NextResponse.json({ message: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 409 });
    }

    // المدرسة إلزامية لأدوار المدرسة، والمديرية إلزامية للمفتش.
    if (["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(roleKey) && !schoolId) {
      return NextResponse.json({ message: "المدرسة مطلوبة لهذا الدور" }, { status: 400 });
    }
    if (roleKey === "INSPECTOR" && !directorateId) {
      return NextResponse.json({ message: "المديرية مطلوبة للمفتش" }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    const id = uuid();
    const now = nowISO();

    getDb()
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, role_id, school_id, directorate_id,
                            is_active, is_locked, token_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`
      )
      .run(
        id,
        name.trim(),
        email.toLowerCase().trim(),
        hash,
        role.id,
        schoolId || null,
        directorateId || null,
        now,
        now
      );

    auditLog({
      userId: session.userId,
      action: "USER_CREATED",
      entityType: "user",
      entityId: id,
      newValues: { email, roleKey },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ id, message: "تم إنشاء المستخدم" }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر إنشاء المستخدم",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
