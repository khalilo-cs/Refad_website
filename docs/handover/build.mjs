/**
 * يولّد نسختي الدليل الشامل للطباعة من فصول Markdown:
 *   docs/handover/دليل-منصة-رفاد.pdf   (عبر pandoc ثم Chromium)
 *   docs/handover/دليل-منصة-رفاد.docx  (عبر pandoc)
 *
 * المتطلبات: pandoc، وPlaywright مع Chromium.
 * التشغيل من جذر المشروع: node docs/handover/build.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const OUT_PDF = path.join(DIR, "دليل-منصة-رفاد.pdf");
const OUT_DOCX = path.join(DIR, "دليل-منصة-رفاد.docx");
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "rifad-guide-"));

const chapters = fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
const today = new Date().toLocaleDateString("ar-YE", { year: "numeric", month: "long", day: "numeric" });
const asset = (p) => pathToFileURL(path.join(ROOT, p)).href;
// pandoc يقرأ المعاملات بترميز اللغة المحلية؛ نفرض UTF-8 حتى لا تتلف النصوص العربية
const PANDOC_ENV = { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };

// 1) HTML موحّد بفهرس تلقائي
const body = execFileSync("pandoc", [
  ...chapters.map((c) => path.join(DIR, c)),
  "--from", "markdown+pipe_tables+task_lists+implicit_figures+ascii_identifiers",
  "--to", "html5",
  "--toc", "--toc-depth=2",
  "--section-divs",
  "--metadata", "title=دليل منصة رفاد",
  "--template", path.join(DIR, "template.html"),
  "--resource-path", DIR,
  "-V", `date=${today}`,
  "-V", `caqae=${asset("public/brand/caqae-mark.png")}`,
  "-V", `moe=${asset("public/brand/moe-logo.png")}`,
  "-V", `font_regular=${asset("public/fonts/Amiri-Regular.ttf")}`,
  "-V", `font_bold=${asset("public/fonts/Amiri-Bold.ttf")}`,
], { maxBuffer: 64 * 1024 * 1024, env: PANDOC_ENV }).toString();
// الصور مسارات نسبية إلى مجلد الفصول
const html = body.replace(/src="images\//g, `src="${pathToFileURL(path.join(DIR, "images")).href}/`);
const htmlFile = path.join(TMP, "guide.html");
fs.writeFileSync(htmlFile, html);

// 2) PDF عبر Chromium (يدعم العربية واتجاه RTL كاملاً)
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.error("Playwright غير مثبّت: npm i -D playwright ثم npx playwright install chromium");
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: OUT_PDF, format: "A4", printBackground: true,
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;text-align:center;font-family:sans-serif">
    منصة رفاد — تحت إشراف وزارة التربية والتعليم · صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></div>`,
});
await browser.close();

// 3) Word (قابل للتعديل)
execFileSync("pandoc", [
  ...chapters.map((c) => path.join(DIR, c)),
  "--from", "markdown+pipe_tables+task_lists+implicit_figures+ascii_identifiers",
  "--to", "docx",
  "--reference-doc", path.join(DIR, "reference.docx"),
  "--toc", "--toc-depth=2",
  "--resource-path", DIR,
  "--metadata", "title=دليل منصة رفاد للاعتماد المدرسي وضمان جودة التعليم",
  "--metadata", "subtitle=تحت إشراف وزارة التربية والتعليم",
  "--metadata", `date=${today}`,
  "--metadata", "toc-title=الفهرس",
  "--metadata", "lang=ar",
  "--metadata", "dir=rtl",
  "-o", OUT_DOCX,
], { env: PANDOC_ENV });

fs.rmSync(TMP, { recursive: true, force: true });
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(`PDF  ${path.relative(ROOT, OUT_PDF)}  ${kb(OUT_PDF)} KB`);
console.log(`DOCX ${path.relative(ROOT, OUT_DOCX)} ${kb(OUT_DOCX)} KB`);
