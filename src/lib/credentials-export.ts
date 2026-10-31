"use client";

import { downloadCsv } from "./csv";

export type CredentialRow = { school: string; name: string; login: string; password: string; phone: string | null };

const HEADERS = ["المدرسة", "الاسم", "اسم الدخول", "كلمة المرور المؤقتة", "الهاتف"];

export function exportCredentialsCsv(rows: CredentialRow[]) {
  downloadCsv("بيانات-دخول-المدراء.csv", [HEADERS, ...rows.map((c) => [c.school, c.name, c.login, c.password, c.phone ?? ""])]);
}

export function exportCredentialsPdf(rows: CredentialRow[], loginUrl: string) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const trs = rows.map((c) => `<tr><td>${esc(c.school)}</td><td>${esc(c.name)}</td><td dir="ltr" style="font-family:monospace">${esc(c.login)}</td><td dir="ltr" style="font-family:monospace;font-weight:bold">${esc(c.password)}</td><td dir="ltr">${esc(c.phone ?? "—")}</td></tr>`).join("");
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بيانات دخول مدراء المدارس</title>
<style>body{font-family:sans-serif;padding:20px;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#0B2545;color:#fff}tr:nth-child(even){background:#f7f7f7}.warn{color:#b45309;margin-top:16px;font-size:12px}h2{margin-bottom:4px}@media print{body{padding:8px}}</style></head>
<body><h2>منصة رفاد للاعتماد المدرسي وضمان جودة التعليم</h2>
<p>بيانات دخول مدراء المدارس — <bdi dir="ltr">${esc(loginUrl)}</bdi></p>
<table><thead><tr>${HEADERS.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>
<p class="warn">سرّي: سلّم لكل مدير بياناته فقط ثم أتلف هذا المستند. كلمات المرور مؤقتة وتُغيَّر عند أول دخول.</p>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export async function exportCredentialsXlsx(rows: CredentialRow[]) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("بيانات الدخول", { views: [{ rightToLeft: true }] });
  ws.addRow(HEADERS);
  ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } }; });
  for (const r of rows) ws.addRow([r.school, r.name, r.login, r.password, r.phone ?? ""]);
  ws.columns.forEach((c) => { c.width = 22; });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buf as ArrayBuffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "بيانات-دخول-المدراء.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
