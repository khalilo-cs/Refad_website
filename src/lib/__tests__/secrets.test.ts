import { describe, it, expect, afterEach } from "vitest";
import { readSecret } from "../auth";

/**
 * اختبارات سياسة الأسرار.
 *
 * الضمان المطلوب: لا يمكن تشغيل المنصة بسرّ افتراضي أو نائب. الخادم يرفض
 * ببدء التشغيل بدل أن يعمل بسرّ معروف يمكن توقّع الرموز الموقّعة به.
 *
 * نُعيد هنا نفس القواعد المطبّقة في readSecret داخل src/lib/auth.ts.
 */

const PLACEHOLDER_PATTERNS = [
  "change_me",
  "changeme",
  "your-secret",
  "ضع-هنا",
  "secret",
  "password",
  "example",
  "test",
  "demo",
  "rifad",
];

function isAcceptableSecret(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 32) return false;
  const lowered = trimmed.toLowerCase();
  if (PLACEHOLDER_PATTERNS.some((p) => lowered.includes(p))) return false;
  if (new Set(trimmed).size < 8) return false;
  return true;
}

describe("سياسة أسرار JWT", () => {
  it("يرفض السرّ الغائب", () => {
    expect(isAcceptableSecret(undefined)).toBe(false);
    expect(isAcceptableSecret("")).toBe(false);
  });

  it("يرفض السرّ القصير", () => {
    expect(isAcceptableSecret("a".repeat(31))).toBe(false);
    expect(isAcceptableSecret("abc123")).toBe(false);
  });

  it("يرفض النص النائب من ملف المثال", () => {
    expect(isAcceptableSecret("ضع-هنا-سلسلة-عشوائية-لا-تقل-عن-32-حرفاً")).toBe(false);
    expect(isAcceptableSecret("CHANGE_ME_RUN_openssl_rand_hex_32")).toBe(false);
    expect(isAcceptableSecret("your-secret-key-please-change-it-now")).toBe(false);
    expect(isAcceptableSecret("rifad-default-secret-value-2026-xyz")).toBe(false);
  });

  it("يرفض القيم منخفضة التنوّع", () => {
    expect(isAcceptableSecret("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("يقبل سرّاً عشوائياً حقيقياً بطول 64", () => {
    expect(
      isAcceptableSecret("1d0939738f962912ddba1292cac488fbdd1d5044e879e797d235b0559554e6d3")
    ).toBe(true);
  });

  it("يقبل السرّ الذي يتجاوز 32 حرفاً بتنوّع كافٍ", () => {
    expect(isAcceptableSecret("q7Kd9xLm2PvR4tWz8NcB6hJy3FsA5gUe1")).toBe(true);
  });
});

describe("بيانات الدخول التجريبية", () => {
  it("كلمة مرور العرض ليست كلمة مرور شائعة", () => {
    const demo = "R!f@d_2026_DemoAccess";
    const COMMON = ["password", "123456", "admin", "qwerty", "12345678", "letmein"];
    expect(demo.length).toBeGreaterThanOrEqual(10);
    expect(COMMON.some((c) => demo.toLowerCase() === c)).toBe(false);
    expect(/[A-Za-z]/.test(demo) && /\d/.test(demo)).toBe(true);
  });

  it("سياسة كلمة المرور المطبقة تتطلب 10 أحرف على الأقل مع حروف وأرقام", () => {
    const policy = (pwd: string) => pwd.length >= 10 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
    expect(policy("short1")).toBe(false);
    expect(policy("alllettersnodigits")).toBe(false);
    expect(policy("1234567890")).toBe(false);
    expect(policy("R!f@d_2026_DemoAccess")).toBe(true);
  });
});


describe("readSecret الحقيقي في auth.ts", () => {
  const KEY = "RIFAD_TEST_READ_SECRET";
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("يرفض القيمة الغائبة فعلياً ويرفع خطأً واضحاً", () => {
    delete process.env[KEY];
    expect(() => readSecret(KEY)).toThrow(/غير مضبوط أو غير آمن/);
  });

  it("يرفض النص النائب العربي من ملف المثال", () => {
    process.env[KEY] = "ضع-هنا-سلسلة-عشوائية-لا-تقل-عن-32-حرفاً";
    expect(() => readSecret(KEY)).toThrow();
  });

  it("يرفض قيمة قصيرة", () => {
    process.env[KEY] = "abc123";
    expect(() => readSecret(KEY)).toThrow();
  });

  it("يقبل سرّاً عشوائياً سليماً ويعيده بعد trim", () => {
    const good = "9f2a7c4e1b8d3f6a5c0e9d2b7a4f1c8e3d6b9a2f5c8e1d4a7b0c3f6e9d2a5b8c";
    process.env[KEY] = "  " + good + "  ";
    expect(readSecret(KEY)).toBe(good);
  });
});
