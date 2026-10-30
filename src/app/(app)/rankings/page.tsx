"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Award, ArrowDownRight, ArrowUpRight, Download, Info, Medal, Printer, TrendingUp, Trophy } from "lucide-react";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { Rise, ScoreBar, Stagger } from "@/components/ui/extra";
import { useSession } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

type Tier = { key: "EXCELLENT" | "ADVANCED" | "ACCEPTABLE" | "SUPPORT"; label: string; min: number };
type Row = {
  schoolId: string; code: string; name: string; directorate: string; rank: number | null; percent: number | null;
  completion: number; tier: Tier | null; delta: number | null; evaluatedAt: string; visitStatus: string;
  actions: { total: number; closed: number; overdue: number };
  strongest: { code: string; title: string; percent: number } | null;
  weakest: { code: string; title: string; percent: number } | null;
};
type Data = {
  ranked: Row[]; partial: Row[]; mostImproved: Row[]; minCompletion: number;
  notEvaluated: { schoolId: string; code: string; name: string; directorate: string }[];
  tierCounts: Record<Tier["key"], number>;
};

const TIER_STYLE: Record<Tier["key"], { ring: string; chip: string; label: string }> = {
  EXCELLENT: { ring: "from-gold-bright to-gold", chip: "bg-gold/15 text-[#8a6500]", label: "متميّز (90% فأكثر)" },
  ADVANCED: { ring: "from-turquoise to-emerald", chip: "bg-turquoise/12 text-[#0b6b5f]", label: "متقدّم (75–89%)" },
  ACCEPTABLE: { ring: "from-sky-400 to-sky-600", chip: "bg-sky-100 text-sky-800", label: "مقبول (60–74%)" },
  SUPPORT: { ring: "from-rose-400 to-rose-600", chip: "bg-rose-100 text-rose-800", label: "بحاجة إلى دعم (أقل من 60%)" },
};

const PODIUM_ORDER = [1, 0, 2]; // الثاني، الأول، الثالث — الأول في المنتصف
const PODIUM_HEIGHT = ["h-28", "h-36", "h-20"];
const MEDAL = ["text-gold", "text-slate-400", "text-amber-700"];

export default function RankingsPage() {
  const { user } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [certFor, setCertFor] = useState<Row | null>(null);

  useEffect(() => {
    fetch("/api/rankings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!certFor) return;
    const t = setTimeout(() => window.print(), 150);
    const done = () => setCertFor(null);
    window.addEventListener("afterprint", done);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [certFor]);

  if (!user) return null;
  if (!["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user.roleKey)) {
    return <EmptyState icon={Trophy} title="هذه الصفحة لقيادات الجودة والمفتشين" description="ترتيب المدارس متاح لقسم الجودة والمفتشين ضمن نطاقهم." />;
  }

  const top = data?.ranked.slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          icon={Trophy}
          title="التميّز والتكريم"
          subtitle="ترتيب المدارس من آخر تقييم مقدَّم أو معتمد لكل مدرسة — لدعم قرارات التدخل والتكريم"
          actions={
            <a href="/api/rankings?format=csv" className="btn btn-ghost btn-sm">
              <Download className="h-3.5 w-3.5" /> تصدير CSV
            </a>
          }
        />
      </div>

      {error && <Alert tone="danger" title="تعذّر تحميل الترتيب">أعد تحميل الصفحة أو راجع اتصالك.</Alert>}
      {!data && !error && <div className="skeleton h-72 rounded-3xl" />}

      {data && (
        <Stagger className="space-y-6 print:hidden">
          <Rise>
            <div className="flex items-start gap-2 rounded-2xl border border-turquoise/25 bg-turquoise/5 px-4 py-3 text-[12.5px] leading-relaxed text-navy">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-turquoise" />
              <p>
                يدخل الترتيب فقط من اكتمل تقييمها بنسبة {data.minCompletion}% فأكثر، لأن النسبة على عدد قليل من المؤشرات لا تصلح للمقارنة.
                المتساوون في النسبة يتقاسمون المرتبة. لا تُمنح أي مدرسة غير مقيَّمة درجة افتراضية.
              </p>
            </div>
          </Rise>

          {data.ranked.length === 0 ? (
            <Rise>
              <div className="card">
                <EmptyState icon={Award} title="لا توجد مدارس مؤهلة للترتيب بعد" description="يظهر الترتيب عند تقديم أول تقييم مكتمل لمدرسة ضمن نطاقك." />
              </div>
            </Rise>
          ) : (
            <>
              {/* منصة التتويج */}
              <Rise>
                <section className="relative overflow-hidden rounded-3xl bg-aurora px-4 pb-0 pt-8 text-white shadow-lg sm:px-8">
                  <div className="pattern-geo pointer-events-none absolute inset-0 opacity-[0.07]" />
                  <h2 className="relative text-center font-heading text-xl font-bold sm:text-2xl">المدارس الأعلى تحققاً</h2>
                  <div className="relative mx-auto mt-6 grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-5">
                    {PODIUM_ORDER.map((idx, col) => {
                      const r = top[idx];
                      if (!r) return <div key={col} />;
                      return (
                        <motion.div
                          key={r.schoolId}
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 + col * 0.12, type: "spring", stiffness: 120, damping: 16 }}
                          className="flex flex-col items-center text-center"
                        >
                          <Medal className={`h-7 w-7 ${MEDAL[idx]} drop-shadow`} />
                          <Link href={`/schools/${r.schoolId}`} className="mt-1 block min-h-[2.5rem] w-full overflow-hidden text-[12px] font-semibold leading-tight line-clamp-2 hover:underline sm:text-[13.5px]">
                            {r.name}
                          </Link>
                          <p className="mt-1 font-mono text-lg font-bold text-gold-bright sm:text-2xl">{r.percent}%</p>
                          <div className={`mt-2 flex w-full items-start justify-center rounded-t-2xl bg-white/10 pt-2 ring-1 ring-white/15 ${PODIUM_HEIGHT[idx]}`}>
                            <span className="font-heading text-3xl font-bold text-white/80">{r.rank}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>
              </Rise>

              {/* توزيع الفئات */}
              <Rise>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {(Object.keys(TIER_STYLE) as Tier["key"][]).map((k) => (
                    <div key={k} className="card p-4">
                      <div className={`h-1.5 w-12 rounded-full bg-gradient-to-l ${TIER_STYLE[k].ring}`} />
                      <p className="mt-3 text-[12px] text-gray-500">{TIER_STYLE[k].label}</p>
                      <p className="mt-1 font-heading text-3xl font-bold text-navy">{data.tierCounts[k]}</p>
                    </div>
                  ))}
                </div>
              </Rise>

              <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
                {/* الجدول الكامل */}
                <Rise>
                  <section className="card overflow-hidden">
                    <h2 className="border-b border-gray-100 px-5 py-4 font-heading text-lg font-bold text-navy">الترتيب الكامل</h2>
                    <ul className="divide-y divide-gray-100">
                      {data.ranked.map((r) => (
                        <li key={r.schoolId} className="grid grid-cols-[2.5rem_1fr] gap-3 px-5 py-4 sm:grid-cols-[2.5rem_1fr_9rem_auto] sm:items-center">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-mono text-[13px] font-bold text-gold-bright">{r.rank}</span>
                          <div className="min-w-0">
                            <Link href={`/schools/${r.schoolId}`} className="block truncate font-semibold text-navy hover:underline">{r.name}</Link>
                            <p className="truncate text-[11.5px] text-gray-500">
                              {r.directorate} · آخر تقييم {fmtDate(r.evaluatedAt)} · إكمال {r.completion}%
                            </p>
                            {(r.strongest || r.weakest) && (
                              <p className="mt-1 truncate text-[11.5px] text-gray-500">
                                {r.strongest && <>الأقوى: م{r.strongest.code} ({r.strongest.percent}%)</>}
                                {r.weakest && <> · الأضعف: م{r.weakest.code} ({r.weakest.percent}%)</>}
                              </p>
                            )}
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <div className="mb-1 flex items-center justify-between text-[12px]">
                              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${r.tier ? TIER_STYLE[r.tier.key].chip : ""}`}>{r.tier?.label}</span>
                              <span className="font-mono font-bold text-navy">{r.percent}%</span>
                            </div>
                            <ScoreBar value={r.percent} height={6} />
                          </div>
                          <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                            <Delta value={r.delta} />
                            <span className="text-[11px] text-gray-500" title="إجراءات التحسين المغلقة بعد التحقق">
                              إجراءات {r.actions.closed}/{r.actions.total}
                              {r.actions.overdue > 0 && <span className="text-rose-600"> · {r.actions.overdue} متأخر</span>}
                            </span>
                            {r.tier && (r.tier.key === "EXCELLENT" || r.tier.key === "ADVANCED" || (r.delta ?? 0) >= 5) && (
                              <button onClick={() => setCertFor(r)} className="btn btn-ghost btn-sm" title="طباعة شهادة تقدير">
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </Rise>

                <div className="space-y-6">
                  <Rise>
                    <section className="card p-5">
                      <h2 className="flex items-center gap-2 font-heading text-[16px] font-bold text-navy">
                        <TrendingUp className="h-4 w-4 text-emerald" /> الأكثر تحسّناً
                      </h2>
                      {data.mostImproved.length === 0 ? (
                        <p className="mt-3 text-[12.5px] text-gray-500">يظهر التحسّن عند وجود زيارتين مكتملتين على الأقل للمدرسة نفسها.</p>
                      ) : (
                        <ul className="mt-3 space-y-2.5">
                          {data.mostImproved.map((r) => (
                            <li key={r.schoolId} className="flex items-center justify-between gap-2">
                              <Link href={`/schools/${r.schoolId}`} className="truncate text-[13px] text-navy hover:underline">{r.name}</Link>
                              <Delta value={r.delta} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </Rise>

                  {data.partial.length > 0 && (
                    <Rise>
                      <section className="card p-5">
                        <h2 className="font-heading text-[15px] font-bold text-navy">تقييم غير مكتمل ({data.partial.length})</h2>
                        <p className="mt-1 text-[11.5px] text-gray-500">لا تدخل الترتيب حتى يبلغ الإكمال {data.minCompletion}%.</p>
                        <ul className="mt-3 space-y-2">
                          {data.partial.map((r) => (
                            <li key={r.schoolId} className="flex items-center justify-between gap-2 text-[12.5px]">
                              <Link href={`/schools/${r.schoolId}`} className="truncate text-navy hover:underline">{r.name}</Link>
                              <span className="shrink-0 font-mono text-gray-500">{r.completion}%</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </Rise>
                  )}

                  {data.notEvaluated.length > 0 && (
                    <Rise>
                      <section className="card p-5">
                        <h2 className="font-heading text-[15px] font-bold text-navy">لم تُقيَّم بعد ({data.notEvaluated.length})</h2>
                        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                          {data.notEvaluated.map((s) => (
                            <li key={s.schoolId} className="flex items-center justify-between gap-2 text-[12.5px]">
                              <Link href={`/schools/${s.schoolId}`} className="truncate text-navy hover:underline">{s.name}</Link>
                              <Link href={`/visits?new=1&schoolId=${s.schoolId}`} className="shrink-0 text-[11.5px] font-semibold text-turquoise hover:underline">جدولة زيارة</Link>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </Rise>
                  )}
                </div>
              </div>
            </>
          )}
        </Stagger>
      )}

      {certFor && <Certificate row={certFor} />}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-gray-400">—</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[12px] font-semibold ${up ? "text-emerald" : value < 0 ? "text-rose-600" : "text-gray-500"}`}>
      {value !== 0 && <Icon className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {value}
    </span>
  );
}

/**
 * شهادة تقدير داخلية تُطبع من بيانات المنصة الفعلية.
 * لا تحمل ختماً ولا توقيعاً مطبوعاً؛ تُترك خانات التوقيع فارغة للتوقيع اليدوي.
 */
function Certificate({ row }: { row: Row }) {
  const reason =
    row.tier?.key === "EXCELLENT" ? "لتحقيقها مستوى «متميّز» في معايير الاعتماد المدرسي"
    : row.tier?.key === "ADVANCED" ? "لتحقيقها مستوى «متقدّم» في معايير الاعتماد المدرسي"
    : `لتحسّن أدائها في معايير الاعتماد المدرسي بمقدار ${row.delta} نقطة`;
  return (
    <div className="certificate hidden print:block">
      <div className="mx-auto flex min-h-[180mm] max-w-[260mm] flex-col items-center justify-between border-[6px] border-double border-gold p-12 text-center text-navy">
        <div>
          <p className="text-[13px] text-gray-600">إدارة التربية والتعليم والبحث العلمي — مديرية الجراحي · قسم الجودة والاعتماد المدرسي</p>
          <h1 className="mt-8 font-heading text-5xl font-bold text-gold">شهادة تقدير</h1>
          <p className="mt-10 text-xl">يتقدّم قسم الجودة والاعتماد المدرسي بالشكر والتقدير إلى</p>
          <p className="mt-4 font-heading text-4xl font-bold">{row.name}</p>
          <p className="mt-6 text-xl leading-relaxed">{reason}</p>
          <p className="mt-3 text-lg text-gray-600">
            نسبة التحقق {row.percent}% — بحسب تقييم {fmtDate(row.evaluatedAt)}
          </p>
        </div>
        <div className="mt-12 grid w-full grid-cols-2 gap-16 text-[14px]">
          <div><div className="mx-auto h-14 w-48 border-b border-gray-400" /><p className="mt-2">رئيس قسم الجودة والاعتماد المدرسي</p></div>
          <div><div className="mx-auto h-14 w-48 border-b border-gray-400" /><p className="mt-2">مدير إدارة التربية والتعليم</p></div>
        </div>
        <p className="mt-6 text-[10px] text-gray-400">صادرة من منصة إتقان من بيانات التقييم المسجّلة · {new Date().toLocaleDateString("ar-YE")}</p>
      </div>
    </div>
  );
}
