import { initDatabase, getDb } from "../src/lib/db/sqlite";

async function main() {
  const demo = process.argv.includes("--demo");
  await initDatabase({ seed: true, demo, demoPassword: process.env.DEMO_PASSWORD });

  // دمج ملف WAL داخل ملف قاعدة البيانات الرئيسي، حتى لا يضيع
  // ما بُذر عند نسخ dev.db وحدها (نسخ ملف WAL دون checkpoint خطأ شائع).
  try {
    getDb().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* غير حرج */
  }

  console.log("قاعدة البيانات جاهزة.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
