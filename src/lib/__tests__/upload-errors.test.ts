import { describe, expect, it } from "vitest";
import { uploadErrorMessage } from "../upload-errors";

describe("رسائل أخطاء الرفع", () => {
  it("رفض الاستضافة للحجم (413) يظهر برسالة عربية واضحة لا برسالة عامة", () => {
    expect(uploadErrorMessage(413, null)).toContain("حجم الملف");
  });
  it("تعرض رسالة الخادم كما هي، وإلا الرسالة الاحتياطية", () => {
    expect(uploadErrorMessage(400, { message: "نوع الملف غير مسموح" })).toBe("نوع الملف غير مسموح");
    expect(uploadErrorMessage(500, {}, "تعذّر الرفع")).toBe("تعذّر الرفع");
  });
});
