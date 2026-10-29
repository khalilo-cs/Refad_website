import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";

let canAccessSchool: typeof import("../scope").canAccessSchool;
let canAccessVisit: typeof import("../scope").canAccessVisit;
let schoolScope: typeof import("../scope").schoolScope;
let q: typeof import("../db/sqlite");
let schools: { id: string; code: string }[];
let otherSchoolId: string;

beforeAll(async () => {
  const { db } = await setupTestDb();
  q = db;
  ({ canAccessSchool, canAccessVisit, schoolScope } = await import("../scope"));
  // مديرية ثانية ومدرسة فيها: يجب ألا يراها مدير مديرية الجراحي
  const gov = q.queryOne<any>("SELECT id FROM governorates LIMIT 1")!;
  q.exec("INSERT INTO directorates (id, name, code, governorate_id) VALUES ('d-other','مديرية أخرى','OTHER',?)", [gov.id]);
  q.exec("INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage) VALUES ('s-other','OTHER-1','مدرسة مديرية أخرى',?, 'd-other','حكومية','أساسي')", [gov.id]);
  otherSchoolId = "s-other";
  schools = q.query<any>("SELECT id, code FROM schools WHERE code LIKE 'RIFAD-DEMO-%' ORDER BY code");
});

describe("نطاق الرؤية — لا تسرّب بين المديريات والمدارس", () => {
  it("مدير المنصة يرى كل شيء", async () => {
    const admin = await sessionFor(EMAILS.admin);
    expect(canAccessSchool(admin, otherSchoolId)).toBe(true);
    expect(canAccessSchool(admin, schools[0].id)).toBe(true);
  });

  it("مدير المديرية يرى مدارس مديريته فقط", async () => {
    const d = await sessionFor(EMAILS.director);
    expect(canAccessSchool(d, schools[0].id)).toBe(true);
    expect(canAccessSchool(d, otherSchoolId)).toBe(false);
  });

  it("مدير المدرسة ومنسق الجودة والمعلم يرون مدرستهم فقط", async () => {
    for (const email of [EMAILS.principal, EMAILS.quality, EMAILS.teacher]) {
      const u = await sessionFor(email);
      expect(canAccessSchool(u, schools[0].id)).toBe(true);
      expect(canAccessSchool(u, schools[1].id)).toBe(false);
      expect(canAccessSchool(u, otherSchoolId)).toBe(false);
    }
  });

  it("المفتش يرى المدارس المسندة إليه فقط، ولا يرى مدرسة من مديرية أخرى", async () => {
    const i = await sessionFor(EMAILS.inspector);
    expect(canAccessSchool(i, schools[0].id)).toBe(true);
    expect(canAccessSchool(i, otherSchoolId)).toBe(false);
  });

  it("ولي الأمر يصل إلى مدرسة أبنائه فقط", async () => {
    const p = await sessionFor(EMAILS.parent);
    expect(canAccessSchool(p, schools[0].id)).toBe(true);
    expect(canAccessSchool(p, schools[1].id)).toBe(false);
  });

  it("الزائر لا يرى أي مدرسة", async () => {
    const guest = { ...(await sessionFor(EMAILS.admin)), roleKey: "GUEST", userId: "x", schoolId: null, directorateId: null };
    const c = schoolScope(guest);
    expect(c.sql).toBe("1 = 0");
  });

  it("مدير مديرية بلا مديرية مسندة لا يرى شيئاً (فشل آمن)", async () => {
    const d = { ...(await sessionFor(EMAILS.director)), directorateId: null };
    expect(schoolScope(d).sql).toBe("1 = 0");
  });

  it("الوصول إلى الزيارات يتبع المدرسة، والمفتش يصل لزياراته", async () => {
    const visit = q.queryOne<any>("SELECT id FROM visits WHERE school_id = ? LIMIT 1", [schools[0].id])!;
    expect(canAccessVisit(await sessionFor(EMAILS.principal), visit.id)).toBe(true);
    expect(canAccessVisit(await sessionFor(EMAILS.inspector), visit.id)).toBe(true);
    const otherVisit = q.queryOne<any>("SELECT id FROM visits WHERE school_id = ? LIMIT 1", [schools[1].id])!;
    expect(canAccessVisit(await sessionFor(EMAILS.principal), otherVisit.id)).toBe(false);
    expect(canAccessVisit(await sessionFor(EMAILS.parent), visit.id)).toBe(true); // مدرسة ابنه (قراءة نطاق فقط؛ الواجهات تقيّد المحتوى)
  });

  it("الشروط تُبنى بمعاملات مربوطة لا بدمج نصوص", async () => {
    const d = await sessionFor(EMAILS.director);
    const c = schoolScope(d);
    expect(c.sql).toContain("?");
    expect(c.sql).not.toContain(d.directorateId!);
    // محاولة حقن عبر معرّف مديرية خبيث لا تنفَّذ كشيفرة
    const evil = { ...d, directorateId: "x' OR '1'='1" };
    const rows = q.query<any>(`SELECT s.id FROM schools s WHERE ${schoolScope(evil).sql}`, schoolScope(evil).params);
    expect(rows).toHaveLength(0);
  });
});
