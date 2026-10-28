import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * اختبارات الجاهزية للعمل دون اتصال (PWA).
 *
 * تتحقق من أن ملفات التثبيت موجودة وصالحة، وأن عامل الخدمة
 * لا يتدخل في طلبات الكتابة أو مسارات المصادقة، وأن مخزن
 * المسودات لا ينهار خارج المتصفح.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("ملف تثبيت التطبيق (manifest)", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));

  it("معرَّف بالعربية واتجاه يمين-إلى-يسار", () => {
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
    expect(typeof manifest.name).toBe("string");
    expect(manifest.name.length).toBeGreaterThan(5);
  });

  it("يعمل كتطبيق مستقل بشاشة كاملة", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBe("/");
  });

  it("يحمل أيقونات عادية وقابلة للقصّ (maskable)", () => {
    const purposes = manifest.icons.map((i: { purpose?: string }) => i.purpose ?? "any");
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("كل أيقونة مذكورة موجودة فعلاً على القرص", () => {
    for (const icon of manifest.icons) {
      const file = path.join(root, "public", icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), `مفقود: ${icon.src}`).toBe(true);
      const buf = fs.readFileSync(file);
      // توقيع PNG
      expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(buf.length).toBeGreaterThan(1000);
    }
  });
});

describe("عامل الخدمة (service worker)", () => {
  const sw = read("public/sw.js");

  it("موجود ويحتوي إصداراً للتخزين المؤقت", () => {
    expect(sw).toContain("VERSION");
    expect(sw.length).toBeGreaterThan(800);
  });

  it("يتجاوز طلبات الكتابة ولا يخزّنها", () => {
    expect(sw).toContain('req.method !== "GET"');
  });

  it("يستثني المصادقة والتحقق والتصدير من التخزين", () => {
    expect(sw).toContain("/api/auth");
    expect(sw).toContain("/api/verify");
    expect(sw).toContain("export");
  });

  it("يحتوي صفحة عدم الاتصال ضمن قشرة التطبيق", () => {
    expect(sw).toContain('"/offline"');
  });

  it("ينظّف الإصدارات القديمة عند التنشيط", () => {
    expect(sw).toContain("caches.delete");
    expect(sw).toContain("clients.claim");
  });
});

describe("مخزن المسودات المحلي", () => {
  it("يعيد نتائج آمنة خارج المتصفح بدل الانهيار", async () => {
    const { listLocalScores, countPending, getLocalScores } = await import(
      "@/lib/offline/drafts"
    );
    expect(await listLocalScores()).toEqual([]);
    expect(await countPending()).toBe(0);
    expect(await getLocalScores("any-visit")).toEqual({});
  });

  it("لا يرمي خطأ عند محاولة الحفظ بلا IndexedDB", async () => {
    const { saveLocalScore } = await import("@/lib/offline/drafts");
    await expect(
      saveLocalScore({
        visitId: "v1",
        indicatorId: "i1",
        status: "EVALUATED",
        score: 2,
      })
    ).resolves.toBeUndefined();
  });
});

describe("رمز التحقق二维码", () => {
  it("يولّد صورة QR صالحة لرابط التحقق", async () => {
    const QRCode = (await import("qrcode")).default;
    const url = "https://rifad.example/verify?code=Y5MXREXGXC";
    const png = await QRCode.toBuffer(url, { type: "png", width: 120, margin: 1 });

    expect(png.length).toBeGreaterThan(500);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const dataUrl = await QRCode.toDataURL(url, { margin: 1 });
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("صفحة عدم الاتصال", () => {
  it("موجودة وتوضّح أن الاعتماد يتطلب اتصالاً", () => {
    const page = read("src/app/offline/page.tsx");
    expect(page).toContain("لا يوجد اتصال");
    expect(page).toContain("اعتماد التقارير");
    expect(page).toContain("ستُزامَن");
  });
});
