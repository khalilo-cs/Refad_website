import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateSecret, hotp, verifyTotp } from "../totp";

// سرّ اختبار RFC 6238 (ASCII "12345678901234567890") بصيغة base32
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP", () => {
  it("يطابق متجهات RFC 4226/6238", () => {
    expect(hotp(RFC_SECRET, 0)).toBe("755224");
    expect(hotp(RFC_SECRET, 1)).toBe("287082");
    expect(hotp(RFC_SECRET, 2)).toBe("359152");
    // RFC 6238: الزمن 59 ثانية → الخطوة 1 → آخر 6 أرقام من 94287082
    expect(hotp(RFC_SECRET, 1)).toBe("287082");
  });
  it("يتحقق ضمن نافذة ±1 ويرفض خارجها وغير الصالح", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 1000 / 30);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 3), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
  });
  it("السرّ المخزَّن مشفَّر ويُستعاد", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    const blob = encryptSecret(s);
    expect(blob).not.toContain(s);
    expect(decryptSecret(blob)).toBe(s);
    expect(() => decryptSecret(blob.replace(/.$/, "A"))).toThrow();
  });
});
