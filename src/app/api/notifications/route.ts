import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query, queryOne, exec } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/notifications — إشعارات المستخدم الحالي، مع توليد تنبيهات المواعيد (مرة لكل يوم). */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });

  // تنبيهات تلقائية: إجراءات قريبة/متأخرة، زيارات اليوم، تقارير بانتظار الاعتماد
  const gen = (key: string, title: string, body: string, link: string, type: string) => {
    const exists = queryOne("SELECT 1 FROM notifications WHERE user_id = ? AND title = ? AND body = ? AND date(created_at) = date('now')", [session.userId, title, body]);
    if (!exists) exec("INSERT INTO notifications (id, user_id, title, body, type, link) VALUES (lower(hex(randomblob(16))),?,?,?,?,?)", [session.userId, title, body, type, link]);
  };
  try {
    const mine = query<{ n: number; k: string }>(
      `SELECT COUNT(*) n, 'overdue' k FROM corrective_actions WHERE responsible_id = ? AND status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(due_date) < date('now')
       UNION ALL SELECT COUNT(*), 'soon' FROM corrective_actions WHERE responsible_id = ? AND status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') AND date(due_date) BETWEEN date('now') AND date('now','+3 day')
       UNION ALL SELECT COUNT(*), 'visits' FROM visits WHERE inspector_id = ? AND status IN ('SCHEDULED','POSTPONED') AND date(scheduled_at) = date('now')`,
      [session.userId, session.userId, session.userId]
    );
    for (const r of mine) {
      if (!r.n) continue;
      if (r.k === "overdue") gen("overdue", "إجراءات تصحيحية متأخرة", `لديك ${r.n} إجراء متأخر`, "/improvement", "DANGER");
      if (r.k === "soon") gen("soon", "مواعيد قريبة", `${r.n} إجراء تنتهي مهلته خلال 3 أيام`, "/improvement", "WARNING");
      if (r.k === "visits") gen("visits", "زيارات اليوم", `لديك ${r.n} زيارة مجدولة اليوم`, "/visits", "INFO");
    }
    if (["EDUCATION_DIRECTOR", "SUPER_ADMIN"].includes(session.roleKey)) {
      const p = queryOne<{ n: number }>("SELECT COUNT(*) n FROM reports WHERE status = 'UNDER_REVIEW'")?.n ?? 0;
      if (p) gen("reports", "تقارير بانتظار الاعتماد", `${p} تقرير قيد المراجعة`, "/reports", "WARNING");
    }
  } catch { /* لا يعطّل القائمة */ }

  const items = query(
    "SELECT id, title, body, type, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40",
    [session.userId]
  );
  const unread = queryOne<{ n: number }>("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0", [session.userId])?.n ?? 0;
  return NextResponse.json({ items, unread });
}

/** PATCH /api/notifications — { id } لتعليم إشعار كمقروء، أو { all: true } للكل. */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body?.all) exec("UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND is_read = 0", [session.userId]);
  else if (typeof body?.id === "string") exec("UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ? AND user_id = ?", [body.id, session.userId]);
  return NextResponse.json({ ok: true });
}
