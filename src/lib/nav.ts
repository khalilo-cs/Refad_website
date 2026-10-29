/** عناصر التنقل الرئيسية وما يظهر لكل دور (الفحص الفعلي للصلاحيات يتم في الخادم). */
export type NavItem = { key: string; label: string; href: string; icon: string };

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "لوحة التحكم", href: "/dashboard", icon: "Layout" },
  { key: "schools", label: "المدارس", href: "/schools", icon: "Building" },
  { key: "map", label: "الخريطة", href: "/map", icon: "Map" },
  { key: "visits", label: "الزيارات الميدانية", href: "/visits", icon: "Calendar" },
  { key: "evaluation", label: "التقييم الميداني", href: "/evaluation", icon: "ClipboardList" },
  { key: "evidence", label: "الأدلة والشواهد", href: "/evidence", icon: "FileText" },
  { key: "reports", label: "التقارير", href: "/reports", icon: "BarChart" },
  { key: "improvement", label: "خطط التحسين", href: "/improvement", icon: "RefreshCw" },
  { key: "rankings", label: "التميّز والتكريم", href: "/rankings", icon: "Trophy" },
  { key: "communication", label: "التواصل", href: "/communication", icon: "Mail" },
  { key: "settings", label: "الإعدادات", href: "/settings", icon: "Settings" },
  { key: "users", label: "المستخدمون والأدوار", href: "/users", icon: "ShieldCheck" },
];

const ALL = NAV_ITEMS.map((n) => n.key);
const ROLE_NAV: Record<string, string[]> = {
  SUPER_ADMIN: ALL,
  EDUCATION_DIRECTOR: ["dashboard", "schools", "map", "visits", "evaluation", "evidence", "reports", "improvement", "rankings", "communication", "settings"],
  INSPECTOR: ["dashboard", "schools", "map", "visits", "evaluation", "evidence", "reports", "improvement", "rankings", "communication", "settings"],
  SCHOOL_PRINCIPAL: ["dashboard", "schools", "visits", "evidence", "reports", "improvement", "communication", "settings"],
  QUALITY_COORDINATOR: ["dashboard", "schools", "evidence", "reports", "improvement", "communication", "settings"],
  TEACHER: ["dashboard", "evidence", "communication", "settings"],
  PARENT: ["dashboard", "communication", "settings"],
  GUEST: ["dashboard"],
};

export function navFor(roleKey: string | undefined, permissions?: Record<string, unknown>): NavItem[] {
  const keys = new Set(ROLE_NAV[roleKey ?? ""] ?? ["dashboard", "settings"]);
  if (permissions?.all === true) ALL.forEach((k) => keys.add(k));
  return NAV_ITEMS.filter((n) => keys.has(n.key));
}
