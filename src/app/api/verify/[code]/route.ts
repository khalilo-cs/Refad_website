import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db/sqlite";

export const runtime = "nodejs";

/**
 * GET /api/verify/[code]
 *
 * التحقق العام من صحة تقرير برمز التحقق المطبوع على التقرير.
 * هذا المسار عام بطبيعته (لا يتطلب تسجيل دخول) لكنه لا يكشف سوى
 * الحد الأدنى اللازم للتحقق: رقم التقرير، عنوانه، حالته، اسم المدرسة،
 * وتاريخ الاعتماد واسم المعتمِد. لا تظهر أي ملاحظات أو درجات أو بيانات متعلمين.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const clean = String(code ?? "").trim().toUpperCase().slice(0, 40);

  if (!clean) {
    return NextResponse.json({ valid: false, message: "الرمز مطلوب" }, { status: 400 });
  }

  const row = queryOne<any>(
    `SELECT r.number, r.title, r.type, r.status, r.approved_at,
            r.verification_code, r.created_at,
            s.name AS school_name,
            d.name AS directorate_name,
            u.name AS approved_by_name
     FROM reports r
     LEFT JOIN schools s ON s.id = r.school_id
     LEFT JOIN directorates d ON d.id = r.directorate_id
     LEFT JOIN users u ON u.id = r.approved_by_id
     WHERE r.verification_code = ?`,
    [clean]
  );

  if (!row) {
    return NextResponse.json(
      {
        valid: false,
        message:
          "لا يوجد تقرير مطابق لهذا الرمز. تأكد من الرمز كما هو مطبوع في أسفل التقرير.",
      },
      { status: 404 }
    );
  }

  const STATUS_LABEL: Record<string, string> = {
    DRAFT: "مسودة",
    UNDER_REVIEW: "قيد المراجعة",
    APPROVED: "معتمد",
    REJECTED: "مرفوض",
  };

  return NextResponse.json({
    valid: true,
    report: {
      number: row.number,
      title: row.title,
      type: row.type,
      status: row.status,
      statusLabel: STATUS_LABEL[row.status] ?? row.status,
      approved: row.status === "APPROVED",
      approvedBy: row.approved_by_name ?? null,
      approvedAt: row.approved_at ?? null,
      school: row.school_name ?? null,
      directorate: row.directorate_name ?? null,
      issuedAt: row.created_at,
      verificationCode: row.verification_code,
    },
    note:
      "هذه الصفحة تتحقق من وجود التقرير وحالته فقط. ليست شهادة اعتماد رسمية ولا تُغني عن الجهة المخوّلة.",
  });
}
