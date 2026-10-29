"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, CalendarClock, ClipboardCheck, Download, FileSpreadsheet, FileText, Layers, Loader2, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { EmptyState, LoadingRows, Modal, PageHeader } from "@/components/ui";
import { Pagination, StatusBadge, Tabs, useDebounced } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { REPORT_STATUS, VISIT_STATUS, fmtDate } from "@/lib/labels";

type Tab = "" | "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

const TYPE_CARDS = [
  { type: "VISIT_DAILY", icon: ClipboardCheck, title: "تقرير الزيارة الميدانية", desc: "ملخص الزيارة: المعايير والمؤشرات والملاحظات والأدلة والفجوات والإجراءات", roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"] },
  { type: "DIRECTORATE_DAILY", icon: CalendarClock, title: "التقرير اليومي للإدارة", desc: "إنجاز اليوم: الزيارات المخططة والمنفَّذة والمشكلات والاحتياجات العاجلة", roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] },
  { type: "PERIODIC", icon: BarChart3, title: "التقرير الدوري", desc: "أسبوعي/شهري/فصلي/سنوي مع مقارنة بالفترة السابقة وتتبع التحسن", roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"] },
  { type: "QUALITY_DETAILED", icon: ShieldCheck, title: "تقرير الجودة التفصيلي", desc: "المعايير والمؤشرات والشواهد المقبولة والناقصة وخطة التحسين", roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"] },
  { type: "SPECIAL", icon: Layers, title: "تقرير إداري خاص", desc: "الحضور، النتائج، التدريب، المرافق، الصيانة، السلامة، أولياء الأمور، الأنشطة، الشراكة", roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"] },
];

export default function ReportsPage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><ReportsInner /></Suspense>;
}

function ReportsInner() {
  const { user } = useSession();
  const { add } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get("status") as Tab) ?? "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(!!sp.get("visitId"));
  const dq = useDebounced(q, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "15" });
      if (tab) qs.set("status", tab);
      if (type) qs.set("type", type);
      if (dq) qs.set("q", dq);
      const r = await fetch(`/api/reports?${qs}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
    } catch (e: any) { add({ type: "error", message: e.message || "تعذّر تحميل التقارير" }); } finally { setLoading(false); }
  }, [tab, type, dq, page, add]);
  useEffect(() => { void load(); }, [load]);

  const counts = data?.counts ?? {};
  const canCreate = !!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user.roleKey);
  const allCount = Object.values(counts).reduce((a: number, b: any) => a + Number(b), 0);

  return (
    <div className="space-y-5">
      <PageHeader icon={BarChart3} title="التقارير" subtitle="تقارير الزيارات والإدارة والجودة بمسار اعتماد واضح، وتصدير PDF وExcel وCSV مع رمز تحقق QR"
        actions={canCreate ? <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> إنشاء تقرير</button> : undefined} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs<Tab> value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[
          { key: "", label: "الكل", count: allCount }, { key: "DRAFT", label: "مسودات", count: counts.DRAFT ?? 0 }, { key: "UNDER_REVIEW", label: "قيد المراجعة", count: counts.UNDER_REVIEW ?? 0 },
          { key: "APPROVED", label: "معتمدة", count: counts.APPROVED ?? 0 }, { key: "REJECTED", label: "مرفوضة", count: counts.REJECTED ?? 0 },
        ]} />
        <div className="flex gap-2">
          <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="input pr-9 !py-2 w-52" placeholder="بحث بالرقم أو العنوان" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <select className="input !py-2 w-44" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">كل الأنواع</option>{Object.entries(data?.types ?? {}).filter(([k]) => k !== "SCHOOL_EVALUATION").map(([k, v]: any) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50/60 text-gray-500">{["الرقم", "التقرير", "النوع", "المدرسة", "الحالة", "التاريخ", ""].map((h, i) => <th key={i} className="px-4 py-3 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <LoadingRows cols={7} rows={5} /> : (data?.reports ?? []).map((r: any, i: number) => (
                <motion.tr key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="border-b border-gray-50 hover:bg-turquoise-soft/25">
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-600">{r.number}</td>
                  <td className="max-w-[280px] px-4 py-3"><Link href={`/reports/${r.id}`} className="font-semibold text-navy hover:text-turquoise hover:underline">{r.title}</Link><p className="text-[11px] text-gray-400">{r.generated_by_name}</p></td>
                  <td className="px-4 py-3 text-gray-600">{data?.types?.[r.type] ?? r.type}</td>
                  <td className="px-4 py-3 text-gray-600">{r.school_name ?? r.directorate_name ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge map={REPORT_STATUS} value={r.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <a className="btn btn-ghost btn-sm !px-2" title="PDF" href={`/api/reports/${r.id}/export?format=pdf`}><Download className="h-3.5 w-3.5" /></a>
                    <a className="btn btn-ghost btn-sm !px-2" title="Excel" href={`/api/reports/${r.id}/export?format=xlsx`}><FileSpreadsheet className="h-3.5 w-3.5" /></a>
                    <a className="btn btn-ghost btn-sm !px-2" title="CSV" href={`/api/reports/${r.id}/export?format=csv`}><FileText className="h-3.5 w-3.5" /></a>
                  </div></td>
                </motion.tr>
              ))}
              {!loading && (data?.reports ?? []).length === 0 && <tr><td colSpan={7}><EmptyState icon={FileText} title="لا تقارير" description="أنشئ تقريراً من بيانات الزيارات والمدارس الفعلية." action={canCreate ? <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>إنشاء تقرير</button> : undefined} /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-3"><Pagination page={page} totalPages={data?.totalPages ?? 1} total={data?.total} onPage={setPage} /></div>
      </div>

      <CreateReportModal open={createOpen} onClose={() => setCreateOpen(false)} presetVisitId={sp.get("visitId") ?? ""} topics={data?.topics ?? {}}
        onCreated={(id) => { setCreateOpen(false); router.push(`/reports/${id}`); }} />
    </div>
  );
}

function CreateReportModal({ open, onClose, onCreated, presetVisitId, topics }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; presetVisitId: string; topics: Record<string, string> }) {
  const { user } = useSession();
  const { add } = useToast();
  const [type, setType] = useState<string>("");
  const [f, setF] = useState<any>({});
  const [visits, setVisits] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setType(presetVisitId ? "VISIT_DAILY" : "");
    setF({ visitId: presetVisitId, date: today, period: "month", topic: "safety" });
    fetch("/api/visits?limit=100", { credentials: "include" }).then((r) => (r.ok ? r.json() : { visits: [] })).then((d) => setVisits((d.visits ?? []).filter((v: any) => v.status !== "CANCELLED"))).catch(() => {});
    fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => (r.ok ? r.json() : { schools: [] })).then((d) => setSchools(d.schools ?? [])).catch(() => {});
  }, [open, presetVisitId, today]);

  const submit = async () => {
    setBusy(true);
    try {
      const body: any = { type, title: f.title || undefined };
      if (type === "VISIT_DAILY") body.visitId = f.visitId;
      if (type === "DIRECTORATE_DAILY") body.date = f.date;
      if (type === "PERIODIC") { body.date = f.date; body.period = f.period; }
      if (type === "QUALITY_DETAILED") { body.schoolId = f.schoolId || undefined; }
      if (type === "SPECIAL") { body.topic = f.topic; body.schoolId = f.schoolId || undefined; body.from = f.from || undefined; body.to = f.to || undefined; }
      const r = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onCreated(d.id);
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };

  const cards = TYPE_CARDS.filter((c) => c.roles.includes(user?.roleKey ?? ""));
  const valid = type === "VISIT_DAILY" ? !!f.visitId : type === "QUALITY_DETAILED" ? !!(f.schoolId || user?.schoolId) : !!type;

  return (
    <Modal open={open} onClose={onClose} title="إنشاء تقرير" description="يُبنى التقرير من سجلات المنصة الفعلية ويُثبَّت كمسودة. الاعتماد بيد المخوَّلين فقط." width="lg">
      <div className="space-y-5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {cards.map((c) => (
            <button key={c.type} onClick={() => setType(c.type)} className={`flex items-start gap-3 rounded-2xl border p-3.5 text-right transition ${type === c.type ? "border-turquoise bg-turquoise-soft/50 ring-2 ring-turquoise/30" : "border-gray-200 hover:border-turquoise/50"}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-gold-bright"><c.icon className="h-5 w-5" /></span>
              <span><span className="block font-heading font-bold text-navy">{c.title}</span><span className="mt-0.5 block text-[12px] leading-relaxed text-gray-600">{c.desc}</span></span>
            </button>
          ))}
        </div>

        {type && (
          <div className="grid gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-2 animate-fade-up">
            {type === "VISIT_DAILY" && (
              <div className="sm:col-span-2"><label className="label">الزيارة</label>
                <select className="input" value={f.visitId ?? ""} onChange={(e) => setF({ ...f, visitId: e.target.value })}><option value="">اختر زيارة…</option>{visits.map((v) => <option key={v.id} value={v.id}>{v.school_name} — {VISIT_STATUS[v.status]?.label} — {fmtDate(v.visit_date)}</option>)}</select></div>
            )}
            {(type === "DIRECTORATE_DAILY" || type === "PERIODIC") && (
              <div><label className="label">{type === "PERIODIC" ? "تاريخ ضمن الفترة" : "تاريخ اليوم"}</label><input type="date" className="input" value={f.date ?? ""} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            )}
            {type === "PERIODIC" && (
              <div><label className="label">نوع الفترة</label><select className="input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="week">أسبوعي</option><option value="month">شهري</option><option value="quarter">فصلي</option><option value="year">سنوي</option></select></div>
            )}
            {(type === "QUALITY_DETAILED" || type === "SPECIAL") && !["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user?.roleKey ?? "") && (
              <div className={type === "QUALITY_DETAILED" ? "sm:col-span-2" : ""}><label className="label">المدرسة{type === "SPECIAL" ? " (اتركها فارغة لكل المدارس)" : ""}</label>
                <select className="input" value={f.schoolId ?? ""} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">{type === "SPECIAL" ? "كل المدارس ضمن النطاق" : "اختر…"}</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            )}
            {type === "SPECIAL" && (
              <>
                <div className="sm:col-span-2"><label className="label">الموضوع</label><select className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{Object.entries(topics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="label">من</label><input type="date" className="input" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
                <div><label className="label">إلى</label><input type="date" className="input" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
                <p className="sm:col-span-2 flex items-start gap-1.5 text-[11.5px] text-gray-500"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />التقارير الخاصة مساندة ومنفصلة عن التقييم الرسمي، وتعتمد على بيانات موثَّقة؛ عند غيابها يُذكر ذلك ولا تُحتسب نسب.</p>
              </>
            )}
            <div className="sm:col-span-2"><label className="label">عنوان مخصّص (اختياري)</label><input className="input" maxLength={200} value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary btn-sm" disabled={!valid || busy} onClick={submit}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} توليد التقرير</button>
        </div>
      </div>
    </Modal>
  );
}
