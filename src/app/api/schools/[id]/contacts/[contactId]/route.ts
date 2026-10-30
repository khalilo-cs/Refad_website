import { NextRequest, NextResponse } from "next/server";
import { auditLog, getServerSession } from "@/lib/auth";
import { queryOne, exec, nowISO } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";
import { normalizePhoneField, wa } from "@/lib/school-input";
import { clientIp } from "@/lib/security";
import { canEditContacts, contactSchema } from "@/lib/school-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400, extra: object = {}) => NextResponse.json({ message, ...extra }, { status });

async function load(schoolId: string, contactId: string) {
  return queryOne<{ id: string }>("SELECT id FROM school_contacts WHERE id = ? AND school_id = ?", [contactId, schoolId]);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!canEditContacts(session)) return bad("لا تملك صلاحية تعديل جهات الاتصال", 403);
  const { id, contactId } = await params;
  if (!(await canAccessSchool(session, id))) return bad("المدرسة خارج نطاق صلاحيتك", 403);
  if (!(await load(id, contactId))) return bad("جهة الاتصال غير موجودة", 404);

  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة", 400, { errors: parsed.error.flatten().fieldErrors });
  const d = parsed.data;
  const phone = normalizePhoneField(d.phone ?? null, d.allowInvalidPhone === true);
  if (phone.error) return bad(phone.error, 400, { invalidPhone: true, errors: { phone: [phone.error] } });

  await exec(
    "UPDATE school_contacts SET role = ?, name = ?, phone = ?, has_whatsapp = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?",
    [d.role, d.name, phone.value ?? null, wa(d.hasWhatsapp), d.email || null, d.notes || null, nowISO(), contactId]
  );
  await auditLog({ userId: session.userId, action: "SCHOOL_CONTACT_UPDATED", entityType: "School", entityId: id, newValues: { contactId }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حفظ جهة الاتصال" });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!canEditContacts(session)) return bad("لا تملك صلاحية تعديل جهات الاتصال", 403);
  const { id, contactId } = await params;
  if (!(await canAccessSchool(session, id))) return bad("المدرسة خارج نطاق صلاحيتك", 403);
  if (!(await load(id, contactId))) return bad("جهة الاتصال غير موجودة", 404);
  await exec("DELETE FROM school_contacts WHERE id = ?", [contactId]);
  await auditLog({ userId: session.userId, action: "SCHOOL_CONTACT_DELETED", entityType: "School", entityId: id, oldValues: { contactId }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "حُذفت جهة الاتصال" });
}
