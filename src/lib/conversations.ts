import { query, queryOne } from "./db/sqlite";
import { canAccessSchool, type ScopeUser } from "./scope";

export const KINDS: Record<string, string> = {
  OFFICIAL: "مراسلة رسمية",
  INQUIRY: "استفسار / رد",
  GENERAL: "عام",
};

type Actor = ScopeUser & { userId: string };

/** المستخدمون الذين يستطيع الفاعل مراسلتهم داخل مدرسة معيّنة (بحسب علاقته بها). */
export async function allowedRecipients(actor: Actor, schoolId: string): Promise<{ id: string; name: string; role: string; roleKey: string }[]> {
  if (!await canAccessSchool(actor, schoolId)) return [];
  const school = await queryOne<{ directorate_id: string }>("SELECT directorate_id FROM schools WHERE id = ?", [schoolId]);
  if (!school) return [];
  const staff = async (keys: string[]) =>
    await query<any>(
      `SELECT u.id, u.name, r.name AS role, r.key AS roleKey FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = 1 AND u.school_id = ? AND r.key IN (${keys.map(() => "?").join(",")}) ORDER BY u.name`, [schoolId, ...keys]);
  const admin = async () =>
    await query<any>(
      `SELECT DISTINCT u.id, u.name, r.name AS role, r.key AS roleKey FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = 1 AND (r.key = 'SUPER_ADMIN'
         OR (r.key = 'INSPECTOR' AND (u.id IN (SELECT user_id FROM school_assignments WHERE school_id = ?) OR u.id IN (SELECT inspector_id FROM visits WHERE school_id = ?))))
       ORDER BY u.name`, [schoolId, schoolId]);

  switch (actor.roleKey) {
    case "SUPER_ADMIN":
    case "INSPECTOR":
      return staff(["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"]);
    case "SCHOOL_PRINCIPAL":
    case "QUALITY_COORDINATOR":
      return [
        ...(await admin()),
        ...(await staff(["TEACHER", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"])),
      ].filter((u) => u.id !== actor.userId);
    case "TEACHER":
      return staff(["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"]);
    default:
      return [];
  }
}

/** مدارس يستطيع الفاعل إنشاء مراسلات بشأنها. */
export async function messagingSchools(actor: Actor): Promise<{ id: string; name: string }[]> {
  if (["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"].includes(actor.roleKey) && actor.schoolId)
    return await query<any>("SELECT id, name FROM schools WHERE id = ?", [actor.schoolId]);
  return [];
}
