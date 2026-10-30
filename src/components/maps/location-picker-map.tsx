"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** خريطة اختيار الموقع: نقرة أو سحب الدبوس. لا شيء يُحفظ هنا، يُبلَّغ المكوّن الأب فقط. */
export default function LocationPickerMap({
  value,
  onPick,
  height = 280,
  others = [],
}: {
  value: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  height?: number;
  others?: { lat: number; lng: number; name: string }[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        const m = L.map(el.current, { scrollWheelZoom: true }).setView(value ? [value.lat, value.lng] : [14.8, 43.0], value ? 16 : 9);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© مساهمو OpenStreetMap", crossOrigin: true }).addTo(m);
        m.on("click", (e: any) => pickRef.current(e.latlng.lat, e.latlng.lng));
        map.current = m;
        for (const o of others) L.circleMarker([o.lat, o.lng], { radius: 5, color: "#64748b", weight: 1, fillOpacity: 0.5 }).bindTooltip(o.name).addTo(m);
      }
      const m = map.current;
      if (value) {
        if (!marker.current) {
          marker.current = L.marker([value.lat, value.lng], { draggable: true }).addTo(m);
          marker.current.on("dragend", () => {
            const p = marker.current.getLatLng();
            pickRef.current(p.lat, p.lng);
          });
        } else {
          marker.current.setLatLng([value.lat, value.lng]);
        }
        const c = m.getCenter();
        if (Math.abs(c.lat - value.lat) > 0.0005 || Math.abs(c.lng - value.lng) > 0.0005) m.setView([value.lat, value.lng], Math.max(m.getZoom(), 15));
      } else if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  useEffect(() => () => { map.current?.remove(); map.current = null; marker.current = null; }, []);

  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-gray-200" role="application" aria-label="خريطة اختيار موقع المدرسة" />;
}
