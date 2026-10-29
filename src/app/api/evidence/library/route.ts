import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec, query, queryOne, uuid } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";
import { EVIDENCE_LIBRARY } from "../../../../../prisma/seed/data";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** يملأ المكتبة من الشواهد المتكررة الواردة في الاستمارة عند أول استخدام. */
function ensureSeeded() {
  const n = queryOne<{ n: number }>("SELECT COUNT(*) n FROM evidence_library_items")?.n ?? 0;
  if (n > 0) return;
  for (const it of EVIDENCE_LIBRARY) {
    exec("INSERT INTO evidence_library_items (id, title, description, indicator_codes) VALUES (?,?,?,?)",
      [uuid(), it.title, it.description, JSON.stringify(it.suggestedIndicators ?? [])]);
  }
}

const MANAGERS = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "QUALITY_COORDINATOR"];

/** GET /api/evidence/library?schoolId= — عناصر المكتبة مع حالة تغطية المدرسة لكل عنصر. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (["PARENT", "GUEST"].includes(session.roleKey)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  ensureSeeded();
  const schoolId = request.nextUrl.searchParams.get("schoolId") || session.schoolId;
  if (schoolId && !canAccessSchool(session, schoolId)) return NextResponse.json({ message: "خارج نطاق صلاحيتك" }, { status: 403 });
  const items = query<any>("SELECT id, title, description, indicator_codes, document_type FROM evidence_library_items WHERE is_active = 1 ORDER BY title");
  const cover = schoolId
    ? query<any>(
        `SELECT library_item_id, COUNT(*) AS total, SUM(CASE WHEN review_status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN review_status = 'PENDING' THEN 1 ELSE 0 END) AS pending, MAX(created_at) AS last_at
         FROM evidence WHERE school_id = ? AND library_item_id IS NOT NULL GROUP BY library_item_id`, [schoolId])
    : [];
  const map = new Map(cover.map((c) => [c.library_item_id, c]));
  return NextResponse.json({
    schoolId,
    canManage: MANAGERS.includes(session.roleKey) || session.permissions?.manageEvidenceLibrary === true,
    items: items.map((i) => {
      const c = map.get(i.id);
      return { ...i, indicator_codes: JSON.parse(i.indicator_codes || "[]"), total: c?.total ?? 0, accepted: c?.accepted ?? 0, pending: c?.pending ?? 0, last_at: c?.last_at ?? null };
    }),
  });
}

function canManage(session: any) {
  return MANAGERS.includes(session.roleKey) || session.permissions?.manageEvidenceLibrary === true || session.permissions?.all === true;
}

/** POST — إضافة عنصر مرجعي. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session || !canManage(session)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const title = String(b?.title ?? "").trim();
  if (title.length < 3) return NextResponse.json({ message: "العنوان مطلوب" }, { status: 400 });
  const codes = Array.isArray(b?.indicatorCodes) ? b.indicatorCodes.filter((c: unknown) => typeof c === "string").slice(0, 30) : [];
  const id = uuid();
  exec("INSERT INTO evidence_library_items (id, title, description, indicator_codes, created_by_id) VALUES (?,?,?,?,?)", [id, title.slice(0, 200), String(b?.description ?? "").slice(0, 500) || null, JSON.stringify(codes), session.userId]);
  auditLog({ userId: session.userId, action: "EVIDENCE_LIBRARY_ADD", entityType: "evidence_library", entityId: id, newValues: { title }, ipAddress: clientIp(request) });
  return NextResponse.json({ id, message: "أُضيف العنصر إلى المكتبة" }, { status: 201 });
}

/** PATCH — تعديل أو تعطيل عنصر. */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  if (!session || !canManage(session)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const row = queryOne<any>("SELECT * FROM evidence_library_items WHERE id = ?", [String(b?.id ?? "")]);
  if (!row) return NextResponse.json({ message: "العنصر غير موجود" }, { status: 404 });
  exec("UPDATE evidence_library_items SET title = ?, description = ?, indicator_codes = ?, is_active = ? WHERE id = ?", [
    b.title ? String(b.title).slice(0, 200) : row.title,
    b.description !== undefined ? String(b.description).slice(0, 500) : row.description,
    Array.isArray(b.indicatorCodes) ? JSON.stringify(b.indicatorCodes.slice(0, 30)) : row.indicator_codes,
    b.isActive === false ? 0 : 1, row.id]);
  auditLog({ userId: session.userId, action: "EVIDENCE_LIBRARY_UPDATE", entityType: "evidence_library", entityId: row.id, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم التحديث" });
}
