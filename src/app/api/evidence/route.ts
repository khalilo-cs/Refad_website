import { NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb } from "@/lib/db/sqlite";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** أي دور يمكنه رفع الأدلة */
const UPLOAD_ROLES = [
  "SUPER_ADMIN",
  "EDUCATION_DIRECTOR",
  "INSPECTOR",
  "SCHOOL_PRINCIPAL",
  "QUALITY_COORDINATOR",
  "TEACHER",
];

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

/** GET /api/evidence?schoolId=&visitId=&status= */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: UPLOAD_ROLES });
  if (!allowed) return bad("غير مصرح", 403);

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId") ?? "";
  const visitId = searchParams.get("visitId") ?? "";
  const status = searchParams.get("status") ?? "";

  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  // نطاق الدور
  if (session.roleKey === "SCHOOL_PRINCIPAL" && session.schoolId) {
    where.push("e.school_id = ?");
    params.push(session.schoolId);
  } else if (session.roleKey === "EDUCATION_DIRECTOR" && session.directorateId) {
    where.push("s.directorate_id = ?");
    params.push(session.directorateId);
  }
  if (schoolId) {
    where.push("e.school_id = ?");
    params.push(schoolId);
  }
  if (visitId) {
    where.push("e.visit_id = ?");
    params.push(visitId);
  }
  if (status) {
    where.push("e.review_status = ?");
    params.push(status);
  }

  const rows = query<any>(
    `SELECT e.id, e.name, e.original_name, e.mime_type, e.size, e.url, e.review_status,
            e.review_notes, e.created_at, e.school_id, e.visit_id, e.evaluation_id,
            s.name AS school_name,
            u.name AS uploaded_by_name,
            i.code AS indicator_code, i.title AS indicator_title
     FROM evidence e
     JOIN schools s ON s.id = e.school_id
     LEFT JOIN users u ON u.id = e.uploaded_by_id
     LEFT JOIN evaluations ev ON ev.id = e.evaluation_id
     LEFT JOIN indicators i ON i.id = ev.indicator_id
     WHERE ${where.join(" AND ")}
     ORDER BY e.created_at DESC
     LIMIT 200`,
    params
  );

  const counts = queryOne<any>(
    `SELECT
       SUM(CASE WHEN e.review_status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN e.review_status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted,
       SUM(CASE WHEN e.review_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
       COUNT(*) AS total
     FROM evidence e
     JOIN schools s ON s.id = e.school_id
     WHERE ${where.filter((w) => !w.startsWith("e.review_status")).join(" AND ")}`,
    params.slice(0, params.length - (status ? 1 : 0))
  );

  return NextResponse.json({ evidence: rows, counts: counts ?? {} });
}

/** POST /api/evidence — رفع ملف دليل (multipart) */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: UPLOAD_ROLES, permission: "uploadEvidence" });
  if (!allowed) return bad("غير مصرح لك برفع الأدلة", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("يجب إرسال الملف بصيغة multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad("لم يُرفق أي ملف");
  if (file.size === 0) return bad("الملف فارغ");
  if (file.size > MAX_BYTES) return bad("حجم الملف يتجاوز 15 ميجابايت");

  const schoolId = String(form.get("schoolId") ?? "");
  if (!schoolId) return bad("يجب تحديد المدرسة");

  const school = queryOne<{ id: string; directorate_id: string | null }>(
    "SELECT id, directorate_id FROM schools WHERE id = ?",
    [schoolId]
  );
  if (!school) return bad("المدرسة غير موجودة", 404);

  // منع رفع أدلة لمدرسة خارج نطاق المستخدم
  if (session.roleKey === "SCHOOL_PRINCIPAL" && session.schoolId !== schoolId)
    return bad("يمكنك رفع الأدلة لمدرستك فقط", 403);
  if (
    session.roleKey === "EDUCATION_DIRECTOR" &&
    session.directorateId &&
    school.directorate_id !== session.directorateId
  )
    return bad("المدرسة خارج مديريتك", 403);

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.includes(mime))
    return bad("نوع الملف غير مسموح. المسموح: PDF، صور، Word، Excel.");

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "evidence");

  try {
    await mkdir(dir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, key), buf);

    const id = randomUUID();
    const name = String(form.get("name") ?? file.name).slice(0, 200);
    const visitId = String(form.get("visitId") ?? "") || null;
    const evaluationId = String(form.get("evaluationId") ?? "") || null;

    getDb()
      .prepare(
        `INSERT INTO evidence (id, name, original_name, mime_type, size, storage_key, url,
           school_id, visit_id, evaluation_id, uploaded_by_id, review_status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
      )
      .run(
        id,
        name,
        file.name.slice(0, 255),
        mime,
        file.size,
        key,
        `/uploads/evidence/${key}`,
        schoolId,
        visitId,
        evaluationId,
        session.userId,
        "PENDING"
      );

    auditLog({
      userId: session.userId,
      action: "UPLOAD_EVIDENCE",
      entityType: "evidence",
      entityId: id,
      newValues: { name, schoolId, size: file.size },
    });

    return NextResponse.json(
      { id, url: `/uploads/evidence/${key}`, message: "تم رفع الدليل" },
      { status: 201 }
    );
  } catch (e: any) {
    return bad("تعذّر حفظ الملف: " + (e?.message ?? "خطأ غير معروف"), 500);
  }
}

/** PATCH /api/evidence — مراجعة دليل (قبول/رفض) */
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, {
    roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"],
    permission: "reviewEvidence",
  });
  if (!allowed) return bad("مراجعة الأدلة متاحة للمفتش ومدير التعليم ومدير النظام", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!["ACCEPTED", "REJECTED", "PENDING"].includes(status)) return bad("حالة مراجعة غير معروفة");

  const row = queryOne<any>("SELECT * FROM evidence WHERE id = ?", [id]);
  if (!row) return bad("الدليل غير موجود", 404);

  if (status === "REJECTED" && String(body.notes ?? "").trim().length < 5)
    return bad("سبب الرفض مطلوب (5 أحرف على الأقل)");

  getDb()
    .prepare(
      `UPDATE evidence SET review_status = ?, review_notes = ?, reviewed_by_id = ?, reviewed_at = datetime('now') WHERE id = ?`
    )
    .run(status, String(body.notes ?? "").slice(0, 1000) || null, session.userId, id);

  auditLog({
    userId: session.userId,
    action: "REVIEW_EVIDENCE",
    entityType: "evidence",
    entityId: id,
    oldValues: { review_status: row.review_status },
    newValues: { review_status: status, notes: body.notes },
  });

  return NextResponse.json({ message: status === "ACCEPTED" ? "تم قبول الدليل" : status === "REJECTED" ? "تم رفض الدليل" : "أُعيد الدليل للمراجعة" });
}

/** DELETE /api/evidence?id= — حذف دليل */
export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return bad("حذف الأدلة متاح لمدير النظام ومدير التعليم", 403);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  const row = queryOne<any>("SELECT * FROM evidence WHERE id = ?", [id]);
  if (!row) return bad("الدليل غير موجود", 404);

  getDb().prepare("DELETE FROM evidence WHERE id = ?").run(id);
  auditLog({
    userId: session.userId,
    action: "DELETE_EVIDENCE",
    entityType: "evidence",
    entityId: id,
    oldValues: row,
  });
  return NextResponse.json({ message: "تم حذف الدليل" });
}
