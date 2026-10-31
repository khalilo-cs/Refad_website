"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SelfAssessmentNudge } from "@/components/self-assessment/nudge";
import { canSeeHref } from "@/lib/nav";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, AlertTriangle, ArrowLeft, Building2, CalendarCheck, ClipboardList, FileCheck2, Filter, GraduationCap,
  HeartHandshake, LayoutDashboard, MapPin, Plus, RefreshCw, ShieldAlert, Target, TrendingDown, TrendingUp, Users, X, Wrench, MessageSquare,
} from "lucide-react";
import { useSession } from "@/components/providers";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { AnimatedNumber, Rise, ScoreBar, ScoreRing, Stagger } from "@/components/ui/extra";
import { REPORT_STATUS, SCORE_COLOR, VISIT_STATUS, VISIT_TYPE, fmtPercent, scoreTone } from "@/lib/labels";
import RoleHome from "@/components/dashboard/role-home";

const SchoolsMap = dynamic(() => import("@/components/maps/schools-map"), {
  ssr: false,
  loading: () => <div className="skeleton h-[300px] w-full rounded-2xl" />,
});

const PALETTE = ["#0B2545", "#17A89A", "#C9A227", "#C2760B", "#B42318", "#0E7C66", "#1D6FB8"];
const FILTER_KEYS = ["directorateId", "schoolId", "type", "from", "to", "inspectorId", "reportStatus"] as const;
type Filters = Record<(typeof FILTER_KEYS)[number], string>;
const EMPTY: Filters = { directorateId: "", schoolId: "", type: "", from: "", to: "", inspectorId: "", reportStatus: "" };

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (m: string) => { const [y, mm] = m.split("-"); return `${MONTHS[Number(mm) - 1] ?? mm} ${String(y).slice(2)}`; };

export default function DashboardPage() {
  const { user } = useSession();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [required, setRequired] = useState<{ total: number; schools: number } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirs, setDirs] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);

  const staff = !!user && !["PARENT", "TEACHER", "GUEST"].includes(user.roleKey);
  const see = (href: string) => canSeeHref(user?.roleKey, (user as any)?.permissions, href);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
      const r = await fetch(`/api/dashboard/stats?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error();
      setStats(await r.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (staff) void load(filters); }, [staff, filters, load]);
  useEffect(() => {
    if (!staff) return;
    fetch("/api/lookup/directorates", { credentials: "include" }).then((r) => (r.ok ? r.json() : { directorates: [] })).then((d) => setDirs(d.directorates ?? d ?? [])).catch(() => {});
    fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => (r.ok ? r.json() : { schools: [] })).then((d) => setSchools(d.schools ?? [])).catch(() => {});
    fetch("/api/improvement/required", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setRequired({ total: d.total, schools: d.schools })).catch(() => {});
  }, [staff]);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const set = (k: keyof Filters, v: string) => setFilters((p) => ({ ...p, [k]: v }));

  const radar = useMemo(() => (stats?.criteriaAverages ?? []).map((c: any) => ({ name: `م${c.code}`, full: c.title, value: c.average ?? 0, has: c.average != null })), [stats]);
  const statusData = useMemo(
    () => Object.entries(stats?.visits?.byStatus ?? {}).map(([k, v]) => ({ key: k, name: VISIT_STATUS[k]?.label ?? k, value: Number(v) })),
    [stats]
  );
  const trendData = useMemo(() => (stats?.trend ?? []).map((t: any) => ({ ...t, label: monthLabel(t.month) })), [stats]);

  if (!user) return null;
  if (!staff) return <RoleHome user={user} />;

  const delta = stats?.improvementLevel?.delta as number | null | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={`أهلاً ${user.name?.split(" ").slice(0, 2).join(" ")}`}
        subtitle={new Date().toLocaleDateString("ar-YE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " — مؤشرات حيّة من سجلات المنصة الفعلية"}
        actions={
          <>
            <button onClick={() => setShowFilters((s) => !s)} className="btn btn-ghost btn-sm" aria-expanded={showFilters}>
              <Filter className="h-3.5 w-3.5" /> تصفية {activeCount > 0 && <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-white">{activeCount}</span>}
            </button>
            <button onClick={() => load(filters)} className="btn btn-ghost btn-sm" aria-label="تحديث"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
            {["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user.roleKey) && (
              <Link href="/visits?new=1" className="btn btn-primary btn-sm"><Plus className="h-3.5 w-3.5" /> زيارة جديدة</Link>
            )}
          </>
        }
      />
      {user && ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user.roleKey) && <SelfAssessmentNudge />}

      {showFilters && (
        <div className="card animate-fade-up p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="المديرية">
              <select className="input" value={filters.directorateId} onChange={(e) => set("directorateId", e.target.value)}>
                <option value="">الكل</option>
                {dirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="المدرسة">
              <select className="input" value={filters.schoolId} onChange={(e) => set("schoolId", e.target.value)}>
                <option value="">الكل</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="نوع الزيارة">
              <select className="input" value={filters.type} onChange={(e) => set("type", e.target.value)}>
                <option value="">الكل</option>
                {Object.entries(VISIT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="المفتش">
              <select className="input" value={filters.inspectorId} onChange={(e) => set("inspectorId", e.target.value)}>
                <option value="">الكل</option>
                {(stats?.inspectors ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="من تاريخ"><input type="date" className="input" value={filters.from} onChange={(e) => set("from", e.target.value)} /></Field>
            <Field label="إلى تاريخ"><input type="date" className="input" value={filters.to} onChange={(e) => set("to", e.target.value)} /></Field>
            <Field label="حالة التقرير">
              <select className="input" value={filters.reportStatus} onChange={(e) => set("reportStatus", e.target.value)}>
                <option value="">المقدَّمة والمعتمدة</option>
                <option value="APPROVED">معتمدة فقط</option>
                <option value="PENDING">قيد المراجعة فقط</option>
              </select>
            </Field>
            <div className="flex items-end">
              <button className="btn btn-ghost btn-sm w-full" onClick={() => setFilters(EMPTY)} disabled={!activeCount}><X className="h-3.5 w-3.5" /> مسح المرشحات</button>
            </div>
          </div>
        </div>
      )}

      {required && required.total > 0 && (
        <Link href="/improvement?required=1" className="flex items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 transition hover:bg-warning/10">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-navy">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            {required.total} مؤشراً ضعيفاً في {required.schools} مدرسة يستوجب خطة تحسين ولم يُنشأ له إجراء بعد
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-turquoise">معالجة الآن</span>
        </Link>
      )}

      {error && <Alert tone="danger" title="تعذّر تحميل البيانات">لم يستجب الخادم لطلب الإحصاءات. أعد المحاولة أو راجع اتصالك.</Alert>}

      {loading && !stats ? <DashSkeleton /> : stats && (
        <Stagger className="space-y-6">
          {["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user.roleKey) && (
            <Rise>
              <section className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-heading text-[15px] font-bold text-navy">تقدّم الانضمام إلى المنصة</h2>
                  <Link href="/about" className="text-[12px] font-semibold text-turquoise hover:underline">خطة التدشين</Link>
                </div>
                {(() => {
                  const target = BRAND.targetSchools;
                  const registered = stats.schools?.total ?? 0;
                  const evaluated = stats.scoring?.basisSchools ?? 0;
                  const row = (label: string, v: number, color: string) => (
                    <div>
                      <div className="mb-1 flex justify-between text-[12px]"><span className="text-gray-600">{label}</span><span className="font-mono font-semibold text-navy">{v} / {target}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.min(100, Math.round((v / target) * 100))}%` }} /></div>
                    </div>
                  );
                  return (
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {row("مدارس مسجّلة في المنصة", registered, "bg-turquoise")}
                      {row("مدارس لها تقييم مقدَّم أو معتمد", evaluated, "bg-gold")}
                    </div>
                  );
                })()}
                <p className="mt-3 text-[11.5px] text-gray-400">الهدف ({BRAND.targetSchools} مدرسة) مأخوذ من وثيقة خطة المشروع؛ الأرقام المعروضة من السجلات الفعلية فقط.</p>
              </section>
            </Rise>
          )}
          {/* ===== الشريط البطولي ===== */}
          <Rise>
            <section className="relative overflow-hidden rounded-3xl bg-aurora p-6 text-white shadow-lg sm:p-8">
              <div className="pattern-geo pointer-events-none absolute inset-0 opacity-[0.07]" />
              <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
                <ScoreRing value={stats.scoring.overallAverage} size={148} stroke={12} label="متوسط التحقق" sub={`${stats.scoring.basisSchools} مدرسة`} dark />
                <div className="space-y-3">
                  <h2 className="font-heading text-2xl font-bold sm:text-[28px]">الصورة العامة للجودة في نطاقك</h2>
                  <p className="max-w-xl text-[13.5px] leading-relaxed text-white/70">
                    تُحتسب النسبة من آخر زيارة مقدَّمة أو معتمدة لكل مدرسة، على الجزء المقيَّم فقط، بمحرك الدرجات الرسمي. المؤشرات غير المقيَّمة لا تُعدّ نجاحاً ولا رسوباً.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {delta != null && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold ${delta >= 0 ? "bg-emerald/30 text-emerald-100" : "bg-danger/30 text-red-100"}`}>
                        {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {delta >= 0 ? "تحسّن" : "تراجع"} {Math.abs(delta)} نقطة عن الفترة السابقة
                      </span>
                    )}
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[12px]">{stats.scoring.completeEvaluations} تقييم مكتمل</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:w-[230px]">
                  {see("/evaluation") && <Link href="/evaluation" className="btn btn-gold btn-sm justify-center"><ClipboardList className="h-3.5 w-3.5" /> التقييم</Link>}
                  {see("/reports") && <Link href="/reports" className="btn btn-sm justify-center border border-white/20 bg-white/10 text-white hover:bg-white/20"><FileCheck2 className="h-3.5 w-3.5" /> التقارير</Link>}
                  {see("/map") && <Link href="/map" className="btn btn-sm justify-center border border-white/20 bg-white/10 text-white hover:bg-white/20"><MapPin className="h-3.5 w-3.5" /> الخريطة</Link>}
                  {see("/improvement") && <Link href="/improvement" className="btn btn-sm justify-center border border-white/20 bg-white/10 text-white hover:bg-white/20"><Wrench className="h-3.5 w-3.5" /> التحسين</Link>}
                </div>
              </div>
            </section>
          </Rise>

          {/* ===== المؤشرات الرئيسية ===== */}
          <Rise>
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <Kpi href="/schools" allowed={see("/schools")} icon={Building2} tone="navy" label="المدارس المسجلة" value={stats.schools.total} hint={`${stats.schools.active} فعّالة`} />
              <Kpi href="/visits?status=IN_PROGRESS" allowed={see("/visits?status=IN_PROGRESS")} icon={CalendarCheck} tone="teal" label="زيارات اليوم" value={stats.schools.visitedToday + stats.visits.today} hint={`${stats.schools.visitedToday} مدرسة تمت زيارتها`} />
              <Kpi href="/visits?status=SCHEDULED" allowed={see("/visits?status=SCHEDULED")} icon={Activity} tone="gold" label="الزيارات المجدولة" value={stats.visits.scheduled} hint={`${stats.visits.inProgress} جارية · ${stats.visits.executed} منفّذة`} />
              <Kpi href="/visits?status=OVERDUE" allowed={see("/visits?status=OVERDUE")} icon={AlertTriangle} tone={stats.visits.overdue ? "rose" : "emerald"} label="زيارات متأخرة" value={stats.visits.overdue} hint="فات موعدها دون بدء" />
              <Kpi href="/evidence" allowed={see("/evidence")} icon={FileCheck2} tone="emerald" label="اكتمال الأدلة المقبولة" value={stats.evidence.completion} suffix="%" digits={0} hint={`${stats.evidence.withAccepted} من ${stats.evidence.evaluated} مؤشراً مقيَّماً · ${stats.evidence.pending} بانتظار المراجعة`} empty="لا تقييمات بعد" />
              <Kpi href="/improvement" allowed={see("/improvement")} icon={Wrench} tone="navy" label="خطط تحسين مفتوحة" value={stats.improvement.plansOpen} hint={`${stats.improvement.actionsDueSoon} إجراء يستحق خلال أسبوع`} />
              <Kpi href="/improvement?status=OVERDUE" allowed={see("/improvement?status=OVERDUE")} icon={ShieldAlert} tone={stats.improvement.actionsOverdue ? "rose" : "emerald"} label="إجراءات متأخرة" value={stats.improvement.actionsOverdue} hint="تجاوزت الموعد النهائي" />
              <Kpi href="/reports?status=UNDER_REVIEW" allowed={see("/reports?status=UNDER_REVIEW")} icon={ClipboardList} tone="gold" label="تقارير بانتظار الاعتماد" value={stats.reports?.UNDER_REVIEW ?? 0} hint={`${stats.reports?.APPROVED ?? 0} معتمد · ${stats.reports?.DRAFT ?? 0} مسودة`} />
            </div>
          </Rise>

          {/* ===== المعايير السبعة ===== */}
          <Rise>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="card p-5 lg:col-span-2">
                <Head title="المعايير السبعة" sub="متوسط نسبة التحقق (آخر زيارة لكل مدرسة)" />
                {stats.criteriaAverages.every((c: any) => c.average == null) ? (
                  <EmptyState icon={Target} title="لا تقييمات مقدَّمة بعد" description="ستظهر النتائج عند تقديم أول زيارة للمراجعة." />
                ) : (
                  <div className="h-[290px]" dir="ltr">
                    <ResponsiveContainer>
                      <RadarChart data={radar} outerRadius="72%">
                        <PolarGrid stroke="#E2E5E9" />
                        <PolarAngleAxis dataKey="name" tick={{ fill: "#3D4F5E", fontSize: 12, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94A3B0" }} />
                        <Radar dataKey="value" stroke="#17A89A" fill="#17A89A" fillOpacity={0.28} strokeWidth={2.2} animationDuration={900} />
                        <Tooltip content={<ChartTip fmt={(p: any) => `${p.full}: ${p.has ? p.value + "%" : "لم يُقيَّم"}`} />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="card p-5 lg:col-span-3">
                <Head title="نتائج المعايير وأوزانها" sub="اضغط على أي معيار لعرض سجلاته" />
                <ul className="space-y-3.5">
                  {stats.criteriaAverages.map((c: any, i: number) => (
                    <li key={c.id}>
                      <Link href={c.href} className="group block">
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: PALETTE[i % PALETTE.length] }}>{c.code}</span>
                            <span className="truncate font-semibold text-navy group-hover:text-turquoise">{c.title}</span>
                            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10.5px] text-gray-600">الوزن {c.weight}%</span>
                          </span>
                          <span className="font-mono font-bold" style={{ color: SCORE_COLOR[scoreTone(c.average)] }}>{c.average == null ? "لم يُقيَّم" : `${c.average}%`}</span>
                        </div>
                        <ScoreBar value={c.average} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Rise>

          {/* ===== الاتجاهات والزيارات ===== */}
          <Rise>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="card p-5 lg:col-span-2">
                <Head title="اتجاه نسبة التحقق" sub={`متوسط شهري — الفترة الأخيرة (${stats.improvementLevel.windowDays} يوماً) ${stats.improvementLevel.current ?? "—"}% مقابل ${stats.improvementLevel.previous ?? "—"}% قبلها`} />
                {trendData.length === 0 ? (
                  <EmptyState icon={TrendingUp} title="لا بيانات كافية" description="يظهر الاتجاه بعد تقديم زيارات في أشهر مختلفة." />
                ) : (
                  <div className="h-[240px]" dir="ltr">
                    <ResponsiveContainer>
                      <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#17A89A" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#17A89A" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#EEF0F2" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5A6B7B" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94A3B0" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip fmt={(p: any) => `${p.label}: ${p.average}% (${p.visits} زيارة)`} />} />
                        <Area type="monotone" dataKey="average" stroke="#0E7C66" strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 4, fill: "#0E7C66", strokeWidth: 2, stroke: "#fff" }} animationDuration={900} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="card p-5">
                <Head title="حالة الزيارات" sub="التوزيع حسب الحالة" />
                {statusData.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="لا زيارات" />
                ) : (
                  <>
                    <div className="relative h-[170px]" dir="ltr">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={statusData} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none" animationDuration={800}>
                            {statusData.map((d, i) => <Cell key={d.key} fill={PALETTE[i % PALETTE.length]} />)}
                          </Pie>
                          <Tooltip content={<ChartTip fmt={(p: any) => `${p.name}: ${p.value}`} />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-heading text-2xl font-bold text-navy">{statusData.reduce((a, b) => a + b.value, 0)}</span>
                        <span className="text-[10.5px] text-gray-500">زيارة</span>
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {statusData.map((d, i) => (
                        <li key={d.key}>
                          <Link href={`/visits?status=${d.key}`} className="flex items-center justify-between rounded-lg px-2 py-1 text-[12.5px] transition hover:bg-gray-50">
                            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{d.name}</span>
                            <span className="font-mono font-semibold text-navy">{d.value}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </Rise>

          {/* ===== المتابعة العاجلة ===== */}
          <Rise>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="card overflow-hidden lg:col-span-3">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><h2 className="font-heading text-[16px] font-bold text-navy">مدارس تحتاج متابعة عاجلة</h2></div>
                  <Link href="/schools" className="text-[12px] font-semibold text-turquoise hover:underline">كل المدارس <ArrowLeft className="inline h-3 w-3" /></Link>
                </div>
                <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-[11.5px] text-gray-600">
                  معايير الإدراج: {stats.urgentCriteria.join(" · ")}
                </div>
                {stats.urgentSchools.length === 0 ? (
                  <EmptyState icon={Target} title="لا مدارس تستدعي المتابعة العاجلة" description="كل المدارس ضمن الحدود المقبولة وفق المعايير أعلاه." />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {stats.urgentSchools.map((s: any) => (
                      <li key={s.id}>
                        <Link href={s.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50">
                          <ScoreRing value={s.score} size={46} stroke={5} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-navy">{s.name}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">{s.reasons.map((r: string) => <span key={r} className="badge badge-warning">{r}</span>)}</div>
                          </div>
                          <ArrowLeft className="h-4 w-4 text-gray-300" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="card p-5 lg:col-span-2">
                <Head title="المشكلات المتكررة" sub="مؤشرات ضعيفة أو غير متحققة في أكثر من مدرسة" />
                {stats.recurringProblems.length === 0 ? (
                  <EmptyState icon={Target} title="لا مشكلات متكررة" />
                ) : (
                  <ul className="space-y-2.5">
                    {stats.recurringProblems.slice(0, 6).map((p: any) => (
                      <li key={p.indicator_id}>
                        <Link href={p.href} className="flex items-start gap-3 rounded-xl border border-gray-100 p-2.5 transition hover:border-turquoise/40 hover:bg-turquoise-soft/40">
                          <span className="rounded-lg bg-navy px-2 py-1 font-mono text-[11px] font-bold text-gold-bright">{p.code}</span>
                          <span className="line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-gray-700">{p.title}</span>
                          <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">{p.schools} مدرسة</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {stats.recurringTopics.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                    {stats.recurringTopics.map((t: any) => <span key={t.label} className="badge badge-info">{t.label} · {t.n}</span>)}
                  </div>
                )}
              </div>
            </div>
          </Rise>

          {/* ===== الخريطة والمفتشون ===== */}
          <Rise>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="card p-5 lg:col-span-3">
                <div className="mb-3 flex items-center justify-between">
                  <Head title="التوزيع الجغرافي" sub="النقاط من إحداثيات أدخلتها الجهات المعتمدة" inline />
                  {see("/map") && <Link href="/map" className="text-[12px] font-semibold text-turquoise hover:underline">الخريطة الكاملة <ArrowLeft className="inline h-3 w-3" /></Link>}
                </div>
                {stats.map.length === 0 ? (
                  <EmptyState icon={MapPin} title="لا إحداثيات مُدخلة" description="أضف الإحداثيات من صفحة المدرسة لتظهر على الخريطة." />
                ) : (
                  <SchoolsMap height={300} schools={stats.map} />
                )}
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {stats.byDirectorate.slice(0, 6).map((d: any) => {
                    const max = Math.max(...stats.byDirectorate.map((x: any) => x.count), 1);
                    return (
                      <li key={d.id}>
                        <Link href={d.href} className="block rounded-lg px-2 py-1 transition hover:bg-gray-50">
                          <div className="mb-1 flex justify-between text-[12px]"><span className="truncate text-gray-700">{d.name}</span><span className="font-mono font-semibold text-navy">{d.count}</span></div>
                          <div className="progress progress-gold"><span style={{ width: `${(d.count / max) * 100}%` }} /></div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="card p-5 lg:col-span-2">
                <Head title="نشاط المفتشين" sub="الزيارات المخططة مقابل المنفَّذة" />
                {stats.inspectors.length === 0 ? (
                  <EmptyState icon={Users} title="لا نشاط مسجّل" />
                ) : (
                  <>
                    <div className="h-[200px]" dir="ltr">
                      <ResponsiveContainer>
                        <BarChart data={stats.inspectors} layout="vertical" margin={{ left: 8, right: 12 }}>
                          <CartesianGrid stroke="#EEF0F2" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#3D4F5E" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTip fmt={(p: any) => `${p.name}: ${p.done} من ${p.planned} (${p.rate}%)`} />} />
                          <Bar dataKey="planned" fill="#E2E5E9" radius={[0, 6, 6, 0]} barSize={14} animationDuration={800} />
                          <Bar dataKey="done" fill="#17A89A" radius={[0, 6, 6, 0]} barSize={14} animationDuration={900} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {stats.inspectors.slice(0, 5).map((i: any) => (
                        <li key={i.id}>
                          <Link href={i.href} className="flex items-center justify-between rounded-lg px-2 py-1 text-[12.5px] transition hover:bg-gray-50">
                            <span className="truncate text-gray-700">{i.name}</span>
                            <span className="flex items-center gap-2"><span className="font-mono text-gray-500">{i.done}/{i.planned}</span>{i.overdue > 0 && <span className="badge badge-danger">{i.overdue} متأخرة</span>}<span className="font-bold text-navy">{i.rate}%</span></span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </Rise>

          {/* ===== البرامج: التدريب والتواصل والشراكة ===== */}
          <Rise>
            <div className="grid gap-4 md:grid-cols-3">
              {([
                ["training", GraduationCap, "teal", "/reports?topic=training"],
                ["communication", MessageSquare, "gold", "/reports?topic=communication"],
                ["community", HeartHandshake, "emerald", "/reports?topic=community"],
              ] as const).map(([k, Icon, tone, href]) => {
                const g = stats.programs[k];
                return (
                  <Link key={k} href={href} className="card card-elevated flex items-center gap-4 p-5">
                    <ScoreRing value={g.average} size={78} stroke={8} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-navy"><Icon className="h-4 w-4" /><h3 className="font-heading text-[15px] font-bold">{g.label}</h3></div>
                      <p className="mt-1 text-[12px] text-gray-500">{g.evaluated ? `${g.evaluated} تقييماً مبنياً على مؤشرات الاستمارة` : "لا تقييمات لهذه المؤشرات بعد"}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Rise>
        </Stagger>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function Head({ title, sub, inline }: { title: string; sub?: string; inline?: boolean }) {
  return (
    <div className={inline ? "" : "mb-4"}>
      <h2 className="font-heading text-[16px] font-bold text-navy">{title}</h2>
      {sub && <p className="mt-0.5 text-[11.5px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Kpi({ href, allowed = true, icon: Icon, tone, label, value, hint, suffix = "", digits = 0, empty }: {
  href: string; allowed?: boolean; icon: any; tone: string; label: string; value: number | null; hint?: string; suffix?: string; digits?: number; empty?: string;
}) {
  const tones: Record<string, string> = {
    navy: "bg-navy/8 text-navy ring-navy/10", teal: "bg-turquoise/10 text-turquoise ring-turquoise/15",
    gold: "bg-gold/12 text-gold ring-gold/20", rose: "bg-danger/8 text-danger ring-danger/15", emerald: "bg-emerald/10 text-emerald ring-emerald/15",
  };
  return (
    <Link href={allowed ? href : "#"} onClick={(e) => { if (!allowed) e.preventDefault(); }} aria-disabled={!allowed} className={`card card-elevated card-accent group block p-4 sm:p-5 ${allowed ? "" : "pointer-events-none"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-gray-600">{label}</p>
          <p className="mt-2 font-heading text-[28px] font-bold leading-none text-navy">
            {value == null ? <span className="text-[15px] font-normal text-gray-400">{empty ?? "—"}</span> : <AnimatedNumber value={value} digits={digits} suffix={suffix} />}
          </p>
          {hint && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-gray-400">{hint}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition group-hover:scale-110 ${tones[tone] ?? tones.navy}`}><Icon className="h-5 w-5" /></span>
      </div>
    </Link>
  );
}

function ChartTip({ active, payload, fmt }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] shadow-md" dir="rtl">{fmt(payload[0].payload)}</div>;
}

function DashSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-44 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-5"><div className="skeleton h-80 rounded-2xl lg:col-span-2" /><div className="skeleton h-80 rounded-2xl lg:col-span-3" /></div>
    </div>
  );
}
