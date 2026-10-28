"use client";

import { Suspense, useState } from "react";
import { useToast } from "@/components/providers";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, AlertCircle, Eye, EyeOff, ArrowLeft, ShieldCheck } from "lucide-react";
import RifadLogo from "@/components/brand/rifad-logo";

function LoginForm() {
  const { add } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "تعذّر تسجيل الدخول");
        return;
      }
      add({ type: "success", message: `مرحباً ${data.user?.name ?? ""}` });
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("تعذّر الاتصال بالخادم. تحقق من الشبكة وأعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ============ اللوحة البصرية ============ */}
      <div className="relative hidden w-[46%] overflow-hidden bg-aurora lg:flex lg:flex-col lg:justify-between">
        <div className="pattern-geo absolute inset-0 text-white" />

        {/* دوائر ضوئية */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-turquoise/20 blur-3xl animate-float" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-gold/15 blur-3xl" />

        <div className="relative p-10">
          <RifadLogo size={44} withText tone="light" id="rf-login-head" />
        </div>

        <div className="relative px-10">
          <h1 className="font-heading text-[36px] font-bold leading-[1.3] text-white">
            كل مدرسة
            <span className="mt-1 block text-gradient-gold">تستحق قياساً منصفاً</span>
          </h1>
          <p className="mt-4 max-w-sm text-[13.5px] leading-[1.95] text-white/60">
            109 مؤشراً، سبعة معايير بأوزانها الرسمية، وحساب فوري للدرجة — مع تتبّع كل خطوة
            من الزيارة إلى الاعتماد.
          </p>

          <div className="mt-8 space-y-2.5">
            {[
              "تقييم ميداني على المؤشرات الأصلية",
              "تقارير عربية بصيغة PDF مع رمز تحقق",
              "صلاحيات محكمة وسجل تدقيق كامل",
            ].map((t) => (
              <div key={t} className="flex items-center gap-2.5 text-[12.5px] text-white/70">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-turquoise/18 text-turquoise">
                  <ShieldCheck className="h-3 w-3" />
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        <div className="relative p-10">
          <div className="ornament mb-4 text-[10px] font-semibold tracking-wider text-gold/70">
            مديرية الجراحي — الحديدة
          </div>
          <p className="text-[10.5px] leading-relaxed text-white/35">
            منصة إدارية داخلية. لا تصدر وثائق حكومية رسمية، ولا تحمل أختاماً أو تواقيع.
          </p>
          <p className="mt-3 text-[10.5px] text-white/30">
            تصميم وتطوير: <span className="font-semibold text-white/55">المهندس محمد خليل</span>
            <span className="mx-1.5 text-white/15">·</span>
            <span dir="ltr" className="font-mono">736390203</span>
          </p>
        </div>
      </div>

      {/* ============ نموذج الدخول ============ */}
      <div className="flex w-full flex-1 items-center justify-center bg-warm-white px-5 py-10 lg:w-[54%]">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex justify-center lg:hidden">
            <RifadLogo size={52} withText id="rf-login-card" />
          </div>

          <div className="animate-fade-up">
            <h2 className="font-heading text-[27px] font-bold text-navy">تسجيل الدخول</h2>
            <p className="mt-1.5 text-[13px] text-gray-600">
              أدخل بيانات حسابك للوصول إلى لوحة المتابعة.
            </p>
          </div>

          {error && (
            <div
              className="mt-5 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger animate-fade-in"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@rifad.demo"
                  className="input pr-10"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="input px-10"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-gray-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-turquoise focus:ring-turquoise"
              />
              إبقاء الجلسة مفتوحة على هذا الجهاز
            </label>

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-3">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  جارٍ التحقق…
                </>
              ) : (
                <>
                  الدخول
                  <ArrowLeft className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-7 space-y-3">
            <div className="ornament text-[10px] text-gray-300">أو</div>
            <Link
              href="/setup"
              className="block rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-[12.5px] font-semibold text-navy transition hover:border-turquoise/40 hover:bg-turquoise-soft/40"
            >
              تهيئة حساب المسؤول الأول
            </Link>
          </div>

          <p className="mt-8 text-center text-[10.5px] leading-relaxed text-gray-400">
            بتسجيل الدخول فإنك توافق على أن استخدام المنصة محصور في الأغراض الإدارية
            والتربوية المعتمدة، وأن كل إجراء يُسجَّل في سجل التدقيق.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-aurora">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-float">
          <RifadLogo size={60} id="rf-login-foot" />
        </div>
        <span className="text-sm text-white/60">جارٍ التحميل…</span>
      </div>
    </div>
  );
}
