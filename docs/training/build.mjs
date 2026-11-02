/**
 * يولّد ملفات الحقيبة التدريبية من فصول Markdown:
 *   - الحقيبة الكاملة PDF وWord، وكتيّب PDF لكل فئة.
 *   - العرض التقديمي يولّده slides.py (python-pptx).
 *
 * المتطلبات: pandoc، وPlaywright مع Chromium.
 * التشغيل من جذر المشروع: node docs/training/build.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const OUT = path.join(DIR, "output");
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "rifad-training-"));
fs.mkdirSync(OUT, { recursive: true });

const all = fs.readdirSync(DIR).filter((f) => /^\d\d[a-z]?-.*\.md$/.test(f)).sort();
const pick = (...prefixes) => prefixes.map((p) => {
  const f = all.find((x) => x.startsWith(p));
  if (!f) throw new Error("فصل غير موجود: " + p);
  return f;
});

const BOOKLETS = [
  {
    file: "الحقيبة-التدريبية-الكاملة",
    kind: "الحقيبة التدريبية الشاملة",
    audience: "للمدرّبين ولجميع فئات المستخدمين",
    desc: "دورة تدريبية كاملة على المنصة: دليل المدرّب وخطة الجلسات، ووحدات تدريبية لكل دور بخطوات دقيقة وصور حقيقية، وتطبيقات عملية، واختبارات واستمارات تقويم، وبطاقات مرجعية سريعة.",
    chapters: all,
    docx: true,
  },
  {
    file: "دليل-المدرب",
    kind: "دليل المدرّب",
    audience: "لرئاسة المنصة والمدرّبين",
    desc: "تحضير الدورة وتجهيز بيئة التدريب، وخطة الجلسات لكل مسار، والاختبارات واستمارات التقويم، ومفتاح الإجابات.",
    chapters: pick("00", "01", "02", "09", "12"),
  },
  {
    file: "دليل-المعلم",
    kind: "دليل المتدرب: المعلم",
    audience: "للمعلمين",
    desc: "الدخول إلى المنصة، ورفع ملفات الإنجاز والشواهد بكل الصيغ ومتابعة مراجعتها، والتواصل والمواد التعليمية.",
    chapters: pick("03", "04", "08", "10a", "11"),
  },
  {
    file: "دليل-مدير-المدرسة-ومديرة-قسم-الجودة",
    kind: "دليل المتدرب: مدير المدرسة ومديرة قسم الجودة",
    audience: "لمدراء المدارس ومديرات قسم الجودة",
    desc: "الاختبار التفاعلي، واستمارة التقييم الذاتي، وخطط التحسين حتى اعتمادها، والإرسال والطباعة، والشواهد، والتواصل وملف المدرسة.",
    chapters: pick("03", "05", "08", "10b", "11"),
  },
  {
    file: "دليل-الإشراف-والمتابعة",
    kind: "دليل المتدرب: الإشراف والمتابعة",
    audience: "للمفتشين والموجّهين التربويين وقسم الجودة",
    desc: "متابعة الجودة والتحسين، والتذكير، والاعتماد والإعادة، ونقاط الضعف الشائعة، والشهادات، والزيارات والتقييم الميداني، والشواهد والتقارير.",
    chapters: pick("03", "06", "08", "10c", "11"),
  },
  {
    file: "دليل-رئاسة-المنصة-ومدير-النظام",
    kind: "دليل المتدرب: رئاسة المنصة ومدير النظام",
    audience: "لرئاسة المنصة ومدراء النظام",
    desc: "مركز التحكم، والمدارس، والحسابات وحذفها وتصديرها وتسليم بيانات دخولها بكل الصيغ، ومحتوى الاستمارة، والصلاحيات، وسجل التدقيق، والنسخ الاحتياطي، إضافة إلى أدوات الإشراف.",
    chapters: pick("03", "06", "07", "08", "10c", "10d", "11"),
  },
];

const today = new Date().toLocaleDateString("ar-YE", { year: "numeric", month: "long", day: "numeric" });
const asset = (p) => pathToFileURL(path.join(ROOT, p)).href;
// pandoc يقرأ المعاملات بترميز اللغة المحلية؛ نفرض UTF-8 حتى لا تتلف النصوص العربية
const PANDOC_ENV = { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };
const FROM = "markdown+pipe_tables+task_lists+implicit_figures+ascii_identifiers";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.error("Playwright غير مثبّت: npm i -D playwright ثم npx playwright install chromium");
  process.exit(1);
}
const browser = await chromium.launch();
const kb = (f) => Math.round(fs.statSync(f).size / 1024);

for (const b of BOOKLETS) {
  const files = b.chapters.map((c) => path.join(DIR, c));
  const html = execFileSync("pandoc", [
    ...files, "--from", FROM, "--to", "html5", "--toc", "--toc-depth=2", "--section-divs",
    "--metadata", `title=${b.kind}`,
    "--template", path.join(DIR, "template.html"),
    "-V", `date=${today}`, "-V", `kind=${b.kind}`, "-V", `audience=${b.audience}`, "-V", `desc=${b.desc}`,
    "-V", `caqae=${asset("public/brand/caqae-mark.png")}`, "-V", `moe=${asset("public/brand/moe-logo.png")}`,
    "-V", `font_regular=${asset("public/fonts/Amiri-Regular.ttf")}`, "-V", `font_bold=${asset("public/fonts/Amiri-Bold.ttf")}`,
  ], { maxBuffer: 64 * 1024 * 1024, env: PANDOC_ENV }).toString()
    // مسارات الصور نسبية إلى مجلد الفصول (images/ أو ../handover/images/)
    .replace(/src="(?!https?:|file:|data:)([^"]+)"/g, (_, p) => `src="${pathToFileURL(path.resolve(DIR, p)).href}"`);
  const htmlFile = path.join(TMP, b.file + ".html");
  fs.writeFileSync(htmlFile, html);

  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const pdf = path.join(OUT, b.file + ".pdf");
  await page.pdf({
    path: pdf, format: "A4", printBackground: true,
    margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true, headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;text-align:center;font-family:sans-serif">
      منصة رفاد — ${b.kind} · صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></div>`,
  });
  await page.close();
  console.log(`PDF  ${path.relative(ROOT, pdf)}  ${kb(pdf)} KB`);

  if (b.docx) {
    const docx = path.join(OUT, b.file + ".docx");
    execFileSync("pandoc", [
      ...files, "--from", FROM, "--to", "docx",
      "--reference-doc", path.join(DIR, "reference.docx"),
      "--toc", "--toc-depth=2", "--resource-path", DIR,
      "--metadata", `title=منصة رفاد — ${b.kind}`,
      "--metadata", "subtitle=للاعتماد المدرسي وضمان جودة التعليم · تحت إشراف وزارة التربية والتعليم",
      "--metadata", `date=${today}`, "--metadata", "toc-title=الفهرس",
      "--metadata", "lang=ar", "--metadata", "dir=rtl",
      "-o", docx,
    ], { env: PANDOC_ENV });
    console.log(`DOCX ${path.relative(ROOT, docx)} ${kb(docx)} KB`);
  }
}

await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
