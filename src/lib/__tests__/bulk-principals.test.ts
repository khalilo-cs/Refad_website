import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let route: Record<string, (r: NextRequest) => Promise<Response>>;
const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };
const post = (body: unknown) => new NextRequest("http://localhost/api/users/bulk-principals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  route = (await import("@/app/api/users/bulk-principals/route")) as any;
});

describe("إنشاء حسابات مدراء المدارس دفعة واحدة", () => {
  it("ينشئ حساباً لمدرسة بلا مدير، ويتخطى من لها مدير، ويرفض غير المدير", async () => {
    await as(EMAILS.principal);
    expect((await route.GET(new NextRequest("http://localhost/api/users/bulk-principals"))).status).toBe(403);

    await as(EMAILS.admin);
    const id = "sch-bulk-1";
    const dir = (await q.queryOne<any>("SELECT id, governorate_id FROM directorates LIMIT 1"))!;
    await q.exec(
      `INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage, status, principal_name, contact_phone, data_source)
       VALUES (?, 'TEMP-0042', 'مدرسة الدفعة', ?, ?, 'مختلط', 'أساسي', 'ACTIVE', 'اسم مدير تجريبي', '738770724', 'MANUAL')`,
      [id, dir.governorate_id, dir.id]
    );
    const list = await (await route.GET(new NextRequest("http://localhost/api/users/bulk-principals"))).json();
    expect(list.schools.some((s: any) => s.id === id)).toBe(true);

    const withManager = (await q.queryOne<any>("SELECT school_id FROM users WHERE email = ?", [EMAILS.principal]))!.school_id;
    const r = await (await route.POST(post({ schoolIds: [id, withManager, "nope"] }))).json();
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ login: "temp-0042", name: "اسم مدير تجريبي", phone: "738770724" });
    expect(r.skipped).toHaveLength(2);

    const u = await q.queryOne<any>("SELECT must_change_password, school_id FROM users WHERE username = 'temp-0042'");
    expect(u).toMatchObject({ must_change_password: 1, school_id: id });
    expect((await auth.authenticateUser("temp-0042", r.created[0].password)).ok).toBe(true);
    // إعادة التنفيذ لا تكرر الحساب
    const again = await (await route.POST(post({ schoolIds: [id] }))).json();
    expect(again.created).toHaveLength(0);
  });
  it("يرفض أكثر من 20 مدرسة في الدفعة", async () => {
    await as(EMAILS.admin);
    const r = await route.POST(post({ schoolIds: Array.from({ length: 21 }, (_, i) => "x" + i) }));
    expect(r.status).toBe(400);
  });
});
