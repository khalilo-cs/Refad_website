"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";

type Ind = { indicatorId: string; code: string; title: string; isWeak: boolean; status: string; overdue: boolean; plan: { action: string | null; dueDate: string | null } };
const CHIP: Record<string, [string, string]> = {
  NEEDS_PLAN: ["ضعيف — بلا خطة", "bg-danger/10 text-danger"],
  PLANNED: ["خطة موضوعة", "bg-warning/10 text-warning"],
  IN_PROGRESS: ["قيد التنفيذ", "bg-sky-500/10 text-sky-700"],
  IMPROVED: ["بانتظار الاعتماد", "bg-emerald-400/15 text-emerald-700"],
  VERIFIED: ["تحسّن معتمد", "bg-success/10 text-success"],
};

/** ملف المدرسة: أماكن الضعف كما حدّدها المدير، وحالة معالجة كلٍّ منها. */
export function SchoolWeaknessCard({ schoolId }: { schoolId: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/self-assessment?schoolId=${schoolId}`, { credentials: "include" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setD(j); })
      .catch((e) => setErr(e.message));
  }, [schoolId]);
  if (err) return <p className="text-[12.5px] text-gray-500">{err}</p>;
  if (!d) return <div className="skeleton h-40 rounded-xl" />;
  const weak: (Ind & { crit: string })[] = d.criteria.flatMap((c: any) => c.subs.flatMap((s: any) => s.indicators.filter((i: Ind) => i.isWeak).map((i: Ind) => ({ ...i, crit: `${c.code} ${c.title}` }))));
  const s = d.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-navy">التقييم الذاتي — <bdi dir="ltr">{d.year}</bdi></h3>
          <p className="text-[12px] text-gray-500">
            {!d.assessment ? "لم تبدأ المدرسة التعبئة" : d.assessment.status === "SUBMITTED" ? "مُرسلة للإدارة" : "قيد التعبئة"} · مقيَّم {s.rated}/{s.total}{s.percent != null ? ` · تحقق ${s.percent}%` : ""}
          </p>
        </div>
        <Link href={`/self-assessment?schoolId=${schoolId}`} className="btn btn-primary btn-sm"><ClipboardCheck className="h-4 w-4" /> فتح الاستمارة كاملة</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[["نقاط الضعف", s.weak, "text-danger"], ["بلا خطة", s.needsPlan, "text-danger"], ["قيد المعالجة", s.planned + s.inProgress, "text-sky-700"], ["بانتظار الاعتماد", s.improved, "text-emerald-700"], ["تحسّن معتمد", s.verified, "text-success"]].map(([l, v, c]) => (
          <div key={l as string} className="rounded-xl bg-gray-50 p-2.5"><p className="text-[11px] text-gray-600">{l}</p><p className={`font-heading text-lg font-bold ${c}`}>{v}</p></div>
        ))}
      </div>
      {weak.length === 0 ? (
        <p className="flex items-center gap-2 py-3 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" /> لم يحدّد المدير أي نقطة ضعف.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {weak.map((i) => (
            <li key={i.indicatorId} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-navy"><b className="me-1 font-mono text-[11.5px] text-gray-500">{i.code}</b>{i.title}</p>
                <p className="text-[11px] text-gray-500">{i.crit}{i.plan.action ? ` · الخطة: ${i.plan.action}` : ""}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {i.overdue && <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning"><AlertTriangle className="h-3 w-3" /> متأخر</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[i.status]?.[1] ?? ""}`}>{CHIP[i.status]?.[0] ?? ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
