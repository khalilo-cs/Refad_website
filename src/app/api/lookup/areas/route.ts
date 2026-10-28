import { NextResponse } from "next/server";
import { query } from "@/lib/db/sqlite";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const directorateId = searchParams.get("directorateId") ?? "";
  let sql = "SELECT id, name FROM areas";
  const params: unknown[] = [];
  if (directorateId) { sql += " WHERE directorate_id = ?"; params.push(directorateId); }
  sql += " ORDER BY name";
  return NextResponse.json(query<any>(sql, params));
}
