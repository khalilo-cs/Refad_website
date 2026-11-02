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
let schoolsRoute: Record<string, Handler>;
let schoolById: Record<string, Handler>;
let visitsRoute: Record<string, Handler>;
let usersRoute: Record<string, Handler>;
let evidenceRoute: Record<string, Handler>;
let improvement: Record<string, Handler>;
let schoolA: string, schoolB: string;

const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const json = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const pdf = Buffer.from("%PDF-1.4\n%isolation test\n");
const upload = async (email: string, fields: Record<string, string>) => {
  await as(email);
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(pdf)], "x.pdf"));
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return json(await evidenceRoute.POST(new NextRequest("http://localhost/api/evidence", { method: "POST", body: fd })));
};

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  schoolsRoute = (await import("@/app/api/schools/route")) as any;
  schoolById = (await import("@/app/api/schools/[id]/route")) as any;
  visitsRoute = (await import("@/app/api/visits/route")) as any;
  usersRoute = (await import("@/app/api/users/route")) as any;
  evidenceRoute = (await import("@/app/api/evidence/route")) as any;
  improvement = (await import("@/app/api/improvement/route")) as any;
  schoolA = (await q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-001'"))!.id;
  schoolB = (await q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-002'"))!.id;
});

describe("مشرف المحافظة: اطلاع كامل بلا تعديل", () => {
  it("يرى كل المدارس في القائمة", async () => {
    await as(EMAILS.supervisor);
    const r = await json(await schoolsRoute.GET(req("/api/schools?limit=100")));
    expect(r.status).toBe(200);
    const total = (await q.queryOne<{ n: number }>("SELECT COUNT(*) n FROM schools WHERE status = 'ACTIVE'"))!.n;
    expect(r.body.schools.length).toBeGreaterThanOrEqual(Math.min(total, 3));
    expect(r.body.schools.some((s: any) => s.id === schoolB)).toBe(true);
  });

  it("الخادم يرفض إنشاء زيارة وتعديل مدرسة ورفع دليل", async () => {
    await as(EMAILS.supervisor);
    expect((await visitsRoute.POST(req("/api/visits", "POST", { schoolId: schoolA, type: "PERIODIC" }))).status).toBe(403);
    expect((await schoolById.PATCH(req(`/api/schools/${schoolA}`, "PATCH", { name: "تغيير" }), idCtx(schoolA))).status).toBe(403);
    expect((await upload(EMAILS.supervisor, { schoolId: schoolA })).status).toBe(403);
  });

  it("الوسيط يحجب أي طلب مغيِّر لحسابه ويسمح بالحساب والخروج", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(40);
    const jwt = (await import("jsonwebtoken")).default;
    const { middleware } = await import("@/middleware");
    const token = jwt.sign({ userId: "sup", roleKey: "GOVERNORATE_SUPERVISOR" }, process.env.JWT_SECRET!, { issuer: "rifad", audience: "rifad-app" });
    const mk = (path: string, method: string) => new NextRequest(`http://localhost${path}`, { method, headers: { cookie: `access_token=${token}`, host: "localhost" } });
    expect(middleware(mk("/api/visits", "POST")).status).toBe(403);
    expect(middleware(mk("/api/schools/x", "PATCH")).status).toBe(403);
    expect(middleware(mk("/api/evidence", "DELETE")).status).toBe(403);
    expect(middleware(mk("/api/account", "POST")).status).toBe(200);
    expect(middleware(mk("/api/auth/logout", "POST")).status).toBe(200);
    expect(middleware(mk("/api/schools", "GET")).status).toBe(200);
  });
});

describe("مدير المدرسة: مدرسته وبياناته فقط", () => {
  it("لا يعدّل مدرسة أخرى ولا السجل الأساسي لمدرسته", async () => {
    await as(EMAILS.principal);
    expect((await schoolById.PATCH(req(`/api/schools/${schoolB}`, "PATCH", { name: "اختراق" }), idCtx(schoolB))).status).toBe(403);
    expect((await schoolById.PATCH(req(`/api/schools/${schoolA}`, "PATCH", { name: "اسم جديد" }), idCtx(schoolA))).status).toBe(403);
    expect((await schoolById.PATCH(req(`/api/schools/${schoolA}`, "PATCH", { contactPhone: "771112233" }), idCtx(schoolA))).status).toBe(403);
    const name = (await q.queryOne<any>("SELECT name FROM schools WHERE id = ?", [schoolA]))!.name;
    expect(name).not.toBe("اسم جديد");
  });

  it("لا ينشئ مستخدمين ولا يطّلع على قائمتهم", async () => {
    await as(EMAILS.principal);
    expect((await usersRoute.POST(req("/api/users", "POST", { name: "معلم", username: "t.x1", roleKey: "TEACHER", schoolId: schoolA }))).status).toBe(403);
    expect((await usersRoute.GET(req("/api/users"))).status).toBe(403);
  });

  it("لا يرى مدرسة أخرى ولا يرفع دليلاً لها", async () => {
    await as(EMAILS.principal);
    expect((await schoolById.GET(req(`/api/schools/${schoolB}`), idCtx(schoolB))).status).toBe(403);
    expect((await upload(EMAILS.principal, { schoolId: schoolB })).status).toBe(403);
  });

  it("لا يربط دليلاً بإجراء تصحيحي أو تقييم يخص مدرسة أخرى", async () => {
    const planB = (await q.queryOne<any>("SELECT id FROM improvement_plans WHERE school_id = ?", [schoolB]))?.id
      ?? (await (async () => {
        const id = "plan-b-test";
        const adminId = (await sessionFor(EMAILS.admin)).userId;
        await q.exec("INSERT INTO improvement_plans (id, school_id, title, status, created_by_id) VALUES (?,?,?, 'ACTIVE', ?)", [id, schoolB, "خطة ب", adminId]);
        return id;
      })());
    const ind = (await q.queryOne<any>("SELECT id FROM indicators LIMIT 1"))!.id;
    const adminUser = (await sessionFor(EMAILS.admin)).userId;
    await q.exec(`INSERT INTO corrective_actions (id, plan_id, indicator_id, problem_description, priority, proposed_action, responsible_id, due_date, status)
      VALUES ('act-b-test', ?, ?, 'مشكلة', 'MEDIUM', 'إجراء', ?, '2027-01-01', 'IN_PROGRESS')`, [planB, ind, adminUser]);
    expect((await upload(EMAILS.principal, { schoolId: schoolA, actionId: "act-b-test" })).status).toBe(400);
    const evalB = (await q.queryOne<any>("SELECT e.id FROM evaluations e JOIN visits v ON v.id = e.visit_id WHERE v.school_id = ? LIMIT 1", [schoolB]))!.id;
    expect((await upload(EMAILS.principal, { schoolId: schoolA, evaluationId: evalB })).status).toBe(400);
    expect((await q.queryOne<{ n: number }>("SELECT COUNT(*) n FROM evidence WHERE action_id = 'act-b-test'"))!.n).toBe(0);
  });

  it("لا يستبدل ملفاً رفعه مستخدم آخر، ولا يسند إجراءً لمن هو خارج مدرسته", async () => {
    const byTeacher = await upload(EMAILS.teacher, { schoolId: schoolA });
    expect(byTeacher.status).toBe(201);
    expect((await upload(EMAILS.principal, { replaceId: byTeacher.body.id })).status).toBe(403);
    expect((await upload(EMAILS.teacher, { replaceId: byTeacher.body.id })).status).toBe(201);

    await as(EMAILS.principal);
    const plan = (await q.queryOne<any>("SELECT id FROM improvement_plans WHERE school_id = ? AND status = 'ACTIVE'", [schoolA]))!.id;
    const admin = await sessionFor(EMAILS.admin);
    const r = await improvement.POST(req("/api/improvement", "POST", {
      kind: "action", planId: plan, problemDescription: "مشكلة في المؤشر", proposedAction: "إجراء مقترح واضح", dueDate: "2027-02-01", responsibleId: admin.userId,
    }));
    expect(r.status).toBe(400);
  });
});
