import { NextResponse } from "next/server";
import { authorize, getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { parsePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type S = { id: string; name: string; code: string; principal_name: string | null; contact_phone: string | null; latitude: number | null; longitude: number | null; has_account: number };
const brief = (s: S) => ({ id: s.id, name: s.name, code: s.code, principalName: s.principal_name, phone: s.contact_phone });

/** مركز التحكم: ما ينقص بيانات المدارس والحسابات، مع قوائم قصيرة للمعالجة. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) return NextResponse.json({ message: "مقصور على مدير النظام" }, { status: 403 });

  const schools = await query<S>(
    `SELECT s.id, s.name, s.code, s.principal_name, s.contact_phone, s.latitude, s.longitude,
            EXISTS (SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.school_id = s.id AND r.key = 'SCHOOL_PRINCIPAL' AND u.is_active = 1) AS has_account
     FROM schools s WHERE s.status = 'ACTIVE' ORDER BY s.name`
  );
  const noLocation = schools.filter((s) => s.latitude == null || s.longitude == null);
  const noPhone = schools.filter((s) => !s.contact_phone);
  const badPhone = schools.filter((s) => s.contact_phone && !parsePhone(s.contact_phone).valid);
  const noPrincipal = schools.filter((s) => !s.principal_name || !s.principal_name.trim());
  const tempCode = schools.filter((s) => /^TEMP-/i.test(s.code));
  const noAccount = schools.filter((s) => !s.has_account);

  const users = await query<any>(
    `SELECT u.id, u.name, u.username, u.email, u.phone, u.is_active, u.is_locked, u.last_login_at, u.must_change_password, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.created_at`
  );
  const uBrief = (u: any) => ({ id: u.id, name: u.name, login: u.username ?? u.email, role: u.role_name });
  const total = schools.length || 1;
  const pct = (n: number) => Math.round(((schools.length - n) / total) * 100);

  return NextResponse.json({
    totals: { schools: schools.length, users: users.length },
    completeness: {
      location: pct(noLocation.length), phone: pct(noPhone.length + badPhone.length), principal: pct(noPrincipal.length),
      officialCode: pct(tempCode.length), account: pct(noAccount.length),
    },
    schools: {
      noLocation: { count: noLocation.length, items: noLocation.slice(0, 60).map(brief) },
      noPhone: { count: noPhone.length, items: noPhone.slice(0, 60).map(brief) },
      badPhone: { count: badPhone.length, items: badPhone.slice(0, 60).map(brief) },
      noPrincipal: { count: noPrincipal.length, items: noPrincipal.slice(0, 60).map(brief) },
      tempCode: { count: tempCode.length, items: tempCode.slice(0, 60).map(brief) },
      noAccount: { count: noAccount.length, items: noAccount.slice(0, 60).map(brief) },
    },
    users: {
      neverLoggedIn: { count: users.filter((u) => !u.last_login_at && u.is_active).length, items: users.filter((u) => !u.last_login_at && u.is_active).slice(0, 60).map(uBrief) },
      noPhone: { count: users.filter((u) => !u.phone && u.is_active).length, items: users.filter((u) => !u.phone && u.is_active).slice(0, 60).map(uBrief) },
      mustChange: { count: users.filter((u) => u.must_change_password && u.is_active).length, items: users.filter((u) => u.must_change_password && u.is_active).slice(0, 60).map(uBrief) },
      inactive: { count: users.filter((u) => !u.is_active || u.is_locked).length, items: users.filter((u) => !u.is_active || u.is_locked).slice(0, 60).map(uBrief) },
    },
  });
}
