/**
 * مصادقة ثنائية (TOTP — RFC 6238) بلا اعتماديات خارجية.
 * السرّ يُخزَّن مشفَّراً (AES-256-GCM) بمفتاح مشتق من JWT_SECRET.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function b32decode(s: string): Buffer {
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error("سرّ غير صالح");
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function hotp(secretB32: string, counter: number, digits = 6): string {
  const key = b32decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const STEP = 30;

/** يتحقق من الرمز ضمن نافذة ±1 خطوة. يعيد رقم الخطوة المطابقة أو null. */
export function verifyTotp(secretB32: string, token: string, now = Date.now(), window = 1): number | null {
  const t = String(token ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(t)) return null;
  const step = Math.floor(now / 1000 / STEP);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secretB32, step + w);
    const a = Buffer.from(expected), b = Buffer.from(t);
    if (a.length === b.length && timingSafeEqual(a, b)) return step + w;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "منصة إتقان"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

function key(): Buffer {
  return createHash("sha256").update("rifad-2fa:" + (process.env.JWT_SECRET ?? "")).digest();
}
export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
