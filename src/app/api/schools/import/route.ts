import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, uuid, nowISO, getDb } from "@/lib/db/sqlite";
import * as ExcelJS from "exceljs";

export const runtime = "nodejs";

type ParsedRow = {
  code: string;
  name: string;
  governorate: string;
  directorate: string;
  type: string;
  stage: string;
  address?: string;
  contact_phone?: string;
  contact_email?: string;
  principal_name?: string;
};

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return NextResponse.json({ message: "غير مصرح بالاستيراد" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const commit = searchParams.get("commit") === "true";

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ message: "لم يتم رفع ملف" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      await workbook.csv.read(arrayBuffer as any);
    } else {
      await workbook.xlsx.load(arrayBuffer as any);
    }
  } catch {
    return NextResponse.json({ message: "تعذر قراءة الملف. تأكد أنه Excel أو CSV صالح" }, { status: 400 });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "الملف فارغ" }, { status: 400 });

  // قواميس الأسماء للمحافظات والمديريات
  const governorates = query<{ id: string; name: string }>("SELECT id, name FROM governorates");
  const directorates = query<{ id: string; name: string; governorate_id: string }>("SELECT id, name, governorate_id FROM directorates");
  const existingCodes = query<{ code: string }>("SELECT code FROM schools");
  const codeSet = new Set(existingCodes.map((x) => x.code));

  const valid: ParsedRow[] = [];
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const seenCodes = new Set<string>();

  let rowNo = 1;
  sheet.eachRow((row: any, r: number) => {
    if (r === 1) { rowNo = r; return; } // ترويسة
    const get = (col: string) => (row.getCell(col)?.value ?? "").toString().trim();
    const code = get("A");
    const name = get("B");
    const governorateName = get("C");
    const directorateName = get("D");
    const type = get("E");
    const stage = get("F");
    const address = get("G") || undefined;
    const phone = get("H") || undefined;
    const email = get("I") || undefined;
    const principal = get("J") || undefined;

    rowNo = r;
    if (!code && !name && !governorateName) return; // صف فارغ

    if (!code) errors.push({ row: r, field: "code", message: "الكود المدرسي مطلوب" });
    else if (codeSet.has(code) || seenCodes.has(code)) errors.push({ row: r, field: "code", message: "الكود مكرر" });
    else seenCodes.add(code);

    if (!name) errors.push({ row: r, field: "name", message: "اسم المدرسة مطلوب" });
    if (!governorateName) errors.push({ row: r, field: "governorate", message: "المحافظة مطلوبة" });
    else if (!governorates.find((g) => g.name === governorateName)) errors.push({ row: r, field: "governorate", message: "المحافظة غير موجودة" });

    if (!directorateName) errors.push({ row: r, field: "directorate", message: "المديرية مطلوبة" });
    else {
      const dir = directorates.find((x) => x.name === directorateName && (!governorateName || x.governorate_id === governorates.find((g) => g.name === governorateName)?.id));
      if (!dir) errors.push({ row: r, field: "directorate", message: "المديرية غير مطابقة للمحافظة المختارة" });
    }
    if (!type) errors.push({ row: r, field: "type", message: "نوع المدرسة مطلوب" });
    if (!stage) errors.push({ row: r, field: "stage", message: "المرحلة الدراسية مطلوبة" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ row: r, field: "contact_email", message: "بريد إلكتروني غير صالح" });

    if (errors.filter((e) => e.row === r).length === 0) {
      valid.push({ code, name, governorate: governorateName!, directorate: directorateName!, type, stage, address: address || "", contact_phone: phone || undefined, contact_email: email, principal_name: principal });
    }
  });

  if (!commit) {
    return NextResponse.json({
      validCount: valid.length,
      errorCount: errors.length,
      errors: errors.slice(0, 100),
      sample: valid.slice(0, 5),
    });
  }

  if (valid.length === 0) {
    return NextResponse.json({ message: "لا توجد صفوف صالحة للحفظ", errors }, { status: 400 });
  }

  const db = getDb();
  const tx = db.transaction(() => {
    for (const row of valid) {
      const g = governorates.find((x: { id: string; name: string }) => x.name === row.governorate)!;
      const d = directorates.find((x: { id: string; name: string; governorate_id: string }) => x.name === row.directorate && x.governorate_id === g.id)!;
      const id = uuid();
      const now = nowISO();
      db.prepare(
        `INSERT INTO schools (id, code, name, governorate_id, directorate_id, address, type, stage, contact_phone, contact_email, principal_name, data_source, status, last_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXCEL_IMPORT', 'ACTIVE', ?, ?)`
      ).run(id, row.code, row.name, g.id, d.id, row.address || null, row.type, row.stage, row.contact_phone || null, row.contact_email || null, row.principal_name || null, now, now);
      auditLog({
        userId: session.userId,
        action: "CREATE",
        entityType: "School",
        entityId: id,
        newValues: { code: row.code, name: row.name, source: "EXCEL_IMPORT" },
      });
    }
  });
  tx();

  return NextResponse.json({ message: `تمت إضافة ${valid.length} مدرسة بنجاح`, imported: valid.length, errors: errors.slice(0, 100) });
}
