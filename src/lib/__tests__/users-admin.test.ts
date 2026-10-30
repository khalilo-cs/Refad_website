import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_PASSWORD, EMAILS, sessionFor, setupTestDb } from "@/test/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

type Handler = (req: NextRequest, ctx?: any) => Promise<Response>;
let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let users: Record<string, Handler>;
let userById: Record<string, Handler>;
let schoolA: string, dirId: string;

const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const json = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  users = (await import("@/app/api/users/route")) as any;
  userById = (await import("@/app/api/users/[id]/route")) as any;
  schoolA = (await q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-001'"))!.id;
  dirId = (await q.queryOne<any>("SELECT id FROM directorates LIMIT 1"))!.id;
});

describe("توليد كلمات المرور", () => {
  it("تولّد كلمة قوية ومختلفة في كل مرة", async () => {
    const { generatePassword } = await import("../credentials");
    const set = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(set.size).toBe(50);
    for (const p of set) expect(auth.validatePassword(p).ok).toBe(true);
  });
});

describe("إنشاء مستخدم باسم مستخدم", () => {
  it("ينشئ مدير مدرسة باسم مستخدم دون بريد، وبكلمة مولّدة تُعاد مرة واحدة وتُلزم بالتغيير", async () => {
    await as(EMAILS.admin);
    const r = await json(await users.POST(req("/api/users", "POST", {
      name: "مدير مدرسة اختبار", username: "School.001", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA, phone: "73 877 0724", hasWhatsapp: true, jobTitle: "مدير",
    })));
    expect(r.status).toBe(201);
    expect(r.body.credentials.login).toBe("school.001");
    expect(r.body.credentials.password.length).toBeGreaterThanOrEqual(10);
    const row = await q.queryOne<any>("SELECT email, username, phone, must_change_password, password_hash FROM users WHERE id = ?", [r.body.id]);
    expect(row).toMatchObject({ email: "school.001@no-email.invalid", username: "school.001", phone: "738770724", must_change_password: 1 });
    expect(row.password_hash).not.toContain(r.body.credentials.password);
    // لا تظهر كلمة المرور في سجل التدقيق
    const logs = await q.query<any>("SELECT new_values FROM audit_logs WHERE entity_id = ?", [r.body.id]);
    expect(JSON.stringify(logs)).not.toContain(r.body.credentials.password);
  });
  it("يدخل باسم المستخدم وكلمة المرور المولّدة، ويحمل الجلسة علم التغيير الإلزامي", async () => {
    await as(EMAILS.admin);
    const c = await json(await users.POST(req("/api/users", "POST", { name: "مستخدم دخول", username: "login.test1", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA })));
    const ok = await auth.authenticateUser("LOGIN.test1", c.body.credentials.password);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.user.mustChangePassword).toBe(true);
    const bad = await auth.authenticateUser("login.test1", "كلمة-خاطئة-123");
    expect(bad.ok).toBe(false);
  });
  it("يرفض اسم مستخدم مكرراً أو غير صالح، ويشترط مديرية لمدير التعليم", async () => {
    await as(EMAILS.admin);
    const base = { name: "مستخدم مكرر", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA };
    expect((await json(await users.POST(req("/api/users", "POST", { ...base, username: "dup.user1" })))).status).toBe(201);
    expect((await json(await users.POST(req("/api/users", "POST", { ...base, username: "DUP.user1" })))).status).toBe(409);
    expect((await json(await users.POST(req("/api/users", "POST", { ...base, username: "a@b" })))).status).toBe(400);
    expect((await json(await users.POST(req("/api/users", "POST", { name: "مدير تعليم", username: "edu.dir1", roleKey: "EDUCATION_DIRECTOR" })))).status).toBe(400);
    expect((await json(await users.POST(req("/api/users", "POST", { name: "مدير تعليم", username: "edu.dir2", roleKey: "EDUCATION_DIRECTOR", directorateId: dirId })))).status).toBe(201);
  });
  it("يرفض هاتفاً غير صالح ما لم يُسمح به", async () => {
    await as(EMAILS.admin);
    const base = { name: "هاتف خاطئ", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA };
    const r = await json(await users.POST(req("/api/users", "POST", { ...base, username: "ph.bad1", phone: "12345" })));
    expect(r.status).toBe(400);
    expect(r.body.invalidPhone).toBe(true);
  });
  it("غير المدير لا يستطيع إنشاء مستخدمين", async () => {
    await as(EMAILS.principal);
    expect((await json(await users.POST(req("/api/users", "POST", { name: "ممنوع", username: "nope.user1", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA })))).status).toBe(403);
  });
});

describe("إعادة التعيين والفتح", () => {
  it("إعادة التعيين تولّد كلمة مؤقتة وتلزم بالتغيير وتبطل الجلسات", async () => {
    await as(EMAILS.admin);
    const c = await json(await users.POST(req("/api/users", "POST", { name: "مستخدم إعادة", username: "reset.me1", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA, mustChangePassword: false })));
    const before = await q.queryOne<any>("SELECT token_version, must_change_password FROM users WHERE id = ?", [c.body.id]);
    expect(before.must_change_password).toBe(0);
    const r = await json(await userById.PATCH(req(`/api/users/${c.body.id}`, "PATCH", { resetPassword: true }), idCtx(c.body.id)));
    expect(r.status).toBe(200);
    expect(r.body.credentials.password).toBeTruthy();
    const after = await q.queryOne<any>("SELECT token_version, must_change_password FROM users WHERE id = ?", [c.body.id]);
    expect(after.must_change_password).toBe(1);
    expect(after.token_version).toBeGreaterThan(before.token_version);
    expect((await auth.authenticateUser("reset.me1", r.body.credentials.password)).ok).toBe(true);
  });
  it("فتح الحساب يصفّر عدّاد المحاولات والقفل المؤقت", async () => {
    await as(EMAILS.admin);
    const c = await json(await users.POST(req("/api/users", "POST", { name: "مستخدم مقفل", username: "lock.me1", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA })));
    await q.exec("UPDATE users SET is_locked = 1, failed_login = 4, locked_until = datetime('now','+10 minutes') WHERE id = ?", [c.body.id]);
    expect((await json(await userById.PATCH(req(`/api/users/${c.body.id}`, "PATCH", { isLocked: false }), idCtx(c.body.id)))).status).toBe(200);
    const row = await q.queryOne<any>("SELECT is_locked, failed_login, locked_until FROM users WHERE id = ?", [c.body.id]);
    expect(row).toMatchObject({ is_locked: 0, failed_login: 0, locked_until: null });
  });
  it("تعديل الهاتف والمسمى واسم المستخدم", async () => {
    await as(EMAILS.admin);
    const c = await json(await users.POST(req("/api/users", "POST", { name: "مستخدم تعديل", username: "edit.me1", roleKey: "SCHOOL_PRINCIPAL", schoolId: schoolA })));
    const r = await json(await userById.PATCH(req(`/api/users/${c.body.id}`, "PATCH", { phone: "+967 77 111 2233", jobTitle: "وكيل", hasWhatsapp: false, username: "edit.me2" }), idCtx(c.body.id)));
    expect(r.status).toBe(200);
    expect(await q.queryOne<any>("SELECT phone, job_title, has_whatsapp, username FROM users WHERE id = ?", [c.body.id])).toMatchObject({ phone: "771112233", job_title: "وكيل", has_whatsapp: 0, username: "edit.me2" });
  });
});

describe("إلزام تغيير كلمة المرور على الخادم", () => {
  it("authorize يمنع الجلسة التي يلزمها التغيير", async () => {
    const s = { ...(await sessionFor(EMAILS.admin)), mustChangePassword: true };
    expect(auth.authorize(s, { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });
  it("الوسيط يحجب واجهات غير الحساب ويسمح بالإعدادات", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(40);
    const jwt = (await import("jsonwebtoken")).default;
    const { middleware } = await import("@/middleware");
    const token = jwt.sign({ userId: "u1", mustChangePassword: true }, process.env.JWT_SECRET!, { issuer: "rifad", audience: "rifad-app" });
    const mk = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { cookie: `access_token=${token}` } });
    const api = middleware(mk("/api/schools"));
    expect(api.status).toBe(403);
    expect((await api.json()).mustChangePassword).toBe(true);
    expect(middleware(mk("/schools")).headers.get("location")).toContain("/settings?force=1");
    expect(middleware(mk("/api/account")).status).toBe(200);
    expect(middleware(mk("/settings")).status).toBe(200);
  });
});
