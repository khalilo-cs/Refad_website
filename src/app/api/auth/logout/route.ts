import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAuthCookies, auditLog } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const store = await cookies();
  const token = store.get("access_token")?.value;
  try {
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      auditLog({
        userId: payload.userId,
        action: "LOGOUT",
        entityType: "User",
        entityId: payload.userId,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      });
    }
  } catch {
    // يُتجاهل خطأ فك التشفير عند تسجيل الخروج
  }
  await clearAuthCookies();
  return NextResponse.json({ message: "تم تسجيل الخروج بنجاح" });
}
