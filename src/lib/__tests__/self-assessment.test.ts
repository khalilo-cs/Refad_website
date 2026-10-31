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
const rate = (indicatorId: string, extra: object) => sa.PUT(req("/api/self-assessment", "PUT", { schoolId, year, indicatorId, evidenceHave: [], ...extra }));

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

  it("أداة التحقق والملاحظات والأدلة كما في الاستمارة الرسمية", async () => {
    await as(EMAILS.principal);
    const r = await json(await rate(indicators[5], { methods: ["فحص وثائق", "مقابلة"], notes: "تم الاطلاع على المحضر" }));
    expect(r.status).toBe(200);
    expect((await rate(indicators[5], { methods: ["شيء آخر"] })).status).toBe(400);
    const g = await json(await sa.GET(req(`/api/self-assessment?year=${year}`)));
    const ind = g.body.criteria.flatMap((c: any) => c.subs.flatMap((s: any) => s.indicators)).find((i: any) => i.indicatorId === indicators[5]);
    expect(ind.methods).toEqual(["فحص وثائق", "مقابلة"]);
    expect(ind.notes).toBe("تم الاطلاع على المحضر");
    expect(ind.evidence.length).toBeGreaterThan(0);
    expect(ind.isWeak).toBe(false);
    expect(g.body.criteria[0].weight).toBe(15);
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

describe("الاختبار التفاعلي", () => {
  it("إجباري: لا تقدير دون الإجابة عن سؤال الأدلة، وحالة الإلزام تظهر للمدير", async () => {
    await as(EMAILS.quality);
    const sid = (await q.queryOne<any>("SELECT school_id FROM users WHERE email = ?", [EMAILS.quality]))!.school_id;
    await q.exec("UPDATE self_assessments SET status = 'DRAFT' WHERE school_id = ? AND academic_year = ?", [sid, year]);
    const r = await sa.PUT(req("/api/self-assessment", "PUT", { schoolId: sid, year, indicatorId: indicators[0], score: 3 }));
    expect(r.status).toBe(422);
    // مؤشر لم يُجب عنه في الاختبار بعد
    await q.exec("UPDATE self_assessment_items SET evidence_have = NULL WHERE indicator_id = ? AND assessment_id = (SELECT id FROM self_assessments WHERE school_id = ? AND academic_year = ?)", [indicators[0], sid, year]);
    const status = (await import("@/app/api/self-assessment/status/route")) as any;
    const st = await (await status.GET()).json();
    expect(st.required).toBe(true);
    await as(EMAILS.admin);
    expect((await (await status.GET()).json()).required).toBe(false);
  });

  it("التقدير المقترح من نسبة الأدلة", async () => {
    const { suggestScore } = await import("../self-assessment-shared");
    const sc = [0, 1, 2, 3];
    expect(suggestScore(2, 2, sc)).toBe(3);
    expect(suggestScore(1, 2, sc)).toBe(2);
    expect(suggestScore(1, 3, sc)).toBe(1);
    expect(suggestScore(0, 3, sc)).toBe(0);
    expect(suggestScore(0, 0, sc)).toBeNull();
  });
  it("يحفظ الأدلة المتوفرة ويقبل فقط أدلة المؤشر نفسه", async () => {
    // مدرسة أخرى بمدير جديد حتى لا تتأثر بالاستمارة المرسلة أعلاه
    await as(EMAILS.quality);
    const sid = (await q.queryOne<any>("SELECT school_id FROM users WHERE email = ?", [EMAILS.quality]))!.school_id;
    const ind = await q.queryOne<any>("SELECT id, evidence FROM indicators WHERE evidence <> '[]' ORDER BY code DESC LIMIT 1");
    const ev = JSON.parse(ind.evidence);
    // نفس مدرسة المدير وقد أُرسلت أعلاه: نعيد فتحها كما تفعل الإدارة
    await q.exec("UPDATE self_assessments SET status = 'DRAFT' WHERE school_id = ? AND academic_year = ?", [sid, year]);
    const r = await sa.PUT(req("/api/self-assessment", "PUT", { schoolId: sid, year, indicatorId: ind.id, score: 3, evidenceHave: [ev[0], "دليل مختلق"] }));
    expect(r.status).toBe(200);
    const row = await q.queryOne<any>("SELECT evidence_have FROM self_assessment_items WHERE indicator_id = ? ORDER BY updated_at DESC LIMIT 1", [ind.id]);
    expect(JSON.parse(row.evidence_have)).toEqual([ev[0]]);
  });
});

describe("المتابعة على مستوى المديرية", () => {
  it("نقاط الضعف الشائعة والتذكير للإدارة فقط", async () => {
    const insights = (await import("@/app/api/self-assessment/insights/route")) as any;
    const remind = (await import("@/app/api/self-assessment/remind/route")) as any;
    await as(EMAILS.principal);
    expect((await insights.GET(req(`/api/self-assessment/insights?year=${year}`))).status).toBe(403);
    expect((await remind.POST(req("/api/self-assessment/remind", "POST", { schoolIds: [schoolId] }))).status).toBe(403);
    await as(EMAILS.admin);
    const g = await json(await insights.GET(req(`/api/self-assessment/insights?year=${year}`)));
    expect(g.status).toBe(200);
    expect(g.body.schools).toBeGreaterThan(0);
    expect(g.body.criteria.length).toBeGreaterThan(0);
    const r = await json(await remind.POST(req("/api/self-assessment/remind", "POST", { schoolIds: [schoolId], kind: "plans" })));
    expect(r.status).toBe(200);
    expect(r.body.schools[0].notified).toBeGreaterThan(0);
    const principalId = (await q.queryOne<any>("SELECT id FROM users WHERE email = ?", [EMAILS.principal]))!.id;
    expect(await q.queryOne("SELECT 1 FROM notifications WHERE user_id = ? AND title = 'تذكير: خطط التحسين'", [principalId])).toBeTruthy();
  });
});

describe("الشواهد والمقارنة بالعام السابق", () => {
  it("يعدّ الشواهد المرفوعة لكل مؤشر ويقارن بالعام السابق", async () => {
    await as(EMAILS.principal);
    const ind = indicators[3];
    const uploader = (await q.queryOne<any>("SELECT id FROM users WHERE email = ?", [EMAILS.principal]))!.id;
    await q.exec(
      "INSERT INTO evidence (id, name, original_name, mime_type, size, storage_key, url, school_id, indicator_id, uploaded_by_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ["ev-sa-1", "محضر", "m.pdf", "application/pdf", 10, "k", "/x", schoolId, ind, uploader]
    );
    // عام سابق مُرسل بنسبة معروفة
    const [y1] = year.split("-").map(Number);
    const prev = `${y1 - 1}-${y1}`;
    await q.exec("INSERT INTO self_assessments (id, school_id, academic_year, status) VALUES ('prev-a', ?, ?, 'SUBMITTED')", [schoolId, prev]);
    await q.exec("INSERT INTO self_assessment_items (id, assessment_id, indicator_id, score, baseline_score, is_weak) VALUES ('prev-i', 'prev-a', ?, 1, 1, 1)", [ind]);
    const g = await json(await sa.GET(req(`/api/self-assessment?year=${year}`)));
    const it = g.body.criteria.flatMap((c: any) => c.subs.flatMap((s: any) => s.indicators)).find((i: any) => i.indicatorId === ind);
    expect(it.files).toBe(1);
    expect(g.body.previous).toMatchObject({ year: prev, weak: 1, rated: 1 });
  });
});
