"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { SCORE_COLOR, fmtPercent, scoreTone } from "@/lib/labels";

const SchoolsMap = dynamic(() => import("@/components/maps/schools-map"), { ssr: false, loading: () => <div className="skeleton h-[560px] rounded-2xl" /> });

export default function MapPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/schools/map", { credentials: "include" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.message); setData(d); })
      .catch((e) => setError(e.message || "تعذّر التحميل"));
  }, []);

  const dirs = useMemo(() => [...new Map((data?.schools ?? []).map((s: any) => [s.directorate_id, s.directorate])).entries()], [data]);
  const filtered = useMemo(() => (data?.schools ?? []).filter((s: any) => (!dir || s.directorate_id === dir) && (!q || s.name.includes(q) || s.code.toLowerCase().includes(q.toLowerCase()))), [data, q, dir]);

  return (
    <div className="space-y-5">
      <PageHeader icon={MapPin} title="خريطة المدارس" subtitle="تُعرض المدارس التي أدخلت لها الجهات المعتمدة إحداثيات فقط. لون النقطة يعبّر عن آخر نسبة تحقق." />
      {error && <Alert tone="danger">{error}</Alert>}
      {data && data.withoutCoordinates > 0 && <Alert tone="info">{data.withoutCoordinates} مدرسة بلا إحداثيات من أصل {data.total} ولا تظهر على الخريطة. أضف إحداثياتها من صفحة المدرسة أو بالاستيراد.</Alert>}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="card flex max-h-[600px] flex-col overflow-hidden lg:order-2">
          <div className="space-y-2 border-b border-gray-100 p-3">
            <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="input pr-9" placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="input" value={dir} onChange={(e) => setDir(e.target.value)}><option value="">كل المديريات</option>{dirs.map(([id, name]: any) => <option key={id} value={id}>{name}</option>)}</select>
          </div>
          <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
            {filtered.length === 0 && <li><EmptyState title="لا نتائج" /></li>}
            {filtered.map((s: any) => (
              <li key={s.id}>
                <button onClick={() => setFocus(s.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-right transition hover:bg-gray-50">
                  <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: SCORE_COLOR[scoreTone(s.percent)] }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-navy">{s.name}</span><span className="block text-[11px] text-gray-400">{s.directorate}</span></span>
                  <span className="font-mono text-[12px] font-bold" style={{ color: SCORE_COLOR[scoreTone(s.percent)] }}>{fmtPercent(s.percent, 0)}</span>
                </button>
                <Link href={`/schools/${s.id}`} className="block px-3 pb-2 text-[11.5px] font-semibold text-turquoise hover:underline">فتح صفحة المدرسة</Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-3 lg:order-1">
          {data ? (filtered.length ? <SchoolsMap schools={filtered} height={560} focusId={focus} /> : <div className="card"><EmptyState icon={MapPin} title="لا مدارس بإحداثيات" /></div>) : <div className="skeleton h-[560px] rounded-2xl" />}
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-gray-600">
            {[["success", "75% فأكثر"], ["gold", "50–74%"], ["warning", "25–49%"], ["danger", "أقل من 25%"], ["neutral", "لم تُقيَّم"]].map(([t, l]) => (
              <span key={t} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: SCORE_COLOR[t] }} />{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
