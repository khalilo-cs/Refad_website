import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec, query, queryOne, uuid, transaction } from "@/lib/db/sqlite";
import { canAccessSchool, schoolScope } from "@/lib/scope";
import { clientIp, rateLimit, sanitizeFilename, sha256Hex, sniffFile } from "@/lib/security";
import { notify } from "@/lib/notify";
import { putObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"];
const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET — المواد التعليمية المشتركة المتاحة للمستخدم (معلمو المدرسة وأولياء أمورها يقرؤون). */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (session.roleKey === "GUEST") return bad("غير مصرح", 403);
  const sc = await schoolScope(session, "s");
  const rows = await query(
    `SELECT m.id, m.title, m.description, m.audience, m.created_at, m.evidence_id, m.created_by_id, s.name AS school_name, u.name AS created_by_name,
            e.original_name, e.mime_type, e.size
     FROM shared_materials m JOIN schools s ON s.id = m.school_id JOIN users u ON u.id = m.created_by_id LEFT JOIN evidence e ON e.id = m.evidence_id
     WHERE ${sc.sql} AND (m.audience = 'SCHOOL' OR m.created_by_id = ?) ORDER BY m.created_at DESC LIMIT 200`, [...sc.params, session.userId]);
  const filtered = session.roleKey === "PARENT" ? rows.filter((r: any) => r.audience === "PARENTS" || r.audience === "SCHOOL") : rows;
  return NextResponse.json({ materials: filtered, canWrite: WRITE.includes(session.roleKey) });
}

/** POST (multipart) — رفع مادة تعليمية: file, title, description, schoolId, audience. تُخزَّن في التخزين الخاص نفسه. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!WRITE.includes(session.roleKey)) return bad("غير مصرح", 403);
  if (!rateLimit(`mat:${session.userId}`, 30, 10 * 60_000).ok) return bad("عدد كبير من عمليات الرفع", 429);
  const form = await request.formData().catch(() => null);
  if (!form) return bad("يجب إرسال الملف بصيغة multipart/form-data");
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const schoolId = String(form.get("schoolId") ?? session.schoolId ?? "");
  const audience = form.get("audience") === "PARENTS" ? "PARENTS" : "SCHOOL";
  if (!(file instanceof File) || file.size === 0) return bad("لم يُرفق ملف");
  if (file.size > 20 * 1024 * 1024) return bad("حجم الملف يتجاوز 20 ميجابايت");
  if (title.length < 3) return bad("عنوان المادة مطلوب");
  if (!schoolId || !await queryOne("SELECT id FROM schools WHERE id = ?", [schoolId]) || !await canAccessSchool(session, schoolId)) return bad("المدرسة خارج نطاق صلاحيتك", 403);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffFile(buf, file.name);
  if (!kind) return bad("نوع الملف غير مسموح أو محتواه لا يطابق امتداده");

  const key = `${uuid()}.${kind.ext}`;
  await putObject(key, buf, kind.mime);
  const evId = uuid();
  const matId = uuid();
  await transaction(async () => {
    await exec(`INSERT INTO evidence (id, name, original_name, mime_type, size, storage_key, url, school_id, uploaded_by_id, review_status, document_type, description, sha256, visibility)
                VALUES (?,?,?,?,?,?,?,?,?, 'ACCEPTED', 'مادة تعليمية', ?, ?, 'SHARED')`, [evId, sanitizeFilename(title), sanitizeFilename(file.name), kind.mime, buf.length, key, `/api/evidence/${evId}/file`, schoolId, session.userId, "مادة تعليمية مشتركة", sha256Hex(buf)]);
    await exec("INSERT INTO shared_materials (id, school_id, title, description, evidence_id, created_by_id, audience) VALUES (?,?,?,?,?,?,?)", [matId, schoolId, title.slice(0, 200), String(form.get("description") ?? "").slice(0, 500) || null, evId, session.userId, audience]);
  });
  await auditLog({ userId: session.userId, action: "MATERIAL_SHARED", entityType: "shared_material", entityId: matId, newValues: { title, schoolId, audience }, ipAddress: clientIp(request) });
  const audienceUsers = await query<{ id: string }>(
    audience === "PARENTS"
      ? `SELECT DISTINCT u.id FROM users u JOIN parents p ON p.user_id = u.id JOIN parent_student ps ON ps.parent_id = p.id JOIN students st ON st.id = ps.student_id WHERE st.school_id = ? AND u.is_active = 1`
      : `SELECT u.id FROM users u WHERE u.school_id = ? AND u.is_active = 1`, [schoolId]);
  await notify(audienceUsers.map((u) => u.id).filter((id) => id !== session.userId), "مادة تعليمية جديدة", title, { link: "/communication", type: "INFO" });
  return NextResponse.json({ id: matId, message: "نُشرت المادة" }, { status: 201 });
}

/** DELETE ?id= — صاحب المادة أو مدير المدرسة أو الإدارة. */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const m = await queryOne<any>("SELECT * FROM shared_materials WHERE id = ?", [request.nextUrl.searchParams.get("id") ?? ""]);
  if (!m) return bad("المادة غير موجودة", 404);
  const privileged = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL"].includes(session.roleKey) && await canAccessSchool(session, m.school_id);
  if (m.created_by_id !== session.userId && !privileged) return bad("لا تملك صلاحية الحذف", 403);
  await exec("DELETE FROM shared_materials WHERE id = ?", [m.id]);
  if (m.evidence_id) await exec("DELETE FROM evidence WHERE id = ?", [m.evidence_id]);
  await auditLog({ userId: session.userId, action: "MATERIAL_DELETED", entityType: "shared_material", entityId: m.id, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "حُذفت المادة" });
}
