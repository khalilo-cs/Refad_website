import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshSession, clearAuthCookies } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get("refresh_token")?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: "لم يتم العثور على رمز الجلسة" }, { status: 401 });
  }

  const renewed = await refreshSession(refreshToken);
  if (!renewed) {
    await clearAuthCookies();
    return NextResponse.json({ message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى" }, { status: 401 });
  }

  return NextResponse.json({ message: "تم تجديد الجلسة", user: renewed.user });
}
