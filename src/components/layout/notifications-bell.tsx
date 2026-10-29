"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { fmtDate } from "@/lib/labels";

const DOT: Record<string, string> = { INFO: "bg-info", SUCCESS: "bg-success", WARNING: "bg-warning", DANGER: "bg-danger" };

/** جرس الإشعارات: يحدّث نفسه كل دقيقة، ويعرض التنبيهات التلقائية للمواعيد والزيارات. */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items ?? []);
      setUnread(d.unread ?? 0);
    } catch { /* بلا اتصال */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markAll = async () => {
    await fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setUnread(0);
    setItems((x) => x.map((i) => ({ ...i, is_read: 1 })));
  };
  const markOne = async (id: string) => {
    await fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    void load();
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-xl p-2 text-navy transition hover:bg-navy/5" aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -top-0.5 -left-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[340px] max-w-[92vw] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg animate-fade-up">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="font-heading font-bold text-navy">الإشعارات</p>
            {unread > 0 && <button onClick={markAll} className="flex items-center gap-1 text-[11.5px] font-semibold text-turquoise hover:underline"><CheckCheck className="h-3.5 w-3.5" /> تعليم الكل كمقروء</button>}
          </div>
          <ul className="max-h-[380px] divide-y divide-gray-100 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-gray-400">لا إشعارات</li>}
            {items.map((n) => {
              const body = (
                <div className={`flex gap-3 px-4 py-3 transition hover:bg-gray-50 ${n.is_read ? "" : "bg-turquoise-soft/30"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-gray-300" : DOT[n.type] ?? "bg-info"}`} />
                  <div className="min-w-0"><p className="text-[13px] font-semibold text-navy">{n.title}</p><p className="mt-0.5 line-clamp-2 text-[12px] text-gray-600">{n.body}</p><p className="mt-1 text-[10.5px] text-gray-400">{fmtDate(n.created_at, true)}</p></div>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} onClick={() => { setOpen(false); if (!n.is_read) void markOne(n.id); }}>{body}</Link> : <button className="block w-full text-right" onClick={() => !n.is_read && markOne(n.id)}>{body}</button>}</li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
