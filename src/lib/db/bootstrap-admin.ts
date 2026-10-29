/**
 * إنشاء حساب المسؤول الأول من متغيرات البيئة على الاستضافات التي لا تتيح
 * الوصول إلى صفحة /setup قبل النشر. يُنصح بحذف المتغيرات بعد أول دخول.
 */
import bcrypt from "bcryptjs";
import { exec, queryOne, uuid, nowISO } from "./sqlite";
import { validatePassword } from "../auth";

type BootstrapOptions = {
  email?: string;
  password?: string;
  name?: string;
  force?: boolean;
};


export async function ensureBootstrapAdmin(
  options: BootstrapOptions = {}
): Promise<void> {
  const email = (options.email ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const password = options.password ?? process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const name = (options.name ?? process.env.BOOTSTRAP_ADMIN_NAME ?? "مسؤول النظام")
    .trim()
    .slice(0, 120);
  const force =
    options.force ?? (process.env.BOOTSTRAP_ADMIN_FORCE === "1" ? true : false);

  if (!email || !password) return;
  if (!validatePassword(password).ok) {
    console.warn("BOOTSTRAP_ADMIN_PASSWORD لا يحقق سياسة كلمات المرور؛ لم يُنشأ حساب المسؤول.");
    return;
  }

  const role = await queryOne<{ id: string }>(
    "SELECT id FROM roles WHERE key = ?",
    ["SUPER_ADMIN"]
  );
  if (!role) return;

  const existing = await queryOne<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE lower(email) = ?",
    [email]
  );

  const passwordHash = await bcrypt.hash(password, 12);
  const timestamp = nowISO();

  if (existing) {
    if (!force) return;
    await exec(
      `UPDATE users
          SET password_hash = ?, role_id = ?, name = ?, is_active = 1,
              is_locked = 0, locked_reason = NULL, failed_login = 0,
              token_version = token_version + 1, updated_at = ?
        WHERE id = ?`,
      [passwordHash, role.id, name, timestamp, existing.id]
    );
    await exec(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        existing.id,
        "BOOTSTRAP_ADMIN",
        "User",
        existing.id,
        JSON.stringify({ email, mode: "update" }),
        timestamp,
      ]
    );
    return;
  }

  const id = uuid();
  await exec(
    `INSERT INTO users (id, name, email, password_hash, role_id, is_active, is_locked, token_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`,
    [id, name, email, passwordHash, role.id, timestamp, timestamp]
  );
  await exec(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      id,
      "BOOTSTRAP_ADMIN",
      "User",
      id,
      JSON.stringify({ email, mode: "create" }),
      timestamp,
    ]
  );
}
