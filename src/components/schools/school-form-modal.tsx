"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/providers";
import { LocationPicker, type PickedLocation } from "@/components/maps/location-picker";

/* ------------------------------------------------------------------ */
/* نموذج إضافة/تعديل مدرسة                                              */
/* ------------------------------------------------------------------ */
export function SchoolFormModal({ open, onClose, onSaved, school }: { open: boolean; onClose: () => void; onSaved: () => void; school?: any }) {
  const { add } = useToast();
  const [govs, setGovs] = useState<any[]>([]);
  const [dirs, setDirs] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [phoneBad, setPhoneBad] = useState(false);
  const [allowBad, setAllowBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPhoneBad(false);
    setAllowBad(false);
    setLoc(school?.latitude != null && school?.longitude != null ? { lat: school.latitude, lng: school.longitude, source: (school.location_source ?? "MANUAL") as PickedLocation["source"] } : null);
    setF(school ? {
      code: school.code, name: school.name, governorateId: school.governorate_id, directorateId: school.directorate_id, areaId: school.area_id ?? "",
      address: school.address ?? "", type: school.type, stage: school.stage, contactPhone: school.contact_phone ?? "", contactEmail: school.contact_email ?? "",
      principalName: school.principal_name ?? "", hasWhatsapp: school.has_whatsapp !== 0, status: school.status,
    } : { type: "مختلط", stage: "أساسي", dataSource: "MANUAL", hasWhatsapp: true });
    fetch("/api/lookup/governorates", { credentials: "include" }).then((r) => r.json()).then((d) => setGovs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [open, school]);
  useEffect(() => {
    if (!f.governorateId) { setDirs([]); return; }
    fetch(`/api/lookup/directorates?governorateId=${f.governorateId}`, { credentials: "include" }).then((r) => r.json()).then((d) => setDirs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [f.governorateId]);
  useEffect(() => {
    if (!f.directorateId) { setAreas([]); return; }
    fetch(`/api/lookup/areas?directorateId=${f.directorateId}`, { credentials: "include" }).then((r) => r.json()).then((d) => setAreas(Array.isArray(d) ? d : [])).catch(() => {});
  }, [f.directorateId]);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const err = (k: string) => errors[k]?.[0];

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body: any = { ...f, allowInvalidPhone: allowBad };
      for (const k of ["areaId", "address", "contactPhone", "contactEmail", "principalName"]) if (body[k] === "") body[k] = null;
      body.latitude = loc ? loc.lat : null;
      body.longitude = loc ? loc.lng : null;
      body.locationSource = loc ? loc.source : null;
      const res = await fetch(school ? `/api/schools/${school.id}` : "/api/schools", { method: school ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setErrors(data.errors ?? {}); setPhoneBad(!!data.invalidPhone); throw new Error(data.message || "تعذّر الحفظ"); }
      add({ type: "success", message: data.message });
      for (const w of data.warnings ?? []) add({ type: "info", message: w });
      onSaved();
    } catch (e: any) {
      add({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const fld = ({ k, label, type = "text", ph, dirLtr }: { k: string; label: string; type?: string; ph?: string; dirLtr?: boolean }) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} step={type === "number" ? "any" : undefined} placeholder={ph} dir={dirLtr ? "ltr" : undefined} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
      {err(k) && <p className="mt-1 text-[11.5px] text-danger">{err(k)}</p>}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={school ? "تعديل بيانات المدرسة" : "إضافة مدرسة"} description="أدخل البيانات كما تعتمدها الإدارة. لا تُنشأ أي مدرسة تلقائياً." width="lg">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {fld({ k: "name", label: "الاسم الرسمي" })}
          {fld({ k: "code", label: "الرمز المدرسي الفريد", dirLtr: true })}
          <div>
            <label className="label">المحافظة</label>
            <select className="input" value={f.governorateId ?? ""} onChange={(e) => { set("governorateId", e.target.value); set("directorateId", ""); set("areaId", ""); }}>
              <option value="">اختر…</option>{govs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {err("governorateId") && <p className="mt-1 text-[11.5px] text-danger">{err("governorateId")}</p>}
          </div>
          <div>
            <label className="label">المديرية</label>
            <select className="input" value={f.directorateId ?? ""} onChange={(e) => { set("directorateId", e.target.value); set("areaId", ""); }} disabled={!f.governorateId}>
              <option value="">اختر…</option>{dirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {err("directorateId") && <p className="mt-1 text-[11.5px] text-danger">{err("directorateId")}</p>}
          </div>
          <div>
            <label className="label">المنطقة (اختياري)</label>
            <select className="input" value={f.areaId ?? ""} onChange={(e) => set("areaId", e.target.value)} disabled={!f.directorateId}>
              <option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {fld({ k: "address", label: "العنوان / الوصف الجغرافي" })}
          <div>
            <label className="label">النوع</label>
            <select className="input" value={f.type ?? ""} onChange={(e) => set("type", e.target.value)}>
              {[...new Set(["مختلط", "ذكور", "إناث", ...(f.type ? [f.type] : [])])].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">المرحلة</label>
            <select className="input" value={f.stage ?? ""} onChange={(e) => set("stage", e.target.value)}>
              {[...new Set(["أساسي", "ثانوي", "أساسي وثانوي", "رياض أطفال", ...(f.stage ? [f.stage] : [])])].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          {fld({ k: "principalName", label: "اسم مدير المدرسة" })}
          <div>
            <label className="label">هاتف المدرسة / المدير</label>
            <input className="input" dir="ltr" inputMode="tel" placeholder="77X XXX XXX" value={f.contactPhone ?? ""} onChange={(e) => { set("contactPhone", e.target.value); setPhoneBad(false); setAllowBad(false); }} />
            {err("contactPhone") && <p className="mt-1 text-[11.5px] text-danger">{err("contactPhone")}</p>}
            {phoneBad && <label className="mt-1 flex items-center gap-1.5 text-[12px] text-gray-700"><input type="checkbox" checked={allowBad} onChange={(e) => setAllowBad(e.target.checked)} /> احفظ الرقم كما هو رغم ذلك</label>}
            <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-gray-700"><input type="checkbox" checked={f.hasWhatsapp !== false} onChange={(e) => set("hasWhatsapp", e.target.checked)} /> هذا الرقم عليه واتساب</label>
          </div>
          {fld({ k: "contactEmail", label: "بريد رسمي", type: "email", dirLtr: true })}
          {school && (
            <div>
              <label className="label">الحالة</label>
              <select className="input" value={f.status ?? "ACTIVE"} onChange={(e) => set("status", e.target.value)}>
                <option value="ACTIVE">نشطة</option><option value="INACTIVE">غير نشطة</option><option value="SUSPENDED">موقوفة</option>
              </select>
            </div>
          )}
        </div>
        <fieldset className="rounded-xl border border-gray-200 p-3">
          <legend className="px-2 text-[12px] font-semibold text-gray-600">موقع المدرسة على الخريطة (اختياري)</legend>
          <LocationPicker value={loc} onChange={setLoc} />
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {school ? "حفظ التعديلات" : "إضافة"}</button>
        </div>
      </form>
    </Modal>
  );
}

