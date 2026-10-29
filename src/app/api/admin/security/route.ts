import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec, query, queryOne } from "@/lib/db/sqlite";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — لمحة أمنية: محاولات الدخول الفاشلة، الحسابات الموقوفة/المقفلة، الحوادث المفتوحة. مدير المنصة فقط. */
export async function GET() {
  const session = await getServerSession();
  if (!session || session.roleKey !== "SUPER_ADMIN") return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const failed24 = (await queryOne<{ n: number }>("SELECT COUNT(*) n FROM login_attempts WHERE success = 0 AND datetime(created_at) >= datetime('now','-1 day')"))?.n ?? 0;
  const ok24 = (await queryOne<{ n: number }>("SELECT COUNT(*) n FROM login_attempts WHERE success = 1 AND datetime(created_at) >= datetime('now','-1 day')"))?.n ?? 0;
  const topIps = await query<any>("SELECT ip, COUNT(*) AS n FROM login_attempts WHERE success = 0 AND datetime(created_at) >= datetime('now','-1 day') GROUP BY ip ORDER BY n DESC LIMIT 5");
  const topEmails = await query<any>("SELECT email, COUNT(*) AS n FROM login_attempts WHERE success = 0 AND datetime(created_at) >= datetime('now','-1 day') GROUP BY email ORDER BY n DESC LIMIT 5");
  const locked = await query<any>(
    `SELECT u.id, u.name, u.email, u.is_locked, u.locked_until, u.locked_reason, u.failed_login FROM users u
     WHERE u.is_locked = 1 OR (u.locked_until IS NOT NULL AND datetime(u.locked_until) > datetime('now')) ORDER BY u.name`);
  const recent = await query<any>(
    `SELECT l.email, l.ip, l.success, l.created_at FROM login_attempts l ORDER BY l.created_at DESC LIMIT 25`);
  const openIncidents = (await queryOne<{ n: number }>("SELECT COUNT(*) n FROM security_incidents WHERE status IN ('OPEN','INVESTIGATING')"))?.n ?? 0;
  const users = await query<any>("SELECT u.id, u.name, u.email, u.is_locked FROM users u ORDER BY u.name LIMIT 500");
  return NextResponse.json({ failed24, ok24, topIps, topEmails, locked, recent, openIncidents, users });
}

/** POST — { userId, action: "suspend" | "unsuspend" | "revoke_sessions", reason? } */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session || session.roleKey !== "SUPER_ADMIN") return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const b: any = await request.json().catch(() => ({}));
  const u = await queryOne<any>("SELECT id, name FROM users WHERE id = ?", [String(b?.userId ?? "")]);
  if (!u) return NextResponse.json({ message: "المستخدم غير موجود" }, { status: 404 });
  if (u.id === session.userId) return NextResponse.json({ message: "لا يمكنك تنفيذ هذا الإجراء على حسابك" }, { status: 400 });
  const ip = clientIp(request);
  if (b.action === "suspend") {
    if (String(b.reason ?? "").trim().length < 5) return NextResponse.json({ message: "سبب الإيقاف مطلوب" }, { status: 400 });
    await exec("UPDATE users SET is_locked = 1, locked_reason = ?, token_version = token_version + 1 WHERE id = ?", [String(b.reason).slice(0, 200), u.id]);
    await auditLog({ userId: session.userId, action: "USER_SUSPENDED", entityType: "User", entityId: u.id, newValues: { reason: b.reason }, ipAddress: ip });
    return NextResponse.json({ message: `أُوقف حساب ${u.name} وأُبطلت جلساته` });
  }
  if (b.action === "unsuspend") {
    await exec("UPDATE users SET is_locked = 0, locked_reason = NULL, locked_until = NULL, failed_login = 0 WHERE id = ?", [u.id]);
    await auditLog({ userId: session.userId, action: "USER_UNSUSPENDED", entityType: "User", entityId: u.id, ipAddress: ip });
    return NextResponse.json({ message: `أُعيد تفعيل حساب ${u.name}` });
  }
  if (b.action === "revoke_sessions") {
    await exec("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [u.id]);
    await auditLog({ userId: session.userId, action: "SESSIONS_REVOKED", entityType: "User", entityId: u.id, ipAddress: ip });
    return NextResponse.json({ message: `أُبطلت كل جلسات ${u.name}` });
  }
  return NextResponse.json({ message: "إجراء غير معروف" }, { status: 400 });
}
