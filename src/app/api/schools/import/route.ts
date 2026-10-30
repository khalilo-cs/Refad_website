import { NextRequest, NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, uuid, nowISO, transaction , exec } from "@/lib/db/sqlite";
import * as ExcelJS from "exceljs";
import { parseSchoolRows, TEMP_CODE_PREFIX, type SheetRow } from "@/lib/school-import";
import { inYemen } from "@/lib/geo";

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
  latitude?: number;
  longitude?: number;
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

  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ message: "حجم الملف يتجاوز 5 ميجابايت" }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(file.name)) return NextResponse.json({ message: "الصيغ المقبولة: xlsx أو csv" }, { status: 400 });
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
  const governorates = await query<{ id: string; name: string }>("SELECT id, name FROM governorates");
  const directorates = await query<{ id: string; name: string; governorate_id: string }>("SELECT id, name, governorate_id FROM directorates");
  const existingCodes = await query<{ code: string }>("SELECT code FROM schools");
  const codeSet = new Set(existingCodes.map((x) => x.code));

  const valid: ParsedRow[] = [];
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const seenCodes = new Set<string>();

  // قراءة مرنة: صف العناوين يُكتشف تلقائياً والأعمدة تُطابق بأسمائها
  const sheetRows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row: any, r: number) => {
    sheetRows.push({ rowNumber: r, cells: (row.values as unknown[]) ?? [] });
  });
  const parsed = parseSchoolRows(sheetRows);
  const warnings = [...parsed.warnings];
  const existingNames = await query<{ name: string; directorate_id: string }>("SELECT name, directorate_id FROM schools");
  let tempSeq = 0;
  const nextTemp = () => {
    let c: string;
    do { tempSeq++; c = `${TEMP_CODE_PREFIX}${String(tempSeq).padStart(3, "0")}`; } while (codeSet.has(c) || seenCodes.has(c));
    return c;
  };

  for (const p of parsed.rows) {
    const r = p.row;
    const governorateName = p.governorate;
    const directorateName = p.directorate;
    const gov = governorates.find((g) => g.name === governorateName);
    const dir = directorates.find((x) => x.name === directorateName && (!gov || x.governorate_id === gov.id));
    let code = p.code;

    if (p.tempCode) {
      if (dir && existingNames.some((e) => e.name === p.name && e.directorate_id === dir.id)) {
        errors.push({ row: r, field: "name", message: `«${p.name}» موجودة مسبقاً في هذه المديرية` });
        continue;
      }
      code = nextTemp();
      const w = warnings.find((x) => x.row === r && x.field === "code");
      if (w) w.message = `«${p.name}» بلا رقم مدرسة؛ ستُحفظ بالرمز المؤقت ${code} ويمكن تعديله لاحقاً`;
    } else if (codeSet.has(code) || seenCodes.has(code)) {
      errors.push({ row: r, field: "code", message: `الكود ${code} مكرر` });
    }
    seenCodes.add(code);

    if (!p.name) errors.push({ row: r, field: "name", message: "اسم المدرسة مطلوب" });
    if (!governorateName) errors.push({ row: r, field: "governorate", message: "المحافظة مطلوبة" });
    else if (!gov) errors.push({ row: r, field: "governorate", message: `المحافظة «${governorateName}» غير موجودة في المنصة` });
    if (!directorateName) errors.push({ row: r, field: "directorate", message: "المديرية مطلوبة" });
    else if (!dir) errors.push({ row: r, field: "directorate", message: `المديرية «${directorateName}» غير مطابقة للمحافظة` });
    if (!p.type) errors.push({ row: r, field: "type", message: "نوع المدرسة مطلوب" });
    if (!p.stage) errors.push({ row: r, field: "stage", message: "المرحلة الدراسية مطلوبة" });
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) errors.push({ row: r, field: "contact_email", message: "بريد إلكتروني غير صالح" });
    const lat = p.lat, lng = p.lng;
    if ((lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)))
      errors.push({ row: r, field: "coordinates", message: "إحداثيات غير صالحة (خط العرض -90..90، خط الطول -180..180)" });
    if ((lat == null) !== (lng == null)) errors.push({ row: r, field: "coordinates", message: "يجب إدخال خطي العرض والطول معاً" });
    else if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng) && !inYemen(lat, lng))
      errors.push({ row: r, field: "coordinates", message: "الإحداثيات خارج اليمن — تحقق من عدم قلب خطّي العرض والطول" });
    if (session.roleKey === "EDUCATION_DIRECTOR" && directorateName) {
      const own = session.directorateId && directorates.find((x) => x.id === session.directorateId)?.name;
      if (own !== directorateName) errors.push({ row: r, field: "directorate", message: "لا يمكنك إضافة مدارس خارج مديريتك" });
    }

    if (errors.filter((e) => e.row === r).length === 0) {
      valid.push({ code, name: p.name, governorate: governorateName, directorate: directorateName, type: p.type, stage: p.stage, address: p.address || "", contact_phone: p.phone, contact_email: p.email, principal_name: p.principal, latitude: lat, longitude: lng });
    }
  }

  if (!commit) {
    return NextResponse.json({
      validCount: valid.length,
      errorCount: errors.length,
      errors: errors.slice(0, 500),
      warnings: warnings.slice(0, 500),
      headerRow: parsed.headerRow,
      sample: valid.slice(0, 5),
      totalRows: valid.length + new Set(errors.map((e) => e.row)).size,
    });
  }

  if (valid.length === 0) {
    return NextResponse.json({ message: "لا توجد صفوف صالحة للحفظ", errors }, { status: 400 });
  }
  await transaction(async () => {
    for (const row of valid) {
      const g = governorates.find((x: { id: string; name: string }) => x.name === row.governorate)!;
      const d = directorates.find((x: { id: string; name: string; governorate_id: string }) => x.name === row.directorate && x.governorate_id === g.id)!;
      const id = uuid();
      const now = nowISO();
      const hasLoc = row.latitude != null && row.longitude != null;
      await exec(`INSERT INTO schools (id, code, name, governorate_id, directorate_id, address, type, stage, contact_phone, contact_email, principal_name, latitude, longitude, data_source, status, last_updated_at, created_at, location_source, location_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXCEL_IMPORT', 'ACTIVE', ?, ?, ?, ?)`, [id, row.code, row.name, g.id, d.id, row.address || null, row.type, row.stage, row.contact_phone || null, row.contact_email || null, row.principal_name || null, row.latitude ?? null, row.longitude ?? null, now, now, hasLoc ? "IMPORT" : null, hasLoc ? now : null]);
      await auditLog({
        userId: session.userId,
        action: "CREATE",
        entityType: "School",
        entityId: id,
        newValues: { code: row.code, name: row.name, source: "EXCEL_IMPORT" },
      });
    }
  });

  return NextResponse.json({ message: `تمت إضافة ${valid.length} مدرسة بنجاح`, imported: valid.length, errors: errors.slice(0, 500), warnings: warnings.slice(0, 500) });
}
