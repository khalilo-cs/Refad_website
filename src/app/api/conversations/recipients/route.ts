import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";
import { allowedRecipients, messagingSchools } from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?schoolId= — المدارس المتاحة للمراسلة، والمستلمون المسموحون في مدرسة. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  let schools = messagingSchools(session);
  if (["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey)) {
    const sc = schoolScope(session, "s");
    schools = query<any>(`SELECT s.id, s.name FROM schools s WHERE s.status = 'ACTIVE' AND ${sc.sql} ORDER BY s.name LIMIT 200`, sc.params);
  }
  // مدير المدرسة والمنسق يراسلان الإدارة أيضاً (مدرستهما)
  if (["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(session.roleKey) && !schools.length && session.schoolId) schools = query<any>("SELECT id, name FROM schools WHERE id = ?", [session.schoolId]);
  const schoolId = request.nextUrl.searchParams.get("schoolId");
  return NextResponse.json({ schools, recipients: schoolId ? allowedRecipients(session, schoolId) : [] });
}
