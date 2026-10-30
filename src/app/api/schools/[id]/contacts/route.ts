import { NextRequest, NextResponse } from "next/server";
import { auditLog, getServerSession } from "@/lib/auth";
import { query, queryOne, exec, uuid, nowISO } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";
import { normalizePhoneField, wa } from "@/lib/school-input";
import { clientIp } from "@/lib/security";
import { CONTACT_STAFF_ROLES, canEditContacts, contactSchema } from "@/lib/school-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400, extra: object = {}) => NextResponse.json({ message, ...extra }, { status });

/** GET — الجهة الرئيسية (مدير المدرسة من ملف المدرسة) + الجهات الإضافية. للكوادر ضمن النطاق فقط. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!CONTACT_STAFF_ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);
  const { id } = await params;
  if (!(await canAccessSchool(session, id))) return bad("المدرسة خارج نطاق صلاحيتك", 403);
  const school = await queryOne<any>("SELECT id, name, principal_name, contact_phone, contact_email, has_whatsapp FROM schools WHERE id = ?", [id]);
  if (!school) return bad("المدرسة غير موجودة", 404);
  const rows = await query<any>("SELECT id, role, name, phone, has_whatsapp, email, notes, created_at FROM school_contacts WHERE school_id = ? ORDER BY created_at", [id]);
  return NextResponse.json({
    primary: { role: "مدير المدرسة", name: school.principal_name, phone: school.contact_phone, hasWhatsapp: school.has_whatsapp === 1, email: school.contact_email },
    contacts: rows.map((r) => ({ id: r.id, role: r.role, name: r.name, phone: r.phone, hasWhatsapp: r.has_whatsapp === 1, email: r.email, notes: r.notes })),
    canEdit: canEditContacts(session),
  });
}

/** POST — إضافة جهة اتصال. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!canEditContacts(session)) return bad("لا تملك صلاحية تعديل جهات الاتصال", 403);
  const { id } = await params;
  if (!(await canAccessSchool(session, id))) return bad("المدرسة خارج نطاق صلاحيتك", 403);
  if (!(await queryOne("SELECT id FROM schools WHERE id = ?", [id]))) return bad("المدرسة غير موجودة", 404);

  const body = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة", 400, { errors: parsed.error.flatten().fieldErrors });
  const d = parsed.data;
  const phone = normalizePhoneField(d.phone ?? null, d.allowInvalidPhone === true);
  if (phone.error) return bad(phone.error, 400, { invalidPhone: true, errors: { phone: [phone.error] } });
  const count = await queryOne<{ n: number }>("SELECT COUNT(*) n FROM school_contacts WHERE school_id = ?", [id]);
  if ((count?.n ?? 0) >= 30) return bad("بلغت الحد الأقصى لجهات الاتصال (30) لهذه المدرسة");

  const cid = uuid();
  const now = nowISO();
  await exec(
    `INSERT INTO school_contacts (id, school_id, role, name, phone, has_whatsapp, email, notes, created_by_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [cid, id, d.role, d.name, phone.value ?? null, wa(d.hasWhatsapp), d.email || null, d.notes || null, session.userId, now, now]
  );
  await auditLog({ userId: session.userId, action: "SCHOOL_CONTACT_ADDED", entityType: "School", entityId: id, newValues: { contactId: cid, role: d.role }, ipAddress: clientIp(request) });
  return NextResponse.json({ id: cid, message: "أُضيفت جهة الاتصال" }, { status: 201 });
}
