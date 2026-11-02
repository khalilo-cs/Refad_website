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
let route: Record<string, Handler>;
let canAccessSchool: typeof import("../scope").canAccessSchool;
let schools: { id: string }[];

const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/users/x/schools", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  route = (await import("@/app/api/users/[id]/schools/route")) as any;
  ({ canAccessSchool } = await import("../scope"));
  schools = await q.query<any>("SELECT id FROM schools WHERE code LIKE 'RIFAD-DEMO-%' ORDER BY code");
});

describe("إسناد المدارس للمفتشين", () => {
  it("مدير النظام وحده يسند، والمفتش يرى المسند إليه فقط", async () => {
    const inspector = await sessionFor(EMAILS.inspector);

    await as(EMAILS.principal);
    expect((await route.PUT(req("PUT", { schoolIds: [schools[0].id] }), ctx(inspector.userId))).status).toBe(403);
    await as(EMAILS.inspector);
    expect((await route.PUT(req("PUT", { schoolIds: schools.map((s) => s.id) }), ctx(inspector.userId))).status).toBe(403);

    await as(EMAILS.admin);
    const r = await route.PUT(req("PUT", { schoolIds: [schools[2].id] }), ctx(inspector.userId));
    expect(r.status).toBe(200);
    const got = await (await route.GET(req("GET"), ctx(inspector.userId))).json();
    expect(got.schoolIds).toEqual([schools[2].id]);

    // مدرسة غير مسندة ولا زيارة له فيها: لا يصل إليها
    const fresh = "s-unassigned";
    const school = (await q.queryOne<any>("SELECT governorate_id, directorate_id FROM schools WHERE id = ?", [schools[0].id]))!;
    await q.exec("INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage) VALUES (?,?,?,?,?,'حكومية','أساسي')",
      [fresh, "UNASSIGNED-1", "مدرسة غير مسندة", school.governorate_id, school.directorate_id]);
    expect(await canAccessSchool(inspector, fresh)).toBe(false);
    expect(await canAccessSchool(inspector, schools[2].id)).toBe(true);
  });

  it("يرفض مدارس مجهولة وحسابات غير المفتشين", async () => {
    await as(EMAILS.admin);
    const inspector = await sessionFor(EMAILS.inspector);
    const principal = await sessionFor(EMAILS.principal);
    expect((await route.PUT(req("PUT", { schoolIds: ["nope"] }), ctx(inspector.userId))).status).toBe(400);
    expect((await route.PUT(req("PUT", { schoolIds: "x" }), ctx(inspector.userId))).status).toBe(400);
    expect((await route.PUT(req("PUT", { schoolIds: [] }), ctx(principal.userId))).status).toBe(409);
  });
});
