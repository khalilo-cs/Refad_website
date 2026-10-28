import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  normalizePermissions,
  hasPermission,
  countGranted,
  permissionLabel,
} from "@/lib/permissions";
import { authorize } from "@/lib/auth";

/**
 * اختبارات قدرة المدير على الإدارة الكاملة من داخل الموقع.
 *
 * الفكرة: كل ما لم يُبنَ في الكود يجب أن يكون قابلاً للإضافة لاحقاً
 * من الواجهة. هذه الاختبارات تحرس الكتالوج والصلاحيات ومسارات الإدارة
 * حتى لا تُفقد هذه القدرة بصمت.
 */

const admin: any = {
  userId: "u1",
  roleKey: "SUPER_ADMIN",
  permissions: { all: true },
  isActive: true,
  isLocked: false,
  schoolId: null,
  directorateId: null,
};

const custom = (perms: Record<string, boolean>): any => ({
  userId: "u2",
  roleKey: "FIELD_OFFICER",
  permissions: perms,
  isActive: true,
  isLocked: false,
  schoolId: null,
  directorateId: null,
});

describe("كتالوج الصلاحيات", () => {
  it("كل مجموعة لها مفتاح وتسمية ووصف", () => {
    expect(PERMISSION_GROUPS.length).toBeGreaterThanOrEqual(6);
    for (const g of PERMISSION_GROUPS) {
      expect(g.key).toBeTruthy();
      expect(g.label.length).toBeGreaterThan(2);
      expect(g.permissions.length).toBeGreaterThan(0);
    }
  });

  it("لا تكرار في مفاتيح الصلاحيات", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("لكل مفتاح تسمية عربية غير المفتاح نفسه", () => {
    for (const key of PERMISSION_KEYS) {
      const label = permissionLabel(key);
      expect(label).toBeTruthy();
      expect(label).not.toBe(key);
    }
  });

  it("مفتاح لا يعرفه الكتالوج يُعيد نفسه كتسمية احتياطية", () => {
    expect(permissionLabel("somethingUnknown")).toBe("somethingUnknown");
  });
});

describe("تنقية الصلاحيات", () => {
  it("يبقي المفاتيح المنطقية المعروفة فقط", () => {
    const out = normalizePermissions({ viewSchools: true, createVisits: false });
    expect(out).toEqual({ viewSchools: true });
  });

  it("يرفض المفتاح المجهول", () => {
    expect(() => normalizePermissions({ flying: true })).toThrow(/غير معروفة/);
  });

  it("يرفض القيم غير المنطقية", () => {
    expect(() => normalizePermissions({ viewSchools: "yes" })).toThrow();
  });

  it("«كل الصلاحيات» تُوحَّد وحدها", () => {
    const out = normalizePermissions({ all: true, viewSchools: true });
    expect(out).toEqual({ all: true });
  });

  it("كائن غير صالح يُرفض", () => {
    expect(() => normalizePermissions(["a"])).toThrow();
  });

  it("يحسب عدد الصلاحيات الممنوحة", () => {
    expect(countGranted({ a: true, b: false })).toBe(1);
    expect(countGranted({ all: true })).toBe(PERMISSION_KEYS.length);
  });

  it("hasPermission يحترم «كل الصلاحيات»", () => {
    expect(hasPermission({ all: true }, "anything")).toBe(true);
    expect(hasPermission({ viewSchools: true }, "viewSchools")).toBe(true);
    expect(hasPermission({ viewSchools: true }, "createVisits")).toBe(false);
    expect(hasPermission(undefined, "viewSchools")).toBe(false);
  });
});

describe("تفويض الأدوار المخصّصة", () => {
  it("الدور المخصّص يمرّ بالصلاحية ولو لم يكن في قائمة الأدوار", () => {
    const r = authorize(custom({ createVisits: true }), {
      roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"],
      permission: "createVisits",
    });
    expect(r.allowed).toBe(true);
  });

  it("الدور المخصّص بلا الصلاحية يُرفض", () => {
    const r = authorize(custom({ viewSchools: true }), {
      roles: ["SUPER_ADMIN", "INSPECTOR"],
      permission: "createVisits",
    });
    expect(r.allowed).toBe(false);
  });

  it("طلب صلاحية دون قائمة أدوار يُفحص مباشرة", () => {
    expect(authorize(custom({ reviewEvidence: true }), { permission: "reviewEvidence" }).allowed).toBe(true);
    expect(authorize(custom({}), { permission: "reviewEvidence" }).allowed).toBe(false);
  });

  it("المستخدم المعطّل أو المقفل يُرفض دائماً", () => {
    expect(authorize({ ...admin, isActive: false }, { permission: "x" }).allowed).toBe(false);
    expect(authorize({ ...admin, isLocked: true }, { permission: "x" }).allowed).toBe(false);
  });

  it("«كل الصلاحيات» يتجاوز أي قائمة أدوار", () => {
    expect(authorize(admin, { roles: ["NOBODY"], permission: "whatever" }).allowed).toBe(true);
  });
});

describe("مسارات الإدارة موجودة وتُفحص في الخادم", () => {
  const routes = [
    "src/app/api/admin/roles/route.ts",
    "src/app/api/admin/roles/[id]/route.ts",
    "src/app/api/admin/audit/route.ts",
    "src/app/api/admin/backup/route.ts",
    "src/app/api/admin/reference/route.ts",
    "src/app/api/admin/structure/route.ts",
    "src/app/api/settings/route.ts",
  ];

  it("كل مسار إداري موجود", () => {
    for (const r of routes) {
      expect(fs.existsSync(path.join(process.cwd(), r)), `مفقود: ${r}`).toBe(true);
    }
  });

  it("كل مسار إداري يفحص صلاحية مدير النظام في الخادم", () => {
    for (const r of routes) {
      const src = fs.readFileSync(path.join(process.cwd(), r), "utf8");
      expect(src.includes("SUPER_ADMIN"), `لا يفحص الصلاحية: ${r}`).toBe(true);
      expect(src.includes("authorize("), `لا يستدعي authorize: ${r}`).toBe(true);
    }
  });

  it("مسارات الحذف تسجّل في سجل التدقيق", () => {
    for (const r of [
      "src/app/api/admin/roles/[id]/route.ts",
      "src/app/api/settings/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), r), "utf8");
      expect(src).toContain("auditLog");
      expect(src).toContain("export async function DELETE");
    }
  });

  it("النسخة الاحتياطية تستخدم VACUUM INTO لا نسخ ملف", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/admin/backup/route.ts"),
      "utf8"
    );
    expect(src).toContain("VACUUM INTO");
    expect(src).not.toContain("copyFileSync");
  });
});

describe("لوحة الإدارة تغطي كل الكيانات", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "src/app/(app)/admin/page.tsx"),
    "utf8"
  );

  it("تحتوي تبويبات المدارس والبيانات المرجعية والمستخدمين والمعايير والمقياس والأدوار والسجل", () => {
    for (const key of ["schools", "geo", "users", "structure", "scale", "roles", "audit"]) {
      expect(page).toContain(`key: "${key}"`);
    }
  });

  it("تعرض الأدوار وسجل التدقيق وزر النسخة الاحتياطية", () => {
    expect(page).toContain("RolesManager");
    expect(page).toContain("AuditLog");
    expect(page).toContain("/api/admin/backup");
  });
});
