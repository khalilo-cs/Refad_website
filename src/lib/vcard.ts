/** تصدير جهات الاتصال بصيغة vCard 3.0 لاستيرادها في هاتف المستخدم. */
import { parsePhone } from "./phone";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);

export type VCardEntry = { name: string; org?: string | null; title?: string | null; phone?: string | null; email?: string | null; note?: string | null };

export function toVcf(entries: VCardEntry[]): string {
  const out: string[] = [];
  for (const e of entries) {
    const p = e.phone ? parsePhone(e.phone) : null;
    if (!p?.valid) continue; // لا تُصدَّر الأرقام الخاطئة
    out.push(
      "BEGIN:VCARD", "VERSION:3.0",
      `FN:${esc(e.name)}`, `N:${esc(e.name)};;;;`,
      ...(e.org ? [`ORG:${esc(e.org)}`] : []),
      ...(e.title ? [`TITLE:${esc(e.title)}`] : []),
      `TEL;TYPE=CELL:${p.e164 ?? p.canonical}`,
      ...(e.email && !e.email.endsWith(".invalid") ? [`EMAIL:${esc(e.email)}`] : []),
      ...(e.note ? [`NOTE:${esc(e.note)}`] : []),
      "END:VCARD"
    );
  }
  return out.join("\r\n") + "\r\n";
}

export function downloadVcf(filename: string, entries: VCardEntry[]) {
  const url = URL.createObjectURL(new Blob([toVcf(entries)], { type: "text/vcard;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
