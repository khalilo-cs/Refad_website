import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth";
import { exec, nowISO, query, queryOne, uuid } from "@/lib/db/sqlite";
import {
  buildTree, canFill, canView, currentAcademicYear, getAssessment, getOrCreateAssessment, isWeakScore, logEvent, normalizeYear,
  notifyReviewers, submitBlockers,
} from "@/lib/self-assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET /api/self-assessment?schoolId=&year= — الاستمارة كاملة مع حالة كل مؤشر وملخص. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  const sp = request.nextUrl.searchParams;
  const schoolId = sp.get("schoolId") || session.schoolId || "";
  if (!schoolId) return bad("اختر مدرسة");
  if (!(await canView(session, schoolId))) return bad("لا تملك صلاحية الاطلاع على استمارة هذه المدرسة", 403);
  const year = normalizeYear(sp.get("year"));

  const school = await queryOne<any>(
    "SELECT s.id, s.name, s.code, s.principal_name, d.name AS directorate_name FROM schools s JOIN directorates d ON d.id = s.directorate_id WHERE s.id = ?",
    [schoolId]
  );
  if (!school) return bad("المدرسة غير موجودة", 404);
  const fill = canFill(session, schoolId);
  const assessment = fill ? await getOrCreateAssessment(schoolId, year) : await getAssessment(schoolId, year);
  const { criteria, summary, maxScore } = await buildTree(assessment?.id ?? null);
  const scale = await query<any>("SELECT key, label_ar, score FROM rating_scale WHERE is_active = 1 ORDER BY order_index");
  const years = (await query<{ academic_year: string }>("SELECT academic_year FROM self_assessments WHERE school_id = ? ORDER BY academic_year DESC", [schoolId])).map((r) => r.academic_year);
  if (!years.includes(currentAcademicYear())) years.unshift(currentAcademicYear());

  return NextResponse.json({
    school, year, years,
    assessment: assessment ? { id: assessment.id, status: assessment.status, submittedAt: assessment.submitted_at } : null,
    canFill: fill, canReview: !fill,
    locked: assessment?.status === "SUBMITTED",
    scale, maxScore, criteria, summary, blockers: submitBlockers(summary),
  });
}

const rateSchema = z.object({
  schoolId: z.string().min(1),
  year: z.string().optional(),
  indicatorId: z.string().min(1),
  score: z.number().int().min(0).max(10).nullable().optional(),
  isWeak: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * PUT /api/self-assessment — تقييم مؤشر أو تحديده نقطة ضعف (المدير/منسق الجودة لمدرسته).
 * الدرجة الضعيفة أو علامة الضعف تجعل المؤشر «بانتظار خطة» فوراً، وتظهر للإدارة.
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  const parsed = rateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("بيانات غير صالحة");
  const { schoolId, indicatorId } = parsed.data;
  if (!canFill(session, schoolId)) return bad("تعبئة الاستمارة لمدير المدرسة ومنسق الجودة فيها فقط", 403);
  if (session.mustChangePassword) return bad("يجب تغيير كلمة المرور أولاً", 403);
  const year = normalizeYear(parsed.data.year);
  const a = await getOrCreateAssessment(schoolId, year);
  if (a.status === "SUBMITTED") return bad("الاستمارة مُرسلة. التقييم مقفل؛ حدّث حالة المعالجة من خلال خطوات التحسين، أو اطلب من الإدارة إعادة فتحها.", 409);
  if (!(await queryOne("SELECT id FROM indicators WHERE id = ?", [indicatorId]))) return bad("المؤشر غير موجود", 404);
  if (parsed.data.score != null && !(await queryOne("SELECT 1 FROM rating_scale WHERE is_active = 1 AND score = ?", [parsed.data.score]))) return bad("درجة غير موجودة في مقياس التقدير");

  let item = await queryOne<any>("SELECT * FROM self_assessment_items WHERE assessment_id = ? AND indicator_id = ?", [a.id, indicatorId]);
  const now = nowISO();
  if (!item) {
    const id = uuid();
    await exec("INSERT INTO self_assessment_items (id, assessment_id, indicator_id, created_at, updated_at) VALUES (?,?,?,?,?)", [id, a.id, indicatorId, now, now]);
    item = await queryOne<any>("SELECT * FROM self_assessment_items WHERE id = ?", [id]);
  }

  const score = parsed.data.score !== undefined ? parsed.data.score : item.score;
  // الضعف: درجة ضعيفة، أو علامة يضعها المدير يدوياً على أي مؤشر يراه ضعيفاً
  const manual = parsed.data.isWeak;
  let status = item.improvement_status as string;
  const wasWeak = item.is_weak === 1;
  // بعد بدء المعالجة (تنفيذ/تحسّن/اعتماد) يحكم مسارُ التحسين المؤشرَ، لا إعادة التقييم.
  const inCycle = ["IN_PROGRESS", "IMPROVED", "VERIFIED"].includes(status);
  let weak: boolean;
  if (inCycle) weak = true;
  else if (manual === true) weak = true;
  else if (manual === false) weak = isWeakScore(score);
  else weak = isWeakScore(score) || (wasWeak && parsed.data.score === undefined);

  if (weak && !wasWeak) {
    status = item.plan_action ? "PLANNED" : "NEEDS_PLAN";
  } else if (!weak && wasWeak) {
    status = "NONE";
  }

  await exec(
    `UPDATE self_assessment_items SET score = ?, baseline_score = COALESCE(baseline_score, ?), is_weak = ?, weak_marked_at = ?,
       improvement_status = ?, notes = COALESCE(?, notes), updated_by_id = ?, updated_at = ? WHERE id = ?`,
    [score ?? null, score ?? null, weak ? 1 : 0, weak ? item.weak_marked_at ?? now : null, status, parsed.data.notes ?? null, session.userId, now, item.id]
  );
  await exec("UPDATE self_assessments SET updated_at = ? WHERE id = ?", [now, a.id]);

  if (parsed.data.score !== undefined && parsed.data.score !== item.score) await logEvent(item.id, "RATED", session.userId, item.score, score);
  if (weak && !wasWeak) {
    await logEvent(item.id, "WEAK_FLAGGED", session.userId, null, status);
    const ind = await queryOne<any>("SELECT code, title FROM indicators WHERE id = ?", [indicatorId]);
    const school = await queryOne<any>("SELECT name FROM schools WHERE id = ?", [schoolId]);
    await notifyReviewers(schoolId, "نقطة ضعف جديدة", `${school?.name}: حدّد المدير المؤشر ${ind?.code} «${ind?.title}» كنقطة ضعف.`, "WARNING");
  } else if (!weak && wasWeak) {
    await logEvent(item.id, "WEAK_CLEARED", session.userId, item.improvement_status, status);
  }

  return NextResponse.json({
    message: weak && !wasWeak && status === "NEEDS_PLAN" ? "حُدّد المؤشر كنقطة ضعف — ضع خطة التحسين الآن" : "تم الحفظ",
    itemId: item.id, status, isWeak: weak, needsPlan: status === "NEEDS_PLAN",
  });
}
