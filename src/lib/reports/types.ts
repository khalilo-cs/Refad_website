/** هيكل محتوى التقرير: مصدر واحد تقرؤه المعاينة وPDF وExcel وCSV. */
export type Cell = string | number | null;

export type Column = { key: string; label: string; width?: number; align?: "right" | "left" | "center" };

export type Section =
  | { kind: "stats"; title?: string; items: { label: string; value: string; hint?: string }[] }
  | { kind: "kv"; title?: string; items: [string, string][] }
  | { kind: "table"; title: string; columns: Column[]; rows: Cell[][]; note?: string; emptyText?: string }
  | { kind: "text"; title: string; body: string }
  | { kind: "bullets"; title: string; items: string[]; emptyText?: string };

export type ReportType =
  | "VISIT_DAILY"
  | "DIRECTORATE_DAILY"
  | "PERIODIC"
  | "QUALITY_DETAILED"
  | "SPECIAL";

export const REPORT_TYPE_LABEL: Record<string, string> = {
  VISIT_DAILY: "تقرير الزيارة الميدانية اليومية",
  DIRECTORATE_DAILY: "التقرير اليومي للإدارة التعليمية",
  PERIODIC: "التقرير الدوري للمدارس",
  QUALITY_DETAILED: "تقرير الجودة التفصيلي",
  SPECIAL: "تقرير إداري خاص",
  SCHOOL_EVALUATION: "تقرير تقييم مدرسة",
};

export type ReportContent = {
  type: ReportType;
  title: string;
  subtitle?: string;
  generatedAt: string;
  meta: [string, string][];
  /** مكتمل / غير مكتمل / معلوماتي */
  state: "COMPLETE" | "INCOMPLETE" | "INFO";
  notices: string[];
  sections: Section[];
};

export const SPECIAL_TOPICS: Record<string, { label: string; kind: "attendance" | "results" | "indicators"; codes?: string[]; criterionCodes?: string[]; note?: string }> = {
  attendance: { label: "الحضور والغياب المدرسي", kind: "attendance" },
  results: { label: "نتائج التحصيل الدراسي", kind: "results" },
  training: { label: "التدريب والتنمية المهنية", kind: "indicators", codes: ["2-1-3", "2-1-4", "2-1-8", "2-2-3", "2-2-4", "2-2-8", "4-2-4", "5-2-2"] },
  facilities: { label: "المرافق والبنية التحتية", kind: "indicators", criterionCodes: ["5-1"] },
  maintenance: { label: "الصيانة والجوانب الجمالية", kind: "indicators", codes: ["5-1-15", "5-1-13", "5-1-12", "5-1-17", "5-1-16"] },
  safety: { label: "الأمن والسلامة", kind: "indicators", criterionCodes: ["5-2"], codes: ["3-12", "3-13", "3-4"] },
  parents: { label: "التواصل مع أولياء الأمور", kind: "indicators", codes: ["1-2-14", "1-2-15", "1-2-18", "6-1", "6-2", "6-4"] },
  activities: { label: "الأنشطة الطلابية", kind: "indicators", codes: ["3-8", "3-9", "3-10", "3-11", "5-1-14"] },
  community: { label: "الشراكة المجتمعية", kind: "indicators", criterionCodes: ["6"] },
};
