import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize } from "@/lib/auth";
import { query, queryOne } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit
 *
 * سجل التدقيق للقراءة فقط: من فعل ماذا ومتى ومن أي عنوان.
 * يدعم البحث والتصفية والتصفّح، ويُعيد أسماء المستخدمين مع كل حدث.
 *
 * ملاحظة: لا يوجد أي مسار في النظام يسمح بتعديل السجل أو حذفه؛
 * هذه الواجهة تقرأ فقط.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
      return NextResponse.json(
        { message: "سجل التدقيق مقصور على مدير النظام" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const limit = Math.min(100, Math.max(5, Number(searchParams.get("limit") ?? 25) || 25));
    const offset = (page - 1) * limit;
    const action = searchParams.get("action")?.trim();
    const entity = searchParams.get("entity")?.trim();
    const search = searchParams.get("q")?.trim();
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();

    const where: string[] = ["1 = 1"];
    const params: any[] = [];

    if (action) {
      where.push("a.action = ?");
      params.push(action);
    }
    if (entity) {
      where.push("a.entity_type = ?");
      params.push(entity);
    }
    if (search) {
      where.push("(u.name LIKE ? OR a.entity_id LIKE ? OR a.action LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (from) {
      where.push("date(a.created_at) >= date(?)");
      params.push(from);
    }
    if (to) {
      where.push("date(a.created_at) <= date(?)");
      params.push(to);
    }

    const whereSql = where.join(" AND ");

    const total = queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${whereSql}`,
      params
    );

    const rows = query<any>(
      `SELECT a.id, a.action, a.entity_type, a.entity_id,
              a.old_values, a.new_values, a.ip_address, a.created_at,
              u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}
       ORDER BY a.created_at DESC, a.rowid DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const actions = query<{ action: string; c: number }>(
      "SELECT action, COUNT(*) AS c FROM audit_logs GROUP BY action ORDER BY c DESC LIMIT 60"
    );
    const entities = query<{ entity_type: string; c: number }>(
      "SELECT entity_type, COUNT(*) AS c FROM audit_logs GROUP BY entity_type ORDER BY c DESC LIMIT 60"
    );

    return NextResponse.json({
      rows,
      total: total?.c ?? 0,
      page,
      limit,
      pages: Math.max(1, Math.ceil((total?.c ?? 0) / limit)),
      filters: { actions, entities },
    });
  } catch {
    return NextResponse.json({ message: "تعذّر تحميل سجل التدقيق" }, { status: 500 });
  }
}
