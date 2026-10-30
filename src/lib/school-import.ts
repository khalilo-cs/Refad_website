/**
 * قراءة كشوف المدارس من Excel/CSV بمرونة:
 *  - يبحث عن صف العناوين في أول 20 صفاً (الكشوف الرسمية تبدأ بترويسة الوزارة).
 *  - يطابق الأعمدة بأسمائها لا بمواقعها، مع مرادفات شائعة («رقم المدرسة» = «الكود»...).
 *  - إن لم يجد صف عناوين يعود إلى ترتيب قالب المنصة (A..L في الصف الأول).
 *  - ينظّف المسافات ويوحّد صيغ المرحلة.
 *  - المدرسة بلا رقم تُعطى رمزاً مؤقتاً واضحاً مع تنبيه، بدل إسقاطها.
 */

export type Field =
  | "code" | "name" | "governorate" | "directorate" | "type" | "stage"
  | "address" | "phone" | "email" | "principal" | "lat" | "lng";

const SYNONYMS: Record<Field, string[]> = {
  code: ["الكود", "رقم المدرسة", "كود المدرسة", "الرقم المدرسي", "رمز المدرسة"],
  name: ["الاسم", "المدرسة", "اسم المدرسة"],
  governorate: ["المحافظة"],
  directorate: ["المديرية"],
  type: ["النوع", "نوع المدرسة"],
  stage: ["المرحلة", "المرحلة الدراسية"],
  address: ["العنوان", "الموقع"],
  phone: ["الهاتف", "التلفون", "التليفون", "رقم الهاتف", "الجوال"],
  email: ["البريد الإلكتروني", "البريد", "الإيميل"],
  principal: ["مدير المدرسة", "المدير", "اسم المدير"],
  lat: ["خط العرض", "خط العرض (اختياري)"],
  lng: ["خط الطول", "خط الطول (اختياري)"],
};

/** ترتيب قالب المنصة الافتراضي (الأعمدة 1..12). */
const TEMPLATE_ORDER: Field[] = ["code", "name", "governorate", "directorate", "type", "stage", "address", "phone", "email", "principal", "lat", "lng"];

export const TEMP_CODE_PREFIX = "TEMP-";

export function clean(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return clean(o.richText.map((r) => r.text).join(""));
    if (o.text != null) return clean(o.text);
    if (o.result != null) return clean(o.result);
  }
  return String(v).replace(/\s+/g, " ").trim();
}

const norm = (s: string) => clean(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[()]/g, "").trim();

function matchField(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  for (const [field, names] of Object.entries(SYNONYMS) as [Field, string[]][]) {
    if (names.some((n) => norm(n) === h)) return field;
  }
  return null;
}

export function normalizeStage(stage: string): string {
  const s = clean(stage).replace(/\s*[/،,-]\s*/g, "/");
  if (/^اساسي\/ثانوي$|^أساسي\/ثانوي$|^أساسي و ?ثانوي$/.test(s)) return "أساسي وثانوي";
  return s;
}

export type SheetRow = { rowNumber: number; cells: unknown[] }; // cells[1..n] كما في ExcelJS

export type ParsedSchool = {
  row: number;
  code: string;
  tempCode: boolean;
  name: string;
  governorate: string;
  directorate: string;
  type: string;
  stage: string;
  address?: string;
  phone?: string;
  email?: string;
  principal?: string;
  lat?: number;
  lng?: number;
};

export type ParseResult = {
  headerRow: number | null;
  mapping: Partial<Record<Field, number>>;
  rows: ParsedSchool[];
  warnings: { row: number; field: string; message: string }[];
};

/** يحدد صف العناوين وخريطة الأعمدة. */
export function detectHeader(rows: SheetRow[]): { headerRow: number | null; mapping: Partial<Record<Field, number>> } {
  for (const r of rows.slice(0, 20)) {
    const mapping: Partial<Record<Field, number>> = {};
    r.cells.forEach((c, idx) => {
      const f = matchField(clean(c));
      if (f && mapping[f] == null) mapping[f] = idx;
    });
    if (mapping.name != null && (mapping.code != null || mapping.governorate != null)) return { headerRow: r.rowNumber, mapping };
  }
  const mapping: Partial<Record<Field, number>> = {};
  TEMPLATE_ORDER.forEach((f, i) => (mapping[f] = i + 1));
  return { headerRow: null, mapping };
}

export function parseSchoolRows(rows: SheetRow[]): ParseResult {
  const { headerRow, mapping } = detectHeader(rows);
  const startAfter = headerRow ?? 1;
  const out: ParsedSchool[] = [];
  const warnings: ParseResult["warnings"] = [];
  let tempSeq = 0;
  for (const r of rows) {
    if (r.rowNumber <= startAfter) continue;
    const get = (f: Field) => (mapping[f] == null ? "" : clean(r.cells[mapping[f]!]));
    const name = get("name");
    const rawCode = get("code");
    if (!name && !rawCode && !get("governorate")) continue; // صف فارغ أو تذييل
    let code = rawCode;
    let tempCode = false;
    if (!code || /^0+$/.test(code)) {
      tempSeq++;
      code = `${TEMP_CODE_PREFIX}${String(tempSeq).padStart(3, "0")}`;
      tempCode = true;
      if (name) warnings.push({ row: r.rowNumber, field: "code", message: `«${name}» بلا رقم مدرسة؛ أُعطيت الرمز المؤقت ${code} ويمكن تعديله لاحقاً` });
    }
    const latRaw = get("lat");
    const lngRaw = get("lng");
    out.push({
      row: r.rowNumber,
      code,
      tempCode,
      name,
      governorate: get("governorate"),
      directorate: get("directorate"),
      type: get("type"),
      stage: normalizeStage(get("stage")),
      address: get("address") || undefined,
      phone: get("phone") || undefined,
      email: get("email") || undefined,
      principal: get("principal") || undefined,
      lat: latRaw ? Number(latRaw) : undefined,
      lng: lngRaw ? Number(lngRaw) : undefined,
    });
  }
  return { headerRow, mapping, rows: out, warnings };
}
