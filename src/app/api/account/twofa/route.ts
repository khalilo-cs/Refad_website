import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog, verifyPassword } from "@/lib/auth";
import { exec, queryOne } from "@/lib/db/sqlite";
import { clientIp, rateLimit } from "@/lib/security";
import { decryptSecret, encryptSecret, generateSecret, otpauthUri, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/**
 * POST { action: "setup" } → سرّ جديد غير مفعَّل (يُخزَّن مشفَّراً) ورابط otpauth.
 * POST { action: "enable", code } → يتحقق من رمز التطبيق ويفعّل.
 * POST { action: "disable", password, code } → يعطّل بعد التحقق من كلمة المرور والرمز.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!rateLimit(`2fa:${session.userId}`, 10, 15 * 60_000).ok) return bad("محاولات كثيرة. حاول لاحقاً.", 429);
  const b: any = await request.json().catch(() => ({}));
  const u = queryOne<any>("SELECT two_factor_enabled, two_factor_secret, password_hash FROM users WHERE id = ?", [session.userId]);
  const ip = clientIp(request);

  if (b.action === "setup") {
    if (u.two_factor_enabled) return bad("المصادقة الثنائية مفعَّلة بالفعل", 409);
    const secret = generateSecret();
    exec("UPDATE users SET two_factor_secret = ? WHERE id = ?", [encryptSecret(secret), session.userId]);
    return NextResponse.json({ secret, uri: otpauthUri(secret, session.email) });
  }
  if (b.action === "enable") {
    if (!u.two_factor_secret) return bad("ابدأ الإعداد أولاً");
    const step = verifyTotp(decryptSecret(u.two_factor_secret), String(b.code ?? ""));
    if (step === null) return bad("الرمز غير صحيح", 400);
    exec("UPDATE users SET two_factor_enabled = 1, two_factor_last_step = ? WHERE id = ?", [step, session.userId]);
    auditLog({ userId: session.userId, action: "TWO_FACTOR_ENABLED", entityType: "User", entityId: session.userId, ipAddress: ip });
    return NextResponse.json({ message: "فُعِّلت المصادقة الثنائية" });
  }
  if (b.action === "disable") {
    if (!u.two_factor_enabled) return bad("المصادقة الثنائية غير مفعَّلة", 409);
    if (!(await verifyPassword(String(b.password ?? ""), u.password_hash))) return bad("كلمة المرور غير صحيحة", 403);
    if (verifyTotp(decryptSecret(u.two_factor_secret), String(b.code ?? "")) === null) return bad("الرمز غير صحيح", 403);
    exec("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_last_step = NULL WHERE id = ?", [session.userId]);
    auditLog({ userId: session.userId, action: "TWO_FACTOR_DISABLED", entityType: "User", entityId: session.userId, ipAddress: ip });
    return NextResponse.json({ message: "عُطِّلت المصادقة الثنائية" });
  }
  return bad("إجراء غير معروف");
}
