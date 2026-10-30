import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditLog, getServerSession } from "@/lib/auth";
import { exec, nowISO, query, queryOne } from "@/lib/db/sqlite";
import { notify, schoolUsers } from "@/lib/notify";
import { canFill, canReview, canView, EVENT_LABEL, loadItem, logEvent, notifyReviewers, SCHOOL_ROLES } from "@/lib/self-assessment";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });
type Ctx = { params: Promise<{ id: string }> };

/** GET — تاريخ المؤشر كاملاً (كل خطوة ومن قام بها ومتى). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  const { id } = await params;
  const item = await loadItem(id);
  if (!item) return bad("غير موجود", 404);
  if (!(await canView(session, item.school_id))) return bad("غير مصرح", 403);
  const rows = await query<any>(
    `SELECT h.event, h.from_value, h.to_value, h.note, h.created_at, u.name AS user_name
     FROM self_assessment_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.item_id = ? ORDER BY h.created_at, h.rowid`,
    [id]
  );
  return NextResponse.json({ history: rows.map((r) => ({ ...r, label: EVENT_LABEL[r.event] ?? r.event })) });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    planAction: z.string().trim().min(10, "اكتب الإجراء بوضوح (10 أحرف على الأقل)").max(2000),
    responsible: z.string().trim().min(2, "حدّد المسؤول عن التنفيذ").max(120),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "حدّد موعد الإنجاز"),
    successMeasure: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({ action: z.literal("start"), note: z.string().trim().max(1000).optional().nullable() }),
  z.object({
    action: z.literal("improve"),
    note: z.string().trim().min(10, "صف ما نُفّذ فعلياً لمعالجة الضعف (10 أحرف على الأقل)").max(2000),
    newScore: z.number().int().min(0).max(10),
  }),
  z.object({ action: z.literal("verify"), note: z.string().trim().max(1000).optional().nullable() }),
  z.object({ action: z.literal("return"), note: z.string().trim().min(5, "اكتب سبب الإعادة").max(1000) }),
]);

/** POST — خطوات دورة التحسين: خطة ← بدء ← تحسّن (المدرسة)، اعتماد/إعادة (الإدارة). */
export async function POST(request: NextRequest, { params }: Ctx) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  if (session.mustChangePassword) return bad("يجب تغيير كلمة المرور أولاً", 403);
  const { id } = await params;
  const item = await loadItem(id);
  if (!item) return bad("غير موجود", 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
  const b = parsed.data;
  const now = nowISO();
  const st = item.improvement_status as string;
  const school = SCHOOL_ROLES.includes(session.roleKey);
  const label = `${item.indicator_code} «${item.indicator_title}»`;

  if (b.action === "plan" || b.action === "start" || b.action === "improve") {
    if (!school || !canFill(session, item.school_id)) return bad("هذه الخطوة لمدير المدرسة ومنسق الجودة فيها", 403);
    if (!item.is_weak) return bad("المؤشر غير محدد كنقطة ضعف");
  } else {
    if (!(await canReview(session, item.school_id))) return bad("الاعتماد للإدارة ضمن نطاقها", 403);
  }

  if (b.action === "plan") {
    if (!["NEEDS_PLAN", "PLANNED", "IN_PROGRESS"].includes(st)) return bad("لا يمكن تعديل الخطة في هذه المرحلة");
    const next = st === "IN_PROGRESS" ? "IN_PROGRESS" : "PLANNED";
    await exec(
      `UPDATE self_assessment_items SET plan_action = ?, plan_responsible = ?, plan_due_date = ?, plan_success_measure = ?, plan_set_at = COALESCE(plan_set_at, ?),
         improvement_status = ?, updated_by_id = ?, updated_at = ? WHERE id = ?`,
      [b.planAction, b.responsible, b.dueDate, b.successMeasure ?? null, now, next, session.userId, now, id]
    );
    await logEvent(id, item.plan_action ? "PLAN_UPDATED" : "PLAN_SET", session.userId, st, next, `${b.planAction} — المسؤول: ${b.responsible} — الموعد: ${b.dueDate}`);
    if (!item.plan_action) await notifyReviewers(item.school_id, "خطة تحسين جديدة", `${item.school_name}: وُضعت خطة لمعالجة المؤشر ${label}.`);
    return NextResponse.json({ message: "حُفظت خطة التحسين", status: next });
  }

  if (b.action === "start") {
    if (st !== "PLANNED") return bad(st === "NEEDS_PLAN" ? "ضع خطة التحسين أولاً" : "لا يمكن بدء التنفيذ في هذه المرحلة");
    await exec("UPDATE self_assessment_items SET improvement_status = 'IN_PROGRESS', updated_by_id = ?, updated_at = ? WHERE id = ?", [session.userId, now, id]);
    await logEvent(id, "STARTED", session.userId, st, "IN_PROGRESS", b.note ?? null);
    return NextResponse.json({ message: "سُجّل بدء التنفيذ", status: "IN_PROGRESS" });
  }

  if (b.action === "improve") {
    if (!["PLANNED", "IN_PROGRESS"].includes(st)) return bad(st === "NEEDS_PLAN" ? "ضع خطة التحسين أولاً" : "لا يمكن إعلان التحسّن في هذه المرحلة");
    if (!(await queryOne("SELECT 1 FROM rating_scale WHERE is_active = 1 AND score = ?", [b.newScore]))) return bad("درجة غير موجودة في مقياس التقدير");
    if (b.newScore <= (item.score ?? 0)) return bad("التحسّن يعني تقديراً أعلى من التقدير الحالي");
    await exec(
      "UPDATE self_assessment_items SET improvement_status = 'IMPROVED', progress_note = ?, score = ?, improved_at = ?, review_note = NULL, updated_by_id = ?, updated_at = ? WHERE id = ?",
      [b.note, b.newScore, now, session.userId, now, id]
    );
    await logEvent(id, "IMPROVED", session.userId, item.score, b.newScore, b.note);
    await notifyReviewers(item.school_id, "تحسّن بانتظار الاعتماد", `${item.school_name}: أعلنت المدرسة تحسّن المؤشر ${label}. راجعه واعتمده.`, "SUCCESS");
    return NextResponse.json({ message: "أُرسل التحسّن للإدارة لاعتماده", status: "IMPROVED" });
  }

  if (b.action === "verify") {
    if (st !== "IMPROVED") return bad("يُعتمد التحسّن بعد أن تعلنه المدرسة");
    await exec(
      "UPDATE self_assessment_items SET improvement_status = 'VERIFIED', verified_by_id = ?, verified_at = ?, review_note = ?, updated_at = ? WHERE id = ?",
      [session.userId, now, b.note ?? null, now, id]
    );
    await logEvent(id, "VERIFIED", session.userId, "IMPROVED", "VERIFIED", b.note ?? null);
    await auditLog({ userId: session.userId, action: "SELF_ASSESSMENT_VERIFIED", entityType: "SelfAssessmentItem", entityId: id, ipAddress: clientIp(request) });
    await notify(await schoolUsers(item.school_id, SCHOOL_ROLES), "اعتُمد التحسّن", `اعتمدت الإدارة تحسّن المؤشر ${label}. أحسنتم!`, { type: "SUCCESS", link: "/self-assessment" });
    return NextResponse.json({ message: "اعتُمد التحسّن", status: "VERIFIED" });
  }

  // return
  if (!["IMPROVED", "VERIFIED"].includes(st)) return bad("لا يوجد تحسّن معلن لإعادته");
  await exec(
    "UPDATE self_assessment_items SET improvement_status = 'IN_PROGRESS', score = COALESCE(baseline_score, score), review_note = ?, verified_by_id = NULL, verified_at = NULL, updated_at = ? WHERE id = ?",
    [b.note, now, id]
  );
  await logEvent(id, "RETURNED", session.userId, st, "IN_PROGRESS", b.note);
  await notify(await schoolUsers(item.school_id, SCHOOL_ROLES), "أُعيد مؤشر للمتابعة", `أعادت الإدارة المؤشر ${label}: ${b.note}`, { type: "WARNING", link: "/self-assessment" });
  return NextResponse.json({ message: "أُعيد المؤشر للمدرسة لاستكمال المعالجة", status: "IN_PROGRESS" });
}
