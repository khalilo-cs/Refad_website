import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getServerSession, authorize } from "@/lib/auth";

/**
 * تنزيل قالب استيراد المدارس (xlsx) مع صف توضيحي
 * وورقة ثانية تشرح القيم المسموحة.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  }
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) {
    return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "منصة رِفاد";

  const ws = wb.addWorksheet("المدارس", {
    views: [{ rightToLeft: true }],
  });

  ws.columns = [
    { header: "الكود", key: "code", width: 18 },
    { header: "الاسم", key: "name", width: 34 },
    { header: "المحافظة", key: "gov", width: 16 },
    { header: "المديرية", key: "dir", width: 16 },
    { header: "النوع", key: "type", width: 14 },
    { header: "المرحلة", key: "stage", width: 14 },
    { header: "العنوان", key: "address", width: 26 },
    { header: "الهاتف", key: "phone", width: 16 },
    { header: "البريد الإلكتروني", key: "email", width: 26 },
    { header: "مدير المدرسة", key: "principal", width: 24 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
    cell.alignment = { horizontal: "right", vertical: "middle" };
  });
  ws.getRow(1).height = 22;

  ws.addRow({
    code: "SCH-001",
    name: "اسم المدرسة كما هو في السجل الرسمي",
    gov: "الحديدة",
    dir: "الجراحي",
    type: "حكومية",
    stage: "أساسي",
    address: "القرية / الحي",
    phone: "77XXXXXXX",
    email: "",
    principal: "اسم مدير المدرسة",
  });

  ws.eachRow((row, i) => {
    if (i > 1) {
      row.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    }
  });

  const guide = wb.addWorksheet("إرشادات", { views: [{ rightToLeft: true }] });
  guide.columns = [{ width: 26 }, { width: 70 }];
  const lines: Array<[string, string]> = [
    ["العمود", "الشرح"],
    ["الكود", "إلزامي وفريد. لا يُقبل كود مكرر في الملف أو في قاعدة البيانات."],
    ["الاسم", "إلزامي. اسم المدرسة الرسمي."],
    ["المحافظة", "إلزامي. يجب أن يطابق اسماً موجوداً في النظام (مثال: الحديدة)."],
    ["المديرية", "إلزامي. يجب أن تتبع المحافظة المذكورة في نفس الصف."],
    ["النوع", "إلزامي. مثال: حكومية / أهلية / خاصة."],
    ["المرحلة", "إلزامي. مثال: أساسي / ثانوي / أساسي وثانوي."],
    ["العنوان", "اختياري."],
    ["الهاتف", "اختياري."],
    ["البريد الإلكتروني", "اختياري، ويجب أن يكون بصيغة صحيحة إن أُدخل."],
    ["مدير المدرسة", "اختياري."],
    ["", ""],
    ["ملاحظة مهمة", "الاستيراد يمر بمرحلة فحص أولاً. لا يُحفظ أي سجل قبل تأكيدك الصريح."],
    ["الصفوف المعطوبة", "أي صف يحتوي خطأ لا يُحفظ، ويظهر سبب رفضه في تقرير الفحص."],
  ];
  lines.forEach((l, i) => {
    const r = guide.addRow(l);
    if (i === 0) {
      r.eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
      });
    }
    r.alignment = { horizontal: "right", vertical: "top", wrapText: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="rifad-schools-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
