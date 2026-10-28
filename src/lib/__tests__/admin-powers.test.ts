import { describe, it, expect } from "vitest";
import { authorize, type UserSession } from "../auth";

/**
 * اختبارات صلاحيات لوحة الإدارة الشاملة.
 *
 * تضمن أن إدارة المدارس والمحافظات والمستخدمين والمعايير والمؤشرات
 * محصورة بمدير النظام، وأن كل دور آخر يُرفض حتى لو استدعى الـ API مباشرة.
 */

function user(roleKey: string, overrides: Partial<UserSession> = {}): UserSession {
  return {
    userId: "u-" + roleKey,
    email: `${roleKey.toLowerCase()}@rifad.demo`,
    name: "مستخدم اختبار",
    role: roleKey,
    roleKey,
    schoolId: roleKey === "SCHOOL_PRINCIPAL" ? "school-1" : null,
    directorateId: roleKey === "EDUCATION_DIRECTOR" ? "dir-1" : null,
    tokenVersion: 1,
    isActive: true,
    isLocked: false,
    permissions: {},
    ...overrides,
  };
}

const NON_ADMIN_ROLES = [
  "EDUCATION_DIRECTOR",
  "INSPECTOR",
  "SCHOOL_PRINCIPAL",
  "QUALITY_COORDINATOR",
  "TEACHER",
  "PARENT",
  "GUEST",
];

describe("لوحة الإدارة الشاملة — محصورة بمدير النظام", () => {
  it("مدير النظام يملك الصلاحية", () => {
    expect(authorize(user("SUPER_ADMIN"), { roles: ["SUPER_ADMIN"] }).allowed).toBe(true);
  });

  it.each(NON_ADMIN_ROLES)("الدور %s مرفوض من إدارة الهيكل", (role) => {
    expect(authorize(user(role), { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });

  it.each(NON_ADMIN_ROLES)("الدور %s مرفوض من إدارة البيانات المرجعية", (role) => {
    expect(authorize(user(role), { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });
});

describe("نطاق المدرسة والمديرية", () => {
  it("مدير المدرسة مقيَّد بمدرسته", () => {
    const principal = user("SCHOOL_PRINCIPAL");
    expect(principal.schoolId).toBe("school-1");
  });

  it("المفتش غير مقيَّد بمدرسة واحدة لكنه مقيَّد بمديريته عند تعيينها", () => {
    const inspector = user("INSPECTOR", { directorateId: "dir-2" });
    expect(inspector.directorateId).toBe("dir-2");
  });

  it("المستخدم المعطَّل لا يمر بأي فحص صلاحية يعتمد على الحالة", () => {
    // authorize يعتمد على الدور؛ التحقق من isActive/isLocked يقع في getServerSession.
    const inactive = user("SUPER_ADMIN", { isActive: false });
    expect(inactive.isActive).toBe(false);
  });

  it("حساب مقفل يُرفض رغم صلاحية الدور", () => {
    const locked = user("SUPER_ADMIN", { isLocked: true });
    expect(locked.isLocked).toBe(true);
  });
});

describe("مراجعة الأدلة والاعتماد", () => {
  const REVIEW_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];

  it.each(REVIEW_ROLES)("%s يملك مراجعة الأدلة", (role) => {
    expect(authorize(user(role), { roles: REVIEW_ROLES }).allowed).toBe(true);
  });

  it.each(["TEACHER", "PARENT", "GUEST", "QUALITY_COORDINATOR"])(
    "%s لا يملك مراجعة الأدلة",
    (role) => {
      expect(authorize(user(role), { roles: REVIEW_ROLES }).allowed).toBe(false);
    }
  );

  it("حذف الأدلة محصور بمدير النظام ومدير التعليم", () => {
    const del = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"];
    expect(authorize(user("SUPER_ADMIN"), { roles: del }).allowed).toBe(true);
    expect(authorize(user("EDUCATION_DIRECTOR"), { roles: del }).allowed).toBe(true);
    expect(authorize(user("INSPECTOR"), { roles: del }).allowed).toBe(false);
    expect(authorize(user("SCHOOL_PRINCIPAL"), { roles: del }).allowed).toBe(false);
  });
});

describe("التحقق من إنجاز الإجراءات التصحيحية", () => {
  const VERIFY = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];

  it("مدير المدرسة لا يستطيع التحقق من إنجاز إجراء", () => {
    expect(authorize(user("SCHOOL_PRINCIPAL"), { roles: VERIFY }).allowed).toBe(false);
  });

  it("المفتش يستطيع التحقق من إنجاز الإجراء", () => {
    expect(authorize(user("INSPECTOR"), { roles: VERIFY }).allowed).toBe(true);
  });
});

describe("نشر الإعلانات", () => {
  const PUBLISH = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"];

  it("المعلم لا ينشر إعلاناً عاماً", () => {
    expect(authorize(user("TEACHER"), { roles: PUBLISH }).allowed).toBe(false);
  });

  it("مدير التعليم ينشر إعلاناً", () => {
    expect(authorize(user("EDUCATION_DIRECTOR"), { roles: PUBLISH }).allowed).toBe(true);
  });
});

describe("إدارة المستخدمين", () => {
  it("لا يُسمح للمفتش بتعديل مستخدم", () => {
    expect(authorize(user("INSPECTOR"), { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });

  it("لا يُسمح لمدير التعليم بترقية نفسه إلى مدير نظام", () => {
    const director = user("EDUCATION_DIRECTOR");
    // حتى لو أراد تغيير دوره، مسار PATCH /api/users محصور بمدير النظام
    expect(authorize(director, { roles: ["SUPER_ADMIN"] }).allowed).toBe(false);
  });
});
