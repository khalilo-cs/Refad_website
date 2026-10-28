/**
 * طبقة الوصول إلى قاعدة بيانات منصة رِفاد (SQLite عبر better-sqlite3).
 *
 * ملاحظة هندسية: المخطط الرئيسي للمنصة مصمم لـ PostgreSQL (انظر prisma/schema.prisma).
 * في بيئة التطوير والعرض التوضيحي يُستخدم SQLite كملف محلي عبر better-sqlite3 لأن
 * بيئة التشغيل الحالية لا تسمح بتثبيت خادم PostgreSQL خارجي. نفس نموذج البيانات
 يُنقل إلى PostgreSQL بتغيير سلسلة الاتصال ومُشغل الاستعلامات فقط.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

export type Db = Database.Database;

let dbInstance: Db | null = null;

export function getDb(): Db {
  if (dbInstance) return dbInstance;
  const dir = process.env.SQLITE_DIR ?? process.cwd();
  const file = process.env.DATABASE_FILE ?? "dev.db";
  const dbPath = path.resolve(dir, file);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * ينشئ معرفًا فريدًا من النوع UUID.
 */
export function uuid(): string {
  return randomUUID();
}

/**
 * الوقت الحالي بصيغة ISO للتخزين في SQLite.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * تحويل قيمة إلى صيغة قابلة للتخزين في عمود JSON (نص).
 */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T = unknown>(text: string | null): T | null {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * تنفيذ استعلام قراءة يعيد صفوفًا متعددة.
 */
export function query<T = unknown>(
  sql: string,
  params: unknown[] = []
): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/**
 * تنفيذ استعلام قراءة يعيد صفًا واحدًا.
 */
export function queryOne<T = unknown>(
  sql: string,
  params: unknown[] = []
): T | null {
  const row = getDb().prepare(sql).get(...params);
  return row ? (row as T) : null;
}

/**
 * تنفيذ أمر تعديل (INSERT/UPDATE/DELETE) وإعادة عدد الصفوف المتأثرة ومعرّف الإدراج.
 */
export function exec(
  sql: string,
  params: unknown[] = []
): { changes: number; lastInsertId: string | number | null } {
  const info = getDb().prepare(sql).run(...params);
  return { changes: info.changes, lastInsertId: (info.lastInsertRowid as number | string) };
}

/**
 * تنفيذ عدّة أوامر ضمن معاملة واحدة.
 */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/**
 * تهيئة قاعدة البيانات من ملف المخطط وبذر البيانات الأولية.
 */
export async function initDatabase(opts?: { seed?: boolean }): Promise<void> {
  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = getDb();
  db.exec(schema);

  if (opts?.seed) {
    const { seedDatabase } = await import("./seed-sqlite");
    await seedDatabase(db);
  }
}
