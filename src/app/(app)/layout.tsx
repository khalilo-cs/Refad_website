"use client";

import { useSession, useToast } from "@/components/providers";
import { useEffect, useState, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import RifadLogo from "@/components/brand/rifad-logo";
import Link from "next/link";
import { Lock } from "lucide-react";
import { NAV_ITEMS, navFor } from "@/lib/nav";


export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, loading } = useSession();
  const { add } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // إغلاق الشريط تلقائياً على الشاشات الصغيرة
  useEffect(() => {
    const apply = () => setSidebarOpen(window.innerWidth >= 1024);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // Escape يغلق الدرج على الشاشات الصغيرة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.innerWidth < 1024) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // إشعار ترحيب مرة واحدة لكل جلسة، لا في كل تنقّل
  const welcomed = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // حساب بكلمة مرور مؤقتة: صفحة التغيير أولاً (يحميها الخادم أيضاً)
    if (user.mustChangePassword) {
      window.location.replace("/change-password");
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


  const items = navFor(user?.roleKey, (user as any)?.permissions);
  // صفحة من القائمة لا يملكها الدور: رسالة واضحة بدل شاشة فارغة أو أخطاء
  const section = "/" + (pathname.split("/")[1] ?? "");
  const known = NAV_ITEMS.some((n) => n.href === section);
  const allowed = !known || items.some((n) => n.href === section);
  const content = allowed ? children : (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
      <Lock className="mx-auto mb-3 h-9 w-9 text-gray-300" />
      <h2 className="font-heading text-lg font-bold text-navy">هذا القسم غير متاح لحسابك</h2>
      <p className="mt-1.5 text-[13px] text-gray-600">صلاحيات دورك ({user?.role}) لا تشمل هذه الصفحة. إن كنت تحتاجها فاطلب ذلك من مدير النظام.</p>
      <Link href="/dashboard" className="btn btn-primary btn-sm mt-5">العودة إلى لوحتي</Link>
    </div>
  );

  if (user?.mustChangePassword) return null;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <Sidebar
        items={items}
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
          <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">{content}</div>
        </main>
      </div>
    </div>
  );
}
