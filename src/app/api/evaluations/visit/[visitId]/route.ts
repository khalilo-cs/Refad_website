import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb, uuid, nowISO } from "@/lib/db/sqlite";
import { canAccessVisit } from "@/lib/scope";
import { clientIp } from "@/lib/security";
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

    const historyFor = new URL(request.url).searchParams.get("history");
    if (historyFor) {
      const rows = query(
        `SELECT h.field, h.old_value, h.new_value, h.reason, h.changed_at, u.name AS changed_by
         FROM evaluation_history h
         LEFT JOIN users u ON u.id = h.changed_by_id
         WHERE h.visit_id = ? AND h.indicator_id = ?
         ORDER BY h.changed_at DESC, h.rowid DESC LIMIT 100`,
        [visitId, historyFor]
      );
      return NextResponse.json({ history: rows });
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
      strengths: string | null;
      gaps: string | null;
    }>(
      `SELECT v.id, v.school_id, v.inspector_id, v.status, v.completion,
              COALESCE(v.started_at, v.scheduled_at, v.created_at) AS visit_date,
              s.name AS school_name, u.name AS inspector_name, v.strengths, v.gaps
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
      version: number;
      verification_methods: string | null;
      rated_at: string | null;
      created_at: string | null;
      updated_at: string | null;
      rated_by: string | null;
      evidence_total: number;
      evidence_accepted: number;
    }>(
      `SELECT e.indicator_id, e.status, e.score, e.notes, e.version, e.verification_methods,
              e.rated_at, e.created_at, e.updated_at, u.name AS rated_by,
              (SELECT COUNT(*) FROM evidence ev WHERE ev.evaluation_id = e.id) AS evidence_total,
              (SELECT COUNT(*) FROM evidence ev WHERE ev.evaluation_id = e.id AND ev.review_status = 'ACCEPTED') AS evidence_accepted
       FROM evaluations e LEFT JOIN users u ON u.id = e.rated_by_id
       WHERE e.visit_id = ?`,
      [visitId]
    );

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
        criterionId: c.criterionId,
        code: c.code,
        title: c.title,
        weight: c.weight,
        subCriteria: c.subCriteria.map((sc) => {
          const subRes = res?.subCriteria.find((r) => r.subCriterionId === sc.subCriterionId);
          return {
            ...subRes,
            subCriterionId: sc.subCriterionId,
            code: sc.code,
            title: sc.title,
            weight: sc.weight,
            indicators: sc.indicators.map((i) => {
              const raw = evidenceMap.get(i.indicatorId);
              return {
                ...i,
                evidence: raw ? JSON.parse(raw.evidence || "[]") : [],
                verificationTools: raw ? JSON.parse(raw.verification_tools || "[]") : [],
                notes: savedMap.get(i.indicatorId)?.notes ?? null,
                version: savedMap.get(i.indicatorId)?.version ?? 0,
                methods: JSON.parse(savedMap.get(i.indicatorId)?.verification_methods || "[]"),
                ratedBy: savedMap.get(i.indicatorId)?.rated_by ?? null,
                ratedAt: savedMap.get(i.indicatorId)?.rated_at ?? null,
                createdAt: savedMap.get(i.indicatorId)?.created_at ?? null,
                updatedAt: savedMap.get(i.indicatorId)?.updated_at ?? null,
                evidenceTotal: savedMap.get(i.indicatorId)?.evidence_total ?? 0,
                evidenceAccepted: savedMap.get(i.indicatorId)?.evidence_accepted ?? 0,
              };
            }),
          };
        }),
      };
    });

    return NextResponse.json({
      visit: { ...visit, locked: ["SUBMITTED", "COMPLETED", "CANCELLED"].includes(visit.status) },
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
 *   { indicatorId, status, score?, notes?, methods?, reason?, expectedVersion? }
 * - expectedVersion: النسخة التي رآها العميل. عند اختلافها يُرفض الحفظ بـ 409 مع القيمة الأحدث
 *   بدل الكتابة فوق تعديل أحدث دون تنبيه.
 * - تعديل درجة مقيَّمة سابقاً يتطلب سبباً ويُسجَّل في evaluation_history.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    const { visitId } = await params;

    if (!["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey)) {
      return NextResponse.json({ message: "التقييم الميداني مقصور على المفتش والإدارة" }, { status: 403 });
    }
    if (!canAccessVisit(session, visitId)) {
      return NextResponse.json({ message: "لا تملك صلاحية التقييم" }, { status: 403 });
    }
    const visit = queryOne<{ inspector_id: string; status: string; started_at: string | null }>(
      "SELECT inspector_id, status, started_at FROM visits WHERE id = ?",
      [visitId]
    );
    if (!visit) return NextResponse.json({ message: "الزيارة غير موجودة" }, { status: 404 });
    if (session.roleKey === "INSPECTOR" && visit.inspector_id !== session.userId) {
      return NextResponse.json({ message: "الحفظ مقصور على المفتش المسؤول عن الزيارة" }, { status: 403 });
    }
    if (["SUBMITTED", "COMPLETED", "CANCELLED"].includes(visit.status)) {
      return NextResponse.json(
        { message: "الزيارة مقفلة للتعديل (مقدَّمة أو معتمدة أو ملغاة). أعدها للتعديل أولاً.", locked: true },
        { status: 423 }
      );
    }

    const body = await request.json().catch(() => null);
    const { indicatorId, status, score, notes, methods, reason, expectedVersion } = body ?? {};

    if (!indicatorId || typeof indicatorId !== "string") {
      return NextResponse.json({ message: "معرّف المؤشر مطلوب" }, { status: 400 });
    }
    if (status !== "EVALUATED" && status !== "NOT_EVALUATED") {
      return NextResponse.json({ message: "الحالة يجب أن تكون EVALUATED أو NOT_EVALUATED" }, { status: 400 });
    }
    if (!queryOne("SELECT id FROM indicators WHERE id = ?", [indicatorId])) {
      return NextResponse.json({ message: "المؤشر غير موجود" }, { status: 404 });
    }
    const VALID_METHODS = ["فحص وثائق", "ملاحظة", "مقابلة"];
    const cleanMethods: string[] = Array.isArray(methods)
      ? [...new Set<string>(methods.filter((m: unknown): m is string => typeof m === "string" && VALID_METHODS.includes(m)))]
      : [];

    const maxScore = getMaxScore();
    let value = 0;
    if (status === "EVALUATED") {
      if (typeof score !== "number" || !Number.isInteger(score)) {
        return NextResponse.json({ message: "الدرجة يجب أن تكون عدداً صحيحاً" }, { status: 400 });
      }
      if (score < 0 || score > maxScore) {
        return NextResponse.json({ message: `الدرجة يجب أن تكون بين 0 و ${maxScore}` }, { status: 400 });
      }
      value = score;
    }
    const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 4000) : null;
    const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;

    const db = getDb();
    const now = nowISO();
    const existing = queryOne<{
      id: string; status: string; score: number; notes: string | null; version: number;
      verification_methods: string | null; rated_by_id: string | null; rated_at: string | null;
    }>("SELECT * FROM evaluations WHERE visit_id = ? AND indicator_id = ?", [visitId, indicatorId]);

    if (existing && typeof expectedVersion === "number" && expectedVersion !== existing.version) {
      const who = queryOne<{ name: string }>("SELECT name FROM users WHERE id = ?", [existing.rated_by_id ?? ""]);
      return NextResponse.json(
        {
          message: "تعارض: عُدّل هذا المؤشر بعد آخر تحميل لديك",
          conflict: true,
          server: {
            status: existing.status, score: existing.score, notes: existing.notes,
            version: existing.version, ratedBy: who?.name ?? null, ratedAt: existing.rated_at,
          },
        },
        { status: 409 }
      );
    }

    const changedScore = !!existing && existing.status === "EVALUATED" && (status !== "EVALUATED" || existing.score !== value);
    if (changedScore && !cleanReason) {
      return NextResponse.json({ message: "تعديل درجة مقيَّمة سابقاً يتطلب ذكر السبب", needReason: true }, { status: 422 });
    }

    const evalId = existing?.id ?? uuid();
    const methodsJson = JSON.stringify(cleanMethods);
    const tx = db.transaction(() => {
      if (!existing) {
        db.prepare(
          `INSERT INTO evaluations (id, visit_id, indicator_id, status, score, notes, verification_methods,
             rated_by_id, rated_at, created_by_id, created_at, updated_at, version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`
        ).run(evalId, visitId, indicatorId, status, value, cleanNotes, methodsJson, session.userId, now, session.userId, now, now);
      } else {
        db.prepare(
          `UPDATE evaluations SET status = ?, score = ?, notes = ?, verification_methods = ?,
             rated_by_id = ?, rated_at = ?, updated_at = ?, version = version + 1
           WHERE id = ?`
        ).run(status, value, cleanNotes, methodsJson, session.userId, now, now, evalId);
      }
      const hist = (field: string, oldV: unknown, newV: unknown) => {
        if (String(oldV ?? "") === String(newV ?? "")) return;
        db.prepare(
          `INSERT INTO evaluation_history (id, evaluation_id, field, old_value, new_value, changed_by_id, changed_at, reason, visit_id, indicator_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).run(uuid(), evalId, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV), session.userId, now, cleanReason, visitId, indicatorId);
      };
      hist("status", existing?.status ?? "NOT_EVALUATED", status);
      hist("score", existing ? (existing.status === "EVALUATED" ? existing.score : null) : null, status === "EVALUATED" ? value : null);
      hist("notes", existing?.notes ?? null, cleanNotes);
      hist("methods", existing?.verification_methods ?? "[]", methodsJson);

      // بدء الزيارة تلقائياً عند أول حفظ
      if (visit.status === "SCHEDULED" || visit.status === "POSTPONED") {
        db.prepare("UPDATE visits SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?").run(now, now, visitId);
      }
    });
    tx();

    const counts = queryOne<{ total: number; done: number }>(
      `SELECT (SELECT COUNT(*) FROM indicators) AS total,
              (SELECT COUNT(*) FROM evaluations WHERE visit_id = ? AND status = 'EVALUATED') AS done`,
      [visitId]
    );
    const completion = counts && counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
    db.prepare("UPDATE visits SET completion = ?, updated_at = ? WHERE id = ?").run(completion, now, visitId);

    auditLog({
      userId: session.userId,
      action: "EVALUATION_SCORE_SAVED",
      entityType: "evaluation",
      entityId: `${visitId}:${indicatorId}`,
      newValues: { status, score: value, reason: cleanReason },
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? null,
    });

    const fresh = queryOne<{ version: number; updated_at: string }>("SELECT version, updated_at FROM evaluations WHERE id = ?", [evalId]);
    return NextResponse.json({
      message: status === "EVALUATED" ? "تم حفظ الدرجة" : "تم تعيين المؤشر غير مقيَّم",
      completion,
      evaluationId: evalId,
      version: fresh?.version ?? 1,
      updatedAt: fresh?.updated_at ?? now,
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "تعذّر حفظ الدرجة", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined },
      { status: 500 }
    );
  }
}
