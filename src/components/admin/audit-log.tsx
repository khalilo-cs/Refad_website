"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { History, Search, RefreshCw, ChevronRight, ChevronLeft, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/providers";

type Row = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  DELETE: "حذف",
  LOGIN: "دخول",
  LOGIN_FAILED: "محاولة دخول فاشلة",
  LOGOUT: "خروج",
  PASSWORD_RESET: "إعادة تعيين كلمة مرور",
  ROLE_CREATED: "إنشاء دور",
  ROLE_UPDATED: "تعديل دور",
  ROLE_DELETED: "حذف دور",
  SETTING_UPDATED: "تعديل إعداد",
  SETTING_DELETED: "حذف إعداد",
  RATING_SCALE_CREATED: "إضافة مستوى تقدير",
  RATING_SCALE_UPDATED: "تعديل مستوى تقدير",
  RATING_SCALE_DELETED: "حذف مستوى تقدير",
  BACKUP_DOWNLOADED: "تنزيل نسخة احتياطية",
  EVIDENCE_UPLOADED: "رفع دليل",
  EVIDENCE_REVIEWED: "مراجعة دليل",
  REPORT_STATUS_CHANGED: "تغيير حالة تقرير",
};

const ENTITY_LABEL: Record<string, string> = {
  School: "مدرسة",
  User: "مستخدم",
  Role: "دور",
  Report: "تقرير",
  Evidence: "دليل",
  Visit: "زيارة",
  settings: "إعدادات",
  rating_scale: "مقياس تقدير",
  System: "النظام",
  Evaluation: "تقييم",
  ImprovementPlan: "خطة تحسين",
};
const ENTITY_BY_AR: Record<string, string> = {
  "مدرسة": "School",
  "مستخدم": "User",
  "دور": "Role",
  "تقرير": "Report",
  "دليل": "Evidence",
  "زيارة": "Visit",
  "إعدادات": "settings",
  "مقياس تقدير": "rating_scale",
  "النظام": "System",
  "تقييم": "Evaluation",
  "خطة تحسين": "ImprovementPlan",
};

export default function AuditLog() {
  const { add } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entities, setEntities] = useState<{ entity_type: string; c: number }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (p = page) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (entity) params.set("entity", entity);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const res = await fetch(`/api/admin/audit?${params}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);

        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
        setPages(json.pages ?? 1);
        setEntities(json.filters?.entities ?? []);
      } catch (e: any) {
        add({ type: "error", message: e.message || "تعذّر تحميل السجل" });
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, entity, from, to, page, add]
  );

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, entity]);

  const fmt = (iso: string) => {
    const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ar-YE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pretty = (raw: string | null) => {
    if (!raw) return null;
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-[17px] font-bold text-navy">
            <History className="h-5 w-5 text-turquoise" /> سجل التدقيق
          </h2>
          <p className="mt-1 text-[12px] text-gray-600">
            كل إجراء حسّاس يُسجَّل تلقائياً: من فعله، ومتى، ومن أي عنوان. السجل للقراءة
            فقط ولا يمكن تعديله أو حذفه من الواجهة.
          </p>
        </div>
        <span className="badge badge-neutral shrink-0 text-[10px]">
          {total.toLocaleString("ar-YE")} حدث
        </span>
      </div>

      <div className="card p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  void load(1);
                }
              }}
              placeholder="بحث باسم المستخدم أو المعرّف أو نوع الإجراء…"
              className="input pr-9 text-[12px]"
            />
          </div>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
            className="input text-[12px]"
          >
            <option value="">كل الأنواع</option>
            {entities.map((e) => (
              <option key={e.entity_type} value={e.entity_type}>
                {ENTITY_LABEL[e.entity_type] ?? e.entity_type} ({e.c})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input text-[12px]"
            title="من تاريخ"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input text-[12px]"
            title="إلى تاريخ"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => {
              setPage(1);
              void load(1);
            }}
            className="btn btn-primary btn-sm"
          >
            <Search className="h-3.5 w-3.5" /> تطبيق
          </button>
          <button
            onClick={() => {
              setQ("");
              setEntity("");
              setFrom("");
              setTo("");
              setPage(1);
              setTimeout(() => void load(1), 0);
            }}
            className="btn btn-ghost btn-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" /> مسح
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500">
                <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                <th className="px-3 py-2 text-right font-medium">المستخدم</th>
                <th className="px-3 py-2 text-right font-medium">الإجراء</th>
                <th className="px-3 py-2 text-right font-medium">النوع</th>
                <th className="px-3 py-2 text-right font-medium">العنوان</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    لا توجد أحداث مطابقة.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="border-b border-gray-50 transition hover:bg-gray-50/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10.5px] text-gray-500">
                        {fmt(r.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-navy">{r.user_name ?? "—"}</span>
                        {r.user_email && (
                          <span className="block font-mono text-[9.5px] text-gray-400">
                            {r.user_email}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`badge text-[9.5px] ${
                            r.action.includes("DELETE") || r.action.includes("FAILED")
                              ? "badge-danger"
                              : r.action.includes("CREATE")
                                ? "badge-success"
                                : "badge-neutral"
                          }`}
                        >
                          {ACTION_LABEL[r.action] ?? r.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
                      </td>
                      <td className="px-3 py-2 font-mono text-[9.5px] text-gray-400">
                        {r.entity_id ? r.entity_id.slice(0, 8) : "—"}
                        {r.ip_address && (
                          <span className="mr-1 block text-[9px]" dir="ltr">
                            {r.ip_address}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-left">
                        {(r.old_values || r.new_values) && (
                          <button
                            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                            className="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[9.5px] text-gray-500 hover:bg-gray-50"
                          >
                            تفاصيل
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <td colSpan={6} className="px-3 py-2">
                          <div className="grid gap-2 md:grid-cols-2">
                            {r.old_values && (
                              <div>
                                <p className="mb-1 text-[10px] font-semibold text-danger">
                                  قبل
                                </p>
                                <pre
                                  dir="ltr"
                                  className="max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white p-2 text-[9.5px] text-gray-600"
                                >
                                  {pretty(r.old_values)}
                                </pre>
                              </div>
                            )}
                            {r.new_values && (
                              <div>
                                <p className="mb-1 text-[10px] font-semibold text-success">بعد</p>
                                <pre
                                  dir="ltr"
                                  className="max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white p-2 text-[9.5px] text-gray-600"
                                >
                                  {pretty(r.new_values)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
          <p className="text-[10.5px] text-gray-400">
            صفحة {page} من {pages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-200 p-1 disabled:opacity-40"
              aria-label="السابق"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage(Math.min(pages, page + 1))}
              disabled={page >= pages}
              className="rounded-md border border-gray-200 p-1 disabled:opacity-40"
              aria-label="التالي"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-info/20 bg-info-soft/50 px-3 py-2">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <p className="text-[10.5px] leading-relaxed text-gray-600">
          السجل يُكتب من الخادم داخل كل عملية كتابة ولا يقبل التعديل من أي واجهة. حذف
          السجلات ممكن فقط من مالك قاعدة البيانات مباشرة، وهو إجراء خارج المنصة.
        </p>
      </div>
    </div>
  );
}
