"use client";

import { ReactNode, useEffect } from "react";
import { X, LucideIcon } from "lucide-react";

/* ==========================================================
   مكوّنات واجهة مشتركة — تحافظ على اتساق التصميم في كل الصفحات
   ========================================================== */

/** رأس الصفحة: عنوان ووصف وأزرار إجراءات. */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between animate-fade-up">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-navy to-navy-soft text-gold-bright shadow-md">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div>
          <h1 className="font-heading text-2xl font-bold leading-tight text-navy md:text-[26px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** بطاقة إحصائية. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "navy" | "teal" | "gold" | "rose" | "emerald";
  delay?: number;
}) {
  const tones: Record<string, { bg: string; fg: string; ring: string }> = {
    navy: { bg: "bg-navy/8", fg: "text-navy", ring: "ring-navy/10" },
    teal: { bg: "bg-turquoise/10", fg: "text-turquoise", ring: "ring-turquoise/15" },
    gold: { bg: "bg-gold/12", fg: "text-gold", ring: "ring-gold/20" },
    rose: { bg: "bg-danger/8", fg: "text-danger", ring: "ring-danger/10" },
    emerald: { bg: "bg-emerald/10", fg: "text-emerald", ring: "ring-emerald/15" },
  };
  const t = tones[tone] ?? tones.navy;

  return (
    <div
      className="card-elevated card-accent animate-fade-up p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-600">{label}</p>
          <p className="mt-2 font-heading text-[26px] font-bold leading-none text-navy">{value}</p>
          {hint && <p className="mt-2 text-[11px] text-gray-400">{hint}</p>}
        </div>
        {Icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${t.bg} ${t.fg} ${t.ring}`}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}

/** نافذة منبثقة. تُغلق بمفتاح Escape. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/55 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${widths[width]} max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-lg animate-fade-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="font-heading text-lg font-bold text-navy">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-gray-600">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/** حالة فراغ. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
          <Icon className="h-7 w-7" />
        </span>
      )}
      <div>
        <p className="font-heading font-bold text-navy">{title}</p>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** تنبيه مضمن. */
export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: "bg-info-soft border-info/25 text-info",
    warning: "bg-warning-soft border-warning/25 text-warning",
    danger: "bg-danger-soft border-danger/25 text-danger",
    success: "bg-success-soft border-success/25 text-success",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`} role="status">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/** جدول متجاوب بغلاف. */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** هيكل تحميل. */
export function LoadingRows({ cols = 5, rows = 4 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="skeleton h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
