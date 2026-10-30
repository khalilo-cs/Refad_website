"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Printer, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/providers";
import { credentialsMessage, whatsappHref } from "@/lib/phone";

export type Credentials = { login: string; password: string; mustChange: boolean; generated?: boolean };

/** بطاقة بيانات الدخول: تظهر مرة واحدة بعد الإنشاء أو إعادة التعيين، مع نسخ وطباعة وإرسال واتساب. */
export function CredentialsModal({ name, phone, hasWhatsapp = true, credentials, onClose }: { name: string; phone?: string | null; hasWhatsapp?: boolean; credentials: Credentials | null; onClose: () => void }) {
  const { add } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  if (!credentials) return null;
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = credentialsMessage({ name, loginUrl, login: credentials.login, password: credentials.password, mustChange: credentials.mustChange });
  const wa = hasWhatsapp && phone ? whatsappHref(phone, message) : null;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      add({ type: "error", message: "تعذّر النسخ — انسخ يدوياً" });
    }
  };

  const print = () => {
    const w = window.open("", "_blank", "width=480,height=600");
    if (!w) return add({ type: "error", message: "منع المتصفح نافذة الطباعة" });
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>بيانات الدخول</title><body style="font-family:sans-serif;padding:24px"><h2>منصة إتقان للاعتماد المدرسي</h2><p>${esc(name)}</p><p>رابط الدخول: <bdi dir="ltr">${esc(loginUrl)}</bdi></p><p>اسم الدخول: <b dir="ltr">${esc(credentials.login)}</b></p><p>كلمة المرور المؤقتة: <b dir="ltr" style="font-family:monospace;font-size:18px">${esc(credentials.password)}</b></p>${credentials.mustChange ? "<p>سيُطلب منك تغيير كلمة المرور عند أول دخول.</p>" : ""}<p style="color:#b45309">سلّم هذه الورقة لصاحبها فقط ثم أتلفها.</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Modal open onClose={onClose} title="بيانات دخول المستخدم" description={name} width="sm">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-[12.5px] text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>كلمة المرور تظهر هنا مرة واحدة فقط ولا تُحفظ في أي مكان. انسخها أو أرسلها الآن.</span>
        </div>
        {([["login", "اسم الدخول", credentials.login], ["pw", "كلمة المرور المؤقتة", credentials.password]] as const).map(([k, label, v]) => (
          <div key={k}>
            <label className="label">{label}</label>
            <div className="flex gap-2">
              <input className="input font-mono" dir="ltr" readOnly value={v} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(k, v)} aria-label={`نسخ ${label}`}>
                {copied === k ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy("all", message)}>
            {copied === "all" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />} نسخ الرسالة كاملة
          </button>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm"><MessageCircle className="h-4 w-4" /> إرسال عبر واتساب</a>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={print}><Printer className="h-4 w-4" /> طباعة</button>
          <button type="button" className="btn btn-ghost btn-sm ms-auto" onClick={onClose}>تم</button>
        </div>
      </div>
    </Modal>
  );
}
