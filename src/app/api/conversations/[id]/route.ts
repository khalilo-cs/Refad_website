import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec, query, queryOne, uuid, nowISO } from "@/lib/db/sqlite";
import { clientIp, rateLimit } from "@/lib/security";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

async function participant(userId: string, id: string) {
  return await queryOne<{ last_read_at: string | null }>("SELECT last_read_at FROM conversation_participants WHERE conversation_id = ? AND user_id = ?", [id, userId]);
}

/** GET — سلسلة الرسائل مع حالة القراءة لكل مشارك. يعلّم الرسائل مقروءة للمستخدم الحالي. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { id } = await params;
  if (!await participant(session.userId, id)) return bad("المراسلة غير موجودة", 404);
  const conv = await queryOne<any>(`SELECT c.*, s.name AS school_name FROM conversations c LEFT JOIN schools s ON s.id = c.school_id WHERE c.id = ?`, [id]);
  const parts = await query<any>(`SELECT u.id, u.name, r.name AS role, cp.last_read_at FROM conversation_participants cp JOIN users u ON u.id = cp.user_id JOIN roles r ON r.id = u.role_id WHERE cp.conversation_id = ?`, [id]);
  const messages = await query<any>(`SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at, m.rowid`, [id]);
  const withReads = messages.map((m) => ({ ...m, read_by: parts.filter((p) => p.id !== m.sender_id && p.last_read_at && p.last_read_at >= m.created_at).map((p) => p.name) }));
  await exec("UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", [nowISO(), id, session.userId]);
  await exec("UPDATE messages SET is_read = 1, read_at = ? WHERE conversation_id = ? AND sender_id <> ? AND is_read = 0", [nowISO(), id, session.userId]);
  return NextResponse.json({ conversation: conv, participants: parts.map((p) => ({ id: p.id, name: p.name, role: p.role })), messages: withReads, meId: session.userId });
}

/** POST — إضافة رد. المشاركون فقط، والمراسلة المغلقة لا تقبل ردوداً. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { id } = await params;
  if (!await participant(session.userId, id)) return bad("المراسلة غير موجودة", 404);
  const rl = rateLimit(`msg:${session.userId}`, 60, 10 * 60_000);
  if (!rl.ok) return bad("عدد كبير من الرسائل. حاول لاحقاً.", 429);
  const conv = await queryOne<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (conv.status === "CLOSED") return bad("المراسلة مغلقة", 409);
  const b: any = await request.json().catch(() => ({}));
  const body = String(b?.body ?? "").trim();
  if (!body) return bad("نص الرسالة مطلوب");
  const now = nowISO();
  await exec("INSERT INTO messages (id, conversation_id, sender_id, body, is_read, created_at) VALUES (?,?,?,?,0,?)", [uuid(), id, session.userId, body.slice(0, 4000), now]);
  await exec("UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  await exec("UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", [now, id, session.userId]);
  const others = (await query<{ user_id: string }>("SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id <> ?", [id, session.userId])).map((r) => r.user_id);
  await notify(others, "رد جديد في مراسلة", conv.title, { link: `/communication?c=${id}`, type: "INFO" });
  return NextResponse.json({ message: "أُرسل الرد" }, { status: 201 });
}

/** PATCH — { status: "CLOSED"|"OPEN" } لمنشئ المراسلة أو مدير المنصة. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { id } = await params;
  if (!await participant(session.userId, id)) return bad("المراسلة غير موجودة", 404);
  const conv = await queryOne<any>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (conv.created_by_id !== session.userId && session.roleKey !== "SUPER_ADMIN") return bad("لمنشئ المراسلة فقط", 403);
  const b: any = await request.json().catch(() => ({}));
  const status = b?.status === "CLOSED" ? "CLOSED" : "OPEN";
  await exec("UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?", [status, nowISO(), id]);
  await auditLog({ userId: session.userId, action: `CONVERSATION_${status}`, entityType: "conversation", entityId: id, ipAddress: clientIp(request) });
  return NextResponse.json({ message: status === "CLOSED" ? "أُغلقت المراسلة" : "أُعيد فتح المراسلة" });
}
