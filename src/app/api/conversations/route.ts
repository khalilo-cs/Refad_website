import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { getDb, query, queryOne, uuid, nowISO } from "@/lib/db/sqlite";
import { clientIp, rateLimit } from "@/lib/security";
import { notify } from "@/lib/notify";
import { schoolScope } from "@/lib/scope";
import { allowedRecipients, KINDS } from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET /api/conversations?kind= — مراسلات المستخدم مع آخر رسالة وعدد غير المقروء وحالة الرد. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (session.roleKey === "GUEST") return bad("غير مصرح", 403);
  const kind = request.nextUrl.searchParams.get("kind");
  const rows = query<any>(
    `SELECT c.id, c.title, c.kind, c.status, c.school_id, c.is_official, c.created_at, c.last_message_at, s.name AS school_name, cu.name AS created_by_name,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_body,
            (SELECT u.name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_sender,
            (SELECT m.sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_sender_id,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ? AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)) AS unread,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages_count
     FROM conversations c JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     LEFT JOIN schools s ON s.id = c.school_id LEFT JOIN users cu ON cu.id = c.created_by_id
     ${kind && KINDS[kind] ? "WHERE c.kind = ?" : ""}
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`,
    kind && KINDS[kind] ? [session.userId, session.userId, kind] : [session.userId, session.userId]);
  return NextResponse.json({ conversations: rows.map((r) => ({ ...r, awaiting_my_reply: r.last_sender_id && r.last_sender_id !== session.userId && r.status === "OPEN" })), kinds: KINDS });
}

/** POST — { schoolId, title, body, kind, recipientIds[] } — المستلمون من القائمة المسموحة لدور الفاعل فقط. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (session.roleKey === "GUEST") return bad("غير مصرح", 403);
  const rl = rateLimit(`msg:${session.userId}`, 60, 10 * 60_000);
  if (!rl.ok) return bad("عدد كبير من الرسائل. حاول لاحقاً.", 429);
  const b: any = await request.json().catch(() => null);
  if (!b) return bad("صيغة الطلب غير صحيحة");

  const title = String(b.title ?? "").trim();
  const body = String(b.body ?? "").trim();
  if (title.length < 3) return bad("عنوان المراسلة قصير جداً");
  if (body.length < 2) return bad("نص الرسالة مطلوب");
  const schoolId = String(b.schoolId ?? "");
  if (!queryOne("SELECT id FROM schools WHERE id = ?", [schoolId])) return bad("المدرسة غير موجودة", 404);

  const allowed = allowedRecipients(session, schoolId);
  const allowedIds = new Set(allowed.map((u) => u.id));
  let recipients: string[] = Array.isArray(b.recipientIds) ? b.recipientIds.map(String).filter((id: string) => allowedIds.has(id)) : [];
  // الأدوار الإدارية: ما لم يُحدَّد مستلمون يُراسَل مدير المدرسة ومنسق الجودة
  if (recipients.length === 0 && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey))
    recipients = allowed.filter((u) => ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(u.roleKey)).map((u) => u.id);
  // الأدوار المدرسية: ما لم يُحدَّد مستلمون تُوجَّه المراسلة إلى الإدارة التعليمية (استفسار)، وولي الأمر إلى مدير المدرسة
  if (recipients.length === 0 && session.roleKey !== "PARENT") recipients = allowed.filter((u) => ["EDUCATION_DIRECTOR", "INSPECTOR"].includes(u.roleKey)).map((u) => u.id);
  if (session.roleKey === "PARENT") recipients = allowed.map((u) => u.id);
  if (recipients.length === 0) return bad("لا يوجد مستلمون مسموحون لهذه المراسلة", 403);

  const hasParent = recipients.some((id) => allowed.find((u) => u.id === id)?.roleKey === "PARENT");
  let kind = String(b.kind ?? "");
  if (!KINDS[kind]) kind = session.roleKey === "PARENT" || hasParent ? "PARENT_CHANNEL" : ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey) ? "OFFICIAL" : "INQUIRY";
  if (kind === "OFFICIAL" && !["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey)) kind = "INQUIRY";

  const db = getDb();
  const id = uuid();
  const now = nowISO();
  db.transaction(() => {
    db.prepare("INSERT INTO conversations (id, school_id, title, is_official, kind, created_by_id, last_message_at) VALUES (?,?,?,?,?,?,?)").run(id, schoolId, title.slice(0, 200), kind === "OFFICIAL" ? 1 : 0, kind, session.userId, now);
    for (const uid of new Set([session.userId, ...recipients])) db.prepare("INSERT INTO conversation_participants (id, conversation_id, user_id, last_read_at) VALUES (?,?,?,?)").run(uuid(), id, uid, uid === session.userId ? now : null);
    db.prepare("INSERT INTO messages (id, conversation_id, sender_id, body, is_read, created_at) VALUES (?,?,?,?,0,?)").run(uuid(), id, session.userId, body.slice(0, 4000), now);
  })();
  notify(recipients, kind === "OFFICIAL" ? "مراسلة رسمية جديدة" : "رسالة جديدة", title, { link: `/communication?c=${id}`, type: "INFO" });
  auditLog({ userId: session.userId, action: "CONVERSATION_CREATED", entityType: "conversation", entityId: id, newValues: { kind, schoolId, recipients: recipients.length }, ipAddress: clientIp(request) });
  return NextResponse.json({ id, message: "أُرسلت الرسالة" }, { status: 201 });
}
