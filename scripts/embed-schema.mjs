

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "prisma", "schema.sql");
const target = resolve(root, "src", "lib", "db", "schema.generated.ts");

const sql = readFileSync(source, "utf8");
const escaped = sql.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const content = `/* هذا الملف ناتج تلقائياً من prisma/schema.sql — لا تُحرّره يدوياً.
   لإعادة التوليد: npm run db:embed-schema */

export const SCHEMA_SQL = \`${escaped}\`;
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, content, "utf8");
console.log(`تم تضمين المخطط (${sql.length} حرفاً) في ${target}`);
