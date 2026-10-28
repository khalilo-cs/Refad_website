import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

/**
 * اختبارات تركيب المكوّنات (render smoke tests).
 *
 * البناء والتحقق من الأنواع لا يكشفان أخطاء التشغيل التي تقع أثناء التركيب
 * (وصول إلى خاصية undefined، أو خطأ في الوسائط). هذه الاختبارات تُركّب
 * المكوّنات فعلياً عبر React DOM Server وتتأكد من إنتاج HTML غير فارغ.
 */

import RifadLogo from "@/components/brand/rifad-logo";
import { PageHeader, StatCard, Alert, EmptyState, LoadingRows } from "@/components/ui";

const render = (el: React.ReactElement) => renderToString(el);

describe("مكوّنات الهوية", () => {
  it("يركّب الشعار بالرمز فقط", () => {
    const html = render(React.createElement(RifadLogo, { size: 40 }));
    expect(html).toContain("<svg");
    expect(html.length).toBeGreaterThan(200);
  });

  it("يركّب الشعار بالنص العربي", () => {
    const html = render(React.createElement(RifadLogo, { size: 40, withText: true }));
    expect(html).toContain("رِفاد");
    expect(html).toContain("للمتابعة والجودة المدرسية");
  });

  it("يركّب الشعار على خلفية داكنة", () => {
    const html = render(React.createElement(RifadLogo, { size: 40, tone: "light" }));
    expect(html).toContain("<svg");
  });
});

describe("مكوّنات الواجهة المشتركة", () => {
  it("يركّب ترويسة الصفحة بعنوان ووصف", () => {
    const html = render(
      React.createElement(PageHeader, { title: "المدارس", subtitle: "قائمة المدارس" })
    );
    expect(html).toContain("المدارس");
    expect(html).toContain("قائمة المدارس");
  });

  it("يركّب بطاقة إحصائية بقيمة رقمية", () => {
    const html = render(
      React.createElement(StatCard, { label: "عدد الزيارات", value: 18, hint: "11 مكتملة" })
    );
    expect(html).toContain("18");
    expect(html).toContain("عدد الزيارات");
  });

  it("يركّب بطاقة إحصائية بقيمة نصية", () => {
    const html = render(React.createElement(StatCard, { label: "النسبة", value: "64.3%" }));
    expect(html).toContain("64.3%");
  });

  it("يركّب تنبيهاً بنغمات مختلفة", () => {
    for (const tone of ["info", "warning", "danger", "success"] as const) {
      const html = render(
        React.createElement(Alert, { tone, title: "تنبيه", children: "نص التنبيه" })
      );
      expect(html).toContain("نص التنبيه");
    }
  });

  it("يركّب حالة فراغ", () => {
    const html = render(
      React.createElement(EmptyState, { title: "لا توجد بيانات", description: "ابدأ بالإضافة" })
    );
    expect(html).toContain("لا توجد بيانات");
  });

  it("يركّب صفوف التحميل", () => {
    const html = render(React.createElement(LoadingRows, { rows: 3 }));
    expect(html.length).toBeGreaterThan(100);
  });
});
