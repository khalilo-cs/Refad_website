"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import Link from "next/link";
import { Calendar, Plus, ClipboardList, Clock, CheckCircle2, CalendarCheck } from "lucide-react";

type Visit = {
  id: string;
  school_name: string;
  inspector_name: string;
  type: string;
  status: string;
  completion: number;
  visit_date: string | null;
  code: string;
};

const TYPE_LABEL: Record<string, string> = {
  PERIODIC: "دورية",
  FOLLOW_UP: "متابعة",
  EXPLORATORY: "استكشافية",
  EMERGENCY: "طارئة",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "مجدولة",
  IN_PROGRESS: "جارية",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export default function VisitsPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/visits?limit=50", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setVisits(json.visits ?? []);
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر تحميل الزيارات" });
    } finally {
      setLoading(false);
    }
  }, [add]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/schools?limit=100&status=ACTIVE", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((d) => setSchools(d.schools ?? []))
      .catch(() => {});
  }, [open]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: fd.get("schoolId"),
          type: fd.get("type"),
          purpose: fd.get("purpose"),
          scheduledAt: fd.get("scheduledAt") || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      add({ type: "success", message: json.message });
      setOpen(false);
      load();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const canCreate = user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user.roleKey);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الزيارات الميدانية"
        subtitle="جدولة زيارات المفتشين ومتابعة نسبة إنجازها"
        icon={CalendarCheck}
        actions={
          canCreate && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-soft transition"
          >
            <Plus className="w-4 h-4" /> زيارة جديدة
          </button>
          )
        }
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="py-3 pr-4 font-medium text-right">المدرسة</th>
              <th className="py-3 pr-4 font-medium text-right">المفتش</th>
              <th className="py-3 pr-4 font-medium text-right">النوع</th>
              <th className="py-3 pr-4 font-medium text-right">التاريخ</th>
              <th className="py-3 pr-4 font-medium text-right">الحالة</th>
              <th className="py-3 pr-4 font-medium text-right">الإنجاز</th>
              <th className="py-3 pr-4 font-medium text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">جارٍ التحميل…</td>
              </tr>
            )}
            {!loading && visits.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">لا توجد زيارات.</td>
              </tr>
            )}
            {visits.map((v) => (
              <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-3 pr-4 font-medium text-navy">{v.school_name}</td>
                <td className="py-3 pr-4 text-gray-600">{v.inspector_name}</td>
                <td className="py-3 pr-4 text-gray-600">{TYPE_LABEL[v.type] ?? v.type}</td>
                <td className="py-3 pr-4 text-gray-600 font-mono text-xs">
                  {v.visit_date ? new Date(v.visit_date).toLocaleDateString("ar-YE") : "—"}
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-navy/5 text-navy">
                    {v.status === "COMPLETED" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Clock className="w-3 h-3" />
                    )}
                    {STATUS_LABEL[v.status] ?? v.status}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-turquoise" style={{ width: `${v.completion}%` }} />
                    </div>
                    <span className="text-xs text-gray-600 font-mono">{v.completion}%</span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Link
                    href="/evaluation"
                    className="inline-flex items-center gap-1 text-turquoise text-xs font-medium hover:underline"
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> تقييم
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-heading text-navy font-bold mb-4">زيارة جديدة</h2>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">المدرسة*</label>
                <select
                  name="schoolId"
                  required
                  className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                >
                  <option value="">اختر المدرسة…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">نوع الزيارة</label>
                <select name="type" className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                  <option value="PERIODIC">دورية</option>
                  <option value="FOLLOW_UP">متابعة</option>
                  <option value="EXPLORATORY">استكشافية</option>
                  <option value="EMERGENCY">طارئة</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">الغرض</label>
                <input
                  name="purpose"
                  className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                  placeholder="تقييم دوري شامل"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">تاريخ الجدولة</label>
                <input
                  type="date"
                  name="scheduledAt"
                  className="w-full pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold disabled:opacity-60"
                >
                  {busy ? "جارٍ الإنشاء…" : "إنشاء الزيارة"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
