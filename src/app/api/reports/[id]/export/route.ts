import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { queryOne } from "@/lib/db/sqlite";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

/**
 * GET /api/reports/[id]/export?format=csv
 *
 * يصدّر تقريراً واحداً كملف CSV بترميز UTF-8 مع BOM حتى يفتحه Excel
 * بالعربية بشكل صحيح. التصدير متاح لمن يملك صلاحية رؤية التقرير.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  const row = queryOne<any>(
    `SELECT r.*, s.name AS school_name, d.name AS directorate_name,
            u.name AS generated_by_name, a.name AS approved_by_name
     FROM reports r
     LEFT JOIN schools s ON s.id = r.school_id
     LEFT JOIN directorates d ON d.id = r.directorate_id
     LEFT JOIN users u ON u.id = r.generated_by_id
     LEFT JOIN users a ON a.id = r.approved_by_id
     WHERE r.id = ?`,
    [id]
  );

  if (!row) {
    return NextResponse.json({ message: "التقرير غير موجود" }, { status: 404 });
  }

  // نطاق الوصول: مدير المدرسة يرى تقارير مدرسته فقط
  if (
    session.roleKey === "SCHOOL_PRINCIPAL" &&
    session.schoolId &&
    row.school_id !== session.schoolId
  ) {
    return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  }

  let summary: any = null;
  try {
    summary = row.summary ? JSON.parse(row.summary) : null;
  } catch {
    summary = null;
  }

  const STATUS: Record<string, string> = {
    DRAFT: "مسودة",
    UNDER_REVIEW: "قيد المراجعة",
    APPROVED: "معتمد",
    REJECTED: "مرفوض",
  };

  const rows: (string | number | null)[][] = [
    ["رقم التقرير", row.number],
    ["العنوان", row.title],
    ["النوع", row.type],
    ["الحالة", STATUS[row.status] ?? row.status],
    ["المدرسة", row.school_name ?? ""],
    ["المديرية", row.directorate_name ?? ""],
    ["أُنشئ بواسطة", row.generated_by_name ?? ""],
    ["تاريخ الإنشاء", String(row.created_at ?? "").slice(0, 19)],
    ["اعتُمد بواسطة", row.approved_by_name ?? ""],
    ["تاريخ الاعتماد", row.approved_at ? String(row.approved_at).slice(0, 19) : ""],
    ["سبب الرفض", row.rejection_reason ?? ""],
    ["رمز التحقق", row.verification_code],
    [],
  ];

  if (summary) {
    rows.push(["الدرجة الكلية", summary.totalScore ?? ""]);
    rows.push(["نسبة التحقق", `${summary.achievementPercent ?? ""}%`]);
    rows.push(["نسبة الاكتمال", `${summary.completionPercent ?? 0}%`]);
    rows.push(["مؤشرات مقيَّمة", summary.evaluatedIndicators ?? 0]);
    rows.push(["إجمالي المؤشرات", summary.totalIndicators ?? 0]);
    rows.push(["حالة التقييم", summary.reportState ?? ""]);
    rows.push([]);
    rows.push(["المعيار", "الوزن %", "نسبة التحقق %", "المساهمة", "مؤشرات مقيَّمة"]);

    for (const c of summary.criteria ?? []) {
      rows.push([
        `${c.code} — ${c.title}`,
        c.weight ?? "",
        c.achievementPercent ?? "",
        c.contribution ?? "",
        `${c.evaluatedIndicators ?? 0}/${c.totalIndicators ?? 0}`,
      ]);
    }

    rows.push([]);
    rows.push(["المعيار الفرعي", "الوزن %", "نسبة التحقق %", "المساهمة"]);
    for (const c of summary.criteria ?? []) {
      for (const s of c.subCriteria ?? []) {
        rows.push([
          `${s.code} — ${s.title}`,
          s.weight ?? "",
          s.achievementPercent ?? "",
          s.contribution ?? "",
        ]);
      }
    }
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "منصة رِفاد";
    wb.created = new Date();
    const ws = wb.addWorksheet("التقرير", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 0 }],
    });

    ws.columns = [
      { width: 34 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
      { width: 16 },
    ];

    const titleRow = ws.addRow([`${row.title} — ${row.number}`]);
    titleRow.font = { bold: true, size: 14, color: { argb: "FF0B2545" } };
    ws.mergeCells(titleRow.number, 1, titleRow.number, 5);

    for (const r of rows) {
      const excelRow = ws.addRow(r);
      if (r.length === 5 && typeof r[0] === "string" && r[0].includes("—")) {
        // صفوف المعايير
      } else if (r.length === 1 && r[0]) {
        excelRow.font = { bold: true, color: { argb: "FF0B2545" } };
      }
    }

    // تنسيق رؤوس الجداول
    ws.eachRow((r, i) => {
      const first = String(r.getCell(1).value ?? "");
      if (["المعيار", "المعيار الفرعي"].includes(first)) {
        r.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF0B2545" },
          };
          cell.alignment = { horizontal: "right", vertical: "middle" };
        });
      }
      r.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    });

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-${row.number}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "json") {
    return NextResponse.json({
      number: row.number,
      title: row.title,
      status: row.status,
      summary,
    });
  }

  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const body = "\uFEFF" + csv; // BOM لضمان ظهور العربية في Excel

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${row.number}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
