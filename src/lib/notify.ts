import { exec, query, uuid } from "./db/sqlite";

/** ينشئ إشعاراً داخلياً لمستخدم أو أكثر. لا يرمي أخطاء حتى لا يعطّل العملية الأصلية. */
export async function notify(
  userIds: (string | null | undefined)[],
  title: string,
  body: string,
  opts: { type?: "INFO" | "SUCCESS" | "WARNING" | "DANGER"; link?: string } = {}
): Promise<void> {
  const unique = [...new Set(userIds.filter((x): x is string => !!x))];
  for (const id of unique) {
    try {
      await exec(
        "INSERT INTO notifications (id, user_id, title, body, type, link) VALUES (?,?,?,?,?,?)",
        [uuid(), id, title, body, opts.type ?? "INFO", opts.link ?? null]
      );
    } catch {
      /* لا يُعطّل التدفق الرئيسي */
    }
  }
}

/** معرّفات مستخدمي مدرسة بأدوار معيّنة. */
export async function schoolUsers(schoolId: string, roleKeys: string[]): Promise<string[]> {
  const marks = roleKeys.map(() => "?").join(",");
  return (await query<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.school_id = ? AND r.key IN (${marks}) AND u.is_active = 1`,
    [schoolId, ...roleKeys]
  )).map((r) => r.id);
}
