"use client";

import { memo, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, ClipboardCheck, Eye, FileText, History, Loader2, MessageSquare, Paperclip, Users } from "lucide-react";
import { fmtDate } from "@/lib/labels";

export type Rating = { key: string; label_ar: string; score: number };
export type Indicator = {
  indicatorId: string;
  code: string;
  title: string;
  status: "EVALUATED" | "NOT_EVALUATED";
  score: number | null;
  notes: string | null;
  evidence: string[];
  verificationTools: string[];
  version: number;
  methods: string[];
  ratedBy: string | null;
  ratedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  evidenceTotal: number;
  evidenceAccepted: number;
  draft?: "pending" | "conflict" | "locked" | "needs_reason";
};

const RATING_STYLE: Record<number, { on: string; off: string }> = {
  0: { on: "bg-danger text-white border-danger shadow-[0_6px_16px_-6px_rgba(180,35,24,.6)]", off: "hover:border-danger/50 hover:text-danger" },
  1: { on: "bg-warning text-white border-warning shadow-[0_6px_16px_-6px_rgba(194,118,11,.6)]", off: "hover:border-warning/50 hover:text-warning" },
  2: { on: "bg-gold text-white border-gold shadow-[0_6px_16px_-6px_rgba(201,162,39,.6)]", off: "hover:border-gold/60 hover:text-gold" },
  3: { on: "bg-success text-white border-success shadow-[0_6px_16px_-6px_rgba(15,123,79,.6)]", off: "hover:border-success/50 hover:text-success" },
};
const METHOD_ICON: Record<string, any> = { "فحص وثائق": FileText, "ملاحظة": Eye, "مقابلة": Users };

function IndicatorCardBase({
  ind, scale, locked, saving, onRate, onNotes, onMethods, onEvidence, onHistory,
}: {
  ind: Indicator;
  scale: Rating[];
  locked: boolean;
  saving: boolean;
  onRate: (ind: Indicator, status: "EVALUATED" | "NOT_EVALUATED", score: number | null) => void;
  onNotes: (ind: Indicator, notes: string) => void;
  onMethods: (ind: Indicator, methods: string[]) => void;
  onEvidence: (ind: Indicator) => void;
  onHistory: (ind: Indicator) => void;
}) {
  const [notes, setNotes] = useState(ind.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!ind.notes);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setNotes(ind.notes ?? ""); }, [ind.notes, ind.version]);

  const evaluated = ind.status === "EVALUATED";
  const onKey = (e: React.KeyboardEvent) => {
    if (locked || (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
    const n = Number(e.key);
    if (Number.isInteger(n) && scale.some((r) => r.score === n)) { e.preventDefault(); onRate(ind, "EVALUATED", n); }
    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); onRate(ind, "NOT_EVALUATED", null); }
  };

  return (
    <div
      id={`ind-${ind.indicatorId}`}
      ref={ref}
      tabIndex={0}
      onKeyDown={onKey}
      className={`group rounded-2xl border bg-white p-4 outline-none transition focus-visible:ring-2 focus-visible:ring-turquoise/50 ${
        evaluated ? "border-gray-200" : "border-dashed border-gray-300 bg-gray-50/40"
      } ${ind.draft ? "ring-1 ring-warning/50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 shrink-0 ${evaluated ? "text-success" : "text-gray-300"}`}>{evaluated ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] leading-[1.9] text-gray-800">
              <span className="me-2 inline-block rounded-lg bg-navy px-2 py-0.5 font-mono text-[11.5px] font-bold text-gold-bright">{ind.code}</span>
              {ind.title}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin text-turquoise" />}
              {ind.draft && <span className="badge badge-warning">{ind.draft === "pending" ? "غير مرفوع" : ind.draft === "conflict" ? "تعارض" : ind.draft === "locked" ? "مقفل" : "يحتاج سبباً"}</span>}
            </div>
          </div>

          {/* الدرجة */}
          <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="التقدير">
            {scale.map((r) => {
              const active = evaluated && ind.score === r.score;
              return (
                <button
                  key={r.key}
                  role="radio"
                  aria-checked={active}
                  disabled={locked}
                  onClick={() => onRate(ind, "EVALUATED", r.score)}
                  className={`rounded-xl border px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                    active ? RATING_STYLE[r.score]?.on : `border-gray-200 bg-white text-gray-600 ${RATING_STYLE[r.score]?.off ?? ""}`
                  }`}
                  title={`اختصار لوحة المفاتيح: ${r.score}`}
                >
                  {r.label_ar}
                </button>
              );
            })}
            <button
              disabled={locked}
              onClick={() => onRate(ind, "NOT_EVALUATED", null)}
              className={`rounded-xl border px-3 py-1.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                !evaluated ? "border-gray-300 bg-gray-200 text-gray-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"
              }`}
            >
              لم يُقيَّم بعد
            </button>
          </div>

          {/* وسائل التحقق */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-semibold text-gray-500">وسيلة التحقق:</span>
            {(ind.verificationTools.length ? ind.verificationTools : ["فحص وثائق", "ملاحظة", "مقابلة"]).map((m) => {
              const Icon = METHOD_ICON[m] ?? ClipboardCheck;
              const on = ind.methods.includes(m);
              return (
                <button
                  key={m}
                  disabled={locked}
                  aria-pressed={on}
                  onClick={() => onMethods(ind, on ? ind.methods.filter((x) => x !== m) : [...ind.methods, m])}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition disabled:opacity-60 ${
                    on ? "border-turquoise bg-turquoise-soft text-emerald-deep" : "border-gray-200 text-gray-500 hover:border-turquoise/50"
                  }`}
                >
                  <Icon className="h-3 w-3" />{m}
                </button>
              );
            })}
          </div>

          {/* الشواهد الأصلية من الاستمارة */}
          {ind.evidence.length > 0 && (
            <details className="mt-3 rounded-xl border border-turquoise/20 bg-turquoise-soft/40 px-3 py-2">
              <summary className="cursor-pointer select-none text-[12px] font-semibold text-emerald-deep">الأدلة والشواهد المطلوبة ({ind.evidence.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pr-5 text-[12px] leading-relaxed text-gray-700">{ind.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}

          {/* الملاحظات */}
          {showNotes ? (
            <div className="mt-3">
              <textarea
                className="input min-h-[72px] text-[13px]"
                placeholder="ملاحظات تفصيلية…"
                value={notes}
                disabled={locked}
                maxLength={4000}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => { if (notes.trim() !== (ind.notes ?? "").trim()) onNotes(ind, notes); }}
                aria-label="ملاحظات"
              />
            </div>
          ) : (
            !locked && <button className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-turquoise hover:underline" onClick={() => setShowNotes(true)}><MessageSquare className="h-3.5 w-3.5" /> إضافة ملاحظة</button>
          )}

          {/* التذييل */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5 text-[11.5px] text-gray-500">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => onEvidence(ind)} className="inline-flex items-center gap-1 font-semibold text-navy hover:text-turquoise">
                <Paperclip className="h-3.5 w-3.5" /> الأدلة المرفقة
                <span className={`rounded-full px-1.5 text-[10.5px] ${ind.evidenceAccepted ? "bg-success-soft text-success" : ind.evidenceTotal ? "bg-warning-soft text-warning" : "bg-gray-100 text-gray-500"}`}>
                  {ind.evidenceTotal ? `${ind.evidenceAccepted}/${ind.evidenceTotal} مقبول` : "لا يوجد"}
                </span>
              </button>
              {ind.version > 0 && <button onClick={() => onHistory(ind)} className="inline-flex items-center gap-1 hover:text-navy"><History className="h-3.5 w-3.5" /> السجل</button>}
            </div>
            {ind.ratedBy && <span>قيّمه {ind.ratedBy} · آخر تعديل {fmtDate(ind.updatedAt, true)}{ind.createdAt && ind.createdAt !== ind.updatedAt ? ` · أُدخل ${fmtDate(ind.createdAt)}` : ""}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export const IndicatorCard = memo(IndicatorCardBase);
