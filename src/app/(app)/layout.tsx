"use client";

import { useSession, useToast } from "@/components/providers";
import { useEffect, useState, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import RifadLogo from "@/components/brand/rifad-logo";
import { navFor } from "@/lib/nav";


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


  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <Sidebar
        items={navFor(user?.roleKey, (user as any)?.permissions)}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onLogout={logout}
        user={user}
      />

      {sidebarOpen && (
        <button
          aria-label="إغلاق القائمة"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-navy-deep/55 backdrop-blur-[2px] lg:hidden animate-fade-in"
        />
      )}

      <div
        className={`flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-out ${
          sidebarOpen ? "lg:mr-[268px]" : ""
        }`}
      >
        <TopBar user={user} onLogout={logout} onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
