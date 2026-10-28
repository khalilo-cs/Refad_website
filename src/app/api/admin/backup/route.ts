import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { getDb, queryOne } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backup — تنزيل نسخة احتياطية متسقة من قاعدة البيانات.
 *
 * لماذا VACUUM INTO وليس نسخ الملف؟
 * لأن قاعدة البيانات تعمل بوضع WAL؛ نسخ ملف dev.db وحده لا يشمل ما لم
 * يُدمج بعد في الملف الرئيسي، فتُفقد أحدث التغييرات بصمت.
 * VACUUM INTO يكتب نسخة مكتملة ومضغوطة في ملف واحد دون إيقاف الخدمة.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصادق" }, { status: 401 });
  }
  if (!authorize(session, { roles: ["SUPER_ADMIN"] }).allowed) {
    return NextResponse.json(
      { message: "النسخ الاحتياطي مقصور على مدير النظام" },
      { status: 403 }
    );
  }

  const tmp = path.join(os.tmpdir(), `rifad-backup-${Date.now()}.db`);

  try {
    const db = getDb();
    db.prepare("VACUUM INTO ?").run(tmp);

    const buf = fs.readFileSync(tmp);

    const counts = queryOne<{ schools: number; indicators: number; reports: number }>(
      `SELECT (SELECT COUNT(*) FROM schools) AS schools,
              (SELECT COUNT(*) FROM indicators) AS indicators,
              (SELECT COUNT(*) FROM reports) AS reports`
    );

    auditLog({
      userId: session.userId,
      action: "BACKUP_DOWNLOADED",
      entityType: "System",
      entityId: "backup",
      newValues: { bytes: buf.length, ...counts },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="rifad-backup-${stamp}.db"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
        "X-Backup-Schools": String(counts?.schools ?? 0),
        "X-Backup-Indicators": String(counts?.indicators ?? 0),
      },
    });
  } catch {
    return NextResponse.json({ message: "تعذّر إنشاء النسخة الاحتياطية" }, { status: 500 });
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* تجاهل */
    }
  }
}
