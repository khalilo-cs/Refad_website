import { NextResponse } from "next/server";
import { DB_NOT_CONFIGURED_MESSAGE, ensureDatabaseReady, isDbNotConfigured } from "./sqlite";

/**
 * يجهّز قاعدة البيانات قبل نقاط الدخول الأولى (الدخول، التهيئة، الفحص).
 * يعيد null عند الجاهزية، أو ردّاً عربياً واضحاً (503) دون أي تفصيل تقني.
 */
export async function dbReadyOr503(): Promise<NextResponse | null> {
  try {
    await ensureDatabaseReady();
    return null;
  } catch (e) {
    if (isDbNotConfigured(e)) return NextResponse.json({ message: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    console.error("تعذّر تجهيز قاعدة البيانات", e);
    return NextResponse.json({ message: "الخدمة غير متاحة مؤقتاً. أعد المحاولة بعد قليل." }, { status: 503 });
  }
}
