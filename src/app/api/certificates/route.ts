import { NextRequest, NextResponse } from "next/server";
import { auditLog, getServerSession } from "@/lib/auth";
import { exec, query, toJson, uuid, nowISO } from "@/lib/db/sqlite";
import { certificateCode, draftCertificate } from "@/lib/certificates";
import { canReview, normalizeYear } from "@/lib/self-assessment";
import { notify, schoolUsers } from "@/lib/notify";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUERS = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"];
const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** GET ?schoolId=&year= — مسودة الشهادة المقترحة من البيانات + الشهادات الصادرة سابقاً. */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  const sp = request.nextUrl.searchParams;
  const schoolId = sp.get("schoolId") ?? "";
  if (!schoolId || !(await canReview(session, schoolId))) return bad("غير مصرح", 403);
  const year = normalizeYear(sp.get("year"));
  const draft = await draftCertificate(schoolId, year);
  const issued = await query<any>(
    `SELECT c.id, c.code, c.title, c.body, c.academic_year, c.issued_at, c.revoked_at, u.name AS issued_by
     FROM certificates c LEFT JOIN users u ON u.id = c.issued_by_id WHERE c.school_id = ? ORDER BY c.issued_at DESC`,
    [schoolId]
  );
  return NextResponse.json({ draft, issued, canIssue: ISSUERS.includes(session.roleKey) });
}

/** POST { schoolId, year } — إصدار الشهادة وتسجيلها برمز تحقق. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  const b = await request.json().catch(() => null);
  const schoolId = typeof b?.schoolId === "string" ? b.schoolId : "";
  if (!ISSUERS.includes(session.roleKey) || session.mustChangePassword || !(await canReview(session, schoolId))) return bad("إصدار الشهادات لمدير النظام ومدير الإدارة", 403);
  const year = normalizeYear(b?.year);
  const draft = await draftCertificate(schoolId, year);
  if (!draft.eligible) return bad(draft.reason ?? "غير مستحقة", 409);
  const id = uuid();
  const code = certificateCode();
  await exec(
    "INSERT INTO certificates (id, code, school_id, academic_year, kind, title, body, details, issued_by_id, issued_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, code, schoolId, year, draft.details.achievedCriteria.length ? "QUALITY" : "IMPROVEMENT", draft.title, draft.body, toJson(draft.details), session.userId, nowISO()]
  );
  await auditLog({ userId: session.userId, action: "CERTIFICATE_ISSUED", entityType: "Certificate", entityId: id, newValues: { code, schoolId, year }, ipAddress: clientIp(request) });
  await notify(await schoolUsers(schoolId, ["SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"]), "صدرت لمدرستكم شهادة تقدير", draft.body, { type: "SUCCESS", link: `/verify?code=${code}` });
  return NextResponse.json({ message: "صدرت الشهادة", certificate: { id, code, title: draft.title, body: draft.body, details: draft.details, year } }, { status: 201 });
}

/** DELETE ?id= — إلغاء شهادة (تبقى مسجّلة، ويظهر إلغاؤها عند التحقق). */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصادق", 401);
  if (session.roleKey !== "SUPER_ADMIN") return bad("الإلغاء لمدير النظام", 403);
  const id = request.nextUrl.searchParams.get("id") ?? "";
  await exec("UPDATE certificates SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [nowISO(), id]);
  await auditLog({ userId: session.userId, action: "CERTIFICATE_REVOKED", entityType: "Certificate", entityId: id, ipAddress: clientIp(request) });
  return NextResponse.json({ message: "أُلغيت الشهادة" });
}
