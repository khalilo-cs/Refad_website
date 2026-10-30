import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: session.userId,
      userId: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      roleKey: session.roleKey,
      schoolId: session.schoolId,
      directorateId: session.directorateId,
      mustChangePassword: !!session.mustChangePassword,
      isActive: session.isActive,
      isLocked: session.isLocked,
      permissions: session.permissions,
    },
  });
}
