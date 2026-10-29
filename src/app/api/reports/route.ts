import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { query, queryOne } from "@/lib/db/sqlite";
import { clientIp, rateLimit } from "@/lib/security";
import { createReport, reportScope, type Actor, type CreateParams } from "@/lib/reports/service";
import { ReportError } from "@/lib/reports/builders";
import { REPORT_TYPE_LABEL, SPECIAL_TOPICS } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"];

/** GET /api/reports — قائمة التقارير بنطاق الدور، مع تصفية بالنوع والحالة والمدرسة والبحث. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    if (["PARENT", "GUEST", "TEACHER"].includes(session.roleKey)) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") ?? 20) || 20, 100);
    const page = Math.max(Number(sp.get("page") ?? 1) || 1, 1);
    const sc = await reportScope(session);
    const where = [sc.sql];
    const params: unknown[] = [...sc.params];
    const status = sp.get("status");
    if (status && VALID_STATUSES.includes(status)) { where.push("r.status = ?"); params.push(status); }
    const type = sp.get("type");
    if (type && REPORT_TYPE_LABEL[type]) { where.push("r.type = ?"); params.push(type); }
    if (sp.get("schoolId")) { where.push("r.school_id = ?"); params.push(sp.get("schoolId")); }
    if (sp.get("visitId")) { where.push("r.visit_id = ?"); params.push(sp.get("visitId")); }
    const q = (sp.get("q") ?? "").trim().slice(0, 80);
    if (q) { where.push("(r.title LIKE ? OR r.number LIKE ?)"); const like = `%${q.replace(/[%_]/g, "")}%`; params.push(like, like); }
    const W = where.join(" AND ");

    const total = (await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM reports r WHERE ${W}`, params))?.n ?? 0;
    const reports = await query(
      `SELECT r.id, r.number, r.title, r.type, r.status, r.period_start, r.period_end, r.verification_code, r.approved_at,
              r.rejection_reason, r.created_at, r.submitted_at, r.summary,
              s.name AS school_name, d.name AS directorate_name, u.name AS generated_by_name, a.name AS approved_by_name
       FROM reports r LEFT JOIN schools s ON r.school_id = s.id LEFT JOIN directorates d ON d.id = r.directorate_id
       LEFT JOIN users u ON r.generated_by_id = u.id LEFT JOIN users a ON r.approved_by_id = a.id
       WHERE ${W} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const counts = await query<{ status: string; n: number }>(`SELECT r.status, COUNT(*) n FROM reports r WHERE ${sc.sql} GROUP BY r.status`, sc.params);
    return NextResponse.json({
      reports, total, page, limit, totalPages: Math.ceil(total / limit),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      types: REPORT_TYPE_LABEL,
      topics: Object.fromEntries(Object.entries(SPECIAL_TOPICS).map(([k, v]) => [k, v.label])),
    });
  } catch (e: any) {
    return NextResponse.json({ message: "تعذّر تحميل التقارير", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined }, { status: 500 });
  }
}

/** POST /api/reports — إنشاء تقرير (مسودة دائماً). الجسم: { type, visitId?, schoolId?, date?, period?, topic?, from?, to?, title? } */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    const rl = rateLimit(`report:${session.userId}`, 40, 10 * 60_000);
    if (!rl.ok) return NextResponse.json({ message: "عدد كبير من الطلبات. حاول لاحقاً." }, { status: 429 });

    const body = (await request.json().catch(() => null)) as CreateParams | null;
    if (!body?.type) return NextResponse.json({ message: "نوع التقرير مطلوب" }, { status: 400 });
    const actor: Actor = { ...session, name: session.name };
    const r = await createReport(actor, body);
    await auditLog({ userId: session.userId, action: "REPORT_GENERATED", entityType: "report", entityId: r.id, newValues: { type: body.type, number: r.number }, ipAddress: clientIp(request), userAgent: request.headers.get("user-agent") });
    return NextResponse.json({ id: r.id, number: r.number, state: r.content.state, message: "تم توليد التقرير كمسودة" }, { status: 201 });
  } catch (e: any) {
    if (e instanceof ReportError) return NextResponse.json({ message: e.message }, { status: e.status });
    return NextResponse.json({ message: "تعذّر توليد التقرير", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined }, { status: 500 });
  }
}
