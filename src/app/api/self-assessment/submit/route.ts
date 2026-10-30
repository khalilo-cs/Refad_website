import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { exec, nowISO } from "@/lib/db/sqlite";
import { notify, schoolUsers } from "@/lib/notify";
import { buildTree, canFill, canReview, getAssessment, normalizeYear, notifyReviewers, SCHOOL_ROLES, submitBlockers } from "@/lib/self-assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400, extra: object = {}) => NextResponse.json({ message, ...extra }, { status });

/** POST { schoolId, year, action: "submit" | "reopen" } — إرسال الاستمارة (المدرسة) أو إعادة فتحها (الإدارة). */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  if (session.mustChangePassword) return bad("يجب تغيير كلمة المرور أولاً", 403);
  const b = await request.json().catch(() => null);
  const schoolId = typeof b?.schoolId === "string" ? b.schoolId : "";
  const year = normalizeYear(b?.year);
  const a = schoolId ? await getAssessment(schoolId, year) : null;
  if (!a) return bad("لا توجد استمارة لهذا العام", 404);
  const now = nowISO();

  if (b?.action === "reopen") {
    if (!(await canReview(session, schoolId))) return bad("إعادة الفتح للإدارة", 403);
    if (a.status !== "SUBMITTED") return bad("الاستمارة غير مُرسلة");
    await exec("UPDATE self_assessments SET status = 'DRAFT', updated_at = ? WHERE id = ?", [now, a.id]);
    await notify(await schoolUsers(schoolId, SCHOOL_ROLES), "أُعيد فتح استمارة التقييم الذاتي", `يمكنكم تعديل تقييم \u2066${year}\u2069 وإعادة إرسالها.`, { type: "INFO", link: "/self-assessment" });
    return NextResponse.json({ message: "أُعيد فتح الاستمارة للمدرسة" });
  }

  if (!canFill(session, schoolId)) return bad("الإرسال لمدير المدرسة ومنسق الجودة فيها", 403);
  if (a.status === "SUBMITTED") return bad("الاستمارة مُرسلة مسبقاً");
  const { summary } = await buildTree(a.id);
  const blockers = submitBlockers(summary);
  if (blockers.length) return bad("لا يمكن الإرسال بعد", 409, { blockers });
  await exec("UPDATE self_assessments SET status = 'SUBMITTED', submitted_at = ?, submitted_by_id = ?, updated_at = ? WHERE id = ?", [now, session.userId, now, a.id]);
  await notifyReviewers(schoolId, "استمارة تقييم ذاتي جديدة", `أرسلت مدرسة استمارة \u2066${year}\u2069: ${summary.weak} نقاط ضعف بخططها، ونسبة التحقق ${summary.percent ?? 0}%.`);
  return NextResponse.json({ message: "أُرسلت الاستمارة للإدارة. تابع تنفيذ خطط التحسين وحدّث حالتها أولاً بأول." });
}
