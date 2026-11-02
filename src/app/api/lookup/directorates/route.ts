import { NextResponse } from "next/server";
import { query } from "@/lib/db/sqlite";
import { getServerSession, authorize } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const governorateId = searchParams.get("governorateId") ?? "";
  let sql = "SELECT id, name, code, governorate_id FROM directorates";
  const params: unknown[] = [];
  if (governorateId) { sql += " WHERE governorate_id = ?"; params.push(governorateId); }
  sql += " ORDER BY name";
  const rows = await query<any>(sql, params);
  return NextResponse.json(rows);
}
