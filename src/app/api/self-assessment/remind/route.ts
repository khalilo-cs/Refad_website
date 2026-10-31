import { NextRequest, NextResponse } from "next/server";
import { auditLog, getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { notify } from "@/lib/notify";
import { canAccessSchool } from "@/lib/scope";
import { REVIEWER_ROLES, SCHOOL_ROLES } from "@/lib/self-assessment";
import { clientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGES = {
  quiz: { title: "تذكير: أكمل التقييم الذاتي", body: "يرجى إكمال الاختبار التفاعلي للتقييم الذاتي لمدرستكم في منصة رفاد." },
  plans: { title: "تذكير: خطط التحسين", body: "لدى مدرستكم نقاط ضعف بلا خطة أو خطط تجاوزت موعدها. يرجى تحديثها في منصة رفاد." },
  submit: { title: "تذكير: إرسال الاستمارة", body: "استمارة التقييم الذاتي لمدرستكم جاهزة تقريباً. يرجى مراجعتها وإرسالها للإدارة." },
} as const;

/** POST { schoolIds, kind } — تذكير مدير المدرسة ومنسق الجودة بإشعار داخلي، مع بيانات واتساب لكل مدرسة. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  if (!REVIEWER_ROLES.includes(session.roleKey) || session.mustChangePassword) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  if (!rateLimit(`remind:${session.userId}`, 20, 60 * 60_000).ok) return NextResponse.json({ message: "أرسلت تذكيرات كثيرة. حاول لاحقاً." }, { status: 429 });
  const b = await request.json().catch(() => null);
  const kind = (["quiz", "plans", "submit"] as const).find((k) => k === b?.kind) ?? "quiz";
  const ids: string[] = Array.isArray(b?.schoolIds) ? [...new Set<string>(b.schoolIds.filter((x: unknown) => typeof x === "string"))].slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ message: "اختر مدرسة واحدة على الأقل" }, { status: 400 });

  const msg = MESSAGES[kind];
  const marks = SCHOOL_ROLES.map(() => "?").join(",");
  const out: { schoolId: string; name: string; phone: string | null; hasWhatsapp: boolean; notified: number }[] = [];
  for (const id of ids) {
    if (!(await canAccessSchool(session, id))) continue;
    const s = (await query<any>("SELECT id, name, contact_phone, has_whatsapp FROM schools WHERE id = ?", [id]))[0];
    if (!s) continue;
    const users = await query<{ id: string }>(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.school_id = ? AND u.is_active = 1 AND r.key IN (${marks})`,
      [id, ...SCHOOL_ROLES]
    );
    await notify(users.map((u) => u.id), msg.title, msg.body, { type: "WARNING", link: kind === "quiz" ? "/self-assessment/quiz" : "/self-assessment" });
    out.push({ schoolId: id, name: s.name, phone: s.contact_phone, hasWhatsapp: s.has_whatsapp !== 0, notified: users.length });
  }
  await auditLog({ userId: session.userId, action: "SELF_ASSESSMENT_REMIND", entityType: "School", newValues: { kind, count: out.length }, ipAddress: clientIp(request) });
  const withAccounts = out.filter((o) => o.notified > 0).length;
  return NextResponse.json({
    message: `أُرسل التذكير إلى ${withAccounts} مدرسة داخل المنصة${out.length > withAccounts ? `، و${out.length - withAccounts} مدرسة بلا حساب — راسلها عبر واتساب` : ""}`,
    whatsappText: `${msg.title}\n${msg.body}`,
    schools: out,
  });
}
