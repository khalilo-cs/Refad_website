/**
 * شعار منصة إتقان.
 * الشعار الأساسي هو شعار مجلس الاعتماد الأكاديمي وضمان جودة التعليم،
 * ويُرافقه اسم المنصة. شعار الوزارة يُعرض بجانبه عبر InstitutionLogos.
 */
import Image from "next/image";

type Props = {
  /** ارتفاع الشعار بالبكسل */
  size?: number;
  withText?: boolean;
  tone?: "dark" | "light";
  withTagline?: boolean;
  className?: string;
  /** محفوظ للتوافق مع الاستخدامات السابقة */
  id?: string;
};

export default function RifadLogo({
  size = 40,
  withText = false,
  tone = "dark",
  withTagline = true,
  className = "",
}: Props) {
  const nameColor = tone === "light" ? "#FFFFFF" : "#0B2545";
  const subColor = tone === "light" ? "rgba(255,255,255,0.62)" : "#5A6B7B";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5"
        style={{ padding: Math.max(2, size * 0.07) }}
      >
        <Image
          src="/brand/caqae-mark.png"
          alt="شعار مجلس الاعتماد الأكاديمي وضمان جودة التعليم"
          width={Math.round(size * 0.97)}
          height={size}
          priority
          style={{ height: size, width: "auto" }}
        />
      </span>
      {withText && (
        <span className="flex flex-col leading-tight">
          <span className="font-heading text-[19px] font-bold" style={{ color: nameColor }}>
            إتقان
          </span>
          {withTagline && (
            <span className="text-[10px]" style={{ color: subColor }}>
              للاعتماد المدرسي وضمان جودة التعليم
            </span>
          )}
        </span>
      )}
    </span>
  );
}
