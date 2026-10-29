import ExcelJS from "exceljs";
import type { ReportContent } from "./types";

const csvEsc = (v: unknown) => {
  let t = v == null ? "" : String(v);
  // حماية من حقن الصيغ عند فتح الملف في Excel
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};

/** CSV بترميز UTF-8 مع BOM ليفتح بالعربية في Excel. */
export function contentToCsv(c: ReportContent, extra: [string, string][] = []): string {
  const lines: string[] = [];
  lines.push(csvEsc(c.title));
  if (c.subtitle) lines.push(csvEsc(c.subtitle));
  for (const [k, v] of [...extra, ...c.meta]) lines.push([csvEsc(k), csvEsc(v)].join(","));
  for (const n of c.notices) lines.push(csvEsc("ملاحظة: " + n));
  for (const s of c.sections) {
    lines.push("");
    if ("title" in s && s.title) lines.push(csvEsc(s.title));
    if (s.kind === "stats") for (const i of s.items) lines.push([csvEsc(i.label), csvEsc(i.value)].join(","));
    if (s.kind === "kv") for (const [k, v] of s.items) lines.push([csvEsc(k), csvEsc(v)].join(","));
    if (s.kind === "table") { lines.push(s.columns.map((x) => csvEsc(x.label)).join(",")); for (const r of s.rows) lines.push(r.map(csvEsc).join(",")); if (!s.rows.length && s.emptyText) lines.push(csvEsc(s.emptyText)); }
    if (s.kind === "text") lines.push(csvEsc(s.body));
    if (s.kind === "bullets") { for (const i of s.items) lines.push(csvEsc(i)); if (!s.items.length && s.emptyText) lines.push(csvEsc(s.emptyText)); }
  }
  return "﻿" + lines.join("\r\n");
}

/** Excel: ورقة ملخص وورقة لكل جدول، من اليمين لليسار. */
export async function contentToXlsx(c: ReportContent, extra: [string, string][] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "منصة رِفاد";
  wb.created = new Date();
  const head = (row: ExcelJS.Row) => row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
    cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  });
  const safeCell = (v: unknown) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v);

  const ws = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
  ws.columns = [{ width: 32 }, { width: 70 }];
  const t = ws.addRow([c.title]);
  t.font = { bold: true, size: 14, color: { argb: "FF0B2545" } };
  ws.mergeCells(t.number, 1, t.number, 2);
  if (c.subtitle) ws.addRow([c.subtitle]);
  ws.addRow([]);
  for (const [k, v] of [...extra, ...c.meta]) { const r = ws.addRow([k, safeCell(v)]); r.getCell(1).font = { bold: true }; }
  for (const n of c.notices) ws.addRow(["ملاحظة", n]);
  for (const s of c.sections) {
    if (s.kind === "stats") { ws.addRow([]); for (const i of s.items) ws.addRow([i.label, safeCell(i.value)]); }
    if (s.kind === "text") { ws.addRow([]); ws.addRow([s.title]).font = { bold: true }; ws.addRow(["", s.body]); }
    if (s.kind === "bullets") { ws.addRow([]); ws.addRow([s.title]).font = { bold: true }; for (const i of s.items) ws.addRow(["", safeCell(i)]); }
    if (s.kind === "kv") { ws.addRow([]); for (const [k, v] of s.items) ws.addRow([k, safeCell(v)]); }
  }
  let n = 1;
  for (const s of c.sections) {
    if (s.kind !== "table") continue;
    const name = `${n++}-${s.title}`.replace(/[\\/?*[\]:]/g, " ").slice(0, 30);
    const sh = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    sh.columns = s.columns.map((col) => ({ width: Math.max(12, Math.round((col.width ?? 1) * 14)) }));
    head(sh.addRow(s.columns.map((x) => x.label)));
    for (const r of s.rows) sh.addRow(r.map(safeCell));
    sh.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
