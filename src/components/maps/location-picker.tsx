"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Crosshair, Link2, Loader2, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/providers";
import { inYemen, parseLocationInput, roundCoord, type LocationSource } from "@/lib/geo";

const Map = dynamic(() => import("./location-picker-map"), { ssr: false, loading: () => <div className="skeleton h-[280px] rounded-xl" /> });

export type PickedLocation = { lat: number; lng: number; source: LocationSource };

/**
 * اختيار موقع المدرسة بثلاث طرق: النقر/سحب الدبوس على الخريطة، موقع الجهاز (GPS)،
 * أو لصق إحداثيات أو رابط خرائط (الروابط المختصرة تُحلّ في الخادم).
 */
export function LocationPicker({ value, onChange, height = 280 }: { value: PickedLocation | null; onChange: (v: PickedLocation | null) => void; height?: number }) {
  const { add } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"gps" | "paste" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const accept = (lat: number, lng: number, source: LocationSource, swapped = false) => {
    setNote(swapped ? "كانت الإحداثيات مقلوبة (الطول قبل العرض) فصُحّحت تلقائياً." : null);
    onChange({ lat: roundCoord(lat), lng: roundCoord(lng), source });
  };

  const gps = () => {
    if (!navigator.geolocation) return add({ type: "error", message: "المتصفح لا يدعم تحديد الموقع" });
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(null);
        if (!inYemen(p.coords.latitude, p.coords.longitude)) return add({ type: "error", message: "موقع جهازك خارج اليمن — تأكد من أنك عند المدرسة" });
        accept(p.coords.latitude, p.coords.longitude, "GPS");
        add({ type: "success", message: `تم تحديد موقعك (دقة ≈ ${Math.round(p.coords.accuracy)} م). اسحب الدبوس إن لزم.` });
      },
      (e) => {
        setBusy(null);
        add({ type: "error", message: e.code === 1 ? "لم تسمح بالوصول للموقع. فعّله من إعدادات المتصفح." : "تعذّر تحديد موقعك. حاول في مكان مفتوح." });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const paste = async () => {
    const input = text.trim();
    if (!input) return;
    const local = parseLocationInput(input);
    if (local) {
      if (!local.inYemen) return setNote("الإحداثيات خارج اليمن — راجعها.");
      accept(local.lat, local.lng, /^https?:/i.test(input) ? "MAPS_LINK" : "MANUAL", local.swapped);
      return setText("");
    }
    setBusy("paste");
    try {
      const r = await fetch("/api/geo/resolve", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      if (!d.inYemen) throw new Error("الموقع خارج اليمن — راجع الرابط");
      accept(d.lat, d.lng, "MAPS_LINK", d.swapped);
      setText("");
    } catch (e: any) {
      setNote(e.message || "تعذّر قراءة الرابط");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={gps} disabled={busy === "gps"}>
          {busy === "gps" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />} موقعي الحالي
        </button>
        {value && <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => { onChange(null); setNote(null); }}>مسح الموقع</button>}
        {value && <bdi dir="ltr" className="font-mono text-[12px] text-gray-500">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</bdi>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            className="input ps-9" dir="ltr" value={text} placeholder="الصق رابط خرائط جوجل أو الإحداثيات: 14.80, 43.00"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void paste(); } }}
          />
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={paste} disabled={!text.trim() || busy === "paste"}>
          {busy === "paste" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} اعتماد
        </button>
      </div>
      {note && <p className="flex items-start gap-1.5 text-[12px] text-warning"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}</p>}
      <Map value={value} height={height} onPick={(lat, lng) => accept(lat, lng, "MAP_PICK")} />
      <p className="text-[11.5px] text-gray-400">انقر على الخريطة لوضع الدبوس ثم اسحبه لضبطه. تقرّب إلى مبنى المدرسة لدقة أعلى.</p>
    </div>
  );
}
