import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";
import {
  computeEvaluation,
  normalizeCriteria,
  validateWeights,
  type RawCriterionInput,
  type IndicatorInput,
} from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CriterionRow = {
  id: string;
  code: string;
  title: string;
  weight: number;
  order_index: number;
};

type SubRow = {
  id: string;
  code: string;
  title: string;
  weight: number;
  criterion_id: string;
  order_index: number;
};

type IndicatorRow = {
  id: string;
  code: string;
  title: string;
  sub_criterion_id: string | null;
  criterion_id: string | null;
  order_index: number;
};

/** يقرأ الدرجة العظمى من مقياس التقدير النشط. */
function getMaxScore(): number {
  const row = queryOne<{ maxScore: number }>(
    "SELECT MAX(score) AS maxScore FROM rating_scale WHERE is_active = 1"
  );
  return row?.maxScore && row.maxScore > 0 ? row.maxScore : 3;
}

/** يتحقق أن المستخدم يستطيع الوصول إلى الزيارة. */
function canAccessVisit(
  session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>,
  visitId: string
): boolean {
  const visit = queryOne<{ school_id: string; inspector_id: string; directorate_id: string | null }>(
    `SELECT v.school_id, v.inspector_id, s.directorate_id
     FROM visits v JOIN schools s ON v.school_id = s.id
     WHERE v.id = ?`,
    [visitId]
  );
  if (!visit) return false;

  switch (session.roleKey) {
    case "SUPER_ADMIN":
    case "EDUCATION_DIRECTOR":
      return true;
    case "INSPECTOR":
      return visit.inspector_id === session.userId;
    case "SCHOOL_PRINCIPAL":
    case "QUALITY_COORDINATOR":
      return visit.school_id === session.schoolId;
    default:
      return false;
  }
}

/**
 * GET /api/evaluations/visit/[visitId]
 * يعيد بنية الاستمارة كاملة مع الدرجات المحفوظة والنتيجة المحسوبة.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    }

    const { visitId } = await params;
    if (!canAccessVisit(session, visitId)) {
      return NextResponse.json({ message: "لا تملك صلاحية الوصول إلى هذه الزيارة" }, { status: 403 });
    }

    const visit = queryOne<{
      id: string;
      school_id: string;
      inspector_id: string;
      status: string;
      completion: number;
      school_name: string;
      inspector_name: string;
      visit_date: string | null;
    }>(
      `SELECT v.id, v.school_id, v.inspector_id, v.status, v.completion,
              COALESCE(v.started_at, v.scheduled_at, v.created_at) AS visit_date,
              s.name AS school_name, u.name AS inspector_name
       FROM visits v
       JOIN schools s ON v.school_id = s.id
       JOIN users u ON v.inspector_id = u.id
       WHERE v.id = ?`,
      [visitId]
    );

    if (!visit) {
      return NextResponse.json({ message: "الزيارة غير موجودة" }, { status: 404 });
    }

    const criteria = query<CriterionRow>(
      "SELECT id, code, title, weight, order_index FROM criteria ORDER BY order_index"
    );
    const subs = query<SubRow>(
      "SELECT id, code, title, weight, criterion_id, order_index FROM sub_criteria ORDER BY order_index"
    );
    const indicators = query<IndicatorRow>(
      `SELECT id, code, title, sub_criterion_id, criterion_id, order_index
       FROM indicators ORDER BY order_index`
    );
    const saved = query<{
      indicator_id: string;
      status: string;
      score: number;
      notes: string | null;
    }>("SELECT indicator_id, status, score, notes FROM evaluations WHERE visit_id = ?", [visitId]);

    const savedMap = new Map(saved.map((s) => [s.indicator_id, s]));
    const maxScore = getMaxScore();

    // بناء البنية: معيار ← معايير فرعية ← مؤشرات، مع معالجة المعايير بلا معايير فرعية.
    const raws: RawCriterionInput[] = criteria.map((c) => {
      const criterionSubs = subs.filter((s) => s.criterion_id === c.id);

      const mapIndicator = (i: IndicatorRow): IndicatorInput => {
        const s = savedMap.get(i.id);
        const evaluated = s?.status === "EVALUATED";
        return {
          indicatorId: i.id,
          code: i.code,
          title: i.title,
          subCriterionId: i.sub_criterion_id ?? `${c.id}-flat`,
          status: evaluated ? "EVALUATED" : "NOT_EVALUATED",
          score: evaluated ? (s?.score ?? 0) : null,
        };
      };

      if (criterionSubs.length > 0) {
        return {
          criterionId: c.id,
          code: c.code,
          title: c.title,
          weight: c.weight,
          subCriteria: criterionSubs.map((s) => ({
            subCriterionId: s.id,
            code: s.code,
            title: s.title,
            weight: s.weight,
            indicators: indicators
              .filter((i) => i.sub_criterion_id === s.id)
              .map(mapIndicator),
          })),
          flatIndicators: null,
        };
      }

      return {
        criterionId: c.id,
        code: c.code,
        title: c.title,
        weight: c.weight,
        subCriteria: null,
        flatIndicators: indicators
          .filter((i) => i.criterion_id === c.id && !i.sub_criterion_id)
          .map(mapIndicator),
      };
    });

    const normalized = normalizeCriteria(raws);
    const result = computeEvaluation(normalized, maxScore);
    const weightErrors = validateWeights(normalized);

    // نصوص المؤشرات الأصلية وأدلتها للعرض
    const evidenceRows = query<{ id: string; evidence: string; verification_tools: string }>(
      "SELECT id, evidence, verification_tools FROM indicators"
    );
    const evidenceMap = new Map(evidenceRows.map((e) => [e.id, e]));

    const detail = normalized.map((c) => {
      const res = result.criteria.find((r) => r.criterionId === c.criterionId);
      return {
        ...res,
        subCriteria: c.subCriteria.map((sc) => {
          const subRes = res?.subCriteria.find((r) => r.subCriterionId === sc.subCriterionId);
          return {
            ...subRes,
            indicators: sc.indicators.map((i) => {
              const raw = evidenceMap.get(i.indicatorId);
              return {
                ...i,
                evidence: raw ? JSON.parse(raw.evidence || "[]") : [],
                verificationTools: raw ? JSON.parse(raw.verification_tools || "[]") : [],
                notes: savedMap.get(i.indicatorId)?.notes ?? null,
              };
            }),
          };
        }),
      };
    });

    return NextResponse.json({
      visit,
      maxScore,
      result,
      criteria: detail,
      weightErrors,
      ratingScale: query("SELECT key, label_ar, score FROM rating_scale WHERE is_active = 1 ORDER BY order_index"),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحميل التقييم",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/evaluations/visit/[visitId]
 * يحفظ درجة مؤشر واحد. الجسم:
 *   { indicatorId, status: "EVALUATED" | "NOT_EVALUATED", score?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    }

    const { visitId } = await params;

    // الحفظ يقتصر على المقيّم المخوّل: المفتاح صاحب الزيارة، أو مدير النظام.
    const allowed =
      session.roleKey === "SUPER_ADMIN" || session.roleKey === "EDUCATION_DIRECTOR";
    if (!allowed && !canAccessVisit(session, visitId)) {
      return NextResponse.json({ message: "لا تملك صلاحية التقييم" }, { status: 403 });
    }
    if (!allowed) {
      const visit = queryOne<{ inspector_id: string }>(
        "SELECT inspector_id FROM visits WHERE id = ?",
        [visitId]
      );
      if (!visit || visit.inspector_id !== session.userId) {
        return NextResponse.json(
          { message: "الحفظ مقصور على المفتش المسؤول عن الزيارة" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { indicatorId, status, score, notes } = body ?? {};

    if (!indicatorId || typeof indicatorId !== "string") {
      return NextResponse.json({ message: "معرّف المؤشر مطلوب" }, { status: 400 });
    }
    if (status !== "EVALUATED" && status !== "NOT_EVALUATED") {
      return NextResponse.json(
        { message: "الحالة يجب أن تكون EVALUATED أو NOT_EVALUATED" },
        { status: 400 }
      );
    }

    const indicator = queryOne<{ id: string }>("SELECT id FROM indicators WHERE id = ?", [
      indicatorId,
    ]);
    if (!indicator) {
      return NextResponse.json({ message: "المؤشر غير موجود" }, { status: 404 });
    }

    const maxScore = getMaxScore();
    let value = 0;

    if (status === "EVALUATED") {
      if (typeof score !== "number" || !Number.isInteger(score)) {
        return NextResponse.json({ message: "الدرجة يجب أن تكون عدداً صحيحاً" }, { status: 400 });
      }
      if (score < 0 || score > maxScore) {
        return NextResponse.json(
          { message: `الدرجة يجب أن تكون بين 0 و ${maxScore}` },
          { status: 400 }
        );
      }
      value = score;
    }

    const db = getDb();
    const now = nowISO();

    db.prepare(
      `INSERT INTO evaluations (id, visit_id, indicator_id, status, score, notes, rated_by_id, rated_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(visit_id, indicator_id) DO UPDATE SET
         status = excluded.status,
         score = excluded.score,
         notes = excluded.notes,
         rated_by_id = excluded.rated_by_id,
         rated_at = excluded.rated_at,
         updated_at = excluded.updated_at,
         version = evaluations.version + 1`
    ).run(
      uuid(),
      visitId,
      indicatorId,
      status,
      value,
      typeof notes === "string" && notes.trim() ? notes.trim() : null,
      session.userId,
      now,
      now
    );

    // تحديث نسبة إكمال الزيارة
    const counts = queryOne<{ total: number; done: number }>(
      `SELECT
         (SELECT COUNT(*) FROM indicators) AS total,
         (SELECT COUNT(*) FROM evaluations WHERE visit_id = ? AND status = 'EVALUATED') AS done`,
      [visitId]
    );
    const completion =
      counts && counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
    db.prepare("UPDATE visits SET completion = ?, updated_at = ? WHERE id = ?").run(
      completion,
      now,
      visitId
    );

    auditLog({
      userId: session.userId,
      action: "EVALUATION_SCORE_SAVED",
      entityType: "evaluation",
      entityId: `${visitId}:${indicatorId}`,
      newValues: { status, score: value, notes },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({
      message: status === "EVALUATED" ? "تم حفظ الدرجة" : "تم تعيين المؤشر غير مقيَّم",
      completion,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر حفظ الدرجة",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
