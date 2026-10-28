"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  saveLocalScore,
  getLocalScores,
  countPending,
  flushPending,
  listLocalScores,
} from "@/lib/offline/drafts";
import { useSession, useToast } from "@/components/providers";
import {
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Save,
  Info,
  CloudOff,
  CloudUpload,
  RefreshCw,
} from "lucide-react";

type Rating = { key: string; label_ar: string; score: number };

type Indicator = {
  indicatorId: string;
  code: string;
  title: string;
  status: "EVALUATED" | "NOT_EVALUATED";
  score: number | null;
  notes: string | null;
  evidence: string[];
  verificationTools: string[];
};

type SubCriterion = {
  subCriterionId: string;
  code: string;
  title: string;
  weight: number;
  achievementPercent: number | null;
  contribution: number | null;
  completionPercent: number;
  evaluatedIndicators: number;
  totalIndicators: number;
  notEvaluatedIndicators: number;
  indicators: Indicator[];
};

type Criterion = {
  criterionId: string;
  code: string;
  title: string;
  weight: number;
  achievementPercent: number | null;
  contribution: number | null;
  completionPercent: number;
  subCriteria: SubCriterion[];
};

type Visit = {
  id: string;
  school_name: string;
  inspector_name: string;
  visit_date: string | null;
  status: string;
  completion: number;
};

type Payload = {
  visit: Visit;
  maxScore: number;
  ratingScale: Rating[];
  criteria: Criterion[];
  weightErrors: string[];
  result: {
    totalScore: number | null;
    completionPercent: number;
    totalIndicators: number;
    evaluatedIndicators: number;
    notEvaluatedIndicators: number;
    reportState: "COMPLETE" | "DRAFT_INCOMPLETE";
    warnings: string[];
  };
};

export default function EvaluationPage() {
  const { user } = useSession();
  const { add } = useToast();

  const [visits, setVisits] = useState<any[]>([]);
  const [visitId, setVisitId] = useState<string>("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [openCriteria, setOpenCriteria] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  /* ---- حالة الشبكة ورفع المسودات المعلّقة ---- */
  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const { synced, remaining } = await flushPending();
      setPending(remaining);
      if (synced > 0) {
        add({ type: "success", message: `تمت مزامنة ${synced} درجة محفوظة محلياً` });
        if (visitId) await loadRef.current?.(visitId);
      }
    } catch {
      /* تجاهل */
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [add, visitId]);

  const loadRef = useRef<((id: string) => Promise<void>) | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void countPending().then(setPending);
    if (navigator.onLine) void syncNow();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/visits?limit=50", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { visits: [] }))
      .then((d) => {
        setVisits(d.visits ?? []);
        if (d.visits?.length > 0) setVisitId(d.visits[0].id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/evaluations/visit/${id}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setData(json);

        /* دمج أي درجات محفوظة محلياً لم تُرفع بعد */
        const local = await getLocalScores(id);
        const overlaid = Object.keys(local);
        if (overlaid.length > 0) {
          const merged = structuredClone(json) as Payload;
          for (const c of merged.criteria) {
            for (const sc of c.subCriteria) {
              for (const ind of sc.indicators) {
                const hit = local[ind.indicatorId];
                if (hit) {
                  ind.status = hit.status;
                  ind.score = hit.score;
                }
              }
            }
          }
          setData(merged);
        }
        setPending(await countPending(id));

        const first: Record<string, boolean> = {};
        json.criteria.forEach((c: Criterion, i: number) => (first[c.criterionId] = i === 0));
        setOpenCriteria(first);
      } catch (e: any) {
        add({ type: "error", message: e.message || "تعذّر تحميل التقييم" });
      } finally {
        setLoading(false);
      }
    },
    [add]
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (visitId) load(visitId);
  }, [visitId, load]);

  const saveScore = async (
    indicatorId: string,
    status: "EVALUATED" | "NOT_EVALUATED",
    score: number | null
  ) => {
    setSaving(indicatorId);
    try {
      const res = await fetch(`/api/evaluations/visit/${visitId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicatorId, status, score }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      await load(visitId);
      setPending(await countPending(visitId));
    } catch (e: any) {
      /* فشل الشبكة؟ احفظ محلياً وأكمل العمل */
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const isNetwork = e instanceof TypeError || offline;
      if (isNetwork) {
        await saveLocalScore({ visitId, indicatorId, status, score });
        setData((prev) => {
          if (!prev) return prev;
          const next = structuredClone(prev) as Payload;
          for (const c of next.criteria) {
            for (const sc of c.subCriteria) {
              for (const ind of sc.indicators) {
                if (ind.indicatorId === indicatorId) {
                  ind.status = status;
                  ind.score = score;
                }
              }
            }
          }
          return next;
        });
        setPending(await countPending(visitId));
        add({
          type: "info",
          message: "لا يوجد اتصال — حُفظت الدرجة على هذا الجهاز وستُزامن تلقائياً.",
        });
      } else {
        add({ type: "error", message: e.message || "تعذّر حفظ الدرجة" });
      }
    } finally {
      setSaving(null);
    }
  };

  const toggle = (id: string) =>
    setOpenCriteria((prev) => ({ ...prev, [id]: !prev[id] }));

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-turquoise border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading text-navy font-bold">التقييم الميداني</h1>
          <p className="text-gray-600 text-sm">
            استمارة التقييم الذاتي — 109 مؤشراً موزّعة على 7 معايير
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(!online || pending > 0) && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                online
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-gray-300 bg-gray-100 text-gray-600"
              }`}
            >
              {online ? <CloudUpload className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
              <span>
                {online
                  ? `${pending} درجة محفوظة محلياً بانتظار المزامنة`
                  : "غير متصل — الحفظ يجري على الجهاز"}
              </span>
              {online && (
                <button
                  onClick={() => void syncNow()}
                  disabled={syncing}
                  className="mr-1 rounded p-0.5 hover:bg-warning/15 disabled:opacity-50"
                  title="مزامنة الآن"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          )}
          <label className="text-sm text-gray-600">الزيارة:</label>
          <select
            value={visitId}
            onChange={(e) => setVisitId(e.target.value)}
            className="pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm min-w-[240px]"
          >
            {visits.length === 0 && <option value="">لا توجد زيارات</option>}
            {visits.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.school_name} — {v.code ?? v.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!visitId && (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-600">
          لا توجد زيارات متاحة لحسابك. أنشئ زيارة أولاً من قسم الزيارات الميدانية.
        </div>
      )}

      {data && (
        <>
          {/* ملخص النتيجة */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">الدرجة الكلية</div>
              <div className="text-2xl font-heading font-bold text-navy">
                {data.result.totalScore === null ? "—" : `${data.result.totalScore} / 100`}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">مجموع مساهمات المعايير</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">نسبة الإكمال</div>
              <div className="text-2xl font-heading font-bold text-turquoise">
                {data.result.completionPercent}%
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-turquoise transition-all"
                  style={{ width: `${data.result.completionPercent}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">المؤشرات المقيَّمة</div>
              <div className="text-2xl font-heading font-bold text-navy">
                {data.result.evaluatedIndicators} / {data.result.totalIndicators}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                {data.result.notEvaluatedIndicators} لم تُقيَّم بعد
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">حالة التقرير</div>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1 ${
                  data.result.reportState === "COMPLETE"
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning"
                }`}
              >
                {data.result.reportState === "COMPLETE" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {data.result.reportState === "COMPLETE" ? "مكتمل" : "مسودة غير مكتملة"}
              </div>
            </div>
          </div>

          {/* تنبيهات صريحة */}
          {data.result.warnings.length > 0 && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 space-y-1">
              {data.result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-warning">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {data.weightErrors.length > 0 && (
            <div className="bg-error/5 border border-error/20 rounded-xl p-4 text-sm text-error">
              <div className="font-semibold mb-1">خطأ في أوزان الاستمارة:</div>
              {data.weightErrors.map((w, i) => (
                <div key={i}>• {w}</div>
              ))}
            </div>
          )}

          {/* المعايير */}
          <div className="space-y-3">
            {data.criteria.map((c) => (
              <div key={c.criterionId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggle(c.criterionId)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50/50 transition text-right"
                >
                  <span className="w-8 h-8 rounded-lg bg-navy/5 text-navy flex items-center justify-center font-bold text-sm shrink-0">
                    {c.code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy text-sm">{c.title}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      الوزن {c.weight}% · الإنجاز {c.completionPercent}% ·{" "}
                      {c.subCriteria.reduce((a, s) => a + s.evaluatedIndicators, 0)}/
                      {c.subCriteria.reduce((a, s) => a + s.totalIndicators, 0)} مؤشراً
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-bold text-navy">
                      {c.achievementPercent === null ? "—" : `${c.achievementPercent}%`}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      المساهمة {c.contribution === null ? "—" : c.contribution}
                    </div>
                  </div>
                  {openCriteria[c.criterionId] ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>

                {openCriteria[c.criterionId] && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {c.subCriteria.map((sc) => (
                      <div key={sc.subCriterionId} className="p-4 bg-gray-50/30">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500">{sc.code}</span>
                            <span className="text-sm font-semibold text-navy">{sc.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy/5 text-navy">
                              وزن {sc.weight}%
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">
                            {sc.achievementPercent === null
                              ? "لم يُقيَّم"
                              : `${sc.achievementPercent}%`}{" "}
                            · مساهمة {sc.contribution === null ? "—" : sc.contribution}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {sc.indicators.map((ind) => (
                            <div
                              key={ind.indicatorId}
                              className="bg-white rounded-lg border border-gray-100 p-3"
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`mt-0.5 shrink-0 ${
                                    ind.status === "EVALUATED" ? "text-success" : "text-gray-300"
                                  }`}
                                >
                                  {ind.status === "EVALUATED" ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                  ) : (
                                    <Circle className="w-4 h-4" />
                                  )}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-sm text-gray-800 leading-relaxed">
                                      <span className="font-mono text-[11px] text-gray-500 ml-1">
                                        {ind.code}
                                      </span>
                                      {ind.title}
                                    </div>
                                    {saving === ind.indicatorId && (
                                      <Save className="w-3.5 h-3.5 text-turquoise animate-pulse shrink-0" />
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    {data.ratingScale.map((r) => {
                                      const active =
                                        ind.status === "EVALUATED" && ind.score === r.score;
                                      return (
                                        <button
                                          key={r.key}
                                          onClick={() =>
                                            saveScore(ind.indicatorId, "EVALUATED", r.score)
                                          }
                                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
                                            active
                                              ? "bg-navy text-white border-navy"
                                              : "bg-white text-gray-600 border-gray-200 hover:border-navy/40"
                                          }`}
                                        >
                                          {r.label_ar} ({r.score})
                                        </button>
                                      );
                                    })}
                                    <button
                                      onClick={() =>
                                        saveScore(ind.indicatorId, "NOT_EVALUATED", null)
                                      }
                                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
                                        ind.status === "NOT_EVALUATED"
                                          ? "bg-gray-200 text-gray-700 border-gray-300"
                                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                      }`}
                                    >
                                      لم يُقيَّم بعد
                                    </button>
                                  </div>

                                  {(ind.evidence.length > 0 || ind.verificationTools.length > 0) && (
                                    <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                                      {ind.evidence.length > 0 && (
                                        <details className="rounded-lg border border-turquoise/20 bg-turquoise-soft/40 px-2.5 py-1.5">
                                          <summary className="cursor-pointer select-none text-[11px] font-medium text-emerald-deep">
                                            الأدلة والشواهد المطلوبة ({ind.evidence.length})
                                          </summary>
                                          <ul className="mt-1.5 list-disc space-y-0.5 pr-4 text-[11px] leading-relaxed text-gray-600">
                                            {ind.evidence.map((ev, k) => (
                                              <li key={k}>{ev}</li>
                                            ))}
                                          </ul>
                                        </details>
                                      )}
                                      {ind.verificationTools.length > 0 && (
                                        <details className="rounded-lg border border-gold/25 bg-gold-soft/40 px-2.5 py-1.5">
                                          <summary className="cursor-pointer select-none text-[11px] font-medium text-navy">
                                            أدوات التحقق ({ind.verificationTools.length})
                                          </summary>
                                          <ul className="mt-1.5 list-disc space-y-0.5 pr-4 text-[11px] leading-relaxed text-gray-600">
                                            {ind.verificationTools.map((vt, k) => (
                                              <li key={k}>{vt}</li>
                                            ))}
                                          </ul>
                                        </details>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {sc.indicators.length === 0 && (
                            <div className="text-xs text-gray-500 py-2">
                              لا توجد مؤشرات مرتبطة بهذا المعيار الفرعي.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-[11px] text-gray-500 bg-white rounded-xl border border-gray-100 p-3">
            <div className="font-semibold text-gray-700 mb-1">كيف تُحسب الدرجة؟</div>
            <div>• نسبة تحقق المعيار الفرعي = (متوسط درجات المؤشرات المقيَّمة ÷ {data.maxScore}) × 100</div>
            <div>• مساهمة المعيار الفرعي = (نسبة التحقق × وزن المعيار الفرعي) ÷ 100</div>
            <div>• الدرجة الكلية = مجموع مساهمات المعايير الفرعية</div>
            <div>• «لم يُقيَّم بعد» حالة إجرائية منفصلة: لا تُحسب صفراً ولا تُعدّ فشلاً</div>
          </div>
        </>
      )}
    </div>
  );
}
