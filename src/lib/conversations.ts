import { query, queryOne } from "./db/sqlite";
import { canAccessSchool, type ScopeUser } from "./scope";

export const KINDS: Record<string, string> = {
  OFFICIAL: "مراسلة رسمية",
  INQUIRY: "استفسار / رد",
  PARENT_CHANNEL: "قناة أولياء الأمور",
  GENERAL: "عام",
};

type Actor = ScopeUser & { userId: string };

/** المستخدمون الذين يستطيع الفاعل مراسلتهم داخل مدرسة معيّنة (بحسب علاقته بها). */
export function allowedRecipients(actor: Actor, schoolId: string): { id: string; name: string; role: string; roleKey: string }[] {
  if (!canAccessSchool(actor, schoolId) && actor.roleKey !== "PARENT") return [];
  const school = queryOne<{ directorate_id: string }>("SELECT directorate_id FROM schools WHERE id = ?", [schoolId]);
  if (!school) return [];
  const staff = (keys: string[]) =>
    query<any>(
      `SELECT u.id, u.name, r.name AS role, r.key AS roleKey FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = 1 AND u.school_id = ? AND r.key IN (${keys.map(() => "?").join(",")}) ORDER BY u.name`, [schoolId, ...keys]);
  const admin = () =>
    query<any>(
      `SELECT DISTINCT u.id, u.name, r.name AS role, r.key AS roleKey FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = 1 AND ((r.key = 'EDUCATION_DIRECTOR' AND u.directorate_id = ?) OR r.key = 'SUPER_ADMIN'
         OR (r.key = 'INSPECTOR' AND (u.id IN (SELECT user_id FROM school_assignments WHERE school_id = ?) OR u.id IN (SELECT inspector_id FROM visits WHERE school_id = ?))))
       ORDER BY u.name`, [school.directorate_id, schoolId, schoolId]);

  switch (actor.roleKey) {
    case "SUPER_ADMIN":
    case "EDUCATION_DIRECTOR":
    case "INSPECTOR":
      return staff(["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"]);
    case "SCHOOL_PRINCIPAL":
    case "QUALITY_COORDINATOR":
      return [
        ...admin(),
        ...staff(["TEACHER", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"]),
        ...query<any>(
          `SELECT DISTINCT u.id, u.name || ' (ولي أمر)' AS name, 'ولي أمر' AS role, 'PARENT' AS roleKey FROM users u JOIN parents p ON p.user_id = u.id
           JOIN parent_student ps ON ps.parent_id = p.id JOIN students st ON st.id = ps.student_id WHERE st.school_id = ? AND u.is_active = 1`, [schoolId]),
      ].filter((u) => u.id !== actor.userId);
    case "TEACHER":
      return staff(["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"]);
    case "PARENT": {
      const mine = queryOne<{ n: number }>(
        `SELECT COUNT(*) n FROM students st JOIN parent_student ps ON ps.student_id = st.id JOIN parents p ON p.id = ps.parent_id WHERE p.user_id = ? AND st.school_id = ?`, [actor.userId, schoolId])?.n ?? 0;
      return mine ? staff(["SCHOOL_PRINCIPAL"]) : [];
    }
    default:
      return [];
  }
}

/** مدارس يستطيع الفاعل إنشاء مراسلات بشأنها. */
export function messagingSchools(actor: Actor): { id: string; name: string }[] {
  if (actor.roleKey === "PARENT")
    return query<any>(`SELECT DISTINCT s.id, s.name FROM schools s JOIN students st ON st.school_id = s.id JOIN parent_student ps ON ps.student_id = st.id JOIN parents p ON p.id = ps.parent_id WHERE p.user_id = ?`, [actor.userId]);
  if (["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"].includes(actor.roleKey) && actor.schoolId)
    return query<any>("SELECT id, name FROM schools WHERE id = ?", [actor.schoolId]);
  return [];
}
