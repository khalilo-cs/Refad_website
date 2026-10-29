import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession, auditLog } from "@/lib/auth";
import { exec } from "@/lib/db/sqlite";
import { canAccessSchool } from "@/lib/scope";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";

const count = z.number().int().min(0).max(100000).nullable().optional();
const flag = z.boolean().nullable().optional();
const schema = z.object({
  studentsCount: count, teachersCount: count, adminStaffCount: count, serviceStaffCount: count, classesCount: count,
  sanitationUnits: count,
  hasScienceLab: flag, hasComputerLab: flag, hasLibrary: flag, hasResourceRoom: flag, hasCanteen: flag,
  hasClinic: flag, hasPlayground: flag, hasPower: flag, hasWater: flag, specialNeedsAccess: flag,
  facilitiesNotes: z.string().max(2000).nullable().optional(),
  infoSource: z.string().max(300).nullable().optional(),
  verified: z.boolean().optional(),
});

const COLS: Record<string, string> = {
  studentsCount: "students_count", teachersCount: "teachers_count", adminStaffCount: "admin_staff_count",
  serviceStaffCount: "service_staff_count", classesCount: "classes_count", sanitationUnits: "sanitation_units",
  hasScienceLab: "has_science_lab", hasComputerLab: "has_computer_lab", hasLibrary: "has_library",
  hasResourceRoom: "has_resource_room", hasCanteen: "has_canteen", hasClinic: "has_clinic",
  hasPlayground: "has_playground", hasPower: "has_power", hasWater: "has_water", specialNeedsAccess: "special_needs_access",
  facilitiesNotes: "facilities_notes", infoSource: "info_source",
};

/** PUT /api/schools/[id]/profile — يحدّث ملف المرافق والكوادر. التوثيق (verified) للإدارة والمفتش فقط. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { id } = await params;
  if (!await canAccessSchool(session, id)) return NextResponse.json({ message: "خارج نطاق صلاحيتك" }, { status: 403 });

  const canEdit =
    ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey) ||
    (session.roleKey === "SCHOOL_PRINCIPAL" && (session.permissions?.manageSchoolProfile === true || session.permissions?.all === true));
  if (!canEdit) return NextResponse.json({ message: "لا تملك صلاحية تعديل ملف المدرسة" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "بيانات غير صحيحة", errors: parsed.error.flatten().fieldErrors }, { status: 400 });

  const canVerify = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey);
  await exec("INSERT OR IGNORE INTO school_profiles (school_id) VALUES (?)", [id]);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(COLS)) {
    const v = (parsed.data as any)[k];
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
  }
  // أي تعديل من مدير المدرسة يُسقط حالة التوثيق حتى يراجعها المفتش
  if (parsed.data.verified !== undefined && canVerify) {
    sets.push("verified = ?", "verified_by_id = ?", "verified_at = ?");
    vals.push(parsed.data.verified ? 1 : 0, parsed.data.verified ? session.userId : null, parsed.data.verified ? new Date().toISOString() : null);
  } else if (sets.length && !canVerify) {
    sets.push("verified = 0", "verified_by_id = NULL", "verified_at = NULL");
  }
  sets.push("updated_by_id = ?", "updated_at = datetime('now')");
  vals.push(session.userId, id);
  await exec(`UPDATE school_profiles SET ${sets.join(", ")} WHERE school_id = ?`, [...vals]);
  await exec("UPDATE schools SET last_updated_at = datetime('now') WHERE id = ?", [id]);

  await auditLog({ userId: session.userId, action: "SCHOOL_PROFILE_UPDATE", entityType: "School", entityId: id, newValues: parsed.data, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حفظ ملف المدرسة" });
}
