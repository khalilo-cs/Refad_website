/** منطق مشترك بين الخادم والمتصفح للتقييم الذاتي (بلا قاعدة بيانات). */

/**
 * التقدير المقترح من نسبة الأدلة المتوفرة: كلها ← متحقق، النصف فأكثر ← متوسطة، بعضها ← ضعيفة، لا شيء ← غير متحقق.
 * يُقرّب إلى أقرب درجة موجودة في المقياس النشط.
 */
export function suggestScore(have: number, total: number, scores: number[]): number | null {
  if (!scores.length) return null;
  const max = Math.max(...scores), min = Math.min(...scores);
  if (total <= 0) return null;
  const ratio = have / total;
  const target = ratio >= 1 ? max : ratio >= 0.5 ? max - 1 : ratio > 0 ? min + 1 : min;
  return scores.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), scores[0]);
}

