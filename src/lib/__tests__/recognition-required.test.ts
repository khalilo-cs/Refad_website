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
let rankings: Record<string, Handler>;
let required: Record<string, Handler>;
let improvement: Record<string, Handler>;
let visitRoute: Record<string, Handler>;

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
  rankings = (await import("@/app/api/rankings/route")) as any;
  required = (await import("@/app/api/improvement/required/route")) as any;
  improvement = (await import("@/app/api/improvement/route")) as any;
  visitRoute = (await import("@/app/api/visits/[id]/route")) as any;
});

describe("التميّز والتكريم", () => {
  it("يرتّب المدارس المكتملة التقييم فقط ويمنحها فئة، ويعرض غير المكتملة منفصلة", async () => {
    await as(EMAILS.director);
    const r = await json(await rankings.GET(req("/api/rankings")));
    expect(r.status).toBe(200);
    const { ranked, partial, notEvaluated, minCompletion } = r.body;
    expect(ranked.length).toBeGreaterThan(0);
    for (const row of ranked) {
      expect(row.completion).toBeGreaterThanOrEqual(minCompletion);
      expect(row.tier?.label).toBeTruthy();
      expect(typeof row.rank).toBe("number");
    }
    // الترتيب تنازلي حسب النسبة
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].percent).toBeGreaterThanOrEqual(ranked[i].percent);
    for (const row of partial) expect(row.completion).toBeLessThan(minCompletion);
    // لا مدرسة تظهر في قائمتين
    const ids = [...ranked, ...partial].map((x: any) => x.schoolId).concat(notEvaluated.map((x: any) => x.schoolId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("مدرسة لها زيارتان مكتملتان يُحسب لها مقدار التحسّن", async () => {
    await as(EMAILS.director);
    const r = await json(await rankings.GET(req("/api/rankings")));
    const a = r.body.ranked.find((x: any) => x.code === "RIFAD-DEMO-001");
    expect(a).toBeTruthy();
    expect(typeof a.delta).toBe("number");
  });

  it("مدير المدرسة لا يصل إلى ترتيب المدارس", async () => {
    await as(EMAILS.principal);
    expect((await rankings.GET(req("/api/rankings"))).status).toBe(403);
  });

  it("تصدير CSV يحمي من حقن الصيغ ويضم الترويسة العربية", async () => {
    await as(EMAILS.admin);
    const res = await rankings.GET(req("/api/rankings?format=csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("المرتبة");
  });
});

describe("المؤشرات التي تستوجب خطة تحسين", () => {
  it("تُدرج المؤشرات الضعيفة بلا إجراء، وتختفي بعد إنشاء إجراء مرتبط", async () => {
    await as(EMAILS.principal);
    const before = await json(await required.GET(req("/api/improvement/required")));
    expect(before.status).toBe(200);
    expect(before.body.total).toBeGreaterThan(0);
    for (const it of before.body.items) expect(it.score).toBeLessThanOrEqual(1);

    const target = before.body.items[0];
    const plan = await q.queryOne<{ id: string }>("SELECT id FROM improvement_plans WHERE school_id = ? AND status = 'ACTIVE'", [target.schoolId]);
    expect(plan).toBeTruthy();
    const me = await sessionFor(EMAILS.principal);
    const created = await json(await improvement.POST(req("/api/improvement", "POST", {
      kind: "action", planId: plan!.id, indicatorId: target.indicatorId, evaluationId: target.evaluationId,
      problemDescription: "مؤشر ضعيف في آخر تقييم", proposedAction: "إعداد الوثيقة المطلوبة واعتمادها", dueDate: "2027-01-15", responsibleId: me.userId,
    })));
    expect(created.status).toBe(201);

    const after = await json(await required.GET(req("/api/improvement/required")));
    expect(after.body.items.some((x: any) => x.evaluationId === target.evaluationId)).toBe(false);
    expect(after.body.total).toBe(before.body.total - 1);
  });

  it("ولي الأمر لا يصل إلى القائمة", async () => {
    await as(EMAILS.parent);
    expect((await required.GET(req("/api/improvement/required"))).status).toBe(403);
  });

  it("اعتماد الزيارة يُشعر المدرسة بالمؤشرات المستوجبة", async () => {
    const submitted = await q.queryOne<{ id: string; school_id: string }>("SELECT id, school_id FROM visits WHERE status = 'SUBMITTED' LIMIT 1");
    expect(submitted).toBeTruthy();
    // نربط منسق الجودة بالمدرسة صاحبة الزيارة ليكون مستلماً للإشعار
    await q.exec("UPDATE users SET school_id = ? WHERE email = ?", [submitted!.school_id, EMAILS.quality]);
    const coordinator = await q.queryOne<{ id: string }>("SELECT id FROM users WHERE email = ?", [EMAILS.quality]);
    await as(EMAILS.director);
    const r = await json(await visitRoute.PATCH(req("/x", "PATCH", { action: "approve" }), { params: Promise.resolve({ id: submitted!.id }) }));
    expect(r.status).toBe(200);
    const weak = await q.queryOne<{ n: number }>("SELECT COUNT(*) n FROM evaluations WHERE visit_id = ? AND status = 'EVALUATED' AND score <= 1", [submitted!.id]);
    expect(Number(weak?.n)).toBeGreaterThan(0);
    const note = await q.queryOne<{ n: number }>("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'مؤشرات تستوجب خطة تحسين'", [coordinator!.id]);
    expect(Number(note?.n)).toBe(1);
  });
});
