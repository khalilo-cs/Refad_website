"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Lock, LogOut, Save, Settings, Settings2, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ConfirmDialog, Tabs } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

type Tab = "account" | "security" | "system";
type Rating = { id: string; key: string; label_ar: string; score: number; order_index: number; is_active: number };

export default function SettingsPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>(user?.mustChangePassword ? "security" : "account");
  useEffect(() => { if (user?.mustChangePassword) setTab("security"); }, [user?.mustChangePassword]);
  return (
    <div className="space-y-5">
      {user?.mustChangePassword && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>حسابك يتطلب تغيير كلمة المرور المؤقتة قبل متابعة استخدام المنصة. اختر كلمة مرور جديدة من قسم «تغيير كلمة المرور» أدناه.</span>
        </div>
      )}
      <PageHeader icon={Settings} title="الإعدادات" subtitle="بياناتي وأمان حسابي، ومقياس التقدير وصيغة الحساب المطبَّقة" />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: "account", label: "حسابي" }, { key: "security", label: "الأمان" }, { key: "system", label: "النظام" }]} />
      {tab === "account" && <AccountTab roleName={user?.role ?? ""} />}
      {tab === "security" && <SecurityTab />}
      {tab === "system" && <SystemTab />}
    </div>
  );
}

function AccountTab({ roleName }: { roleName: string }) {
  const { add } = useToast();
  const { refresh } = useSession();
  const [p, setP] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/account", { credentials: "include" });
    const d = await r.json();
    if (r.ok) { setP(d); setF({ name: d.profile.name, phone: d.profile.phone ?? "" }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/account", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    setBusy(false);
    add({ type: r.ok ? "success" : "error", message: d.message });
    if (r.ok) { void load(); void refresh(); }
  };
  if (!p) return <div className="skeleton h-48 rounded-2xl" />;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="card p-5 lg:col-span-2">
        <h2 className="mb-4 flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><UserRound className="h-4 w-4 text-turquoise" /> بياناتي</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">الاسم</label><input className="input" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">الهاتف</label><input className="input" dir="ltr" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label className="label">البريد (للدخول)</label><input className="input" dir="ltr" value={p.profile.email} disabled /></div>
          <div><label className="label">الدور</label><input className="input" value={roleName} disabled /></div>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn btn-primary btn-sm" disabled={busy || (f.name ?? "").trim().length < 3} onClick={save}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} حفظ</button></div>
      </div>
      <div className="card p-5">
        <h2 className="mb-3 font-heading text-[16px] font-bold text-navy">آخر عمليات الدخول</h2>
        <ul className="divide-y divide-gray-100 text-[12.5px]">
          {p.logins.map((l: any, i: number) => <li key={i} className="flex items-center justify-between py-2"><span className={`badge ${l.success ? "badge-success" : "badge-danger"}`}>{l.success ? "ناجح" : "فاشل"}</span><span className="font-mono text-[11px] text-gray-500">{l.ip}</span><span className="text-gray-500">{fmtDate(l.created_at, true)}</span></li>)}
          {p.logins.length === 0 && <li className="py-3 text-gray-400">لا سجلات.</li>}
        </ul>
        <p className="mt-3 text-[11.5px] text-gray-500">إن رأيت عملية لا تعرفها فغيّر كلمة مرورك فوراً وأبلغ مدير المنصة.</p>
      </div>
    </div>
  );
}

function SecurityTab() {
  const { add } = useToast();
  const { refresh } = useSession();
  const [p, setP] = useState<any>(null);
  const [pw, setPw] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [disable, setDisable] = useState(false);
  const [dis, setDis] = useState<any>({});
  const [revoke, setRevoke] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/account", { credentials: "include" });
    if (r.ok) setP(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (url: string, body: any, method = "POST") => {
    const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json();
    add({ type: r.ok ? "success" : "error", message: d.message ?? "" });
    return { ok: r.ok, d };
  };
  const changePw = async () => {
    setBusy(true);
    const { ok } = await post("/api/account", { currentPassword: pw.cur, newPassword: pw.next });
    setBusy(false);
    if (ok) { setPw({}); await refresh(); }
  };
  const startSetup = async () => {
    const { ok, d } = await post("/api/account/twofa", { action: "setup" });
    if (ok) setSetup({ ...d, qr: await QRCode.toDataURL(d.uri, { margin: 1, width: 200 }) });
  };
  const enable = async () => {
    const { ok } = await post("/api/account/twofa", { action: "enable", code });
    if (ok) { setSetup(null); setCode(""); void load(); }
  };
  const doDisable = async () => {
    const { ok } = await post("/api/account/twofa", { action: "disable", password: dis.password, code: dis.code });
    if (ok) { setDisable(false); setDis({}); void load(); }
  };

  if (!p) return <div className="skeleton h-48 rounded-2xl" />;
  const on = p.profile.two_factor_enabled;
  const strong = (pw.next ?? "").length >= 10;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><KeyRound className="h-4 w-4 text-turquoise" /> تغيير كلمة المرور</h2>
        <p className="mb-4 text-[12px] text-gray-500">10 أحرف على الأقل، تحتوي رقماً وحرفاً، وبعيدة عن الكلمات الشائعة. يُنهى الدخول على الأجهزة الأخرى بعد التغيير.</p>
        <div className="space-y-3">
          <div><label className="label">كلمة المرور الحالية</label><input type="password" autoComplete="current-password" className="input" dir="ltr" value={pw.cur ?? ""} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></div>
          <div><label className="label">كلمة المرور الجديدة</label><input type="password" autoComplete="new-password" className="input" dir="ltr" value={pw.next ?? ""} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full transition-all ${strong ? "bg-success" : "bg-warning"}`} style={{ width: `${Math.min(100, ((pw.next ?? "").length / 14) * 100)}%` }} /></div></div>
          <button className="btn btn-primary btn-sm" disabled={busy || !pw.cur || !strong} onClick={changePw}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} تغيير كلمة المرور</button>
        </div>
        <div className="mt-5 border-t border-gray-100 pt-4">
          <button className="btn btn-ghost btn-sm" onClick={() => setRevoke(true)}><LogOut className="h-3.5 w-3.5" /> إنهاء الجلسات على الأجهزة الأخرى</button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><Smartphone className="h-4 w-4 text-turquoise" /> المصادقة الثنائية</h2>
        <p className="mb-4 text-[12px] text-gray-500">طبقة حماية إضافية برمز من تطبيق المصادقة (Google Authenticator وما يماثله). موصى بها بشدة لحسابات الإدارة.</p>
        {on ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-[13px] font-semibold text-success"><ShieldCheck className="h-4 w-4" /> مفعَّلة على حسابك</p>
            <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDisable(true)}>تعطيل</button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-gray-50 p-4"><img src={setup.qr} alt="رمز QR للمصادقة" width={170} height={170} /><p className="text-[11.5px] text-gray-500">أو أدخل المفتاح يدوياً:</p><code dir="ltr" className="select-all rounded bg-white px-2 py-1 font-mono text-[12px] tracking-wider">{setup.secret}</code></div>
            <div><label className="label">الرمز الظاهر في التطبيق</label><input className="input text-center font-mono tracking-[0.4em]" dir="ltr" maxLength={6} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={code.length !== 6} onClick={enable}><CheckCircle2 className="h-3.5 w-3.5" /> تفعيل</button><button className="btn btn-ghost btn-sm" onClick={() => setSetup(null)}>إلغاء</button></div>
          </div>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={startSetup}><ShieldCheck className="h-3.5 w-3.5" /> بدء الإعداد</button>
        )}
      </div>

      <ConfirmDialog open={revoke} tone="primary" title="إنهاء الجلسات الأخرى" message="ستُسجَّل خروجك من كل الأجهزة عدا هذا الجهاز." confirmLabel="إنهاء" onConfirm={async () => { setRevoke(false); await post("/api/account", null, "DELETE"); }} onClose={() => setRevoke(false)} />
      <ConfirmDialog open={disable} title="تعطيل المصادقة الثنائية" message={<div className="space-y-2"><p>أدخل كلمة المرور ورمز التطبيق للتأكيد.</p><input type="password" className="input" dir="ltr" placeholder="كلمة المرور" value={dis.password ?? ""} onChange={(e) => setDis({ ...dis, password: e.target.value })} /><input className="input text-center font-mono" dir="ltr" maxLength={6} placeholder="000000" value={dis.code ?? ""} onChange={(e) => setDis({ ...dis, code: e.target.value.replace(/\D/g, "") })} /></div>} confirmLabel="تعطيل" onConfirm={doDisable} onClose={() => setDisable(false)} />
    </div>
  );
}

function SystemTab() {
  const { add } = useToast();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/settings", { credentials: "include" }).then((r) => r.json()).then((d) => { setRatings(d.ratingScale ?? []); setCanEdit(!!d.canEdit); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const saveRating = async (id: string, label_ar: string, score: number) => {
    setSaving(id);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ratingId: id, label_ar, score }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setSaving(null); }
  };
  const maxScore = Math.max(...ratings.map((r) => r.score), 0);
  return (
    <div className="space-y-5">
      {!canEdit && !loading && <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning-soft p-3 text-sm text-warning"><Lock className="h-4 w-4" /> العرض فقط — التعديل مقصور على مدير النظام.</div>}
      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2"><Settings2 className="h-4 w-4 text-turquoise" /><h2 className="font-heading font-bold text-navy">مقياس التقدير</h2></div>
        <p className="mb-4 text-xs text-gray-600">الدرجة العظمى الحالية: <span className="font-bold text-navy">{maxScore}</span> — تُستخدم في حساب نسبة تحقق كل معيار فرعي. هذه القيم الرقمية آلية حسابية مقترحة للمنصة وليست جزءاً من نص الاستمارة.</p>
        <div className="space-y-2">
          {ratings.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/40 p-3 sm:flex-row sm:items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">{r.score}</span>
              <input defaultValue={r.label_ar} disabled={!canEdit} onBlur={(e) => { if (e.target.value !== r.label_ar) void saveRating(r.id, e.target.value, r.score); }} className="input flex-1" />
              <input type="number" min={0} defaultValue={r.score} disabled={!canEdit} onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v !== r.score) void saveRating(r.id, r.label_ar, v); }} className="input w-24 text-center" />
              {saving === r.id && <Save className="h-4 w-4 animate-pulse text-turquoise" />}
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <h2 className="mb-2 font-heading font-bold text-navy">صيغة الحساب المطبَّقة</h2>
        <ul className="list-disc space-y-1 pr-5 text-sm text-gray-700">
          <li>نسبة تحقق المعيار الفرعي = (متوسط درجات المؤشرات المقيَّمة ÷ الدرجة العظمى) × 100</li>
          <li>مساهمة المعيار الفرعي = (نسبة التحقق × وزن المعيار الفرعي) ÷ 100</li>
          <li>الدرجة الكلية = مجموع مساهمات المعايير الفرعية (من 100)</li>
          <li>عند عدم وجود أوزان رسمية للمؤشرات يُوزَّع وزن المعيار الفرعي بالتساوي عليها</li>
        </ul>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>المؤشر غير المقيَّم حالة إجرائية منفصلة: لا يُحسب صفراً ولا يُعدّ فشلاً، ويُستبعد من المقام، ويُعرض نقص البيانات صراحةً.</span></div>
      </div>
    </div>
  );
}
