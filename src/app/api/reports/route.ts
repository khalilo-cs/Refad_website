import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";
import { computeEvaluation, normalizeCriteria, type RawCriterionInput } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"] as const;

/** يبني نطاق الرؤية حسب الدور. */
function scope(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  switch (session.roleKey) {
    case "SUPER_ADMIN":
    case "EDUCATION_DIRECTOR":
      return { sql: "AND 1 = 1", params: [] as string[] };
    case "INSPECTOR":
      return { sql: "AND r.generated_by_id = ?", params: [session.userId] as string[] };
    default:
      return { sql: "AND r.school_id = ?", params: [session.schoolId ?? ""] as string[] };
  }
}

/** يولّد رمز تحقق فريداً قصيراً للتقرير. */
function generateVerificationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * GET /api/reports — قائمة التقارير بنطاق الدور.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 100);
    const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1);
    const offset = (page - 1) * limit;
    const status = searchParams.get("status");

    const s = scope(session);
    let where = `WHERE 1 = 1 ${s.sql}`;
    const params = [...s.params];
    if (status && VALID_STATUSES.includes(status as any)) {
      where += " AND r.status = ?";
      params.push(status);
    }

    const total = queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM reports r ${where}`, params);

    const reports = query(
      `SELECT r.id, r.number, r.title, r.type, r.status, r.period_start, r.period_end,
              r.verification_code, r.approved_at, r.pdf_url, r.summary,
              r.rejection_reason, r.created_at,
              s.name AS school_name, u.name AS generated_by_name,
              a.name AS approved_by_name
       FROM reports r
       LEFT JOIN schools s ON r.school_id = s.id
       LEFT JOIN users u ON r.generated_by_id = u.id
       LEFT JOIN users a ON r.approved_by_id = a.id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    return NextResponse.json({
      reports,
      total: total?.n ?? 0,
      page,
      limit,
      totalPages: Math.ceil((total?.n ?? 0) / limit),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحميل التقارير",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports — توليد تقرير من زيارة، مع حساب النتيجة وتثبيتها.
 * لا يُعلن التقرير معتمداً؛ يُنشأ دائماً كمسودة أو قيد المراجعة.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    const canGenerate = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(
      session.roleKey
    );
    if (!canGenerate) {
      return NextResponse.json({ message: "توليد التقارير غير متاح لدورك" }, { status: 403 });
    }

    const body = await request.json();
    const { visitId, title, status } = body ?? {};

    if (!visitId || typeof visitId !== "string") {
      return NextResponse.json({ message: "الزيارة مطلوبة" }, { status: 400 });
    }
    if (status && !["DRAFT", "UNDER_REVIEW"].includes(status)) {
      return NextResponse.json(
        { message: "يمكن إنشاء التقرير كمسودة أو قيد المراجعة فقط" },
        { status: 400 }
      );
    }

    const visit = queryOne<{ id: string; school_id: string; inspector_id: string; school_name: string }>(
      `SELECT v.id, v.school_id, v.inspector_id, s.name AS school_name
       FROM visits v JOIN schools s ON v.school_id = s.id WHERE v.id = ?`,
      [visitId]
    );
    if (!visit) {
      return NextResponse.json({ message: "الزيارة غير موجودة" }, { status: 404 });
    }

    if (session.roleKey === "INSPECTOR" && visit.inspector_id !== session.userId) {
      return NextResponse.json(
        { message: "لا يمكنك توليد تقرير لزيارة ليست لك" },
        { status: 403 }
      );
    }

    // حساب النتيجة من البيانات المحفوظة
    const criteriaRows = query<{ id: string; code: string; title: string; weight: number }>(
      "SELECT id, code, title, weight FROM criteria ORDER BY order_index"
    );
    const subRows = query<{ id: string; code: string; title: string; weight: number; criterion_id: string }>(
      "SELECT id, code, title, weight, criterion_id FROM sub_criteria ORDER BY order_index"
    );
    const indRows = query<{ id: string; code: string; title: string; sub_criterion_id: string | null; criterion_id: string | null }>(
      "SELECT id, code, title, sub_criterion_id, criterion_id FROM indicators ORDER BY order_index"
    );
    const savedRows = query<{ indicator_id: string; status: string; score: number }>(
      "SELECT indicator_id, status, score FROM evaluations WHERE visit_id = ?",
      [visitId]
    );
    const savedMap = new Map(savedRows.map((r) => [r.indicator_id, r]));

    const maxRow = queryOne<{ m: number }>(
      "SELECT MAX(score) AS m FROM rating_scale WHERE is_active = 1"
    );
    const maxScore = maxRow?.m && maxRow.m > 0 ? maxRow.m : 3;

    const raws: RawCriterionInput[] = criteriaRows.map((c) => {
      const cSubs = subRows.filter((s) => s.criterion_id === c.id);
      const toInput = (i: typeof indRows[number]) => {
        const saved = savedMap.get(i.id);
        return {
          indicatorId: i.id,
          code: i.code,
          title: i.title,
          subCriterionId: i.sub_criterion_id ?? `${c.id}-flat`,
          status: (saved?.status === "EVALUATED" ? "EVALUATED" : "NOT_EVALUATED") as
            | "EVALUATED"
            | "NOT_EVALUATED",
          score: saved?.status === "EVALUATED" ? saved.score : null,
        };
      };

      if (cSubs.length > 0) {
        return {
          criterionId: c.id,
          code: c.code,
          title: c.title,
          weight: c.weight,
          subCriteria: cSubs.map((s) => ({
            subCriterionId: s.id,
            code: s.code,
            title: s.title,
            weight: s.weight,
            indicators: indRows.filter((i) => i.sub_criterion_id === s.id).map(toInput),
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
        flatIndicators: indRows
          .filter((i) => i.criterion_id === c.id && !i.sub_criterion_id)
          .map(toInput),
      };
    });

    const result = computeEvaluation(normalizeCriteria(raws), maxScore);

    if (result.reportState === "DRAFT_INCOMPLETE") {
      // يُسمح بالتوليد، لكن التقرير يبقى موسوماً كمسودة غير مكتملة صراحةً.
      if (status === "UNDER_REVIEW") {
        return NextResponse.json(
          {
            message:
              "لا يمكن رفع تقرير غير مكتمل للمراجعة. أكمل تقييم جميع المؤشرات أولاً.",
            completion: result.completionPercent,
          },
          { status: 400 }
        );
      }
    }

    const count = queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM reports");
    const number = `RIF-${new Date().getFullYear()}-${String((count?.n ?? 0) + 1).padStart(4, "0")}`;
    const id = uuid();
    const now = nowISO();

    const summary = JSON.stringify({
      totalScore: result.totalScore,
      completionPercent: result.completionPercent,
      reportState: result.reportState,
      evaluatedIndicators: result.evaluatedIndicators,
      totalIndicators: result.totalIndicators,
      warnings: result.warnings,
      criteria: result.criteria.map((c) => ({
        code: c.code,
        title: c.title,
        weight: c.weight,
        achievementPercent: c.achievementPercent,
        contribution: c.contribution,
      })),
    });

    getDb()
      .prepare(
        `INSERT INTO reports (id, number, title, type, school_id, status, generated_by_id,
                              verification_code, summary, created_at, updated_at)
         VALUES (?, ?, ?, 'SCHOOL_EVALUATION', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        number,
        typeof title === "string" && title.trim()
          ? title.trim()
          : `تقرير تقييم — ${visit.school_name}`,
        visit.school_id,
        status ?? "DRAFT",
        session.userId,
        generateVerificationCode(),
        summary,
        now,
        now
      );

    auditLog({
      userId: session.userId,
      action: "REPORT_GENERATED",
      entityType: "report",
      entityId: id,
      newValues: { visitId, number, status: status ?? "DRAFT" },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return NextResponse.json(
      { id, number, message: "تم توليد التقرير", result },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر توليد التقرير",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
