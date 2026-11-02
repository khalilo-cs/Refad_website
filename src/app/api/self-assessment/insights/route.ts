import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";
import { normalizeYear, VIEWER_ROLES, WEAK_MAX_SCORE } from "@/lib/self-assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/self-assessment/insights?year= — نقاط الضعف الشائعة على مستوى النطاق:
 * أكثر المؤشرات ضعفاً، وأكثر الأدلة غياباً، ومتوسط كل معيار — لتوجيه التدريب والدعم الفني.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  if (!VIEWER_ROLES.includes(session.roleKey) || session.mustChangePassword) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const year = normalizeYear(request.nextUrl.searchParams.get("year"));
  const scope = await schoolScope(session, "s");
  const max = (await query<{ m: number }>("SELECT MAX(score) m FROM rating_scale WHERE is_active = 1"))[0]?.m || 3;

  const rows = await query<any>(
    `SELECT ind.id, ind.code, ind.title, ind.evidence, c.code AS criterion_code, c.title AS criterion_title,
            i.score, i.is_weak, i.improvement_status, i.evidence_have, s.id AS school_id
     FROM self_assessment_items i
     JOIN self_assessments a ON a.id = i.assessment_id
     JOIN schools s ON s.id = a.school_id
     JOIN indicators ind ON ind.id = i.indicator_id
     LEFT JOIN criteria c ON c.id = ind.criterion_id
     WHERE a.academic_year = ? AND s.status = 'ACTIVE' AND i.score IS NOT NULL AND ${scope.sql}`,
    [year, ...scope.params]
  );

  type Agg = { id: string; code: string; title: string; criterion: string; rated: number; weak: number; open: number; verified: number; sum: number; missing: Map<string, number> };
  const by = new Map<string, Agg>();
  const crit = new Map<string, { code: string; title: string; sum: number; n: number }>();
  for (const r of rows) {
    let a = by.get(r.id);
    if (!a) { a = { id: r.id, code: r.code, title: r.title, criterion: `${r.criterion_code ?? ""} ${r.criterion_title ?? ""}`.trim(), rated: 0, weak: 0, open: 0, verified: 0, sum: 0, missing: new Map() }; by.set(r.id, a); }
    a.rated++; a.sum += r.score;
    if (r.is_weak || r.score <= WEAK_MAX_SCORE) a.weak++;
    if (r.is_weak && r.improvement_status !== "VERIFIED") a.open++;
    if (r.improvement_status === "VERIFIED") a.verified++;
    if (r.evidence_have != null) {
      let all: string[] = [], have: string[] = [];
      try { all = JSON.parse(r.evidence || "[]"); have = JSON.parse(r.evidence_have || "[]"); } catch { /* تجاهل */ }
      for (const e of all) if (!have.includes(e)) a.missing.set(e, (a.missing.get(e) ?? 0) + 1);
    }
    const ck = r.criterion_code ?? "";
    const c = crit.get(ck) ?? { code: ck, title: r.criterion_title ?? "", sum: 0, n: 0 };
    c.sum += r.score; c.n++; crit.set(ck, c);
  }

  const indicators = [...by.values()]
    .filter((a) => a.weak > 0)
    .sort((x, y) => y.weak - x.weak || x.sum / x.rated - y.sum / y.rated)
    .slice(0, 25)
    .map((a) => ({
      id: a.id, code: a.code, title: a.title, criterion: a.criterion, rated: a.rated, weak: a.weak, open: a.open, verified: a.verified,
      percent: Math.round((a.sum / (a.rated * max)) * 100),
      topMissing: [...a.missing.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, count]) => ({ name, count })),
    }));
  const criteria = [...crit.values()].sort((x, y) => x.code.localeCompare(y.code, "ar", { numeric: true }))
    .map((c) => ({ code: c.code, title: c.title, percent: Math.round((c.sum / (c.n * max)) * 100) }));
  const schools = new Set(rows.map((r) => r.school_id)).size;
  return NextResponse.json({ year, schools, indicators, criteria });
}
