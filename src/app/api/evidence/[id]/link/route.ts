import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { queryOne } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";
import { signResourceToken } from "@/lib/security";

export const runtime = "nodejs";

/** POST /api/evidence/[id]/link — يُصدر رابطاً مؤقتاً (5 دقائق) لتنزيل الدليل أو معاينته. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { id } = await params;
  const row = queryOne<any>("SELECT school_id, uploaded_by_id FROM evidence WHERE id = ?", [id]);
  if (!row) return NextResponse.json({ message: "الدليل غير موجود" }, { status: 404 });
  if (!canAccessSchool(session, row.school_id) || (session.roleKey === "TEACHER" && row.uploaded_by_id !== session.userId) || session.roleKey === "PARENT") {
    return NextResponse.json({ message: "لا تملك صلاحية" }, { status: 403 });
  }
  const token = signResourceToken(`evidence:${id}`, session.userId, 300);
  auditLog({ userId: session.userId, action: "EVIDENCE_LINK_ISSUED", entityType: "evidence", entityId: id });
  return NextResponse.json({ url: `/api/evidence/${id}/file?token=${token}`, expiresInSec: 300 });
}
