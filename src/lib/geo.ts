/**
 * أدوات المواقع الجغرافية: استخراج الإحداثيات من نص أو رابط خرائط، التحقق من وقوعها داخل اليمن،
 * كشف تبديل خطّي العرض والطول، وحساب المسافة. يعمل في الخادم والمتصفح.
 */

export type LatLng = { lat: number; lng: number };

/** مستطيل يحيط باليمن مع سقطرى. يُستخدم لكشف الأخطاء الشائعة لا للحدود السياسية. */
export const YEMEN_BOUNDS = { minLat: 12.0, maxLat: 19.2, minLng: 41.6, maxLng: 54.7 } as const;

export function inYemen(lat: number, lng: number): boolean {
  return lat >= YEMEN_BOUNDS.minLat && lat <= YEMEN_BOUNDS.maxLat && lng >= YEMEN_BOUNDS.minLng && lng <= YEMEN_BOUNDS.maxLng;
}

export function validLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export type ParsedLocation = LatLng & {
  /** صُحّح تبديل خطّي العرض والطول تلقائياً. */
  swapped: boolean;
  /** نصٌّ مباشر أم رابط. */
  from: "text" | "url";
  /** داخل مستطيل اليمن. */
  inYemen: boolean;
};

const ASCII = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[،٫]/g, ",");

const NUM = "-?\\d{1,3}(?:\\.\\d+)?";

function finalize(lat: number, lng: number, from: ParsedLocation["from"]): ParsedLocation | null {
  if (!validLatLng(lat, lng)) return null;
  // أشيع خطأ: إدخال الطول قبل العرض. إن كان المقلوب داخل اليمن والأصل خارجه نصحّحه.
  if (!inYemen(lat, lng) && validLatLng(lng, lat) && inYemen(lng, lat)) {
    return { lat: lng, lng: lat, swapped: true, from, inYemen: true };
  }
  return { lat, lng, swapped: false, from, inYemen: inYemen(lat, lng) };
}

function dmsToDecimal(deg: string, min: string, sec: string, hemi: string): number {
  const v = Number(deg) + Number(min) / 60 + Number(sec || 0) / 3600;
  return /^[SWsw]$/.test(hemi) ? -v : v;
}

/** يستخرج إحداثيات من رابط معروف (جوجل/OSM/أبل/geo:)، أو null. لا يجري أي طلب شبكة. */
export function parseMapUrl(urlText: string): LatLng | null {
  const text = ASCII(urlText.trim());
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* يبقى كما هو */ }

  // 1) موضع الدبوس الفعلي في روابط جوجل: !3d<lat>!4d<lng> (أدق من مركز العرض @)
  const pin = decoded.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (pin) return { lat: Number(pin[1]), lng: Number(pin[2]) };

  // 2) معاملات الاستعلام المعروفة
  let params: URLSearchParams | null = null;
  try { params = new URL(text).searchParams; } catch { params = null; }
  if (params) {
    for (const key of ["q", "ll", "query", "destination", "center", "sll", "daddr", "saddr"]) {
      const v = params.get(key);
      const m = v && v.match(new RegExp(`^\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`));
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }
    const mlat = params.get("mlat"), mlon = params.get("mlon");
    if (mlat && mlon && Number.isFinite(Number(mlat)) && Number.isFinite(Number(mlon))) return { lat: Number(mlat), lng: Number(mlon) };
  }

  // 3) مركز العرض في المسار: /@lat,lng,zoom
  const at = decoded.match(new RegExp(`@(${NUM}),(${NUM})(?:,|z|/|$)`));
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };

  // 4) OSM: #map=zoom/lat/lng
  const osm = decoded.match(new RegExp(`#map=\\d+/(${NUM})/(${NUM})`));
  if (osm) return { lat: Number(osm[1]), lng: Number(osm[2]) };

  // 5) geo:lat,lng
  const geo = decoded.match(new RegExp(`^geo:(${NUM}),(${NUM})`, "i"));
  if (geo) return { lat: Number(geo[1]), lng: Number(geo[2]) };

  return null;
}

/** روابط مختصرة تحتاج حلّها في الخادم (لا إحداثيات فيها). */
export function isShortMapsLink(urlText: string): boolean {
  try {
    const u = new URL(urlText.trim());
    if (u.protocol !== "https:") return false;
    return u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")) || u.hostname === "g.co";
  } catch {
    return false;
  }
}

/**
 * يحلّل إدخال المستخدم: «14.80, 43.00» أو «14°48'04"N 43°00'07"E» أو رابط خرائط.
 * يعيد null إن لم يجد إحداثيات صالحة (الروابط المختصرة تحتاج /api/geo/resolve).
 */
export function parseLocationInput(input: string): ParsedLocation | null {
  const raw = ASCII(String(input ?? "")).trim();
  if (!raw) return null;

  if (/^(https?:|geo:)/i.test(raw)) {
    const p = parseMapUrl(raw);
    return p ? finalize(p.lat, p.lng, "url") : null;
  }

  // درجات-دقائق-ثوانٍ: 14°48'04.3"N 43°00'07.6"E
  const dms = [...raw.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:\.\d+)?)?\s*["″”]?\s*([NSEWnsew])?/g)];
  if (dms.length >= 2) {
    const a = dmsToDecimal(dms[0][1], dms[0][2], dms[0][3] ?? "0", dms[0][4] ?? "N");
    const b = dmsToDecimal(dms[1][1], dms[1][2], dms[1][3] ?? "0", dms[1][4] ?? "E");
    // إن كان الأول E/W فهو الطول
    const firstIsLng = /^[EWew]$/.test(dms[0][4] ?? "");
    const r = firstIsLng ? finalize(b, a, "text") : finalize(a, b, "text");
    if (r) return r;
  }

  // عشري: رقمان مفصولان بفاصلة أو مسافة، مع رموز درجات/اتجاهات اختيارية
  const cleaned = raw.replace(/[°º]/g, "").replace(/\b([NSEW])\b/gi, (m) => (/[SW]/i.test(m) ? "-" : "")).trim();
  const m = cleaned.match(new RegExp(`^\\(?\\s*(${NUM})\\s*[,;\\s]\\s*(${NUM})\\s*\\)?$`));
  if (m) return finalize(Number(m[1]), Number(m[2]), "text");
  return null;
}

/** المسافة بالأمتار بين نقطتين (هافرساين). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} كم`;
}

/** تقريب الإحداثيات إلى 6 منازل (~11 سم) للتخزين والعرض. */
export const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6;

export type LocationSource = "MAP_PICK" | "GPS" | "MAPS_LINK" | "MANUAL" | "IMPORT";
export const LOCATION_SOURCES: LocationSource[] = ["MAP_PICK", "GPS", "MAPS_LINK", "MANUAL", "IMPORT"];
export const LOCATION_SOURCE_LABEL: Record<LocationSource, string> = {
  MAP_PICK: "اختيار من الخريطة",
  GPS: "موقع الجهاز (GPS)",
  MAPS_LINK: "رابط خرائط",
  MANUAL: "إدخال يدوي",
  IMPORT: "استيراد من ملف",
};
