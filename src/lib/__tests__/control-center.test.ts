import { beforeAll, describe, expect, it, vi } from "vitest";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";
import { toVcf } from "../vcard";
import { toCsv } from "../csv";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let dq: { GET: () => Promise<Response> };
let dir: { GET: () => Promise<Response> };
const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  dq = (await import("@/app/api/admin/data-quality/route")) as any;
  dir = (await import("@/app/api/directory/route")) as any;
});

describe("مركز التحكم ودليل الاتصال", () => {
  it("جودة البيانات لمدير النظام فقط وتعدّ النواقص", async () => {
    await as(EMAILS.principal);
    expect((await dq.GET()).status).toBe(403);
    await as(EMAILS.admin);
    await q.exec("UPDATE schools SET latitude = NULL, longitude = NULL, contact_phone = 'abc' WHERE code = 'RIFAD-DEMO-001'");
    const d = await (await dq.GET()).json();
    expect(d.schools.noLocation.items.some((s: any) => s.code === "RIFAD-DEMO-001")).toBe(true);
    expect(d.schools.badPhone.items.some((s: any) => s.code === "RIFAD-DEMO-001")).toBe(true);
    expect(d.completeness.location).toBeLessThan(100);
  });
  it("الدليل مقيَّد بالدور والنطاق", async () => {
    await as(EMAILS.principal);
    expect((await dir.GET()).status).toBe(403);
    await as(EMAILS.admin);
    const all = await (await dir.GET()).json();
    expect(all.schools.length).toBeGreaterThan(0);
    await as(EMAILS.director);
    const scoped = await (await dir.GET()).json();
    const dirId = (await q.queryOne<any>("SELECT directorate_id FROM users WHERE email = ?", [EMAILS.director]))!.directorate_id;
    const ids = new Set((await q.query<any>("SELECT id FROM schools WHERE directorate_id = ?", [dirId])).map((r) => r.id));
    expect(scoped.schools.every((s: any) => ids.has(s.id))).toBe(true);
  });
});

describe("التصدير الآمن", () => {
  it("CSV يعطّل الصيغ ويهرب الفواصل", () => {
    const out = toCsv([["=HYPERLINK(\"x\")", "a,b", "عادي"]]);
    expect(out).toContain("'=HYPERLINK");
    expect(out).toContain('"a,b"');
  });
  it("vCard يتخطى الأرقام الخاطئة ويهرب الفواصل", () => {
    const v = toVcf([{ name: "أ, ب", phone: "738770724", org: "م" }, { name: "خطأ", phone: "12" }]);
    expect(v.match(/BEGIN:VCARD/g)).toHaveLength(1);
    expect(v).toContain("TEL;TYPE=CELL:+967738770724");
    expect(v).toContain("FN:أ\\, ب");
  });
});
