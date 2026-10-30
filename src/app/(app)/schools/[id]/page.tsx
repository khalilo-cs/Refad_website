"use client";

import { useCallback, useEffect, useState } from "react";
import { SchoolWeaknessCard } from "@/components/self-assessment/school-weakness-card";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight, Building2, CalendarPlus, CheckCircle2, ChevronDown, FileText, Loader2, MapPin, Pencil, Phone, ShieldCheck, Users, Wrench, XCircle,
} from "lucide-react";
import { Alert, EmptyState } from "@/components/ui";
import { ConfirmDialog, Rise, ScoreBar, ScoreRing, Stagger, StatusBadge, Tabs } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { SchoolFormModal } from "@/components/schools/school-form-modal";
import { SchoolContactsCard } from "@/components/schools/contacts-card";
import { LocationActions, PhoneActions } from "@/components/ui/contact";
import { LOCATION_SOURCE_LABEL, type LocationSource } from "@/lib/geo";
import { REPORT_STATUS, SCORE_COLOR, VISIT_STATUS, VISIT_TYPE, fmtDate, fmtPercent, scoreTone } from "@/lib/labels";

const SchoolsMap = dynamic(() => import("@/components/maps/schools-map"), { ssr: false, loading: () => <div className="skeleton h-[220px] rounded-2xl" /> });

type Tab = "overview" | "self" | "visits" | "profile" | "contacts" | "evidence" | "plans";

const FACILITIES: [string, string][] = [
  ["has_science_lab", "معمل علوم"], ["has_computer_lab", "معمل حاسوب"], ["has_library", "مكتبة"], ["has_resource_room", "غرفة مصادر تعلم"],
  ["has_canteen", "مقصف"], ["has_clinic", "عيادة"], ["has_playground", "ملعب / ساحة"], ["has_power", "كهرباء / طاقة شمسية"],
  ["has_water", "مياه"], ["special_needs_access", "تسهيلات لذوي الاحتياجات الخاصة"],
];
const COUNTS: [string, string][] = [
  ["students_count", "عدد المتعلمين"], ["teachers_count", "عدد المعلمين"], ["admin_staff_count", "الكادر الإداري"],
  ["service_staff_count", "الكادر الخدمي"], ["classes_count", "عدد الفصول"], ["sanitation_units", "دورات المياه"],
];
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const { add } = useToast();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const sp = useSearchParams();
  const initialTab = (["overview", "self", "visits", "profile", "contacts", "evidence", "plans"] as Tab[]).find((t) => t === sp.get("tab")) ?? "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editOpen, setEditOpen] = useState(false);
  const [editSchool, setEditSchool] = useState<any>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [openCrit, setOpenCrit] = useState<string | null>(null);
  const [contactsKey, setContactsKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/schools/${id}/overview`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
    } catch (e: any) {
      setError(e.message || "تعذّر التحميل");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Alert tone="danger" title="تعذّر عرض المدرسة">{error}</Alert>;
  if (!data) return <div className="space-y-4"><div className="skeleton h-40 rounded-3xl" /><div className="skeleton h-72 rounded-2xl" /></div>;

  const s = data.school;
  const canManage = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user?.roleKey ?? "");
  const canVisit = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user?.roleKey ?? "");

  if (data.restricted) {
    return (
      <div className="space-y-5">
        <div className="card p-6"><h1 className="font-heading text-2xl font-bold text-navy">{s.name}</h1><p className="mt-2 text-sm text-gray-600">{s.stage} — {s.directorate_name}، {s.governorate_name}</p>{s.contact_phone && <p className="mt-2 flex items-center gap-1 text-sm text-gray-600"><Phone className="h-4 w-4" />{s.contact_phone}</p>}</div>
        <Alert tone="info">تظهر هنا المعلومات العامة للمدرسة فقط. لمتابعة أبنائك استخدم الصفحة الرئيسية.</Alert>
      </div>
    );
  }

  const openEdit = async () => {
    const r = await fetch(`/api/schools/${id}`, { credentials: "include" });
    const d = await r.json();
    if (r.ok) { setEditSchool(d.school); setEditOpen(true); } else add({ type: "error", message: d.message });
  };

  const archive = async () => {
    const r = await fetch(`/api/schools/${id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json();
    if (!r.ok) return add({ type: "error", message: d.message });
    add({ type: "success", message: d.message });
    router.push("/schools");
  };

  const res = data.result;
  const mapPoint = s.latitude != null && s.longitude != null ? [{ id: s.id, name: s.name, code: s.code, latitude: s.latitude, longitude: s.longitude, directorate: s.directorate_name, percent: res?.partPercent ?? null }] : [];

  return (
    <div className="space-y-6">
      <Link href="/schools" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-turquoise hover:underline"><ArrowRight className="h-3.5 w-3.5" /> كل المدارس</Link>

      <Rise>
        <section className="relative overflow-hidden rounded-3xl bg-aurora p-6 text-white shadow-lg sm:p-8">
          <div className="pattern-geo pointer-events-none absolute inset-0 opacity-[0.07]" />
          <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
            <ScoreRing value={res?.partPercent ?? null} size={132} stroke={11} label="نسبة التحقق" sub={res ? `اكتمال ${Math.round(res.completion)}%` : "لا زيارة معتمدة"} dark />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-white/10 px-2 py-0.5 font-mono text-[12px]">{s.code}</span>
                <span className={`badge ${s.status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}>{s.status === "ACTIVE" ? "نشطة" : s.status}</span>
                {s.code.startsWith("RIFAD-DEMO") && <span className="badge badge-gold">بيانات تجريبية</span>}
              </div>
              <h1 className="font-heading text-2xl font-bold leading-snug sm:text-[28px]">{s.name}</h1>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/70">
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{s.type} — {s.stage}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.directorate_name}، {s.governorate_name}{s.area_name ? ` — ${s.area_name}` : ""}</span>
                {s.principal_name && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.principal_name}</span>}
              </p>
              {res?.warnings?.length > 0 && <p className="text-[12px] text-gold-bright">{res.warnings[res.warnings.length - 1]}</p>}
              {(s.contact_phone || (s.latitude != null && s.longitude != null)) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {s.contact_phone && <span className="inline-flex items-center rounded-xl bg-white/95 px-3 py-1"><PhoneActions phone={s.contact_phone} hasWhatsapp={s.has_whatsapp !== 0} name={s.principal_name ?? s.name} /></span>}
                  {s.latitude != null && s.longitude != null && <span className="inline-flex items-center rounded-xl bg-white/95 px-2 py-1"><LocationActions lat={s.latitude} lng={s.longitude} label /></span>}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 md:flex-col">
              {canVisit && <Link href={`/visits?new=1&schoolId=${id}`} className="btn btn-gold btn-sm justify-center"><CalendarPlus className="h-3.5 w-3.5" /> زيارة جديدة</Link>}
              {(canManage || user?.roleKey === "SCHOOL_PRINCIPAL") && <button onClick={openEdit} className="btn btn-sm justify-center border border-white/20 bg-white/10 text-white hover:bg-white/20"><Pencil className="h-3.5 w-3.5" /> تعديل</button>}
              {canManage && <button onClick={() => setArchiveOpen(true)} className="btn btn-sm justify-center border border-white/20 bg-white/10 text-white hover:bg-danger/60">أرشفة</button>}
            </div>
          </div>
        </section>
      </Rise>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "نظرة عامة" },
          ...(["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user?.roleKey ?? "") ? [{ key: "self" as Tab, label: "التقييم الذاتي ونقاط الضعف" }] : []),
          { key: "visits", label: "الزيارات", count: data.visits.length },
          { key: "profile", label: "الملف والمرافق" },
          { key: "contacts", label: "جهات الاتصال والموقع" },
          { key: "evidence", label: "الأدلة", count: data.evidence?.total ?? 0 },
          { key: "plans", label: "التحسين والتقارير", count: data.plans.length },
        ]}
      />

      {tab === "overview" && (
        <Stagger className="space-y-6">
          <Rise>
            <div className="card p-5">
              <h2 className="font-heading text-[16px] font-bold text-navy">المعايير السبعة</h2>
              <p className="mb-4 mt-0.5 text-[11.5px] text-gray-500">نتائج آخر زيارة مقدَّمة أو معتمدة — اضغط على معيار لعرض معاييره الفرعية</p>
              {!res ? <EmptyState icon={ShieldCheck} title="لا توجد زيارة مقدَّمة أو معتمدة بعد" description="تظهر النتائج بعد تقديم أول زيارة للمراجعة." /> : (
                <ul className="space-y-3">
                  {data.criteria.map((c: any) => {
                    const delta = c.achievement != null && c.previous != null ? Math.round((c.achievement - c.previous) * 10) / 10 : null;
                    const open = openCrit === c.id;
                    return (
                      <li key={c.id} className="rounded-xl border border-gray-100 p-3">
                        <button className="block w-full text-right" onClick={() => setOpenCrit(open ? null : c.id)} aria-expanded={open}>
                          <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                            <span className="flex items-center gap-2 font-semibold text-navy"><ChevronDown className={`h-4 w-4 text-gray-400 transition ${open ? "rotate-180" : ""}`} />{c.code}. {c.title}<span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-normal text-gray-600">الوزن {c.weight}%</span></span>
                            <span className="flex items-center gap-2">
                              {delta != null && <span className={`text-[11px] font-bold ${delta >= 0 ? "text-success" : "text-danger"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}</span>}
                              <span className="font-mono font-bold" style={{ color: SCORE_COLOR[scoreTone(c.achievement)] }}>{c.achievement == null ? "لم يُقيَّم" : fmtPercent(c.achievement)}</span>
                            </span>
                          </div>
                          <ScoreBar value={c.achievement} />
                        </button>
                        {open && (
                          <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                            {c.subCriteria.map((sc: any) => (
                              <li key={sc.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                                <span className="text-gray-700">{sc.title} <span className="text-gray-400">({sc.weight}%)</span></span>
                                <span className="flex items-center gap-3"><span className="text-[11px] text-gray-400">مساهمة {sc.contribution ?? "—"}</span><span className="font-mono font-semibold" style={{ color: SCORE_COLOR[scoreTone(sc.achievement)] }}>{sc.achievement == null ? "—" : fmtPercent(sc.achievement)}</span></span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Rise>

          <Rise>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="card p-5 lg:col-span-3">
                <h2 className="font-heading text-[16px] font-bold text-navy">تطور نسبة التحقق</h2>
                {data.trend.length < 2 ? <p className="py-10 text-center text-[12.5px] text-gray-400">يلزم زيارتان مقدَّمتان على الأقل لعرض الاتجاه.</p> : (
                  <div className="mt-3 h-[210px]" dir="ltr">
                    <ResponsiveContainer>
                      <AreaChart data={data.trend.map((t: any) => ({ ...t, label: fmtDate(t.at) }))} margin={{ left: -18, right: 8, top: 8 }}>
                        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#17A89A" stopOpacity={0.35} /><stop offset="100%" stopColor="#17A89A" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid stroke="#EEF0F2" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: any) => [`${v}%`, "نسبة التحقق"]} />
                        <Area dataKey="percent" stroke="#0E7C66" strokeWidth={2.5} fill="url(#g1)" dot={{ r: 4, fill: "#0E7C66", stroke: "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="card p-5 lg:col-span-2">
                <h2 className="mb-3 font-heading text-[16px] font-bold text-navy">الموقع</h2>
                {mapPoint.length ? <SchoolsMap schools={mapPoint} height={210} /> : <EmptyState icon={MapPin} title="لا إحداثيات" description={canManage ? "أضفها من زر التعديل." : "لم تُدخل إحداثيات لهذه المدرسة."} />}
              </div>
            </div>
          </Rise>

          <Rise>
            <div className="card p-5">
              <h2 className="font-heading text-[16px] font-bold text-navy">أضعف المؤشرات في آخر زيارة</h2>
              <p className="mb-3 mt-0.5 text-[11.5px] text-gray-500">مؤشرات غير متحققة أو بدرجة ضعيفة، مع الأدلة المقبولة لكل منها</p>
              {data.weakIndicators.length === 0 ? <p className="py-6 text-center text-[12.5px] text-gray-400">لا مؤشرات ضعيفة في آخر زيارة.</p> : (
                <ul className="divide-y divide-gray-100">
                  {data.weakIndicators.map((w: any) => (
                    <li key={w.id} className="flex items-start gap-3 py-2.5">
                      <span className="rounded-lg bg-navy px-2 py-1 font-mono text-[11px] font-bold text-gold-bright">{w.code}</span>
                      <p className="flex-1 text-[13px] leading-relaxed text-gray-700">{w.title}{w.notes && <span className="mt-1 block text-[12px] text-gray-500">ملاحظة: {w.notes}</span>}</p>
                      <span className={`badge ${w.score === 0 ? "badge-danger" : "badge-warning"}`}>{w.score === 0 ? "غير متحقق" : "ضعيف"}</span>
                      <span className={`badge ${w.accepted_evidence ? "badge-success" : "badge-neutral"}`}>{w.accepted_evidence ? `${w.accepted_evidence} دليل مقبول` : "بلا دليل مقبول"}</span>
                      {["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user?.roleKey ?? "") && <Link href={`/improvement?new=action&schoolId=${id}&indicatorId=${w.id}`} className="btn btn-ghost btn-sm">إجراء تصحيحي</Link>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Rise>
        </Stagger>
      )}

      {tab === "visits" && (
        <div className="card overflow-hidden">
          {data.visits.length === 0 ? <EmptyState icon={CalendarPlus} title="لا زيارات" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50/60 text-gray-500"><th className="px-4 py-3 text-right font-medium">التاريخ</th><th className="px-4 py-3 text-right font-medium">النوع</th><th className="px-4 py-3 text-right font-medium">المفتش</th><th className="px-4 py-3 text-right font-medium">الحالة</th><th className="px-4 py-3 text-right font-medium">الإكمال</th><th className="px-4 py-3 text-right font-medium">النتيجة</th></tr></thead>
              <tbody>
                {data.visits.map((v: any) => (
                  <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                    <td className="px-4 py-3">{fmtDate(v.at)}</td><td className="px-4 py-3">{VISIT_TYPE[v.type] ?? v.type}</td><td className="px-4 py-3 text-gray-600">{v.inspector_name}</td>
                    <td className="px-4 py-3"><StatusBadge map={VISIT_STATUS} value={v.status} /></td>
                    <td className="px-4 py-3 font-mono">{v.completion}%</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: SCORE_COLOR[scoreTone(v.partPercent)] }}>{v.partPercent == null ? "—" : fmtPercent(v.partPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "profile" && <ProfileTab id={id} data={data} onSaved={load} canEdit={canManage || user?.roleKey === "INSPECTOR" || (user?.roleKey === "SCHOOL_PRINCIPAL" && (user as any)?.permissions?.manageSchoolProfile === true)} canVerify={["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user?.roleKey ?? "")} />}

      {tab === "self" && <div className="card p-5"><SchoolWeaknessCard schoolId={id} /></div>}

      {tab === "contacts" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="card p-5 lg:col-span-3"><SchoolContactsCard schoolId={id} onEditPrimary={openEdit} refreshKey={contactsKey} /></div>
          <div className="card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-heading text-[15px] font-bold text-navy">موقع المدرسة</h3>
              <LocationActions lat={s.latitude} lng={s.longitude} label />
            </div>
            {mapPoint.length ? (
              <>
                <SchoolsMap schools={mapPoint} height={220} />
                <p className="mt-2 text-[11.5px] text-gray-500">
                  <bdi dir="ltr" className="font-mono">{Number(s.latitude).toFixed(6)}, {Number(s.longitude).toFixed(6)}</bdi>
                  {s.location_source && <> · {LOCATION_SOURCE_LABEL[s.location_source as LocationSource] ?? s.location_source}</>}
                  {s.location_updated_at && <> · {fmtDate(s.location_updated_at)}</>}
                </p>
              </>
            ) : <EmptyState icon={MapPin} title="لم يُحدَّد موقع المدرسة" description={canManage ? "حدّده من زر «تعديل» لتظهر على الخريطة ويتوفر زر التوجيه." : "لم تُدخل الإدارة الموقع بعد."} />}
          </div>
        </div>
      )}

      {tab === "evidence" && (
        <div className="card p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["الإجمالي", data.evidence?.total, "text-navy"], ["مقبولة", data.evidence?.accepted, "text-success"], ["بانتظار المراجعة", data.evidence?.pending, "text-warning"], ["مرفوضة", data.evidence?.rejected, "text-danger"]].map(([l, v, c]: any) => (
              <div key={l} className="rounded-xl bg-gray-50 p-4 text-center"><p className="text-[12px] text-gray-600">{l}</p><p className={`font-heading text-3xl font-bold ${c}`}>{v ?? 0}</p></div>
            ))}
          </div>
          <div className="mt-4 text-center"><Link href={`/evidence?schoolId=${id}`} className="btn btn-primary btn-sm"><FileText className="h-3.5 w-3.5" /> فتح مكتبة الأدلة</Link></div>
        </div>
      )}

      {tab === "plans" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><Wrench className="h-4 w-4 text-gold" /> خطط التحسين</h2>
            {data.plans.length === 0 ? <p className="py-6 text-center text-[12.5px] text-gray-400">لا خطط تحسين.</p> : (
              <ul className="space-y-3">{data.plans.map((p: any) => (
                <li key={p.id}><Link href={`/improvement?planId=${p.id}`} className="block rounded-xl border border-gray-100 p-3 transition hover:border-turquoise/40">
                  <div className="flex items-center justify-between"><span className="font-semibold text-navy">{p.title}</span>{p.overdue > 0 && <span className="badge badge-danger">{p.overdue} متأخر</span>}</div>
                  <div className="mt-2 flex items-center gap-3"><div className="flex-1"><ScoreBar value={p.actions ? (p.done / p.actions) * 100 : 0} height={6} /></div><span className="font-mono text-[11.5px] text-gray-500">{p.done}/{p.actions}</span></div>
                </Link></li>
              ))}</ul>
            )}
          </div>
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><FileText className="h-4 w-4 text-gold" /> التقارير</h2>
            {data.reports.length === 0 ? <p className="py-6 text-center text-[12.5px] text-gray-400">لا تقارير.</p> : (
              <ul className="divide-y divide-gray-100">{data.reports.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between py-2.5"><div><p className="text-[13px] font-semibold text-navy">{r.title}</p><p className="font-mono text-[11px] text-gray-400">{r.number} · {fmtDate(r.created_at)}</p></div><StatusBadge map={REPORT_STATUS} value={r.status} /></li>
              ))}</ul>
            )}
          </div>
        </div>
      )}

      <SchoolFormModal open={editOpen} school={editSchool} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); void load(); setContactsKey((k) => k + 1); }} />
      <ConfirmDialog open={archiveOpen} title="أرشفة المدرسة" message="ستُخفى المدرسة من القوائم النشطة مع الاحتفاظ بكل زياراتها وتقييماتها وأدلتها. يمكن استعادتها لاحقاً من التعديل." confirmLabel="أرشفة" onConfirm={archive} onClose={() => setArchiveOpen(false)} />
    </div>
  );
}

function ProfileTab({ id, data, onSaved, canEdit, canVerify }: { id: string; data: any; onSaved: () => void; canEdit: boolean; canVerify: boolean }) {
  const { add } = useToast();
  const p = data.profile ?? {};
  const [form, setForm] = useState<any>(() => ({ ...p }));
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ ...(data.profile ?? {}) }), [data.profile]);
  const set = (k: string, v: any) => setForm((x: any) => ({ ...x, [k]: v }));

  const save = async (verify?: boolean) => {
    setBusy(true);
    try {
      const body: any = {};
      for (const [k] of COUNTS) body[camel(k)] = form[k] === "" || form[k] == null ? null : Number(form[k]);
      for (const [k] of FACILITIES) body[camel(k)] = form[k] == null ? null : !!form[k];
      body.facilitiesNotes = form.facilities_notes ?? null;
      body.infoSource = form.info_source ?? null;
      if (verify !== undefined) body.verified = verify;
      const r = await fetch(`/api/schools/${id}/profile`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onSaved();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-[16px] font-bold text-navy">الكوادر والفصول والمرافق</h2>
          {p.verified ? <span className="badge badge-success"><CheckCircle2 className="h-3 w-3" /> موثّق {fmtDate(p.verified_at)}</span> : <span className="badge badge-warning"><XCircle className="h-3 w-3" /> غير موثّق</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {COUNTS.map(([k, l]) => (
            <div key={k}><label className="label">{l}</label><input className="input" type="number" min={0} disabled={!canEdit} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {FACILITIES.map(([k, l]) => (
            <label key={k} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-[13px]">
              <span>{l}</span>
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px]" disabled={!canEdit} value={form[k] == null ? "" : form[k] ? "1" : "0"} onChange={(e) => set(k, e.target.value === "" ? null : e.target.value === "1")}>
                <option value="">غير محدد</option><option value="1">متوفر</option><option value="0">غير متوفر</option>
              </select>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className="label">مصدر المعلومات</label><input className="input" disabled={!canEdit} value={form.info_source ?? ""} onChange={(e) => set("info_source", e.target.value)} placeholder="مثال: سجل الإدارة 2026" /></div>
          <div><label className="label">ملاحظات المرافق</label><input className="input" disabled={!canEdit} value={form.facilities_notes ?? ""} onChange={(e) => set("facilities_notes", e.target.value)} /></div>
        </div>
        {canEdit && (
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
            {canVerify && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save(!p.verified)}>{p.verified ? "إلغاء التوثيق" : "حفظ وتوثيق البيانات"}</button>}
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save()}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ</button>
          </div>
        )}
        {!canVerify && canEdit && <p className="mt-3 text-[11.5px] text-gray-500">أي تعديل يعيد حالة الملف إلى «غير موثّق» حتى يراجعه المفتش.</p>}
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="mb-3 font-heading text-[15px] font-bold text-navy">مستخدمو المدرسة</h3>
          {data.staff.length === 0 ? <p className="text-[12.5px] text-gray-400">لا مستخدمين مرتبطين.</p> : <ul className="space-y-2">{data.staff.map((u: any, i: number) => <li key={i} className="flex items-center justify-between text-[13px]"><span>{u.name}</span><span className="text-[11.5px] text-gray-500">{u.role}</span></li>)}</ul>}
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-heading text-[15px] font-bold text-navy">المفتشون المسندة إليهم</h3>
          {data.assigned.length === 0 ? <p className="text-[12.5px] text-gray-400">لا إسناد صريح.</p> : <ul className="space-y-2">{data.assigned.map((u: any) => <li key={u.id} className="text-[13px]">{u.name}</li>)}</ul>}
        </div>
      </div>
    </div>
  );
}
