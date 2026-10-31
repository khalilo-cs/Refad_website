/** عناصر التنقل الرئيسية وما يظهر لكل دور (الفحص الفعلي للصلاحيات يتم في الخادم). */
export type NavItem = { key: string; label: string; href: string; icon: string };

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "لوحة التحكم", href: "/dashboard", icon: "Layout" },
  { key: "schools", label: "المدارس", href: "/schools", icon: "Building" },
  { key: "map", label: "الخريطة", href: "/map", icon: "Map" },
  { key: "self-assessment", label: "التقييم الذاتي", href: "/self-assessment", icon: "ClipboardCheck" },
  { key: "quality-tracking", label: "متابعة الجودة والتحسين", href: "/quality-tracking", icon: "Award" },
  { key: "visits", label: "الزيارات الميدانية", href: "/visits", icon: "Calendar" },
  { key: "evaluation", label: "التقييم الميداني", href: "/evaluation", icon: "ClipboardList" },
  { key: "evidence", label: "الأدلة والشواهد", href: "/evidence", icon: "FileText" },
  { key: "reports", label: "التقارير", href: "/reports", icon: "BarChart" },
  { key: "improvement", label: "خطط التحسين", href: "/improvement", icon: "RefreshCw" },
  { key: "rankings", label: "التميّز والتكريم", href: "/rankings", icon: "Trophy" },
  { key: "directory", label: "دليل الاتصال", href: "/directory", icon: "Phone" },
  { key: "communication", label: "التواصل", href: "/communication", icon: "Mail" },
  { key: "settings", label: "الإعدادات", href: "/settings", icon: "Settings" },
  { key: "users", label: "المستخدمون والأدوار", href: "/users", icon: "ShieldCheck" },
];

const ALL = NAV_ITEMS.map((n) => n.key);
const ROLE_NAV: Record<string, string[]> = {
  SUPER_ADMIN: ALL,
  EDUCATION_DIRECTOR: ["dashboard", "quality-tracking", "self-assessment", "schools", "map", "visits", "evaluation", "evidence", "reports", "improvement", "rankings", "directory", "communication", "settings"],
  INSPECTOR: ["dashboard", "quality-tracking", "self-assessment", "schools", "map", "visits", "evaluation", "evidence", "reports", "improvement", "rankings", "directory", "communication", "settings"],
  SCHOOL_PRINCIPAL: ["dashboard", "self-assessment", "schools", "visits", "evaluation", "evidence", "reports", "improvement", "communication", "settings"],
  QUALITY_COORDINATOR: ["dashboard", "self-assessment", "schools", "visits", "evaluation", "evidence", "reports", "improvement", "communication", "settings"],
  TEACHER: ["dashboard", "evidence", "communication", "settings"],
  PARENT: ["dashboard", "communication", "settings"],
  GUEST: ["dashboard"],
};

export function navFor(roleKey: string | undefined, permissions?: Record<string, unknown>): NavItem[] {
  const keys = new Set(ROLE_NAV[roleKey ?? ""] ?? ["dashboard", "settings"]);
  if (permissions?.all === true) ALL.forEach((k) => keys.add(k));
  return NAV_ITEMS.filter((n) => keys.has(n.key));
}

/** هل يصل الدور إلى رابط داخلي؟ (لإخفاء الأزرار المؤدية إلى أقسام خارج صلاحياته) */
export function canSeeHref(roleKey: string | undefined, permissions: Record<string, unknown> | undefined, href: string): boolean {
  const section = "/" + (href.split(/[?#]/)[0].split("/")[1] ?? "");
  if (!NAV_ITEMS.some((n) => n.href === section)) return true;
  return navFor(roleKey, permissions).some((n) => n.href === section);
}
