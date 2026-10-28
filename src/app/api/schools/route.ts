import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getServerSession,
  authorize,
  auditLog,
} from "@/lib/auth";
import { query, queryOne, exec, uuid, nowISO, toJson, getDb } from "@/lib/db/sqlite";

export const runtime = "nodejs";

const schoolSchema = z.object({
  code: z.string().min(2, "الكود المدرسي مطلوب").max(30),
  name: z.string().min(3, "اسم المدرسة مطلوب"),
  governorateId: z.string().uuid(),
  directorateId: z.string().uuid(),
  areaId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  latitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional().nullable()),
  longitude: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional().nullable()),
  type: z.string().min(1, "نوع المدرسة مطلوب"),
  stage: z.string().min(1, "المرحلة الدراسية مطلوبة"),
  contactPhone: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  principalName: z.string().optional().nullable(),
  dataSource: z.enum(["MANUAL", "EXCEL_IMPORT", "OFFICIAL"]).default("MANUAL"),
});

function scopeSql(user: { roleKey: string; schoolId: string | null; directorateId: string | null }): string {
  if (user.roleKey === "SUPER_ADMIN") return "";
  if (user.roleKey === "EDUCATION_DIRECTOR") return `AND s.directorate_id = '${user.directorateId}'`;
  if (user.roleKey === "SCHOOL_PRINCIPAL") return `AND s.id = '${user.schoolId}'`;
  if (user.roleKey === "INSPECTOR" && user.directorateId)
    return `AND s.directorate_id = '${user.directorateId}'`;
  return `AND 1 = 0`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { allowed } = authorize(session, {
    roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER", "PARENT"],
  });
  if (!allowed) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const directorateId = searchParams.get("directorateId") ?? "";
  const status = searchParams.get("status") ?? "ACTIVE";
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);
  const offset = (page - 1) * limit;

  const scope = scopeSql(session);
  const dirFilter = directorateId ? `AND s.directorate_id = '${directorateId}'` : "";
  const statusFilter = status ? `AND s.status = '${status}'` : "";
  const like = `%${search}%`;

  const schools = query<any>(
    `SELECT s.id, s.code, s.name, s.type, s.stage, s.contact_phone, s.status, s.data_source, s.last_updated_at,
            d.name AS directorate, g.name AS governorate,
            (SELECT COUNT(*) FROM visits v WHERE v.school_id = s.id) AS visitsCount
     FROM schools s
     JOIN directorates d ON d.id = s.directorate_id
     JOIN governorates g ON g.id = s.governorate_id
     WHERE 1=1 ${scope} ${dirFilter} ${statusFilter}
       AND (s.name LIKE ? OR s.code LIKE ?)
     ORDER BY s.name
     LIMIT ? OFFSET ?`,
    [like, like, limit, offset]
  );
  const totalRow = queryOne<{ n: number }>(
    `SELECT COUNT(*) n FROM schools s WHERE 1=1 ${scope} ${dirFilter} ${statusFilter} AND (s.name LIKE ? OR s.code LIKE ?)`,
    [like, like]
  );

  return NextResponse.json({
    schools,
    total: totalRow?.n ?? 0,
    page,
    limit,
    totalPages: Math.ceil((totalRow?.n ?? 0) / limit),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return NextResponse.json({ message: "غير مصرح بإنشاء مدارس" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "بيانات غير صالحة" }, { status: 400 }); }
  const parsed = schoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات غير صحيحة", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { code, name, governorateId, directorateId, areaId, address, latitude, longitude, type, stage, contactPhone, contactEmail, principalName, dataSource } = parsed.data;
  const exists = queryOne("SELECT id FROM schools WHERE code = ?", [code]);
  if (exists) return NextResponse.json({ message: "الكود المدرسي مستخدم مسبقاً" }, { status: 409 });

  const id = uuid();
  const db = getDb();
  const now = nowISO();
  db.prepare(
    `INSERT INTO schools (id, code, name, governorate_id, directorate_id, area_id, address, latitude, longitude, type, stage, contact_phone, contact_email, principal_name, data_source, status, last_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, code, name, governorateId, directorateId, areaId ?? null, address ?? null, latitude ?? null, longitude ?? null, type, stage, contactPhone ?? null, contactEmail ?? null, principalName ?? null, dataSource, "ACTIVE", now, now);

  auditLog({
    userId: session.userId,
    action: "CREATE",
    entityType: "School",
    entityId: id,
    newValues: { code, name, governorateId, directorateId },
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ message: "تم إضافة المدرسة بنجاح", school: { id, code, name } }, { status: 201 });
}
