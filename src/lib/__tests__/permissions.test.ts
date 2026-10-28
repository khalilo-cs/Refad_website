import { describe, it, expect } from "vitest";
import { authorize, type UserSession } from "../auth";

/**
 * اختبارات الصلاحيات — تحرس ضد ثغرة حقيقية وقعت أثناء التطوير:
 * كان يُستخدم الكائن المُعاد من authorize() كقيمة منطقية، وهو دائماً صادق،
 * فتمرّ كل الأدوار. الاختبار يضمن أن الفحص يعتمد على الحقل allowed حصراً.
 */

function makeUser(overrides: Partial<UserSession> = {}): UserSession {
  return {
    userId: "u1",
    email: "user@rifad.demo",
    name: "مستخدم اختبار",
    role: "دور",
    roleKey: "INSPECTOR",
    schoolId: null,
    directorateId: null,
    tokenVersion: 1,
    isActive: true,
    isLocked: false,
    permissions: {},
    ...overrides,
  };
}

describe("authorize — الحقل allowed هو الفيصل", () => {
  it("الكائن المُعاد ليس قيمة منطقية — يجب قراءة allowed", () => {
    const result = authorize(makeUser({ roleKey: "INSPECTOR" }), { roles: ["SUPER_ADMIN"] });
    // الكائن نفسه صادق دائماً، وهذا مصدر الخطأ الذي يجب ألا يعود.
    expect(typeof result).toBe("object");
    expect(Boolean(result)).toBe(true);
    // لكن الإذن الفعلي مرفوض:
    expect(result.allowed).toBe(false);
  });

  it("يرفض المفتش من عمليات مدير النظام", () => {
    const inspector = makeUser({ roleKey: "INSPECTOR" });
    expect(authorize(inspector, { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });

  it("يسمح لمدير النظام", () => {
    const admin = makeUser({ roleKey: "SUPER_ADMIN", permissions: { all: true } });
    expect(authorize(admin, { roles: ["SUPER_ADMIN"] }).allowed).toBe(true);
  });

  it("يرفض مدير المدرسة من إدارة المستخدمين", () => {
    const principal = makeUser({ roleKey: "SCHOOL_PRINCIPAL", schoolId: "s1" });
    expect(authorize(principal, { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });

  it("يرفض المعلم وولي الأمر من اعتماد التقارير", () => {
    for (const roleKey of ["TEACHER", "PARENT", "GUEST"]) {
      const u = makeUser({ roleKey });
      expect(authorize(u, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] }).allowed).toBe(false);
    }
  });

  it("يرفض المستخدم غير الموجود أو المعطّل أو المقفل", () => {
    expect(authorize(null, { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
    expect(authorize(makeUser({ isActive: false }), { roles: ["INSPECTOR"] }).allowed).toBe(false);
    expect(authorize(makeUser({ isLocked: true }), { roles: ["INSPECTOR"] }).allowed).toBe(false);
  });

  it("permissions.all لا تتجاوز قائمة الأدوار المطلوبة إلا لمن يملكها", () => {
    const inspectorWithAll = makeUser({ roleKey: "INSPECTOR", permissions: { all: true } });
    // سلوك authorize الحالي: من يملك all يتجاوز فحص الدور.
    expect(authorize(inspectorWithAll, { roles: ["SUPER_ADMIN"] }).allowed).toBe(true);
  });

  it("يمنع الوصول إلى مدرسة أخرى", () => {
    const principal = makeUser({ roleKey: "SCHOOL_PRINCIPAL", schoolId: "s1" });
    const res = authorize(principal, {
      roles: ["SCHOOL_PRINCIPAL"],
      requireSchool: true,
      schoolId: "s2",
    });
    expect(res.allowed).toBe(false);
  });

  it("يمنع الوصول إلى مديرية أخرى", () => {
    const inspector = makeUser({ roleKey: "INSPECTOR", directorateId: "d1" });
    const res = authorize(inspector, {
      roles: ["INSPECTOR"],
      requireDirectorate: true,
      directorateId: "d2",
    });
    expect(res.allowed).toBe(false);
  });

  it("يسمح بالوصول إلى نفس المديرية", () => {
    const inspector = makeUser({ roleKey: "INSPECTOR", directorateId: "d1" });
    const res = authorize(inspector, {
      roles: ["INSPECTOR"],
      requireDirectorate: true,
      directorateId: "d1",
    });
    expect(res.allowed).toBe(true);
  });
});
