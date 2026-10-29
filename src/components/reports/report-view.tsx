"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import InstitutionLogos from "@/components/brand/institution-logos";
import RifadLogo from "@/components/brand/rifad-logo";
import { REPORT_STATUS, fmtDate } from "@/lib/labels";

/** معاينة التقرير داخل الصفحة وقابلة للطباعة (نفس المحتوى المثبَّت المستخدم في PDF). */
export default function ReportView({ report, content }: { report: any; content: any }) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/verify?code=${report.verification_code}`, { margin: 1, width: 180 }).then(setQr).catch(() => {});
  }, [report.verification_code]);
  const st = REPORT_STATUS[report.status] ?? { label: report.status, tone: "neutral" };

  return (
    <article className="report-sheet relative mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md print:rounded-none print:border-0 print:shadow-none">
      {report.status !== "APPROVED" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-[28deg] select-none font-heading text-[150px] font-bold text-navy/[0.045]">{st.label}</span>
        </div>
      )}
      <header className="relative z-10 flex items-center justify-between gap-4 bg-navy px-6 py-5 text-white">
        <RifadLogo size={56} />
        <div className="text-center">
          <p className="font-heading text-xl font-bold">منصة رِفاد للمتابعة والجودة المدرسية</p>
          <p className="mt-0.5 text-[12px] text-white/70">الجمهورية اليمنية — محافظة الحديدة — مديرية الجراحي</p>
          <p className="text-[11px] text-white/60">مجلس الاعتماد الأكاديمي وضمان جودة التعليم · وزارة التربية والتعليم</p>
        </div>
        <InstitutionLogos size={50} caption={false} show="ministry" />
      </header>
      <div className="h-1 bg-gold" />

      <div className="relative z-10 space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold leading-snug text-navy">{content.title}</h1>
            {content.subtitle && <p className="mt-1 text-[13px] text-gray-500">{content.subtitle}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`badge badge-${st.tone}`}>{st.label}</span>
              <span className="font-mono text-[12px] text-gray-500">{report.number}</span>
              {content.state === "INCOMPLETE" && <span className="badge badge-warning">مسودة غير مكتملة</span>}
            </div>
          </div>
          {qr && <div className="shrink-0 text-center"><img src={qr} alt="رمز QR للتحقق" width={88} height={88} /><p className="text-[10px] text-gray-400">امسح للتحقق</p></div>}
        </div>

        {content.meta?.length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-gray-50 p-4 text-[13px] sm:grid-cols-2">
            {content.meta.map(([k, v]: [string, string]) => (<div key={k} className="flex gap-2"><dt className="shrink-0 font-semibold text-gray-500">{k}:</dt><dd className="text-navy">{v}</dd></div>))}
          </dl>
        )}
        {content.notices?.map((n: string, i: number) => <p key={i} className="rounded-xl bg-gold-soft px-4 py-2.5 text-[13px] text-[#7A6112]">{n}</p>)}
        {report.status === "REJECTED" && report.rejection_reason && <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-[13px] font-semibold text-danger">سبب الرفض: {report.rejection_reason}</p>}

        {content.sections.map((s: any, i: number) => <Section key={i} s={s} />)}

        <footer className="mt-8 border-t-2 border-gold pt-4 text-[12.5px] text-gray-600">
          {report.status === "APPROVED" ? (
            <p><b className="text-navy">اعتُمد إلكترونياً</b> من {report.approved_by_name ?? "—"} بتاريخ {fmtDate(report.approved_at, true)}</p>
          ) : (
            <p><b className="text-navy">حالة التقرير: {st.label}</b> — لم يُعتمد رسمياً بعد</p>
          )}
          <p className="mt-1 text-[11.5px] text-gray-400">رمز التحقق: <span className="font-mono">{report.verification_code}</span> · صدر {fmtDate(content.generatedAt, true)}. مستند إداري داخلي من منصة رِفاد، لا يحمل ختماً حكومياً ولا توقيعاً.</p>
        </footer>
      </div>
    </article>
  );
}

function Section({ s }: { s: any }) {
  const title = s.title ? <h2 className="mb-3 flex items-center gap-2 font-heading text-[17px] font-bold text-navy"><span className="h-5 w-1 rounded bg-gold" />{s.title}</h2> : null;
  if (s.kind === "stats")
    return (
      <section>{title}<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {s.items.map((it: any, i: number) => (<div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5 [border-inline-start:4px_solid_var(--gold)]"><p className="text-[11.5px] text-gray-500">{it.label}</p><p className="mt-1 font-heading text-xl font-bold text-navy"><bdi dir="ltr">{it.value}</bdi></p>{it.hint && <p className="text-[10.5px] text-gray-400">{it.hint}</p>}</div>))}
      </div></section>
    );
  if (s.kind === "kv")
    return <section>{title}<dl className="divide-y divide-gray-100 text-[13px]">{s.items.map(([k, v]: any) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-gray-500">{k}</dt><dd className="text-navy">{v}</dd></div>)}</dl></section>;
  if (s.kind === "table")
    return (
      <section className="break-inside-avoid-page">{title}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-[12.5px]">
            <thead className="bg-navy text-white"><tr>{s.columns.map((c: any) => <th key={c.key} className={`px-3 py-2 font-semibold ${c.align === "center" ? "text-center" : "text-right"}`}>{c.label}</th>)}</tr></thead>
            <tbody>
              {s.rows.length === 0 && <tr><td colSpan={s.columns.length} className="px-3 py-5 text-center text-gray-400">{s.emptyText ?? "لا بيانات"}</td></tr>}
              {s.rows.map((r: any[], i: number) => <tr key={i} className={`${i % 2 ? "bg-gray-50/70" : ""} border-t border-gray-100 break-inside-avoid`}>{r.map((c, k) => <td key={k} className={`px-3 py-2 align-top ${s.columns[k]?.align === "center" ? "text-center" : ""}`}>{c == null ? "—" : String(c)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        {s.note && <p className="mt-2 text-[11.5px] text-gray-500">{s.note}</p>}
      </section>
    );
  if (s.kind === "text") return <section>{title}<p className="whitespace-pre-line text-[13.5px] leading-[1.9] text-gray-700">{s.body || "—"}</p></section>;
  if (s.kind === "bullets")
    return <section>{title}{s.items.length === 0 ? <p className="text-[13px] text-gray-400">{s.emptyText ?? "لا يوجد"}</p> : <ul className="space-y-1.5 text-[13.5px] leading-[1.8] text-gray-700">{s.items.map((it: string, i: number) => <li key={i} className="flex gap-2"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />{it}</li>)}</ul>}</section>;
  return null;
}
