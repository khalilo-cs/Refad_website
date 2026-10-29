/**
 * تهيئة النص العربي للرسم في PDF: تشكيل الحروف (اتصال الحروف) ثم إعادة ترتيب الاتجاهات
 * (bidi) لتظهر الكلمات من اليمين لليسار والأرقام واللاتينية في موضعها الصحيح.
 * jsPDF لا يفعل ذلك تلقائياً.
 */
import ArabicReshaper from "arabic-reshaper";
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

/** يحوّل نصاً منطقياً إلى نص مرئي (جاهز للرسم يساراً→يميناً). */
export function shape(text: string): string {
  if (!text) return "";
  // رموز المؤشرات والأرقام المركّبة (18-2-1، 2026-10-29) تبقى متصلة بترتيبها المكتوب
  const isolated = text.replace(/(\d+(?:[-.:/]\d+)+)/g, "\u2066$1\u2069");
  const reshaped = ArabicReshaper.convertArabic(isolated);
  const levels = bidi.getEmbeddingLevels(reshaped, "rtl");
  // نحذف محارف التحكم بعد الترتيب فلا تُرسم كمربعات
  return bidi.getReorderedString(reshaped, levels).replace(/[\u2066-\u2069\u200E\u200F]/g, "");
}

/** يقسّم نصاً منطقياً إلى أسطر بحيث لا يتجاوز عرض كل سطر (بعد التشكيل) الحد. */
export function wrapLogical(measure: (visual: string) => number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (line && measure(shape(candidate)) > maxWidth) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
