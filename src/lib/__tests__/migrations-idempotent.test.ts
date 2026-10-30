import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, runMigrations, type MigrationRunner } from "@/lib/db/migrations";
import { SCHEMA_SQL } from "@/lib/db/schema.generated";

function runner(db: Database.Database): MigrationRunner {
  return {
    all: async <T,>(sql: string) => db.prepare(sql).all() as T[],
    script: async (sql: string) => {
      db.exec(sql);
    },
    inTransaction: async (fn) => {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

const columns = (db: Database.Database, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("الترحيلات آمنة لإعادة التشغيل", () => {
  it("تعمل على قاعدة أنشأتها نسخة سابقة أضافت بعض الأعمدة بنفسها", async () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    // أعمدة كانت تضيفها نسخة سابقة من المنصة عند التشغيل
    db.exec("ALTER TABLE evidence ADD COLUMN indicator_id TEXT");
    await expect(runMigrations(runner(db))).resolves.toBe(MIGRATIONS.length);
    expect(columns(db, "evidence").filter((c) => c === "indicator_id")).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) n FROM schema_migrations").get() as { n: number }).n).toBe(MIGRATIONS.length);
  });

  it("تُكمل ترحيلاً انقطع في منتصفه دون خطأ «عمود مكرر»", async () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    // محاكاة تطبيق جزئي لأول ترحيل (كما قد يحدث على libSQL حيث لا تُلفّ ALTER بمعاملة)
    const firstAlters = MIGRATIONS[0].sql.match(/ALTER TABLE \w+ ADD COLUMN [^;]*;/g)!.slice(0, 3);
    for (const s of firstAlters) db.exec(s);
    await expect(runMigrations(runner(db))).resolves.toBe(MIGRATIONS.length);
    // تشغيل ثانٍ لا يفعل شيئاً
    await expect(runMigrations(runner(db))).resolves.toBe(0);
  });
});
