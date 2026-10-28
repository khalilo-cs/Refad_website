import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { queryOne, getDb, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role_id: string;
  school_id: string | null;
  directorate_id: string | null;
  is_active: number;
  is_locked: number;
  token_version: number;
  role_key: string;
};

function loadUser(id: string) {
  return queryOne<UserRow>(
    `SELECT u.id, u.name, u.email, u.role_id, u.school_id, u.directorate_id,
            u.is_active, u.is_locked, u.token_version, r.key AS role_key
     FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
    [id]
  );
}

/**
 * PATCH /api/users/[id]
 * يعدّل بيانات المستخدم أو يفعّله/يقفله أو يعيد تعيين كلمة مروره.
 * عند تغيير كلمة المرور أو تعطيل الحساب تُبطَل الجلسات القائمة (token_version).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json({ message: "تعديل المستخدمين مقصور على مدير النظام" }, { status: 403 });
    }

    const { id } = await params;
    const target = loadUser(id);
    if (!target) {
      return NextResponse.json({ message: "المستخدم غير موجود" }, { status: 404 });
    }

    const body = await request.json();
    const { name, email, roleKey, schoolId, directorateId, isActive, isLocked, password } =
      body ?? {};

    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    let bumpTokenVersion = false;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return NextResponse.json({ message: "الاسم غير صالح" }, { status: 400 });
      }
      sets.push("name = ?");
      args.push(name.trim());
    }

    if (email !== undefined) {
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ message: "بريد إلكتروني غير صالح" }, { status: 400 });
      }
      const dup = queryOne<{ id: string }>("SELECT id FROM users WHERE email = ? AND id != ?", [
        email.toLowerCase().trim(),
        id,
      ]);
      if (dup) {
        return NextResponse.json({ message: "البريد مستخدم لمستخدم آخر" }, { status: 409 });
      }
      sets.push("email = ?");
      args.push(email.toLowerCase().trim());
    }

    if (roleKey !== undefined) {
      const role = queryOne<{ id: string }>("SELECT id FROM roles WHERE key = ?", [roleKey]);
      if (!role) return NextResponse.json({ message: "الدور غير صالح" }, { status: 400 });

      // منع فقدان آخر مدير نظام في المنصة
      if (target.role_key === "SUPER_ADMIN" && roleKey !== "SUPER_ADMIN") {
        const admins = queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM users u JOIN roles r ON u.role_id = r.id
           WHERE r.key = 'SUPER_ADMIN' AND u.is_active = 1 AND u.id != ?`,
          [id]
        );
        if ((admins?.n ?? 0) === 0) {
          return NextResponse.json(
            { message: "لا يمكن تغيير دور آخر مدير نظام نشط في المنصة" },
            { status: 409 }
          );
        }
      }
      sets.push("role_id = ?");
      args.push(role.id);
      bumpTokenVersion = true;
    }

    if (schoolId !== undefined) {
      sets.push("school_id = ?");
      args.push(schoolId || null);
    }
    if (directorateId !== undefined) {
      sets.push("directorate_id = ?");
      args.push(directorateId || null);
    }

    if (isActive !== undefined) {
      // منع تعطيل آخر مدير نظام نشط أو تعطيل الحساب الذاتي
      if (!isActive && target.role_key === "SUPER_ADMIN") {
        const admins = queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM users u JOIN roles r ON u.role_id = r.id
           WHERE r.key = 'SUPER_ADMIN' AND u.is_active = 1 AND u.id != ?`,
          [id]
        );
        if ((admins?.n ?? 0) === 0) {
          return NextResponse.json(
            { message: "لا يمكن تعطيل آخر مدير نظام نشط" },
            { status: 409 }
          );
        }
      }
      if (!isActive && id === session.userId) {
        return NextResponse.json({ message: "لا يمكنك تعطيل حسابك أنت" }, { status: 409 });
      }
      sets.push("is_active = ?");
      args.push(isActive ? 1 : 0);
      if (!isActive) bumpTokenVersion = true;
    }

    if (isLocked !== undefined) {
      if (isLocked && id === session.userId) {
        return NextResponse.json({ message: "لا يمكنك قفل حسابك أنت" }, { status: 409 });
      }
      sets.push("is_locked = ?");
      args.push(isLocked ? 1 : 0);
      if (isLocked) bumpTokenVersion = true;
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 10) {
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
      const hash = await bcrypt.hash(password, 12);
      sets.push("password_hash = ?");
      args.push(hash);
      bumpTokenVersion = true;
    }

    if (sets.length === 0) {
      return NextResponse.json({ message: "لا توجد حقول للتعديل" }, { status: 400 });
    }

    sets.push("updated_at = ?");
    args.push(nowISO());
    if (bumpTokenVersion) {
      sets.push("token_version = token_version + 1");
    }
    args.push(id);

    getDb()
      .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .run(...args);

    auditLog({
      userId: session.userId,
      action: "USER_UPDATED",
      entityType: "user",
      entityId: id,
      oldValues: {
        name: target.name,
        email: target.email,
        role: target.role_key,
        isActive: target.is_active,
        isLocked: target.is_locked,
      },
      // لا تُسجَّل كلمة المرور في سجل التدقيق إطلاقاً
      newValues: {
        name,
        email,
        roleKey,
        isActive,
        isLocked,
        passwordChanged: password !== undefined,
      },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({
      message: password !== undefined ? "تم تحديث المستخدم وإعادة تعيين كلمة المرور" : "تم تحديث المستخدم",
      sessionsRevoked: bumpTokenVersion,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحديث المستخدم",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
