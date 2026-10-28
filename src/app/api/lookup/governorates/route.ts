import { NextResponse } from "next/server";
import { query } from "@/lib/db/sqlite";

export const runtime = "nodejs";

export async function GET() {
  const rows = query<any>("SELECT id, name, code FROM governorates ORDER BY name");
  return NextResponse.json(rows);
}
