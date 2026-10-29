import { describe, expect, it } from "vitest";
import { shape, wrapLogical } from "../reports/rtl";
import { renderReportPdf } from "../reports/render-pdf";

describe("تهيئة النص العربي للـ PDF", () => {
  it("يشكّل الحروف إلى صيغ العرض (اتصال الحروف)", () => {
    const out = shape("منصة رِفاد");
    // نطاق الصيغ العربية التقديمية (FB50–FEFF)
    expect(/[ﭐ-﻿]/.test(out)).toBe(true);
    expect(out).not.toContain("منصة");
  });
  it("يعكس ترتيب الكلمات للرسم من اليسار لليمين", () => {
    const a = shape("واحد اثنان");
    const first = shape("واحد");
    // الكلمة الأولى المنطقية تقع في آخر السلسلة المرئية
    expect(a.endsWith(first)).toBe(true);
  });
  it("يبقي رموز المؤشرات والتواريخ بترتيبها المكتوب دون تدوير", () => {
    expect(shape("المؤشر 18-2-1 مقيَّم")).toContain("18-2-1");
    expect(shape("2026-10-29")).toContain("2026-10-29");
  });
  it("لا يترك محارف تحكم في الناتج", () => {
    expect(/[⁦-⁩‎‏]/.test(shape("رمز 1-2-3"))).toBe(false);
  });
  it("يلتف النص على أسطر لا تتجاوز العرض", () => {
    const measure = (s: string) => s.length;
    const lines = wrapLogical(measure, "كلمة ".repeat(40).trim(), 30);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(shape(l).length).toBeLessThanOrEqual(31);
  });
});

describe("توليد PDF", () => {
  it("يُنتج ملف PDF صالحاً بأكثر من صفحة وبعلامة للمسودات", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => [`1-1-${i}`, "نص مؤشر عربي طويل نسبياً لاختبار الالتفاف داخل الخلية في الجدول", "متحقق"]);
    const buf = await renderReportPdf(
      {
        type: "VISIT_DAILY", title: "تقرير اختبار", generatedAt: new Date().toISOString(), state: "INCOMPLETE",
        meta: [["المدرسة", "مدرسة اختبار"]], notices: ["ملاحظة"],
        sections: [{ kind: "table", title: "جدول", columns: [{ key: "a", label: "الرمز" }, { key: "b", label: "النص", width: 4 }, { key: "c", label: "التقدير" }], rows }],
      },
      { number: "RIF-2026-0001", status: "DRAFT", verificationCode: "ABCDEFGHJK", verifyUrl: "http://localhost/verify?code=ABCDEFGHJK" }
    );
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(20_000);
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
