/**
 * مساعد اختبارات التكامل: ينشئ قاعدة SQLite مؤقتة مبذورة بالبيانات التوضيحية،
 * ويبني جلسات لأدوار المنصة من الصفوف الفعلية.
 * يجب استدعاء setupTestDb() قبل أي استيراد لوحدات قاعدة البيانات.
 */
import fs from "fs";
import os from "os";
import path from "path";
import type { UserSession } from "@/lib/auth";

export const DEMO_PASSWORD = "Test-Pass-Rifad-2026!x";

export async function setupTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rifad-test-"));
  process.env.SQLITE_DIR = dir;
  process.env.DATABASE_FILE = "test.db";
  process.env.UPLOAD_DIR = path.join(dir, "uploads");
  const db = await import("@/lib/db/sqlite");
  await db.initDatabase({ seed: true, demo: true, demoPassword: DEMO_PASSWORD });
  return { dir, db };
}

/** جلسة جاهزة لمستخدم تجريبي بحسب بريده. */
export async function sessionFor(email: string): Promise<UserSession> {
  const { queryOne } = await import("@/lib/db/sqlite");
  const u = queryOne<any>(
    `SELECT u.id, u.name, u.email, u.school_id, u.directorate_id, u.token_version, r.key AS role_key, r.name AS role_name, r.permissions
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`, [email]);
  if (!u) throw new Error("مستخدم غير موجود: " + email);
  return {
    userId: u.id, email: u.email, name: u.name, role: u.role_name, roleKey: u.role_key, schoolId: u.school_id,
    directorateId: u.directorate_id, tokenVersion: u.token_version, isActive: true, isLocked: false,
    permissions: JSON.parse(u.permissions || "{}"),
  };
}

export const EMAILS = {
  admin: "admin@rifad.demo", director: "director@rifad.demo", inspector: "inspector@rifad.demo",
  principal: "principal@rifad.demo", quality: "quality@rifad.demo", teacher: "teacher@rifad.demo", parent: "parent@rifad.demo",
};
