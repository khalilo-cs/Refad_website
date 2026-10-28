import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyAccessToken } from "@/lib/auth";
import { queryOne } from "@/lib/db/sqlite";
import RifadLogo from "@/components/brand/rifad-logo";
import {
  ShieldCheck,
  BarChart3,
  ClipboardCheck,
  FileText,
  Users,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

/** إن كان المستخدم مسجّلاً، يُحوَّل مباشرة إلى لوحة التحكم. */
async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  const user = queryOne<{
    id: string;
    is_active: number;
    is_locked: number;
    token_version: number;
    role_key: string;
  }>(
    "SELECT u.id, u.is_active, u.is_locked, u.token_version, r.key AS role_key FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?",
    [payload.userId]
  );
  if (!user || user.is_locked === 1 || user.is_active === 0 || user.token_version !== payload.tokenVersion)
    return null;
  return { roleKey: user.role_key };
}

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "تقييم ذاتي رقمي",
    text: "109 مؤشراً مستخلصة من استمارة التقييم الذاتي الرسمية، موزّعة على 7 معايير بأوزانها الأصلية.",
  },
  {
    icon: BarChart3,
    title: "حساب فوري للدرجات",
    text: "نسبة تحقق كل معيار فرعي ومساهمته في الدرجة الكلية تُحسب لحظة إدخال الدرجة.",
  },
  {
    icon: FileText,
    title: "تقارير عربية جاهزة",
    text: "تصدير PDF باتجاه صحيح وخط عربي، مع رمز تحقق فريد لكل تقرير.",
  },
  {
    icon: Users,
    title: "صلاحيات محكمة",
    text: "ثمانية أدوار، وكل صلاحية تُفحص في الخادم وقاعدة البيانات لا في الواجهة وحدها.",
  },
  {
    icon: MapPin,
    title: "نطاق جغرافي مرن",
    text: "محافظات ومديريات ومناطق قابلة للتوسّع من مديرية الجراحي إلى ما حولها.",
  },
  {
    icon: ShieldCheck,
    title: "تتبّع كامل",
    text: "سجل تدقيق لكل إضافة وتعديل واعتماد، مع منع تعديل التقارير المعتمدة.",
  },
];

const CRITERIA = [
  { code: "1", name: "الإدارة المدرسية", weight: 15 },
  { code: "2", name: "المعلمون والكوادر", weight: 20 },
  { code: "3", name: "المتعلمون", weight: 15 },
  { code: "4", name: "التعليم والتعلم", weight: 20 },
  { code: "5", name: "البيئة المدرسية", weight: 15 },
  { code: "6", name: "الشراكة المجتمعية", weight: 5 },
  { code: "7", name: "ضمان الجودة والتحسين", weight: 10 },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-warm-white">
      {/* ======================= الترويسة ======================= */}
      <header className="bg-aurora relative overflow-hidden">
        <div className="pattern-geo absolute inset-0 text-white" />

        {/* شريط التنقل */}
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <RifadLogo size={42} withText tone="light" id="rf-home-head" />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl border border-white/20 px-4 py-2 text-[13px] font-semibold text-white/85 transition hover:border-white/40 hover:bg-white/10"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/setup"
              className="hidden rounded-xl bg-gradient-to-br from-gold-bright to-gold px-4 py-2 text-[13px] font-bold text-[#2A1F00] shadow-md transition hover:brightness-105 sm:block"
            >
              التهيئة الأولى
            </Link>
          </div>
        </nav>

        {/* البطل */}
        <section className="relative mx-auto max-w-6xl px-5 pb-24 pt-10 md:pb-32 md:pt-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11.5px] font-semibold text-gold-bright">
                <Sparkles className="h-3.5 w-3.5" />
                مديرية الجراحي — محافظة الحديدة
              </span>

              <h1 className="mt-5 font-heading text-[34px] font-bold leading-[1.25] text-white sm:text-[44px] lg:text-[50px]">
                جودة المدارس
                <span className="mt-1 block text-gradient-gold">تُقاس بالأثر لا بالوعود</span>
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-[1.9] text-white/70">
                منصة رِفاد تحوّل استمارة التقييم الذاتي المدرسية إلى نظام رقمي متكامل:
                تقييم ميداني على 109 مؤشراً، حساب دقيق للدرجات، تقارير عربية معتمدة،
                وتتبّع مستمر للتحسين — كل شيء موثّق وقابل للتحقق.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-gold-bright to-gold px-6 py-3 text-[14px] font-bold text-[#2A1F00] shadow-lg transition hover:-translate-y-0.5 hover:brightness-105"
                >
                  الدخول إلى المنصة
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link
                  href="/setup"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-[13.5px] font-semibold text-white/85 transition hover:border-white/40 hover:bg-white/10"
                >
                  تهيئة حساب المسؤول
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-white/50">
                {["109 مؤشراً موثّقاً", "7 معايير بأوزان رسمية", "8 أدوار صلاحيات"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-turquoise" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* بطاقة توزيع الأوزان */}
            <div className="glass animate-fade-up p-5 delay-2 lg:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold text-white">أوزان المعايير السبعة</h2>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-gold-bright">
                  المجموع 100%
                </span>
              </div>

              <ul className="space-y-2.5">
                {CRITERIA.map((c, i) => (
                  <li key={c.code} className="group">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="font-mono text-[10px] text-white/35">{c.code}</span>
                        <span className="truncate text-[12.5px] text-white/80">{c.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11.5px] font-semibold text-gold-bright">
                        {c.weight}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-turquoise to-gold/90 transition-all duration-700"
                        style={{ width: `${c.weight * 5}%`, animationDelay: `${i * 80}ms` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                <p className="text-[10.5px] leading-relaxed text-white/50">
                  الأوزان والمؤشرات مستخلصة من استمارة التقييم الذاتي الصادرة عن مجلس
                  الاعتماد الأكاديمي وضمان جودة التعليم — رجب 1447هـ.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* موجة سفلية */}
        <svg
          className="relative block w-full text-warm-white"
          viewBox="0 0 1440 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,60 L0,28 C240,58 480,0 720,18 C960,36 1200,58 1440,24 L1440,60 Z"
            fill="currentColor"
          />
        </svg>
      </header>

      {/* ======================= المزايا ======================= */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-turquoise">
            ما تقدّمه المنصة
          </p>
          <h2 className="mt-2 font-heading text-[28px] font-bold text-navy md:text-[34px]">
            نظام واحد لكل دورة التحسين
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-gray-600">
            من الزيارة الميدانية إلى التقرير المعتمد إلى خطة التحسين — بلا أوراق مبعثرة
            ولا حسابات يدوية.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="card-elevated animate-fade-up p-6"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-soft text-gold-bright shadow-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-heading text-[16.5px] font-bold text-navy">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-[1.85] text-gray-600">{f.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ======================= شريط الأمان ======================= */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-aurora p-8 md:p-12">
          <div className="pattern-geo absolute inset-0 text-white" />
          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-turquoise/30 bg-turquoise/10 px-3 py-1 text-[11px] font-semibold text-turquoise">
                <Lock className="h-3.5 w-3.5" />
                الأمان أولاً
              </span>
              <h2 className="mt-4 font-heading text-[26px] font-bold leading-snug text-white md:text-[30px]">
                لا بيانات مزيفة، ولا اعتماد بلا توثيق
              </h2>
              <p className="mt-3 max-w-xl text-[13.5px] leading-[1.9] text-white/65">
                المدارس تُضاف بواسطة مشرف مخوّل أو باستيراد ملف معاينة قبل الحفظ. التقارير
                تمرّ بحالات: مسودة، قيد المراجعة، معتمد، مرفوض بسبب مكتوب — ولا يُوصف
                تقرير بأنه معتمد إلا بعد تسجيل اسم المعتمِد وتاريخه.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                "كلمات مرور مُجزَّأة بـ bcrypt",
                "جلسات JWT في كوكيز HttpOnly",
                "فحص صلاحيات في الخادم",
                "سجل تدقيق لكل إجراء",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/75"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-turquoise" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ======================= التذييل ======================= */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <RifadLogo size={34} id="rf-home-foot" />
            <div>
              <p className="font-heading text-sm font-bold text-navy">منصة رِفاد</p>
              <p className="text-[11px] text-gray-400">للمتابعة والجودة المدرسية</p>
            </div>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-gray-400 sm:text-left">
            مديرية الجراحي — محافظة الحديدة — الجمهورية اليمنية
            <br />
            هذه المنصة أداة إدارية داخلية ولا تصدر وثائق حكومية رسمية.
          </p>
        </div>

        <div className="border-t border-gray-100 bg-warm-white">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-5 py-3 text-[10.5px] text-gray-500 sm:flex-row">
            <p>
              تصميم وتطوير:{" "}
              <span className="font-semibold text-navy">المهندس محمد خليل</span>
            </p>
            <p dir="ltr" className="font-mono tracking-wide">
              736390203
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
