"use client";

import { useEffect, useMemo, useState } from "react";
import { BookUser, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PhoneActions, LocationActions } from "@/components/ui/contact";
import { useToast } from "@/components/providers";
import { downloadCsv } from "@/lib/csv";
import { downloadVcf, type VCardEntry } from "@/lib/vcard";

type Row = {
  id: string; name: string; code: string; principal_name: string | null; contact_phone: string | null; has_whatsapp: number;
  latitude: number | null; longitude: number | null; directorate_name: string;
  extra: { role: string; name: string; phone: string | null; hasWhatsapp: boolean }[];
};

/** دليل الاتصال: كل مدرسة مع مديرها وهاتفه وأزرار الاتصال والواتساب والتوجيه، مع تصدير CSV وجهات اتصال للهاتف. */
export default function DirectoryPage() {
  const { add } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"" | "nophone" | "noloc">("");

  useEffect(() => {
    fetch("/api/directory", { credentials: "include" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.message); setRows(d.schools); })
      .catch((e) => add({ type: "error", message: e.message || "تعذّر تحميل الدليل" }));
  }, [add]);

  const shown = useMemo(() => (rows ?? []).filter((s) => {
    if (only === "nophone" && s.contact_phone) return false;
    if (only === "noloc" && s.latitude != null) return false;
    const t = q.trim().toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || s.code.toLowerCase().includes(t) || (s.principal_name ?? "").toLowerCase().includes(t) || (s.contact_phone ?? "").includes(t.replace(/\s/g, ""));
  }), [rows, q, only]);

  const exportCsv = () => downloadCsv("دليل-الاتصال.csv", [
    ["المدرسة", "الرمز", "المديرية", "المدير", "الهاتف", "خط العرض", "خط الطول"],
    ...shown.map((s) => [s.name, s.code, s.directorate_name, s.principal_name ?? "", s.contact_phone ?? "", s.latitude ?? "", s.longitude ?? ""]),
  ]);
  const exportVcf = () => {
    const entries: VCardEntry[] = shown.flatMap((s) => [
      { name: `${s.principal_name || "مدير"} — ${s.name}`, org: s.name, title: "مدير المدرسة", phone: s.contact_phone },
      ...s.extra.map((c) => ({ name: `${c.name} — ${s.name}`, org: s.name, title: c.role, phone: c.phone })),
    ]);
    downloadVcf("مدارس-الجراحي.vcf", entries);
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={BookUser} title="دليل الاتصال" subtitle="اتصل أو راسل مدراء المدارس عبر واتساب، أو اطلب التوجيه إلى المدرسة بضغطة واحدة"
        actions={<div className="flex gap-2"><button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!shown.length}><Download className="h-4 w-4" /> CSV</button><button className="btn btn-ghost btn-sm" onClick={exportVcf} disabled={!shown.length}><Download className="h-4 w-4" /> جهات اتصال للهاتف</button></div>} />
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className="input ps-9" placeholder="ابحث: مدرسة، مدير، رمز، رقم…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </div>
          <select className="input w-auto" value={only} onChange={(e) => setOnly(e.target.value as any)} aria-label="تصفية">
            <option value="">الكل</option><option value="nophone">بلا هاتف</option><option value="noloc">بلا موقع</option>
          </select>
          <span className="ms-auto text-[12px] text-gray-500">{shown.length} مدرسة</span>
        </div>
        {rows === null ? <div className="skeleton h-64 rounded-xl" /> : shown.length === 0 ? <p className="py-8 text-center text-gray-400">لا نتائج</p> : (
          <ul className="divide-y divide-gray-100">
            {shown.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-navy">{s.name}</p>
                    <p className="truncate text-[11.5px] text-gray-500">{s.principal_name || "بلا اسم مدير"} · {s.code} · {s.directorate_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <PhoneActions phone={s.contact_phone} hasWhatsapp={s.has_whatsapp !== 0} name={s.principal_name ?? s.name} />
                    <LocationActions lat={s.latitude} lng={s.longitude} label />
                  </div>
                </div>
                {s.extra.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-s-2 border-gray-100 ps-3">
                    {s.extra.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <span className="text-gray-600">{c.name} <span className="text-gray-400">· {c.role}</span></span>
                        <PhoneActions phone={c.phone} hasWhatsapp={c.hasWhatsapp} name={c.name} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
