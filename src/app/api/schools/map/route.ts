import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";
import { computeVisitResults, loadTree } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/schools/map — المدارس ذات الإحداثيات المدخلة فقط، مع آخر نسبة تحقق. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (["PARENT", "GUEST", "TEACHER"].includes(session.roleKey)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const sc = schoolScope(session, "s");
  const schools = query<any>(
    `SELECT s.id, s.code, s.name, s.stage, s.type, s.latitude, s.longitude, s.status, d.id AS directorate_id, d.name AS directorate
     FROM schools s JOIN directorates d ON d.id = s.directorate_id WHERE ${sc.sql}`, sc.params);
  const withCoords = schools.filter((s) => s.latitude != null && s.longitude != null);
  const latest = query<any>(
    `SELECT v.id, v.school_id FROM visits v
     WHERE v.status IN ('SUBMITTED','COMPLETED') AND v.school_id IN (SELECT id FROM schools s WHERE ${sc.sql})
     ORDER BY COALESCE(v.ended_at, v.submitted_at, v.updated_at) DESC`, sc.params);
  const first = new Map<string, string>();
  for (const v of latest) if (!first.has(v.school_id)) first.set(v.school_id, v.id);
  const results = computeVisitResults([...first.values()], loadTree());
  return NextResponse.json({
    schools: withCoords.map((s) => ({ ...s, percent: first.has(s.id) ? results.get(first.get(s.id)!)?.evaluatedPartPercent ?? null : null })),
    withoutCoordinates: schools.length - withCoords.length,
    total: schools.length,
  });
}
