import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateUser,
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
  auditLog,
} from "@/lib/auth";

const schema = z.object({
  email: z.string().email("أدخل بريدًا إلكترونيًا صالحًا"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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
    const result = await authenticateUser(email, password);
    if (!result.ok) {
      const reasonMap: Record<string, string> = {
        credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        locked: "الحساب مقفل بسبب محاولات تسجيل الدخول الفاشلة المتكررة. راجع المسؤول",
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
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
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
