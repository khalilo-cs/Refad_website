"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  MapPin,
  UserCheck,
  CalendarDays,
  ArrowLeft,
  Info,
} from "lucide-react";
import RifadLogo from "@/components/brand/rifad-logo";

type Result =
  | { valid: true; report: any; note: string }
  | { valid: false; message: string };

const STATUS_STYLE: Record<string, { cls: string; icon: any }> = {
  APPROVED: { cls: "bg-success-soft text-success border-success/30", icon: CheckCircle2 },
  UNDER_REVIEW: { cls: "bg-warning-soft text-warning border-warning/30", icon: Clock },
  DRAFT: { cls: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock },
  REJECTED: { cls: "bg-danger-soft text-danger border-danger/30", icon: XCircle },
};

export default function VerifyClient() {
  const params = useSearchParams();
  const initial = params.get("code") ?? "";

  const [code, setCode] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = useCallback(async (value: string) => {
    const c = value.trim();
    if (!c) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(c)}`, { cache: "no-store" });
      const json = await res.json();
      setResult(json.valid ? json : { valid: false, message: json.message });
    } catch {
      setResult({ valid: false, message: "تعذّر الاتصال بالخادم. تحقق من الشبكة وأعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) run(initial);
  }, [initial, run]);

  const rep = result && result.valid ? result.report : null;
  const style = rep ? STATUS_STYLE[rep.status] ?? STATUS_STYLE.DRAFT : null;
  const StatusIcon = style?.icon;

  return (
    <div className="min-h-screen bg-warm-white">
      <header className="bg-aurora relative overflow-hidden">
        <div className="pattern-geo absolute inset-0 text-white" />
        <div className="relative mx-auto max-w-3xl px-5 py-10 text-center">
          <div className="mb-5 flex justify-center">
            <RifadLogo size={46} withText tone="light" />
          </div>
          <h1 className="font-heading text-[26px] font-bold text-white sm:text-[32px]">
            التحقق من صحة تقرير
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-white/60">
            أدخل رمز التحقق المطبوع على التقرير للتأكد من صدوره عن المنصة ومعرفة حالته
            الحالية.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="card p-5">
          <label htmlFor="code" className="label">
            رمز التحقق
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run(code)}
                placeholder="مثال: RV-2026-8F3K2M"
                dir="ltr"
                className="input pr-10 font-mono tracking-wider"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              onClick={() => run(code)}
              disabled={loading || !code.trim()}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  جارٍ التحقق…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> تحقّق
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-[10.5px] text-gray-400">
            الرمز موجود في أسفل الصفحة الأولى من ملف التقرير، بجوار مربّع الاستجابة السريعة.
          </p>
        </div>

        {result && (
          <div className="mt-5 animate-fade-up">
            {result.valid && rep ? (
              <div className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-gray-100 bg-success-soft/50 px-5 py-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-heading text-[16px] font-bold text-success">
                      التقرير مسجّل في المنصة
                    </p>
                    <p className="text-[11.5px] text-gray-500">
                      تم العثور على تطابق لرمز التحقق
                    </p>
                  </div>
                </div>

                <dl className="divide-y divide-gray-100">
                  <Row icon={ShieldCheck} label="رقم التقرير">
                    <span className="font-mono text-[13px] font-semibold text-navy" dir="ltr">
                      {rep.number}
                    </span>
                  </Row>
                  <Row icon={Info} label="العنوان">{rep.title}</Row>
                  <Row icon={StatusIcon} label="الحالة">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold ${style?.cls}`}>
                      {StatusIcon && <StatusIcon className="h-3 w-3" />}
                      {rep.statusLabel}
                    </span>
                  </Row>
                  {rep.school && (
                    <Row icon={Building2} label="المدرسة">{rep.school}</Row>
                  )}
                  {rep.directorate && (
                    <Row icon={MapPin} label="المديرية">{rep.directorate}</Row>
                  )}
                  {rep.approved ? (
                    <Row icon={UserCheck} label="اعتُمد بواسطة">
                      {rep.approvedBy ?? "—"}
                      {rep.approvedAt && (
                        <span className="mr-2 font-mono text-[11px] text-gray-400">
                          {String(rep.approvedAt).slice(0, 10)}
                        </span>
                      )}
                    </Row>
                  ) : (
                    <Row icon={CalendarDays} label="تاريخ الإصدار">
                      <span className="font-mono text-[12px] text-gray-500">
                        {String(rep.issuedAt).slice(0, 10)}
                      </span>
                    </Row>
                  )}
                </dl>

                <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3">
                  <p className="text-[10.5px] leading-relaxed text-gray-500">{result.note}</p>
                </div>
              </div>
            ) : (
              <div className="card border-danger/20 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-heading text-[15.5px] font-bold text-danger">
                      لم يتم التحقق
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
                      {result.valid ? "" : result.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {searched && !loading && !result && (
          <p className="mt-5 text-center text-[12px] text-gray-400">لا نتيجة.</p>
        )}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[10.5px] leading-relaxed text-gray-500">
            <strong className="text-gray-700">تنبيه:</strong> هذه الخدمة تتحقق من تسجيل
            التقرير في المنصة ومن حالته فقط. حالة «معتمد» تعني اعتماداً داخلياً من مستخدم
            مخوّل داخل المنصة، ولا تُعد وثيقة حكومية رسمية ولا تحمل أختاماً أو تواقيع.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-turquoise hover:underline"
          >
            الدخول إلى المنصة <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        <p className="mt-8 text-center text-[10px] text-gray-400">
          تصميم وتطوير: المهندس محمد خليل
          <span className="mx-1.5 text-gray-300">·</span>
          <span dir="ltr" className="font-mono">736390203</span>
        </p>
      </main>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon?: any;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
      <dt className="flex w-40 shrink-0 items-center gap-2 text-[12px] text-gray-500">
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[13px] text-navy">{children}</dd>
    </div>
  );
}
