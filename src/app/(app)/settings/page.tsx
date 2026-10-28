"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { Settings2, Save, Lock, AlertTriangle, Settings } from "lucide-react";

type Rating = {
  id: string;
  key: string;
  label_ar: string;
  score: number;
  order_index: number;
  is_active: number;
};

export default function SettingsPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setRatings(d.ratingScale ?? []);
        setCanEdit(!!d.canEdit);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveRating = async (id: string, label_ar: string, score: number) => {
    setSaving(id);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingId: id, label_ar, score }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setSaving(null);
    }
  };

  const maxScore = Math.max(...ratings.map((r) => r.score), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الإعدادات"
        subtitle="مقياس التقدير وسياسات النظام وسجل التدقيق"
        icon={Settings}
      />

      {!canEdit && !loading && (
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 flex items-center gap-2 text-sm text-warning">
          <Lock className="w-4 h-4" />
          العرض فقط — التعديل مقصور على مدير النظام.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="w-4 h-4 text-turquoise" />
          <h2 className="font-heading font-bold text-navy">مقياس التقدير</h2>
        </div>
        <p className="text-xs text-gray-600 mb-4">
          الدرجة العظمى الحالية: <span className="font-bold text-navy">{maxScore}</span> —
          تُستخدم في حساب نسبة تحقق كل معيار فرعي.
        </p>

        <div className="space-y-2">
          {ratings.map((r) => (
            <div
              key={r.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50/40"
            >
              <span className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center font-bold text-sm shrink-0">
                {r.score}
              </span>
              <input
                defaultValue={r.label_ar}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== r.label_ar) saveRating(r.id, e.target.value, r.score);
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm disabled:bg-gray-50 disabled:text-gray-600"
              />
              <input
                type="number"
                min={0}
                defaultValue={r.score}
                disabled={!canEdit}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v !== r.score) saveRating(r.id, r.label_ar, v);
                }}
                className="w-20 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-center disabled:bg-gray-50 disabled:text-gray-600"
              />
              {saving === r.id && <Save className="w-4 h-4 text-turquoise animate-pulse" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-heading font-bold text-navy mb-2">صيغة الحساب المطبَّقة</h2>
        <ul className="text-sm text-gray-700 space-y-1 list-disc pr-5">
          <li>نسبة تحقق المعيار الفرعي = (متوسط درجات المؤشرات المقيَّمة ÷ الدرجة العظمى) × 100</li>
          <li>مساهمة المعيار الفرعي = (نسبة التحقق × وزن المعيار الفرعي) ÷ 100</li>
          <li>الدرجة الكلية = مجموع مساهمات المعايير الفرعية</li>
        </ul>
        <div className="mt-3 flex items-start gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <span>
            المؤشر غير المقيَّم حالة إجرائية منفصلة: لا يُحسب صفراً ولا يُعدّ فشلاً، ويُستبعد من
            المقام. ويُعرض نقص البيانات صراحةً ولا يُخفى.
          </span>
        </div>
      </div>
    </div>
  );
}
