import { describe, expect, it } from "vitest";
import { normalizeStage, parseSchoolRows, type SheetRow } from "@/lib/school-import";

// صفوف بتخطيط كشف المديرية الرسمي: ترويسة الوزارة ثم صف العناوين في الصف السادس،
// وعمود فارغ في البداية وعمود «م». البيانات هنا مختلقة للاختبار فقط.
const row = (n: number, cells: unknown[]): SheetRow => ({ rowNumber: n, cells: [undefined, ...cells] });
const OFFICIAL: SheetRow[] = [
  row(1, [null, null, null, "الجمهورية اليمنية"]),
  row(2, [null, null, null, "وزارة التربية والتعليم والبحث العلمي"]),
  row(5, [null, null, null, "قسم الجودة والاعتماد المدرسي"]),
  row(6, [null, "م", "رقم المدرسة", "المدرسة", "المحافظة", "المديرية", "النوع", "المرحلة", "العنوان", "مدير المدرسة", "التلفون"]),
  row(7, [null, 1, "90000001", "مدرسة الاختبار الأولى", "الحديدة ", "الجراحي ", "ذكور", " ثانوي", "حي أ", "مدير أ", 700000001]),
  row(8, [null, 2, "90000002", "مدرسة الاختبار الثانية", "الحديدة", "الجراحي", "إناث", "أساسي/ ثانوي", "حي ب", "مدير ب", "700000002"]),
  row(9, [null, 3, 0, "مدرسة بلا رقم", "الحديدة", "الجراحي", "مختلط", "أساسي", "حي ج", null, null]),
  row(10, [null, null, null, "مدرسة بلا رقم أخرى", "الحديدة", "الجراحي", "مختلط", "أساسي", null, null, null]),
];

describe("قراءة كشوف المدارس", () => {
  it("يكتشف صف العناوين في الكشف الرسمي ويطابق الأعمدة بأسمائها", () => {
    const r = parseSchoolRows(OFFICIAL);
    expect(r.headerRow).toBe(6);
    expect(r.rows).toHaveLength(4);
    const first = r.rows[0];
    expect(first).toMatchObject({ code: "90000001", name: "مدرسة الاختبار الأولى", governorate: "الحديدة", directorate: "الجراحي", type: "ذكور", stage: "ثانوي", phone: "700000001", principal: "مدير أ" });
    expect(r.rows[1].stage).toBe("أساسي وثانوي");
  });

  it("المدرسة بلا رقم تُعطى رمزاً مؤقتاً مع تنبيه ولا تُسقط", () => {
    const r = parseSchoolRows(OFFICIAL);
    const temp = r.rows.filter((x) => x.tempCode);
    expect(temp.map((x) => x.name)).toEqual(["مدرسة بلا رقم", "مدرسة بلا رقم أخرى"]);
    expect(new Set(temp.map((x) => x.code)).size).toBe(2);
    expect(r.warnings).toHaveLength(2);
  });

  it("يعمل مع قالب المنصة بلا ترويسة (الأعمدة بالترتيب الافتراضي)", () => {
    const r = parseSchoolRows([
      row(1, ["الكود", "الاسم", "المحافظة", "المديرية", "النوع", "المرحلة"]),
      row(2, ["SCH-1", "مدرسة القالب", "الحديدة", "الجراحي", "مختلط", "أساسي"]),
    ]);
    expect(r.headerRow).toBe(1);
    expect(r.rows[0]).toMatchObject({ code: "SCH-1", name: "مدرسة القالب", tempCode: false });
  });

  it("توحيد صيغ المرحلة", () => {
    expect(normalizeStage("أساسي/ ثانوي")).toBe("أساسي وثانوي");
    expect(normalizeStage("أساسي - ثانوي")).toBe("أساسي وثانوي");
    expect(normalizeStage("  ثانوي ")).toBe("ثانوي");
  });
});
