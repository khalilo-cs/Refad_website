"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  Building2,
  CalendarCheck,
  FileText,
  ClipboardList,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  MapPin,
  ArrowLeft,
  Target,
  Activity,
  Sparkles,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import { useSession } from "@/components/providers";
import { PageHeader, StatCard, Alert } from "@/components/ui";

const PALETTE = ["#0B2545", "#17A89A", "#C9A227", "#C2760B", "#B42318", "#0E7C66"];

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "مكتملة",
  IN_PROGRESS: "جارية",
  SCHEDULED: "مجدولة",
  CANCELLED: "ملغاة",
};

export default function DashboardPage() {
  const { user } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-16 w-2/3" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-80 rounded-2xl lg:col-span-2" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <Alert tone="danger" title="تعذّر تحميل البيانات">
        لم يستجب الخادم لطلب الإحصاءات. أعد تحميل الصفحة، وإن تكرر الخطأ راجع سجل الخادم.
      </Alert>
    );
  }

  const visitsByStatus: { name: string; value: number; key: string }[] = Object.entries(
    stats.visits?.byStatus ?? {}
  ).map(([k, v]) => ({ key: k, name: STATUS_LABELS[k] ?? k, value: Number(v) }));

  const totalVisits = visitsByStatus.reduce((a, b) => a + b.value, 0);
  const completedVisits = visitsByStatus.find((v) => v.key === "COMPLETED")?.value ?? 0;

  const trendData = [
    { name: "قبل 60–31 يوماً", value: Number(stats.trend?.lastMonth ?? 0) },
    { name: "آخر 30 يوماً", value: Number(stats.trend?.thisMonth ?? 0) },
  ];
  const growing = (stats.trend?.thisMonth ?? 0) >= (stats.trend?.lastMonth ?? 0);

  const criteriaAvg = Number(stats.criteriaAverage ?? 0);
  const evidenceCompletion = Number(stats.evidenceCompletion ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={`أهلاً ${user?.name?.split(" ")[0] ?? ""}`}
        subtitle={`نظرة شاملة على مدارس نطاقك — ${new Date().toLocaleDateString("ar-YE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`}
        actions={
          <>
            <Link href="/evaluation" className="btn btn-ghost btn-sm">
              <ClipboardList className="h-3.5 w-3.5" /> بدء تقييم
            </Link>
            <Link href="/visits" className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> زيارة جديدة
            </Link>
          </>
        }
      />

      {/* ============ البطاقات الإحصائية ============ */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="المدارس في نطاقك"
          value={stats.schools?.total ?? 0}
          hint={`${stats.schools?.active ?? 0} مدرسة نشطة`}
          icon={Building2}
          tone="navy"
          delay={0}
        />
        <StatCard
          label="الزيارات الميدانية"
          value={totalVisits}
          hint={`${completedVisits} مكتملة · ${stats.visits?.today ?? 0} اليوم`}
          icon={CalendarCheck}
          tone="teal"
          delay={60}
        />
        <StatCard
          label="متوسط تحقق المؤشرات"
          value={criteriaAvg > 0 ? `${criteriaAvg}%` : "—"}
          hint={`${stats.evaluatedIndicators ?? 0} مؤشراً مقيَّماً`}
          icon={Target}
          tone="gold"
          delay={120}
        />
        <StatCard
          label="نسبة تغطية الأدلة"
          value={`${evidenceCompletion}%`}
          hint={`${stats.improvement?.actionsOverdue ?? 0} إجراءً متأخراً`}
          icon={FileText}
          tone="emerald"
          delay={180}
        />
      </div>

      {/* ============ الرسوم ============ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* توزيع الزيارات */}
        <div className="card animate-fade-up p-5 lg:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-heading text-[16px] font-bold text-navy">اتجاه نسبة التحقق</h2>
            <span
              className={`badge ${growing ? "badge-success" : "badge-warning"} gap-1`}
            >
              {growing ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {growing ? "تحسّن" : "تراجع"}
            </span>
          </div>
          <p className="mb-4 text-[11.5px] text-gray-400">
            متوسط نسبة تحقق المؤشرات بين الفترتين (٪)
          </p>

          <div className="h-[210px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#17A89A" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#17A89A" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFF1F4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#5A6B7B" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94A3B0" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E2E5E9",
                    fontSize: 12,
                    boxShadow: "0 8px 24px -8px rgba(11,37,69,0.2)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="نسبة التحقق ٪"
                  stroke="#0E7C66"
                  strokeWidth={2.5}
                  fill="url(#areaFill)"
                  dot={{ r: 4, fill: "#17A89A", strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* حالة الزيارات */}
        <div className="card animate-fade-up p-5 delay-1">
          <h2 className="mb-1 font-heading text-[16px] font-bold text-navy">حالة الزيارات</h2>
          <p className="mb-2 text-[11.5px] text-gray-400">التوزيع بحسب الحالة</p>

          {visitsByStatus.length === 0 ? (
            <div className="flex h-[210px] flex-col items-center justify-center gap-2 text-center">
              <Activity className="h-8 w-8 text-gray-300" />
              <p className="text-[12px] text-gray-400">لا توجد زيارات مسجّلة بعد</p>
              <Link href="/visits" className="btn btn-ghost btn-sm mt-1">
                إنشاء زيارة
              </Link>
            </div>
          ) : (
            <>
              <div className="relative h-[170px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={visitsByStatus}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {visitsByStatus.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E2E5E9",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-heading text-xl font-bold text-navy">{totalVisits}</span>
                  <span className="text-[10px] text-gray-400">زيارة</span>
                </div>
              </div>

              <ul className="mt-2 space-y-1.5">
                {visitsByStatus.map((v, i) => (
                  <li key={v.key} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: PALETTE[i % PALETTE.length] }}
                      />
                      {v.name}
                    </span>
                    <span className="font-mono font-semibold text-navy">{v.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ============ المدارس العاجلة ============ */}
      <div className="card animate-fade-up overflow-hidden delay-2">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="font-heading text-[16px] font-bold text-navy">مدارس تحتاج متابعة</h2>
          </div>
          <Link
            href="/schools"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-turquoise hover:underline"
          >
            كل المدارس <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        {(stats.urgentSchools ?? []).length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Sparkles className="mx-auto mb-2 h-7 w-7 text-success/40" />
            <p className="text-[12.5px] text-gray-500">
              لا توجد مدارس دون الحد الأدنى حالياً — أو لا توجد تقييمات كافية للحكم.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>المدرسة</th>
                  <th>الرمز</th>
                  <th>نسبة التحقق</th>
                  <th className="text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {stats.urgentSchools.map((s: any) => (
                  <tr key={s.id}>
                    <td className="font-medium text-navy">{s.name}</td>
                    <td className="font-mono text-[11.5px] text-gray-500">{s.code ?? "—"}</td>
                    <td>
                      {s.avgScore == null ? (
                        <span className="badge badge-neutral">لم تُقيَّم بعد</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="progress w-24">
                            <span
                              style={{ width: `${Math.min(100, Number(s.avgScore))}%` }}
                              className="!bg-gradient-to-l !from-danger !to-warning"
                            />
                          </div>
                          <span className="font-mono text-[11.5px] font-semibold text-danger">
                            {s.avgScore}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      <Link
                        href={`/schools/${s.id}`}
                        className="text-[12px] font-semibold text-turquoise hover:underline"
                      >
                        عرض
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============ صف أخير ============ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* المشكلات المتكررة */}
        <div className="card animate-fade-up p-5 delay-3">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-turquoise" />
            <h2 className="font-heading text-[16px] font-bold text-navy">الإجراءات التصحيحية</h2>
          </div>
          {(stats.recurringProblems ?? []).length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-gray-400">
              لا توجد إجراءات تصحيحية مسجّلة بعد.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.recurringProblems.slice(0, 5).map((p: any, i: number) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-[12.5px] text-gray-700">
                    <span className="ml-1 font-mono text-[10.5px] text-gray-400">
                      {p.indicatorCode}
                    </span>
                    {p.indicatorTitle}
                  </span>
                  <span className="badge badge-warning shrink-0">{p.actionsCount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* التوزيع الجغرافي */}
        <div className="card animate-fade-up p-5 delay-4">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gold" />
            <h2 className="font-heading text-[16px] font-bold text-navy">التوزيع الجغرافي</h2>
          </div>
          {(stats.byDirectorate ?? []).length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-gray-400">لا توجد بيانات جغرافية.</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.byDirectorate.slice(0, 6).map((d: any) => {
                const max = Math.max(
                  ...stats.byDirectorate.map((x: any) => Number(x.count)),
                  1
                );
                return (
                  <li key={d.name}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="truncate text-gray-700">{d.name}</span>
                      <span className="font-mono font-semibold text-navy">{d.count}</span>
                    </div>
                    <div className="progress progress-gold">
                      <span style={{ width: `${(d.count / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
