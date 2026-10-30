import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistance, inYemen, isShortMapsLink, parseLocationInput, parseMapUrl, roundCoord, validLatLng } from "@/lib/geo";

describe("استخراج الإحداثيات", () => {
  it("إحداثيات نصية بصيغ مختلفة", () => {
    for (const s of ["14.8012, 43.0021", "14.8012 43.0021", "14.8012،43.0021", "(14.8012, 43.0021)", "14.8012;43.0021", "١٤.٨٠١٢، ٤٣.٠٠٢١"]) {
      const p = parseLocationInput(s);
      expect(p, s).toMatchObject({ lat: 14.8012, lng: 43.0021, swapped: false, inYemen: true, from: "text" });
    }
  });

  it("درجات ودقائق وثوانٍ", () => {
    const p = parseLocationInput(`14°48'04.3"N 43°00'07.6"E`)!;
    expect(p.lat).toBeCloseTo(14.80119, 4);
    expect(p.lng).toBeCloseTo(43.00211, 4);
    const q = parseLocationInput(`43°00'07.6"E 14°48'04.3"N`)!;
    expect(q.lat).toBeCloseTo(14.80119, 4);
  });

  it("روابط خرائط جوجل: الدبوس !3d!4d أدق من مركز @", () => {
    const url = "https://www.google.com/maps/place/School/@14.9000,43.1000,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d14.8012!4d43.0021";
    expect(parseMapUrl(url)).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseLocationInput(url)).toMatchObject({ lat: 14.8012, lng: 43.0021, from: "url" });
  });

  it("روابط q و ll و @ وروابط واتساب وOSM وgeo", () => {
    expect(parseMapUrl("https://maps.google.com/?q=14.8012,43.0021&z=16")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("https://www.google.com/maps?ll=14.8012,43.0021")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("https://www.google.com/maps/@14.8012,43.0021,17z")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("https://www.google.com/maps/search/?api=1&query=14.8012%2C43.0021")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("https://www.openstreetmap.org/?mlat=14.8012&mlon=43.0021")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("https://www.openstreetmap.org/#map=16/14.8012/43.0021")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("geo:14.8012,43.0021?z=15")).toEqual({ lat: 14.8012, lng: 43.0021 });
    expect(parseMapUrl("https://example.org/nothing")).toBeNull();
  });

  it("يصحّح تبديل العرض والطول إذا كان المقلوب داخل اليمن", () => {
    const p = parseLocationInput("43.0021, 14.8012")!;
    expect(p).toMatchObject({ lat: 14.8012, lng: 43.0021, swapped: true, inYemen: true });
  });

  it("إحداثيات خارج اليمن تُقبل شكلاً لكن تُعلَّم", () => {
    expect(parseLocationInput("24.7136, 46.6753")).toMatchObject({ inYemen: false, swapped: false });
    expect(inYemen(12.6, 54.0)).toBe(true); // سقطرى
    expect(inYemen(30, 31)).toBe(false);
  });

  it("إدخالات غير صالحة", () => {
    expect(parseLocationInput("")).toBeNull();
    expect(parseLocationInput("abc")).toBeNull();
    expect(parseLocationInput("95, 200")).toBeNull();
    expect(validLatLng(NaN, 1)).toBe(false);
    expect(validLatLng(14, 43)).toBe(true);
  });

  it("الروابط المختصرة تُكتشف ولا تُحلَّل محلياً", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/xyz")).toBe(true);
    expect(isShortMapsLink("http://maps.app.goo.gl/x")).toBe(false);
    expect(isShortMapsLink("https://evil.example/maps.app.goo.gl")).toBe(false);
    expect(parseLocationInput("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
  });

  it("المسافة والتنسيق", () => {
    const d = distanceMeters({ lat: 14.8, lng: 43.0 }, { lat: 14.8, lng: 43.001 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
    expect(formatDistance(45)).toBe("45 م");
    expect(formatDistance(2500)).toBe("2.5 كم");
    expect(roundCoord(14.80123456789)).toBe(14.801235);
  });
});
