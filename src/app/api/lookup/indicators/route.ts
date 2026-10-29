import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";

export const runtime = "nodejs";

/** قائمة المؤشرات الخفيفة لاختيارها عند رفع الأدلة وربطها. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  return NextResponse.json(query("SELECT i.id, i.code, i.title FROM indicators i ORDER BY i.order_index"));
}
