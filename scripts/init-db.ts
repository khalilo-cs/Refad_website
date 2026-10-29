import { initDatabase, checkpointLocal, closeDb } from "../src/lib/db/sqlite";

async function main() {
  const demo = process.argv.includes("--demo");
  await initDatabase({ seed: true, demo, demoPassword: process.env.DEMO_PASSWORD });
  // دمج ملف WAL في الملف الرئيسي حتى لا يضيع ما بُذر عند نسخ الملف وحده.
  await checkpointLocal();
  await closeDb();
  console.log("قاعدة البيانات جاهزة.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
