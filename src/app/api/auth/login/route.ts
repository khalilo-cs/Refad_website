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
import { exec, queryOne, uuid } from "@/lib/db/sqlite";
import { decryptSecret, verifyTotp } from "@/lib/totp";

const schema = z.object({
  email: z.string().email("أدخل بريدًا إلكترونيًا صالحًا"),
  password: z.string().min(1, "أدخل كلمة المرور"),
  totp: z.string().optional(),
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

    // المصادقة الثنائية: تُطلب لمن فعّلها بعد نجاح كلمة المرور
    const tf = queryOne<{ two_factor_enabled: number; two_factor_secret: string | null; two_factor_last_step: number | null }>(
      "SELECT two_factor_enabled, two_factor_secret, two_factor_last_step FROM users WHERE id = ?", [user.userId]);
    if (tf?.two_factor_enabled && tf.two_factor_secret) {
      if (!parsed.data.totp) return NextResponse.json({ message: "أدخل رمز المصادقة الثنائية", needTotp: true }, { status: 401 });
      if (!rateLimit(`totp:${user.userId}`, 8, 15 * 60_000).ok) return NextResponse.json({ message: "محاولات كثيرة. حاول لاحقاً." }, { status: 429 });
      const step = verifyTotp(decryptSecret(tf.two_factor_secret), parsed.data.totp);
      // الرمز لا يُستخدم مرتين (منع إعادة الاستخدام)
      if (step === null || (tf.two_factor_last_step != null && step <= tf.two_factor_last_step)) {
        return NextResponse.json({ message: "رمز المصادقة غير صحيح", needTotp: true }, { status: 401 });
      }
      exec("UPDATE users SET two_factor_last_step = ? WHERE id = ?", [step, user.userId]);
    }
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
