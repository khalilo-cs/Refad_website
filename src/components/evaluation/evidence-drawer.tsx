"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, UploadCloud } from "lucide-react";
import { Modal } from "@/components/ui";
import { StatusBadge } from "@/components/ui/extra";
import { useToast } from "@/components/providers";
import { EVIDENCE_STATUS, fmtDate } from "@/lib/labels";

const TYPES = ["وثيقة رسمية", "خطة", "تقرير", "محضر", "سجل", "كشف", "صورة ميدانية", "نموذج", "شهادة", "أخرى"];

/** رفع الأدلة وعرضها لمؤشر معيّن ضمن زيارة، مع شريط تقدم حقيقي للرفع. */
export function EvidenceDrawer({
  open, onClose, schoolId, visitId, indicator, canUpload, onChanged,
}: {
  open: boolean; onClose: () => void; schoolId: string; visitId: string;
  indicator: { indicatorId: string; code: string; title: string } | null; canUpload: boolean; onChanged: () => void;
}) {
  const { add } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [type, setType] = useState(TYPES[0]);
  const [desc, setDesc] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!indicator) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/evidence?visitId=${visitId}&indicatorId=${indicator.indicatorId}`, { credentials: "include" });
      const d = await r.json();
      setItems(d.evidence ?? []);
    } finally { setLoading(false); }
  }, [visitId, indicator]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const upload = (file: File) => {
    if (!indicator) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("schoolId", schoolId);
    fd.append("visitId", visitId);
    fd.append("indicatorId", indicator.indicatorId);
    fd.append("documentType", type);
    if (desc) fd.append("description", desc);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/evidence");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setProgress(null);
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300) { add({ type: "success", message: body.message ?? "تم الرفع" }); setDesc(""); void load(); onChanged(); }
      else add({ type: "error", message: body.message ?? "تعذّر رفع الملف" });
    };
    xhr.onerror = () => { setProgress(null); add({ type: "error", message: "انقطع الاتصال أثناء الرفع. أعد المحاولة." }); };
    setProgress(0);
    xhr.send(fd);
  };

  return (
    <Modal open={open} onClose={onClose} title="الأدلة المرتبطة بالمؤشر" description={indicator ? `${indicator.code} — ${indicator.title.slice(0, 90)}…` : ""} width="lg">
      <div className="space-y-4">
        {canUpload && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">نوع المستند</label><select className="input" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="label">وصف مختصر</label><input className="input" value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} placeholder="اختياري" /></div>
            </div>
            <button className="btn btn-primary btn-sm mt-3" disabled={progress !== null} onClick={() => input.current?.click()}>
              {progress !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} رفع ملف (PDF، صورة، Word، Excel)
            </button>
            <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            {progress !== null && (
              <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-turquoise transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[11.5px] text-gray-500">جارٍ الرفع… {progress}%</p></div>
            )}
            <p className="mt-2 text-[11.5px] text-gray-500">وجود الملف لا يعني تحقق المؤشر؛ يراجع المفتش صلاحية الدليل ثم يقبله أو يرفضه.</p>
          </div>
        )}
        {loading ? <div className="skeleton h-16 rounded-xl" /> : items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-gray-500">لم تُرفق أدلة لهذا المؤشر بعد.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy/5 text-navy"><FileText className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-navy">{e.name}</p>
                  <p className="text-[11.5px] text-gray-500">{e.document_type ?? "—"} · {e.uploaded_by_name} · {fmtDate(e.created_at)} · نسخة {e.version}</p>
                  {e.review_notes && <p className="text-[11.5px] text-danger">{e.review_notes}</p>}
                </div>
                <StatusBadge map={EVIDENCE_STATUS} value={e.review_status} />
                <a href={`/api/evidence/${e.id}/file`} className="btn btn-ghost btn-sm" aria-label="تنزيل"><Download className="h-3.5 w-3.5" /></a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
