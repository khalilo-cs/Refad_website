"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Target,
  X,
  Save,
  ListTree,
  RefreshCw,
} from "lucide-react";
import { Alert } from "@/components/ui";
import { useToast } from "@/components/providers";

type Criterion = {
  id: string;
  code: string;
  title: string;
  weight: number;
  order_index: number;
  subCriteria: SubCriterion[];
  directIndicators: Indicator[];
  indicatorsCount: number;
  subWeightSum: number;
  subWeightOk: boolean;
};

type SubCriterion = {
  id: string;
  code: string;
  title: string;
  weight: number;
  criterion_id: string;
  indicators: Indicator[];
};

type Indicator = {
  id: string;
  code: string;
  title: string;
  evidence: string[];
  verification_tools: string[];
  criterion_id: string;
  sub_criterion_id: string | null;
  evaluations_count: number;
};

type Payload = {
  criteria: Criterion[];
  totalWeight: number;
  weightOk: boolean;
  counts: { criteria: number; subCriteria: number; indicators: number };
};

type EditState =
  | { mode: "create"; kind: "criterion" }
  | { mode: "create"; kind: "subCriterion"; criterionId: string }
  | { mode: "create"; kind: "indicator"; criterionId: string; subCriterionId?: string }
  | { mode: "edit"; kind: "criterion"; row: Criterion }
  | { mode: "edit"; kind: "subCriterion"; row: SubCriterion }
  | { mode: "edit"; kind: "indicator"; row: Indicator };

export default function StructureManager() {
  const { add } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: string; id: string; title: string } | null
  >(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/structure", { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "تعذّر تحميل الهيكل");
      }
      const json = await res.json();
      setData(json);
      // افتح المعيار الأول افتراضياً
      setOpen((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const first = json.criteria?.[0];
        return first ? { [first.id]: true } : {};
      });
    } catch (e: any) {
      setError(e?.message ?? "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (form: HTMLFormElement) => {
    if (!edit) return;
    const fd = new FormData(form);
    setBusy(true);
    try {
      const body: any = { kind: edit.kind };
      body.title = fd.get("title");
      if (edit.kind !== "indicator") {
        body.code = fd.get("code");
        body.weight = Number(fd.get("weight") ?? 0);
      } else {
        body.code = fd.get("code");
        body.evidence = String(fd.get("evidence") ?? "");
        body.verificationTools = String(fd.get("verificationTools") ?? "");
        if (edit.mode === "create") {
          body.criterionId = (edit as any).criterionId;
          body.subCriterionId = (edit as any).subCriterionId ?? null;
        } else {
          body.subCriterionId = String(fd.get("subCriterionId") ?? "") || null;
        }
      }

      const isEdit = edit.mode === "edit";
      const url = isEdit
        ? `/api/admin/structure/${(edit as any).row.id}?kind=${edit.kind}`
        : "/api/admin/structure";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        add({ type: "error", message: json.message || "تعذّر الحفظ" });
        return;
      }
      add({ type: "success", message: isEdit ? "تم حفظ التعديل" : "تمت الإضافة" });
      setEdit(null);
      await load();
    } catch {
      add({ type: "error", message: "خطأ في الاتصال بالخادم" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (force = false) => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const url = `/api/admin/structure/${confirmDelete.id}?kind=${confirmDelete.kind}${
        force ? "&force=true" : ""
      }`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        add({ type: "error", message: json.message || "تعذّر الحذف" });
        if (res.status === 409) {
          // أبقِ الحوار مفتوحاً لعرض خيار التأكيد الصريح
          setConfirmDelete({ ...confirmDelete, ...(json.blockers ? { blocked: true } : {}) } as any);
        }
        return;
      }
      add({ type: "success", message: "تم الحذف" });
      setConfirmDelete(null);
      await load();
    } catch {
      add({ type: "error", message: "خطأ في الاتصال بالخادم" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert tone="danger" title="تعذّر التحميل">
        {error}
        <button onClick={load} className="btn btn-ghost btn-sm mt-3">
          <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
        </button>
      </Alert>
    );
  }

  if (!data) return null;

  const q = query.trim();

  return (
    <div className="space-y-4">
      {/* ============ شريط الحالة ============ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/8 text-navy">
            <Layers className="h-5 w-5" />
          </span>
          <div>
            <p className="font-heading text-xl font-bold text-navy">{data.counts.criteria}</p>
            <p className="text-[11px] text-gray-500">معيار رئيسي</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-turquoise-soft text-emerald">
            <ListTree className="h-5 w-5" />
          </span>
          <div>
            <p className="font-heading text-xl font-bold text-navy">{data.counts.subCriteria}</p>
            <p className="text-[11px] text-gray-500">معيار فرعي</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft text-gold">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <p className="font-heading text-xl font-bold text-navy">{data.counts.indicators}</p>
            <p className="text-[11px] text-gray-500">مؤشر</p>
          </div>
        </div>
        <div
          className={`card flex items-center gap-3 p-4 ${
            data.weightOk ? "" : "ring-1 ring-danger/30"
          }`}
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              data.weightOk ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {data.weightOk ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div>
            <p
              className={`font-heading text-xl font-bold ${
                data.weightOk ? "text-success" : "text-danger"
              }`}
            >
              {data.totalWeight}%
            </p>
            <p className="text-[11px] text-gray-500">
              {data.weightOk ? "مجموع الأوزان صحيح" : "المجموع يجب أن يساوي 100%"}
            </p>
          </div>
        </div>
      </div>

      {!data.weightOk && (
        <Alert tone="warning" title="تحقق من الأوزان">
          مجموع أوزان المعايير السبعة الحالي {data.totalWeight}% ويجب أن يساوي 100% حتى تكون
          الدرجة النهائية صحيحة. عدّل أوزان المعايير أدناه.
        </Alert>
      )}

      {/* ============ أدوات ============ */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برمز أو نص المؤشر…"
          className="input max-w-sm"
        />
        <button
          onClick={() => setEdit({ mode: "create", kind: "criterion" })}
          className="btn btn-gold btn-sm"
        >
          <Plus className="h-3.5 w-3.5" /> إضافة معيار
        </button>
      </div>

      {/* ============ الشجرة ============ */}
      <div className="space-y-2.5">
        {data.criteria.map((c) => {
          const isOpen = q ? true : !!open[c.id];
          const matchedSubs = q
            ? c.subCriteria
                .map((s) => ({
                  ...s,
                  indicators: s.indicators.filter(matchesIndicator(q)),
                }))
                .filter((s) => s.indicators.length > 0 || s.code.includes(q) || s.title.includes(q))
            : c.subCriteria;
          const matchedDirect = q
            ? c.directIndicators.filter(matchesIndicator(q))
            : c.directIndicators;
          const criterionMatches = q ? c.code.includes(q) || c.title.includes(q) : true;

          if (q && !criterionMatches && matchedSubs.length === 0 && matchedDirect.length === 0)
            return null;

          return (
            <div key={c.id} className="card overflow-hidden">
              {/* رأس المعيار */}
              <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
                  className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
                  aria-label={isOpen ? "طيّ" : "توسيع"}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>

                <span className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-navy to-navy-soft font-mono text-[11.5px] font-bold text-gold-bright">
                  {c.code}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-[14.5px] font-bold text-navy">
                    {c.title}
                  </p>
                  <p className="text-[10.5px] text-gray-400">
                    {c.indicatorsCount} مؤشراً · {c.subCriteria.length} معياراً فرعياً
                  </p>
                </div>

                <span
                  className={`badge shrink-0 ${
                    c.subWeightOk ? "badge-success" : "badge-danger"
                  }`}
                  title={
                    c.subWeightOk
                      ? "مجموع أوزان المعايير الفرعية يطابق وزن المعيار"
                      : "مجموع أوزان المعايير الفرعية لا يطابق وزن المعيار"
                  }
                >
                  وزن {c.weight}%
                  {!c.subWeightOk && ` (فرعي ${c.subWeightSum}%)`}
                </span>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() =>
                      setEdit({
                        mode: "create",
                        kind: "subCriterion",
                        criterionId: c.id,
                      })
                    }
                    className="rounded-md p-1.5 text-gray-400 transition hover:bg-turquoise-soft hover:text-emerald"
                    title="إضافة معيار فرعي"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEdit({ mode: "edit", kind: "criterion", row: c })}
                    className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
                    title="تعديل"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      setConfirmDelete({ kind: "criterion", id: c.id, title: c.title })
                    }
                    className="rounded-md p-1.5 text-gray-400 transition hover:bg-danger-soft hover:text-danger"
                    title="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* الجسم */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  {matchedSubs.length === 0 && matchedDirect.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-[12px] text-gray-400">
                        لا توجد معايير فرعية أو مؤشرات تحت هذا المعيار بعد.
                      </p>
                      <button
                        onClick={() =>
                          setEdit({ mode: "create", kind: "indicator", criterionId: c.id })
                        }
                        className="btn btn-ghost btn-sm mt-2"
                      >
                        <Plus className="h-3.5 w-3.5" /> إضافة مؤشر مباشر
                      </button>
                    </div>
                  )}

                  {matchedSubs.map((sub) => (
                    <div key={sub.id} className="border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center gap-2 bg-white/60 px-3 py-2 sm:px-4">
                        <span className="w-9 shrink-0 text-center font-mono text-[10.5px] text-gray-400">
                          {sub.code}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-700">
                          {sub.title}
                          <span className="mr-1.5 text-[10px] font-normal text-gray-400">
                            ({sub.indicators.length} مؤشراً)
                          </span>
                        </p>
                        <span className="badge badge-neutral shrink-0">{sub.weight}%</span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            onClick={() =>
                              setEdit({
                                mode: "create",
                                kind: "indicator",
                                criterionId: c.id,
                                subCriterionId: sub.id,
                              })
                            }
                            className="rounded-md p-1 text-gray-400 transition hover:bg-turquoise-soft hover:text-emerald"
                            title="إضافة مؤشر"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() =>
                              setEdit({ mode: "edit", kind: "subCriterion", row: sub })
                            }
                            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
                            title="تعديل"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                kind: "subCriterion",
                                id: sub.id,
                                title: sub.title,
                              })
                            }
                            className="rounded-md p-1 text-gray-400 transition hover:bg-danger-soft hover:text-danger"
                            title="حذف"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {sub.indicators.map((ind) => (
                        <IndicatorRow
                          key={ind.id}
                          ind={ind}
                          onEdit={() => setEdit({ mode: "edit", kind: "indicator", row: ind })}
                          onDelete={() =>
                            setConfirmDelete({ kind: "indicator", id: ind.id, title: ind.title })
                          }
                        />
                      ))}
                    </div>
                  ))}

                  {matchedDirect.map((ind) => (
                    <IndicatorRow
                      key={ind.id}
                      ind={ind}
                      onEdit={() => setEdit({ mode: "edit", kind: "indicator", row: ind })}
                      onDelete={() =>
                        setConfirmDelete({ kind: "indicator", id: ind.id, title: ind.title })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============ نافذة التحرير ============ */}
      {edit && (
        <EditDialog
          edit={edit}
          busy={busy}
          criteria={data.criteria}
          onCancel={() => setEdit(null)}
          onSubmit={submit}
        />
      )}

      {/* ============ تأكيد الحذف ============ */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="card w-full max-w-md animate-fade-up p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-heading text-[16px] font-bold text-navy">تأكيد الحذف</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
                  سيتم حذف «{confirmDelete.title}» نهائياً. لا يمكن التراجع عن هذا الإجراء،
                  وسيُسجَّل في سجل التدقيق.
                </p>
                {confirmDelete.kind === "criterion" && (
                  <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[11px] text-warning">
                    تنبيه: حذف المعيار يحذف كل معاييره الفرعية ومؤشراته التابعة.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn btn-ghost btn-sm"
                disabled={busy}
              >
                إلغاء
              </button>
              <button
                onClick={() => remove(false)}
                className="btn btn-danger btn-sm"
                disabled={busy}
              >
                {busy ? "جارٍ الحذف…" : "حذف نهائي"}
              </button>
              <button
                onClick={() => remove(true)}
                className="btn btn-danger btn-sm !bg-danger/80"
                disabled={busy}
                title="حذف حتى لو وُجدت تقييمات مرتبطة"
              >
                حذف قسري
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function matchesIndicator(q: string) {
  const s = q.trim();
  return (i: Indicator) =>
    i.code.includes(s) || i.title.includes(s) || i.evidence.some((e) => e.includes(s));
}

function IndicatorRow({
  ind,
  onEdit,
  onDelete,
}: {
  ind: Indicator;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="group border-b border-gray-100 last:border-b-0 hover:bg-white/70">
      <div className="flex items-start gap-2 px-3 py-1.5 pr-6 sm:px-4 sm:pr-14">
        <span className="mt-0.5 w-14 shrink-0 font-mono text-[9.5px] text-gray-300">
          {ind.code}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-right text-[12px] leading-relaxed text-gray-600 hover:text-navy"
        >
          {ind.title}
        </button>
        {ind.evaluations_count > 0 && (
          <span className="badge badge-info shrink-0 text-[9px]" title="عدد التقييمات المسجّلة">
            {ind.evaluations_count}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-300 transition hover:bg-gray-100 hover:text-navy"
            title="تعديل المؤشر"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-gray-300 transition hover:bg-danger-soft hover:text-danger"
            title="حذف المؤشر"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (ind.evidence.length > 0 || ind.verification_tools.length > 0) && (
        <div className="px-6 pb-2 pr-6 sm:pr-14">
          {ind.evidence.length > 0 && (
            <div className="mb-1.5">
              <p className="text-[10px] font-semibold text-gold">الأدلة والشواهد:</p>
              <ul className="mt-0.5 space-y-0.5">
                {ind.evidence.map((e, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-gray-500">
                    • {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ind.verification_tools.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-turquoise">أدوات التحقق:</p>
              <p className="text-[11px] leading-relaxed text-gray-500">
                {ind.verification_tools.join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditDialog({
  edit,
  criteria,
  busy,
  onCancel,
  onSubmit,
}: {
  edit: EditState;
  criteria: Criterion[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (form: HTMLFormElement) => void;
}) {
  const row: any = edit.mode === "edit" ? (edit as any).row : null;
  const isIndicator = edit.kind === "indicator";

  const title = isIndicator
    ? row
      ? "تعديل المؤشر"
      : "مؤشر جديد"
    : edit.kind === "criterion"
      ? row
        ? "تعديل المعيار"
        : "معيار جديد"
      : row
        ? "تعديل المعيار الفرعي"
        : "معيار فرعي جديد";

  const subOptions =
    edit.kind === "indicator"
      ? criteria.flatMap((c) => c.subCriteria.map((s) => ({ ...s, criterionTitle: c.title })))
      : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-deep/50 p-4 py-10 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-lg animate-fade-up p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-[17px] font-bold text-navy">{title}</h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-navy"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e.currentTarget);
          }}
          className="space-y-3.5"
        >
          <div className={isIndicator ? "" : "grid grid-cols-[90px_1fr] gap-3"}>
            {!isIndicator && (
              <div>
                <label className="label">الرمز</label>
                <input
                  name="code"
                  defaultValue={row?.code ?? ""}
                  required
                  dir="ltr"
                  placeholder="8"
                  className="input text-center font-mono"
                />
              </div>
            )}
            <div>
              <label className="label">الاسم</label>
              <input
                name="title"
                defaultValue={row?.title ?? ""}
                required
                minLength={2}
                maxLength={500}
                placeholder={isIndicator ? "نص المؤشر كما في الاستمارة" : "اسم المعيار"}
                className="input"
              />
            </div>
          </div>

          {isIndicator && (
            <>
              <div>
                <label className="label">رمز المؤشر</label>
                <input
                  name="code"
                  defaultValue={row?.code ?? ""}
                  required
                  dir="ltr"
                  placeholder="1-1-01"
                  className="input font-mono"
                />
              </div>

              {row && (
                <div>
                  <label className="label">المعيار الفرعي التابع له</label>
                  <select
                    name="subCriterionId"
                    defaultValue={row?.sub_criterion_id ?? ""}
                    className="input"
                  >
                    <option value="">— بدون (مباشر تحت المعيار) —</option>
                    {subOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">الأدلة والشواهد</label>
                <textarea
                  name="evidence"
                  defaultValue={(row?.evidence ?? []).join("\n")}
                  rows={4}
                  placeholder="اكتب كل دليل في سطر منفصل"
                  className="input resize-y"
                />
                <p className="mt-1 text-[10px] text-gray-400">سطر لكل دليل.</p>
              </div>

              <div>
                <label className="label">أدوات التحقق</label>
                <textarea
                  name="verificationTools"
                  defaultValue={(row?.verification_tools ?? []).join("\n")}
                  rows={2}
                  placeholder="مقابلة، ملاحظة، فحص وثائق…"
                  className="input resize-y"
                />
              </div>
            </>
          )}

          {!isIndicator && (
            <div>
              <label className="label">الوزن (٪)</label>
              <input
                name="weight"
                type="number"
                min={0}
                max={100}
                defaultValue={row?.weight ?? 0}
                required
                className="input font-mono"
              />
              <p className="mt-1 text-[10.5px] leading-relaxed text-gray-400">
                {edit.kind === "criterion"
                  ? "مجموع أوزان المعايير السبعة يجب أن يساوي 100%."
                  : "مجموع أوزان المعايير الفرعية داخل المعيار يجب أن يساوي وزنه."}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm" disabled={busy}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              <Save className="h-3.5 w-3.5" />
              {busy ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
