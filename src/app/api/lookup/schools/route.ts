import { NextResponse } from "next/server";
import { query } from "@/lib/db/sqlite";
import { getServerSession } from "@/lib/auth";
import { schoolScope } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** قائمة مختصرة بالمدارس ضمن نطاق المستخدم، لقوائم الاختيار (بلا حد صفحات). */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const scope = await schoolScope(session, "s");
  const onlyActive = new URL(request.url).searchParams.get("all") !== "1";
  const rows = await query<any>(
    `SELECT s.id, s.name, s.code, s.directorate_id, s.status FROM schools s
     WHERE ${scope.sql} ${onlyActive ? "AND s.status = 'ACTIVE'" : ""} ORDER BY s.name`,
    scope.params
  );
  return NextResponse.json(rows);
}
