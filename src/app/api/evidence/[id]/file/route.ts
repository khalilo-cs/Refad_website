import { NextRequest, NextResponse } from "next/server";
import { getServerSession, auditLog } from "@/lib/auth";
import { queryOne } from "@/lib/db/sqlite";
import { canAccessSchool, type ScopeUser } from "@/lib/scope";
import { clientIp, safeStoragePath, verifyResourceToken } from "@/lib/security";
import { getObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/evidence/[id]/file[?token=...&v=N&inline=1]
 * تنزيل ملف الدليل من التخزين الخاص. يتطلب جلسة تملك صلاحية على مدرسة الدليل،
 * أو رمزاً موقّعاً مؤقتاً أصدره مستخدم مخوّل. لا يوجد أي رابط عام دائم.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const row = await queryOne<any>("SELECT * FROM evidence WHERE id = ?", [id]);
  if (!row) return NextResponse.json({ message: "الدليل غير موجود" }, { status: 404 });

  let userId: string | null = null;
  const token = sp.get("token");
  if (token) {
    const v = verifyResourceToken(token, `evidence:${id}`);
    if (!v.ok) return NextResponse.json({ message: "الرابط منتهي أو غير صالح" }, { status: 403 });
    userId = v.userId;
  } else {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ message: "غير مصدق" }, { status: 401 });
    const su: ScopeUser = session;
    if (!await canAccessSchool(su, row.school_id)) return NextResponse.json({ message: "لا تملك صلاحية الوصول إلى هذا الملف" }, { status: 403 });
    // المواد التعليمية المشتركة متاحة لمعلمي المدرسة وأولياء أمورها؛ غيرها لصاحبها فقط (المعلم) أو مرفوض (ولي الأمر)
    const sharedMat = await queryOne<{ audience: string }>("SELECT audience FROM shared_materials WHERE evidence_id = ?", [id]);
    if (session.roleKey === "TEACHER" && row.uploaded_by_id !== session.userId && !sharedMat)
      return NextResponse.json({ message: "لا تملك صلاحية الوصول إلى هذا الملف" }, { status: 403 });
    if (session.roleKey === "PARENT" && !sharedMat)
      return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
    userId = session.userId;
  }
  if (!row.can_download && !sp.get("inline")) {
    return NextResponse.json({ message: "التنزيل غير مسموح لهذا الملف" }, { status: 403 });
  }

  // نسخة محددة من سجل النسخ
  let storageKey: string = row.storage_key;
  let mime: string = row.mime_type;
  let original: string = row.original_name;
  const ver = Number(sp.get("v") ?? 0);
  if (ver && ver !== row.version) {
    const old = await queryOne<any>("SELECT * FROM evidence_versions WHERE evidence_id = ? AND version = ?", [id, ver]);
    if (!old) return NextResponse.json({ message: "النسخة غير موجودة" }, { status: 404 });
    storageKey = old.storage_key; mime = old.mime_type; original = old.original_name;
  }

  if (!safeStoragePath(storageKey)) return NextResponse.json({ message: "مسار غير صالح" }, { status: 400 });
  const data = await getObject(storageKey);
  if (!data) return NextResponse.json({ message: "الملف غير متوفر في التخزين" }, { status: 404 });

  await auditLog({ userId, action: "EVIDENCE_DOWNLOAD", entityType: "evidence", entityId: id, ipAddress: clientIp(request) });

  // العرض داخل الصفحة مسموح لـ PDF والصور فقط؛ ما عداها يُنزَّل دائماً
  const inlineOk = sp.get("inline") === "1" && (mime === "application/pdf" || mime.startsWith("image/"));
  const encoded = encodeURIComponent(original);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inlineOk ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
