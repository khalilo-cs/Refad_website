import { query, queryOne } from "./db/sqlite";

export const arr = (raw: unknown): string[] => {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
};

type U = { userId: string; roleKey: string; schoolId: string | null; directorateId: string | null };

/** مدارس ومديريات المستخدم لأغراض الاستهداف (ولي الأمر: مدارس أبنائه). */
export async function userTargets(session: U) {
  const schools = new Set<string>();
  const dirs = new Set<string>();
  if (session.schoolId) schools.add(session.schoolId);
  if (session.directorateId) dirs.add(session.directorateId);
  if (session.roleKey === "PARENT") {
    for (const r of await query<{ school_id: string }>(
      `SELECT DISTINCT st.school_id FROM students st JOIN parent_student ps ON ps.student_id = st.id JOIN parents p ON p.id = ps.parent_id WHERE p.user_id = ?`, [session.userId])) schools.add(r.school_id);
  }
  for (const sid of schools) {
    const d = await queryOne<{ directorate_id: string }>("SELECT directorate_id FROM schools WHERE id = ?", [sid]);
    if (d) dirs.add(d.directorate_id);
  }
  return { schools: [...schools], dirs: [...dirs] };
}

/** هل الإعلان موجَّه لهذا المستخدم؟ (الفارغ = الجميع) */
export function targets(a: { audience_roles: string[]; school_ids: string[]; directorate_ids: string[] }, role: string, t: { schools: string[]; dirs: string[] }) {
  if (a.audience_roles.length && !a.audience_roles.includes(role)) return false;
  if (a.school_ids.length && !a.school_ids.some((s) => t.schools.includes(s))) return false;
  if (a.directorate_ids.length && !a.directorate_ids.some((d) => t.dirs.includes(d))) return false;
  return true;
}

/** الإعلانات المنشورة غير المنتهية الموجَّهة للمستخدم. */
export async function publishedFor(session: U, limit = 8) {
  const t = await userTargets(session);
  return (await query<any>(
    `SELECT a.id, a.title, a.content, a.audience_roles, a.directorate_ids, a.school_ids, a.published_at
     FROM announcements a WHERE a.published_at IS NOT NULL AND (a.expires_at IS NULL OR datetime(a.expires_at) >= datetime('now'))
     ORDER BY a.published_at DESC LIMIT 200`))
    .filter((a) => targets({ audience_roles: arr(a.audience_roles), school_ids: arr(a.school_ids), directorate_ids: arr(a.directorate_ids) }, session.roleKey, t))
    .slice(0, limit)
    .map((a) => ({ id: a.id, title: a.title, content: a.content, published_at: a.published_at }));
}
