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

  const row = await queryOne<any>(
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
    // شهادات التكريم الصادرة من بيانات التقييم الذاتي
    const cert = await queryOne<any>(
      `SELECT c.code, c.title, c.body, c.academic_year, c.issued_at, c.revoked_at, s.name AS school_name, d.name AS directorate_name, u.name AS issued_by
       FROM certificates c JOIN schools s ON s.id = c.school_id LEFT JOIN directorates d ON d.id = s.directorate_id
       LEFT JOIN users u ON u.id = c.issued_by_id WHERE c.code = ?`,
      [clean]
    );
    if (cert) {
      return NextResponse.json({
        valid: true,
        report: {
          kind: "certificate",
          number: cert.code,
          title: cert.title,
          body: cert.body,
          year: cert.academic_year,
          status: cert.revoked_at ? "REJECTED" : "APPROVED",
          statusLabel: cert.revoked_at ? "ملغاة" : "شهادة سارية",
          approved: !cert.revoked_at,
          approvedBy: cert.issued_by ?? null,
          approvedAt: cert.issued_at,
          school: cert.school_name,
          directorate: cert.directorate_name ?? null,
          issuedAt: cert.issued_at,
          verificationCode: cert.code,
        },
        note: "هذه الشهادة صادرة من منصة إتقان بناءً على بيانات التقييم الذاتي والتحسين المعتمدة من الإدارة.",
      });
    }
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
