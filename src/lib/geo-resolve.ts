/**
 * حلّ روابط خرائط جوجل المختصرة (maps.app.goo.gl) إلى إحداثيات في الخادم.
 *
 * أمان (SSRF): HTTPS فقط، ومضيفون من قائمة بيضاء لنطاقات جوجل، وتُتبَّع إعادة التوجيه يدوياً
 * بحدّ أقصى 5 قفزات مع فحص المضيف في كل قفزة، ومهلة قصيرة، وحجم أقصى لما يُقرأ من الصفحة.
 * لا يُعاد للمستخدم أي محتوى من الصفحة، الإحداثيات فقط.
 */
import { isShortMapsLink, parseLocationInput, parseMapUrl, type ParsedLocation } from "./geo";

const HOST_OK = /^(([a-z0-9-]+\.)?google\.(com|com\.[a-z]{2}|[a-z]{2})|maps\.app\.goo\.gl|goo\.gl|g\.co)$/i;
const MAX_HOPS = 5;
const MAX_BODY = 300_000;

export function isAllowedMapsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && (u.port === "" || u.port === "443") && HOST_OK.test(u.hostname);
  } catch {
    return false;
  }
}

/** يستخرج رابط الوجهة من صفحة موافقة جوجل: consent.google.com/...?continue=<url>. */
function unwrapConsent(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "consent.google.com") return u.searchParams.get("continue") ?? url;
  } catch { /* يبقى */ }
  return url;
}

function scanBody(html: string): { lat: number; lng: number } | null {
  const pin = html.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (pin) return { lat: Number(pin[1]), lng: Number(pin[2]) };
  const center = html.match(/center=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/);
  if (center) return { lat: Number(center[1]), lng: Number(center[2]) };
  const at = html.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  return null;
}

export type ResolveResult = { ok: true; location: ParsedLocation } | { ok: false; reason: "not_found" | "not_allowed" | "network" };

export async function resolveMapsLink(input: string, fetchImpl: typeof fetch = fetch): Promise<ResolveResult> {
  const direct = parseLocationInput(input);
  if (direct) return { ok: true, location: direct };
  const text = input.trim();
  if (!/^https:\/\//i.test(text) || !isAllowedMapsUrl(text)) return { ok: false, reason: "not_allowed" };
  // الروابط الطويلة غير المختصرة التي لا إحداثيات فيها تُحلّ كذلك (مثل رابط مكان بلا @)
  if (!isShortMapsLink(text) && !/^https:\/\/(www\.|maps\.)?google\.[a-z.]+\/maps/i.test(text)) return { ok: false, reason: "not_allowed" };

  let current = text;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      let res: Response;
      try {
        res = await fetchImpl(current, {
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": "Mozilla/5.0 (compatible; ItqanBot/1.0)", "accept-language": "ar,en;q=0.8" },
        });
      } finally {
        clearTimeout(timer);
      }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = unwrapConsent(new URL(loc, current).toString());
        if (!isAllowedMapsUrl(next)) return { ok: false, reason: "not_allowed" };
        const p = parseMapUrl(next);
        if (p) {
          const parsed = parseLocationInput(next);
          if (parsed) return { ok: true, location: parsed };
        }
        current = next;
        continue;
      }
      // لا إعادة توجيه: نفحص بداية المحتوى
      const body = (await res.text()).slice(0, MAX_BODY);
      const found = scanBody(body);
      if (found) {
        const parsed = parseLocationInput(`${found.lat}, ${found.lng}`);
        if (parsed) return { ok: true, location: { ...parsed, from: "url" } };
      }
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
