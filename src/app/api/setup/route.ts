import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, auditLog } from "@/lib/auth";
import { queryOne, exec, getDb, uuid, nowISO } from "@/lib/db/sqlite";
import { getServerSession } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2, "الاسم الكامل مطلوب"),
  email: z.string().email("بريد إلكتروني صالح"),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
});

export const runtime = "nodejs";

export async function GET() {
  const exists = queryOne("SELECT COUNT(*) n FROM users");
  const session = await getServerSession();
  return NextResponse.json({
    initialized: (exists as { n: number }).n > 0,
    authenticated: !!session,
  });
}

export async function POST(request: Request) {
  const exists = queryOne("SELECT COUNT(*) n FROM users");
  if ((exists as { n: number }).n > 0) {
    const session = await getServerSession();
    if (!session?.permissions.all) {
      return NextResponse.json({ message: "النظام مهيأ مسبقًا" }, { status: 403 });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "بيانات غير صالحة" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات غير صالحة" }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const existsEmail = queryOne("SELECT id FROM users WHERE email = ?", [email]);
  if (existsEmail) {
    return NextResponse.json({ message: "البريد الإلكتروني مستخدم مسبقًا" }, { status: 409 });
  }

  const role = queryOne<{ id: string }>("SELECT id FROM roles WHERE key = ?", ["SUPER_ADMIN"]);
  if (!role) {
    return NextResponse.json({ message: "الأدوار النظامية غير موجودة، يُرجى تشغيل بذر البيانات أولاً" }, { status: 500 });
  }

  const passwordHash = await hashPassword(password);
  const userId = uuid();
  const db = getDb();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role_id, is_active, token_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`
  ).run(userId, name, email, passwordHash, role.id, nowISO(), nowISO());

  auditLog({
    userId,
    action: "CREATE",
    entityType: "User",
    entityId: userId,
    newValues: { name, email, role: "SUPER_ADMIN" },
    ipAddress: (request as unknown as { headers: { get: (k: string) => string | null } }).headers
      .get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: (request as unknown as { headers: { get: (k: string) => string | null } }).headers
      .get("user-agent") ?? null,
  });

  return NextResponse.json({
    message: "تم إنشاء حساب المسؤول الأول بنجاح. يرجى تسجيل الدخول",
    user: { id: userId, name, email, role: "SUPER_ADMIN" },
  });
}
