import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { queryOne } from "@/lib/db/sqlite";
import { publishedFor } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/home — الصفحة الرئيسية لأدوار المعلم والزائر: بيانات المستخدم المصرح بها فقط. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });

  const announcements = await publishedFor(session);

  const school = session.schoolId
    ? await queryOne<any>("SELECT id, name, code FROM schools WHERE id = ?", [session.schoolId])
    : null;
  const myEvidence = session.roleKey === "TEACHER"
    ? await queryOne<any>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN review_status='ACCEPTED' THEN 1 ELSE 0 END),0) AS accepted,
                COALESCE(SUM(CASE WHEN review_status='PENDING' THEN 1 ELSE 0 END),0) AS pending
         FROM evidence WHERE uploaded_by_id = ?`, [session.userId])
    : null;

  return NextResponse.json({ announcements, school, myEvidence });
}
