"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/providers";

type School = { id: string; name: string; code?: string; directorate_id?: string };
type Dir = { id: string; name: string };

/** اختيار مدير النظام للمدارس التي يتابعها المفتش. */
export function AssignSchoolsModal({ inspector, schools, dirs, onClose }: {
  inspector: { id: string; name: string; directorate_id: string | null };
  schools: School[];
  dirs: Dir[];
  onClose: () => void;
}) {
  const { add } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState(inspector.directorate_id ?? "");

  useEffect(() => {
    fetch(`/api/users/${inspector.id}/schools`, { credentials: "include" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        setSelected(new Set(d.schoolIds as string[]));
      })
      .catch((e) => add({ type: "error", message: e.message || "تعذّر تحميل المدارس المسندة" }))
      .finally(() => setLoading(false));
  }, [inspector.id, add]);

  const shown = useMemo(() => schools.filter((s) =>
    (!dir || s.directorate_id === dir) &&
    (!q || s.name.includes(q) || (s.code ?? "").toLowerCase().includes(q.toLowerCase()))
  ), [schools, dir, q]);

  const toggle = (id: string) => setSelected((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allShown = shown.length > 0 && shown.every((s) => selected.has(s.id));
  const toggleShown = () => setSelected((p) => {
    const n = new Set(p);
    shown.forEach((s) => (allShown ? n.delete(s.id) : n.add(s.id)));
    return n;
  });

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${inspector.id}/schools`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolIds: [...selected] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: `تم حفظ الإسناد: ${d.count} مدرسة` });
      onClose();
    } catch (e: any) {
      add({ type: "error", message: e.message || "تعذّر حفظ الإسناد" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`المدارس المسندة — ${inspector.name}`}>
      <p className="mb-3 text-[12.5px] text-gray-600">لا يرى المفتش إلا المدارس التي تختارها هنا، إضافة إلى مدارس زياراته. يصله إشعار بأي مدرسة جديدة تُسند إليه.</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <select className="input" value={dir} onChange={(e) => setDir(e.target.value)} aria-label="المديرية">
          <option value="">كل المديريات</option>
          {dirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className="input pe-9" placeholder="ابحث باسم المدرسة أو رمزها" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between text-[12.5px]">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={allShown} onChange={toggleShown} disabled={!shown.length} />
          تحديد كل المعروض ({shown.length})
        </label>
        <span className="font-bold text-navy">المختار: {selected.size}</span>
      </div>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-[12.5px] text-gray-500">لا مدارس مطابقة.</p>
        ) : shown.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-3 py-2 text-[13px] last:border-0 hover:bg-gray-50">
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            <span className="flex-1">{s.name}</span>
            {s.code && <span className="text-[11px] text-gray-400" dir="ltr">{s.code}</span>}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || loading}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الإسناد
        </button>
      </div>
    </Modal>
  );
}
