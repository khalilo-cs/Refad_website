import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { resolveMapsLink } from "@/lib/geo-resolve";
import { rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

/** POST /api/geo/resolve { input } — يحوّل رابط خرائط (ولو مختصراً) أو إحداثيات نصية إلى إحداثيات. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return bad("غير مصدق", 401);
  if (!["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(session.roleKey)) return bad("غير مصرح", 403);
  if (!rateLimit(`geo:${session.userId}`, 30, 60_000).ok) return bad("محاولات كثيرة. حاول بعد قليل.", 429);

  const body = await request.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim().slice(0, 2000) : "";
  if (!input) return bad("الصق رابط الخرائط أو الإحداثيات");

  const r = await resolveMapsLink(input);
  if (r.ok) return NextResponse.json({ lat: r.location.lat, lng: r.location.lng, swapped: r.location.swapped, inYemen: r.location.inYemen });
  if (r.reason === "not_allowed") return bad("أدخل إحداثيات مثل «14.80, 43.00» أو رابطاً من خرائط جوجل (maps.app.goo.gl أو google.com/maps)", 422);
  if (r.reason === "network") return bad("تعذّر الوصول إلى الرابط الآن. الصق الإحداثيات مباشرة أو أعد المحاولة.", 502);
  return bad("لم نجد إحداثيات في هذا الرابط. افتحه في خرائط جوجل، اضغط مطولاً على موقع المدرسة، وانسخ الإحداثيات التي تظهر في الأعلى.", 422);
}
