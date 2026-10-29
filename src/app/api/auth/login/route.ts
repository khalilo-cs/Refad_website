import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateUser,
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
  auditLog,
} from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/security";
import { exec, uuid } from "@/lib/db/sqlite";

const schema = z.object({
  email: z.string().email("أدخل بريدًا إلكترونيًا صالحًا"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const ipLimit = rateLimit(`login:ip:${ip}`, 30, 15 * 60_000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { message: `محاولات كثيرة. أعد المحاولة بعد ${Math.ceil(ipLimit.retryAfterSec / 60)} دقيقة` },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "بيانات تسجيل الدخول غير صحيحة",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const emailLimit = rateLimit(`login:email:${email.toLowerCase()}`, 10, 15 * 60_000);
    if (!emailLimit.ok) {
      return NextResponse.json(
        { message: `محاولات كثيرة لهذا الحساب. أعد المحاولة بعد ${Math.ceil(emailLimit.retryAfterSec / 60)} دقيقة` },
        { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSec) } }
      );
    }
    const result = await authenticateUser(email, password);
    exec("INSERT INTO login_attempts (id, email, ip, success) VALUES (?,?,?,?)", [
      uuid(),
      email.toLowerCase(),
      ip,
      result.ok ? 1 : 0,
    ]);
    if (!result.ok) {
      if (result.reason === "throttled") {
        return NextResponse.json(
          { message: `الحساب مقفل مؤقتاً بسبب محاولات فاشلة. أعد المحاولة بعد ${result.retryAfterMin ?? 15} دقيقة` },
          { status: 429 }
        );
      }
      const reasonMap: Record<string, string> = {
        credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        locked: "الحساب موقوف من قِبل المسؤول. راجع إدارة المنصة",
        inactive: "الحساب غير فعال. راجع المسؤول",
      };
      return NextResponse.json({ message: reasonMap[result.reason] }, { status: 401 });
    }

    const user = result.user;
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user.userId, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);

    auditLog({
      userId: user.userId,
      action: "LOGIN",
      entityType: "User",
      entityId: user.userId,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({
      message: "تم تسجيل الدخول بنجاح",
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        roleKey: user.roleKey,
        schoolId: user.schoolId,
        directorateId: user.directorateId,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "حدث خطأ أثناء تسجيل الدخول", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined },
      { status: 500 }
    );
  }
}
