import { randomInt } from "crypto";
import { getDb, query, queryOne, uuid, nowISO } from "../db/sqlite";
import { canAccessSchool, canAccessVisit, schoolScope, type ScopeUser } from "../scope";
import {
  ReportError, buildDirectorateDaily, buildPeriodic, buildQualityDetailed, buildSpecial, buildVisitDaily, type PeriodKind,
} from "./builders";
import type { ReportContent, ReportType } from "./types";

export type Actor = ScopeUser & { userId: string; name: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** رمز تحقق عشوائي آمن تشفيرياً (10 خانات). */
export function newVerificationCode(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

const CAN_CREATE: Record<ReportType, string[]> = {
  VISIT_DAILY: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"],
  DIRECTORATE_DAILY: ["SUPER_ADMIN", "EDUCATION_DIRECTOR"],
  PERIODIC: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"],
  QUALITY_DETAILED: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"],
  SPECIAL: ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"],
};

export type CreateParams = {
  type: ReportType;
  visitId?: string;
  schoolId?: string;
  directorateId?: string;
  date?: string;
  period?: PeriodKind;
  topic?: string;
  from?: string;
  to?: string;
  title?: string;
};

/** يبني المحتوى ويُنشئ التقرير كمسودة. لا يُعتمد التقرير هنا أبداً. */
export function createReport(actor: Actor, p: CreateParams): { id: string; number: string; content: ReportContent } {
  if (!CAN_CREATE[p.type]) throw new ReportError("نوع تقرير غير معروف");
  if (!CAN_CREATE[p.type].includes(actor.roleKey)) throw new ReportError("إنشاء هذا النوع من التقارير غير متاح لدورك", 403);

  let content: ReportContent;
  let schoolId: string | null = null;
  let directorateId: string | null = p.directorateId ?? null;
  let visitId: string | null = null;
  let from = p.from ?? null, to = p.to ?? null;

  // مدير المديرية مقيَّد بمديريته
  if (actor.roleKey === "EDUCATION_DIRECTOR") directorateId = actor.directorateId;

  switch (p.type) {
    case "VISIT_DAILY": {
      if (!p.visitId) throw new ReportError("الزيارة مطلوبة");
      if (!canAccessVisit(actor, p.visitId)) throw new ReportError("لا تملك صلاحية على هذه الزيارة", 403);
      const v = queryOne<{ school_id: string; inspector_id: string; status: string }>("SELECT school_id, inspector_id, status FROM visits WHERE id = ?", [p.visitId]);
      if (!v) throw new ReportError("الزيارة غير موجودة", 404);
      if (actor.roleKey === "INSPECTOR" && v.inspector_id !== actor.userId) throw new ReportError("لا يمكنك توليد تقرير لزيارة ليست لك", 403);
      content = buildVisitDaily(p.visitId);
      schoolId = v.school_id; visitId = p.visitId;
      break;
    }
    case "DIRECTORATE_DAILY": {
      const date = p.date ?? new Date().toISOString().slice(0, 10);
      content = buildDirectorateDaily(directorateId, date, actor);
      from = to = date;
      break;
    }
    case "PERIODIC": {
      const date = p.date ?? new Date().toISOString().slice(0, 10);
      content = buildPeriodic((p.period ?? "month") as PeriodKind, date, directorateId, actor);
      break;
    }
    case "QUALITY_DETAILED": {
      const sid = p.schoolId ?? actor.schoolId;
      if (!sid) throw new ReportError("المدرسة مطلوبة");
      if (!canAccessSchool(actor, sid)) throw new ReportError("المدرسة خارج نطاق صلاحيتك", 403);
      content = buildQualityDetailed(sid, p.visitId ?? null);
      schoolId = sid;
      break;
    }
    case "SPECIAL": {
      const sid = ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(actor.roleKey) ? actor.schoolId : p.schoolId ?? null;
      if (sid && !canAccessSchool(actor, sid)) throw new ReportError("المدرسة خارج نطاق صلاحيتك", 403);
      content = buildSpecial(p.topic ?? "", sid, directorateId, p.from ?? null, p.to ?? null, actor);
      schoolId = sid ?? null;
      break;
    }
    default:
      throw new ReportError("نوع تقرير غير معروف");
  }
  if (p.title?.trim()) content.title = p.title.trim().slice(0, 200);

  const db = getDb();
  const year = new Date().getFullYear();
  const id = uuid();
  let number = "";
  const now = nowISO();
  // ترقيم متسلسل سنوي آمن ضد التزامن: نعيد المحاولة عند تعارض UNIQUE
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = queryOne<{ n: number }>("SELECT MAX(CAST(substr(number, -4) AS INTEGER)) AS n FROM reports WHERE number LIKE ?", [`RIF-${year}-%`]);
    number = `RIF-${year}-${String((last?.n ?? 0) + 1 + attempt).padStart(4, "0")}`;
    try {
      db.prepare(
        `INSERT INTO reports (id, number, title, type, school_id, directorate_id, period_start, period_end, status, generated_by_id,
            verification_code, summary, content, params, visit_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, number, content.title, p.type, schoolId, directorateId, from, to, actor.userId, newVerificationCode(),
        JSON.stringify({ state: content.state }), JSON.stringify(content), JSON.stringify(p), visitId, now, now);
      return { id, number, content };
    } catch (e: any) {
      if (!String(e?.message).includes("UNIQUE")) throw e;
    }
  }
  throw new ReportError("تعذّر توليد رقم فريد للتقرير، أعد المحاولة", 500);
}

/** شرط رؤية التقارير لمستخدم. */
export function reportScope(actor: Actor): { sql: string; params: unknown[] } {
  if (actor.roleKey === "SUPER_ADMIN") return { sql: "1 = 1", params: [] };
  const sc = schoolScope(actor, "rs");
  let sql = `(r.generated_by_id = ? OR (r.school_id IS NOT NULL AND r.school_id IN (SELECT rs.id FROM schools rs WHERE ${sc.sql}`;
  const params: unknown[] = [actor.userId, ...sc.params];
  sql += "))";
  if (actor.roleKey === "EDUCATION_DIRECTOR" && actor.directorateId) { sql += " OR (r.school_id IS NULL AND r.directorate_id = ?)"; params.push(actor.directorateId); }
  sql += ")";
  // مدير المدرسة ومنسق الجودة لا يريان إلا المعتمد أو ما أنشآه
  if (["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(actor.roleKey)) {
    sql += " AND (r.status = 'APPROVED' OR r.generated_by_id = ?)";
    params.push(actor.userId);
  }
  return { sql, params };
}

export function getReportRow(actor: Actor, id: string): any | null {
  const sc = reportScope(actor);
  return queryOne(
    `SELECT r.*, s.name AS school_name, d.name AS directorate_name, u.name AS generated_by_name, a.name AS approved_by_name
     FROM reports r LEFT JOIN schools s ON s.id = r.school_id LEFT JOIN directorates d ON d.id = r.directorate_id
     LEFT JOIN users u ON u.id = r.generated_by_id LEFT JOIN users a ON a.id = r.approved_by_id
     WHERE r.id = ? AND ${sc.sql}`, [id, ...sc.params]);
}

export function parseContent(row: any): ReportContent | null {
  try { return row.content ? (JSON.parse(row.content) as ReportContent) : null; } catch { return null; }
}

export { query };
