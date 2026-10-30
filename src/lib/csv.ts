/** تصدير CSV آمن: يمنع تفسير الخلايا كصيغ في Excel، ويضيف BOM ليظهر العربي سليماً. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
