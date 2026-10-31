/**
 * تنبيهات يومية تلقائية لدورة التحسين — تعمل عند أول استخدام للمنصة في اليوم دون حاجة لجدولة خارجية:
 *  - خطة تجاوزت موعدها ← تنبيه للمدرسة.
 *  - خطة يحين موعدها خلال 3 أيام ← تذكير للمدرسة.
 *  - تحسّن ينتظر الاعتماد أكثر من 3 أيام ← تذكير للإدارة.
 */
import { exec, nowISO, query, queryOne } from "./db/sqlite";
import { notify, schoolUsers } from "./notify";
import { reviewersOf, SCHOOL_ROLES } from "./self-assessment";

const KEY = "reminders.selfAssessment.lastRun";

export async function runDailyReminders(today = new Date().toISOString().slice(0, 10)): Promise<boolean> {
  try {
    const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    if (row && JSON.parse(row.value) === today) return false;
    await exec(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [KEY, JSON.stringify(today), nowISO()]
    );

    const soon = new Date(Date.parse(today) + 3 * 86400_000).toISOString().slice(0, 10);
    const plans = await query<{ school_id: string; overdue: number; due_soon: number }>(
      `SELECT a.school_id,
              SUM(CASE WHEN i.plan_due_date < ? THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN i.plan_due_date >= ? AND i.plan_due_date <= ? THEN 1 ELSE 0 END) AS due_soon
       FROM self_assessment_items i JOIN self_assessments a ON a.id = i.assessment_id
       WHERE i.improvement_status IN ('PLANNED', 'IN_PROGRESS') AND i.plan_due_date IS NOT NULL
       GROUP BY a.school_id`,
      [today, today, soon]
    );
    for (const p of plans) {
      const users = await schoolUsers(p.school_id, SCHOOL_ROLES);
      if (Number(p.overdue) > 0) {
        await notify(users, "خطط تحسين متأخرة", `لديكم ${p.overdue} خطة تحسين تجاوزت موعدها. حدّث حالتها أو عدّل موعدها.`, { type: "DANGER", link: "/self-assessment" });
      }
      if (Number(p.due_soon) > 0) {
        await notify(users, "اقتراب موعد خطط التحسين", `يحين موعد ${p.due_soon} خطة تحسين خلال 3 أيام.`, { type: "WARNING", link: "/self-assessment" });
      }
    }

    const cutoff = new Date(Date.parse(today) - 3 * 86400_000).toISOString();
    const waiting = await query<{ school_id: string; name: string; n: number }>(
      `SELECT a.school_id, s.name, COUNT(*) n FROM self_assessment_items i
       JOIN self_assessments a ON a.id = i.assessment_id JOIN schools s ON s.id = a.school_id
       WHERE i.improvement_status = 'IMPROVED' AND i.improved_at < ? GROUP BY a.school_id, s.name`,
      [cutoff]
    );
    for (const w of waiting) {
      await notify(await reviewersOf(w.school_id), "تحسّن ينتظر اعتمادك", `${w.name}: ${w.n} مؤشر أعلنت المدرسة تحسّنه منذ أكثر من 3 أيام.`, { type: "INFO", link: `/self-assessment?schoolId=${w.school_id}` });
    }
    return true;
  } catch {
    return false;
  }
}
