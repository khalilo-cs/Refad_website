"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const METHODS = ["فحص وثائق", "ملاحظة", "مقابلة"];

/** نسخة طباعة بشكل الاستمارة الرسمية: المؤشر، الأدلة، أداة التحقق، التقدير، الملاحظات. */
export default function PrintSelfAssessment() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const sp = useSearchParams();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const p = new URLSearchParams();
    if (sp.get("schoolId")) p.set("schoolId", sp.get("schoolId")!);
    if (sp.get("year")) p.set("year", sp.get("year")!);
    fetch(`/api/self-assessment?${p}`, { credentials: "include" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setD(j); setTimeout(() => window.print(), 600); })
      .catch((e) => setErr(e.message));
  }, [sp]);
  if (err) return <p style={{ padding: 40, textAlign: "center" }}>{err}</p>;
  if (!d) return <p style={{ padding: 40, textAlign: "center" }}>جارٍ تجهيز الاستمارة…</p>;
  const scale: { score: number; label_ar: string }[] = d.scale;
  return (
    <div dir="rtl" className="print-form mx-auto max-w-[297mm] bg-white p-6 text-[11px] text-black">
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        .print-form table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
        .print-form th, .print-form td { border: 1px solid #333; padding: 3px 4px; vertical-align: top; }
        .print-form th { background: #1f3a5f; color: #fff; font-weight: 700; }
        .print-form tr { page-break-inside: avoid; }
        .print-form .sub { background: #fdf3d0; font-weight: 700; }
        .print-form .mark { text-align: center; font-size: 13px; background: #fff8e1; }
        @media print { .no-print { display: none; } }
      `}</style>
      <div className="no-print mb-3 flex justify-end"><button onClick={() => window.print()} className="rounded border px-3 py-1">طباعة</button></div>
      <div className="mb-3 flex items-start justify-between">
        <div><b>الجمهورية اليمنية</b><br />وزارة التربية والتعليم والبحث العلمي</div>
        <div className="text-center"><h1 className="text-[18px] font-bold">استمارة التقييم الذاتي للمدارس</h1><p>مجلس الاعتماد الأكاديمي وضمان جودة التعليم</p></div>
        <div className="text-left">
          <b>{d.school.name}</b><br />الرمز: {d.school.code} · {d.school.directorate_name}<br />العام الدراسي: <bdi dir="ltr">{d.year}</bdi>
        </div>
      </div>
      {d.criteria.map((c: any) => (
        <section key={c.id} className="mb-4">
          <h2 className="mb-1 text-[13px] font-bold">المعيار {c.code}: {c.title}{c.weight ? ` (${c.weight}%)` : ""}{c.percent != null ? ` — نسبة التحقق ${c.percent}%` : ""}</h2>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: "6%" }}>رقم المؤشر</th>
                <th rowSpan={2} style={{ width: "26%" }}>المؤشر</th>
                <th rowSpan={2} style={{ width: "17%" }}>الأدلة والشواهد</th>
                <th colSpan={3}>أداة التحقق من الأدلة</th>
                <th colSpan={scale.length}>التقديرات</th>
                <th rowSpan={2} style={{ width: "15%" }}>ملاحظات</th>
              </tr>
              <tr>
                {METHODS.map((m) => <th key={m} style={{ width: "4.5%" }}>{m}</th>)}
                {scale.map((r) => <th key={r.score} style={{ width: "5%" }}>{r.label_ar}</th>)}
              </tr>
            </thead>
            <tbody>
              {c.subs.map((s: any) => [
                <tr key={s.id + "h"}><td className="sub" colSpan={6 + scale.length + 1}>المعيار الفرعي {s.code}: {s.title}{s.weight ? ` (${s.weight}%)` : ""}</td></tr>,
                ...s.indicators.map((i: any) => (
                  <tr key={i.indicatorId}>
                    <td style={{ textAlign: "center" }}>{i.code}</td>
                    <td>{i.title}</td>
                    <td>{i.evidence.map((e: string) => <div key={e}>▪ {e}</div>)}</td>
                    {METHODS.map((m) => <td key={m} className="mark">{i.methods.includes(m) ? "✓" : ""}</td>)}
                    {scale.map((r) => <td key={r.score} className="mark">{i.score === r.score ? "✓" : ""}</td>)}
                    <td>{[i.isWeak ? "نقطة ضعف" : "", i.plan.action ? `خطة: ${i.plan.action}` : "", i.notes ?? ""].filter(Boolean).join(" — ")}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </section>
      ))}
      <div className="mt-6 grid grid-cols-3 gap-10 text-center">
        <div><div className="mx-auto h-10 w-40 border-b border-gray-500" />مدير المدرسة</div>
        <div><div className="mx-auto h-10 w-40 border-b border-gray-500" />منسق الجودة</div>
        <div><div className="mx-auto h-10 w-40 border-b border-gray-500" />التاريخ</div>
      </div>
      <p className="mt-4 text-center text-[9px] text-gray-500">مستخرجة من منصة إتقان — نسبة التحقق الكلية {d.summary.percent ?? "—"}% · مقيَّم {d.summary.rated}/{d.summary.total}</p>
    </div>
  );
}
