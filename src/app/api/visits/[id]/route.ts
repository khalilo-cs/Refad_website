import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { queryOne, getDb, nowISO } from "@/lib/db/sqlite";
import { canAccessVisit } from "@/lib/scope";
import { notify, schoolUsers } from "@/lib/notify";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "start" | "submit" | "approve" | "return" | "postpone" | "cancel" | "reschedule";

/** انتقالات حالة الزيارة المسموحة. */
const TRANSITIONS: Record<Action, { from: string[]; to: string; roles: string[] }> = {
  start: { from: ["SCHEDULED", "POSTPONED"], to: "IN_PROGRESS", roles: ["INSPECTOR", "SUPER_ADMIN", "EDUCATION_DIRECTOR"] },
  submit: { from: ["IN_PROGRESS"], to: "SUBMITTED", roles: ["INSPECTOR", "SUPER_ADMIN", "EDUCATION_DIRECTOR"] },
  approve: { from: ["SUBMITTED"], to: "COMPLETED", roles: ["EDUCATION_DIRECTOR", "SUPER_ADMIN"] },
  return: { from: ["SUBMITTED", "COMPLETED"], to: "IN_PROGRESS", roles: ["EDUCATION_DIRECTOR", "SUPER_ADMIN"] },
  postpone: { from: ["SCHEDULED"], to: "POSTPONED", roles: ["INSPECTOR", "SUPER_ADMIN", "EDUCATION_DIRECTOR"] },
  reschedule: { from: ["SCHEDULED", "POSTPONED"], to: "SCHEDULED", roles: ["INSPECTOR", "SUPER_ADMIN", "EDUCATION_DIRECTOR"] },
  cancel: { from: ["SCHEDULED", "POSTPONED", "IN_PROGRESS"], to: "CANCELLED", roles: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"] },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  const { id } = await params;
  if (!canAccessVisit(session, id)) return NextResponse.json({ message: "لا تملك صلاحية الوصول إلى هذه الزيارة" }, { status: 403 });
  const visit = queryOne(
    `SELECT v.*, s.name AS school_name, s.code AS school_code, u.name AS inspector_name
     FROM visits v JOIN schools s ON s.id = v.school_id JOIN users u ON u.id = v.inspector_id WHERE v.id = ?`,
    [id]
  );
  if (!visit) return NextResponse.json({ message: "الزيارة غير موجودة" }, { status: 404 });
  return NextResponse.json({ visit });
}

/** PATCH /api/visits/[id] — { action, scheduledAt?, notes?, reason?, strengths?, gaps? } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
    const { id } = await params;
    if (!canAccessVisit(session, id)) return NextResponse.json({ message: "لا تملك صلاحية الوصول إلى هذه الزيارة" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "") as Action;
    const t = TRANSITIONS[action];
    if (!t) return NextResponse.json({ message: "إجراء غير معروف" }, { status: 400 });
    if (!t.roles.includes(session.roleKey)) {
      return NextResponse.json({ message: "لا تملك صلاحية تنفيذ هذا الإجراء" }, { status: 403 });
    }

    const visit = queryOne<any>("SELECT * FROM visits WHERE id = ?", [id]);
    if (!visit) return NextResponse.json({ message: "الزيارة غير موجودة" }, { status: 404 });
    if (session.roleKey === "INSPECTOR" && visit.inspector_id !== session.userId) {
      return NextResponse.json({ message: "هذه الزيارة مسندة لمفتش آخر" }, { status: 403 });
    }
    if (!t.from.includes(visit.status)) {
      return NextResponse.json({ message: "لا يمكن تنفيذ هذا الإجراء على الزيارة في حالتها الحالية" }, { status: 409 });
    }
    if ((action === "return" || action === "postpone" || action === "cancel") && String(body?.reason ?? "").trim().length < 3) {
      return NextResponse.json({ message: "سبب الإجراء مطلوب" }, { status: 400 });
    }
    if (action === "reschedule" && (!body?.scheduledAt || Number.isNaN(Date.parse(body.scheduledAt)))) {
      return NextResponse.json({ message: "الموعد الجديد غير صالح" }, { status: 400 });
    }

    const now = nowISO();
    const db = getDb();
    const sets: string[] = ["status = ?", "updated_at = ?"];
    const vals: unknown[] = [t.to, now];
    if (action === "start") { sets.push("started_at = COALESCE(started_at, ?)"); vals.push(now); }
    if (action === "submit") {
      sets.push("submitted_at = ?", "submitted_by_id = ?", "ended_at = ?");
      vals.push(now, session.userId, now);
      if (typeof body.strengths === "string") { sets.push("strengths = ?"); vals.push(body.strengths.slice(0, 4000)); }
      if (typeof body.gaps === "string") { sets.push("gaps = ?"); vals.push(body.gaps.slice(0, 4000)); }
    }
    if (action === "return") { sets.push("submitted_at = NULL"); }
    if (action === "reschedule") { sets.push("scheduled_at = ?"); vals.push(body.scheduledAt); }
    if (body?.reason) { sets.push("notes = ?"); vals.push(String(body.reason).slice(0, 1000)); }
    vals.push(id);
    db.prepare(`UPDATE visits SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

    const school = queryOne<{ name: string }>("SELECT name FROM schools WHERE id = ?", [visit.school_id]);
    const labels: Record<Action, string> = {
      start: "بدأت الزيارة", submit: "قُدِّمت الزيارة للمراجعة", approve: "اعتُمدت الزيارة",
      return: "أُعيدت الزيارة للتعديل", postpone: "أُجِّلت الزيارة", cancel: "أُلغيت الزيارة", reschedule: "عُدِّل موعد الزيارة",
    };
    if (action === "submit") {
      const directors = db.prepare(
        `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id JOIN schools s ON s.id = ?
         WHERE r.key = 'EDUCATION_DIRECTOR' AND u.directorate_id = s.directorate_id AND u.is_active = 1`
      ).all(visit.school_id) as { id: string }[];
      notify(directors.map((d) => d.id), "زيارة بانتظار المراجعة", `${school?.name}: ${labels[action]}`, { link: "/visits", type: "WARNING" });
    } else if (action === "return") {
      notify([visit.inspector_id], "أُعيدت الزيارة للتعديل", String(body.reason), { link: "/evaluation", type: "WARNING" });
    } else if (action === "approve") {
      notify([visit.inspector_id, ...schoolUsers(visit.school_id, ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"])],
        "اعتُمدت الزيارة", `${school?.name}: ${labels[action]}`, { link: "/reports", type: "SUCCESS" });
    } else if (["postpone", "cancel", "reschedule"].includes(action)) {
      notify([visit.inspector_id, ...schoolUsers(visit.school_id, ["SCHOOL_PRINCIPAL"])],
        labels[action], `${school?.name}`, { link: "/visits", type: "WARNING" });
    }

    auditLog({
      userId: session.userId, action: `VISIT_${action.toUpperCase()}`, entityType: "visit", entityId: id,
      oldValues: { status: visit.status }, newValues: { status: t.to, reason: body?.reason ?? null },
      ipAddress: clientIp(request), userAgent: request.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ message: labels[action], status: t.to });
  } catch (e: any) {
    return NextResponse.json(
      { message: "تعذّر تنفيذ الإجراء", debug: process.env.NODE_ENV !== "production" ? e?.message : undefined },
      { status: 500 }
    );
  }
}
