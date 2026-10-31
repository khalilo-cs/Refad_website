"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import RifadLogo from "@/components/brand/rifad-logo";
import { useSession } from "@/components/providers";

/**
 * تغيير كلمة المرور المؤقتة: شاشة مستقلة واضحة يصل إليها كل حساب أنشأه المدير عند أول دخول.
 * بعد النجاح يُنقل المستخدم إلى لوحته مباشرة.
 */
export default function ChangePasswordPage() {
  const { user, loading, logout } = useSession();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) window.location.replace("/login");
  }, [loading, user]);

  const rules = useMemo(() => [
    { ok: next.length >= 10, label: "10 أحرف على الأقل" },
    { ok: /[A-Za-z]/.test(next), label: "حرف إنجليزي واحد على الأقل" },
    { ok: /[0-9]/.test(next), label: "رقم واحد على الأقل" },
    { ok: !!next && next !== cur, label: "مختلفة عن كلمة المرور المؤقتة" },
    { ok: !!confirm && next === confirm, label: "التأكيد مطابق" },
  ], [next, cur, confirm]);
  const valid = rules.every((r) => r.ok) && !!cur;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/account", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "تعذّر تغيير كلمة المرور");
      setDone(true);
      // تحميل كامل حتى تُقرأ الجلسة الجديدة من الخادم
      setTimeout(() => window.location.replace("/dashboard"), 900);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-aurora px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><RifadLogo size={52} withText tone="light" /></div>
        <div className="card p-6 sm:p-7">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h1 className="font-heading text-[19px] font-bold text-navy">اختر كلمة مرور جديدة</h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
                {user ? <>مرحباً <b>{user.name}</b>. </> : null}
                دخلتَ بكلمة مرور مؤقتة سلّمتها لك الإدارة. لحماية حسابك اختر كلمة خاصة بك، وبعدها تنتقل مباشرة إلى لوحتك.
              </p>
            </div>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-success">
              <CheckCircle2 className="h-10 w-10" />
              <p className="font-heading font-bold">تم تغيير كلمة المرور</p>
              <p className="text-[12.5px] text-gray-500">جارٍ فتح لوحتك…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <label htmlFor="cur" className="label">كلمة المرور المؤقتة (التي دخلت بها)</label>
                <input id="cur" className="input" dir="ltr" type={show ? "text" : "password"} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="new" className="label">كلمة المرور الجديدة</label>
                <div className="relative">
                  <input id="new" className="input pe-10" dir="ltr" type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:text-navy" aria-label={show ? "إخفاء" : "إظهار"}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm" className="label">أعد كتابة كلمة المرور الجديدة</label>
                <input id="confirm" className="input" dir="ltr" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <ul className="grid gap-1 rounded-xl bg-gray-50 p-3 text-[12px]">
                {rules.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 ${r.ok ? "text-success" : "text-gray-500"}`}>
                    {r.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {r.label}
                  </li>
                ))}
              </ul>
              {error && <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-[12.5px] text-danger">{error}</p>}
              <button type="submit" className="btn btn-primary w-full" disabled={!valid || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} حفظ والمتابعة
              </button>
              <button type="button" className="mx-auto flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-navy" onClick={() => logout()}>
                <LogOut className="h-3.5 w-3.5" /> تسجيل الخروج
              </button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-white/50">لا تشارك كلمة المرور مع أحد، ولن تطلبها الإدارة منك أبداً.</p>
      </div>
    </div>
  );
}
