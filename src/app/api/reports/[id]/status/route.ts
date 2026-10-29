import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { nowISO , exec } from "@/lib/db/sqlite";
import { getReportRow, parseContent } from "@/lib/reports/service";
import { clientIp } from "@/lib/security";
import { notify } from "@/lib/notify";
import { query } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/reports/[id]/status — DRAFT → UNDER_REVIEW → APPROVED | REJECTED (ومن REJECTED إلى UNDER_REVIEW بعد التعديل).
 * قواعد: لا يعتمد المولِّد تقريره؛ الرفض يستلزم سبباً؛ لا تعديل لتقرير معتمد؛
 * التقرير غير المكتمل لا يُرفع للمراجعة؛ الاعتماد يسجّل المعتمِد والتاريخ ويتطلب اتصالاً بالخادم.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    const { id } = await params;
    const { status, rejectionReason } = (await request.json().catch(() => ({}))) ?? {};
    if (!["UNDER_REVIEW", "APPROVED", "REJECTED", "DRAFT"].includes(status)) return NextResponse.json({ message: "حالة غير صالحة" }, { status: 400 });

    const report = await getReportRow(session, id);
    if (!report) return NextResponse.json({ message: "التقرير غير موجود" }, { status: 404 });
    if (report.status === "APPROVED") return NextResponse.json({ message: "التقرير معتمد ولا يمكن تعديل حالته" }, { status: 409 });

    const canReview = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(session.roleKey);
    const isOwner = report.generated_by_id === session.userId;
    const content = parseContent(report);

    if (status === "UNDER_REVIEW") {
      if (!isOwner && !canReview) return NextResponse.json({ message: "رفع التقرير للمراجعة لصاحبه أو للإدارة" }, { status: 403 });
      if (!["DRAFT", "REJECTED"].includes(report.status)) return NextResponse.json({ message: "التقرير ليس مسودة" }, { status: 409 });
      if (content?.state === "INCOMPLETE") return NextResponse.json({ message: "لا يمكن رفع تقرير غير مكتمل للمراجعة. أكمل تقييم المؤشرات ثم ولّد التقرير من جديد." }, { status: 400 });
    }
    if (status === "APPROVED" || status === "REJECTED") {
      if (!canReview) return NextResponse.json({ message: "الاعتماد والرفض مقصوران على مدير النظام ومدير الإدارة التعليمية" }, { status: 403 });
      if (report.status !== "UNDER_REVIEW") return NextResponse.json({ message: "لا يُعتمد أو يُرفض إلا تقرير قيد المراجعة" }, { status: 409 });
      if (isOwner && session.roleKey !== "SUPER_ADMIN") return NextResponse.json({ message: "لا يمكن اعتماد تقرير أنشأته بنفسك" }, { status: 403 });
      if (status === "REJECTED" && String(rejectionReason ?? "").trim().length < 5) return NextResponse.json({ message: "سبب الرفض مطلوب (5 أحرف على الأقل)" }, { status: 400 });
    }
    if (status === "DRAFT") return NextResponse.json({ message: "لا يمكن إعادة التقرير إلى مسودة" }, { status: 400 });

    const now = nowISO();
    if (status === "APPROVED") await exec(`UPDATE reports SET status='APPROVED', approved_by_id=?, approved_at=?, rejection_reason=NULL, updated_at=? WHERE id=?`, [session.userId, now, now, id]);
    else if (status === "REJECTED") await exec(`UPDATE reports SET status='REJECTED', rejection_reason=?, approved_by_id=NULL, approved_at=NULL, updated_at=? WHERE id=?`, [String(rejectionReason).trim().slice(0, 500), now, id]);
    else await exec(`UPDATE reports SET status='UNDER_REVIEW', submitted_at=?, submitted_by_id=?, rejection_reason=NULL, updated_at=? WHERE id=?`, [now, session.userId, now, id]);

    await auditLog({ userId: session.userId, action: `REPORT_${status}`, entityType: "report", entityId: id, oldValues: { status: report.status }, newValues: { status, rejectionReason: rejectionReason ?? null }, ipAddress: clientIp(request), userAgent: request.headers.get("user-agent") });

    if (status === "UNDER_REVIEW") {
      const reviewers = await query<{ id: string }>(
        `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_active = 1 AND (r.key = 'SUPER_ADMIN' OR (r.key = 'EDUCATION_DIRECTOR' AND u.directorate_id = ?))`,
        [report.directorate_id ?? (report.school_id ? (await query<any>("SELECT directorate_id FROM schools WHERE id = ?", [report.school_id]))[0]?.directorate_id : null) ?? ""]);
      await notify(reviewers.map((r) => r.id).filter((x) => x !== session.userId), "تقرير بانتظار الاعتماد", report.title, { link: `/reports/${id}`, type: "WARNING" });
    } else {
      await notify([report.generated_by_id], status === "APPROVED" ? "اعتُمد تقريرك" : "رُفض تقريرك", `${report.title}${status === "REJECTED" ? " — " + String(rejectionReason).slice(0, 100) : ""}`, { link: `/reports/${id}`, type: status === "APPROVED" ? "SUCCESS" : "DANGER" });
    }
    const messages: Record<string, string> = { UNDER_REVIEW: "تم رفع التقرير للمراجعة", APPROVED: "تم اعتماد التقرير", REJECTED: "تم رفض التقرير مع تسجيل السبب" };
    return NextResponse.json({ message: messages[status], status });
  } catch (e: any) {
    return NextResponse.json({ message: "تعذّر تحديث حالة التقرير", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined }, { status: 500 });
  }
}
