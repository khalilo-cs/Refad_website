import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, batch, uuid } from "@/lib/db/sqlite";
import { notify } from "@/lib/notify";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

type Ctx = { params: Promise<{ id: string }> };

async function loadInspector(id: string) {
  return await queryOne<{ id: string; name: string; role_key: string }>(
    `SELECT u.id, u.name, r.key AS role_key FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );
}

/** GET /api/users/[id]/schools — المدارس المسندة إلى المفتش (لمدير النظام فقط). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession();
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) return bad("إسناد المدارس لمدير النظام فقط", 403);
  const { id } = await params;
  const user = await loadInspector(id);
  if (!user) return bad("المستخدم غير موجود", 404);
  if (user.role_key !== "INSPECTOR") return bad("الإسناد متاح لحسابات المفتشين فقط", 409);
  const rows = await query<{ school_id: string }>("SELECT school_id FROM school_assignments WHERE user_id = ?", [id]);
  return NextResponse.json({ schoolIds: rows.map((r) => r.school_id) });
}

/** PUT /api/users/[id]/schools { schoolIds } — يستبدل قائمة المدارس المسندة إلى المفتش. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const session = await getServerSession();
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed || !session) return bad("إسناد المدارس لمدير النظام فقط", 403);
  const { id } = await params;
  const user = await loadInspector(id);
  if (!user) return bad("المستخدم غير موجود", 404);
  if (user.role_key !== "INSPECTOR") return bad("الإسناد متاح لحسابات المفتشين فقط", 409);

  const body = await request.json().catch(() => null);
  const raw = body?.schoolIds;
  if (!Array.isArray(raw) || raw.length > 5000 || raw.some((x) => typeof x !== "string" || x.length > 64)) {
    return bad("قائمة المدارس غير صالحة");
  }
  const wanted = [...new Set(raw as string[])];
  const known = new Set<string>();
  for (let i = 0; i < wanted.length; i += 500) {
    const chunk = wanted.slice(i, i + 500);
    if (!chunk.length) continue;
    const rows = await query<{ id: string }>(`SELECT id FROM schools WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk);
    rows.forEach((r) => known.add(r.id));
  }
  if (known.size !== wanted.length) return bad("بعض المدارس المختارة غير موجودة");

  const before = new Set((await query<{ school_id: string }>("SELECT school_id FROM school_assignments WHERE user_id = ?", [id])).map((r) => r.school_id));
  const added = wanted.filter((s) => !before.has(s));
  const removed = [...before].filter((s) => !known.has(s));

  await batch([
    ...removed.map((s) => ({ sql: "DELETE FROM school_assignments WHERE user_id = ? AND school_id = ?", params: [id, s] })),
    ...added.map((s) => ({
      sql: "INSERT OR IGNORE INTO school_assignments (id, user_id, school_id, assigned_by_id) VALUES (?,?,?,?)",
      params: [uuid(), id, s, session.userId],
    })),
  ]);

  await auditLog({
    userId: session.userId,
    action: "INSPECTOR_SCHOOLS_ASSIGNED",
    entityType: "user",
    entityId: id,
    oldValues: { count: before.size },
    newValues: { count: wanted.length, added: added.length, removed: removed.length },
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  if (added.length) {
    await notify([id], "إسناد مدارس جديدة", `أسند إليك مدير النظام ${added.length} مدرسة للمتابعة والتقييم`, { link: "/schools", type: "INFO" });
  }
  return NextResponse.json({ ok: true, count: wanted.length, added: added.length, removed: removed.length });
}
