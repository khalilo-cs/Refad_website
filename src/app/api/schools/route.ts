import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getServerSession,
  authorize,
  auditLog,
} from "@/lib/auth";
import { query, queryOne, exec, uuid, nowISO, toJson, getDb } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";

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

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  const { allowed } = authorize(session, {
    roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER", "PARENT"],
  });
  if (!allowed) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim().slice(0, 100);
  const directorateId = searchParams.get("directorateId") ?? "";
  const status = searchParams.get("status") ?? "ACTIVE";
  const sort = searchParams.get("sort") ?? "name";
  const dir = searchParams.get("dir") === "desc" ? "DESC" : "ASC";
  const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const SORTS: Record<string, string> = {
    name: "s.name",
    code: "s.code",
    directorate: "d.name",
    visits: "visitsCount",
    updated: "s.last_updated_at",
  };
  const orderBy = SORTS[sort] ?? "s.name";

  const scope = schoolScope(session, "s");
  const where: string[] = [scope.sql];
  const params: unknown[] = [...scope.params];
  if (directorateId) {
    where.push("s.directorate_id = ?");
    params.push(directorateId);
  }
  if (status && ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(status)) {
    where.push("s.status = ?");
    params.push(status);
  }
  if (search) {
    where.push("(s.name LIKE ? OR s.code LIKE ?)");
    const like = `%${search.replace(/[%_]/g, "")}%`;
    params.push(like, like);
  }
  const whereSql = where.join(" AND ");

  const schools = query<any>(
    `SELECT s.id, s.code, s.name, s.type, s.stage, s.contact_phone, s.status, s.data_source, s.last_updated_at,
            s.latitude, s.longitude, s.principal_name,
            d.name AS directorate, g.name AS governorate,
            (SELECT COUNT(*) FROM visits v WHERE v.school_id = s.id) AS visitsCount
     FROM schools s
     JOIN directorates d ON d.id = s.directorate_id
     JOIN governorates g ON g.id = s.governorate_id
     WHERE ${whereSql}
     ORDER BY ${orderBy} ${dir}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalRow = queryOne<{ n: number }>(
    `SELECT COUNT(*) n FROM schools s WHERE ${whereSql}`,
    params
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
