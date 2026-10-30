import { describe, expect, it } from "vitest";
import { canonicalPhone, credentialsMessage, isValidPhone, mapViewHref, navigateHref, parsePhone, splitPhones, telHref, toAsciiDigits, whatsappHref } from "@/lib/phone";

describe("أرقام الهواتف اليمنية", () => {
  it("الجوال 9 خانات يُقبل بكل صيغ الكتابة ويُوحَّد", () => {
    for (const raw of ["738770724", "0738770724", "+967738770724", "967738770724", "00967738770724", "+967 73 877 0724", " 73-877-0724 ", 738770724]) {
      const p = parsePhone(raw);
      expect(p.valid, String(raw)).toBe(true);
      expect(p.kind).toBe("mobile");
      expect(p.canonical).toBe("738770724");
      expect(p.e164).toBe("+967738770724");
      expect(p.display).toBe("73 877 0724");
      expect(p.whatsappCapable).toBe(true);
    }
  });

  it("الأرقام العربية-الهندية تُحوَّل", () => {
    expect(toAsciiDigits("٧٣٨٧٧٠٧٢٤")).toBe("738770724");
    expect(parsePhone("٠٧٣٨٧٧٠٧٢٤").canonical).toBe("738770724");
    expect(parsePhone("۷۳۸۷۷۰۷۲۴").valid).toBe(true);
  });

  it("الأرقام الثابتة تصلح للاتصال لا للواتساب", () => {
    const p = parsePhone("03 123456");
    expect(p).toMatchObject({ valid: true, kind: "landline", canonical: "03123456", e164: "+9673123456" });
    expect(p.whatsappCapable).toBe(false);
    expect(telHref("03123456")).toBe("tel:+9673123456");
    expect(whatsappHref("03123456")).toBeNull();
  });

  it("الأرقام الدولية غير اليمنية تُقبل وتصلح للواتساب", () => {
    const p = parsePhone("+966 50 123 4567");
    expect(p).toMatchObject({ valid: true, kind: "international", e164: "+966501234567" });
    expect(whatsappHref("+966501234567")).toBe("https://wa.me/966501234567");
  });

  it("الأرقام الخاطئة تُرفض بسبب عربي واضح (كما في الكشف: 10 خانات)", () => {
    const longOne = parsePhone("7341234567");
    expect(longOne.valid).toBe(false);
    expect(longOne.reason).toContain("أطول");
    expect(parsePhone("73877").reason).toContain("ناقص");
    expect(parsePhone("").valid).toBe(false);
    expect(parsePhone(null).valid).toBe(false);
    expect(parsePhone("abc").valid).toBe(false);
    expect(telHref("7341234567")).toBeNull();
    expect(whatsappHref("7341234567")).toBeNull();
  });

  it("رمز 74 غير المألوف يُقبل كجوال (لا نرفض بادئات جديدة)", () => {
    expect(isValidPhone("741234567")).toBe(true);
  });

  it("روابط الواتساب مع نص جاهز مُرمَّز", () => {
    const href = whatsappHref("738770724", "مرحباً\nبكم")!;
    expect(href.startsWith("https://wa.me/967738770724?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toBe("مرحباً\nبكم");
  });

  it("التخزين المعياري: الصالح يُوحَّد وغير الصالح يُحفظ منظَّفاً", () => {
    expect(canonicalPhone("+967 73 877 0724")).toBe("738770724");
    expect(canonicalPhone("7341234567")).toBe("7341234567");
    expect(canonicalPhone("  ")).toBeNull();
    expect(canonicalPhone(undefined)).toBeNull();
  });

  it("فصل عدة أرقام في خلية واحدة", () => {
    expect(splitPhones("738770724 / 777784522")).toEqual(["738770724", "777784522"]);
    expect(splitPhones("738770724، 777784522 و 711111111")).toEqual(["738770724", "777784522", "711111111"]);
    expect(splitPhones("")).toEqual([]);
  });

  it("رسالة بيانات الدخول وروابط الخرائط", () => {
    const m = credentialsMessage({ name: "أحمد", loginUrl: "https://x.example", login: "71809001", password: "Abc-1234-xyz" });
    expect(m).toContain("اسم المستخدم: 71809001");
    expect(m).toContain("كلمة المرور المؤقتة: Abc-1234-xyz");
    expect(m).toContain("تغيير كلمة المرور");
    expect(credentialsMessage({ name: "أ", loginUrl: "u", login: "l", password: "p", mustChange: false })).not.toContain("سيُطلب");
    expect(navigateHref(14.8, 43.0)).toContain("destination=14.8,43");
    expect(navigateHref(null, 43)).toBeNull();
    expect(mapViewHref(14.8, 43)).toContain("query=14.8,43");
  });
});
