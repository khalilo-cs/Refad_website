import { NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb } from "@/lib/db/sqlite";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const TYPES = ["criterion", "subCriterion", "indicator"] as const;
type Kind = (typeof TYPES)[number];

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function parseJsonArray(raw: unknown): string | null {
  if (raw == null || raw === "") return "[]";
  if (Array.isArray(raw)) return JSON.stringify(raw.map((x) => String(x).trim()).filter(Boolean));
  if (typeof raw === "string") {
    const parts = raw
      .split(/\r?\n|،|;/)
      .map((x) => x.trim())
      .filter(Boolean);
    return JSON.stringify(parts);
  }
  return null;
}

/**
 * GET /api/admin/structure
 * يعيد الشجرة الكاملة: معايير ← معايير فرعية ← مؤشرات، مع أوزان التحقق
 * والإحصاءات اللازمة لشاشة الإدارة.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN"] });
  if (!allowed) return bad("هذه الشاشة مخصّصة لمدير النظام", 403);

  const criteria = query<any>(
    `SELECT id, code, title, weight, order_index FROM criteria ORDER BY order_index, code`
  );
  const subs = query<any>(
    `SELECT id, code, title, weight, order_index, criterion_id FROM sub_criteria ORDER BY order_index, code`
  );
  const indicators = query<any>(
    `SELECT id, code, title, evidence, verification_tools, order_index, criterion_id, sub_criterion_id,
            (SELECT COUNT(*) FROM evaluations e WHERE e.indicator_id = indicators.id) AS evaluations_count
     FROM indicators ORDER BY order_index, code`
  );

  const tree = criteria.map((c) => {
    const cSubs = subs
      .filter((s) => s.criterion_id === c.id)
      .map((s) => ({
        ...s,
        evidence: undefined,
        indicators: indicators
          .filter((i) => i.sub_criterion_id === s.id)
          .map((i) => ({ ...i, evidence: safeParse(i.evidence), verification_tools: safeParse(i.verification_tools) })),
      }));
    const direct = indicators
      .filter((i) => i.criterion_id === c.id && !i.sub_criterion_id)
      .map((i) => ({ ...i, evidence: safeParse(i.evidence), verification_tools: safeParse(i.verification_tools) }));
    const subWeightSum = cSubs.reduce((a: number, s: any) => a + Number(s.weight), 0);
    return {
      ...c,
      subCriteria: cSubs,
      directIndicators: direct,
      indicatorsCount:
        cSubs.reduce((a: number, s: any) => a + s.indicators.length, 0) + direct.length,
      subWeightSum,
      subWeightOk: cSubs.length === 0 || subWeightSum === Number(c.weight),
    };
  });

  const totalWeight = criteria.reduce((a, c) => a + Number(c.weight), 0);
  const subCriteria = subs.map((s) => ({ ...s, indicators: [] as any[] }));

  return NextResponse.json({
    criteria: tree,
    allSubCriteria: subCriteria,
    totalWeight,
    weightOk: totalWeight === 100,
    counts: {
      criteria: criteria.length,
      subCriteria: subs.length,
      indicators: indicators.length,
    },
  });
}

function safeParse(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** POST /api/admin/structure — إنشاء معيار أو معيار فرعي أو مؤشر. */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN"] });
  if (!allowed) return bad("غير مصرح", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const kind = String(body.kind ?? body.type ?? "") as Kind;
  if (!TYPES.includes(kind)) return bad("نوع العنصر غير معروف");

  const name = String(body.title ?? body.name ?? "").trim();
  if (name.length < 2) return bad("اسم العنصر قصير جداً");
  if (name.length > 500) return bad("اسم العنصر طويل جداً");

  const code = String(body.code ?? "").trim();
  if (kind !== "indicator" && !/^[0-9]+(-[0-9]+)?$/.test(code))
    return bad("الرمز يجب أن يكون رقماً (مثل 8) أو رقماً بفاصلة (مثل 8-1)");

  const db = getDb();
  const id = randomUUID();

  try {
    if (kind === "criterion") {
      if (queryOne("SELECT id FROM criteria WHERE code = ?", [code]))
        return bad("رمز المعيار مستخدم مسبقاً");
      const weight = Number(body.weight ?? 0);
      if (!Number.isFinite(weight) || weight < 0 || weight > 100)
        return bad("الوزن يجب أن يكون بين 0 و100");
      const next =
        (queryOne<{ m: number | null }>("SELECT MAX(order_index) m FROM criteria")?.m ?? 0) + 1;
      db.prepare(
        "INSERT INTO criteria (id, code, title, weight, order_index) VALUES (?,?,?,?,?)"
      ).run(id, code, name, Math.round(weight), next);
    } else if (kind === "subCriterion") {
      const criterionId = String(body.criterionId ?? "");
      if (!queryOne("SELECT id FROM criteria WHERE id = ?", [criterionId]))
        return bad("المعيار الأب غير موجود");
      if (queryOne("SELECT id FROM sub_criteria WHERE code = ?", [code]))
        return bad("رمز المعيار الفرعي مستخدم مسبقاً");
      const weight = Number(body.weight ?? 0);
      if (!Number.isFinite(weight) || weight <= 0)
        return bad("وزن المعيار الفرعي يجب أن يكون أكبر من صفر");
      const next =
        (queryOne<{ m: number | null }>(
          "SELECT MAX(order_index) m FROM sub_criteria WHERE criterion_id = ?",
          [criterionId]
        )?.m ?? 0) + 1;
      db.prepare(
        "INSERT INTO sub_criteria (id, code, title, weight, order_index, criterion_id) VALUES (?,?,?,?,?,?)"
      ).run(id, code, name, Math.round(weight), next, criterionId);
    } else {
      let criterionId = String(body.criterionId ?? "");
      const subId = body.subCriterionId ? String(body.subCriterionId) : null;
      if (subId) {
        const sub = queryOne<{ criterion_id: string }>(
          "SELECT criterion_id FROM sub_criteria WHERE id = ?",
          [subId]
        );
        if (!sub) return bad("المعيار الفرعي غير موجود");
        criterionId = sub.criterion_id;
      }
      if (!criterionId || !queryOne("SELECT id FROM criteria WHERE id = ?", [criterionId]))
        return bad("يجب تحديد المعيار أو المعيار الفرعي التابع له المؤشر");
      if (queryOne("SELECT id FROM indicators WHERE code = ?", [code]))
        return bad("رمز المؤشر مستخدم مسبقاً");
      const evidence = parseJsonArray(body.evidence);
      const tools = parseJsonArray(body.verificationTools);
      if (evidence === null || tools === null) return bad("صيغة قائمة الأدلة غير صحيحة");
      const next =
        (queryOne<{ m: number | null }>(
          "SELECT MAX(order_index) m FROM indicators WHERE criterion_id = ?",
          [criterionId]
        )?.m ?? 0) + 1;
      db.prepare(
        `INSERT INTO indicators (id, code, title, evidence, verification_tools, order_index, criterion_id, sub_criterion_id)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(id, code, name, evidence, tools, next, criterionId, subId);
    }

    auditLog({
      userId: session.userId,
      action: `CREATE_${kind.toUpperCase()}`,
      entityType: kind === "subCriterion" ? "sub_criterion" : kind,
      entityId: id,
      newValues: { code, name },
    });

    return NextResponse.json({ id, message: "تمت الإضافة بنجاح" }, { status: 201 });
  } catch (e: any) {
    return bad("تعذّرت الإضافة: " + (e?.message ?? "خطأ غير معروف"), 500);
  }
}
