import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { requiredActions } from "@/lib/required-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];

/** GET /api/improvement/required[?schoolId=] — مؤشرات ضعيفة بلا إجراء تصحيحي ضمن نطاق المستخدم. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (!ROLES.includes(session.roleKey)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const items = await requiredActions(session, { schoolId: request.nextUrl.searchParams.get("schoolId") ?? undefined });
  return NextResponse.json({ items, total: items.length, schools: new Set(items.map((i) => i.schoolId)).size });
}
