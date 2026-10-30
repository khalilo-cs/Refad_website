/**
 * أرقام الهواتف: تطبيع وتحقق وروابط الاتصال والواتساب.
 *
 * يعمل في الخادم والمتصفح (بلا اعتماد على Node). القواعد اليمنية:
 *  - جوال: 9 خانات تبدأ بـ7 (70/71/73/77/78...).
 *  - ثابت: رمز المنطقة (1..6) + رقم، بإجمالي 6–8 خانات بعد حذف الصفر الأول (مثال: 03 123456).
 *  - دولي: يبدأ بـ+ أو 00 ورمز دولة غير 967، من 8 إلى 15 خانة.
 * الأرقام العربية-الهندية (٠١٢٣) تُحوَّل تلقائياً، وتُهمل الفواصل والمسافات.
 */

export type PhoneKind = "mobile" | "landline" | "international" | "invalid";

export type ParsedPhone = {
  /** النص الأصلي بعد التنظيف الأولي. */
  raw: string;
  kind: PhoneKind;
  valid: boolean;
  /** بصيغة E.164 مع + (للروابط)، أو null إن كان غير صالح. */
  e164: string | null;
  /** الصيغة المخزَّنة المعيارية. */
  canonical: string;
  /** صيغة العرض (LTR) مع مسافات. */
  display: string;
  /** هل يصلح لروابط واتساب (جوال أو دولي). */
  whatsappCapable: boolean;
  /** سبب عدم الصلاحية بالعربية. */
  reason?: string;
};

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const i = ARABIC_INDIC.indexOf(ch);
    return String(i >= 0 ? i : PERSIAN.indexOf(ch));
  });
}

const INVALID = (raw: string, reason: string): ParsedPhone => ({
  raw,
  kind: "invalid",
  valid: false,
  e164: null,
  canonical: raw,
  display: raw,
  whatsappCapable: false,
  reason,
});

/** يحلّل رقماً واحداً. القيم الفارغة تعيد غير صالح بسبب «فارغ». */
export function parsePhone(input: unknown): ParsedPhone {
  if (input == null) return INVALID("", "الرقم فارغ");
  const original = toAsciiDigits(String(input)).trim();
  if (!original) return INVALID("", "الرقم فارغ");

  const explicitIntl = /^\s*(\+|00)/.test(original);
  let digits = original.replace(/[^\d]/g, "");
  if (!digits) return INVALID(original, "الرقم لا يحتوي أرقاماً");
  if (/^00/.test(digits) && explicitIntl) digits = digits.slice(2);

  // رمز الدولة اليمنية
  let national = digits;
  let hadCountryCode = false;
  if (digits.startsWith("967") && digits.length >= 9) {
    national = digits.slice(3);
    hadCountryCode = true;
  } else if (explicitIntl) {
    // دولي غير يمني
    if (digits.length < 8 || digits.length > 15) return INVALID(original, "رقم دولي غير صالح (من 8 إلى 15 خانة)");
    const spaced = `+${digits}`;
    return { raw: original, kind: "international", valid: true, e164: `+${digits}`, canonical: `+${digits}`, display: spaced, whatsappCapable: true };
  }

  // جوال: 9 خانات تبدأ بـ7 (يُقبل ظهور صفر أول زائد في بعض الكشوف: 07xxxxxxxx)
  const mobile = national.replace(/^0/, "");
  if (/^7\d{8}$/.test(mobile)) {
    const d = mobile;
    return {
      raw: original, kind: "mobile", valid: true, e164: `+967${d}`, canonical: d,
      display: `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`, whatsappCapable: true,
    };
  }

  // ثابت: رمز منطقة 1..6 ثم رقم، 6–8 خانات بلا الصفر الأول
  const land = national.replace(/^0/, "");
  if (/^[1-6]\d{5,7}$/.test(land)) {
    return {
      raw: original, kind: "landline", valid: true, e164: `+967${land}`, canonical: `0${land}`,
      display: `0${land.slice(0, 1)} ${land.slice(1)}`, whatsappCapable: false,
    };
  }

  const len = mobile.length;
  if (/^7\d+$/.test(mobile)) {
    return INVALID(original, len > 9 ? `الرقم أطول من اللازم (${len} خانات؛ المطلوب 9 للجوال)` : `الرقم ناقص (${len} خانات؛ المطلوب 9 للجوال)`);
  }
  if (hadCountryCode) return INVALID(original, "رقم يمني غير صالح بعد رمز الدولة");
  return INVALID(original, "صيغة الرقم غير معروفة (الجوال اليمني 9 خانات يبدأ بـ7)");
}

/** هل النص يحتوي رقم هاتف صالحاً؟ */
export function isValidPhone(input: unknown): boolean {
  return parsePhone(input).valid;
}

/** الصيغة المعيارية للتخزين؛ الأرقام غير الصالحة تُحفظ منظَّفة كما أُدخلت. */
export function canonicalPhone(input: unknown): string | null {
  const p = parsePhone(input);
  if (!p.raw) return null;
  return p.valid ? p.canonical : p.raw.replace(/\s+/g, " ").slice(0, 40);
}

/** يفصل نصاً يحوي عدة أرقام («777… / 733…» أو «، » أو «و»). */
export function splitPhones(input: unknown): string[] {
  if (input == null) return [];
  return toAsciiDigits(String(input))
    .split(/[\/\\,،;؛|\n]+|\s+و\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** رابط الاتصال tel: أو null إن كان الرقم غير صالح. */
export function telHref(input: unknown): string | null {
  const p = typeof input === "object" && input && "e164" in (input as object) ? (input as ParsedPhone) : parsePhone(input);
  return p.valid && p.e164 ? `tel:${p.e164}` : null;
}

/** رابط واتساب wa.me (بلا + ولا أصفار)، مع نص جاهز اختياري. null إن لم يصلح الرقم. */
export function whatsappHref(input: unknown, message?: string): string | null {
  const p = typeof input === "object" && input && "e164" in (input as object) ? (input as ParsedPhone) : parsePhone(input);
  if (!p.valid || !p.whatsappCapable || !p.e164) return null;
  const base = `https://wa.me/${p.e164.slice(1)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const DEFAULT_WA_MESSAGE =
  "السلام عليكم ورحمة الله وبركاته، أتواصل معكم من قسم الجودة والاعتماد المدرسي — إدارة التربية والتعليم بمديرية الجراحي.";

/** رسالة بيانات دخول للمنصة. كلمة المرور تُمرَّر صراحةً ولا تُحفظ في أي مكان. */
export function credentialsMessage(o: { name: string; loginUrl: string; login: string; password: string; mustChange?: boolean }): string {
  return [
    `السلام عليكم ورحمة الله وبركاته ${o.name}،`,
    "تم إنشاء حسابك في منصة إتقان للاعتماد المدرسي وضمان جودة التعليم.",
    `الرابط: ${o.loginUrl}`,
    `اسم المستخدم: ${o.login}`,
    `كلمة المرور المؤقتة: ${o.password}`,
    o.mustChange === false ? "" : "سيُطلب منك تغيير كلمة المرور عند أول دخول.",
    "يرجى عدم مشاركة هذه البيانات مع أحد.",
  ].filter(Boolean).join("\n");
}

/** رابط ملاحة خرائط جوجل إلى إحداثيات. */
export function navigateHref(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

/** رابط عرض الموقع على الخريطة. */
export function mapViewHref(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
