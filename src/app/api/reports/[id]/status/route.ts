import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { queryOne, getDb, nowISO } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/reports/[id]/status
 * يدير دورة حياة التقرير: DRAFT → UNDER_REVIEW → APPROVED | REJECTED.
 *
 * قواعد صارمة:
 *  - لا يعتمد التقرير صاحبه (فصل المهام).
 *  - الرفض يستلزم سبباً مكتوباً.
 *  - الاعتماد يسجل اسم المعتمِد وتاريخه.
 *  - لا يمكن تعديل تقرير معتمد.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { status, rejectionReason } = body ?? {};

    if (!["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json(
        { message: "الحالة يجب أن تكون UNDER_REVIEW أو APPROVED أو REJECTED" },
        { status: 400 }
      );
    }

    const report = queryOne<{
      id: string;
      status: string;
      generated_by_id: string;
      summary: string | null;
    }>("SELECT id, status, generated_by_id, summary FROM reports WHERE id = ?", [id]);

    if (!report) {
      return NextResponse.json({ message: "التقرير غير موجود" }, { status: 404 });
    }
    if (report.status === "APPROVED") {
      return NextResponse.json(
        { message: "التقرير معتمد ولا يمكن تعديل حالته" },
        { status: 409 }
      );
    }

    const canReview = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(session.roleKey);
    const canSubmit = ["INSPECTOR", "SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(
      session.roleKey
    );

    if (status === "UNDER_REVIEW") {
      if (!canSubmit) {
        return NextResponse.json({ message: "رفع التقرير للمراجعة غير متاح لدورك" }, { status: 403 });
      }
      if (report.generated_by_id !== session.userId && session.roleKey === "INSPECTOR") {
        return NextResponse.json({ message: "لا يمكنك رفع تقرير لست صاحبه" }, { status: 403 });
      }
      if (report.summary) {
        const parsed = JSON.parse(report.summary);
        if (parsed.reportState === "DRAFT_INCOMPLETE") {
          return NextResponse.json(
            {
              message: "لا يمكن رفع تقرير غير مكتمل للمراجعة.",
              completion: parsed.completionPercent,
            },
            { status: 400 }
          );
        }
      }
    }

    if (status === "APPROVED" || status === "REJECTED") {
      if (!canReview) {
        return NextResponse.json(
          { message: "الاعتماد والرفض مقصوران على مدير النظام ومدير التعليم" },
          { status: 403 }
        );
      }
      // فصل المهام: لا يعتمد المولِّد تقريره.
      if (report.generated_by_id === session.userId && session.roleKey !== "SUPER_ADMIN") {
        return NextResponse.json(
          { message: "لا يمكن اعتماد تقرير أنشأته بنفسك" },
          { status: 403 }
        );
      }
      if (status === "REJECTED") {
        if (typeof rejectionReason !== "string" || rejectionReason.trim().length < 5) {
          return NextResponse.json(
            { message: "سبب الرفض مطلوب (5 أحرف على الأقل)" },
            { status: 400 }
          );
        }
      }
    }

    const db = getDb();
    const now = nowISO();

    if (status === "APPROVED") {
      db.prepare(
        `UPDATE reports SET status = 'APPROVED', approved_by_id = ?, approved_at = ?,
                            rejection_reason = NULL, updated_at = ? WHERE id = ?`
      ).run(session.userId, now, now, id);
    } else if (status === "REJECTED") {
      db.prepare(
        `UPDATE reports SET status = 'REJECTED', rejection_reason = ?, approved_by_id = NULL,
                            approved_at = NULL, updated_at = ? WHERE id = ?`
      ).run(rejectionReason.trim(), now, id);
    } else {
      db.prepare(`UPDATE reports SET status = 'UNDER_REVIEW', updated_at = ? WHERE id = ?`).run(
        now,
        id
      );
    }

    auditLog({
      userId: session.userId,
      action: `REPORT_${status}`,
      entityType: "report",
      entityId: id,
      oldValues: { status: report.status },
      newValues: { status, rejectionReason: rejectionReason ?? null },
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    });

    const messages: Record<string, string> = {
      UNDER_REVIEW: "تم رفع التقرير للمراجعة",
      APPROVED: "تم اعتماد التقرير",
      REJECTED: "تم رفض التقرير مع تسجيل السبب",
    };

    return NextResponse.json({ message: messages[status], status });
  } catch (e: any) {
    return NextResponse.json(
      {
        message: "تعذّر تحديث حالة التقرير",
        debug: process.env.NODE_ENV !== "production" ? e?.message : undefined,
      },
      { status: 500 }
    );
  }
}
