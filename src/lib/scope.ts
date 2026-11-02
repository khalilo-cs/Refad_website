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
export async function schoolScope(user: ScopeUser, alias = "s"): Promise<Clause> {
  switch (user.roleKey) {
    case "SUPER_ADMIN":
    case "GOVERNORATE_SUPERVISOR":
      return { sql: "1 = 1", params: [] };
    case "INSPECTOR":
      // المفتش يرى فقط المدارس التي أسندها إليه مدير النظام، ومدارس زياراته.
      return {
        sql: `(${alias}.id IN (SELECT school_id FROM school_assignments WHERE user_id = ?) OR ${alias}.id IN (SELECT school_id FROM visits WHERE inspector_id = ?))`,
        params: [user.userId, user.userId],
      };
    case "SCHOOL_PRINCIPAL":
    case "QUALITY_COORDINATOR":
    case "TEACHER":
      if (!user.schoolId) return NONE;
      return { sql: `${alias}.id = ?`, params: [user.schoolId] };
    default:
      return NONE;
  }
}

/** هل يستطيع المستخدم الوصول إلى مدرسة معينة؟ */
export async function canAccessSchool(user: ScopeUser, schoolId: string): Promise<boolean> {
  if (!schoolId) return false;
  const c = await schoolScope(user, "s");
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) n FROM schools s WHERE s.id = ? AND ${c.sql}`,
    [schoolId, ...c.params]
  );
  return (row?.n ?? 0) > 0;
}

/** هل يستطيع المستخدم الوصول إلى زيارة؟ (عبر مدرسة الزيارة، ومفتش الزيارة دائماً). */
export async function canAccessVisit(user: ScopeUser, visitId: string): Promise<boolean> {
  const v = await queryOne<{ school_id: string; inspector_id: string }>(
    "SELECT school_id, inspector_id FROM visits WHERE id = ?",
    [visitId]
  );
  if (!v) return false;
  if (user.roleKey === "INSPECTOR" && v.inspector_id === user.userId) return true;
  return canAccessSchool(user, v.school_id);
}

/** الأدوار التي تنفّذ التقييم الميداني. */
export const EVALUATOR_ROLES = ["SUPER_ADMIN", "INSPECTOR"];
/** الأدوار التي ترى كل شيء ضمن مدرستها (مدرسة). */
export const SCHOOL_STAFF_ROLES = ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];
/** مشرفو المحافظة: يطّلعون على كل المدارس ولا يعدّلون شيئاً (يُفرض ذلك أيضاً في الوسيط). */
export const READ_ONLY_ROLES = ["GOVERNORATE_SUPERVISOR"];
/** من يرى لوحات المتابعة والتقارير على مستوى كل المدارس. */
export const OVERSIGHT_ROLES = ["SUPER_ADMIN", "GOVERNORATE_SUPERVISOR"];
