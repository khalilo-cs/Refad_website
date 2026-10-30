import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

type Handler = (req: NextRequest, ctx?: any) => Promise<Response>;
let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let schools: Record<string, Handler>;
let schoolById: Record<string, Handler>;
let contacts: Record<string, Handler>;
let contactById: Record<string, Handler>;
let govId: string, dirId: string, schoolA: string, schoolB: string;

const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const json = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const idCtx = (id: string, extra: object = {}) => ({ params: Promise.resolve({ id, ...extra }) });

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  schools = (await import("@/app/api/schools/route")) as any;
  schoolById = (await import("@/app/api/schools/[id]/route")) as any;
  contacts = (await import("@/app/api/schools/[id]/contacts/route")) as any;
  contactById = (await import("@/app/api/schools/[id]/contacts/[contactId]/route")) as any;
  govId = (await q.queryOne<any>("SELECT id FROM governorates LIMIT 1"))!.id;
  dirId = (await q.queryOne<any>("SELECT id FROM directorates LIMIT 1"))!.id;
  schoolA = (await q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-001'"))!.id;
  schoolB = (await q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-002'"))!.id;
});

const newSchool = (over: object = {}) => ({
  code: "T-" + Math.random().toString(36).slice(2, 8), name: "مدرسة اختبار " + Math.random().toString(36).slice(2, 6),
  governorateId: govId, directorateId: dirId, type: "مختلط", stage: "أساسي", ...over,
});

describe("إضافة مدرسة: الهاتف والموقع", () => {
  it("يوحّد الهاتف ويحفظه بصيغته المعيارية مع علم الواتساب", async () => {
    await as(EMAILS.admin);
    const r = await json(await schools.POST(req("/api/schools", "POST", newSchool({ contactPhone: "+967 73 877 0724", hasWhatsapp: false }))));
    expect(r.status).toBe(201);
    const row = await q.queryOne<any>("SELECT contact_phone, has_whatsapp FROM schools WHERE id = ?", [r.body.school.id]);
    expect(row).toMatchObject({ contact_phone: "738770724", has_whatsapp: 0 });
  });

  it("يرفض الرقم الخاطئ برسالة واضحة، ويقبله إن سمح المستخدم", async () => {
    await as(EMAILS.admin);
    const bad = await json(await schools.POST(req("/api/schools", "POST", newSchool({ contactPhone: "7341234567" }))));
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain("أطول");
    expect(bad.body.invalidPhone).toBe(true);
    const ok = await json(await schools.POST(req("/api/schools", "POST", newSchool({ contactPhone: "7341234567", allowInvalidPhone: true }))));
    expect(ok.status).toBe(201);
  });

  it("يرفض الإحداثيات خارج اليمن أو المقلوبة، ويقبل الصحيحة ويسجّل مصدرها", async () => {
    await as(EMAILS.admin);
    const out = await json(await schools.POST(req("/api/schools", "POST", newSchool({ latitude: 24.71, longitude: 46.67 }))));
    expect(out.status).toBe(400);
    expect(out.body.message).toContain("خارج اليمن");
    const flipped = await json(await schools.POST(req("/api/schools", "POST", newSchool({ latitude: 43.0, longitude: 14.8 }))));
    expect(flipped.status).toBe(400);
    const half = await json(await schools.POST(req("/api/schools", "POST", newSchool({ latitude: 14.8 }))));
    expect(half.status).toBe(400);
    const ok = await json(await schools.POST(req("/api/schools", "POST", newSchool({ latitude: 14.80123456789, longitude: 43.0021, locationSource: "MAP_PICK" }))));
    expect(ok.status).toBe(201);
    const row = await q.queryOne<any>("SELECT latitude, longitude, location_source, location_updated_at FROM schools WHERE id = ?", [ok.body.school.id]);
    expect(row.latitude).toBe(14.801235);
    expect(row.location_source).toBe("MAP_PICK");
    expect(row.location_updated_at).toBeTruthy();
  });

  it("ينبّه عند وضع مدرسة على موقع مدرسة أخرى، ويمنع تكرار الاسم في المديرية", async () => {
    await as(EMAILS.admin);
    const first = await json(await schools.POST(req("/api/schools", "POST", newSchool({ latitude: 14.9, longitude: 43.1 }))));
    const second = await json(await schools.POST(req("/api/schools", "POST", newSchool({ latitude: 14.90002, longitude: 43.10002 }))));
    expect(second.status).toBe(201);
    expect(second.body.warnings.length).toBe(1);
    expect(second.body.warnings[0]).toContain("قريب جداً");
    const name = (await q.queryOne<any>("SELECT name FROM schools WHERE id = ?", [first.body.school.id]))!.name;
    const dup = await json(await schools.POST(req("/api/schools", "POST", newSchool({ name }))));
    expect(dup.status).toBe(409);
  });

  it("المفتش لا يضيف مدارس", async () => {
    await as(EMAILS.inspector);
    expect((await schools.POST(req("/api/schools", "POST", newSchool()))).status).toBe(403);
  });
});

describe("تعديل مدرسة: الموقع والواتساب", () => {
  it("المدير يحدّد الموقع ويمسحه، ومدير المدرسة لا يحدّد الموقع", async () => {
    await as(EMAILS.admin);
    const set = await json(await schoolById.PATCH(req("/x", "PATCH", { latitude: 14.7, longitude: 43.2, locationSource: "GPS" }), idCtx(schoolA)));
    expect(set.status).toBe(200);
    expect((await q.queryOne<any>("SELECT location_source FROM schools WHERE id = ?", [schoolA]))!.location_source).toBe("GPS");
    const clear = await json(await schoolById.PATCH(req("/x", "PATCH", { latitude: null, longitude: null }), idCtx(schoolA)));
    expect(clear.status).toBe(200);
    expect(await q.queryOne<any>("SELECT latitude, location_source FROM schools WHERE id = ?", [schoolA])).toMatchObject({ latitude: null, location_source: null });

    await as(EMAILS.principal);
    const byPrincipal = await json(await schoolById.PATCH(req("/x", "PATCH", { latitude: 14.7, longitude: 43.2 }), idCtx(schoolA)));
    expect([403]).toContain(byPrincipal.status);
  });

  it("الهاتف الخاطئ يُرفض عند التعديل أيضاً", async () => {
    await as(EMAILS.admin);
    const r = await json(await schoolById.PATCH(req("/x", "PATCH", { contactPhone: "123" }), idCtx(schoolA)));
    expect(r.status).toBe(400);
    expect(r.body.invalidPhone).toBe(true);
  });
});

describe("جهات اتصال المدرسة", () => {
  let contactId: string;

  it("المدير يضيف جهة اتصال ويُوحَّد رقمها", async () => {
    await as(EMAILS.admin);
    const r = await json(await contacts.POST(req("/x", "POST", { role: "وكيل المدرسة", name: "أحمد اختبار", phone: "٠٧٧٧٧٨٤٥٢٢", hasWhatsapp: true }), idCtx(schoolA)));
    expect(r.status).toBe(201);
    contactId = r.body.id;
    expect((await q.queryOne<any>("SELECT phone FROM school_contacts WHERE id = ?", [contactId]))!.phone).toBe("777784522");
  });

  it("القائمة تضم الجهة الرئيسية (مدير المدرسة) والإضافية، ويرى مدير المدرسة مدرسته فقط", async () => {
    await as(EMAILS.principal);
    const mine = await json(await contacts.GET(req("/x"), idCtx(schoolA)));
    expect(mine.status).toBe(200);
    expect(mine.body.primary.role).toBe("مدير المدرسة");
    expect(mine.body.contacts.map((c: any) => c.name)).toContain("أحمد اختبار");
    const other = await json(await contacts.GET(req("/x"), idCtx(schoolB)));
    expect(other.status).toBe(403);
  });

  it("المعلم وولي الأمر لا يصلان إلى جهات الاتصال", async () => {
    for (const e of [EMAILS.teacher, EMAILS.parent]) {
      await as(e);
      expect((await contacts.GET(req("/x"), idCtx(schoolA))).status).toBe(403);
    }
  });

  it("المفتش يقرأ ولا يعدّل", async () => {
    await as(EMAILS.inspector);
    expect((await contacts.GET(req("/x"), idCtx(schoolA))).status).toBe(200);
    expect((await contacts.POST(req("/x", "POST", { role: "وكيل", name: "فلان" }), idCtx(schoolA))).status).toBe(403);
    expect((await contactById.DELETE(req("/x", "DELETE"), idCtx(schoolA, { contactId }))).status).toBe(403);
  });

  it("رقم خاطئ يُرفض، وتعديل وحذف جهة اتصال", async () => {
    await as(EMAILS.admin);
    const badPhone = await json(await contacts.POST(req("/x", "POST", { role: "حارس المدرسة", name: "سالم", phone: "12" }), idCtx(schoolA)));
    expect(badPhone.status).toBe(400);
    const upd = await json(await contactById.PATCH(req("/x", "PATCH", { role: "وكيل المدرسة", name: "أحمد المعدّل", phone: "733445566", hasWhatsapp: false }), idCtx(schoolA, { contactId })));
    expect(upd.status).toBe(200);
    expect(await q.queryOne<any>("SELECT name, has_whatsapp FROM school_contacts WHERE id = ?", [contactId])).toMatchObject({ name: "أحمد المعدّل", has_whatsapp: 0 });
    // جهة اتصال مدرسة أخرى لا تُعدَّل عبر مسار هذه المدرسة
    expect((await contactById.DELETE(req("/x", "DELETE"), idCtx(schoolB, { contactId }))).status).toBe(404);
    expect((await contactById.DELETE(req("/x", "DELETE"), idCtx(schoolA, { contactId }))).status).toBe(200);
    expect(await q.queryOne("SELECT id FROM school_contacts WHERE id = ?", [contactId])).toBeNull();
  });

  it("حذف المدرسة نهائياً يحذف جهات اتصالها (CASCADE) والعمليات مسجّلة في التدقيق", async () => {
    await as(EMAILS.admin);
    const created = await json(await schools.POST(req("/api/schools", "POST", newSchool())));
    await contacts.POST(req("/x", "POST", { role: "وكيل المدرسة", name: "شخص" }), idCtx(created.body.school.id));
    await q.exec("DELETE FROM schools WHERE id = ?", [created.body.school.id]);
    expect((await q.queryOne<any>("SELECT COUNT(*) n FROM school_contacts WHERE school_id = ?", [created.body.school.id]))!.n).toBe(0);
    const log = await q.queryOne<any>("SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'SCHOOL_CONTACT_%'");
    expect(Number(log!.n)).toBeGreaterThanOrEqual(3);
  });
});
