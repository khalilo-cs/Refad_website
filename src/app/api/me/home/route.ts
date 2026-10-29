import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db/sqlite";
import { publishedFor } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/home — الصفحة الرئيسية لأدوار ولي الأمر والمعلم والزائر: بيانات المستخدم المصرح بها فقط. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });

  const announcements = await publishedFor(session);

  let children: any[] = [];
  if (session.roleKey === "PARENT") {
    children = await query<any>(
      `SELECT st.id, st.name, st.grade, st.section, s.name AS school_name,
              (SELECT COUNT(*) FROM attendance_records ar WHERE ar.student_id = st.id AND ar.status = 'ABSENT') AS absences,
              (SELECT COUNT(*) FROM attendance_records ar WHERE ar.student_id = st.id) AS attendance_days
       FROM students st JOIN schools s ON s.id = st.school_id
       JOIN parent_student ps ON ps.student_id = st.id JOIN parents p ON p.id = ps.parent_id
       WHERE p.user_id = ? AND st.is_active = 1`,
      [session.userId]
    );
    for (const c of children) {
      c.results = await query<any>(
        "SELECT subject, term, score, max_score FROM academic_results WHERE student_id = ? ORDER BY recorded_at DESC LIMIT 12",
        [c.id]
      );
    }
  }

  const school = session.schoolId
    ? await queryOne<any>("SELECT id, name, code FROM schools WHERE id = ?", [session.schoolId])
    : null;
  const myEvidence = session.roleKey === "TEACHER"
    ? await queryOne<any>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN review_status='ACCEPTED' THEN 1 ELSE 0 END),0) AS accepted,
                COALESCE(SUM(CASE WHEN review_status='PENDING' THEN 1 ELSE 0 END),0) AS pending
         FROM evidence WHERE uploaded_by_id = ?`, [session.userId])
    : null;

  return NextResponse.json({ announcements, children, school, myEvidence });
}
