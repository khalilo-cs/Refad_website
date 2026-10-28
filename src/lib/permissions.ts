/**
 * كتالوج الصلاحيات.
 *
 * الصلاحيات تُخزَّن ككائن JSON في عمود roles.permissions، كل مفتاح فيه
 * قيمة منطقية. المفتاح `all` يمنح كل شيء ويُستخدم لمدير المنصة.
 *
 * هذا الكتالوج هو المرجع الوحيد لتسميات الصلاحيات في الواجهة، ويُستخدم
 * أيضاً للتحقق من صلاحية أي مفتاح قبل حفظه — فلا تُحفظ مفاتيح مجهولة
 * لا يقرأها أي مسار في النظام.
 */

export type PermissionGroup = {
  key: string;
  label: string;
  description: string;
  permissions: { key: string; label: string; hint: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "schools",
    label: "المدارس والزيارات",
    description: "الوصول إلى سجل المدارس وجدولة الزيارات الميدانية.",
    permissions: [
      { key: "viewSchools", label: "عرض المدارس", hint: "قراءة سجل المدارس وبياناتها" },
      { key: "manageSchoolProfile", label: "تعديل ملف المدرسة", hint: "تحديث بيانات مدرسة مرتبطة بالمستخدم" },
      { key: "createVisits", label: "إنشاء زيارة", hint: "جدولة زيارة ميدانية جديدة" },
      { key: "manageVisits", label: "إدارة الزيارات", hint: "تعديل الزيارات وحالاتها وإلغاؤها" },
    ],
  },
  {
    key: "evaluation",
    label: "التقييم والمؤشرات",
    description: "إدخال درجات المؤشرات ومتابعة نسب التحقق.",
    permissions: [
      { key: "evaluateIndicators", label: "تقييم المؤشرات", hint: "إدخال درجة مؤشر أو تعيينه «لم يُقيَّم»" },
      { key: "trackIndicators", label: "متابعة المؤشرات", hint: "لوحات متابعة التقدم دون تعديل الدرجات" },
      { key: "viewAnalytics", label: "عرض التحليلات", hint: "الإحصاءات والاتجاهات ولوحة التحكم" },
    ],
  },
  {
    key: "evidence",
    label: "الأدلة والشواهد",
    description: "رفع المستندات ومراجعتها واعتمادها.",
    permissions: [
      { key: "uploadEvidence", label: "رفع الأدلة", hint: "إرفاق مستند أو شاهد لمؤشر" },
      { key: "reviewEvidence", label: "مراجعة الأدلة", hint: "قبول الدليل أو رفضه مع سبب" },
      { key: "manageEvidenceLibrary", label: "إدارة مكتبة الأدلة", hint: "إضافة أدلة مرجعية وتعديلها" },
    ],
  },
  {
    key: "reports",
    label: "التقارير والاعتماد",
    description: "توليد التقارير ومراجعتها واعتمادها.",
    permissions: [
      { key: "viewReports", label: "عرض التقارير", hint: "قراءة قائمة التقارير وتفاصيلها" },
      { key: "submitReports", label: "توليد تقرير", hint: "إنشاء تقرير من زيارة مقيَّمة" },
      { key: "reviewReports", label: "مراجعة التقارير", hint: "رفع التقرير للمراجعة أو رفضه بسبب" },
      { key: "approveReports", label: "اعتماد التقارير", hint: "اعتماد التقرير نهائياً وتسجيل المعتمِد" },
    ],
  },
  {
    key: "improvement",
    label: "خطط التحسين",
    description: "خطط التحسين والإجراءات التصحيحية.",
    permissions: [
      { key: "createImprovementPlans", label: "إنشاء خطة تحسين", hint: "تكوين خطة لمدرسة أو معيار" },
      { key: "manageImprovementPlans", label: "إدارة خطط التحسين", hint: "تعديل الخطط وحالاتها" },
      { key: "createCorrectiveActions", label: "إضافة إجراء تصحيحي", hint: "إضافة إجراء داخل خطة" },
    ],
  },
  {
    key: "communication",
    label: "التواصل والإشعارات",
    description: "الإعلانات والملاحظات والردود.",
    permissions: [
      { key: "communicateWithSchool", label: "التواصل مع المدرسة", hint: "إرسال ملاحظة أو رد" },
      { key: "respondToNotes", label: "الرد على الملاحظات", hint: "الرد على ملاحظات الموجّه" },
      { key: "viewFeedback", label: "عرض الملاحظات", hint: "قراءة ملاحظات الميدان" },
    ],
  },
  {
    key: "data",
    label: "البيانات والوصول",
    description: "نطاق الرؤية داخل النظام.",
    permissions: [
      { key: "viewOwnSchool", label: "عرض مدرستي", hint: "محصور بمدرسة المستخدم" },
      { key: "viewOwnData", label: "عرض بياناتي", hint: "بيانات المستخدم الشخصية فقط" },
      { key: "viewChildren", label: "عرض الأبناء", hint: "لأولياء الأمور" },
      { key: "viewPublicInfo", label: "عرض المعلومات العامة", hint: "معلومات متاحة للجميع" },
    ],
  },
  {
    key: "admin",
    label: "الإدارة العليا",
    description: "صلاحيات مطلقة — تُمنح بحذر شديد.",
    permissions: [
      {
        key: "all",
        label: "كل الصلاحيات",
        hint: "تجاوز كل قيود الأدوار داخل النظام",
      },
    ],
  },
];

/** كل مفاتيح الصلاحيات المعروفة. */
export const PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

/** تسمية عربية لمفتاح صلاحية. */
export function permissionLabel(key: string): string {
  for (const g of PERMISSION_GROUPS) {
    const p = g.permissions.find((x) => x.key === key);
    if (p) return p.label;
  }
  return key;
}

/**
 * تنقية كائن الصلاحيات: يحتفظ بالمفاتيح المنطقية المعروفة فقط،
 * ويرفض ما عداه. يرمي خطأً عند وجود مفتاح مجهول حتى لا يُحفظ
 * كائن لا يقرأه النظام ولا يُفهم في الواجهة.
 */
export function normalizePermissions(input: unknown): Record<string, boolean> {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("صيغة الصلاحيات غير صالحة");
  }

  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!PERMISSION_KEYS.includes(key)) {
      throw new Error(`صلاحية غير معروفة: ${key}`);
    }
    if (typeof value !== "boolean") {
      throw new Error(`قيمة الصلاحية «${key}» يجب أن تكون صحيحة أو خاطئة`);
    }
    if (value) out[key] = true;
  }

  // «كل الصلاحيات» تلغي ما عداها — تُوحَّد دائماً إلى { all: true }
  if (out.all) return { all: true };
  return out;
}

/** عدد الصلاحيات الممنوحة (لمفاتيح غير all). */
export function countGranted(permissions: Record<string, boolean>): number {
  if (permissions.all) return PERMISSION_KEYS.length;
  return Object.values(permissions).filter(Boolean).length;
}

/** تحقّق سريع: هل يملك المستخدم صلاحية معيّنة؟ */
export function hasPermission(
  permissions: Record<string, unknown> | undefined,
  permission: string
): boolean {
  if (!permissions) return false;
  return permissions.all === true || permissions[permission] === true;
}
