import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, type MigrationRunner } from "@/lib/db/migrations";
import { SCHEMA_SQL } from "@/lib/db/schema.generated";

function runner(db: Database.Database): MigrationRunner {
  return {
    all: async <T,>(sql: string) => db.prepare(sql).all() as T[],
    script: async (sql: string) => { db.exec(sql); },
    inTransaction: async (fn) => {
      db.exec("BEGIN");
      try { await fn(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

const one = <T,>(db: Database.Database, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;

function base() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  const role = db.prepare("INSERT INTO roles (id, key, name, permissions, is_system) VALUES (?,?,?,?,1)");
  role.run("r-admin", "SUPER_ADMIN", "مدير النظام", '{"all":true}');
  role.run("r-insp", "INSPECTOR", "المفتش", "{}");
  db.exec("INSERT INTO governorates (id, name, code) VALUES ('g','الحديدة','H')");
  db.exec("INSERT INTO directorates (id, name, code, governorate_id) VALUES ('d','الجراحي','J','g')");
  const school = db.prepare("INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage) VALUES (?,?,?,'g','d','حكومية','أساسي')");
  school.run("s-demo", "RIFAD-DEMO-001", "مدرسة توضيحية");
  school.run("s-real", "REAL-001", "مدرسة حقيقية");
  const user = db.prepare("INSERT INTO users (id, name, email, password_hash, role_id) VALUES (?,?,?,?,?)");
  user.run("u-demo-admin", "مدير توضيحي", "admin@rifad.demo", "h", "r-admin");
  user.run("u-demo-insp", "مفتش توضيحي", "inspector@rifad.demo", "h", "r-insp");
  db.prepare("INSERT INTO visits (id, school_id, inspector_id, type, status, scheduled_at) VALUES (?,?,?,?,?,datetime('now'))").run("v-demo", "s-demo", "u-demo-insp", "PERIODIC", "COMPLETED");
  db.prepare("INSERT INTO visits (id, school_id, inspector_id, type, status, scheduled_at) VALUES (?,?,?,?,?,datetime('now'))").run("v-real", "s-real", "u-demo-insp", "PERIODIC", "SCHEDULED");
  return db;
}

describe("ترحيل 15: حذف البيانات التوضيحية", () => {
  it("يحذف المدارس التوضيحية وتوابعها ويبقي الحقيقية، ويبقي مدير النظام التوضيحي إن كان الوحيد", async () => {
    const db = base();
    await runMigrations(runner(db));
    expect(one<{ n: number }>(db, "SELECT COUNT(*) n FROM schools WHERE code LIKE 'RIFAD-DEMO-%'").n).toBe(0);
    expect(one<{ n: number }>(db, "SELECT COUNT(*) n FROM schools WHERE id = 's-real'").n).toBe(1);
    expect(one<{ n: number }>(db, "SELECT COUNT(*) n FROM visits WHERE id = 'v-demo'").n).toBe(0);
    expect(one<{ deleted_at: string | null }>(db, "SELECT deleted_at FROM users WHERE id = 'u-demo-insp'").deleted_at).not.toBeNull();
    // لا مدير غيره: يبقى ليمكن الدخول
    expect(one<{ deleted_at: string | null; is_active: number }>(db, "SELECT deleted_at, is_active FROM users WHERE id = 'u-demo-admin'")).toMatchObject({ deleted_at: null, is_active: 1 });
  });

  it("يحذف مدير النظام التوضيحي عند وجود مدير حقيقي", async () => {
    const db = base();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role_id) VALUES (?,?,?,?,?)").run("u-real", "مدير حقيقي", "head@school.ye", "h", "r-admin");
    await runMigrations(runner(db));
    expect(one<{ deleted_at: string | null }>(db, "SELECT deleted_at FROM users WHERE id = 'u-demo-admin'").deleted_at).not.toBeNull();
    expect(one<{ is_active: number }>(db, "SELECT is_active FROM users WHERE id = 'u-real'").is_active).toBe(1);
  });
});
