"use client";

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/**
 * توليد تقرير PDF عربي باتجاه RTL.
 *
 * ملاحظة تقنية صريحة: jsPDF لا يدعم تشكيل الحروف العربية ولا اتجاه النص
 * تلقائياً. لذلك نعتمد على:
 *   - خط أميري المُضمَّن (لمظهر عربي صحيح)
 *   - عكس ترتيب الكلمات يدوياً عند الرسم لتحقيق القراءة من اليمين لليسار
 *   - محاذاة النص إلى يمين الصفحة
 * النتيجة قابلة للقراءة والطباعة، ويُنصح بمراجعة أول تقرير بصرياً قبل التوزيع.
 */

export type PdfCriterionRow = {
  code: string;
  title: string;
  weight: number;
  achievementPercent: number | null;
  contribution: number | null;
};

export type PdfSubCriterionRow = {
  code: string;
  title: string;
  weight: number;
  achievementPercent: number | null;
  contribution: number | null;
};

export type PdfReportData = {
  number: string;
  title: string;
  schoolName: string;
  inspectorName: string;
  date: string;
  totalScore: number | null;
  completionPercent: number;
  reportState: "COMPLETE" | "DRAFT_INCOMPLETE";
  evaluatedIndicators: number;
  totalIndicators: number;
  verificationCode: string;
  verifyBaseUrl?: string;
  warnings: string[];
  criteria: PdfCriterionRow[];
  subCriteria: PdfSubCriterionRow[];
};

let fontCache: string | null = null;

/** يحمّل خط أميري كـ base64 مرة واحدة. */
async function loadAmiriFont(): Promise<string> {
  if (fontCache) return fontCache;
  const res = await fetch("/fonts/Amiri-Regular.ttf");
  if (!res.ok) throw new Error("تعذّر تحميل الخط العربي");
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  fontCache = btoa(binary);
  return fontCache;
}

/**
 * يعكس ترتيب المقاطع لعرضها من اليمين لليسار.
 * يقسّم على المسافات ويحافظ على الأرقام والرموز كما هي دون عكسها.
 */
function rtl(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.reverse().join(" ");
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const RIGHT = PAGE_W - MARGIN;

export async function generateArabicPdf(data: PdfReportData): Promise<void> {
  const fontBase64 = await loadAmiriFont();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.addFileToVFS("Amiri-Regular.ttf", fontBase64);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.setFont("Amiri");

  let y = MARGIN;

  const line = (text: string, size: number, opts?: { bold?: boolean; color?: [number, number, number]; gap?: number }) => {
    doc.setFontSize(size);
    doc.setTextColor(...(opts?.color ?? [17, 34, 64]));
    doc.text(rtl(text), RIGHT, y, { align: "right" });
    y += opts?.gap ?? size * 0.55;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const divider = () => {
    doc.setDrawColor(200, 210, 220);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, RIGHT, y);
    y += 4;
  };

  // -------- الترويسة --------
  line("منصة رِفاد للمتابعة والجودة المدرسية", 15, { gap: 8 });
  line("مديرية الجراحي — محافظة الحديدة — الجمهورية اليمنية", 10, {
    color: [90, 107, 123],
    gap: 10,
  });

  divider();

  line(data.title, 14, { gap: 9 });
  line(`رقم التقرير: ${data.number}`, 10, { color: [90, 107, 123], gap: 7 });
  line(`المدرسة: ${data.schoolName}`, 11, { gap: 7 });
  line(`المقيّم: ${data.inspectorName}`, 10, { color: [90, 107, 123], gap: 7 });
  line(`التاريخ: ${data.date}`, 10, { color: [90, 107, 123], gap: 7 });
  line(`رمز التحقق: ${data.verificationCode}`, 10, { color: [90, 107, 123], gap: 4 });

  // -------- مربّع الاستجابة السريعة للتحقق --------
  // يقود إلى صفحة تحقق عامة تعرض حالة التقرير واسم المعتمِد فقط.
  try {
    const verifyUrl = `${data.verifyBaseUrl ?? ""}/verify?code=${encodeURIComponent(
      data.verificationCode
    )}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 0,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#0B2545", light: "#FFFFFF" },
    });
    const qrSize = 26;
    const qrX = MARGIN;
    const qrY = y;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    doc.setFontSize(7);
    doc.setTextColor(130, 140, 150);
    doc.text(rtl("امسح الرمز للتحقق"), qrX + qrSize + 2, qrY + 6, { align: "right" });
    doc.text(rtl("من صحة هذا التقرير"), qrX + qrSize + 2, qrY + 11, { align: "right" });
    doc.text(rtl("عبر المنصة"), qrX + qrSize + 2, qrY + 16, { align: "right" });

    y += qrSize + 5;
  } catch {
    // فشل توليد الرمز لا يمنع إصدار التقرير
    y += 2;
  }

  divider();

  // -------- حالة التقرير --------
  const stateText =
    data.reportState === "COMPLETE"
      ? "تقييم مكتمل — جميع المؤشرات مقيَّمة"
      : "مسودة غير مكتملة — لم تُقيَّم جميع المؤشرات، والدرجة أدناه جزئية";
  line(`حالة التقرير: ${stateText}`, 10, {
    color: data.reportState === "COMPLETE" ? [22, 122, 91] : [168, 116, 26],
    gap: 7,
  });
  line(
    `الدرجة الكلية: ${data.totalScore === null ? "غير متاحة" : data.totalScore + " من 100"}`,
    13,
    { gap: 7 }
  );
  line(
    `نسبة الإكمال: ${data.completionPercent}%  (${data.evaluatedIndicators} من ${data.totalIndicators} مؤشراً)`,
    10,
    { color: [90, 107, 123], gap: 9 }
  );

  if (data.warnings.length > 0) {
    ensureSpace(30);
    line("ملاحظات على اكتمال البيانات:", 10, { color: [168, 116, 26], gap: 6 });
    for (const w of data.warnings) {
      ensureSpace(12);
      doc.setFontSize(9);
      doc.setTextColor(120, 90, 20);
      const wrapped = doc.splitTextToSize(rtl(w), PAGE_W - MARGIN * 2 - 4);
      for (const ln of wrapped) {
        doc.text(ln, RIGHT - 4, y, { align: "right" });
        y += 4.5;
      }
    }
    y += 3;
  }

  // -------- جدول المعايير --------
  ensureSpace(24);
  divider();
  line("نتائج المعايير الرئيسية", 12, { gap: 8 });

  const colW = [22, 78, 20, 30, 25]; // الوزن، المعيار، التحقق، المساهمة
  const headerY = y;
  doc.setFontSize(9);
  doc.setTextColor(17, 34, 64);
  doc.text(rtl("المعيار"), RIGHT, headerY, { align: "right" });
  doc.text(rtl("الوزن"), RIGHT - 82, headerY, { align: "right" });
  doc.text(rtl("نسبة التحقق"), RIGHT - 106, headerY, { align: "right" });
  doc.text(rtl("المساهمة"), RIGHT - 140, headerY, { align: "right" });
  y += 5;

  doc.setDrawColor(220, 226, 232);
  doc.line(MARGIN, y - 2, RIGHT, y - 2);

  for (const c of data.criteria) {
    ensureSpace(10);
    doc.setFontSize(9);
    doc.setTextColor(40, 50, 60);

    const titleLines = doc.splitTextToSize(rtl(`${c.code}. ${c.title}`), 78);
    doc.text(titleLines, RIGHT, y, { align: "right" });

    doc.text(`${c.weight}%`, RIGHT - 82, y, { align: "right" });
    doc.text(
      c.achievementPercent === null ? "—" : `${c.achievementPercent}%`,
      RIGHT - 106,
      y,
      { align: "right" }
    );
    doc.text(c.contribution === null ? "—" : String(c.contribution), RIGHT - 140, y, {
      align: "right",
    });

    y += Math.max(6, titleLines.length * 4.8);
  }

  // -------- المعايير الفرعية --------
  if (data.subCriteria.length > 0) {
    y += 4;
    ensureSpace(20);
    divider();
    line("تفصيل المعايير الفرعية", 12, { gap: 7 });

    doc.setFontSize(9);
    doc.setTextColor(17, 34, 64);
    doc.text(rtl("المعيار الفرعي"), RIGHT, y, { align: "right" });
    doc.text(rtl("الوزن"), RIGHT - 90, y, { align: "right" });
    doc.text(rtl("التحقق"), RIGHT - 114, y, { align: "right" });
    doc.text(rtl("المساهمة"), RIGHT - 144, y, { align: "right" });
    y += 5;

    for (const s of data.subCriteria) {
      ensureSpace(10);
      doc.setFontSize(8.5);
      doc.setTextColor(60, 70, 80);
      const t = doc.splitTextToSize(rtl(`${s.code} ${s.title}`), 90);
      doc.text(t, RIGHT, y, { align: "right" });
      doc.text(`${s.weight}%`, RIGHT - 90, y, { align: "right" });
      doc.text(
        s.achievementPercent === null ? "—" : `${s.achievementPercent}%`,
        RIGHT - 114,
        y,
        { align: "right" }
      );
      doc.text(s.contribution === null ? "—" : String(s.contribution), RIGHT - 144, y, {
        align: "right",
      });
      y += Math.max(5.5, t.length * 4.4);
    }
  }

  // -------- تذييل في كل صفحة --------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(130, 140, 150);
    doc.text(rtl(`صفحة ${p} من ${pages}`), PAGE_W / 2, PAGE_H - 8, { align: "center" });
    doc.text(
      rtl("هذا التقرير لم يُعتمد رسمياً إلا إذا حمل حالة «معتمد» وسجل اعتماد موثّق"),
      PAGE_W / 2,
      PAGE_H - 13,
      { align: "center" }
    );
    doc.setFontSize(7);
    doc.setTextColor(160, 170, 180);
    doc.text(
      rtl("منصة رِفاد — تطوير: المهندس محمد خليل | 736390203"),
      PAGE_W / 2,
      PAGE_H - 18,
      { align: "center" }
    );
  }

  const safeName = data.schoolName.replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
  doc.save(`تقرير-${data.number}-${safeName}.pdf`);
}
