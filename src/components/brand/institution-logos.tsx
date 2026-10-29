import Image from "next/image";

/** الشعاران الرسميان للوزارة والمجلس (ملفات أصلية قدّمتها الجهة). */
export default function InstitutionLogos({
  size = 56,
  caption = true,
  className = "",
  show = "both",
}: {
  size?: number;
  caption?: boolean;
  className?: string;
  show?: "both" | "ministry";
}) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      {show === "both" && <figure className="flex flex-col items-center gap-1.5">
        <span className="flex items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
          <Image src="/brand/caqae-mark.png" alt="شعار مجلس الاعتماد الأكاديمي وضمان جودة التعليم" width={size} height={size} className="object-contain" style={{ height: size, width: "auto" }} />
        </span>
        {caption && <figcaption className="text-[10px] text-white/60">مجلس الاعتماد وضمان الجودة</figcaption>}
      </figure>}
      <figure className="flex flex-col items-center gap-1.5">
        <span className="flex items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
          <Image src="/brand/moe-logo.png" alt="شعار وزارة التربية والتعليم" width={size} height={size} className="object-contain" style={{ height: size, width: "auto" }} />
        </span>
        {caption && <figcaption className="text-[10px] text-white/60">وزارة التربية والتعليم</figcaption>}
      </figure>
    </div>
  );
}
