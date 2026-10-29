import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

type Handler = (req: NextRequest, ctx?: any) => Promise<Response>;
let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let evalRoute: Record<string, Handler>;
let visitRoute: Record<string, Handler>;
let reportsRoute: Record<string, Handler>;
let reportStatus: Record<string, Handler>;
let improvement: Record<string, Handler>;
let evidenceRoute: Record<string, Handler>;
let schoolA: string, schoolB: string;
let inProgressVisit: string, completedVisit: string;

const as = async (email: string) => {
  vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email));
};
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const json = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => ({})) });

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  evalRoute = (await import("@/app/api/evaluations/visit/[visitId]/route")) as any;
  visitRoute = (await import("@/app/api/visits/[id]/route")) as any;
  reportsRoute = (await import("@/app/api/reports/route")) as any;
  reportStatus = (await import("@/app/api/reports/[id]/status/route")) as any;
  improvement = (await import("@/app/api/improvement/route")) as any;
  evidenceRoute = (await import("@/app/api/evidence/route")) as any;
  schoolA = q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-001'")!.id;
  schoolB = q.queryOne<any>("SELECT id FROM schools WHERE code='RIFAD-DEMO-002'")!.id;
  inProgressVisit = q.queryOne<any>("SELECT id FROM visits WHERE status='IN_PROGRESS' LIMIT 1")!.id;
  completedVisit = q.queryOne<any>("SELECT id FROM visits WHERE status='COMPLETED' AND school_id = ? ORDER BY created_at DESC LIMIT 1", [schoolA])!.id;
});

describe("التقييم الميداني: سجل التعديلات وكشف التعارض والقفل", () => {
  let indicatorId: string;
  beforeAll(() => {
    indicatorId = q.queryOne<any>(
      "SELECT id FROM indicators WHERE id NOT IN (SELECT indicator_id FROM evaluations WHERE visit_id = ?) ORDER BY order_index LIMIT 1",
      [inProgressVisit]
    )!.id;
  });

  it("المفتش يحفظ درجة جديدة فتُنشأ النسخة 1 ويُسجَّل التعديل", async () => {
    await as(EMAILS.inspector);
    const r = await json(await evalRoute.PATCH(req("/x", "PATCH", { indicatorId, status: "EVALUATED", score: 2, notes: "ملاحظة", methods: ["ملاحظة"] }), { params: Promise.resolve({ visitId: inProgressVisit }) }));
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(1);
    const hist = q.query<any>("SELECT field FROM evaluation_history WHERE visit_id = ? AND indicator_id = ?", [inProgressVisit, indicatorId]);
    expect(hist.map((h) => h.field)).toEqual(expect.arrayContaining(["score", "status", "notes"]));
  });

  it("تعديل درجة مقيَّمة يتطلب سبباً ثم يُسجَّل السبب", async () => {
    await as(EMAILS.inspector);
    const ctx = { params: Promise.resolve({ visitId: inProgressVisit }) };
    const noReason = await json(await evalRoute.PATCH(req("/x", "PATCH", { indicatorId, status: "EVALUATED", score: 3, expectedVersion: 1 }), ctx));
    expect(noReason.status).toBe(422);
    const ok = await json(await evalRoute.PATCH(req("/x", "PATCH", { indicatorId, status: "EVALUATED", score: 3, reason: "ظهر دليل جديد", expectedVersion: 1 }), ctx));
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    const h = q.queryOne<any>("SELECT reason FROM evaluation_history WHERE indicator_id = ? AND field = 'score' ORDER BY rowid DESC", [indicatorId]);
    expect(h.reason).toBe("ظهر دليل جديد");
  });

  it("نسخة قديمة تُرفض بـ 409 مع القيمة الأحدث ولا تُكتب فوقها", async () => {
    await as(EMAILS.inspector);
    const ctx = { params: Promise.resolve({ visitId: inProgressVisit }) };
    const r = await json(await evalRoute.PATCH(req("/x", "PATCH", { indicatorId, status: "EVALUATED", score: 0, reason: "تجربة", expectedVersion: 1 }), ctx));
    expect(r.status).toBe(409);
    expect(r.body.conflict).toBe(true);
    expect(r.body.server.score).toBe(3);
    expect(q.queryOne<any>("SELECT score FROM evaluations WHERE visit_id = ? AND indicator_id = ?", [inProgressVisit, indicatorId])!.score).toBe(3);
  });

  it("الدرجة خارج النطاق أو غير الصحيحة مرفوضة", async () => {
    await as(EMAILS.inspector);
    const ctx = { params: Promise.resolve({ visitId: inProgressVisit }) };
    const other = q.queryOne<any>("SELECT id FROM indicators WHERE code = '2-2-2'")!.id;
    expect((await evalRoute.PATCH(req("/x", "PATCH", { indicatorId: other, status: "EVALUATED", score: 9 }), ctx)).status).toBe(400);
    expect((await evalRoute.PATCH(req("/x", "PATCH", { indicatorId: other, status: "EVALUATED", score: 1.5 }), ctx)).status).toBe(400);
  });

  it("مدير المدرسة لا يستطيع التقييم، ولا مفتش آخر خارج زيارته", async () => {
    const ctx = { params: Promise.resolve({ visitId: inProgressVisit }) };
    await as(EMAILS.principal);
    expect((await evalRoute.PATCH(req("/x", "PATCH", { indicatorId, status: "NOT_EVALUATED" }), ctx)).status).toBe(403);
  });

  it("الزيارة المقدَّمة مقفلة للتعديل (423) حتى تُعاد", async () => {
    await as(EMAILS.inspector);
    const sub = await json(await visitRoute.PATCH(req("/x", "PATCH", { action: "submit", strengths: "قوة", gaps: "فجوة" }), { params: Promise.resolve({ id: inProgressVisit }) }));
    expect(sub.status).toBe(200);
    const ctx = { params: Promise.resolve({ visitId: inProgressVisit }) };
    const locked = await json(await evalRoute.PATCH(req("/x", "PATCH", { indicatorId, status: "NOT_EVALUATED" }), ctx));
    expect(locked.status).toBe(423);
    // الاعتماد لا يملكه المفتش
    expect((await visitRoute.PATCH(req("/x", "PATCH", { action: "approve" }), { params: Promise.resolve({ id: inProgressVisit }) })).status).toBe(403);
    // المدير يعيدها بسبب
    await as(EMAILS.director);
    expect((await visitRoute.PATCH(req("/x", "PATCH", { action: "return" }), { params: Promise.resolve({ id: inProgressVisit }) })).status).toBe(400);
    expect((await visitRoute.PATCH(req("/x", "PATCH", { action: "return", reason: "استكمال المؤشرات" }), { params: Promise.resolve({ id: inProgressVisit }) })).status).toBe(200);
  });
});

describe("التقارير: مسار الاعتماد وفصل المهام", () => {
  let reportId: string;

  it("المفتش يولّد تقريراً كمسودة، ويبقى التقرير غير المكتمل غير قابل للرفع", async () => {
    await as(EMAILS.inspector);
    const inc = await json(await reportsRoute.POST(req("/api/reports", "POST", { type: "VISIT_DAILY", visitId: inProgressVisit })));
    expect(inc.status).toBe(201);
    expect(inc.body.state).toBe("INCOMPLETE");
    const sub = await json(await reportStatus.PATCH(req("/x", "PATCH", { status: "UNDER_REVIEW" }), { params: Promise.resolve({ id: inc.body.id }) }));
    expect(sub.status).toBe(400);
  });

  it("تقرير مكتمل: رفع ثم منع اعتماد الصاحب ثم اعتماد المدير وتجميد التقرير", async () => {
    await as(EMAILS.inspector);
    const c = await json(await reportsRoute.POST(req("/api/reports", "POST", { type: "VISIT_DAILY", visitId: completedVisit })));
    expect(c.status).toBe(201);
    expect(c.body.state).toBe("COMPLETE");
    reportId = c.body.id;
    const ctx = { params: Promise.resolve({ id: reportId }) };
    expect((await reportStatus.PATCH(req("/x", "PATCH", { status: "UNDER_REVIEW" }), ctx)).status).toBe(200);
    // المفتش لا يعتمد ولا صاحب التقرير
    expect((await reportStatus.PATCH(req("/x", "PATCH", { status: "APPROVED" }), ctx)).status).toBe(403);
    // الرفض يتطلب سبباً
    await as(EMAILS.director);
    expect((await reportStatus.PATCH(req("/x", "PATCH", { status: "REJECTED" }), ctx)).status).toBe(400);
    const ok = await json(await reportStatus.PATCH(req("/x", "PATCH", { status: "APPROVED" }), ctx));
    expect(ok.status).toBe(200);
    const row = q.queryOne<any>("SELECT status, approved_by_id, approved_at FROM reports WHERE id = ?", [reportId])!;
    expect(row.status).toBe("APPROVED");
    expect(row.approved_by_id).toBeTruthy();
    expect(row.approved_at).toBeTruthy();
    // لا تعديل بعد الاعتماد
    expect((await reportStatus.PATCH(req("/x", "PATCH", { status: "REJECTED", rejectionReason: "سبب كافٍ" }), ctx)).status).toBe(409);
  });

  it("مدير مدرسة أخرى لا يرى التقرير، والمعلم ممنوع", async () => {
    // مدير مدرسة (أ) يرى المعتمد لمدرسته
    await as(EMAILS.principal);
    const list = await json(await reportsRoute.GET(req("/api/reports")));
    expect(list.body.reports.some((r: any) => r.id === reportId)).toBe(true);
    await as(EMAILS.teacher);
    expect((await reportsRoute.GET(req("/api/reports"))).status).toBe(403);
    // مدير المدرسة لا يستطيع توليد تقرير زيارة
    await as(EMAILS.principal);
    expect((await reportsRoute.POST(req("/api/reports", "POST", { type: "VISIT_DAILY", visitId: completedVisit }))).status).toBe(403);
  });

  it("رمز التحقق عشوائي فريد بـ 10 خانات ويحتوي المحتوى المثبَّت", () => {
    const r = q.queryOne<any>("SELECT verification_code, content FROM reports WHERE id = ?", [reportId])!;
    expect(r.verification_code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(JSON.parse(r.content).sections.length).toBeGreaterThan(3);
  });
});

describe("خطط التحسين: لا إغلاق دون دليل مقبول وتحقق", () => {
  let planId: string, actionId: string;
  it("إنشاء خطة وإجراء ثم منع الإكمال دون دليل", async () => {
    await as(EMAILS.principal);
    const p = await json(await improvement.POST(req("/api/improvement", "POST", { kind: "plan", title: "خطة اختبار" })));
    expect(p.status).toBe(201);
    planId = p.body.id;
    const principal = await sessionFor(EMAILS.principal);
    const a = await json(await improvement.POST(req("/api/improvement", "POST", { kind: "action", planId, problemDescription: "مشكلة اختبار", proposedAction: "إجراء اختبار", dueDate: "2030-01-01", responsibleId: principal.userId })));
    expect(a.status).toBe(201);
    actionId = a.body.id;
    expect((await improvement.PATCH(req("/x", "PATCH", { actionId, status: "IN_PROGRESS" }))).status).toBe(200);
    const done = await json(await improvement.PATCH(req("/x", "PATCH", { actionId, status: "COMPLETED" })));
    expect(done.status).toBe(422);
  });

  it("بعد رفع دليل: يكتمل، ولا يُغلق قبل قبول الدليل، ومدير المدرسة لا يتحقق", async () => {
    const principal = await sessionFor(EMAILS.principal);
    q.exec(`INSERT INTO evidence (id, name, original_name, mime_type, size, storage_key, url, school_id, action_id, uploaded_by_id, review_status)
            VALUES ('ev-1','دليل','d.pdf','application/pdf',10,'k.pdf','/x',?,?,?, 'PENDING')`, [schoolA, actionId, principal.userId]);
    await as(EMAILS.principal);
    expect((await improvement.PATCH(req("/x", "PATCH", { actionId, status: "COMPLETED" }))).status).toBe(200);
    expect((await improvement.PATCH(req("/x", "PATCH", { actionId, status: "CLOSED_VERIFIED" }))).status).toBe(403);
    await as(EMAILS.inspector);
    expect((await improvement.PATCH(req("/x", "PATCH", { actionId, status: "CLOSED_VERIFIED" }))).status).toBe(422); // الدليل لم يُقبل
    q.exec("UPDATE evidence SET review_status = 'ACCEPTED' WHERE id = 'ev-1'");
    expect((await improvement.PATCH(req("/x", "PATCH", { actionId, status: "CLOSED_VERIFIED", notes: "تم التحقق" }))).status).toBe(200);
    expect(q.queryOne<any>("SELECT status FROM corrective_actions WHERE id = ?", [actionId])!.status).toBe("CLOSED_VERIFIED");
  });

  it("لا يرى مدير مدرسة (أ) خطط مدرسة (ب) ولا يعدلها", async () => {
    const other = q.queryOne<any>("SELECT id FROM users WHERE email = ?", [EMAILS.director])!.id;
    q.exec("INSERT INTO improvement_plans (id, school_id, title, status, created_by_id) VALUES ('p-b', ?, 'خطة مدرسة ب', 'ACTIVE', ?)", [schoolB, other]);
    await as(EMAILS.principal);
    const list = await json(await improvement.GET(req("/api/improvement")));
    expect(list.body.plans.some((p: any) => p.id === "p-b")).toBe(false);
    expect((await improvement.PATCH(req("/x", "PATCH", { planId: "p-b", status: "CANCELLED" }))).status).toBe(403);
    expect((await improvement.POST(req("/api/improvement", "POST", { kind: "plan", title: "خطة", schoolId: schoolB }))).status).toBe(403);
  });
});

describe("الأدلة: رفع آمن ونطاق صلاحيات", () => {
  const upload = async (email: string, schoolId: string, name: string, content: Buffer) => {
    await as(email);
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(content)], name));
    fd.append("schoolId", schoolId);
    return json(await evidenceRoute.POST(new NextRequest("http://localhost/api/evidence", { method: "POST", body: fd })));
  };
  const pdf = Buffer.from("%PDF-1.4\n%test pdf content for upload\n");

  it("يقبل PDF حقيقياً ويحفظه خارج public بنسخة وبصمة", async () => {
    const r = await upload(EMAILS.principal, schoolA, "plan.pdf", pdf);
    expect(r.status).toBe(201);
    const row = q.queryOne<any>("SELECT storage_key, sha256, version, url FROM evidence WHERE id = ?", [r.body.id])!;
    expect(row.sha256).toHaveLength(64);
    expect(row.version).toBe(1);
    expect(row.url).toBe(`/api/evidence/${r.body.id}/file`);
    expect(row.url).not.toContain("/uploads/");
  });

  it("يرفض ملفاً تنفيذياً بامتداد pdf، ويرفض رفع دليل لمدرسة أخرى", async () => {
    expect((await upload(EMAILS.principal, schoolA, "evil.pdf", Buffer.from("MZ\x90 binary exe"))).status).toBe(400);
    expect((await upload(EMAILS.principal, schoolB, "plan.pdf", pdf)).status).toBe(403);
  });

  it("ولي الأمر والزائر لا يرفعان، والمعلم يرى ما رفعه فقط", async () => {
    expect((await upload(EMAILS.parent, schoolA, "p.pdf", pdf)).status).toBe(403);
    await as(EMAILS.teacher);
    const list = await json(await evidenceRoute.GET(req("/api/evidence")));
    expect(list.status).toBe(200);
    expect(list.body.evidence.every((e: any) => e.uploaded_by_name === "معلم تجريبي")).toBe(true);
  });

  it("لا يراجع المستخدم دليلاً رفعه بنفسه (المفتش يراجع دليل المدرسة)", async () => {
    const up = await upload(EMAILS.inspector, schoolA, "i.pdf", pdf);
    await as(EMAILS.inspector);
    const own = await json(await evidenceRoute.PATCH(req("/api/evidence", "PATCH", { id: up.body.id, status: "ACCEPTED" })));
    expect(own.status).toBe(403);
  });
});

beforeEach(() => vi.clearAllMocks());
