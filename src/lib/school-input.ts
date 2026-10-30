/**
 * تحقق وتطبيع مدخلات المدرسة المشتركة بين مسارات الإنشاء والتعديل وجهات الاتصال.
 */
import { query } from "./db/sqlite";
import { canonicalPhone, parsePhone } from "./phone";
import { distanceMeters, inYemen, LOCATION_SOURCES, roundCoord, validLatLng, type LocationSource } from "./geo";

/**
 * undefined = لا تغيير، null = مسح، نص = القيمة المعيارية.
 * الرقم الخاطئ يُرفض برسالة واضحة إلا إن سمح المستخدم بحفظه كما هو.
 */
export function normalizePhoneField(raw: string | null | undefined, allowInvalid = false): { value: string | null | undefined; error?: string } {
  if (raw === undefined) return { value: undefined };
  if (raw === null || String(raw).trim() === "") return { value: null };
  const p = parsePhone(raw);
  if (p.valid || allowInvalid) return { value: canonicalPhone(raw) };
  return { value: undefined, error: `رقم الهاتف غير صالح: ${p.reason ?? "صيغة غير معروفة"}` };
}

export type LocationCheck =
  | { ok: true; lat: number | null | undefined; lng: number | null | undefined; source: LocationSource | null | undefined }
  | { ok: false; message: string };

/**
 * يتحقق من الإحداثيات: معاً أو لا شيء، داخل اليمن، وتُقرَّب إلى 6 منازل.
 * مصدر الموقع يُسجَّل لمعرفة موثوقيته لاحقاً.
 */
export function checkLocation(
  lat: number | null | undefined,
  lng: number | null | undefined,
  source?: string | null
): LocationCheck {
  if (lat === undefined && lng === undefined) return { ok: true, lat, lng, source: undefined };
  if (lat == null && lng == null) return { ok: true, lat: null, lng: null, source: null };
  if (lat == null || lng == null) return { ok: false, message: "يجب إدخال خطي العرض والطول معاً" };
  if (!validLatLng(lat, lng)) return { ok: false, message: "إحداثيات غير صالحة (خط العرض -90..90، خط الطول -180..180)" };
  if (!inYemen(lat, lng)) {
    return { ok: false, message: "الإحداثيات تقع خارج اليمن. تحقق من أن خط العرض (حوالي 12–19) وخط الطول (حوالي 42–54) غير مقلوبين" };
  }
  const src = LOCATION_SOURCES.includes(source as LocationSource) ? (source as LocationSource) : "MANUAL";
  return { ok: true, lat: roundCoord(lat), lng: roundCoord(lng), source: src };
}

/** مدارس أخرى على بُعد أمتار قليلة من نقطة (لتنبيه ازدواج الموقع). */
export async function findNearbySchools(lat: number, lng: number, excludeId: string | null, meters = 60): Promise<{ id: string; name: string; code: string; meters: number }[]> {
  const dLat = meters / 111_000 + 0.0002;
  const dLng = meters / (111_000 * Math.cos((lat * Math.PI) / 180)) + 0.0002;
  const rows = await query<{ id: string; name: string; code: string; latitude: number; longitude: number }>(
    `SELECT id, name, code, latitude, longitude FROM schools
     WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? AND (? IS NULL OR id <> ?)`,
    [lat - dLat, lat + dLat, lng - dLng, lng + dLng, excludeId, excludeId]
  );
  return rows
    .map((r) => ({ id: r.id, name: r.name, code: r.code, meters: Math.round(distanceMeters({ lat, lng }, { lat: r.latitude, lng: r.longitude })) }))
    .filter((r) => r.meters <= meters)
    .sort((a, b) => a.meters - b.meters);
}

export const wa = (v: unknown): 0 | 1 => (v === false || v === 0 || v === "0" ? 0 : 1);
