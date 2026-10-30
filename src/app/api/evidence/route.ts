import { NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, uuid, transaction , exec } from "@/lib/db/sqlite";
import { schoolScope, canAccessSchool } from "@/lib/scope";
import { clientIp, rateLimit, sanitizeFilename, sha256Hex, sniffFile } from "@/lib/security";
import { notify, schoolUsers } from "@/lib/notify";
import { putObject, StorageNotConfiguredError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** الحد الأقصى للحجم: قابل للضبط من الإعدادات (file.maxSizeMB) وبالبيئة. */
async function maxBytes(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'file.maxSizeMB'");
  let mb = Number(process.env.MAX_UPLOAD_MB ?? 15);
  try {
    if (row) mb = Number(JSON.parse(row.value)) || mb;
  } catch { /* القيمة الافتراضية */ }
  return Math.min(Math.max(mb, 1), 100) * 1024 * 1024;
}

const UPLOAD_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"];
const REVIEW_ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "QUALITY_COORDINATOR"];

export const DOCUMENT_TYPES = [
  "وثيقة رسمية", "خطة", "تقرير", "محضر", "سجل", "كشف", "صورة ميدانية", "نموذج", "شهادة", "أخرى",
];

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

/** GET /api/evidence?schoolId=&visitId=&indicatorId=&subCriterionId=&status=&q=&type= */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: UPLOAD_ROLES });
  if (!allowed) return bad("غير مصرح", 403);

  const sp = new URL(request.url).searchParams;
  const scope = await schoolScope(session, "s");
  const where: string[] = [scope.sql];
  const params: unknown[] = [...scope.params];
  // المعلم يرى ما رفعه هو فقط
  if (session.roleKey === "TEACHER") {
    where.push("e.uploaded_by_id = ?");
    params.push(session.userId);
  }
  const add = (cond: string, val: unknown) => { where.push(cond); params.push(val); };
  const schoolId = sp.get("schoolId"); if (schoolId) add("e.school_id = ?", schoolId);
  const visitId = sp.get("visitId"); if (visitId) add("e.visit_id = ?", visitId);
  const indicatorId = sp.get("indicatorId"); if (indicatorId) add("COALESCE(e.indicator_id, ev.indicator_id) = ?", indicatorId);
  const subId = sp.get("subCriterionId"); if (subId) add("e.sub_criterion_id = ?", subId);
  const type = sp.get("type"); if (type) add("e.document_type = ?", type);
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  if (q) {
    where.push("(e.name LIKE ? OR e.original_name LIKE ? OR e.description LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    params.push(like, like, like);
  }
  const baseWhere = where.join(" AND ");
  const status = sp.get("status");
  const fullWhere = status && ["PENDING", "ACCEPTED", "REJECTED"].includes(status) ? `${baseWhere} AND e.review_status = ?` : baseWhere;
  const fullParams = status && ["PENDING", "ACCEPTED", "REJECTED"].includes(status) ? [...params, status] : params;

  const rows = await query<any>(
    `SELECT e.id, e.name, e.original_name, e.mime_type, e.size, e.review_status, e.review_notes,
            e.validity, e.document_type, e.description, e.version, e.created_at, e.school_id, e.visit_id,
            e.evaluation_id, COALESCE(e.indicator_id, ev.indicator_id) AS indicator_id, e.sub_criterion_id, e.action_id, e.library_item_id, e.can_download,
            s.name AS school_name, u.name AS uploaded_by_name,
            i.code AS indicator_code, i.title AS indicator_title
     FROM evidence e
     JOIN schools s ON s.id = e.school_id
     LEFT JOIN users u ON u.id = e.uploaded_by_id
     LEFT JOIN evaluations ev ON ev.id = e.evaluation_id
     LEFT JOIN indicators i ON i.id = COALESCE(e.indicator_id, ev.indicator_id)
     WHERE ${fullWhere}
     ORDER BY e.created_at DESC
     LIMIT 300`,
    fullParams
  );

  const counts = await queryOne<any>(
    `SELECT
       COALESCE(SUM(CASE WHEN e.review_status = 'PENDING' THEN 1 ELSE 0 END),0) AS pending,
       COALESCE(SUM(CASE WHEN e.review_status = 'ACCEPTED' THEN 1 ELSE 0 END),0) AS accepted,
       COALESCE(SUM(CASE WHEN e.review_status = 'REJECTED' THEN 1 ELSE 0 END),0) AS rejected,
       COUNT(*) AS total
     FROM evidence e
     JOIN schools s ON s.id = e.school_id
     LEFT JOIN evaluations ev ON ev.id = e.evaluation_id
     WHERE ${baseWhere}`,
    params
  );

  return NextResponse.json({ evidence: rows, counts: counts ?? {}, documentTypes: DOCUMENT_TYPES });
}

/** POST /api/evidence — رفع دليل جديد، أو نسخة جديدة من دليل قائم (replaceId). */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: UPLOAD_ROLES, permission: "uploadEvidence" });
  if (!allowed) return bad("غير مصرح لك برفع الأدلة", 403);

  const rl = rateLimit(`upload:${session.userId}`, 60, 10 * 60_000);
  if (!rl.ok) return bad("عدد كبير من عمليات الرفع. حاول لاحقاً.", 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("يجب إرسال الملف بصيغة multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad("لم يُرفق أي ملف");
  if (file.size === 0) return bad("الملف فارغ");
  const limit = await maxBytes();
  if (file.size > limit) return bad(`حجم الملف يتجاوز ${Math.round(limit / 1024 / 1024)} ميجابايت`);

  const replaceId = String(form.get("replaceId") ?? "") || null;
  let schoolId = String(form.get("schoolId") ?? "");
  let replacing: any = null;
  if (replaceId) {
    replacing = await queryOne<any>("SELECT * FROM evidence WHERE id = ?", [replaceId]);
    if (!replacing) return bad("الدليل المراد استبداله غير موجود", 404);
    schoolId = replacing.school_id;
  }
  if (!schoolId) return bad("يجب تحديد المدرسة");
  if (!await queryOne("SELECT id FROM schools WHERE id = ?", [schoolId])) return bad("المدرسة غير موجودة", 404);
  if (!await canAccessSchool(session, schoolId)) return bad("المدرسة خارج نطاق صلاحيتك", 403);

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffFile(buf, file.name);
  if (!kind) return bad("نوع الملف غير مسموح أو محتواه لا يطابق امتداده. المسموح: PDF، صور، Word، Excel، CSV.");

  const visitId = String(form.get("visitId") ?? "") || replacing?.visit_id || null;
  const indicatorId = String(form.get("indicatorId") ?? "") || replacing?.indicator_id || null;
  let evaluationId = String(form.get("evaluationId") ?? "") || replacing?.evaluation_id || null;
  const subCriterionId = String(form.get("subCriterionId") ?? "") || replacing?.sub_criterion_id || null;
  const actionId = String(form.get("actionId") ?? "") || replacing?.action_id || null;
  const libraryItemId = String(form.get("libraryItemId") ?? "") || replacing?.library_item_id || null;
  if (libraryItemId && !await queryOne("SELECT id FROM evidence_library_items WHERE id = ?", [libraryItemId])) return bad("عنصر المكتبة غير موجود", 404);
  if (visitId) {
    const v = await queryOne<{ school_id: string }>("SELECT school_id FROM visits WHERE id = ?", [visitId]);
    if (!v || v.school_id !== schoolId) return bad("الزيارة لا تخص هذه المدرسة");
  }
  if (indicatorId && !await queryOne("SELECT id FROM indicators WHERE id = ?", [indicatorId])) return bad("المؤشر غير موجود", 404);
  if (visitId && indicatorId && !evaluationId) {
    evaluationId = (await queryOne<{ id: string }>("SELECT id FROM evaluations WHERE visit_id = ? AND indicator_id = ?", [visitId, indicatorId]))?.id ?? null;
  }

  const key = `${uuid()}.${kind.ext}`;
  const hash = sha256Hex(buf);
  const documentType = String(form.get("documentType") ?? "").slice(0, 60) || replacing?.document_type || null;
  const description = String(form.get("description") ?? "").slice(0, 1000) || replacing?.description || null;
  const displayName = sanitizeFilename(String(form.get("name") ?? "") || file.name).slice(0, 200);

  try {
    await putObject(key, buf, kind.mime);

    const id = replaceId ?? uuid();
    let version = 1;
    await transaction(async () => {
      if (replacing) {
        version = replacing.version + 1;
        // حفظ النسخة السابقة في سجل النسخ
        await exec(`INSERT OR IGNORE INTO evidence_versions (id, evidence_id, version, storage_key, original_name, mime_type, size, sha256, uploaded_by_id, change_note)
           VALUES (?,?,?,?,?,?,?,?,?,?)`, [uuid(), id, replacing.version, replacing.storage_key, replacing.original_name, replacing.mime_type, replacing.size, replacing.sha256, replacing.uploaded_by_id, null]);
        await exec(`UPDATE evidence SET storage_key = ?, original_name = ?, mime_type = ?, size = ?, sha256 = ?, url = ?,
             version = ?, review_status = 'PENDING', review_notes = NULL, validity = NULL, reviewed_by_id = NULL, reviewed_at = NULL,
             uploaded_by_id = ?, description = ?, document_type = ?, updated_at = datetime('now')
           WHERE id = ?`, [key, sanitizeFilename(file.name), kind.mime, buf.length, hash, `/api/evidence/${id}/file`, version, session.userId, description, documentType, id]);
      } else {
        await exec(`INSERT INTO evidence (id, name, original_name, mime_type, size, storage_key, url, school_id, visit_id, evaluation_id,
             sub_criterion_id, indicator_id, action_id, library_item_id, uploaded_by_id, review_status, document_type, description, sha256, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING', ?,?,?, datetime('now'))`, [id, displayName, sanitizeFilename(file.name), kind.mime, buf.length, key, `/api/evidence/${id}/file`, schoolId, visitId, evaluationId,
          subCriterionId, indicatorId, actionId, libraryItemId, session.userId, documentType, description, hash]);
      }
    });

    await auditLog({
      userId: session.userId,
      action: replacing ? "EVIDENCE_NEW_VERSION" : "UPLOAD_EVIDENCE",
      entityType: "evidence",
      entityId: id,
      newValues: { name: displayName, schoolId, size: buf.length, version, sha256: hash, indicatorId },
      ipAddress: clientIp(request),
    });

    // إشعار المراجعين
    if (session.roleKey === "SCHOOL_PRINCIPAL" || session.roleKey === "TEACHER") {
      const reviewers = await query(`SELECT DISTINCT u.id FROM users u JOIN roles r ON r.id = u.role_id
         JOIN schools s ON s.id = ? WHERE u.is_active = 1 AND (
           (r.key = 'EDUCATION_DIRECTOR' AND u.directorate_id = s.directorate_id) OR
           (r.key = 'QUALITY_COORDINATOR' AND u.school_id = s.id))`, [schoolId]) as { id: string }[];
      await notify(reviewers.map((r) => r.id), "دليل جديد بانتظار المراجعة", displayName, { link: "/evidence", type: "INFO" });
    } else if (session.roleKey === "INSPECTOR") {
      await notify(await schoolUsers(schoolId, ["SCHOOL_PRINCIPAL"]), "أُرفق دليل جديد لمدرستكم", displayName, { link: "/evidence", type: "INFO" });
    }

    return NextResponse.json({ id, version, url: `/api/evidence/${id}/file`, message: replacing ? "تم رفع نسخة جديدة من الدليل" : "تم رفع الدليل" }, { status: 201 });
  } catch (e: any) {
    if (e instanceof StorageNotConfiguredError) return bad(e.message, 503);
    return bad("تعذّر حفظ الملف", 500);
  }
}

/** PATCH /api/evidence — مراجعة دليل: { id, status, validity?, notes? } */
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: REVIEW_ROLES, permission: "reviewEvidence" });
  if (!allowed) return bad("مراجعة الأدلة متاحة للمفتش ومدير التعليم ومنسق الجودة", 403);

  let body: any;
  try { body = await request.json(); } catch { return bad("صيغة الطلب غير صحيحة"); }

  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  const validity = body.validity ? String(body.validity) : null;
  if (!["ACCEPTED", "REJECTED", "PENDING"].includes(status)) return bad("حالة مراجعة غير معروفة");
  if (validity && !["VALID", "PARTIAL", "INVALID"].includes(validity)) return bad("تقدير الصلاحية غير معروف");

  const row = await queryOne<any>("SELECT * FROM evidence WHERE id = ?", [id]);
  if (!row) return bad("الدليل غير موجود", 404);
  if (!await canAccessSchool(session, row.school_id)) return bad("خارج نطاق صلاحيتك", 403);
  if (row.uploaded_by_id === session.userId && session.roleKey !== "SUPER_ADMIN")
    return bad("لا يمكنك مراجعة دليل رفعته بنفسك", 403);

  if (status === "REJECTED" && String(body.notes ?? "").trim().length < 5) return bad("سبب الرفض مطلوب (5 أحرف على الأقل)");

  await exec(`UPDATE evidence SET review_status = ?, review_notes = ?, validity = ?, reviewed_by_id = ?, reviewed_at = datetime('now') WHERE id = ?`, [status, String(body.notes ?? "").slice(0, 1000) || null, status === "ACCEPTED" ? (validity ?? "VALID") : validity, session.userId, id]);

  await auditLog({
    userId: session.userId, action: "REVIEW_EVIDENCE", entityType: "evidence", entityId: id,
    oldValues: { review_status: row.review_status }, newValues: { review_status: status, validity, notes: body.notes },
    ipAddress: clientIp(request),
  });
  await notify([row.uploaded_by_id], status === "ACCEPTED" ? "قُبل الدليل" : status === "REJECTED" ? "رُفض الدليل" : "أُعيد الدليل للمراجعة",
    `${row.name}${body.notes ? " — " + String(body.notes).slice(0, 120) : ""}`, { link: "/evidence", type: status === "REJECTED" ? "DANGER" : "SUCCESS" });

  return NextResponse.json({ message: status === "ACCEPTED" ? "تم قبول الدليل" : status === "REJECTED" ? "تم رفض الدليل" : "أُعيد الدليل للمراجعة" });
}

/** DELETE /api/evidence?id= — حذف دليل (للإدارة فقط). الملف يُحذف من التخزين الخاص. */
export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] });
  if (!allowed) return bad("حذف الأدلة متاح لمدير النظام ومدير التعليم", 403);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const row = await queryOne<any>("SELECT * FROM evidence WHERE id = ?", [id]);
  if (!row) return bad("الدليل غير موجود", 404);
  if (!await canAccessSchool(session, row.school_id)) return bad("خارج نطاق صلاحيتك", 403);

  await exec("DELETE FROM evidence WHERE id = ?", [id]);
  await auditLog({ userId: session.userId, action: "DELETE_EVIDENCE", entityType: "evidence", entityId: id, oldValues: { name: row.name, sha256: row.sha256 }, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "تم حذف الدليل" });
}
