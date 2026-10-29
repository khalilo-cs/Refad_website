/**
 * أدوات الأمان المشتركة: تحديد المعدل، فحص المصدر، الروابط الموقّعة المؤقتة،
 * والتحقق من محتوى الملفات المرفوعة (توقيعات البايتات لا اسم الامتداد فقط).
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import path from "path";

/* ------------------------------ عنوان العميل ------------------------------ */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

/* ------------------------------ تحديد المعدل ------------------------------ */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** يعيد true إذا سُمح بالطلب، وfalse إذا تجاوز الحد خلال النافذة. */
export function rateLimit(key: string, limit: number, windowMs: number): {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
} {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return {
    ok: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}

/* ------------------------------ فحص المصدر (CSRF) ------------------------------ */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** يرفض الطلبات المغيِّرة القادمة من مصدر مختلف عن مضيف المنصة. */
export function isSameOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const origin = req.headers.get("origin");
  if (!origin) {
    // طلبات الخادم إلى الخادم أو الأدوات: نقبلها فقط إن لم يكن الطلب من متصفح
    return req.headers.get("sec-fetch-site") !== "cross-site";
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* ------------------------------ روابط موقّعة مؤقتة ------------------------------ */
function signingKey(): string {
  const secret = process.env.JWT_SECRET ?? "";
  return createHash("sha256").update("rifad-signed-url:" + secret).digest("hex");
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

/** ينشئ رمزاً موقّعاً صالحاً لمدة ttlSec ثانية لمورد معيّن ومستخدم معيّن. */
export function signResourceToken(resource: string, userId: string, ttlSec = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(JSON.stringify({ r: resource, u: userId, e: exp }));
  const sig = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyResourceToken(
  token: string,
  resource: string
): { ok: true; userId: string } | { ok: false } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false };
  const expected = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      r: string;
      u: string;
      e: number;
    };
    if (data.r !== resource || data.e < Math.floor(Date.now() / 1000)) return { ok: false };
    return { ok: true, userId: data.u };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------ التحقق من الملفات ------------------------------ */
export type SniffedType = { mime: string; ext: string };

const DANGEROUS_EXT = new Set([
  "exe", "dll", "bat", "cmd", "com", "msi", "scr", "sh", "ps1", "vbs", "js", "mjs", "jar", "php",
  "py", "rb", "pl", "html", "htm", "svg", "xml", "hta", "lnk", "apk", "app", "dmg", "iso",
]);

/** يحدّد نوع الملف من توقيع بايتاته الأولى. يعيد null إن لم يكن من الأنواع المسموحة. */
export function sniffFile(buf: Buffer, declaredName: string): SniffedType | null {
  const ext = (declaredName.split(".").pop() ?? "").toLowerCase();
  if (DANGEROUS_EXT.has(ext)) return null;
  if (buf.length < 8) return null;

  const startsWith = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);

  if (startsWith(0x25, 0x50, 0x44, 0x46)) return { mime: "application/pdf", ext: "pdf" };
  if (startsWith(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return { mime: "image/webp", ext: "webp" };

  // ملفات Office القديمة (OLE2)
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) {
    if (ext === "xls") return { mime: "application/vnd.ms-excel", ext: "xls" };
    if (ext === "doc") return { mime: "application/msword", ext: "doc" };
    return null;
  }
  // ملفات Office الحديثة (ZIP)
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) {
    if (ext === "docx")
      return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
    if (ext === "xlsx")
      return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
    return null;
  }
  // CSV: نص صرف بلا بايتات تحكم
  if (ext === "csv") {
    const sample = buf.subarray(0, Math.min(buf.length, 4096));
    if (!sample.includes(0)) return { mime: "text/csv", ext: "csv" };
  }
  return null;
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** ينظّف اسم الملف الأصلي للعرض والتنزيل. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return base.slice(0, 180) || "file";
}

/** مجلد التخزين الخاص — خارج public فلا يُخدم مباشرة. */
export function uploadsRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads"));
}

/** يتأكد أن المسار داخل مجلد التخزين (منع اجتياز المسارات). */
export function safeStoragePath(key: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return null;
  const root = uploadsRoot();
  const full = path.resolve(root, key);
  return full.startsWith(root + path.sep) ? full : null;
}
