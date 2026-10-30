/**
 * شهادات التكريم المبنية على البيانات: لا تُصدر إلا بإنجاز مسجَّل ومعتمد (معيار محقَّق أو ضعف عولج واعتُمد)،
 * وتحمل نصاً محدداً بالمعيار والمؤشر والعام، ورمز تحقق عام.
 */
import { randomBytes } from "node:crypto";
import { buildTree, getAssessment } from "./self-assessment";
import { queryOne } from "./db/sqlite";

export type CertificateDraft = {
  eligible: boolean;
  reason?: string;
  title: string;
  body: string;
  details: {
    schoolName: string; schoolCode: string; year: string; percent: number | null;
    achievedCriteria: { code: string; title: string; percent: number | null }[];
    improvements: { code: string; title: string; from: number | null; to: number | null; verifiedAt: string | null }[];
  };
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join("، ")} و${xs[xs.length - 1]}`);

export async function draftCertificate(schoolId: string, year: string): Promise<CertificateDraft> {
  const school = await queryOne<any>("SELECT name, code FROM schools WHERE id = ?", [schoolId]);
  const a = await getAssessment(schoolId, year);
  const base = { schoolName: school?.name ?? "", schoolCode: school?.code ?? "", year, percent: null, achievedCriteria: [], improvements: [] };
  if (!school || !a) return { eligible: false, reason: "لا توجد استمارة تقييم ذاتي لهذا العام", title: "", body: "", details: base };
  if (a.status !== "SUBMITTED") return { eligible: false, reason: "لم تُرسل المدرسة استمارة هذا العام بعد", title: "", body: "", details: base };

  const { criteria, summary } = await buildTree(a.id);
  const achieved = criteria.filter((c) => c.achieved).map((c) => ({ code: c.code, title: c.title, percent: c.percent }));
  const improvements = criteria.flatMap((c) => c.subs.flatMap((s) => s.indicators))
    .filter((i) => i.status === "VERIFIED")
    .map((i) => ({ code: i.code, title: i.title, from: i.baselineScore, to: i.score, verifiedAt: i.verifiedAt }));
  const details = { ...base, percent: summary.percent, achievedCriteria: achieved, improvements };
  if (!achieved.length && !improvements.length) {
    return { eligible: false, reason: "لا يوجد بعد معيار محقَّق بالكامل ولا تحسّن معتمد من الإدارة", title: "", body: "", details };
  }

  const parts: string[] = [];
  if (achieved.length) {
    parts.push(`حققت الجودة في ${achieved.length === 1 ? "المعيار رقم" : "المعايير"} ${list(achieved.map((c) => `(${c.code}) «${c.title}»`))}`);
  }
  if (improvements.length) {
    const sample = improvements.slice(0, 3).map((i) => `${i.code} «${i.title}»`);
    parts.push(
      `وعالجت ${improvements.length === 1 ? "مؤشراً كان نقطة ضعف" : `${improvements.length} مؤشرات كانت نقاط ضعف`} وتحسّن أداؤها باعتماد الإدارة${
        improvements.length === 1 ? `: المؤشر ${sample[0]}` : `، منها: ${list(sample.map((x) => `المؤشر ${x}`))}`
      }`
    );
  }
  const body = `بناءً على نتائج التقييم الذاتي ومتابعة قسم الجودة والاعتماد المدرسي للعام الدراسي \u2066${year}\u2069، ${parts.join("، ")}.`;
  const title = achieved.length ? "شهادة تقدير — تحقيق معايير الجودة" : "شهادة تقدير — التحسين المستمر";
  return { eligible: true, title, body, details };
}

export function certificateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return "CERT-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
