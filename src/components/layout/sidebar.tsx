"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Layout,
  Building,
  Calendar,
  ClipboardList,
  FileText,
  BarChart,
  RefreshCw,
  Mail,
  Settings,
  ShieldCheck,
  ChevronLeft,
  LogOut,
  Layers,
  Sparkles,
} from "lucide-react";
import RifadLogo from "@/components/brand/rifad-logo";

type NavItem = { key: string; label: string; href: string; icon: string };

const ICONS: Record<string, React.ComponentType<any>> = {
  Layout,
  Building,
  Calendar,
  ClipboardList,
  FileText,
  BarChart,
  RefreshCw,
  Mail,
  Settings,
  ShieldCheck,
  Layers,
};

type Props = {
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
  onLogout: () => void;
  user: { name: string; email: string; role: string; roleKey: string } | null;
};

export default function Sidebar({ items, open, onToggle, onLogout, user }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-[268px] flex-col bg-aurora text-white shadow-2xl transition-transform duration-300 ease-out
        [dir="rtl"]:translate-x-full [dir="ltr"]:-translate-x-full
        ${open ? "translate-x-0" : ""}`}
      aria-label="التنقل الرئيسي"
    >
      {/* توهج علوي */}
      <div className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-turquoise/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-gold/10 blur-3xl" />

      {/* الترويسة */}
      <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 transition hover:opacity-90">
          <RifadLogo size={38} withText tone="light" />
        </Link>
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="إغلاق القائمة"
        >
          <ChevronLeft className="h-5 w-5 rtl-flip" />
        </button>
      </div>

      {/* التنقل */}
      <nav className="relative flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
          القائمة الرئيسية
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = ICONS[item.icon] || Layout;
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => {
                    if (typeof window !== "undefined" && window.innerWidth < 1024) onToggle();
                  }}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
                    active
                      ? "bg-white/12 text-white shadow-inner"
                      : "text-white/65 hover:bg-white/8 hover:text-white"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {active && (
                    <span className="absolute right-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-gold-bright to-gold" />
                  )}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition ${
                      active ? "text-gold-bright" : "text-white/50 group-hover:text-turquoise"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {user?.roleKey === "SUPER_ADMIN" && (
          <>
            <p className="mb-2 mt-5 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              الإدارة
            </p>
            <Link
              href="/admin"
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all duration-200 ${
                pathname.startsWith("/admin")
                  ? "bg-gold/20 text-gold-bright shadow-inner ring-1 ring-gold/30"
                  : "bg-white/5 text-gold-bright/90 hover:bg-gold/15"
              }`}
            >
              <Sparkles className="h-[18px] w-[18px] shrink-0" />
              <span>لوحة الإدارة الشاملة</span>
            </Link>
          </>
        )}
      </nav>

      {/* بطاقة المستخدم */}
      <div className="relative border-t border-white/10 p-3">
        <button
          onClick={() => router.push("/settings")}
          className="flex w-full items-center gap-2.5 rounded-xl bg-white/6 px-3 py-2.5 text-right transition hover:bg-white/12"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-turquoise to-emerald font-heading text-sm font-bold text-white">
            {user?.name?.trim()?.charAt(0) ?? "؟"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">
              {user?.name}
            </span>
            <span className="block truncate text-[10.5px] text-white/50">{user?.role}</span>
          </span>
        </button>

        <button
          onClick={onLogout}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[12.5px] font-medium text-white/60 transition hover:border-danger/40 hover:bg-danger/15 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5 rtl-flip" />
          تسجيل الخروج
        </button>

        <p className="mt-3 text-center text-[9px] leading-relaxed text-white/25">
          تصميم وتطوير: المهندس محمد خليل
          <br />
          <span dir="ltr" className="font-mono">736390203</span>
        </p>
      </div>
    </aside>
  );
}
