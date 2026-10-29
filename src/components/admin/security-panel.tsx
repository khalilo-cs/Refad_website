"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, KeyRound, LogOut, Plus, ShieldAlert } from "lucide-react";
import { EmptyState, Modal } from "@/components/ui";
import { ConfirmDialog, ScoreRing } from "@/components/ui/extra";
import { useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

const SEV: Record<string, { l: string; c: string }> = { LOW: { l: "منخفضة", c: "badge-neutral" }, MEDIUM: { l: "متوسطة", c: "badge-info" }, HIGH: { l: "عالية", c: "badge-warning" }, CRITICAL: { l: "حرجة", c: "badge-danger" } };
const ST: Record<string, string> = { OPEN: "مفتوح", INVESTIGATING: "قيد التحقيق", RESOLVED: "تم الحل", DISMISSED: "مستبعد" };

/** لوحة الأمن: حوادث، محاولات دخول، إيقاف حسابات، إبطال جلسات، ومراجعة نشاط حساب. */
export default function SecurityPanel() {
  const { add } = useToast();
  const [ov, setOv] = useState<any>(null);
  const [inc, setInc] = useState<any[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [dlg, setDlg] = useState<{ kind: "suspend"; user: any } | null>(null);
  const [activityUser, setActivityUser] = useState("");
  const [activity, setActivity] = useState<any[] | null>(null);
  const [resolve, setResolve] = useState<any>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/admin/security", { credentials: "include" }), fetch("/api/admin/incidents", { credentials: "include" })]);
    if (a.ok) setOv(await a.json());
    if (b.ok) setInc((await b.json()).incidents ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (userId: string, action: string, reason?: string) => {
    const r = await fetch("/api/admin/security", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action, reason }) });
    const d = await r.json();
    add({ type: r.ok ? "success" : "error", message: d.message });
    setDlg(null);
    if (r.ok) void load();
  };
  const loadActivity = async (uid: string) => {
    setActivityUser(uid); setActivity(null);
    if (!uid) return;
    const r = await fetch(`/api/admin/audit?userId=${uid}&limit=50`, { credentials: "include" });
    const d = await r.json();
    setActivity(d.logs ?? d.rows ?? d.items ?? []);
  };
  const patchInc = async (id: string, body: any) => {
    const r = await fetch("/api/admin/incidents", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const d = await r.json();
    add({ type: r.ok ? "success" : "error", message: d.message });
    setResolve(null);
    if (r.ok) void load();
  };

  if (!ov) return <div className="skeleton h-64 rounded-2xl" />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["دخول فاشل (24 ساعة)", ov.failed24, ov.failed24 > 20 ? "text-danger" : "text-navy"], ["دخول ناجح (24 ساعة)", ov.ok24, "text-success"], ["حسابات مقفلة/موقوفة", ov.locked.length, ov.locked.length ? "text-warning" : "text-navy"], ["بلاغات مفتوحة", ov.openIncidents, ov.openIncidents ? "text-danger" : "text-navy"]].map(([l, v, c]: any) => (
          <div key={l} className="card p-4"><p className="text-[12px] text-gray-600">{l}</p><p className={`mt-2 font-heading text-3xl font-bold ${c}`}>{v}</p></div>
        ))}
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-heading text-[16px] font-bold text-navy"><ShieldAlert className="h-4 w-4 text-danger" /> البلاغات الأمنية</h3><button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}><Plus className="h-3.5 w-3.5" /> بلاغ جديد</button></div>
        {inc.length === 0 ? <EmptyState title="لا بلاغات" description="تسجَّل هنا حوادث الاشتباه والاختراق ومحاولات الوصول غير المصرح." /> : (
          <ul className="divide-y divide-gray-100">
            {inc.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-navy">{i.title}</span><span className={`badge ${SEV[i.severity]?.c}`}>{SEV[i.severity]?.l}</span><span className="badge badge-neutral">{ST[i.status]}</span></div>
                <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{i.description}</p>
                <p className="mt-1 text-[11.5px] text-gray-400">أبلغ: {i.reported_by_name ?? "—"} · {fmtDate(i.created_at, true)}{i.related_user_name ? ` · الحساب المرتبط: ${i.related_user_name}` : ""}{i.resolution ? ` · الحل: ${i.resolution}` : ""}</p>
                {["OPEN", "INVESTIGATING"].includes(i.status) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.status === "OPEN" && <button className="btn btn-ghost btn-sm" onClick={() => patchInc(i.id, { status: "INVESTIGATING" })}>بدء التحقيق</button>}
                    {i.related_user_id && !i.related_user_locked && <button className="btn btn-danger btn-sm" onClick={() => patchInc(i.id, { suspendUser: true })}><Ban className="h-3.5 w-3.5" /> إيقاف الحساب المرتبط</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setResolve(i)}>إغلاق البلاغ</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-3 font-heading text-[16px] font-bold text-navy">الحسابات المقفلة أو الموقوفة</h3>
          {ov.locked.length === 0 ? <p className="py-4 text-center text-[13px] text-gray-400">لا حسابات مقفلة.</p> : (
            <ul className="divide-y divide-gray-100">{ov.locked.map((u: any) => (
              <li key={u.id} className="flex items-center justify-between gap-2 py-2.5 text-[13px]"><span><b className="text-navy">{u.name}</b><span className="block text-[11.5px] text-gray-400">{u.email} · {u.is_locked ? `موقوف: ${u.locked_reason ?? "—"}` : `قفل مؤقت حتى ${fmtDate(u.locked_until, true)}`}</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => act(u.id, "unsuspend")}><CheckCircle2 className="h-3.5 w-3.5" /> رفع القفل</button></li>
            ))}</ul>
          )}
        </section>
        <section className="card p-5">
          <h3 className="mb-3 font-heading text-[16px] font-bold text-navy">أكثر مصادر محاولات الدخول الفاشلة (24 ساعة)</h3>
          {ov.topIps.length === 0 ? <p className="py-4 text-center text-[13px] text-gray-400">لا محاولات فاشلة.</p> : (
            <div className="grid gap-4 sm:grid-cols-2 text-[13px]">
              <ul className="space-y-1.5">{ov.topIps.map((x: any) => <li key={x.ip} className="flex justify-between"><span className="font-mono text-gray-600">{x.ip}</span><b className="text-danger">{x.n}</b></li>)}</ul>
              <ul className="space-y-1.5">{ov.topEmails.map((x: any) => <li key={x.email} className="flex justify-between gap-2"><span className="truncate text-gray-600">{x.email}</span><b className="text-danger">{x.n}</b></li>)}</ul>
            </div>
          )}
        </section>
      </div>

      <section className="card p-5">
        <h3 className="mb-3 font-heading text-[16px] font-bold text-navy">مراجعة نشاط حساب وإجراءات الطوارئ</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !py-2 max-w-sm" value={activityUser} onChange={(e) => loadActivity(e.target.value)}><option value="">اختر مستخدماً…</option>{ov.users.map((u: any) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select>
          {activityUser && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => act(activityUser, "revoke_sessions")}><LogOut className="h-3.5 w-3.5" /> إبطال كل الجلسات</button>
              <button className="btn btn-danger btn-sm" onClick={() => setDlg({ kind: "suspend", user: ov.users.find((u: any) => u.id === activityUser) })}><Ban className="h-3.5 w-3.5" /> إيقاف الحساب</button>
            </>
          )}
        </div>
        {activity && (activity.length === 0 ? <p className="mt-3 text-[13px] text-gray-400">لا نشاط مسجَّل.</p> : (
          <ul className="mt-3 max-h-72 divide-y divide-gray-100 overflow-y-auto text-[12.5px]">{activity.map((a: any) => <li key={a.id} className="flex justify-between gap-3 py-2"><span><b className="text-navy">{a.action}</b> <span className="text-gray-500">{a.entity_type}</span></span><span className="font-mono text-[11px] text-gray-400">{a.ip_address ?? ""} · {fmtDate(a.created_at, true)}</span></li>)}</ul>
        ))}
      </section>

      <NewIncident open={newOpen} users={ov.users} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); void load(); }} />
      <ConfirmDialog open={!!dlg} title="إيقاف الحساب" message={`سيُوقف حساب ${dlg?.user?.name} وتُبطل جلساته فوراً.`} requireReason={{ label: "سبب الإيقاف", min: 5 }} confirmLabel="إيقاف" onConfirm={(r) => dlg && act(dlg.user.id, "suspend", r)} onClose={() => setDlg(null)} />
      <ConfirmDialog open={!!resolve} tone="primary" title="إغلاق البلاغ" message={resolve?.title} requireReason={{ label: "ملخص المعالجة", min: 5 }} confirmLabel="تم الحل" onConfirm={(r) => patchInc(resolve.id, { status: "RESOLVED", resolution: r })} onClose={() => setResolve(null)} />
    </div>
  );
}

function NewIncident({ open, users, onClose, onDone }: { open: boolean; users: any[]; onClose: () => void; onDone: () => void }) {
  const { add } = useToast();
  const [f, setF] = useState<any>({ severity: "MEDIUM" });
  useEffect(() => { if (open) setF({ severity: "MEDIUM" }); }, [open]);
  const save = async () => {
    const r = await fetch("/api/admin/incidents", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    add({ type: r.ok ? "success" : "error", message: d.message });
    if (r.ok) onDone();
  };
  return (
    <Modal open={open} onClose={onClose} title="بلاغ أمني جديد" width="md">
      <div className="space-y-3">
        <div><label className="label">العنوان</label><input className="input" value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">الوصف</label><textarea className="input min-h-[90px]" value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">الخطورة</label><select className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select></div>
          <div><label className="label">الحساب المشتبه (اختياري)</label><select className="input" value={f.relatedUserId ?? ""} onChange={(e) => setF({ ...f, relatedUserId: e.target.value })}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        </div>
        <div className="flex justify-end gap-2"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={(f.title ?? "").trim().length < 4 || (f.description ?? "").trim().length < 10} onClick={save}>تسجيل</button></div>
      </div>
    </Modal>
  );
}
