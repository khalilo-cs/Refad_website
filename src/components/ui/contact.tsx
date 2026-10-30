"use client";

import { Copy, MapPin, MessageCircle, Navigation, Phone, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/providers";
import { DEFAULT_WA_MESSAGE, mapViewHref, navigateHref, parsePhone, telHref, whatsappHref } from "@/lib/phone";

const BTN =
  "inline-flex shrink-0 items-center justify-center rounded-lg border text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquoise";
const SIZE = { sm: "h-8 w-8", md: "h-9 w-9" } as const;

/**
 * رقم هاتف مع أزرار الاتصال والواتساب والنسخ.
 *  - يظهر زر الاتصال لكل رقم صالح، وزر واتساب للجوال والدولي إن لم يُعلَّم أنه بلا واتساب.
 *  - الرقم الخاطئ يظهر كما هو بعلامة تنبيه ولا يُنشأ له رابط.
 */
export function PhoneActions({
  phone,
  hasWhatsapp = true,
  name,
  message,
  size = "sm",
  showNumber = true,
  className = "",
}: {
  phone: string | null | undefined;
  hasWhatsapp?: boolean;
  name?: string;
  message?: string;
  size?: keyof typeof SIZE;
  showNumber?: boolean;
  className?: string;
}) {
  const { add } = useToast();
  if (!phone || !String(phone).trim()) return <span className="text-gray-400">—</span>;
  const p = parsePhone(phone);
  const tel = telHref(p);
  const wa = hasWhatsapp ? whatsappHref(p, message ?? DEFAULT_WA_MESSAGE) : null;
  const who = name ? ` ${name}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.valid ? p.canonical : p.raw);
      add({ type: "success", message: "نُسخ الرقم" });
    } catch {
      add({ type: "error", message: "تعذّر النسخ — انسخه يدوياً" });
    }
  };

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {showNumber && (
        <bdi dir="ltr" className={`font-mono text-[12.5px] ${p.valid ? "text-navy" : "text-warning"}`} title={p.valid ? undefined : p.reason}>
          {p.valid ? p.display : p.raw}
        </bdi>
      )}
      {!p.valid && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-warning" title={p.reason}>
          <TriangleAlert className="h-3 w-3" /> رقم غير صالح
        </span>
      )}
      {tel && (
        <a href={tel} className={`${BTN} ${SIZE[size]} border-turquoise/30 bg-turquoise/10 text-turquoise hover:bg-turquoise/20`} aria-label={`اتصال${who}`} title="اتصال">
          <Phone className="h-4 w-4" />
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN} ${SIZE[size]} border-[#25D366]/40 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20`}
          aria-label={`مراسلة${who} عبر واتساب`}
          title="واتساب"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
      <button type="button" onClick={copy} className={`${BTN} ${SIZE[size]} border-gray-200 bg-white text-gray-500 hover:bg-gray-50`} aria-label="نسخ الرقم" title="نسخ">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** أزرار التوجيه إلى موقع المدرسة (ملاحة) وعرضه على الخريطة. تختفي إن لم يُحدَّد الموقع. */
export function LocationActions({
  lat,
  lng,
  size = "sm",
  label = false,
  className = "",
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  size?: keyof typeof SIZE;
  label?: boolean;
  className?: string;
}) {
  const go = navigateHref(lat, lng);
  const view = mapViewHref(lat, lng);
  if (!go || !view) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href={go}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BTN} ${label ? "h-8 gap-1.5 px-3" : SIZE[size]} border-navy/20 bg-navy/5 text-navy hover:bg-navy/10`}
        aria-label="توجيه إلى موقع المدرسة"
        title="توجيه (ملاحة) إلى المدرسة"
      >
        <Navigation className="h-4 w-4" />
        {label && "توجيه"}
      </a>
      <a
        href={view}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BTN} ${SIZE[size]} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
        aria-label="فتح الموقع على الخريطة"
        title="عرض على الخريطة"
      >
        <MapPin className="h-4 w-4" />
      </a>
    </span>
  );
}
