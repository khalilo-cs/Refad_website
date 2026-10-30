"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, TrendingUp } from "lucide-react";

type S = { total: number; rated: number; needsPlan: number; planned: number; inProgress: number; improved: number; verified: number; overdue: number };

/** تنبيه المدير في لوحته: ما المطلوب منه الآن في دورة التقييم الذاتي. */
export function SelfAssessmentNudge() {
  const [s, setS] = useState<{ summary: S; status: string | null; year: string } | null>(null);
  useEffect(() => {
    fetch("/api/self-assessment", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setS({ summary: d.summary, status: d.assessment?.status ?? null, year: d.year }))
      .catch(() => {});
  }, []);
  if (!s) return null;
  const { summary: m } = s;
  const todo: string[] = [];
  if (m.rated < m.total) todo.push(`قيّم ${m.total - m.rated} مؤشرات متبقية`);
  if (m.needsPlan) todo.push(`ضع خطة لـ${m.needsPlan} نقاط ضعف`);
  if (m.overdue) todo.push(`${m.overdue} خطط تجاوزت موعدها`);
  if (s.status !== "SUBMITTED" && m.rated === m.total && !m.needsPlan) todo.push("أرسل الاستمارة للإدارة");
  const urgent = m.needsPlan > 0 || m.overdue > 0;
  return (
    <Link href="/self-assessment" className={`card flex flex-wrap items-center gap-3 p-4 transition hover:shadow-md ${urgent ? "border-danger/30" : ""}`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${urgent ? "bg-danger/10 text-danger" : "bg-turquoise/10 text-turquoise"}`}>
        {urgent ? <AlertTriangle className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[14.5px] font-bold text-navy">استمارة التقييم الذاتي — <bdi dir="ltr">{s.year}</bdi></p>
        <p className="text-[12.5px] text-gray-600">{todo.length ? todo.join(" · ") : "لا مطلوب الآن. تابع تنفيذ خطط التحسين وحدّث حالتها."}</p>
      </div>
      <div className="flex gap-3 text-center text-[11px]">
        <span><b className="block font-heading text-lg text-sky-700">{m.planned + m.inProgress}</b>قيد المعالجة</span>
        <span><b className="block font-heading text-lg text-emerald-700">{m.improved}</b>بانتظار الاعتماد</span>
        <span><b className="flex items-center justify-center gap-1 font-heading text-lg text-success"><TrendingUp className="h-4 w-4" />{m.verified}</b>تحسّن معتمد</span>
      </div>
    </Link>
  );
}
