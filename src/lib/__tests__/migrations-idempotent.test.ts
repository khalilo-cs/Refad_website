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

describe("ترحيل الأدوار 14: مشرف المحافظة وحذف ولي الأمر ومدير الإدارة", () => {
  it("يحوّل مدير الإدارة إلى مشرف محافظة، ويحذف حساب ولي الأمر حذفاً منطقياً، ويزيل الدورين", async () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const role = db.prepare("INSERT INTO roles (id, key, name, permissions, is_system) VALUES (?,?,?,?,1)");
    role.run("r-ed", "EDUCATION_DIRECTOR", "مدير الإدارة", "{}");
    role.run("r-p", "PARENT", "ولي الأمر", "{}");
    role.run("r-g", "GUEST", "زائر", "{}");
    role.run("r-qc", "QUALITY_COORDINATOR", "مديرة قسم الجودة", "{}");
    const user = db.prepare("INSERT INTO users (id, name, email, password_hash, role_id) VALUES (?,?,?,?,?)");
    user.run("u-ed", "مدير إدارة", "ed@x.test", "h", "r-ed");
    user.run("u-p", "ولي أمر", "p@x.test", "h", "r-p");
    db.prepare("INSERT INTO parents (id, name, user_id) VALUES ('par1', 'ولي أمر', 'u-p')").run();

    await runMigrations(runner(db));

    const get = (id: string) => db.prepare("SELECT u.*, r.key AS role_key FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?").get(id) as any;
    const ed = get("u-ed");
    expect(ed.role_key).toBe("GOVERNORATE_SUPERVISOR");
    expect(ed.is_active).toBe(1);
    expect(ed.token_version).toBe(2);
    const p = get("u-p");
    expect(p.deleted_at).toBeTruthy();
    expect(p.is_active).toBe(0);
    expect(p.email).toBe("deleted-u-p@deleted.invalid");
    expect(p.role_key).toBe("GUEST");
    expect((db.prepare("SELECT user_id FROM parents WHERE id = 'par1'").get() as any).user_id).toBeNull();
    const keys = (db.prepare("SELECT key FROM roles").all() as { key: string }[]).map((r) => r.key);
    expect(keys).not.toContain("EDUCATION_DIRECTOR");
    expect(keys).not.toContain("PARENT");
    expect(keys).toContain("GOVERNORATE_SUPERVISOR");
    expect((db.prepare("SELECT name FROM roles WHERE key = 'QUALITY_COORDINATOR'").get() as any).name).toBe("منسق الجودة بالمدرسة");
  });
});
