import { NextResponse } from "next/server";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { query, queryOne, getDb } from "@/lib/db/sqlite";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const ROLES = [
  "SUPER_ADMIN",
  "EDUCATION_DIRECTOR",
  "INSPECTOR",
  "SCHOOL_PRINCIPAL",
  "QUALITY_COORDINATOR",
];

const PLAN_STATUS = ["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"];
const ACTION_STATUS = ["NEW", "IN_PROGRESS", "COMPLETED", "CLOSED_VERIFIED", "CLOSED_REJECTED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

/** GET /api/improvement — الخطط مع إجراءاتها */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ROLES });
  if (!allowed) return bad("غير مصرح", 403);

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId") ?? "";

  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (session.roleKey === "SCHOOL_PRINCIPAL" && session.schoolId) {
    where.push("p.school_id = ?");
    params.push(session.schoolId);
  } else if (session.roleKey === "EDUCATION_DIRECTOR" && session.directorateId) {
    where.push("s.directorate_id = ?");
    params.push(session.directorateId);
  }
  if (schoolId) {
    where.push("p.school_id = ?");
    params.push(schoolId);
  }

  const plans = query<any>(
    `SELECT p.id, p.title, p.description, p.status, p.created_at, p.school_id,
            s.name AS school_name,
            u.name AS created_by_name,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id) AS actions_count,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id AND a.status IN ('COMPLETED','CLOSED_VERIFIED')) AS actions_done,
            (SELECT COUNT(*) FROM corrective_actions a WHERE a.plan_id = p.id
               AND a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED')
               AND date(a.due_date) < date('now')) AS actions_overdue
     FROM improvement_plans p
     JOIN schools s ON s.id = p.school_id
     LEFT JOIN users u ON u.id = p.created_by_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.created_at DESC
     LIMIT 100`,
    params
  );

  const planIds = plans.map((p) => p.id);
  const actions =
    planIds.length > 0
      ? query<any>(
          `SELECT a.id, a.plan_id, a.problem_description, a.root_cause, a.priority,
                  a.proposed_action, a.due_date, a.resources, a.success_indicator,
                  a.status, a.verification_notes,
                  u.name AS responsible_name,
                  i.code AS indicator_code, i.title AS indicator_title
           FROM corrective_actions a
           LEFT JOIN users u ON u.id = a.responsible_id
           LEFT JOIN indicators i ON i.id = a.indicator_id
           WHERE a.plan_id IN (${planIds.map(() => "?").join(",")})
           ORDER BY
             CASE a.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
             date(a.due_date)`,
          planIds
        )
      : [];

  const withActions = plans.map((p) => ({
    ...p,
    actions: actions.filter((a) => a.plan_id === p.id),
  }));

  const totals = queryOne<any>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN date(a.due_date) < date('now') AND a.status NOT IN ('COMPLETED','CLOSED_VERIFIED','CLOSED_REJECTED') THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN a.status IN ('COMPLETED','CLOSED_VERIFIED') THEN 1 ELSE 0 END) AS done
     FROM corrective_actions a
     JOIN improvement_plans p ON p.id = a.plan_id
     JOIN schools s ON s.id = p.school_id
     WHERE ${where.map((w) => w.replace("p.school_id", "p.school_id")).join(" AND ")}`,
    params
  );

  return NextResponse.json({ plans: withActions, totals: totals ?? {} });
}

/** POST /api/improvement — إنشاء خطة أو إجراء تصحيحي */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ROLES });
  if (!allowed) return bad("غير مصرح", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const kind = String(body.kind ?? "action");
  const db = getDb();

  if (kind === "plan") {
    const title = String(body.title ?? "").trim();
    if (title.length < 3) return bad("عنوان الخطة قصير جداً");
    const schoolId = String(body.schoolId ?? "");
    if (!queryOne("SELECT id FROM schools WHERE id = ?", [schoolId]))
      return bad("المدرسة غير موجودة");
    if (session.roleKey === "SCHOOL_PRINCIPAL" && session.schoolId !== schoolId)
      return bad("يمكنك إنشاء خطط لمدرستك فقط", 403);

    const id = randomUUID();
    db.prepare(
      `INSERT INTO improvement_plans (id, school_id, title, description, status, created_by_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`
    ).run(id, schoolId, title, String(body.description ?? "").slice(0, 2000) || null, "ACTIVE", session.userId);

    auditLog({
      userId: session.userId,
      action: "CREATE_IMPROVEMENT_PLAN",
      entityType: "improvement_plan",
      entityId: id,
      newValues: { title, schoolId },
    });
    return NextResponse.json({ id, message: "تم إنشاء خطة التحسين" }, { status: 201 });
  }

  // إجراء تصحيحي
  const planId = String(body.planId ?? "");
  const plan = queryOne<any>("SELECT * FROM improvement_plans WHERE id = ?", [planId]);
  if (!plan) return bad("خطة التحسين غير موجودة", 404);

  const problem = String(body.problemDescription ?? "").trim();
  if (problem.length < 5) return bad("وصف المشكلة قصير جداً");
  const action = String(body.proposedAction ?? "").trim();
  if (action.length < 5) return bad("الإجراء المقترح قصير جداً");
  const dueDate = String(body.dueDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return bad("تاريخ التنفيذ غير صالح");
  const priority = String(body.priority ?? "MEDIUM");
  if (!PRIORITIES.includes(priority)) return bad("أولوية غير معروفة");

  const responsibleId = String(body.responsibleId ?? session.userId);
  if (!queryOne("SELECT id FROM users WHERE id = ?", [responsibleId]))
    return bad("المسؤول غير موجود");

  const id = randomUUID();
  db.prepare(
    `INSERT INTO corrective_actions (id, plan_id, evaluation_id, indicator_id, problem_description,
       root_cause, priority, proposed_action, responsible_id, due_date, resources, success_indicator,
       status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
  ).run(
    id,
    planId,
    String(body.evaluationId ?? "") || null,
    String(body.indicatorId ?? "") || null,
    problem,
    String(body.rootCause ?? "").slice(0, 1000) || null,
    priority,
    action,
    responsibleId,
    dueDate,
    String(body.resources ?? "").slice(0, 1000) || null,
    String(body.successIndicator ?? "").slice(0, 1000) || null,
    "NEW"
  );

  auditLog({
    userId: session.userId,
    action: "CREATE_CORRECTIVE_ACTION",
    entityType: "corrective_action",
    entityId: id,
    newValues: { planId, problem, priority, dueDate },
  });
  return NextResponse.json({ id, message: "تمت إضافة الإجراء التصحيحي" }, { status: 201 });
}

/** PATCH /api/improvement — تحديث حالة خطة أو إجراء */
export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, { roles: ROLES });
  if (!allowed) return bad("غير مصرح", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad("صيغة الطلب غير صحيحة");
  }

  const db = getDb();

  if (body.planId) {
    const status = String(body.status ?? "");
    if (!PLAN_STATUS.includes(status)) return bad("حالة خطة غير معروفة");
    const plan = queryOne<any>("SELECT * FROM improvement_plans WHERE id = ?", [body.planId]);
    if (!plan) return bad("الخطة غير موجودة", 404);
    db.prepare("UPDATE improvement_plans SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      status,
      body.planId
    );
    auditLog({
      userId: session.userId,
      action: "UPDATE_IMPROVEMENT_PLAN",
      entityType: "improvement_plan",
      entityId: body.planId,
      oldValues: { status: plan.status },
      newValues: { status },
    });
    return NextResponse.json({ message: "تم تحديث حالة الخطة" });
  }

  const actionId = String(body.actionId ?? "");
  const status = String(body.status ?? "");
  if (!ACTION_STATUS.includes(status)) return bad("حالة إجراء غير معروفة");

  const row = queryOne<any>("SELECT * FROM corrective_actions WHERE id = ?", [actionId]);
  if (!row) return bad("الإجراء غير موجود", 404);

  // التحقق من إنجاز الإجراء يتم بواسطة مفتش أو مدير
  if (status === "CLOSED_VERIFIED" &&
      !["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(session.roleKey))
    return bad("التحقق من إنجاز الإجراء يتطلب مفتشاً أو مديراً", 403);

  if (status === "CLOSED_REJECTED" && String(body.notes ?? "").trim().length < 5)
    return bad("سبب عدم قبول الإنجاز مطلوب (5 أحرف على الأقل)");

  db.prepare(
    `UPDATE corrective_actions SET status = ?, verification_notes = ?, verified_by_id = ?,
       verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(
    status,
    String(body.notes ?? "").slice(0, 1000) || null,
    status === "CLOSED_VERIFIED" || status === "CLOSED_REJECTED" ? session.userId : null,
    actionId
  );

  auditLog({
    userId: session.userId,
    action: "UPDATE_CORRECTIVE_ACTION",
    entityType: "corrective_action",
    entityId: actionId,
    oldValues: { status: row.status },
    newValues: { status, notes: body.notes },
  });
  return NextResponse.json({ message: "تم تحديث حالة الإجراء" });
}

/** DELETE /api/improvement?planId= أو ?actionId= */
export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  const { allowed } = authorize(session, {
    roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL"],
  });
  if (!allowed) return bad("غير مصرح", 403);

  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("planId");
  const actionId = searchParams.get("actionId");
  const db = getDb();

  try {
    if (planId) {
      db.prepare("DELETE FROM improvement_plans WHERE id = ?").run(planId);
      auditLog({
        userId: session.userId,
        action: "DELETE_IMPROVEMENT_PLAN",
        entityType: "improvement_plan",
        entityId: planId,
      });
      return NextResponse.json({ message: "تم حذف خطة التحسين وإجراءاتها" });
    }
    if (actionId) {
      db.prepare("DELETE FROM corrective_actions WHERE id = ?").run(actionId);
      auditLog({
        userId: session.userId,
        action: "DELETE_CORRECTIVE_ACTION",
        entityType: "corrective_action",
        entityId: actionId,
      });
      return NextResponse.json({ message: "تم حذف الإجراء" });
    }
    return bad("يجب تحديد خطة أو إجراء");
  } catch (e: any) {
    return bad("تعذّر الحذف: " + (e?.message ?? "خطأ"), 500);
  }
}
