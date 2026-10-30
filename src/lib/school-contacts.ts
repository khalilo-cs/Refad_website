import { z } from "zod";

export const CONTACT_STAFF_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];

export { CONTACT_ROLES } from "./school-contacts-shared";

export const contactSchema = z.object({
  role: z.string().trim().min(2, "المسمى مطلوب").max(60),
  name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  hasWhatsapp: z.boolean().optional(),
  allowInvalidPhone: z.boolean().optional(),
  email: z.string().trim().email("بريد إلكتروني غير صالح").max(120).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(500).optional().nullable(),
});

/** من يعدّل جهات الاتصال: الإدارة، ومدير المدرسة المخوَّل بتعديل ملف مدرسته. */
export function canEditContacts(session: { roleKey: string; permissions?: Record<string, unknown> }): boolean {
  if (["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(session.roleKey)) return true;
  return session.roleKey === "SCHOOL_PRINCIPAL" && (session.permissions?.manageSchoolProfile === true || session.permissions?.all === true);
}
