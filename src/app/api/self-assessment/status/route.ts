import { NextResponse } from "next/server";
import { runDailyReminders } from "@/lib/self-assessment-reminders";
import { getServerSession } from "@/lib/auth";
import { queryOne } from "@/lib/db/sqlite";
import { currentAcademicYear, getAssessment, SCHOOL_ROLES } from "@/lib/self-assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — هل الاختبار التفاعلي إجباري الآن على هذا المستخدم؟
 * إجباري لمدير المدرسة ومنسق الجودة حتى يُجاب عن كل مؤشرات العام الحالي (أو تُرسل الاستمارة).
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  await runDailyReminders();
  if (!SCHOOL_ROLES.includes(session.roleKey) || !session.schoolId) return NextResponse.json({ required: false });
  const year = currentAcademicYear();
  const total = (await queryOne<{ n: number }>("SELECT COUNT(*) n FROM indicators"))?.n ?? 0;
  const a = await getAssessment(session.schoolId, year);
  if (a?.status === "SUBMITTED") return NextResponse.json({ required: false, year, total, answered: total });
  const answered = a
    ? (await queryOne<{ n: number }>("SELECT COUNT(*) n FROM self_assessment_items WHERE assessment_id = ? AND score IS NOT NULL AND evidence_have IS NOT NULL", [a.id]))?.n ?? 0
    : 0;
  return NextResponse.json({ required: total > 0 && answered < total, year, total, answered });
}
