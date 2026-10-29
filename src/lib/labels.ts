/** تسميات عربية موحّدة للحالات والأنواع في كل الواجهات. */
export const VISIT_STATUS: Record<string, { label: string; tone: string }> = {
  SCHEDULED: { label: "مجدولة", tone: "info" },
  IN_PROGRESS: { label: "جارية", tone: "warning" },
  SUBMITTED: { label: "بانتظار المراجعة", tone: "gold" },
  COMPLETED: { label: "معتمدة", tone: "success" },
  POSTPONED: { label: "مؤجلة", tone: "neutral" },
  CANCELLED: { label: "ملغاة", tone: "danger" },
  OVERDUE: { label: "متأخرة", tone: "danger" },
};

export const VISIT_TYPE: Record<string, string> = {
  PERIODIC: "دورية",
  FOLLOW_UP: "متابعة",
  EXPLORATORY: "استطلاعية",
  EMERGENCY: "طارئة",
};

export const REPORT_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  UNDER_REVIEW: { label: "قيد المراجعة", tone: "warning" },
  APPROVED: { label: "معتمد", tone: "success" },
  REJECTED: { label: "مرفوض", tone: "danger" },
};

export const EVIDENCE_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "بانتظار المراجعة", tone: "warning" },
  ACCEPTED: { label: "مقبول", tone: "success" },
  REJECTED: { label: "مرفوض", tone: "danger" },
};

export const VALIDITY: Record<string, string> = {
  VALID: "صالح كدليل",
  PARTIAL: "صالح جزئياً",
  INVALID: "غير صالح",
};

export const ACTION_STATUS: Record<string, { label: string; tone: string }> = {
  NEW: { label: "جديد", tone: "info" },
  IN_PROGRESS: { label: "قيد التنفيذ", tone: "warning" },
  OVERDUE: { label: "متأخر", tone: "danger" },
  COMPLETED: { label: "يحتاج تحقق", tone: "gold" },
  CLOSED_VERIFIED: { label: "مغلق بعد التحقق", tone: "success" },
  CLOSED_REJECTED: { label: "مرفوض التحقق", tone: "danger" },
};

export const PRIORITY: Record<string, { label: string; tone: string }> = {
  LOW: { label: "منخفضة", tone: "neutral" },
  MEDIUM: { label: "متوسطة", tone: "info" },
  HIGH: { label: "عالية", tone: "warning" },
  CRITICAL: { label: "حرجة", tone: "danger" },
};

export const RATING_LABEL: Record<number, string> = {
  0: "غير متحقق",
  1: "متحقق بدرجة ضعيفة",
  2: "متحقق بدرجة متوسطة",
  3: "متحقق",
};

/** لون النسبة: أخضر ≥75، ذهبي ≥50، برتقالي ≥25، أحمر دون ذلك. */
export function scoreTone(p: number | null | undefined): "success" | "gold" | "warning" | "danger" | "neutral" {
  if (p == null) return "neutral";
  if (p >= 75) return "success";
  if (p >= 50) return "gold";
  if (p >= 25) return "warning";
  return "danger";
}

export const SCORE_COLOR: Record<string, string> = {
  success: "#0F7B4F",
  gold: "#C9A227",
  warning: "#C2760B",
  danger: "#B42318",
  neutral: "#94A3B0",
};

export function fmtPercent(p: number | null | undefined, digits = 1): string {
  return p == null ? "—" : `${Number(p).toFixed(digits).replace(/\.0+$/, "")}%`;
}

export function fmtDate(iso?: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") || iso.includes(" ") ? iso.replace(" ", "T") + (iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z") : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-YE", { year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
