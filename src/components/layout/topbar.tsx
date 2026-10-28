"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, LogOut, LayoutDashboard, ShieldCheck, Sparkles, ChevronDown } from "lucide-react";

type Props = {
  user: { name: string; email: string; role: string; roleKey?: string } | null;
  onLogout: () => void;
  onToggleSidebar: () => void;
};

export default function TopBar({ user, onLogout, onToggleSidebar }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  // إغلاق القائمة بالنقر خارجها
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const today = new Date().toLocaleDateString("ar-YE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="sticky top-0 z-30 flex h-[62px] items-center justify-between gap-3 border-b border-gray-200/80 bg-warm-white/85 px-4 backdrop-blur-md lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-navy transition hover:bg-navy/5"
          aria-label="فتح أو إغلاق القائمة الرئيسية"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden min-w-0 md:block">
          <p className="truncate text-[13px] font-semibold text-navy">
            منصة رِفاد للمتابعة والجودة المدرسية
          </p>
          <p className="truncate text-[11px] text-gray-400">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {user?.roleKey === "SUPER_ADMIN" && (
          <Link
            href="/admin"
            className="hidden items-center gap-1.5 rounded-lg bg-gradient-to-br from-gold-bright to-gold px-3 py-1.5 text-[12px] font-bold text-[#2A1F00] shadow-sm transition hover:brightness-105 sm:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5" />
            الإدارة
          </Link>
        )}

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="flex items-center gap-2 rounded-xl py-1.5 pl-2 pr-1.5 transition hover:bg-gray-100"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-navy to-navy-soft font-heading text-sm font-bold text-gold-bright">
              {user?.name?.trim()?.charAt(0) ?? "؟"}
            </span>
            <span className="hidden text-right sm:block">
              <span className="block max-w-[140px] truncate text-[12.5px] font-semibold text-navy">
                {user?.name}
              </span>
              <span className="block max-w-[140px] truncate text-[10.5px] text-gray-400">
                {user?.role}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>

          {menuOpen && (
            <div
              className="absolute left-0 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg animate-fade-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="truncate text-[12.5px] font-semibold text-navy">{user?.name}</p>
                <p className="truncate text-[10.5px] text-gray-400">{user?.email}</p>
              </div>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-gray-700 transition hover:bg-gray-50"
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> لوحة التحكم
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-gray-700 transition hover:bg-gray-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> الإعدادات
              </Link>
              <button
                onClick={onLogout}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-[12.5px] text-danger transition hover:bg-danger-soft"
              >
                <LogOut className="h-3.5 w-3.5 rtl-flip" /> تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
