"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { SCORE_COLOR, scoreTone } from "@/lib/labels";

/** نافذة تأكيد قبل العمليات الحساسة. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  tone = "danger",
  requireReason,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  requireReason?: { label: string; min?: number };
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  const min = requireReason?.min ?? 3;
  const invalid = !!requireReason && reason.trim().length < min;
  return (
    <Modal open={open} onClose={onClose} title={title} width="sm">
      <div className="space-y-4">
        <div className="flex gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === "danger" ? "bg-danger-soft text-danger" : "bg-info-soft text-info"}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="text-sm leading-relaxed text-gray-700">{message}</div>
        </div>
        {requireReason && (
          <div>
            <label className="label">{requireReason.label}</label>
            <textarea className="input min-h-[84px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className={`btn btn-sm ${tone === "danger" ? "btn-danger" : "btn-primary"}`} disabled={busy || invalid} onClick={() => onConfirm(reason.trim())}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** تبويبات بسيطة وسهلة الوصول. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100/80 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${value === t.key ? "text-navy" : "text-gray-600 hover:text-navy"}`}
        >
          {value === t.key && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{t.label}{typeof t.count === "number" && <span className="ms-1.5 rounded-full bg-gray-200/80 px-1.5 text-[10.5px]">{t.count}</span>}</span>
        </button>
      ))}
    </div>
  );
}

/** ترقيم صفحات. */
export function Pagination({ page, totalPages, onPage, total }: { page: number; totalPages: number; onPage: (p: number) => void; total?: number }) {
  if (totalPages <= 1) return total != null ? <p className="px-1 text-xs text-gray-400">{total} سجل</p> : null;
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2">
      <p className="text-xs text-gray-500">{total != null ? `${total} سجل · ` : ""}صفحة {page} من {totalPages}</p>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="السابق"><ChevronRight className="h-4 w-4" /></button>
        <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="التالي"><ChevronLeft className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** رقم متحرك يصعد إلى قيمته عند ظهوره. */
export function AnimatedNumber({ value, digits = 0, suffix = "" }: { value: number | null | undefined; digits?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || value == null || !ref.current) return;
    const el = ref.current;
    const ctrl = animate(0, value, { duration: 0.9, ease: "easeOut", onUpdate: (v) => { el.textContent = v.toFixed(digits) + suffix; } });
    return () => ctrl.stop();
  }, [inView, value, digits, suffix]);
  if (value == null) return <span>—</span>;
  return <span ref={ref}>{value.toFixed(digits)}{suffix}</span>;
}

/** حلقة نسبة متحركة. */
export function ScoreRing({ value, size = 120, stroke = 10, label, sub, dark }: { value: number | null | undefined; size?: number; stroke?: number; label?: string; sub?: string; dark?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const color = value == null ? (dark ? "rgba(255,255,255,.25)" : "#CBD3DA") : SCORE_COLOR[scoreTone(value)];
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,.14)" : "#E8ECEF"} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span style={{ fontSize: Math.max(10, Math.round(size * (label ? 0.2 : 0.24))) }} className={`font-heading font-bold leading-none ${dark ? "text-white" : "text-navy"}`}>
          {value == null ? "—" : <AnimatedNumber value={value} digits={value % 1 ? 1 : 0} suffix="%" />}
        </span>
        {label && size >= 90 && <span className={`mt-1 text-[10.5px] ${dark ? "text-white/60" : "text-gray-500"}`}>{label}</span>}
        {sub && size >= 90 && <span className={`text-[10px] ${dark ? "text-white/40" : "text-gray-400"}`}>{sub}</span>}
      </div>
    </div>
  );
}

/** شريط تقدم أفقي ملوّن حسب النسبة. */
export function ScoreBar({ value, height = 8 }: { value: number | null | undefined; height?: number }) {
  const color = SCORE_COLOR[scoreTone(value)];
  return (
    <div className="w-full overflow-hidden rounded-full bg-gray-100" style={{ height }} role="progressbar" aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} whileInView={{ width: `${value ?? 0}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: "easeOut" }} />
    </div>
  );
}

/** حاوية تُظهر عناصرها بالتتابع. */
export function Stagger({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
      {children}
    </motion.div>
  );
}
export function Rise({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } }}>
      {children}
    </motion.div>
  );
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string }) {
  const m = map[value] ?? { label: value, tone: "neutral" };
  return <span className={`badge badge-${m.tone}`}>{m.label}</span>;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
