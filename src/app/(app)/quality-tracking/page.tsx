"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Download, Loader2, Printer, Search, ShieldCheck } from "lucide-react";
import { Modal, PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { downloadCsv } from "@/lib/csv";
import { fmtDate } from "@/lib/labels";

type Row = {
  id: string; name: string; code: string; principalName: string | null; directorate: string; status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
  submittedAt: string | null; updatedAt: string | null; rated: number; total: number; percent: number | null;
  weak: number; needsPlan: number; planned: number; inProgress: number; improved: number; verified: number; overdue: number;
};
type Data = { year: string; totals: Record<string, number>; schools: Row[] };

const STATUS_LABEL = { NOT_STARTED: ["لم تبدأ", "bg-gray-100 text-gray-500"], DRAFT: ["قيد التعبئة", "bg-warning/10 text-warning"], SUBMITTED: ["مُرسلة", "bg-success/10 text-success"] } as const;
type Focus = "" | "improved" | "needsPlan" | "overdue" | "notStarted" | "verified";

/** لوحة متابعة الإدارة: أين الضعف في كل مدرسة، وكيف تعالجه، وما ينتظر الاعتماد، ومن يستحق التكريم. */
export default function QualityTrackingPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [year, setYear] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<Focus>("");
  const [cert, setCert] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/self-assessment/overview${year ? `?year=${year}` : ""}`, { credentials: "include" });
    const d = await r.json();
    if (!r.ok) return add({ type: "error", message: d.message });
    setData(d);
    if (!year) setYear(d.year);
  }, [year, add]);
  useEffect(() => { void load(); }, [load]);

  const years = useMemo(() => {
    const y = Number((data?.year ?? "2025-2026").slice(0, 4));
    return [0, 1, 2, 3].map((k) => `${y - k}-${y - k + 1}`);
  }, [data?.year]);

  const rows = useMemo(() => (data?.schools ?? []).filter((s) => {
    const t = q.trim();
    if (t && !s.name.includes(t) && !s.code.toLowerCase().includes(t.toLowerCase()) && !(s.principalName ?? "").includes(t)) return false;
    if (focus === "improved") return s.improved > 0;
    if (focus === "needsPlan") return s.needsPlan > 0;
    if (focus === "overdue") return s.overdue > 0;
    if (focus === "notStarted") return s.status === "NOT_STARTED";
    if (focus === "verified") return s.verified > 0;
    return true;
  }).sort((a, b) => b.improved - a.improved || b.needsPlan - a.needsPlan || a.name.localeCompare(b.name, "ar")), [data, q, focus]);

  const exportCsv = () => downloadCsv(`متابعة-الجودة-${data?.year}.csv`, [
    ["المدرسة", "الرمز", "المدير", "الحالة", "المقيَّم", "نسبة التحقق %", "نقاط الضعف", "بلا خطة", "قيد المعالجة", "بانتظار الاعتماد", "تحسّن معتمد", "متأخر"],
    ...rows.map((s) => [s.name, s.code, s.principalName ?? "", STATUS_LABEL[s.status][0], `${s.rated}/${s.total}`, s.percent ?? "", s.weak, s.needsPlan, s.planned + s.inProgress, s.improved, s.verified, s.overdue]),
  ]);

  const t = data?.totals;
  const cards: [string, number | undefined, string, Focus][] = [
    ["مدارس أرسلت الاستمارة", t?.submitted, "text-navy", ""],
    ["لم تبدأ", t ? t.schools - t.started : undefined, "text-gray-600", "notStarted"],
    ["نقاط ضعف بلا خطة", t?.needsPlan, "text-danger", "needsPlan"],
    ["قيد المعالجة", t?.inProgress, "text-sky-700", ""],
    ["تحسّن بانتظار اعتمادك", t?.improved, "text-emerald-700", "improved"],
    ["تحسّن معتمد", t?.verified, "text-success", "verified"],
    ["خطط متأخرة", t?.overdue, "text-warning", "overdue"],
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={ShieldCheck} title="متابعة الجودة والتحسين" subtitle="نقاط ضعف كل مدرسة كما حدّدها مديرها، وخطط معالجتها، وما تحسّن فعلاً — أساس التكريم الدقيق"
        actions={<div className="flex gap-2">
          <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)} aria-label="العام الدراسي">{years.map((y) => <option key={y}>{y}</option>)}</select>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> CSV</button>
        </div>} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map(([l, v, c, f]) => (
          <button key={l} type="button" onClick={() => setFocus(focus === f ? "" : f)} className={`card p-3 text-start transition hover:shadow-md ${f && focus === f ? "ring-2 ring-turquoise" : ""}`}>
            <p className="text-[11px] text-gray-600">{l}</p>
            <p className={`font-heading text-xl font-bold ${c}`}>{v ?? "—"}</p>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className="input ps-9" placeholder="ابحث: مدرسة، رمز، مدير…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </div>
          {focus && <button className="btn btn-ghost btn-sm" onClick={() => setFocus("")}>إلغاء التصفية</button>}
          <span className="ms-auto text-[12px] text-gray-500">{rows.length} مدرسة</span>
        </div>
        {!data ? <div className="skeleton m-4 h-48 rounded-xl" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  {["المدرسة", "الحالة", "اكتمال التقييم", "التحقق", "ضعف", "بلا خطة", "معالجة", "بانتظار الاعتماد", "معتمد", ""].map((h) => <th key={h} className="px-3 py-2.5 text-right font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const pct = s.total ? Math.round((s.rated / s.total) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-3 py-2.5"><p className="font-medium text-navy">{s.name}</p><p className="text-[11px] text-gray-500">{s.code}{s.principalName ? ` · ${s.principalName}` : ""}</p></td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[s.status][1]}`}>{STATUS_LABEL[s.status][0]}</span>{s.submittedAt && <p className="mt-0.5 text-[10.5px] text-gray-400">{fmtDate(s.submittedAt)}</p>}</td>
                      <td className="min-w-[110px] px-3 py-2.5"><div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-turquoise" style={{ width: `${pct}%` }} /></div><p className="mt-0.5 text-[10.5px] text-gray-500">{s.rated}/{s.total}</p></td>
                      <td className="px-3 py-2.5 font-semibold text-navy">{s.percent != null ? `${s.percent}%` : "—"}</td>
                      <Num v={s.weak} c="text-danger" />
                      <Num v={s.needsPlan} c="text-danger" strong />
                      <Num v={s.planned + s.inProgress} c="text-sky-700" extra={s.overdue ? `${s.overdue} متأخر` : ""} />
                      <Num v={s.improved} c="text-emerald-700" strong />
                      <Num v={s.verified} c="text-success" />
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Link className="btn btn-ghost btn-sm" href={`/self-assessment?schoolId=${s.id}&year=${data.year}`}>فتح</Link>
                          {s.status === "SUBMITTED" && <button className="btn btn-ghost btn-sm" onClick={() => setCert(s)} title="شهادة تقدير مبنية على البيانات"><Award className="h-3.5 w-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-gray-400">لا مدارس مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {cert && data && <CertificateModal school={cert} year={data.year} canIssueRole={!!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(user.roleKey)} onClose={() => setCert(null)} />}
    </div>
  );
}

function Num({ v, c, strong, extra }: { v: number; c: string; strong?: boolean; extra?: string }) {
  return (
    <td className="px-3 py-2.5">
      <span className={v ? `${c} ${strong ? "font-bold" : "font-semibold"}` : "text-gray-300"}>{v}</span>
      {extra && <p className="text-[10.5px] text-warning">{extra}</p>}
    </td>
  );
}

type Draft = { eligible: boolean; reason?: string; title: string; body: string; details: { schoolName: string; year: string; percent: number | null; achievedCriteria: { code: string; title: string; percent: number | null }[]; improvements: { code: string; title: string }[] } };
type Issued = { id: string; code: string; title: string; body: string; academic_year: string; issued_at: string; revoked_at: string | null; issued_by: string | null };

function CertificateModal({ school, year, canIssueRole, onClose }: { school: Row; year: string; canIssueRole: boolean; onClose: () => void }) {
  const { add } = useToast();
  const [d, setD] = useState<{ draft: Draft; issued: Issued[]; canIssue: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [print, setPrint] = useState<{ title: string; body: string; code: string; issuedAt: string; school: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/certificates?schoolId=${school.id}&year=${year}`, { credentials: "include" });
    const j = await r.json();
    if (!r.ok) return add({ type: "error", message: j.message });
    setD(j);
  }, [school.id, year, add]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!print) return;
    const t = setTimeout(() => { window.print(); setPrint(null); }, 300);
    return () => clearTimeout(t);
  }, [print]);

  const issue = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/certificates", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: school.id, year }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      add({ type: "success", message: `صدرت الشهادة برمز ${j.certificate.code}` });
      await load();
      setPrint({ title: j.certificate.title, body: j.certificate.body, code: j.certificate.code, issuedAt: new Date().toISOString(), school: school.name });
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="شهادة تقدير مبنية على البيانات" description={`${school.name} — \u2066${year}\u2069`} width="lg">
      {!d ? <div className="skeleton h-40 rounded-xl" /> : (
        <div className="space-y-4">
          {d.draft.eligible ? (
            <div className="rounded-xl border-2 border-double border-gold p-5 text-center">
              <p className="font-heading text-xl font-bold text-gold">{d.draft.title}</p>
              <p className="mt-2 text-[13px] text-gray-600">يتقدّم قسم الجودة والاعتماد المدرسي بالشكر والتقدير إلى</p>
              <p className="mt-1 font-heading text-lg font-bold text-navy">{school.name}</p>
              <p className="mt-3 text-[13.5px] leading-loose text-gray-800">{d.draft.body}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 p-4 text-center text-[13px] text-gray-600">لا تستحق شهادة بعد: {d.draft.reason}</p>
          )}
          {d.draft.details.achievedCriteria.length > 0 && (
            <div className="text-[12.5px]"><b className="text-navy">معايير محقَّقة:</b> {d.draft.details.achievedCriteria.map((c) => `${c.code} ${c.title} (${c.percent}%)`).join(" · ")}</div>
          )}
          {d.draft.details.improvements.length > 0 && (
            <div className="text-[12.5px]"><b className="text-navy">تحسينات معتمدة ({d.draft.details.improvements.length}):</b> {d.draft.details.improvements.map((i) => i.code).join("، ")}</div>
          )}
          {d.issued.length > 0 && (
            <div>
              <p className="mb-1 text-[12.5px] font-semibold text-navy">شهادات صادرة</p>
              <ul className="divide-y divide-gray-100 text-[12px]">
                {d.issued.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span><bdi dir="ltr" className="font-mono">{c.code}</bdi> · <bdi dir="ltr">{c.academic_year}</bdi> · {fmtDate(c.issued_at)}{c.revoked_at ? " · ملغاة" : ""}</span>
                    {!c.revoked_at && <button className="btn btn-ghost btn-sm" onClick={() => setPrint({ title: c.title, body: c.body, code: c.code, issuedAt: c.issued_at, school: school.name })}><Printer className="h-3.5 w-3.5" /> طباعة</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>إغلاق</button>
            {canIssueRole && d.canIssue && d.draft.eligible && <button className="btn btn-primary btn-sm" disabled={busy} onClick={issue}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}<Award className="h-4 w-4" /> إصدار وطباعة</button>}
          </div>
        </div>
      )}
      {print && <PrintableCertificate {...print} />}
    </Modal>
  );
}

/** نسخة الطباعة: بلا ختم ولا توقيع مطبوع، خانات التوقيع فارغة، ورمز تحقق عام. */
function PrintableCertificate({ title, body, code, issuedAt, school }: { title: string; body: string; code: string; issuedAt: string; school: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="certificate hidden print:block">
      <div className="mx-auto flex min-h-[180mm] max-w-[260mm] flex-col items-center justify-between border-[6px] border-double border-gold p-12 text-center text-navy">
        <div>
          <p className="text-[13px] text-gray-600">إدارة التربية والتعليم — مديرية الجراحي · قسم الجودة والاعتماد المدرسي</p>
          <h1 className="mt-8 font-heading text-5xl font-bold text-gold">{title.split("—")[0].trim()}</h1>
          <p className="mt-10 text-xl">يتقدّم قسم الجودة والاعتماد المدرسي بالشكر والتقدير إلى</p>
          <p className="mt-4 font-heading text-4xl font-bold">{school}</p>
          <p className="mx-auto mt-6 max-w-[220mm] text-xl leading-loose">{body}</p>
        </div>
        <div className="mt-12 grid w-full grid-cols-2 gap-16 text-[14px]">
          <div><div className="mx-auto h-14 w-48 border-b border-gray-400" /><p className="mt-2">رئيس قسم الجودة والاعتماد المدرسي</p></div>
          <div><div className="mx-auto h-14 w-48 border-b border-gray-400" /><p className="mt-2">مدير إدارة التربية والتعليم</p></div>
        </div>
        <p className="mt-6 text-[11px] text-gray-500">رمز التحقق: <b dir="ltr" className="font-mono">{code}</b> — تحقّق من صحتها: <bdi dir="ltr">{origin}/verify?code={code}</bdi> · {new Date(issuedAt).toLocaleDateString("ar-YE")}</p>
      </div>
    </div>
  );
}
