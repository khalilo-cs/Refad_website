/**
 * توليد كلمات مرور مؤقتة وأسماء مستخدمين. كلمة المرور تُعرض مرة واحدة لمن أنشأها ولا تُخزَّن نصاً.
 */
import { randomInt } from "node:crypto";
import { validatePassword } from "./auth";

// بلا أحرف متشابهة (0/O، 1/l/I) لتسهيل القراءة والنسخ عبر الهاتف.
const LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "@#$%&*";

export function generatePassword(length = 12): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pick = (set: string) => set[randomInt(set.length)];
    const chars = [pick(LETTERS), pick(LETTERS), pick(DIGITS), pick(DIGITS), pick(SYMBOLS)];
    const all = LETTERS + DIGITS;
    while (chars.length < length) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const pw = chars.join("");
    if (validatePassword(pw).ok) return pw;
  }
  throw new Error("تعذّر توليد كلمة مرور");
}

/** اسم المستخدم: حروف لاتينية صغيرة وأرقام و . _ - فقط، 3–40 خانة، لا يحوي @ حتى لا يتعارض مع البريد. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toLowerCase();
  return USERNAME_RE.test(u) ? u : null;
}

export const placeholderEmail = (username: string) => `${username}@no-email.invalid`;
export const isPlaceholderEmail = (email: string | null | undefined) => !!email && email.endsWith("@no-email.invalid");
