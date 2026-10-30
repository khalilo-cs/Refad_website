"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, MessageCircle, Phone } from "lucide-react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/providers";
import { downloadCsv } from "@/lib/csv";
import { credentialsMessage, telHref, whatsappHref } from "@/lib/phone";

type Pending = { id: string; name: string; code: string; principal_name: string | null; contact_phone: string | null };
type Created = { schoolId: string; school: string; name: string; login: string; password: string; phone: string | null; hasWhatsapp: boolean };

/** إنشاء حسابات مدراء المدارس على دفعات (≤20)، مع جدول بيانات الدخول مرة واحدة وتصدير CSV. */
export function BulkPrincipalsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { add } = useToast();
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [max, setMax] = useState(20);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created[]>([]);
  const [skipped, setSkipped] = useState<{ school: string; reason: string }[]>([]);

  const load = async () => {
    const r = await fetch("/api/users/bulk-principals", { credentials: "include" });
    const d = await r.json();
    if (!r.ok) return add({ type: "error", message: d.message });
    setPending(d.schools);
    setMax(d.maxBatch);
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (pending ?? []).filter((s) => !filter || s.name.includes(filter) || s.code.toLowerCase().includes(filter.toLowerCase())), [pending, filter]);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else if (n.size < max) n.add(id); return n; });

  const run = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/users/bulk-principals", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolIds: [...sel] }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      setCreated((p) => [...p, ...d.created]);
      setSkipped((p) => [...p, ...d.skipped]);
      setSel(new Set());
      onDone();
      await load();
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر الإنشاء" });
    } finally {
      setBusy(false);
    }
  };

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  return (
    <Modal open onClose={onClose} title="إنشاء حسابات مدراء المدارس" description={`اسم الدخول = رمز المدرسة، وكلمة المرور تُولَّد لكل حساب. حتى ${max} مدرسة في الدفعة.`} width="lg">
      <div className="space-y-3">
        {created.length > 0 && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-success">أُنشئ {created.length} حساباً — بيانات الدخول تظهر هنا فقط</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadCsv("بيانات-دخول-المدراء.csv", [["المدرسة", "الاسم", "اسم الدخول", "كلمة المرور المؤقتة", "الهاتف"], ...created.map((c) => [c.school, c.name, c.login, c.password, c.phone ?? ""])])}>
                <Download className="h-3.5 w-3.5" /> تنزيل CSV
              </button>
            </div>
            <p className="mb-2 text-[11.5px] text-warning">احفظ الملف أو أرسل البيانات الآن؛ لا يمكن عرض كلمات المرور لاحقاً (يمكنك إعادة تعيين أي كلمة من صفحة المستخدمين).</p>
            <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto text-[12px]">
              {created.map((c) => (
                <li key={c.login} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0"><b className="text-navy">{c.school}</b> · <bdi dir="ltr" className="font-mono">{c.login}</bdi> · <bdi dir="ltr" className="font-mono">{c.password}</bdi></span>
                  <span className="flex gap-1">
                    {c.phone && telHref(c.phone) && <a className="btn btn-ghost btn-sm" href={telHref(c.phone)!} aria-label="اتصال"><Phone className="h-3.5 w-3.5" /></a>}
                    {c.phone && c.hasWhatsapp && whatsappHref(c.phone, credentialsMessage({ name: c.name, loginUrl, login: c.login, password: c.password, mustChange: true })) && (
                      <a className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" aria-label="إرسال عبر واتساب" href={whatsappHref(c.phone, credentialsMessage({ name: c.name, loginUrl, login: c.login, password: c.password, mustChange: true }))!}><MessageCircle className="h-3.5 w-3.5" /></a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {skipped.length > 0 && <p className="text-[12px] text-gray-500">تُخطّي: {skipped.map((s) => `${s.school} (${s.reason})`).join("، ")}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <input className="input flex-1" placeholder="ابحث في المدارس التي بلا حساب مدير…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(new Set(shown.slice(0, max).map((s) => s.id)))}>تحديد أول {max}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>مسح</button>
        </div>
        {pending === null ? <div className="skeleton h-40 rounded-xl" /> : shown.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-gray-400">{pending.length === 0 ? "كل المدارس النشطة لها حساب مدير." : "لا نتائج."}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                  <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-navy">{s.name}</span>
                    <span className="block truncate text-[11.5px] text-gray-500">{s.code} · {s.principal_name || "بلا اسم مدير"}{s.contact_phone ? "" : " · بلا هاتف"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-[12px] text-gray-500">{sel.size} محددة من {pending?.length ?? 0}</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إغلاق</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || sel.size === 0} onClick={run}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إنشاء الحسابات</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
