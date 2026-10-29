import { NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { query, queryOne, uuid , exec } from "@/lib/db/sqlite";
import { canAccessSchool, schoolScope } from "@/lib/scope";
import { clientIp } from "@/lib/security";
import { notify, schoolUsers } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"];
const VERIFIERS = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];
const PLAN_STATUS = ["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const OPEN = "('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED')";

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET /api/improvement?schoolId=&planId=&status= — الخطط مع إجراءاتها وعدد الأدلة، بنطاق الدور. */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);

  const sp = new URL(request.url).searchParams;
  const sc = await schoolScope(session, "s");
  const where = [sc.sql];
  const params: unknown[] = [...sc.params];
  if (sp.get("schoolId")) { where.push("p.school_id = ?"); params.push(sp.get("schoolId")); }
  if (sp.get("planId")) { where.push("p.id = ?"); params.push(sp.get("planId")); }
  const W = where.join(" AND ");

  const plans = await query<any>(
    `SELECT p.id, p.title, p.description, p.status, p.created_at, p.school_id, s.name AS school_name, u.name AS created_by_name,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id) AS actions_count,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id AND a.status IN ('CLOSED_VERIFIED')) AS actions_done,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id AND a.status NOT IN ${OPEN} AND date(a.due_date) < date('now')) AS actions_overdue
     FROM improvement_plans p JOIN schools s ON s.id = p.school_id LEFT JOIN users u ON u.id = p.created_by_id
     WHERE ${W} ORDER BY p.created_at DESC LIMIT 200`, params);

  const ids = plans.map((p) => p.id);
  const actions = ids.length
    ? await query<any>(
        `SELECT a.id, a.plan_id, a.problem_description, a.root_cause, a.priority, a.proposed_action, a.due_date, a.resources, a.success_indicator,
                a.status, a.verification_notes, a.verified_at, a.responsible_id, u.name AS responsible_name, vu.name AS verified_by_name,
                i.code AS indicator_code, i.title AS indicator_title, a.indicator_id, p.school_id, s.name AS school_name, p.title AS plan_title,
                CASE WHEN a.status NOT IN ${OPEN} AND date(a.due_date) < date('now') THEN 1 ELSE 0 END AS is_overdue,
                (SELECT COUNT(*) FROM evidence x WHERE x.action_id = a.id) AS evidence_total,
                (SELECT COUNT(*) FROM evidence x WHERE x.action_id = a.id AND x.review_status = 'ACCEPTED') AS evidence_accepted
         FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id
         LEFT JOIN users u ON u.id = a.responsible_id LEFT JOIN users vu ON vu.id = a.verified_by_id LEFT JOIN indicators i ON i.id = a.indicator_id
         WHERE a.plan_id IN (${ids.map(() => "?").join(",")})
         ORDER BY CASE a.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, date(a.due_date)`, ids)
    : [];

  const totals = await queryOne<any>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN date(a.due_date) < date('now') AND a.status NOT IN ${OPEN} THEN 1 ELSE 0 END) AS overdue,
            SUM(CASE WHEN a.status = 'CLOSED_VERIFIED' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) AS awaiting
     FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id JOIN schools s ON s.id = p.school_id WHERE ${W}`, params);

  // مسؤولون محتملون لإسناد الإجراءات داخل نطاق المستخدم
  const people = await query<any>(
    `SELECT DISTINCT u.id, u.name, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1 AND r.key IN ('SCHOOL_PRINCIPAL','QUALITY_COORDINATOR','TEACHER','INSPECTOR','EDUCATION_DIRECTOR')
       AND (u.school_id IN (SELECT s.id FROM schools s WHERE ${sc.sql}) OR r.key IN ('INSPECTOR','EDUCATION_DIRECTOR'))
     ORDER BY u.name LIMIT 100`, sc.params);

  return NextResponse.json({
    plans: plans.map((p) => ({ ...p, actions: actions.filter((a) => a.plan_id === p.id) })),
    actions,
    totals: totals ?? {},
    people,
    canVerify: VERIFIERS.includes(session.roleKey),
  });
}

/** POST — { kind: "plan" | "action", ... } */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);
  const body: any = await request.json().catch(() => null);
  if (!body) return bad("صيغة الطلب غير صحيحة");
  const kind = String(body.kind ?? "action");

  if (kind === "plan") {
    const title = String(body.title ?? "").trim();
    if (title.length < 3) return bad("عنوان الخطة قصير جداً");
    const schoolId = String(body.schoolId ?? session.schoolId ?? "");
    if (!await queryOne("SELECT id FROM schools WHERE id = ?", [schoolId])) return bad("المدرسة غير موجودة", 404);
    if (!await canAccessSchool(session, schoolId)) return bad("المدرسة خارج نطاق صلاحيتك", 403);
    const id = uuid();
    await exec(`INSERT INTO improvement_plans (id, school_id, title, description, status, created_by_id) VALUES (?,?,?,?, 'ACTIVE', ?)`, [id, schoolId, title.slice(0, 200), String(body.description ?? "").slice(0, 2000) || null, session.userId]);
    await auditLog({ userId: session.userId, action: "CREATE_IMPROVEMENT_PLAN", entityType: "improvement_plan", entityId: id, newValues: { title, schoolId }, ipAddress: clientIp(request) });
    await notify((await schoolUsers(schoolId, ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"])).filter((u) => u !== session.userId), "خطة تحسين جديدة", title, { link: `/improvement?planId=${id}` });
    return NextResponse.json({ id, message: "تم إنشاء خطة التحسين" }, { status: 201 });
  }

  // إجراء تصحيحي
  const plan = await queryOne<any>("SELECT * FROM improvement_plans WHERE id = ?", [String(body.planId ?? "")]);
  if (!plan) return bad("خطة التحسين غير موجودة", 404);
  if (!await canAccessSchool(session, plan.school_id)) return bad("الخطة خارج نطاق صلاحيتك", 403);
  if (["COMPLETED", "CANCELLED"].includes(plan.status)) return bad("الخطة مغلقة أو ملغاة؛ أعد فتحها لإضافة إجراءات", 409);

  const problem = String(body.problemDescription ?? "").trim();
  const action = String(body.proposedAction ?? "").trim();
  if (problem.length < 5) return bad("وصف المشكلة قصير جداً");
  if (action.length < 5) return bad("الإجراء المقترح قصير جداً");
  const dueDate = String(body.dueDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate))) return bad("تاريخ التنفيذ غير صالح");
  const priority = String(body.priority ?? "MEDIUM");
  if (!PRIORITIES.includes(priority)) return bad("أولوية غير معروفة");
  const responsibleId = String(body.responsibleId ?? session.userId);
  const resp = await queryOne<any>("SELECT u.id, u.school_id, r.key FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_active = 1", [responsibleId]);
  if (!resp) return bad("المسؤول غير موجود");
  if (resp.school_id && resp.school_id !== plan.school_id) return bad("المسؤول من مدرسة أخرى");
  const indicatorId = String(body.indicatorId ?? "") || null;
  if (indicatorId && !await queryOne("SELECT id FROM indicators WHERE id = ?", [indicatorId])) return bad("المؤشر غير موجود", 404);
  const evaluationId = String(body.evaluationId ?? "") || null;
  if (evaluationId && !await queryOne("SELECT e.id FROM evaluations e JOIN visits v ON v.id = e.visit_id WHERE e.id = ? AND v.school_id = ?", [evaluationId, plan.school_id])) return bad("التقييم لا يخص هذه المدرسة");

  const id = uuid();
  await exec(`INSERT INTO corrective_actions (id, plan_id, evaluation_id, indicator_id, problem_description, root_cause, priority, proposed_action,
       responsible_id, due_date, resources, success_indicator, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'NEW')`, [id, plan.id, evaluationId, indicatorId, problem.slice(0, 1000), String(body.rootCause ?? "").slice(0, 1000) || null, priority, action.slice(0, 1000),
    responsibleId, dueDate, String(body.resources ?? "").slice(0, 1000) || null, String(body.successIndicator ?? "").slice(0, 1000) || null]);
  await auditLog({ userId: session.userId, action: "CREATE_CORRECTIVE_ACTION", entityType: "corrective_action", entityId: id, newValues: { planId: plan.id, priority, dueDate }, ipAddress: clientIp(request) });
  await notify([responsibleId].filter((x) => x !== session.userId), "إجراء تصحيحي مسند إليك", `${action.slice(0, 80)} — الموعد ${dueDate}`, { link: `/improvement?planId=${plan.id}`, type: "WARNING" });
  return NextResponse.json({ id, message: "تمت إضافة الإجراء التصحيحي" }, { status: 201 });
}

/**
 * PATCH — { planId, status } أو { actionId, status, notes? }
 * قواعد الإجراء: NEW→IN_PROGRESS→COMPLETED (يتطلب دليلاً مرفقاً) → CLOSED_VERIFIED/CLOSED_REJECTED
 * (التحقق للمفتش أو المدير فقط، ويتطلب دليلاً مقبولاً). لا إغلاق بمجرد إقرار المدرسة بالمعالجة.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!ROLES.includes(session.roleKey)) return bad("غير مصرح", 403);
  const body: any = await request.json().catch(() => null);
  if (!body) return bad("صيغة الطلب غير صحيحة");

  if (body.planId) {
    const status = String(body.status ?? "");
    if (!PLAN_STATUS.includes(status)) return bad("حالة خطة غير معروفة");
    const plan = await queryOne<any>("SELECT * FROM improvement_plans WHERE id = ?", [body.planId]);
    if (!plan) return bad("الخطة غير موجودة", 404);
    if (!await canAccessSchool(session, plan.school_id)) return bad("الخطة خارج نطاق صلاحيتك", 403);
    if (status === "COMPLETED") {
      const open = (await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM corrective_actions WHERE plan_id = ? AND status <> 'CLOSED_VERIFIED'`, [plan.id]))?.n ?? 0;
      if (open > 0) return bad(`لا يمكن إكمال الخطة: ${open} إجراء لم يُغلق بعد التحقق`, 409);
    }
    await exec("UPDATE improvement_plans SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, plan.id]);
    await auditLog({ userId: session.userId, action: "UPDATE_IMPROVEMENT_PLAN", entityType: "improvement_plan", entityId: plan.id, oldValues: { status: plan.status }, newValues: { status }, ipAddress: clientIp(request) });
    return NextResponse.json({ message: "تم تحديث حالة الخطة" });
  }

  const status = String(body.status ?? "");
  const row = await queryOne<any>(
    `SELECT a.*, p.school_id, p.title AS plan_title FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id WHERE a.id = ?`, [String(body.actionId ?? "")]);
  if (!row) return bad("الإجراء غير موجود", 404);
  if (!await canAccessSchool(session, row.school_id)) return bad("الإجراء خارج نطاق صلاحيتك", 403);
  const notes = String(body.notes ?? "").trim();
  const isVerifier = VERIFIERS.includes(session.roleKey);

  const ev = await queryOne<{ total: number; accepted: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN review_status='ACCEPTED' THEN 1 ELSE 0 END),0) AS accepted FROM evidence WHERE action_id = ?`, [row.id]);

  const allowed: Record<string, string[]> = {
    NEW: ["IN_PROGRESS"],
    IN_PROGRESS: ["COMPLETED", "NEW"],
    COMPLETED: ["CLOSED_VERIFIED", "CLOSED_REJECTED", "IN_PROGRESS"],
    CLOSED_REJECTED: ["IN_PROGRESS"],
    CLOSED_VERIFIED: isVerifier ? ["IN_PROGRESS"] : [],
  };
  if (!(allowed[row.status] ?? []).includes(status)) return bad("انتقال الحالة غير مسموح من حالته الحالية", 409);

  if (status === "COMPLETED") {
    if ((ev?.total ?? 0) < 1) return bad("أرفق دليلاً يثبت الإنجاز قبل تحديد الإجراء كمكتمل (من صفحة الأدلة وربطه بالإجراء)", 422);
  }
  if (status === "CLOSED_VERIFIED" || status === "CLOSED_REJECTED") {
    if (!isVerifier) return bad("التحقق من إنجاز الإجراء للمفتش أو المدير فقط", 403);
    if (status === "CLOSED_VERIFIED" && (ev?.accepted ?? 0) < 1) return bad("لا يُغلق الإجراء قبل قبول دليل الإنجاز في صفحة الأدلة", 422);
    if (status === "CLOSED_REJECTED" && notes.length < 5) return bad("سبب عدم قبول الإنجاز مطلوب (5 أحرف على الأقل)");
    if (row.responsible_id === session.userId && session.roleKey !== "SUPER_ADMIN") return bad("لا يمكنك التحقق من إجراء أنت مسؤوله", 403);
  }
  if (row.status === "CLOSED_VERIFIED" && status === "IN_PROGRESS" && notes.length < 5) return bad("سبب إعادة فتح الإجراء مطلوب");

  const verifying = status === "CLOSED_VERIFIED" || status === "CLOSED_REJECTED";
  await exec(`UPDATE corrective_actions SET status = ?, verification_notes = COALESCE(?, verification_notes), verified_by_id = ?, verified_at = ?, updated_at = datetime('now') WHERE id = ?`, [status, notes ? notes.slice(0, 1000) : null, verifying ? session.userId : status === "IN_PROGRESS" ? null : row.verified_by_id, verifying ? new Date().toISOString() : status === "IN_PROGRESS" ? null : row.verified_at, row.id]);
  await auditLog({ userId: session.userId, action: "UPDATE_CORRECTIVE_ACTION", entityType: "corrective_action", entityId: row.id, oldValues: { status: row.status }, newValues: { status, notes }, ipAddress: clientIp(request) });

  if (status === "COMPLETED") {
    const verifiers = await query<{ id: string }>(`SELECT DISTINCT u.id FROM users u JOIN roles r ON r.id = u.role_id JOIN schools s ON s.id = ? WHERE u.is_active = 1 AND (r.key = 'INSPECTOR' OR (r.key = 'EDUCATION_DIRECTOR' AND u.directorate_id = s.directorate_id))`, [row.school_id]);
    await notify(verifiers.map((v) => v.id), "إجراء بانتظار التحقق", row.proposed_action.slice(0, 90), { link: `/improvement?planId=${row.plan_id}`, type: "WARNING" });
  } else if (verifying) {
    await notify([row.responsible_id, ...(await schoolUsers(row.school_id, ["SCHOOL_PRINCIPAL"]))], status === "CLOSED_VERIFIED" ? "أُغلق الإجراء بعد التحقق" : "لم يُقبل إنجاز الإجراء", `${row.proposed_action.slice(0, 80)}${notes ? " — " + notes.slice(0, 80) : ""}`, { link: `/improvement?planId=${row.plan_id}`, type: status === "CLOSED_VERIFIED" ? "SUCCESS" : "DANGER" });
  }
  return NextResponse.json({ message: "تم تحديث حالة الإجراء" });
}

/** DELETE ?planId= أو ?actionId= — للإدارة، ولمدير المدرسة على خطط مدرسته التي لا تضم إجراءات مغلقة بالتحقق. */
export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL"].includes(session.roleKey)) return bad("غير مصرح", 403);
  const sp = new URL(request.url).searchParams;

  if (sp.get("planId")) {
    const plan = await queryOne<any>("SELECT * FROM improvement_plans WHERE id = ?", [sp.get("planId")]);
    if (!plan) return bad("الخطة غير موجودة", 404);
    if (!await canAccessSchool(session, plan.school_id)) return bad("خارج نطاق صلاحيتك", 403);
    const verified = (await queryOne<{ n: number }>("SELECT COUNT(*) n FROM corrective_actions WHERE plan_id = ? AND status = 'CLOSED_VERIFIED'", [plan.id]))?.n ?? 0;
    if (verified > 0 && session.roleKey === "SCHOOL_PRINCIPAL") return bad("لا يمكن حذف خطة تضم إجراءات مغلقة بعد التحقق", 409);
    await exec("DELETE FROM improvement_plans WHERE id = ?", [plan.id]);
    await auditLog({ userId: session.userId, action: "DELETE_IMPROVEMENT_PLAN", entityType: "improvement_plan", entityId: plan.id, oldValues: { title: plan.title }, ipAddress: clientIp(request) });
    return NextResponse.json({ message: "تم حذف خطة التحسين وإجراءاتها" });
  }
  if (sp.get("actionId")) {
    const a = await queryOne<any>("SELECT a.*, p.school_id FROM corrective_actions a JOIN improvement_plans p ON p.id = a.plan_id WHERE a.id = ?", [sp.get("actionId")]);
    if (!a) return bad("الإجراء غير موجود", 404);
    if (!await canAccessSchool(session, a.school_id)) return bad("خارج نطاق صلاحيتك", 403);
    if (a.status === "CLOSED_VERIFIED" && session.roleKey === "SCHOOL_PRINCIPAL") return bad("لا يمكن حذف إجراء مغلق بعد التحقق", 409);
    await exec("DELETE FROM corrective_actions WHERE id = ?", [a.id]);
    await auditLog({ userId: session.userId, action: "DELETE_CORRECTIVE_ACTION", entityType: "corrective_action", entityId: a.id, ipAddress: clientIp(request) });
    return NextResponse.json({ message: "تم حذف الإجراء" });
  }
  return bad("يجب تحديد خطة أو إجراء");
}
