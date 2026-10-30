import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

type H = (req: NextRequest, ctx?: any) => Promise<Response>;
let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let sa: Record<string, H>, item: Record<string, H>, submit: Record<string, H>, overview: Record<string, H>, certs: Record<string, H>, verify: Record<string, H>;
let schoolId: string, year: string, indicators: string[];

const as = async (email: string) => { vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(email)); };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const json = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const rate = (indicatorId: string, extra: object) => sa.PUT(req("/api/self-assessment", "PUT", { schoolId, year, indicatorId, ...extra }));

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  sa = (await import("@/app/api/self-assessment/route")) as any;
  item = (await import("@/app/api/self-assessment/items/[id]/route")) as any;
  submit = (await import("@/app/api/self-assessment/submit/route")) as any;
  overview = (await import("@/app/api/self-assessment/overview/route")) as any;
  certs = (await import("@/app/api/certificates/route")) as any;
  verify = (await import("@/app/api/verify/[code]/route")) as any;
  schoolId = (await q.queryOne<any>("SELECT school_id FROM users WHERE email = ?", [EMAILS.principal]))!.school_id;
  indicators = (await q.query<any>("SELECT id FROM indicators ORDER BY order_index, code")).map((r) => r.id);
  year = (await import("../self-assessment")).currentAcademicYear();
});

describe("دورة التقييم الذاتي ومعالجة الضعف", () => {
  let weakItem: string;

  it("المدير يقيّم، والدرجة الضعيفة تُلزم بخطة وتُبلغ الإدارة", async () => {
    await as(EMAILS.principal);
    const g = await json(await sa.GET(req(`/api/self-assessment?year=${year}`)));
    expect(g.status).toBe(200);
    expect(g.body.canFill).toBe(true);
    expect(g.body.summary.total).toBe(indicators.length);

    const r = await json(await rate(indicators[0], { score: 1 }));
    expect(r.body).toMatchObject({ isWeak: true, status: "NEEDS_PLAN", needsPlan: true });
    weakItem = r.body.itemId;
    const admin = await q.queryOne<any>("SELECT id FROM users WHERE email = ?", [EMAILS.admin]);
    const n = await q.queryOne<any>("SELECT title FROM notifications WHERE user_id = ? AND title = 'نقطة ضعف جديدة'", [admin.id]);
    expect(n).toBeTruthy();
  });

  it("علامة الضعف اليدوية على مؤشر جيد", async () => {
    await as(EMAILS.principal);
    const r = await json(await rate(indicators[1], { score: 2, isWeak: true }));
    expect(r.body.status).toBe("NEEDS_PLAN");
    const r2 = await json(await rate(indicators[1], { isWeak: false }));
    expect(r2.body.status).toBe("NONE");
  });

  it("لا يُرسل قبل تقييم الكل ووضع خطة لكل ضعف", async () => {
    await as(EMAILS.principal);
    for (const id of indicators.slice(1)) await rate(id, { score: 3 });
    const s = await json(await submit.POST(req("/api/self-assessment/submit", "POST", { schoolId, year })));
    expect(s.status).toBe(409);
    expect(s.body.blockers.join(" ")).toContain("خطة");
  });

  it("الخطة ← بدء ← تحسّن ← اعتماد، مع السجل كاملاً", async () => {
    await as(EMAILS.principal);
    expect((await json(await item.POST(req("", "POST", { action: "improve", note: "تم تنفيذ الإجراء كاملاً", newScore: 3 }), ctx(weakItem)))).status).toBe(400);
    const p = await json(await item.POST(req("", "POST", { action: "plan", planAction: "تدريب المعلمين على إعداد الخطط الفصلية", responsible: "وكيل المدرسة", dueDate: "2099-01-01" }), ctx(weakItem)));
    expect(p.body.status).toBe("PLANNED");

    const s = await json(await submit.POST(req("/api/self-assessment/submit", "POST", { schoolId, year })));
    expect(s.status).toBe(200);
    // بعد الإرسال يُقفل التقييم المباشر
    expect((await rate(indicators[2], { score: 1 })).status).toBe(409);

    expect((await json(await item.POST(req("", "POST", { action: "start" }), ctx(weakItem)))).body.status).toBe("IN_PROGRESS");
    expect((await json(await item.POST(req("", "POST", { action: "improve", note: "قصير", newScore: 3 }), ctx(weakItem)))).status).toBe(400);
    const imp = await json(await item.POST(req("", "POST", { action: "improve", note: "نُفذت ورشتان وأُعدّت الخطط لكل الصفوف", newScore: 3 }), ctx(weakItem)));
    expect(imp.body.status).toBe("IMPROVED");

    // المدرسة لا تعتمد تحسّنها بنفسها
    expect((await item.POST(req("", "POST", { action: "verify" }), ctx(weakItem))).status).toBe(403);

    await as(EMAILS.admin);
    const ov = await json(await overview.GET(req(`/api/self-assessment/overview?year=${year}`)));
    const row = ov.body.schools.find((x: any) => x.id === schoolId);
    expect(row).toMatchObject({ status: "SUBMITTED", improved: 1, weak: 1 });

    const v = await json(await item.POST(req("", "POST", { action: "verify", note: "تم التحقق ميدانياً" }), ctx(weakItem)));
    expect(v.body.status).toBe("VERIFIED");

    const h = await json(await item.GET(req(""), ctx(weakItem)));
    expect(h.body.history.map((x: any) => x.event)).toEqual(["RATED", "WEAK_FLAGGED", "PLAN_SET", "STARTED", "IMPROVED", "VERIFIED"]);
    const it2 = await q.queryOne<any>("SELECT baseline_score, score FROM self_assessment_items WHERE id = ?", [weakItem]);
    expect(it2).toMatchObject({ baseline_score: 1, score: 3 });
  });

  it("الشهادة تُبنى من الإنجاز الفعلي وتتحقق برمزها", async () => {
    await as(EMAILS.principal);
    expect((await certs.POST(req("/api/certificates", "POST", { schoolId, year }))).status).toBe(403);
    await as(EMAILS.admin);
    const g = await json(await certs.GET(req(`/api/certificates?schoolId=${schoolId}&year=${year}`)));
    expect(g.body.draft.eligible).toBe(true);
    expect(g.body.draft.body).toContain(year);
    expect(g.body.draft.body).toMatch(/المعيار|المعايير/);
    const c = await json(await certs.POST(req("/api/certificates", "POST", { schoolId, year })));
    expect(c.status).toBe(201);
    const v = await json(await verify.GET(req(""), { params: Promise.resolve({ code: c.body.certificate.code }) }));
    expect(v.body).toMatchObject({ valid: true, report: { kind: "certificate", status: "APPROVED" } });
  });

  it("لا تُطلب شهادة لمدرسة بلا إنجاز معتمد، ولا يرى المدير مدرسة غيره", async () => {
    await as(EMAILS.admin);
    const other = (await q.queryOne<any>("SELECT id FROM schools WHERE id <> ? LIMIT 1", [schoolId]))!.id;
    const g = await json(await certs.GET(req(`/api/certificates?schoolId=${other}&year=${year}`)));
    expect(g.body.draft.eligible).toBe(false);
    await as(EMAILS.principal);
    expect((await sa.GET(req(`/api/self-assessment?schoolId=${other}`))).status).toBe(403);
  });
});
