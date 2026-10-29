import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getServerSession, authorize, auditLog } from "@/lib/auth";
import { queryOne, exec, isRemoteDb, dumpToSql } from "@/lib/db/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backup — تنزيل نسخة احتياطية متسقة من قاعدة البيانات.
 *
 * لماذا VACUUM INTO وليس نسخ الملف؟
 * لأن قاعدة البيانات تعمل بوضع WAL؛ نسخ ملف dev.db وحده لا يشمل ما لم
 * يُدمج بعد في الملف الرئيسي، فتُفقد أحدث التغييرات بصمت.
 * VACUUM INTO يكتب نسخة مكتملة ومضغوطة في ملف واحد دون إيقاف الخدمة.
 * على قاعدة libSQL/Turso تُصدَّر النسخة بصيغة SQL قابلة للاستعادة.
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

  const stamp = new Date().toISOString().slice(0, 10);
  if (isRemoteDb()) {
    try {
      const sql = await dumpToSql();
      await auditLog({ userId: session.userId, action: "BACKUP_DOWNLOADED", entityType: "System", entityId: "backup", newValues: { bytes: sql.length, format: "sql" } });
      return new NextResponse(sql, {
        headers: {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="itqan-backup-${stamp}.sql"`,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return NextResponse.json({ message: "تعذّر إنشاء النسخة الاحتياطية" }, { status: 500 });
    }
  }

  const tmp = path.join(os.tmpdir(), `itqan-backup-${Date.now()}.db`);

  try {
    await exec("VACUUM INTO ?", [tmp]);

    const buf = fs.readFileSync(tmp);

    const counts = await queryOne<{ schools: number; indicators: number; reports: number }>(
      `SELECT (SELECT COUNT(*) FROM schools) AS schools,
              (SELECT COUNT(*) FROM indicators) AS indicators,
              (SELECT COUNT(*) FROM reports) AS reports`
    );

    await auditLog({
      userId: session.userId,
      action: "BACKUP_DOWNLOADED",
      entityType: "System",
      entityId: "backup",
      newValues: { bytes: buf.length, ...counts },
    });

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="itqan-backup-${stamp}.db"`,
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
