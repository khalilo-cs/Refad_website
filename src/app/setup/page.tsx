"use client";

import { useState } from "react";
import { useToast } from "@/components/providers";
import { useRouter } from "next/navigation";
import { Mail, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function SetupPage() {
  const { add } = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("تأكيد كلمة المرور غير متطابق");
      return;
    }
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "فشل إنشاء الحساب");
        add({ type: "error", message: data.message || "فشل إنشاء الحساب" });
        return;
      }
      add({ type: "success", message: data.message });
      router.push("/login");
      router.refresh();
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-soft px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gold text-navy shadow-lg mb-4">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-3xl font-heading text-navy font-bold">إعداد الحساب الأول</h1>
          <p className="text-gray-600 text-sm mt-2">
            إنشاء حساب مدير المنصة (مسؤولระบบ أول) بطريقة آمنة
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-danger-soft text-danger text-sm border border-danger/20 flex items-start gap-3">
              <Mail className="w-5 h-5 mt-0.5 shrink-0 text-danger" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-navy font-medium text-sm block">الاسم الكامل</label>
              <input
                type="text"
                placeholder="أحمد محمد العسلي"
                className="w-full pr-4 pl-4 py-3 rounded-lg border border-gray-200 bg-gray-50 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none text-gray-800"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-navy font-medium text-sm block">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  placeholder="admin@المديرية.ye"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 bg-gray-50 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none text-gray-800"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-navy font-medium text-sm block">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 bg-gray-50 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none text-gray-800"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-gray-500">8 أحرف على الأقل، تحتوي على رقم وحرف</p>
            </div>

            <div className="space-y-2">
              <label className="text-navy font-medium text-sm block">تأكيد كلمة المرور</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full pr-4 py-3 rounded-lg border border-gray-200 bg-gray-50 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none text-gray-800"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-navy text-white font-semibold hover:bg-navy-soft transition disabled:opacity-70"
            >
              {loading ? "جاري الإنشاء..." : "إنشاء حساب المسؤول الأول"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <Link href="/login" className="text-turquoise font-sm font-medium hover:underline">
              لدي حساب بالفعل — الانتقال لتسجيل الدخول
            </Link>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-6 text-center">
          هذه الخطوة تحدث مرة واحدة فقط عند تشغيل المنصة لأول مرة. لا تُنفذ أي عملية اعتماد قبل إنشاء هذا الحساب.
        </p>
      </div>
    </div>
  );
}
