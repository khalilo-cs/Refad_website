import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";

export const runtime = "nodejs";

/** GET /api/evidence/[id]/versions — سجل نسخ الدليل. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { id } = await params;
  const row = queryOne<any>("SELECT school_id, version, original_name, size, sha256, created_at, updated_at FROM evidence WHERE id = ?", [id]);
  if (!row) return NextResponse.json({ message: "الدليل غير موجود" }, { status: 404 });
  if (!canAccessSchool(session, row.school_id) || session.roleKey === "PARENT") return NextResponse.json({ message: "لا تملك صلاحية" }, { status: 403 });
  const old = query(
    `SELECT v.version, v.original_name, v.size, v.sha256, v.created_at, u.name AS uploaded_by
     FROM evidence_versions v LEFT JOIN users u ON u.id = v.uploaded_by_id
     WHERE v.evidence_id = ? ORDER BY v.version DESC`,
    [id]
  );
  return NextResponse.json({
    current: { version: row.version, original_name: row.original_name, size: row.size, sha256: row.sha256, updated_at: row.updated_at },
    previous: old,
  });
}
