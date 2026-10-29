"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { SCORE_COLOR, scoreTone, fmtPercent } from "@/lib/labels";

export type MapSchool = {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  directorate?: string;
  percent?: number | null;
  score?: number | null;
};

/**
 * خريطة المدارس (Leaflet). تُرسم الإحداثيات المُدخلة فقط، ولا تُختلق مواقع.
 * عند تعذّر تحميل البلاطات (ضعف الإنترنت) تبقى النقاط ظاهرة على خلفية هادئة.
 */
export default function SchoolsMap({
  schools,
  height = 360,
  onSelect,
  focusId,
}: {
  schools: MapSchool[];
  height?: number;
  onSelect?: (id: string) => void;
  focusId?: string | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([15.3, 43.9], 7);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© مساهمو OpenStreetMap",
          crossOrigin: true,
        }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }
      const layer = layerRef.current;
      layer.clearLayers();
      markersRef.current.clear();
      const pts: [number, number][] = [];
      for (const s of schools) {
        const p = s.percent ?? s.score ?? null;
        const color = SCORE_COLOR[scoreTone(p)];
        const m = L.circleMarker([s.latitude, s.longitude], {
          radius: 9, color: "#fff", weight: 2.5, fillColor: color, fillOpacity: 0.95,
        });
        const wrap = document.createElement("div");
        wrap.style.direction = "rtl";
        wrap.style.minWidth = "150px";
        const t = document.createElement("strong");
        t.textContent = s.name;
        const d = document.createElement("div");
        d.style.cssText = "font-size:12px;color:#5A6B7B;margin-top:2px";
        d.textContent = `${s.code} · ${s.directorate ?? ""}`;
        const sc = document.createElement("div");
        sc.style.cssText = "margin-top:4px;font-size:12px";
        sc.textContent = `نسبة التحقق: ${fmtPercent(p)}`;
        wrap.append(t, d, sc);
        m.bindPopup(wrap);
        m.on("click", () => onSelect?.(s.id));
        m.addTo(layer);
        markersRef.current.set(s.id, m);
        pts.push([s.latitude, s.longitude]);
      }
      if (pts.length === 1) mapRef.current.setView(pts[0], 12);
      else if (pts.length > 1) mapRef.current.fitBounds(pts as any, { padding: [40, 40], maxZoom: 13 });
    })();
    return () => { cancelled = true; };
  }, [schools, onSelect]);

  useEffect(() => {
    if (!focusId || !mapRef.current) return;
    const m = markersRef.current.get(focusId);
    if (m) {
      mapRef.current.setView(m.getLatLng(), 14, { animate: true });
      m.openPopup();
    }
  }, [focusId]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return (
    <div
      ref={el}
      style={{ height, direction: "ltr" }}
      className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-[#e8eef2]"
      role="application"
      aria-label="خريطة المدارس"
    />
  );
}
