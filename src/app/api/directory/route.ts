import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { query } from "@/lib/db/sqlite";
import { schoolScope } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"];

/** دليل الاتصال: المدارس ضمن نطاق المستخدم مع المدير وجهات الاتصال الإضافية والموقع. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  if (!ROLES.includes(session.roleKey) || session.mustChangePassword) return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  const scope = await schoolScope(session, "s");
  const schools = await query<any>(
    `SELECT s.id, s.name, s.code, s.principal_name, s.contact_phone, s.has_whatsapp, s.latitude, s.longitude, d.name AS directorate_name
     FROM schools s JOIN directorates d ON d.id = s.directorate_id
     WHERE s.status = 'ACTIVE' AND ${scope.sql} ORDER BY s.name`,
    scope.params
  );
  const ids = new Set(schools.map((s) => s.id));
  const contacts = (await query<any>("SELECT school_id, role, name, phone, has_whatsapp FROM school_contacts ORDER BY created_at")).filter((c) => ids.has(c.school_id));
  const by = new Map<string, any[]>();
  for (const c of contacts) by.set(c.school_id, [...(by.get(c.school_id) ?? []), { role: c.role, name: c.name, phone: c.phone, hasWhatsapp: c.has_whatsapp !== 0 }]);
  return NextResponse.json({ schools: schools.map((s) => ({ ...s, extra: by.get(s.id) ?? [] })) });
}
