import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_PASSWORD, EMAILS, setupTestDb } from "@/test/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

let q: typeof import("@/lib/db/sqlite");

beforeAll(async () => {
  ({ db: q } = await setupTestDb());
});

afterAll(() => {
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
});

describe("الدخول بالبريد دون حساسية لحالة الأحرف", () => {
  it("يقبل البريد بأحرف كبيرة ومسافات زائدة", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    const r = await authenticateUser(`  ${EMAILS.admin.toUpperCase()} `, DEMO_PASSWORD);
    expect(r.ok).toBe(true);
  });
});

describe("إنشاء المسؤول من متغيرات البيئة", () => {
  it("يرفض كلمة مرور قصيرة أو بلا أرقام ولا ينشئ حساباً", async () => {
    const { ensureBootstrapAdmin } = await import("@/lib/db/bootstrap-admin");
    await ensureBootstrapAdmin({ email: "weak@example.org", password: "Ab12345" });
    await ensureBootstrapAdmin({ email: "weak@example.org", password: "OnlyLettersHere" });
    expect(await q.queryOne("SELECT id FROM users WHERE email = 'weak@example.org'")).toBeNull();
  });

  it("يقبل كلمة مرور مالك الاستضافة بصيغة حرف وأرقام متتالية", async () => {
    const { ensureBootstrapAdmin } = await import("@/lib/db/bootstrap-admin");
    await ensureBootstrapAdmin({ email: "Site.Owner@Example.org", password: "Xy987654321" });
    const { authenticateUser } = await import("@/lib/auth");
    expect((await authenticateUser("site.owner@example.org", "Xy987654321")).ok).toBe(true);
  });

  it("ينشئ حساب مدير المنصة مرة واحدة ويسجّل ذلك في سجل التدقيق", async () => {
    const { ensureBootstrapAdmin } = await import("@/lib/db/bootstrap-admin");
    await ensureBootstrapAdmin({ email: "Owner@Example.org", password: "Strong-Pass-2026x" });
    await ensureBootstrapAdmin({ email: "owner@example.org", password: "Another-Pass-2026y" });
    const u = await q.queryOne<{ id: string; role_key: string }>(
      "SELECT u.id, r.key AS role_key FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = 'owner@example.org'"
    );
    expect(u?.role_key).toBe("SUPER_ADMIN");
    const { authenticateUser } = await import("@/lib/auth");
    expect((await authenticateUser("owner@example.org", "Strong-Pass-2026x")).ok).toBe(true);
    expect((await authenticateUser("owner@example.org", "Another-Pass-2026y")).ok).toBe(false);
    const log = await q.queryOne<{ n: number }>("SELECT COUNT(*) n FROM audit_logs WHERE action = 'BOOTSTRAP_ADMIN' AND entity_id = ?", [u!.id]);
    expect(Number(log?.n)).toBe(1);
  });
});

describe("المعاملات", () => {
  it("تُلغى كل أوامر المعاملة عند الفشل", async () => {
    await expect(
      q.transaction(async () => {
        await q.exec("INSERT INTO settings (key, value) VALUES ('tx.test', '1')");
        throw new Error("فشل مقصود");
      })
    ).rejects.toThrow("فشل مقصود");
    expect(await q.queryOne("SELECT key FROM settings WHERE key = 'tx.test'")).toBeNull();
  });

  it("الكتابات المتزامنة خارج المعاملة لا تدخل فيها", async () => {
    const outside = q.transaction(async () => {
      await q.exec("INSERT INTO settings (key, value) VALUES ('tx.inner', '1')");
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("إلغاء");
    });
    const concurrent = q.exec("INSERT INTO settings (key, value) VALUES ('tx.outer', '1')");
    await expect(outside).rejects.toThrow();
    await concurrent;
    expect(await q.queryOne("SELECT key FROM settings WHERE key = 'tx.inner'")).toBeNull();
    expect(await q.queryOne("SELECT key FROM settings WHERE key = 'tx.outer'")).not.toBeNull();
  });
});

describe("حماية الاستضافة بلا قرص", () => {
  it("يرمي خطأً عربياً واضحاً عند غياب قاعدة بيانات على Vercel", async () => {
    vi.resetModules();
    const saved = { ...process.env };
    process.env.VERCEL = "1";
    delete process.env.TURSO_DATABASE_URL;
    try {
      const fresh = await import("@/lib/db/sqlite");
      const err = await fresh.query("SELECT 1").catch((e) => e);
      expect(fresh.isDbNotConfigured(err)).toBe(true);
      expect(String(err.message)).toContain("TURSO_DATABASE_URL");
    } finally {
      process.env = saved;
    }
  });

  it("المخطط المضمَّن مطابق لملف المخطط المصدري", async () => {
    const fs = await import("fs");
    const { SCHEMA_SQL } = await import("@/lib/db/schema.generated");
    expect(SCHEMA_SQL).toBe(fs.readFileSync("prisma/schema.sql", "utf8"));
  });
});
