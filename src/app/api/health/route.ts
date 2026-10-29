import { NextResponse } from "next/server";
import { isRemoteDb, queryOne } from "@/lib/db/sqlite";
import { dbReadyOr503 } from "@/lib/db/ready";

export const runtime = "nodejs";

export async function GET() {
  const notReady = await dbReadyOr503();
  let dbOk = !notReady;
  if (dbOk) {
    try {
      dbOk = !!(await queryOne("SELECT COUNT(*) n FROM criteria"));
    } catch {
      dbOk = false;
    }
  }
  return NextResponse.json(
    {
      status: dbOk ? "ok" : "db_error",
      service: "itqan-platform",
      database: dbOk ? "connected" : "disconnected",
      engine: isRemoteDb() ? "libsql" : "sqlite",
    },
    { status: dbOk ? 200 : 503 }
  );
}
