import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as ExcelJS from "exceljs";
import { EMAILS, sessionFor, setupTestDb } from "@/test/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, getServerSession: vi.fn() };
});

let auth: typeof import("../auth");
let q: typeof import("../db/sqlite");
let route: { POST: (r: NextRequest) => Promise<Response> };
let gov: string, dir: string;

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("كشف");
  ws.addRow(["م", "رقم المدرسة", "المدرسة", "المحافظة", "المديرية", "النوع", "المرحلة", "العنوان", "مدير المدرسة", "التلفون"]);
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], "kashf.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const post = async (file: File, qs: string) => {
  const fd = new FormData();
  fd.append("file", file);
  return route.POST(new NextRequest(`http://localhost/api/schools/import?${qs}`, { method: "POST", body: fd }));
};

beforeAll(async () => {
  await setupTestDb();
  auth = await import("../auth");
  q = await import("../db/sqlite");
  route = (await import("@/app/api/schools/import/route")) as any;
  const d = (await q.queryOne<any>("SELECT d.id, d.name, g.name AS gname FROM directorates d JOIN governorates g ON g.id = d.governorate_id LIMIT 1"))!;
  gov = d.gname; dir = d.name;
  vi.mocked(auth.getServerSession).mockResolvedValue(await sessionFor(EMAILS.admin));
});

describe("استيراد الكشف مع تحديث المدارس الموجودة", () => {
  it("يضيف الجديد أولاً، ثم يحدّث اسم المدير والهاتف للموجود بدل رفضه", async () => {
    const first = await xlsx([[1, "U-501", "مدرسة التحديث الأولى", gov, dir, "مختلط", "أساسي", "حي أ", "", ""], [2, "", "مدرسة بلا رمز", gov, dir, "ذكور", "ثانوي", "", "", ""]]);
    const a = await (await post(first, "commit=true")).json();
    expect(a.imported).toBe(2);

    const second = await xlsx([[1, "U-501", "مدرسة التحديث الأولى", gov, dir, "مختلط", "أساسي", "حي أ", "مدير تجريبي أول", 738770724], [2, "", "مدرسة بلا رمز", gov, dir, "ذكور", "ثانوي", "", "مدير تجريبي ثانٍ", "771112233"], [3, "U-777", "مدرسة جديدة تماماً", gov, dir, "إناث", "أساسي", "", "مديرة تجريبية", "733000111"]]);
    // دون وضع التحديث تُرفض المكررة
    const strict = await (await post(second, "")).json();
    expect(strict.errorCount).toBeGreaterThan(0);
    const preview = await (await post(second, "update=true")).json();
    expect(preview.updateCount).toBe(2);
    expect(preview.validCount).toBe(1);
    const done = await (await post(second, "update=true&commit=true")).json();
    expect(done).toMatchObject({ imported: 1, updated: 2 });
    const s1 = await q.queryOne<any>("SELECT principal_name, contact_phone FROM schools WHERE code = 'U-501'");
    expect(s1).toMatchObject({ principal_name: "مدير تجريبي أول", contact_phone: "738770724" });
    const s2 = await q.queryOne<any>("SELECT principal_name, contact_phone FROM schools WHERE name = 'مدرسة بلا رمز'");
    expect(s2).toMatchObject({ principal_name: "مدير تجريبي ثانٍ", contact_phone: "771112233" });
  });
  it("لا يمحو بيانات موجودة بخلايا فارغة", async () => {
    const f = await xlsx([[1, "U-501", "مدرسة التحديث الأولى", gov, dir, "مختلط", "أساسي", "", "", ""]]);
    await post(f, "update=true&commit=true");
    const s1 = await q.queryOne<any>("SELECT principal_name, contact_phone FROM schools WHERE code = 'U-501'");
    expect(s1.principal_name).toBe("مدير تجريبي أول");
  });
});
