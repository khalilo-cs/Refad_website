import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { computeRankings } from "@/lib/recognition";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];

/** GET /api/rankings[?directorateId=&format=csv] — ترتيب المدارس وفئات التكريم ضمن نطاق المستخدم. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  if (!authorize(session, { roles: ROLES }).allowed) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const result = await computeRankings(session, { directorateId: sp.get("directorateId") ?? undefined });

  if (sp.get("format") === "csv") {
    const esc = (v: unknown) => {
      let t = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const headers = ["المرتبة", "الكود", "المدرسة", "المديرية", "نسبة التحقق %", "الفئة", "التغيّر عن الزيارة السابقة", "نسبة الإكمال %", "إجراءات مغلقة", "إجراءات متأخرة"];
    const rows = result.ranked.map((r) => [r.rank, r.code, r.name, r.directorate, r.percent, r.tier?.label, r.delta, r.completion, `${r.actions.closed}/${r.actions.total}`, r.actions.overdue]);
    await auditLog({ userId: session.userId, action: "EXPORT_RANKINGS", entityType: "School", newValues: { count: rows.length }, ipAddress: clientIp(request) });
    const csv = "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=rankings.csv", "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(result);
}
