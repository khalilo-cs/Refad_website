import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog, hashPassword, validatePassword, verifyPassword, signAccessToken, signRefreshToken, setAuthCookies } from "@/lib/auth";
import { exec, query, queryOne } from "@/lib/db/sqlite";
import { clientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET — بيانات حسابي، حالة المصادقة الثنائية، وآخر عمليات الدخول. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const u = await queryOne<any>("SELECT id, name, email, phone, two_factor_enabled, last_login_at, password_changed_at, created_at FROM users WHERE id = ?", [session.userId]);
  const logins = await query<any>("SELECT ip, success, created_at FROM login_attempts WHERE email = ? ORDER BY created_at DESC LIMIT 10", [session.email.toLowerCase()]);
  return NextResponse.json({ profile: { ...u, two_factor_enabled: !!u.two_factor_enabled }, logins, role: session.role, roleKey: session.roleKey });
}

/** PATCH — تعديل الاسم والهاتف. */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const b: any = await request.json().catch(() => ({}));
  const name = String(b?.name ?? "").trim();
  if (name.length < 3 || name.length > 120) return bad("الاسم من 3 إلى 120 حرفاً");
  const phone = String(b?.phone ?? "").trim().slice(0, 30) || null;
  if (phone && !/^[0-9+\-\s()]{6,30}$/.test(phone)) return bad("رقم الهاتف غير صالح");
  await exec("UPDATE users SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?", [name, phone, session.userId]);
  await auditLog({ userId: session.userId, action: "PROFILE_UPDATED", entityType: "User", entityId: session.userId, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حفظ بياناتك" });
}

/** POST — تغيير كلمة المرور: { currentPassword, newPassword }. يُبطل بقية الجلسات ويُبقي الجلسة الحالية. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!rateLimit(`pw:${session.userId}`, 8, 15 * 60_000).ok) return bad("محاولات كثيرة. حاول لاحقاً.", 429);
  const b: any = await request.json().catch(() => ({}));
  const cur = String(b?.currentPassword ?? "");
  const next = String(b?.newPassword ?? "");
  const row = await queryOne<{ password_hash: string; token_version: number }>("SELECT password_hash, token_version FROM users WHERE id = ?", [session.userId]);
  if (!row || !(await verifyPassword(cur, row.password_hash))) return bad("كلمة المرور الحالية غير صحيحة", 403);
  const v = validatePassword(next);
  if (!v.ok) return bad(v.message ?? "كلمة مرور ضعيفة");
  if (next === cur) return bad("اختر كلمة مرور مختلفة عن الحالية");
  const hash = await hashPassword(next);
  await exec("UPDATE users SET password_hash = ?, token_version = token_version + 1, password_changed_at = datetime('now'), must_change_password = 0 WHERE id = ?", [hash, session.userId]);
  // نُصدر رمزاً جديداً لهذه الجلسة بعد إبطال القديم
  const fresh = { ...session, tokenVersion: row.token_version + 1 };
  await setAuthCookies(signAccessToken(fresh), signRefreshToken(session.userId, fresh.tokenVersion));
  await auditLog({ userId: session.userId, action: "PASSWORD_CHANGED", entityType: "User", entityId: session.userId, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم تغيير كلمة المرور وإنهاء الجلسات الأخرى" });
}

/** DELETE — إنهاء كل الجلسات على الأجهزة الأخرى (مع إبقاء الحالية). */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const row = await queryOne<{ token_version: number }>("SELECT token_version FROM users WHERE id = ?", [session.userId]);
  await exec("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [session.userId]);
  const fresh = { ...session, tokenVersion: (row?.token_version ?? 1) + 1 };
  await setAuthCookies(signAccessToken(fresh), signRefreshToken(session.userId, fresh.tokenVersion));
  await auditLog({ userId: session.userId, action: "SESSIONS_REVOKED_SELF", entityType: "User", entityId: session.userId, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "أُنهيت الجلسات على الأجهزة الأخرى" });
}
