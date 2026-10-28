import Link from "next/link";
import { WifiOff, RotateCw, HardDrive, ShieldCheck } from "lucide-react";
import RifadLogo from "@/components/brand/rifad-logo";

export const metadata = { title: "لا يوجد اتصال — منصة رِفاد" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-aurora px-5">
      <div className="pattern-geo pointer-events-none absolute inset-0 text-white" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <RifadLogo size={52} withText tone="light" />
        </div>

        <div className="glass rounded-3xl p-6 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-turquoise-accent">
            <WifiOff className="h-7 w-7" />
          </span>

          <h1 className="font-heading text-[22px] font-bold text-white">لا يوجد اتصال بالإنترنت</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/60">
            تعذّر الوصول إلى الخادم. يمكنك متابعة العمل على المسودات المحفوظة على هذا
            الجهاز، وستُزامَن تلقائياً عند عودة الاتصال.
          </p>

          <div className="mt-5 space-y-2 text-right">
            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-bright" />
              <p className="text-[11px] leading-relaxed text-white/70">
                المسودات غير المرسلة محفوظة محلياً على جهازك.
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-turquoise" />
              <p className="text-[11px] leading-relaxed text-white/70">
                اعتماد التقارير وتغيير الحالات يتطلب اتصالاً بالخادم — لا يتم محلياً أبداً.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-gold-bright to-gold px-4 py-2.5 text-[13px] font-bold text-[#2A1F00] transition hover:brightness-105"
          >
            <RotateCw className="h-4 w-4" /> إعادة المحاولة
          </Link>
        </div>

        <p className="mt-5 text-center text-[10px] leading-relaxed text-white/30">
          منصة رِفاد — مديرية الجراحي، الحديدة
          <br />
          تصميم وتطوير: المهندس محمد خليل · <span dir="ltr" className="font-mono">736390203</span>
        </p>
      </div>
    </div>
  );
}
