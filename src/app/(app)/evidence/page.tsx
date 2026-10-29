"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  BookMarked, CheckCircle2, Clock, Copy, Download, Eye, FileImage, FileSpreadsheet, FileText, FileType2, History, Loader2, Plus, RefreshCw,
  Search, ShieldCheck, Trash2, UploadCloud, XCircle,
} from "lucide-react";
import { EmptyState, Modal, PageHeader } from "@/components/ui";
import { ConfirmDialog, Pagination, StatusBadge, Tabs, useDebounced } from "@/components/ui/extra";
import { useSession, useToast } from "@/components/providers";
import { EVIDENCE_STATUS, VALIDITY, fmtDate } from "@/lib/labels";

type Tab = "files" | "library";
const TYPES = ["وثيقة رسمية", "خطة", "تقرير", "محضر", "سجل", "كشف", "صورة ميدانية", "نموذج", "شهادة", "أخرى"];

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet;
  if (mime.includes("word")) return FileType2;
  return FileText;
}
const human = (b: number) => (b < 1024 ? `${b} بايت` : b < 1048576 ? `${(b / 1024).toFixed(0)} ك.ب` : `${(b / 1048576).toFixed(1)} م.ب`);

export default function EvidencePage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><EvidenceInner /></Suspense>;
}

function EvidenceInner() {
  const { user } = useSession();
  const { add } = useToast();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("files");
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [schoolId, setSchoolId] = useState(sp.get("schoolId") ?? "");
  const [page, setPage] = useState(1);
  const [schools, setSchools] = useState<any[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPreset, setUploadPreset] = useState<any>({});
  const [reviewFor, setReviewFor] = useState<any>(null);
  const [versionsFor, setVersionsFor] = useState<any>(null);
  const [previewFor, setPreviewFor] = useState<any>(null);
  const [deleteFor, setDeleteFor] = useState<any>(null);
  const dq = useDebounced(q, 300);

  const role = user?.roleKey ?? "";
  const canUpload = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR", "TEACHER"].includes(role);
  const canReview = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "QUALITY_COORDINATOR"].includes(role);
  const canDelete = ["SUPER_ADMIN", "EDUCATION_DIRECTOR"].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dq) qs.set("q", dq);
      if (status) qs.set("status", status);
      if (type) qs.set("type", type);
      if (schoolId) qs.set("schoolId", schoolId);
      const r = await fetch(`/api/evidence?${qs}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setItems(d.evidence ?? []);
      setCounts(d.counts ?? {});
    } catch (e: any) { add({ type: "error", message: e.message || "تعذّر تحميل الأدلة" }); } finally { setLoading(false); }
  }, [dq, status, type, schoolId, add]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { fetch("/api/schools?limit=100", { credentials: "include" }).then((r) => (r.ok ? r.json() : { schools: [] })).then((d) => setSchools(d.schools ?? [])).catch(() => {}); }, []);

  const PAGE = 12;
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const shown = items.slice((page - 1) * PAGE, page * PAGE);

  const copyLink = async (e: any) => {
    try {
      const r = await fetch(`/api/evidence/${e.id}/link`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      await navigator.clipboard.writeText(`${window.location.origin}${d.url}`);
      add({ type: "success", message: "نُسخ رابط مؤقت صالح 5 دقائق" });
    } catch (er: any) { add({ type: "error", message: er.message || "تعذّر إنشاء الرابط" }); }
  };
  const doDelete = async () => {
    const r = await fetch(`/api/evidence?id=${deleteFor.id}`, { method: "DELETE", credentials: "include" });
    const d = await r.json();
    setDeleteFor(null);
    if (!r.ok) return add({ type: "error", message: d.message });
    add({ type: "success", message: d.message });
    void load();
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={FileText} title="الأدلة والشواهد" subtitle="أرشيف إلكتروني خاص: لا روابط عامة، وتنزيل بصلاحية أو برابط مؤقت. وجود الملف لا يعني تحقق المؤشر قبل مراجعته."
        actions={canUpload ? <button className="btn btn-primary btn-sm" onClick={() => { setUploadPreset({}); setUploadOpen(true); }}><Plus className="h-3.5 w-3.5" /> رفع دليل</button> : undefined} />

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: "files", label: "الأدلة المرفوعة", count: counts.total ?? 0 }, { key: "library", label: "مكتبة الشواهد المتكررة" }]} />

      {tab === "files" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {([["", "الإجمالي", counts.total, FileText, "text-navy"], ["PENDING", "بانتظار المراجعة", counts.pending, Clock, "text-warning"], ["ACCEPTED", "مقبولة", counts.accepted, CheckCircle2, "text-success"], ["REJECTED", "مرفوضة", counts.rejected, XCircle, "text-danger"]] as any[]).map(([k, l, v, Icon, c]) => (
              <button key={l} onClick={() => { setStatus(k); setPage(1); }} className={`card card-elevated p-4 text-right ${status === k ? "ring-2 ring-turquoise/40" : ""}`}>
                <div className="flex items-center justify-between"><span className="text-[12px] text-gray-600">{l}</span><Icon className={`h-4 w-4 ${c}`} /></div>
                <p className={`mt-2 font-heading text-3xl font-bold ${c}`}>{v ?? 0}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="input pr-9" placeholder="ابحث باسم الدليل أو وصفه…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
            {schools.length > 1 && <select className="input md:w-56" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setPage(1); }}><option value="">كل المدارس</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            <select className="input md:w-44" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">كل الأنواع</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>

          {loading ? <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div> : shown.length === 0 ? (
            <div className="card"><EmptyState icon={FileText} title="لا توجد أدلة" description="لم يُرفع أي دليل مطابق. ابدأ برفع أول شاهد يدعم المؤشرات." action={canUpload ? <button className="btn btn-primary btn-sm" onClick={() => setUploadOpen(true)}><UploadCloud className="h-3.5 w-3.5" /> رفع دليل</button> : undefined} /></div>
          ) : (
            <ul className="space-y-3">
              {shown.map((e, i) => {
                const Icon = fileIcon(e.mime_type);
                return (
                  <motion.li key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }} className="card p-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-navy/5 text-navy"><Icon className="h-6 w-6" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-navy">{e.name}</h3>
                          <StatusBadge map={EVIDENCE_STATUS} value={e.review_status} />
                          {e.validity && <span className="badge badge-info">{VALIDITY[e.validity]}</span>}
                          {e.version > 1 && <span className="badge badge-neutral">نسخة {e.version}</span>}
                        </div>
                        <p className="mt-1 text-[12px] text-gray-500">{e.school_name} · {e.document_type ?? "—"} · {human(e.size)} · {e.uploaded_by_name} · {fmtDate(e.created_at)}</p>
                        {e.indicator_code && <p className="mt-1.5 text-[12px] text-gray-700"><span className="me-1.5 rounded-lg bg-navy px-1.5 py-0.5 font-mono text-[11px] font-bold text-gold-bright">{e.indicator_code}</span>{e.indicator_title?.slice(0, 110)}</p>}
                        {e.description && <p className="mt-1 text-[12px] text-gray-500">{e.description}</p>}
                        {e.review_notes && <p className="mt-1 rounded-lg bg-gray-50 px-2 py-1 text-[12px] text-gray-600">ملاحظة المراجعة: {e.review_notes}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {(e.mime_type === "application/pdf" || e.mime_type.startsWith("image/")) && <button className="btn btn-ghost btn-sm !px-2" title="معاينة" onClick={() => setPreviewFor(e)}><Eye className="h-3.5 w-3.5" /></button>}
                        <a className="btn btn-ghost btn-sm !px-2" title="تنزيل" href={`/api/evidence/${e.id}/file`}><Download className="h-3.5 w-3.5" /></a>
                        <button className="btn btn-ghost btn-sm !px-2" title="نسخ رابط مؤقت" onClick={() => copyLink(e)}><Copy className="h-3.5 w-3.5" /></button>
                        <button className="btn btn-ghost btn-sm !px-2" title="سجل النسخ" onClick={() => setVersionsFor(e)}><History className="h-3.5 w-3.5" /></button>
                        {canUpload && <button className="btn btn-ghost btn-sm !px-2" title="رفع نسخة جديدة" onClick={() => { setUploadPreset({ replace: e }); setUploadOpen(true); }}><RefreshCw className="h-3.5 w-3.5" /></button>}
                        {canReview && e.review_status !== "ACCEPTED" && <button className="btn btn-primary btn-sm" onClick={() => setReviewFor(e)}><ShieldCheck className="h-3.5 w-3.5" /> مراجعة</button>}
                        {canReview && e.review_status === "ACCEPTED" && <button className="btn btn-ghost btn-sm" onClick={() => setReviewFor(e)}>إعادة المراجعة</button>}
                        {canDelete && <button className="btn btn-ghost btn-sm !px-2 text-danger" title="حذف" onClick={() => setDeleteFor(e)}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <Pagination page={page} totalPages={pages} total={items.length} onPage={setPage} />
        </>
      )}

      {tab === "library" && <LibraryTab schools={schools} defaultSchool={user?.schoolId ?? ""} onUpload={(preset) => { setUploadPreset(preset); setUploadOpen(true); }} />}

      <UploadModal open={uploadOpen} preset={uploadPreset} schools={schools} onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); void load(); }} />
      <ReviewModal item={reviewFor} onClose={() => setReviewFor(null)} onDone={() => { setReviewFor(null); void load(); }} />
      <VersionsModal item={versionsFor} onClose={() => setVersionsFor(null)} />
      <Modal open={!!previewFor} onClose={() => setPreviewFor(null)} title={previewFor?.name ?? ""} width="lg">
        {previewFor && (previewFor.mime_type === "application/pdf"
          ? <iframe title="معاينة" src={`/api/evidence/${previewFor.id}/file?inline=1`} sandbox="" className="h-[70vh] w-full rounded-xl border border-gray-200" />
          : <img alt={previewFor.name} src={`/api/evidence/${previewFor.id}/file?inline=1`} className="mx-auto max-h-[70vh] rounded-xl" />)}
      </Modal>
      <ConfirmDialog open={!!deleteFor} title="حذف الدليل" message={`سيُحذف «${deleteFor?.name}» مع نسخه نهائياً من الأرشيف. يُسجَّل الإجراء في سجل التدقيق.`} confirmLabel="حذف" onConfirm={doDelete} onClose={() => setDeleteFor(null)} />
    </div>
  );
}

/* --------------------------------- المكتبة --------------------------------- */
function LibraryTab({ schools, defaultSchool, onUpload }: { schools: any[]; defaultSchool: string; onUpload: (preset: any) => void }) {
  const { add } = useToast();
  const [schoolId, setSchoolId] = useState(defaultSchool);
  const [data, setData] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", codes: "" });

  const load = useCallback(async () => {
    const r = await fetch(`/api/evidence/library${schoolId ? `?schoolId=${schoolId}` : ""}`, { credentials: "include" });
    const d = await r.json();
    if (r.ok) setData(d); else add({ type: "error", message: d.message });
  }, [schoolId, add]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const r = await fetch("/api/evidence/library", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, description: form.description, indicatorCodes: form.codes.split(/[،,\s]+/).filter(Boolean) }) });
    const d = await r.json();
    if (!r.ok) return add({ type: "error", message: d.message });
    add({ type: "success", message: d.message });
    setAddOpen(false); setForm({ title: "", description: "", codes: "" }); void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-gray-600">الشواهد المتكررة عبر مؤشرات الاستمارة. اختر مدرسة لمعرفة ما رُفع منها وما ينقص.</p>
        <div className="flex gap-2">
          {schools.length > 1 && <select className="input !py-2 w-56" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}><option value="">اختر مدرسة…</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          {data?.canManage && <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" /> عنصر جديد</button>}
        </div>
      </div>
      {!data ? <div className="skeleton h-40 rounded-2xl" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.items.map((it: any) => {
            const covered = it.accepted > 0;
            return (
              <div key={it.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${covered ? "bg-success-soft text-success" : it.pending ? "bg-warning-soft text-warning" : "bg-gray-100 text-gray-400"}`}><BookMarked className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-navy">{it.title}</h3>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600">{it.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{it.indicator_codes.map((c: string) => <span key={c} className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-[10.5px] text-navy">{c}</span>)}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`badge ${covered ? "badge-success" : it.pending ? "badge-warning" : "badge-neutral"}`}>{covered ? `${it.accepted} مقبول` : it.pending ? `${it.pending} بانتظار المراجعة` : data.schoolId ? "لم يُرفع" : "اختر مدرسة"}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => onUpload({ libraryItem: it, schoolId: data.schoolId ?? "" })}><UploadCloud className="h-3.5 w-3.5" /> رفع</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="عنصر جديد في المكتبة" width="sm">
        <div className="space-y-3">
          <div><label className="label">العنوان</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">الوصف</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="label">رموز المؤشرات المرتبطة (مفصولة بفاصلة)</label><input className="input" dir="ltr" value={form.codes} onChange={(e) => setForm({ ...form, codes: e.target.value })} placeholder="1-1-1, 4-1-1" /></div>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={form.title.trim().length < 3} onClick={save}>إضافة</button></div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------------- الرفع ---------------------------------- */
function UploadModal({ open, preset, schools, onClose, onDone }: { open: boolean; preset: any; schools: any[]; onClose: () => void; onDone: () => void }) {
  const { user } = useSession();
  const { add } = useToast();
  const [f, setF] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const [indicators, setIndicators] = useState<any[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replace = preset?.replace;

  useEffect(() => {
    if (!open) return;
    setFile(null); setProgress(null);
    setF({ schoolId: preset?.schoolId ?? user?.schoolId ?? "", documentType: TYPES[0], description: "", indicatorId: "", name: preset?.libraryItem?.title ?? "", libraryItemId: preset?.libraryItem?.id ?? "" });
    if (!indicators.length) fetch("/api/lookup/indicators", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).then((d) => setIndicators(Array.isArray(d) ? d : [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  const submit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (replace) fd.append("replaceId", replace.id);
    else {
      fd.append("schoolId", f.schoolId);
      if (f.indicatorId) fd.append("indicatorId", f.indicatorId);
      if (f.libraryItemId) fd.append("libraryItemId", f.libraryItemId);
      if (f.name) fd.append("name", f.name);
    }
    fd.append("documentType", f.documentType);
    if (f.description) fd.append("description", f.description);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/evidence");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setProgress(null);
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300) { add({ type: "success", message: body.message }); onDone(); }
      else add({ type: "error", message: body.message ?? "تعذّر رفع الملف" });
    };
    xhr.onerror = () => { setProgress(null); add({ type: "error", message: "انقطع الاتصال أثناء الرفع. أعد المحاولة." }); };
    setProgress(0);
    xhr.send(fd);
  };

  const ready = !!file && (replace || !!f.schoolId);
  return (
    <Modal open={open} onClose={onClose} title={replace ? `رفع نسخة جديدة: ${replace.name}` : "رفع دليل"} description={replace ? "تُحفظ النسخة السابقة في السجل وتعود الحالة إلى «بانتظار المراجعة»." : "الأنواع المسموحة: PDF، صور، Word، Excel، CSV — يُتحقق من محتوى الملف لا من امتداده فقط."} width="md">
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const x = e.dataTransfer.files?.[0]; if (x) setFile(x); }}
          onClick={() => input.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-turquoise bg-turquoise-soft/40" : "border-gray-300 hover:border-turquoise/60"}`}
        >
          <UploadCloud className="h-7 w-7 text-turquoise" />
          <p className="text-sm font-semibold text-navy">{file ? file.name : "اسحب الملف هنا أو اضغط للاختيار"}</p>
          {file && <p className="text-[12px] text-gray-500">{human(file.size)}</p>}
          <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {progress !== null && <div><div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-turquoise transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[12px] text-gray-500">جارٍ الرفع… {progress}%</p></div>}
        {!replace && (
          <div className="grid gap-3 sm:grid-cols-2">
            {!user?.schoolId && <div className="sm:col-span-2"><label className="label">المدرسة</label><select className="input" value={f.schoolId ?? ""} onChange={(e) => setF({ ...f, schoolId: e.target.value })}><option value="">اختر…</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
            <div className="sm:col-span-2"><label className="label">المؤشر المرتبط (اختياري)</label>
              <select className="input" value={f.indicatorId ?? ""} onChange={(e) => setF({ ...f, indicatorId: e.target.value })}><option value="">بلا ربط بمؤشر</option>{indicators.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.title.slice(0, 70)}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label">اسم الدليل</label><input className="input" value={f.name ?? ""} maxLength={200} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="يُستخدم اسم الملف إن تُرك فارغاً" /></div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">نوع المستند</label><select className="input" value={f.documentType} onChange={(e) => setF({ ...f, documentType: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">وصف</label><input className="input" maxLength={300} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={!ready || progress !== null} onClick={submit}>{progress !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />} رفع</button></div>
      </div>
    </Modal>
  );
}

/* --------------------------------- المراجعة -------------------------------- */
function ReviewModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const { add } = useToast();
  const [validity, setValidity] = useState("VALID");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValidity("VALID"); setNotes(""); }, [item]);
  const send = async (status: "ACCEPTED" | "REJECTED" | "PENDING") => {
    setBusy(true);
    try {
      const r = await fetch("/api/evidence", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status, validity: status === "ACCEPTED" ? validity : undefined, notes }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onDone();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title="مراجعة الدليل" description={item?.name} width="sm">
      <div className="space-y-4">
        <p className="rounded-xl bg-gold-soft/60 px-3 py-2 text-[12.5px] text-[#7A6112]">افتح الملف وتأكد من صلاحيته كدليل على المؤشر قبل القبول؛ وجوده وحده لا يكفي.</p>
        <a href={`/api/evidence/${item?.id}/file`} className="btn btn-ghost btn-sm w-full justify-center"><Download className="h-3.5 w-3.5" /> فتح الملف للمراجعة</a>
        <div><label className="label">مدى صلاحيته كدليل</label><select className="input" value={validity} onChange={(e) => setValidity(e.target.value)}>{Object.entries(VALIDITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">ملاحظات المراجعة (إلزامية عند الرفض)</label><textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-danger btn-sm" disabled={busy || notes.trim().length < 5} onClick={() => send("REJECTED")}><XCircle className="h-3.5 w-3.5" /> رفض</button>
          <button className="btn btn-sm bg-emerald text-white hover:brightness-110" disabled={busy || validity === "INVALID"} onClick={() => send("ACCEPTED")}><CheckCircle2 className="h-3.5 w-3.5" /> قبول</button>
        </div>
      </div>
    </Modal>
  );
}

function VersionsModal({ item, onClose }: { item: any; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); if (item) fetch(`/api/evidence/${item.id}/versions`, { credentials: "include" }).then((r) => r.json()).then(setD).catch(() => {}); }, [item]);
  return (
    <Modal open={!!item} onClose={onClose} title="سجل نسخ الدليل" description={item?.name} width="md">
      {!d ? <div className="skeleton h-20" /> : (
        <ul className="divide-y divide-gray-100 text-[13px]">
          <li className="flex items-center justify-between py-2.5"><span><b className="text-navy">نسخة {d.current.version}</b> (الحالية) — {d.current.original_name} · {human(d.current.size)}</span><a className="btn btn-ghost btn-sm" href={`/api/evidence/${item.id}/file`}><Download className="h-3.5 w-3.5" /></a></li>
          {d.previous.map((v: any) => <li key={v.version} className="flex items-center justify-between py-2.5"><span><b>نسخة {v.version}</b> — {v.original_name} · {human(v.size)} · {v.uploaded_by} · {fmtDate(v.created_at)}</span><a className="btn btn-ghost btn-sm" href={`/api/evidence/${item.id}/file?v=${v.version}`}><Download className="h-3.5 w-3.5" /></a></li>)}
          {d.previous.length === 0 && <li className="py-3 text-gray-500">لا نسخ سابقة.</li>}
        </ul>
      )}
    </Modal>
  );
}
