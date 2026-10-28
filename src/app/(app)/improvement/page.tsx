"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Trash2,
  CalendarDays,
  User as UserIcon,
  X,
  ClipboardList,
  TrendingUp,
  PauseCircle,
} from "lucide-react";
import { useSession, useToast } from "@/components/providers";
import { PageHeader, StatCard, EmptyState, Alert } from "@/components/ui";

type Action = {
  id: string;
  plan_id: string;
  problem_description: string;
  root_cause: string | null;
  priority: string;
  proposed_action: string;
  due_date: string;
  resources: string | null;
  success_indicator: string | null;
  status: string;
  verification_notes: string | null;
  responsible_name: string | null;
  indicator_code: string | null;
  indicator_title: string | null;
};

type Plan = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  school_id: string;
  school_name: string;
  created_by_name: string | null;
  actions_count: number;
  actions_done: number;
  actions_overdue: number;
  actions: Action[];
};

const PRIORITY: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: "حرجة", cls: "badge-danger" },
  HIGH: { label: "عالية", cls: "badge-warning" },
  MEDIUM: { label: "متوسطة", cls: "badge-info" },
  LOW: { label: "منخفضة", cls: "badge-neutral" },
};

const ACTION_STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  NEW: { label: "جديد", cls: "badge-neutral", icon: Clock },
  IN_PROGRESS: { label: "قيد التنفيذ", cls: "badge-info", icon: TrendingUp },
  COMPLETED: { label: "منفَّذ", cls: "badge-gold", icon: CheckCircle2 },
  CLOSED_VERIFIED: { label: "منفَّذ ومتحقَّق", cls: "badge-success", icon: CheckCircle2 },
  CLOSED_REJECTED: { label: "إنجاز مرفوض", cls: "badge-danger", icon: AlertTriangle },
};

const PLAN_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "نشطة", cls: "badge-info" },
  COMPLETED: { label: "مكتملة", cls: "badge-success" },
  ON_HOLD: { label: "معلّقة", cls: "badge-warning" },
  CANCELLED: { label: "ملغاة", cls: "badge-neutral" },
};

export default function ImprovementPage() {
  const { user } = useSession();
  const { add } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openPlan, setOpenPlan] = useState(false);
  const [actionFor, setActionFor] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);

  const canCreate = [
    "SUPER_ADMIN",
    "EDUCATION_DIRECTOR",
    "INSPECTOR",
    "SCHOOL_PRINCIPAL",
    "QUALITY_COORDINATOR",
  ].includes(user?.roleKey ?? "");
  const canVerify = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(
    user?.roleKey ?? ""
  );
  const canDelete = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "SCHOOL_PRINCIPAL"].includes(
    user?.roleKey ?? ""
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/improvement", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "تعذّر التحميل");
      setPlans(json.plans ?? []);
      setTotals(json.totals ?? {});
    } catch (e: any) {
      setError(e?.message ?? "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/schools?limit=100", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((d) => setSchools(d.schools ?? []))
      .catch(() => {});
  }, []);

  const createPlan = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setBusy(true);
    try {
      const res = await fetch("/api/improvement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "plan",
          title: fd.get("title"),
          description: fd.get("description"),
          schoolId: fd.get("schoolId"),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        add({ type: "error", message: json.message || "تعذّر الإنشاء" });
        return;
      }
      add({ type: "success", message: "تم إنشاء خطة التحسين" });
      setOpenPlan(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const createAction = async (form: HTMLFormElement) => {
    if (!actionFor) return;
    const fd = new FormData(form);
    setBusy(true);
    try {
      const res = await fetch("/api/improvement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "action",
          planId: actionFor.id,
          problemDescription: fd.get("problemDescription"),
          rootCause: fd.get("rootCause"),
          proposedAction: fd.get("proposedAction"),
          dueDate: fd.get("dueDate"),
          priority: fd.get("priority"),
          resources: fd.get("resources"),
          successIndicator: fd.get("successIndicator"),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        add({ type: "error", message: json.message || "تعذّرت الإضافة" });
        return;
      }
      add({ type: "success", message: "تمت إضافة الإجراء" });
      setActionFor(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setActionStatus = async (action: Action, status: string) => {
    let notes = "";
    if (status === "CLOSED_REJECTED") {
      notes = prompt("سبب عدم قبول الإنجاز (5 أحرف على الأقل):") ?? "";
      if (notes.trim().length < 5) return;
    }
    const res = await fetch("/api/improvement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ actionId: action.id, status, notes }),
    });
    const json = await res.json();
    if (!res.ok) {
      add({ type: "error", message: json.message || "تعذّر التحديث" });
      return;
    }
    add({ type: "success", message: json.message });
    await load();
  };

  const setPlanStatus = async (plan: Plan, status: string) => {
    const res = await fetch("/api/improvement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ planId: plan.id, status }),
    });
    const json = await res.json();
    if (!res.ok) {
      add({ type: "error", message: json.message || "تعذّر التحديث" });
      return;
    }
    add({ type: "success", message: json.message });
    await load();
  };

  const removePlan = async (plan: Plan) => {
    if (!confirm(`حذف خطة «${plan.title}» وكل إجراءاتها؟`)) return;
    const res = await fetch(`/api/improvement?planId=${plan.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok) {
      add({ type: "error", message: json.message || "تعذّر الحذف" });
      return;
    }
    add({ type: "success", message: "تم الحذف" });
    await load();
  };

  const completion = totals.total
    ? Math.round(((totals.done ?? 0) / totals.total) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={RefreshCw}
        title="خطط التحسين والإجراءات التصحيحية"
        subtitle="حوّل كل مؤشر ضعيف إلى إجراء تصحيحي محدد بمسؤول وموعد ومؤشر نجاح، وتابع تنفيذه حتى التحقق."
        actions={
          canCreate ? (
            <button onClick={() => setOpenPlan(true)} className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> خطة تحسين جديدة
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="خطط التحسين" value={plans.length} icon={ClipboardList} tone="navy" />
        <StatCard label="إجراءات تصحيحية" value={totals.total ?? 0} icon={Target} tone="teal" delay={60} />
        <StatCard
          label="إجراءات متأخرة"
          value={totals.overdue ?? 0}
          icon={AlertTriangle}
          tone="rose"
          delay={120}
        />
        <StatCard
          label="نسبة الإنجاز"
          value={`${completion}%`}
          icon={CheckCircle2}
          tone="emerald"
          delay={180}
        />
      </div>

      {error && (
        <Alert tone="danger" title="تعذّر التحميل">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={RefreshCw}
            title="لا توجد خطط تحسين"
            description="ابدأ بإنشاء خطة لمدرسة، ثم أضف الإجراءات التصحيحية المبنية على نتائج التقييم."
            action={
              canCreate ? (
                <button onClick={() => setOpenPlan(true)} className="btn btn-primary btn-sm">
                  <Plus className="h-3.5 w-3.5" /> إنشاء خطة
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isOpen = !!open[plan.id];
            const pct = plan.actions_count
              ? Math.round((plan.actions_done / plan.actions_count) * 100)
              : 0;
            const ps = PLAN_STATUS[plan.status] ?? PLAN_STATUS.ACTIVE;

            return (
              <div key={plan.id} className="card overflow-hidden">
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [plan.id]: !o[plan.id] }))}
                    className="shrink-0 self-start rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
                    aria-label={isOpen ? "طيّ" : "توسيع"}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-[15.5px] font-bold text-navy">
                        {plan.title}
                      </h3>
                      <span className={`badge ${ps.cls}`}>{ps.label}</span>
                      {plan.actions_overdue > 0 && (
                        <span className="badge badge-danger gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {plan.actions_overdue} متأخر
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-gray-500">{plan.school_name}</p>
                    {plan.description && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-gray-600">
                        {plan.description}
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="progress max-w-[220px] flex-1">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 font-mono text-[10.5px] text-gray-400">
                        {plan.actions_done}/{plan.actions_count} — {pct}%
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-start">
                    {canCreate && (
                      <button
                        onClick={() => setActionFor(plan)}
                        className="btn btn-ghost btn-sm"
                        title="إضافة إجراء تصحيحي"
                      >
                        <Plus className="h-3.5 w-3.5" /> إجراء
                      </button>
                    )}
                    {canCreate && plan.status === "ACTIVE" && (
                      <button
                        onClick={() => setPlanStatus(plan, "COMPLETED")}
                        className="rounded-md p-1.5 text-gray-400 transition hover:bg-success-soft hover:text-success"
                        title="إغلاق الخطة كمكتملة"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    {canCreate && plan.status === "ACTIVE" && (
                      <button
                        onClick={() => setPlanStatus(plan, "ON_HOLD")}
                        className="rounded-md p-1.5 text-gray-400 transition hover:bg-warning-soft hover:text-warning"
                        title="تعليق الخطة"
                      >
                        <PauseCircle className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => removePlan(plan)}
                        className="rounded-md p-1.5 text-gray-300 transition hover:bg-danger-soft hover:text-danger"
                        title="حذف الخطة"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {plan.actions.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <p className="text-[12px] text-gray-400">
                          لا توجد إجراءات تصحيحية في هذه الخطة بعد.
                        </p>
                        {canCreate && (
                          <button
                            onClick={() => setActionFor(plan)}
                            className="btn btn-ghost btn-sm mt-2"
                          >
                            <Plus className="h-3.5 w-3.5" /> إضافة أول إجراء
                          </button>
                        )}
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {plan.actions.map((a) => {
                          const as = ACTION_STATUS[a.status] ?? ACTION_STATUS.NEW;
                          const pr = PRIORITY[a.priority] ?? PRIORITY.MEDIUM;
                          const overdue =
                            !["COMPLETED", "CLOSED_VERIFIED", "CLOSED_REJECTED"].includes(
                              a.status
                            ) && new Date(a.due_date) < new Date();
                          const AsIcon = as.icon;

                          return (
                            <li key={a.id} className="px-4 py-3">
                              <div className="flex flex-wrap items-start gap-2">
                                <span className={`badge ${pr.cls} shrink-0`}>{pr.label}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[12.5px] font-semibold text-gray-800">
                                    {a.problem_description}
                                  </p>
                                  <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600">
                                    <span className="font-semibold text-turquoise">الإجراء:</span>{" "}
                                    {a.proposed_action}
                                  </p>
                                  {a.root_cause && (
                                    <p className="mt-0.5 text-[11px] text-gray-500">
                                      <span className="font-semibold">السبب الجذري:</span>{" "}
                                      {a.root_cause}
                                    </p>
                                  )}

                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-gray-400">
                                    <span className="inline-flex items-center gap-1">
                                      <CalendarDays className="h-3 w-3" />
                                      <span className={overdue ? "font-semibold text-danger" : ""}>
                                        {a.due_date}
                                        {overdue && " — متأخر"}
                                      </span>
                                    </span>
                                    {a.responsible_name && (
                                      <span className="inline-flex items-center gap-1">
                                        <UserIcon className="h-3 w-3" />
                                        {a.responsible_name}
                                      </span>
                                    )}
                                    {a.indicator_code && (
                                      <span className="font-mono">مؤشر {a.indicator_code}</span>
                                    )}
                                  </div>

                                  {a.success_indicator && (
                                    <p className="mt-1 rounded bg-success-soft/60 px-2 py-1 text-[10.5px] text-success">
                                      <span className="font-semibold">مؤشر النجاح:</span>{" "}
                                      {a.success_indicator}
                                    </p>
                                  )}
                                  {a.verification_notes && (
                                    <p className="mt-1 rounded bg-danger-soft/60 px-2 py-1 text-[10.5px] text-danger">
                                      <span className="font-semibold">ملاحظات التحقق:</span>{" "}
                                      {a.verification_notes}
                                    </p>
                                  )}
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                  <span className={`badge ${as.cls} gap-1`}>
                                    <AsIcon className="h-2.5 w-2.5" />
                                    {as.label}
                                  </span>
                                </div>
                              </div>

                              {canVerify && (
                                <div className="mt-2 flex flex-wrap gap-1.5 pr-1">
                                  {a.status !== "IN_PROGRESS" && (
                                    <button
                                      onClick={() => setActionStatus(a, "IN_PROGRESS")}
                                      className="rounded-md border border-gray-200 px-2 py-0.5 text-[10.5px] text-gray-600 transition hover:border-info/40 hover:bg-info-soft hover:text-info"
                                    >
                                      بدء التنفيذ
                                    </button>
                                  )}
                                  {a.status !== "COMPLETED" && (
                                    <button
                                      onClick={() => setActionStatus(a, "COMPLETED")}
                                      className="rounded-md border border-gray-200 px-2 py-0.5 text-[10.5px] text-gray-600 transition hover:border-gold/40 hover:bg-gold-soft hover:text-gold"
                                    >
                                      تسجيل التنفيذ
                                    </button>
                                  )}
                                  {a.status === "COMPLETED" && (
                                    <>
                                      <button
                                        onClick={() => setActionStatus(a, "CLOSED_VERIFIED")}
                                        className="rounded-md border border-success/30 bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success transition hover:brightness-95"
                                      >
                                        التحقق من الإنجاز
                                      </button>
                                      <button
                                        onClick={() => setActionStatus(a, "CLOSED_REJECTED")}
                                        className="rounded-md border border-danger/30 bg-danger-soft px-2 py-0.5 text-[10.5px] font-semibold text-danger transition hover:brightness-95"
                                      >
                                        رفض الإنجاز
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== نافذة خطة جديدة ===== */}
      {openPlan && (
        <Modal title="خطة تحسين جديدة" onClose={() => setOpenPlan(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createPlan(e.currentTarget);
            }}
            className="space-y-3.5"
          >
            <div>
              <label className="label">المدرسة *</label>
              <select name="schoolId" required className="input">
                <option value="">— اختر المدرسة —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">عنوان الخطة *</label>
              <input name="title" required minLength={3} className="input" placeholder="خطة تحسين الأداء المدرسي 2026" />
            </div>
            <div>
              <label className="label">الوصف</label>
              <textarea name="description" rows={3} className="input resize-y" placeholder="نطاق الخطة وأهدافها العامة" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpenPlan(false)} className="btn btn-ghost btn-sm" disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                {busy ? "جارٍ الإنشاء…" : "إنشاء"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===== نافذة إجراء جديد ===== */}
      {actionFor && (
        <Modal title={`إجراء تصحيحي — ${actionFor.title}`} onClose={() => setActionFor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createAction(e.currentTarget);
            }}
            className="space-y-3.5"
          >
            <div>
              <label className="label">وصف المشكلة *</label>
              <textarea name="problemDescription" required rows={2} minLength={5} className="input resize-y" placeholder="ما المشكلة المحددة المرصودة؟" />
            </div>
            <div>
              <label className="label">السبب الجذري</label>
              <textarea name="rootCause" rows={2} className="input resize-y" placeholder="لماذا حدثت المشكلة؟" />
            </div>
            <div>
              <label className="label">الإجراء المقترح *</label>
              <textarea name="proposedAction" required rows={2} minLength={5} className="input resize-y" placeholder="ما الخطوة الملموسة للتصحيح؟" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">الأولوية *</label>
                <select name="priority" defaultValue="MEDIUM" className="input">
                  <option value="CRITICAL">حرجة</option>
                  <option value="HIGH">عالية</option>
                  <option value="MEDIUM">متوسطة</option>
                  <option value="LOW">منخفضة</option>
                </select>
              </div>
              <div>
                <label className="label">تاريخ التنفيذ *</label>
                <input name="dueDate" type="date" required className="input" dir="ltr" />
              </div>
            </div>
            <div>
              <label className="label">مؤشر النجاح</label>
              <input name="successIndicator" className="input" placeholder="كيف نعرف أن الإجراء نجح؟" />
            </div>
            <div>
              <label className="label">الموارد المطلوبة</label>
              <input name="resources" className="input" placeholder="ميزانية، كوادر، أدوات…" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setActionFor(null)} className="btn btn-ghost btn-sm" disabled={busy}>
                إلغاء
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                {busy ? "جارٍ الحفظ…" : "إضافة الإجراء"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-deep/50 p-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg animate-fade-up p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-heading text-[16.5px] font-bold text-navy">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
