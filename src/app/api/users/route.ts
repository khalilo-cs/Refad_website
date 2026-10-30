import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, uuid, nowISO , exec } from "@/lib/db/sqlite";
import { generatePassword, normalizeUsername, placeholderEmail } from "@/lib/credentials";
import { normalizePhoneField, wa } from "@/lib/school-input";

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
      where += " AND (u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.phone LIKE ? OR s.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const roleFilter = (searchParams.get("role") ?? "").trim();
    if (roleFilter) { where += " AND r.key = ?"; params.push(roleFilter); }
    const status = searchParams.get("status");
    if (status === "active") where += " AND u.is_active = 1 AND u.is_locked = 0";
    else if (status === "inactive") where += " AND u.is_active = 0";
    else if (status === "locked") where += " AND u.is_locked = 1";
    else if (status === "never") where += " AND u.last_login_at IS NULL";
    else if (status === "mustchange") where += " AND u.must_change_password = 1";
    const dirFilter = (searchParams.get("directorateId") ?? "").trim();
    if (dirFilter) { where += " AND (u.directorate_id = ? OR s.directorate_id = ?)"; params.push(dirFilter, dirFilter); }

    const total = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON u.role_id = r.id LEFT JOIN schools s ON u.school_id = s.id ${where}`, params);

    const users = await query(
      `SELECT u.id, u.name, u.email, u.username, u.phone, u.has_whatsapp, u.job_title, u.must_change_password,
              u.is_active, u.is_locked, u.last_login_at,
              u.created_at, r.key AS role_key, r.name AS role_name, u.school_id, u.directorate_id,
              s.name AS school_name, s.code AS school_code, COALESCE(d.name, sd.name) AS directorate_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN schools s ON u.school_id = s.id
       LEFT JOIN directorates d ON u.directorate_id = d.id
       LEFT JOIN directorates sd ON s.directorate_id = sd.id
       ${where}
       ORDER BY u.created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    const roles = await query(`SELECT key, name FROM roles ORDER BY name`);

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
    const { name, roleKey, schoolId, directorateId } = body ?? {};
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const username = body?.username ? normalizeUsername(body.username) : null;
    if (body?.username && !username) {
      return NextResponse.json({ message: "اسم المستخدم: 3–40 خانة من الحروف اللاتينية الصغيرة والأرقام و . _ - فقط" }, { status: 400 });
    }

    if (!name || typeof name !== "string" || name.trim().length < 3) {
      return NextResponse.json({ message: "الاسم مطلوب (3 أحرف على الأقل)" }, { status: 400 });
    }
    if (!rawEmail && !username) {
      return NextResponse.json({ message: "أدخل بريداً إلكترونياً أو اسم مستخدم للدخول" }, { status: 400 });
    }
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return NextResponse.json({ message: "بريد إلكتروني غير صالح" }, { status: 400 });
    }
    const email = rawEmail || placeholderEmail(username!);

    // كلمة المرور: يدوية بسياسة صارمة، أو تُولَّد تلقائياً إن لم تُرسَل.
    const generated = !body?.password;
    const password: string = generated ? generatePassword() : String(body.password);
    if (password.length < 10) {
      return NextResponse.json({ message: "كلمة المرور يجب أن تكون 10 أحرف على الأقل" }, { status: 400 });
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json({ message: "كلمة المرور يجب أن تحتوي حروفاً وأرقاماً" }, { status: 400 });
    }
    const phone = normalizePhoneField(body?.phone, body?.allowInvalidPhone === true);
    if (phone.error) return NextResponse.json({ message: phone.error, invalidPhone: true }, { status: 400 });
    const jobTitle = typeof body?.jobTitle === "string" && body.jobTitle.trim() ? body.jobTitle.trim().slice(0, 80) : null;
    // الحسابات التي ينشئها المدير تُلزم بتغيير كلمة المرور عند أول دخول ما لم يُطلب غير ذلك.
    const mustChange = body?.mustChangePassword === false ? 0 : 1;

    const role = await queryOne<{ id: string }>("SELECT id FROM roles WHERE key = ?", [roleKey]);
    if (!role) {
      return NextResponse.json({ message: "الدور غير صالح" }, { status: 400 });
    }

    const existing = await queryOne<{ id: string }>("SELECT id FROM users WHERE lower(email) = ?", [email]);
    if (existing) {
      return NextResponse.json({ message: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 409 });
    }
    if (username) {
      const dupU = await queryOne<{ id: string }>("SELECT id FROM users WHERE lower(username) = ?", [username]);
      if (dupU) return NextResponse.json({ message: "اسم المستخدم مستخدم مسبقاً" }, { status: 409 });
    }

    // المدرسة إلزامية لأدوار المدرسة، والمديرية إلزامية للمفتش.
    if (["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(roleKey) && !schoolId) {
      return NextResponse.json({ message: "المدرسة مطلوبة لهذا الدور" }, { status: 400 });
    }
    if (["INSPECTOR", "EDUCATION_DIRECTOR"].includes(roleKey) && !directorateId) {
      return NextResponse.json({ message: "المديرية مطلوبة لهذا الدور" }, { status: 400 });
    }
    if (schoolId && !(await queryOne("SELECT id FROM schools WHERE id = ?", [schoolId]))) {
      return NextResponse.json({ message: "المدرسة غير موجودة" }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    const id = uuid();
    const now = nowISO();

    await exec(`INSERT INTO users (id, name, email, username, phone, has_whatsapp, job_title, password_hash, role_id, school_id, directorate_id,
                            is_active, is_locked, token_version, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?, ?)`, [id,
        name.trim(),
        email,
        username,
        phone.value ?? null,
        wa(body?.hasWhatsapp),
        jobTitle,
        hash,
        role.id,
        schoolId || null,
        directorateId || null,
        mustChange,
        now,
        now]);

    await auditLog({
      userId: session.userId,
      action: "USER_CREATED",
      entityType: "user",
      entityId: id,
      newValues: { email, username, roleKey, generatedPassword: generated },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    // كلمة المرور تُعاد هنا مرة واحدة فقط ليسلّمها المدير للمستخدم؛ لا تُخزَّن نصاً ولا تُسجَّل.
    return NextResponse.json(
      { id, message: "تم إنشاء المستخدم", credentials: { login: username ?? email, password, mustChange: !!mustChange, generated } },
      { status: 201 }
    );
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
