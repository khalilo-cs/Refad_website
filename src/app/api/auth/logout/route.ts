import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAuthCookies, auditLog, verifyAccessToken, verifyRefreshToken } from "@/lib/auth";
import { exec } from "@/lib/db/sqlite";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const store = await cookies();
  const access = store.get("access_token")?.value;
  const refresh = store.get("refresh_token")?.value;
  // هوية موثّقة بالتوقيع فقط؛ إبطال كل الرموز حتى لا يصلح رمز مسروق بعد الخروج.
  const userId = (access && verifyAccessToken(access)?.userId) || (refresh && verifyRefreshToken(refresh)?.userId) || null;
  if (userId) {
    try {
      await exec("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
      await auditLog({
        userId,
        action: "LOGOUT",
        entityType: "User",
        entityId: userId,
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? null,
      });
    } catch {
      // الخروج يكتمل بمسح الملفات حتى لو تعذّر التسجيل
    }
  }
  await clearAuthCookies();
  return NextResponse.json({ message: "تم تسجيل الخروج بنجاح" });
}
