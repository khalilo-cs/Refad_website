"use client";

import { Construction, ArrowRight } from "lucide-react";
import Link from "next/link";

type Props = {
  title: string;
  description?: string;
};

/**
 * صفحة تُعرض للأقسام التي لم تُنجز بعد، حتى لا تنتهي روابط التنقل إلى خطأ 404.
 * لا تعرض أي بيانات وهمية.
 */
export default function SectionPlaceholder({ title, description }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-heading text-navy font-bold">{title}</h1>
        <p className="text-gray-600 text-sm">
          {description ?? "هذا القسم قيد التطوير وسيُتاح في إصدار قادم."}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-turquoise/10 flex items-center justify-center">
          <Construction className="w-7 h-7 text-turquoise" />
        </div>
        <div className="space-y-1">
          <h2 className="font-heading font-bold text-navy">قيد التطوير</h2>
          <p className="text-sm text-gray-600 max-w-md">
            لم يُنجز هذا القسم بعد، ولم تُعرض فيه أي بيانات. الأقسام الجاهزة هي لوحة
            التحكم وإدارة المدارس.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-soft transition"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى لوحة التحكم
        </Link>
      </div>
    </div>
  );
}
