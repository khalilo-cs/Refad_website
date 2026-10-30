import { describe, expect, it, vi } from "vitest";
import { isAllowedMapsUrl, resolveMapsLink } from "../geo-resolve";

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

describe("isAllowedMapsUrl", () => {
  it("يقبل نطاقات جوجل عبر https فقط", () => {
    expect(isAllowedMapsUrl("https://maps.app.goo.gl/abc")).toBe(true);
    expect(isAllowedMapsUrl("https://www.google.com/maps/place/x")).toBe(true);
    expect(isAllowedMapsUrl("http://maps.app.goo.gl/abc")).toBe(false);
    expect(isAllowedMapsUrl("https://evil.com/maps")).toBe(false);
    expect(isAllowedMapsUrl("https://google.com.evil.com/")).toBe(false);
    expect(isAllowedMapsUrl("https://user:pw@google.com/")).toBe(false);
    expect(isAllowedMapsUrl("https://169.254.169.254/")).toBe(false);
  });
});

describe("resolveMapsLink", () => {
  it("يحلّ الإحداثيات النصية دون شبكة", async () => {
    const f = vi.fn();
    const r = await resolveMapsLink("14.80, 43.00", f as any);
    expect(r.ok && r.location.lat).toBe(14.8);
    expect(f).not.toHaveBeenCalled();
  });
  it("يتبع إعادة التوجيه المختصرة إلى رابط بإحداثيات", async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect("https://www.google.com/maps/place/x/@14.8012,43.0034,17z"));
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", f as any);
    expect(r.ok && r.location.lng).toBe(43.0034);
  });
  it("يرفض إعادة توجيه إلى مضيف غير مسموح", async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect("https://evil.com/@14.8,43.0"));
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", f as any);
    expect(r).toEqual({ ok: false, reason: "not_allowed" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("يرفض روابط غير جوجل دون أي طلب", async () => {
    const f = vi.fn();
    expect((await resolveMapsLink("https://example.com/x", f as any)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("يتوقف عند حلقة إعادة توجيه", async () => {
    const f = vi.fn().mockImplementation(async () => redirect("https://maps.app.goo.gl/loop"));
    const r = await resolveMapsLink("https://maps.app.goo.gl/loop", f as any);
    expect(r.ok).toBe(false);
    expect(f.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it("يقرأ الدبوس من محتوى الصفحة", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('x !3d14.8123!4d43.0456 y', { status: 200 }));
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", f as any);
    expect(r.ok && r.location.lat).toBe(14.8123);
  });
  it("يعيد network عند فشل الاتصال", async () => {
    const f = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await resolveMapsLink("https://maps.app.goo.gl/abc", f as any)).toEqual({ ok: false, reason: "network" });
  });
});
