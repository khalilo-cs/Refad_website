import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Eye, Flag, Target, Users, FolderArchive, ListChecks, WifiOff, Smartphone, FileDown, CalendarRange } from "lucide-react";
import RifadLogo from "@/components/brand/rifad-logo";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "عن المنصة — رؤية وخطة الإنشاء" };

const TECH_ICONS = [WifiOff, Smartphone, FileDown];

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-8 text-center">
      <p className="text-[12px] font-semibold tracking-widest text-turquoise">{kicker}</p>
      <h2 className="mt-1.5 font-heading text-[26px] font-bold text-navy md:text-[30px]">{title}</h2>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-warm-white">
      <header className="bg-aurora relative overflow-hidden">
        <div className="pattern-geo absolute inset-0 text-white" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/"><RifadLogo size={40} withText tone="light" id="rf-about-head" /></Link>
          <Link href="/login" className="rounded-xl border border-white/20 px-4 py-2 text-[13px] font-semibold text-white/85 transition hover:bg-white/10">
            تسجيل الدخول
          </Link>
        </nav>
        <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-6 text-center">
          <ul className="mb-6 space-y-0.5 text-[12px] text-white/55">
            {BRAND.hierarchy.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <h1 className="font-heading text-[30px] font-bold leading-snug text-white sm:text-[40px]">رؤية وخطة إنشاء المنصة الإلكترونية الرقمية</h1>
          <p className="mt-4 text-gradient-gold font-heading text-[18px] font-semibold">{BRAND.slogan}</p>
          <p className="mx-auto mt-4 max-w-2xl text-[13.5px] leading-[1.9] text-white/70">
            مشروع المتابعة والتقييم الذاتي والرقمي لمدارس مديرية الجراحي ({BRAND.targetSchools} مدرسة)
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-20 px-5 py-16">
        {/* البطاقة التعريفية */}
        <section>
          <SectionTitle kicker="البطاقة التعريفية" title="عن المنصة" />
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {[
              ["الجهة المشرفة والمالكة", BRAND.owner],
              ["الفئة المستهدفة", BRAND.audience],
              ["نطاق الخدمة", BRAND.scope],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
                <p className="text-[12.5px] font-semibold text-gray-500">{k}</p>
                <p className="text-[14px] leading-relaxed text-navy">{v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* الرؤية والرسالة */}
        <section className="grid gap-5 md:grid-cols-2">
          {[
            { icon: Eye, title: "رؤية المنصة", text: BRAND.vision },
            { icon: Flag, title: "رسالة المنصة", text: BRAND.mission },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="card-elevated p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-soft text-gold-bright"><Icon className="h-6 w-6" /></span>
              <h3 className="mt-4 font-heading text-xl font-bold text-navy">{title}</h3>
              <p className="mt-2 text-[14px] leading-[2] text-gray-600">{text}</p>
            </div>
          ))}
        </section>

        {/* الأهداف */}
        <section>
          <SectionTitle kicker="الأهداف الاستراتيجية" title="ما نسعى إلى تحقيقه" />
          <div className="grid gap-4 sm:grid-cols-2">
            {BRAND.goals.map((g) => (
              <div key={g.key} className="card flex gap-4 p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 font-heading text-lg font-bold text-gold">{g.key}</span>
                <div>
                  <h3 className="font-heading text-[16px] font-bold text-navy">{g.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-[1.9] text-gray-600">{g.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* آلية التنفيذ */}
        <section>
          <SectionTitle kicker="آلية التنفيذ" title="هيكلة الحسابات وكيف تعمل المنصة" />
          <div className="grid gap-4 md:grid-cols-3">
            {BRAND.accounts.map((a) => (
              <div key={a.title} className="card-elevated p-6">
                <Users className="h-6 w-6 text-turquoise" />
                <h3 className="mt-3 font-heading text-[16px] font-bold text-navy">{a.title}</h3>
                <p className="mt-1.5 text-[13px] leading-[1.9] text-gray-600">{a.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="card p-6">
              <FolderArchive className="h-6 w-6 text-gold" />
              <h3 className="mt-3 font-heading text-[16px] font-bold text-navy">التقييم الذاتي ورفع الشواهد (الملف الرقمي)</h3>
              <p className="mt-1.5 text-[13px] leading-[1.9] text-gray-600">{BRAND.portfolio}</p>
            </div>
            <div className="card p-6">
              <ListChecks className="h-6 w-6 text-gold" />
              <h3 className="mt-3 font-heading text-[16px] font-bold text-navy">لوحة المتابعة وإدارة خطط التحسين</h3>
              <p className="mt-1.5 text-[13px] leading-[1.9] text-gray-600">{BRAND.tracker}</p>
            </div>
          </div>
        </section>

        {/* المميزات التقنية */}
        <section>
          <SectionTitle kicker="المكونات التقنية" title="مميزات مراعية للبيئة المحلية" />
          <div className="grid gap-4 md:grid-cols-3">
            {BRAND.techFeatures.map((f, i) => {
              const Icon = TECH_ICONS[i] ?? Target;
              return (
                <div key={f.title} className="card-elevated p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-soft text-gold-bright"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-4 font-heading text-[16px] font-bold text-navy">{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-[1.9] text-gray-600">{f.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* خطة التدشين */}
        <section>
          <SectionTitle kicker="خطة التدشين" title="المتابعة المرحلية" />
          <ol className="relative space-y-4 border-r-2 border-gold/30 pr-6">
            {BRAND.phases.map((p, i) => (
              <li key={p.phase} className="relative">
                <span className="absolute -right-[35px] top-5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-[#2A1F00]">{i + 1}</span>
                <div className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-[16px] font-bold text-navy">{p.phase}</h3>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-turquoise/10 px-3 py-1 text-[11.5px] font-semibold text-turquoise"><CalendarRange className="h-3.5 w-3.5" />{p.period}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-[1.9] text-gray-600">{p.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="text-center">
          <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-gold-bright to-gold px-6 py-3 text-[14px] font-bold text-[#2A1F00] shadow-lg transition hover:-translate-y-0.5">
            الدخول إلى المنصة <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-6 text-center text-[11.5px] leading-relaxed text-gray-500">
        <p>{BRAND.preparedBy}</p>
        <p>إدارة التربية والتعليم والبحث العلمي — مديرية الجراحي</p>
      </footer>
    </div>
  );
}
