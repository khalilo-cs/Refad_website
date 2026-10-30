"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, MapPin, UserPlus } from "lucide-react";
import { PhoneActions } from "@/components/ui/contact";
import { QuickLocationModal } from "@/components/schools/quick-location-modal";
import { useToast } from "@/components/providers";

type Item = { id: string; name: string; code?: string; principalName?: string | null; phone?: string | null; login?: string; role?: string };
type Group = { count: number; items: Item[] };
type Data = {
  totals: { schools: number; users: number };
  completeness: Record<"location" | "phone" | "principal" | "officialCode" | "account", number>;
  schools: Record<"noLocation" | "noPhone" | "badPhone" | "noPrincipal" | "tempCode" | "noAccount", Group>;
  users: Record<"neverLoggedIn" | "noPhone" | "mustChange" | "inactive", Group>;
};

const BARS: [keyof Data["completeness"], string][] = [
  ["location", "مواقع محدَّدة على الخريطة"], ["phone", "أرقام هواتف صالحة"], ["principal", "أسماء المدراء"], ["officialCode", "رموز مدرسية رسمية"], ["account", "حسابات مدراء فعّالة"],
];
const SCHOOL_GROUPS: [keyof Data["schools"], string][] = [
  ["noLocation", "بلا موقع"], ["noPhone", "بلا هاتف"], ["badPhone", "هاتف غير صالح"], ["noPrincipal", "بلا اسم مدير"], ["tempCode", "رمز مؤقت (TEMP)"], ["noAccount", "بلا حساب مدير"],
];
const USER_GROUPS: [keyof Data["users"], string][] = [
  ["neverLoggedIn", "لم يدخلوا بعد"], ["mustChange", "بانتظار تغيير كلمة المرور"], ["noPhone", "بلا هاتف"], ["inactive", "معطّلون / مقفلون"],
];

/** مركز التحكم: يُظهر ما ينقص بيانات المدارس والحسابات ويتيح المعالجة السريعة. */
export default function ControlCenter() {
  const { add } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<{ kind: "schools" | "users"; key: string } | null>(null);
  const [locFor, setLocFor] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/data-quality", { credentials: "include" });
    const d = await r.json();
    if (!r.ok) return add({ type: "error", message: d.message || "تعذّر التحميل" });
    setData(d);
  }, [add]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="skeleton h-72 rounded-2xl" />;
  const group = open ? (open.kind === "schools" ? data.schools[open.key as keyof Data["schools"]] : data.users[open.key as keyof Data["users"]]) : null;

  const card = (kind: "schools" | "users", key: string, label: string, g: Group) => (
    <button key={key} type="button" onClick={() => setOpen(open?.key === key && open.kind === kind ? null : { kind, key })}
      className={`card p-3 text-start transition hover:shadow-md ${open?.key === key && open.kind === kind ? "ring-2 ring-turquoise" : ""}`}>
      <p className="text-[11.5px] text-gray-600">{label}</p>
      <p className={`font-heading text-2xl font-bold ${g.count ? "text-warning" : "text-success"}`}>{g.count}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h3 className="mb-3 font-heading text-[15px] font-bold text-navy">اكتمال بيانات المدارس ({data.totals.schools} مدرسة نشطة)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {BARS.map(([k, label]) => (
            <div key={k}>
              <div className="mb-1 flex items-center justify-between text-[12px]"><span className="text-gray-600">{label}</span><b className="text-navy">{data.completeness[k]}%</b></div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={data.completeness[k]} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                <div className={`h-full rounded-full ${data.completeness[k] >= 90 ? "bg-success" : data.completeness[k] >= 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${data.completeness[k]}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-heading text-[14px] font-bold text-navy">مدارس تحتاج استكمالاً</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{SCHOOL_GROUPS.map(([k, l]) => card("schools", k, l, data.schools[k]))}</div>
      </section>
      <section>
        <h3 className="mb-2 font-heading text-[14px] font-bold text-navy">حسابات المستخدمين ({data.totals.users})</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{USER_GROUPS.map(([k, l]) => card("users", k, l, data.users[k]))}</div>
      </section>

      {open && group && (
        <section className="card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-[14px] font-bold text-navy">{group.count} عنصر {group.count > group.items.length ? `(يُعرض أول ${group.items.length})` : ""}</h3>
            {open.kind === "schools" && open.key === "noAccount" && <Link href="/users" className="btn btn-primary btn-sm"><UserPlus className="h-3.5 w-3.5" /> إنشاء حسابات المدراء</Link>}
            {open.kind === "users" && <Link href="/users" className="btn btn-ghost btn-sm">فتح إدارة المستخدمين</Link>}
          </div>
          {group.items.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" /> لا شيء ناقص هنا.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {group.items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-navy">{it.name}</p>
                    <p className="truncate text-[11.5px] text-gray-500">{it.code ?? it.login}{it.principalName ? ` · ${it.principalName}` : ""}{it.role ? ` · ${it.role}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {open.kind === "schools" && it.phone && <PhoneActions phone={it.phone} name={it.principalName ?? undefined} />}
                    {open.kind === "schools" && (
                      <>
                        {open.key === "noLocation" && <button className="btn btn-primary btn-sm" onClick={() => setLocFor(it)}><MapPin className="h-3.5 w-3.5" /> حدّد الموقع</button>}
                        <Link className="btn btn-ghost btn-sm" href={`/schools/${it.id}?tab=contacts`}>{open.key === "tempCode" ? "افتح لتعديل الرمز" : "فتح المدرسة"}</Link>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!open && <p className="flex items-center gap-2 text-[12px] text-gray-500"><AlertTriangle className="h-3.5 w-3.5" /> اضغط على أي بطاقة لعرض العناصر الناقصة ومعالجتها.</p>}

      {locFor && <QuickLocationModal school={{ id: locFor.id, name: locFor.name }} onClose={() => setLocFor(null)} onSaved={() => { setLocFor(null); void load(); }} />}
    </div>
  );
}
