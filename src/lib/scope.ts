/**
 * نطاق الرؤية المركزي: مصدر وحيد لتحديد المدارس التي يستطيع كل مستخدم رؤيتها.
 * يُستخدم في كل مسارات الخادم لمنع التسريب بين المديريات والمدارس.
 * كل القيم تُمرَّر كمعاملات مربوطة (parameters) — لا دمج نصوص في SQL.
 */
import { queryOne } from "./db/sqlite";

export type ScopeUser = {
  userId: string;
  roleKey: string;
  schoolId: string | null;
  directorateId: string | null;
};

export type Clause = { sql: string; params: unknown[] };

const NONE: Clause = { sql: "1 = 0", params: [] };

/** شرط SQL على جدول المدارس (بالاسم المستعار alias). */
export function schoolScope(user: ScopeUser, alias = "s"): Clause {
  switch (user.roleKey) {
    case "SUPER_ADMIN":
      return { sql: "1 = 1", params: [] };
    case "EDUCATION_DIRECTOR":
      if (!user.directorateId) return NONE;
      return { sql: `${alias}.directorate_id = ?`, params: [user.directorateId] };
    case "INSPECTOR": {
      const assigned = queryOne<{ n: number }>(
        "SELECT COUNT(*) n FROM school_assignments WHERE user_id = ?",
        [user.userId]
      )?.n ?? 0;
      const parts = [
        `${alias}.id IN (SELECT school_id FROM school_assignments WHERE user_id = ?)`,
        `${alias}.id IN (SELECT school_id FROM visits WHERE inspector_id = ?)`,
      ];
      const params: unknown[] = [user.userId, user.userId];
      // عند غياب أي إسناد صريح يرى المفتش مدارس مديريته
      if (assigned === 0 && user.directorateId) {
        parts.push(`${alias}.directorate_id = ?`);
        params.push(user.directorateId);
      }
      return { sql: `(${parts.join(" OR ")})`, params };
    }
    case "SCHOOL_PRINCIPAL":
    case "QUALITY_COORDINATOR":
    case "TEACHER":
      if (!user.schoolId) return NONE;
      return { sql: `${alias}.id = ?`, params: [user.schoolId] };
    case "PARENT":
      return {
        sql: `${alias}.id IN (
          SELECT st.school_id FROM students st
          JOIN parent_student ps ON ps.student_id = st.id
          JOIN parents p ON p.id = ps.parent_id
          WHERE p.user_id = ?)`,
        params: [user.userId],
      };
    default:
      return NONE;
  }
}

/** هل يستطيع المستخدم الوصول إلى مدرسة معينة؟ */
export function canAccessSchool(user: ScopeUser, schoolId: string): boolean {
  if (!schoolId) return false;
  const c = schoolScope(user, "s");
  const row = queryOne<{ n: number }>(
    `SELECT COUNT(*) n FROM schools s WHERE s.id = ? AND ${c.sql}`,
    [schoolId, ...c.params]
  );
  return (row?.n ?? 0) > 0;
}

/** هل يستطيع المستخدم الوصول إلى زيارة؟ (عبر مدرسة الزيارة، ومفتش الزيارة دائماً). */
export function canAccessVisit(user: ScopeUser, visitId: string): boolean {
  const v = queryOne<{ school_id: string; inspector_id: string }>(
    "SELECT school_id, inspector_id FROM visits WHERE id = ?",
    [visitId]
  );
  if (!v) return false;
  if (user.roleKey === "INSPECTOR" && v.inspector_id === user.userId) return true;
  return canAccessSchool(user, v.school_id);
}

/** الأدوار التي تنفّذ التقييم الميداني. */
export const EVALUATOR_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];
/** الأدوار التي ترى كل شيء ضمن مدرستها (مدرسة). */
export const SCHOOL_STAFF_ROLES = ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];
