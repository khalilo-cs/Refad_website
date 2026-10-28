import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db/sqlite";

export const runtime = "nodejs";

export async function GET() {
  let dbOk = false;
  try {
    const r = queryOne("SELECT COUNT(*) n FROM criteria");
    dbOk = !!r;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    status: dbOk ? "ok" : "db_error",
    service: "rifad-platform",
    database: dbOk ? "connected" : "disconnected",
  });
}
