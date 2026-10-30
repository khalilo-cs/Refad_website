"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/providers";
import { LocationPicker, type PickedLocation } from "@/components/maps/location-picker";

/** تحديد موقع مدرسة بسرعة دون فتح نموذج التعديل الكامل. */
export function QuickLocationModal({ school, onClose, onSaved }: { school: { id: string; name: string; latitude?: number | null; longitude?: number | null }; onClose: () => void; onSaved: () => void }) {
  const { add } = useToast();
  const [loc, setLoc] = useState<PickedLocation | null>(school.latitude != null && school.longitude != null ? { lat: school.latitude, lng: school.longitude, source: "MANUAL" } : null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!loc) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/schools/${school.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: loc.lat, longitude: loc.lng, locationSource: loc.source }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: "تم حفظ موقع المدرسة" });
      for (const w of d.warnings ?? []) add({ type: "info", message: w });
      onSaved();
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر الحفظ" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="تحديد موقع المدرسة" description={school.name} width="lg">
      <div className="space-y-3">
        <LocationPicker value={loc} onChange={setLoc} height={320} />
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!loc || busy} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ الموقع</button>
        </div>
      </div>
    </Modal>
  );
}
