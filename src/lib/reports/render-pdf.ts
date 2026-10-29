/**
 * مُصيِّر PDF عربي من اليمين لليسار — يعمل على الخادم.
 * يقرأ محتوى التقرير المثبَّت (ReportContent) ويرسمه بخط أميري مع تشكيل الحروف واتجاه bidi،
 * وجداول متناسقة، ترويسة بشعاري المجلس والوزارة، تذييلاً برقم التقرير ورمز التحقق،
 * ورمز QR للتحقق. التقارير غير المعتمدة تحمل علامة مائية بحالتها.
 * لا يُنشأ أي ختم أو توقيع؛ يُذكر المعتمِد باسمه وتاريخ الاعتماد فقط.
 */
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { shape, wrapLogical } from "./rtl";
import type { Cell, ReportContent, Section } from "./types";

export type PdfMeta = {
  number: string;
  status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  verificationCode: string;
  verifyUrl: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  issuer?: string;
};

/**
 * jsPDF يطبّق افتراضياً معالجة عربية بسيطة (تشكيل + bidi) على كل نص. نحن نشكّل النص ونعيد ترتيبه
 * بأنفسنا بدقة أعلى (arabic-reshaper + bidi-js)، فنُلغي معالجتَي jsPDF حتى لا تُطبَّقا مرتين.
 */
(function disableBuiltInArabicHandling() {
  const API: any = (jsPDF as any).API;
  if (API.__rifadPatched) return;
  let seenPost = false;
  API.events = (API.events as [string, (...a: any[]) => void][]).filter(([name, fn]) => {
    if (name === "preProcessText" && fn === API.processArabic) return false;
    if (name === "postProcessText") {
      // أول معالج بعد النص هو escape للترميز ونُبقيه؛ الأخير هو محرك bidi ونحذفه
      if (!seenPost) { seenPost = true; return true; }
      return false;
    }
    return true;
  });
  API.__rifadPatched = true;
})();

const STATUS_AR: Record<string, string> = { DRAFT: "مسودة", UNDER_REVIEW: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض" };

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CW = PAGE_W - M * 2;
const HEADER_H = 30;
const FOOTER_H = 14;

const NAVY: [number, number, number] = [11, 37, 69];
const GOLD: [number, number, number] = [201, 162, 39];
const GRAY: [number, number, number] = [90, 107, 123];
const LIGHT: [number, number, number] = [244, 246, 248];

let fonts: { regular: string; bold: string } | null = null;
function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), "public", "fonts");
  fonts = {
    regular: fs.readFileSync(path.join(dir, "Amiri-Regular.ttf")).toString("base64"),
    bold: fs.readFileSync(path.join(dir, "Amiri-Bold.ttf")).toString("base64"),
  };
  return fonts;
}
function loadImage(name: string): string | null {
  try {
    return "data:image/png;base64," + fs.readFileSync(path.join(process.cwd(), "public", "brand", name)).toString("base64");
  } catch {
    return null;
  }
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ar-YE", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function renderReportPdf(content: ReportContent, meta: PdfMeta): Promise<Buffer> {
  const f = loadFonts();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("Amiri-Regular.ttf", f.regular);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", f.bold);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
  doc.setProperties({ title: content.title, subject: `${meta.number} — ${meta.verificationCode}`, creator: "منصة رِفاد" });

  const mark = loadImage("caqae-mark.png");
  const moe = loadImage("moe-logo.png");
  const qr = await QRCode.toDataURL(meta.verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });

  let y = 0;
  const RIGHT = PAGE_W - M;

  const setFont = (size: number, bold = false, color: [number, number, number] = NAVY) => {
    doc.setFont("Amiri", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const measure = (visual: string) => doc.getTextWidth(visual);
  const lineH = (size: number) => size * 0.46;

  /** يرسم سطراً منطقياً واحداً محاذياً لليمين (أو المنتصف/اليسار). */
  const drawText = (text: string, x: number, yy: number, align: "right" | "left" | "center" = "right") => {
    doc.text(shape(text), x, yy, { align });
  };

  const header = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, HEADER_H, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, HEADER_H, PAGE_W, 1.2, "F");
    const h = 22;
    if (mark) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(RIGHT - 25, 4, 25, 22, 2, 2, "F");
      doc.addImage(mark, "PNG", RIGHT - 23.5, 5, 22, 20);
    }
    if (moe) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M, 4, 22, 22, 2, 2, "F");
      doc.addImage(moe, "PNG", M + 1.5, 5, 19, 20);
    }
    setFont(17, true, [255, 255, 255]);
    drawText("منصة رِفاد للمتابعة والجودة المدرسية", PAGE_W / 2, 13, "center");
    setFont(9.5, false, [226, 232, 240]);
    drawText(meta.issuer ?? "الجمهورية اليمنية — محافظة الحديدة — مديرية الجراحي", PAGE_W / 2, 19.5, "center");
    drawText("مجلس الاعتماد الأكاديمي وضمان جودة التعليم  ·  وزارة التربية والتعليم", PAGE_W / 2, 24.5, "center");
    void h;
  };

  const newPage = () => {
    doc.addPage();
    header();
    y = HEADER_H + 8;
  };
  const ensure = (h: number) => { if (y + h > PAGE_H - FOOTER_H - 2) newPage(); };

  /* ------------ الصفحة الأولى ------------ */
  header();
  y = HEADER_H + 10;

  setFont(17, true);
  for (const line of wrapLogical(measure, content.title, CW - 60)) { drawText(line, RIGHT, y); y += 7.2; }
  if (content.subtitle) { setFont(10.5, false, GRAY); drawText(content.subtitle, RIGHT, y); y += 6; }

  // حالة التقرير + رمز QR
  const stColor: Record<string, [number, number, number]> = { APPROVED: [15, 123, 79], DRAFT: [90, 107, 123], UNDER_REVIEW: [194, 118, 11], REJECTED: [180, 35, 24] };
  const qrY = HEADER_H + 7;
  doc.addImage(qr, "PNG", M, qrY, 27, 27);
  setFont(7.5, false, GRAY);
  drawText("امسح للتحقق", M + 13.5, qrY + 30.5, "center");
  y = Math.max(y, qrY + 6);
  const stText = STATUS_AR[meta.status] ?? meta.status;
  setFont(11, true, [255, 255, 255]);
  const stW = measure(shape(stText)) + 10;
  doc.setFillColor(...(stColor[meta.status] ?? GRAY));
  doc.roundedRect(RIGHT - stW, y - 3.6, stW, 7, 3.5, 3.5, "F");
  drawText(stText, RIGHT - stW / 2, y + 1.2, "center");
  y += 8;
  if (content.state === "INCOMPLETE") {
    setFont(10, true, [194, 118, 11]);
    drawText("⚠ مسودة غير مكتملة: لم تكتمل بيانات التقييم اللازمة، ولا تُنسب إليها درجة نهائية", RIGHT, y);
    y += 6;
  }
  y = Math.max(y, qrY + 36);

  // البيانات الوصفية
  if (content.meta.length) {
    const long = content.meta.some(([, v]) => v.length > 36);
    const perRow = long ? 1 : 2;
    const colW = CW / perRow;
    const rows = Math.ceil(content.meta.length / perRow);
    const boxH = rows * 8 + 4;
    ensure(boxH);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(M, y, CW, boxH, 2, 2, "F");
    content.meta.forEach(([k, v], i) => {
      const col = i % perRow; // 0 → اليمين
      const row = Math.floor(i / perRow);
      const xr = RIGHT - col * colW - 3;
      const yy = y + 7 + row * 8;
      setFont(9, true, GRAY);
      const kt = `${k}: `;
      drawText(kt, xr, yy);
      const kw = measure(shape(kt));
      setFont(9.5, false);
      const maxW = colW - kw - 6;
      const lines = wrapLogical(measure, v, maxW);
      drawText(lines[0] ?? "", xr - kw, yy);
    });
    y += boxH + 6;
  }

  for (const n of content.notices) {
    setFont(9.5, false, [122, 97, 18]);
    const lines = wrapLogical(measure, n, CW - 8);
    const h = lines.length * lineH(9.5) + 5;
    ensure(h);
    doc.setFillColor(250, 243, 220);
    doc.roundedRect(M, y - 3.5, CW, h, 2, 2, "F");
    lines.forEach((l, i) => drawText(l, RIGHT - 4, y + 0.5 + i * lineH(9.5)));
    y += h + 2;
  }
  if (meta.status === "REJECTED" && meta.rejectionReason) {
    setFont(10, true, [180, 35, 24]);
    drawText(`سبب الرفض: ${meta.rejectionReason}`, RIGHT, y);
    y += 7;
  }

  /* ------------ الأقسام ------------ */
  const sectionTitle = (t: string) => {
    ensure(32);
    y += 3;
    doc.setFillColor(...GOLD);
    doc.rect(RIGHT - 1.4, y - 4.6, 1.4, 6.4, "F");
    setFont(13, true);
    drawText(t, RIGHT - 4, y);
    y += 5;
  };

  const drawTable = (columns: { label: string; width?: number; align?: string }[], rows: Cell[][], emptyText?: string) => {
    const total = columns.reduce((a, c) => a + (c.width ?? 1), 0);
    const widths = columns.map((c) => ((c.width ?? 1) / total) * CW);
    // أول عمود عند اليمين
    const xs: number[] = [];
    let cursor = RIGHT;
    for (const w of widths) { xs.push(cursor); cursor -= w; }
    const PAD = 1.8;
    const FS = 9;
    const drawRow = (cells: string[], opts: { head?: boolean; zebra?: boolean }) => {
      setFont(FS, !!opts.head, opts.head ? [255, 255, 255] : NAVY);
      const wrapped = cells.map((c, i) => wrapLogical(measure, c, widths[i] - PAD * 2));
      const lines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = lines * lineH(FS) + PAD * 2 - 0.5;
      if (y + h > PAGE_H - FOOTER_H - 2) { newPage(); drawHead(); setFont(FS, !!opts.head, opts.head ? [255, 255, 255] : NAVY); }
      if (opts.head) { doc.setFillColor(...NAVY); doc.rect(M, y, CW, h, "F"); }
      else if (opts.zebra) { doc.setFillColor(...LIGHT); doc.rect(M, y, CW, h, "F"); }
      doc.setDrawColor(226, 229, 233);
      doc.setLineWidth(0.15);
      doc.line(M, y + h, RIGHT, y + h);
      wrapped.forEach((ls, i) => {
        const al = (columns[i].align ?? "right") as "right" | "left" | "center";
        const x = al === "right" ? xs[i] - PAD : al === "center" ? xs[i] - widths[i] / 2 : xs[i] - widths[i] + PAD;
        ls.forEach((l, k) => drawText(l, x, y + PAD + 2.2 + k * lineH(FS), al));
      });
      y += h;
    };
    const drawHead = () => drawRow(columns.map((c) => c.label), { head: true });
    ensure(18);
    drawHead();
    if (rows.length === 0) {
      setFont(9.5, false, GRAY);
      y += 5;
      drawText(emptyText ?? "لا توجد بيانات", RIGHT - 2, y);
      y += 4;
      return;
    }
    rows.forEach((r, i) => drawRow(r.map((c) => (c == null ? "—" : String(c))), { zebra: i % 2 === 1 }));
    y += 3;
  };

  const drawSection = (s: Section) => {
    if (s.kind === "stats") {
      if (s.title) sectionTitle(s.title);
      const per = Math.min(s.items.length, 4) || 1;
      const gap = 3;
      const bw = (CW - gap * (per - 1)) / per;
      for (let i = 0; i < s.items.length; i += per) {
        ensure(22);
        s.items.slice(i, i + per).forEach((it, k) => {
          const x = RIGHT - k * (bw + gap);
          doc.setFillColor(...LIGHT);
          doc.roundedRect(x - bw, y, bw, 19, 2, 2, "F");
          doc.setFillColor(...GOLD);
          doc.rect(x - 1.2, y + 2, 1.2, 15, "F");
          setFont(8.5, false, GRAY);
          drawText(it.label, x - 4, y + 5.5);
          setFont(14, true);
          drawText(it.value, x - 4, y + 12.5);
          if (it.hint) { setFont(7.5, false, GRAY); drawText(it.hint, x - 4, y + 16.6); }
        });
        y += 22;
      }
      return;
    }
    if (s.kind === "kv") {
      if (s.title) sectionTitle(s.title);
      drawTable([{ label: "البند", width: 1 }, { label: "القيمة", width: 2 }], s.items.map(([k, v]) => [k, v]));
      return;
    }
    if (s.kind === "table") {
      sectionTitle(s.title);
      drawTable(s.columns, s.rows, s.emptyText);
      if (s.note) { setFont(8.5, false, GRAY); for (const l of wrapLogical(measure, s.note, CW)) { ensure(5); drawText(l, RIGHT, y); y += 4.2; } y += 1; }
      return;
    }
    if (s.kind === "text") {
      sectionTitle(s.title);
      setFont(10);
      for (const l of wrapLogical(measure, s.body || "—", CW - 2)) { ensure(6); drawText(l, RIGHT - 1, y); y += 5; }
      y += 2;
      return;
    }
    if (s.kind === "bullets") {
      sectionTitle(s.title);
      setFont(10);
      if (s.items.length === 0) { setFont(9.5, false, GRAY); drawText(s.emptyText ?? "لا يوجد", RIGHT - 1, y); y += 6; return; }
      for (const it of s.items) {
        const ls = wrapLogical(measure, it, CW - 8);
        ensure(ls.length * 5 + 1);
        setFont(10);
        doc.setFillColor(...GOLD);
        doc.circle(RIGHT - 2, y - 1.2, 0.9, "F");
        ls.forEach((l, i) => drawText(l, RIGHT - 6, y + i * 5));
        y += ls.length * 5 + 0.8;
      }
      y += 1;
    }
  };

  for (const s of content.sections) drawSection(s);

  /* ------------ الاعتماد ------------ */
  ensure(30);
  y += 4;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(M, y, RIGHT, y);
  y += 7;
  setFont(10, true);
  if (meta.status === "APPROVED") {
    drawText(`اعتُمد هذا التقرير إلكترونياً من: ${meta.approvedBy ?? "—"}`, RIGHT, y);
    y += 6;
    setFont(9.5, false, GRAY);
    drawText(`تاريخ الاعتماد: ${meta.approvedAt ? fmtDateTime(meta.approvedAt) : "—"}`, RIGHT, y);
  } else {
    drawText(`حالة التقرير: ${STATUS_AR[meta.status] ?? meta.status} — لم يُعتمد رسمياً بعد`, RIGHT, y);
  }
  y += 6;
  setFont(8.5, false, GRAY);
  for (const l of wrapLogical(measure, "صدر هذا التقرير من منصة رِفاد، وهو مستند إداري داخلي لا يحمل ختماً حكومياً ولا توقيعاً. للتحقق من صحته افتح رابط التحقق أو امسح الرمز المطبوع.", CW)) { drawText(l, RIGHT, y); y += 4.2; }

  /* ------------ التذييل والعلامة المائية لكل صفحة ------------ */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (meta.status !== "APPROVED") {
      doc.saveGraphicsState();
      doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
      setFont(110, true, meta.status === "REJECTED" ? [180, 35, 24] : NAVY);
      doc.text(shape(STATUS_AR[meta.status] ?? ""), PAGE_W / 2, PAGE_H / 2 + 20, { align: "center", angle: 35 });
      doc.restoreGraphicsState();
    }
    doc.setDrawColor(226, 229, 233);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - FOOTER_H, RIGHT, PAGE_H - FOOTER_H);
    setFont(8.5, false, GRAY);
    drawText(`رقم التقرير: ${meta.number}   ·   رمز التحقق: ${meta.verificationCode}`, RIGHT, PAGE_H - FOOTER_H + 5);
    drawText(`صدر: ${fmtDateTime(content.generatedAt)}`, RIGHT, PAGE_H - FOOTER_H + 9.5);
    drawText(`صفحة ${p} من ${pages}`, M, PAGE_H - FOOTER_H + 5, "left");
  }

  return Buffer.from(doc.output("arraybuffer"));
}
