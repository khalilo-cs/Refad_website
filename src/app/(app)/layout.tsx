"use client";

import { useSession, useToast } from "@/components/providers";
import { useEffect, useState, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import RifadLogo from "@/components/brand/rifad-logo";

const NAV_ITEMS = [
  { key: "dashboard", label: "لوحة التحكم", href: "/dashboard", icon: "Layout" },
  { key: "schools", label: "المدارس", href: "/schools", icon: "Building" },
  { key: "visits", label: "الزيارات الميدانية", href: "/visits", icon: "Calendar" },
  { key: "evaluation", label: "التقييم الميداني", href: "/evaluation", icon: "ClipboardList" },
  { key: "evidence", label: "الأدلة والشواهد", href: "/evidence", icon: "FileText" },
  { key: "reports", label: "التقارير", href: "/reports", icon: "BarChart" },
  { key: "improvement", label: "خطط التحسين", href: "/improvement", icon: "RefreshCw" },
  { key: "communication", label: "التواصل", href: "/communication", icon: "Mail" },
  { key: "settings", label: "الإعدادات", href: "/settings", icon: "Settings" },
  { key: "users", label: "المستخدمون والأدوار", href: "/users", icon: "ShieldCheck" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, loading } = useSession();
  const { add } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // إغلاق الشريط تلقائياً على الشاشات الصغيرة
  useEffect(() => {
    const apply = () => setSidebarOpen(window.innerWidth >= 1024);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // إشعار ترحيب مرة واحدة لكل جلسة، لا في كل تنقّل
  const welcomed = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!welcomed.current) {
      welcomed.current = true;
      add({ type: "success", message: `أهلاً ${user.name}` });
    }
  }, [user, loading, router, add, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-aurora">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-float">
            <RifadLogo size={64} />
          </div>
          <div className="flex items-center gap-2 text-white/70">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise border-t-transparent" />
            <span className="text-sm">جارٍ تحميل الجلسة…</span>
          </div>
        </div>
      </div>
    );
  }

  const can = (key: string) => {
    if (!user) return false;
    if (user.roleKey === "SUPER_ADMIN") return true;
    if (key === "users") return false; // إدارة المستخدمين لمدير النظام فقط
    return true;
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <Sidebar
        items={NAV_ITEMS.filter((x) => can(x.key))}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onLogout={logout}
        user={user}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onLogout={logout} onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
