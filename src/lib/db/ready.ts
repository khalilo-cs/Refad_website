import { NextResponse } from "next/server";
import { DB_NOT_CONFIGURED_MESSAGE, ensureDatabaseReady, isDbNotConfigured } from "./sqlite";
import { readSecret } from "../auth";

export const SECRET_NOT_CONFIGURED_MESSAGE =
  "إعداد ناقص في الاستضافة: أضف المتغير JWT_SECRET بقيمة عشوائية طولها 64 حرفاً (أحرف وأرقام) في إعدادات البيئة، ثم أعد النشر.";

/** هل مفتاح توقيع الجلسات مضبوط وآمن؟ */
export function secretsConfigured(): boolean {
  try {
    readSecret("JWT_SECRET");
    if (process.env.JWT_REFRESH_SECRET?.trim()) readSecret("JWT_REFRESH_SECRET");
    return true;
  } catch {
    return false;
  }
}

/**
 * يجهّز قاعدة البيانات قبل نقاط الدخول الأولى (الدخول، التهيئة، الفحص).
 * يعيد null عند الجاهزية، أو ردّاً عربياً واضحاً (503) دون أي تفصيل تقني.
 */
export async function dbReadyOr503(): Promise<NextResponse | null> {
  if (!secretsConfigured()) return NextResponse.json({ message: SECRET_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  try {
    await ensureDatabaseReady();
    return null;
  } catch (e) {
    if (isDbNotConfigured(e)) return NextResponse.json({ message: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    console.error("تعذّر تجهيز قاعدة البيانات", e);
    return NextResponse.json({ message: "الخدمة غير متاحة مؤقتاً. أعد المحاولة بعد قليل." }, { status: 503 });
  }
}
