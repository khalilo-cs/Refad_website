export const UPLOAD_TYPES_HINT =
  "كل أنواع الملفات مقبولة: صور، فيديو، صوت، PDF، Word، Excel، PowerPoint، ملفات مضغوطة ونصوص — ما عدا الملفات التنفيذية والبرمجية. يُتحقق من محتوى الملف لا من امتداده فقط.";

/** رسالة خطأ الرفع؛ 413 تصدر من الاستضافة نفسها قبل وصول الطلب إلى المنصة فلا تحمل رسالة عربية. */
export function uploadErrorMessage(status: number, body: { message?: string } | null | undefined, fallback = "تعذّر رفع الملف"): string {
  if (status === 413) return "حجم الملف أكبر مما تسمح به الاستضافة. صغّر الملف أو اضغطه (صورة بدقة أقل، فيديو أقصر، أو ملف مضغوط) ثم أعد المحاولة.";
  return body?.message ?? fallback;
}
