import { NextRequest, NextResponse } from "next/server";
import { auditLog, authorize, getServerSession, hashPassword } from "@/lib/auth";
import { exec, nowISO, query, queryOne, uuid } from "@/lib/db/sqlite";
import { generatePassword, usernameFromCode, placeholderEmail } from "@/lib/credentials";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// تجزئة bcrypt لكل حساب؛ الدفعات صغيرة لتبقى ضمن مهلة الاستضافة بلا خادم.
export const maxDuration = 60;

const MAX_BATCH = 20;
const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET — مدارس نشطة لا يوجد لها حساب مدير فعّال. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) return bad("مقصور على مدير النظام", 403);
  const rows = await query<any>(
    `SELECT s.id, s.name, s.code, s.principal_name, s.contact_phone, s.has_whatsapp FROM schools s
     WHERE s.status = 'ACTIVE' AND NOT EXISTS (
       SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.school_id = s.id AND r.key = 'SCHOOL_PRINCIPAL' AND u.is_active = 1)
     ORDER BY s.name`
  );
  return NextResponse.json({ schools: rows, maxBatch: MAX_BATCH });
}

/** POST { schoolIds } — ينشئ حساب مدير لكل مدرسة (اسم الدخول = رمز المدرسة) بكلمة مؤقتة تُعاد مرة واحدة. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) return bad("مقصور على مدير النظام", 403);
  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.schoolIds) ? [...new Set<string>(body.schoolIds.filter((x: unknown) => typeof x === "string"))] : [];
  if (ids.length === 0) return bad("اختر مدرسة واحدة على الأقل");
  if (ids.length > MAX_BATCH) return bad(`الحد الأقصى ${MAX_BATCH} مدرسة في الدفعة الواحدة`);

  const role = await queryOne<{ id: string }>("SELECT id FROM roles WHERE key = 'SCHOOL_PRINCIPAL'");
  if (!role) return bad("دور مدير المدرسة غير موجود", 500);

  const created: { schoolId: string; school: string; name: string; login: string; password: string; phone: string | null; hasWhatsapp: boolean }[] = [];
  const skipped: { schoolId: string; school: string; reason: string }[] = [];
  const now = nowISO();

  for (const id of ids) {
    const s = await queryOne<any>("SELECT id, name, code, principal_name, contact_phone, has_whatsapp FROM schools WHERE id = ?", [id]);
    if (!s) { skipped.push({ schoolId: id, school: "—", reason: "المدرسة غير موجودة" }); continue; }
    const has = await queryOne("SELECT u.id FROM users u WHERE u.school_id = ? AND u.role_id = ? AND u.is_active = 1", [id, role.id]);
    if (has) { skipped.push({ schoolId: id, school: s.name, reason: "لها مدير بحساب فعّال" }); continue; }
    const username = usernameFromCode(s.code);
    if (!username) { skipped.push({ schoolId: id, school: s.name, reason: "رمز المدرسة لا يصلح اسم دخول" }); continue; }
    const dup = await queryOne("SELECT id FROM users WHERE lower(username) = ? OR lower(email) = ?", [username, placeholderEmail(username)]);
    if (dup) { skipped.push({ schoolId: id, school: s.name, reason: `اسم الدخول «${username}» مستخدم` }); continue; }

    const password = generatePassword();
    const userId = uuid();
    const name = (s.principal_name && String(s.principal_name).trim().length >= 3) ? String(s.principal_name).trim() : `مدير ${s.name}`;
    await exec(
      `INSERT INTO users (id, name, email, username, phone, has_whatsapp, job_title, password_hash, role_id, school_id,
                          is_active, is_locked, token_version, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'مدير المدرسة', ?, ?, ?, 1, 0, 1, 1, ?, ?)`,
      [userId, name, placeholderEmail(username), username, s.contact_phone ?? null, s.has_whatsapp === 0 ? 0 : 1, await hashPassword(password), role.id, id, now, now]
    );
    await auditLog({ userId: session.userId, action: "USER_CREATED", entityType: "user", entityId: userId, newValues: { username, roleKey: "SCHOOL_PRINCIPAL", schoolId: id, bulk: true }, ipAddress: clientIp(request) });
    created.push({ schoolId: id, school: s.name, name, login: username, password, phone: s.contact_phone ?? null, hasWhatsapp: s.has_whatsapp !== 0 });
  }
  return NextResponse.json({ message: `أُنشئ ${created.length} حساباً، وتُخطّي ${skipped.length}`, created, skipped }, { status: created.length ? 201 : 200 });
}
