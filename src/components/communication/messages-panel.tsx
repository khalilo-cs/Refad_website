"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CheckCheck, Loader2, Lock, MessageSquarePlus, Send, Unlock } from "lucide-react";
import { EmptyState, Modal } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { fmtDate } from "@/lib/labels";

const KIND_LABEL: Record<string, string> = { OFFICIAL: "رسمية", INQUIRY: "استفسار", PARENT_CHANNEL: "أولياء الأمور", GENERAL: "عامة" };
const KIND_TONE: Record<string, string> = { OFFICIAL: "badge-gold", INQUIRY: "badge-info", PARENT_CHANNEL: "badge-success", GENERAL: "badge-neutral" };

export default function MessagesPanel() {
  const { user } = useSession();
  const { add } = useToast();
  const sp = useSearchParams();
  const [list, setList] = useState<any[] | null>(null);
  const [kind, setKind] = useState("");
  const [activeId, setActiveId] = useState<string | null>(sp.get("c"));
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/conversations${kind ? `?kind=${kind}` : ""}`, { credentials: "include" });
    const d = await r.json();
    if (r.ok) setList(d.conversations); else add({ type: "error", message: d.message });
  }, [kind, add]);
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const canCompose = !!user && user.roleKey !== "GUEST";
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="card flex max-h-[640px] flex-col overflow-hidden lg:order-2">
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <div className="flex flex-wrap gap-1.5">
            {[["", "الكل"], ["OFFICIAL", "رسمية"], ["INQUIRY", "استفسارات"], ["PARENT_CHANNEL", "أولياء الأمور"]].map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${kind === k ? "border-navy bg-navy text-white" : "border-gray-200 text-gray-600 hover:border-navy/40"}`}>{l}</button>
            ))}
          </div>
          {canCompose && <button className="btn btn-primary btn-sm !px-2.5" onClick={() => setComposeOpen(true)} aria-label="رسالة جديدة"><MessageSquarePlus className="h-4 w-4" /></button>}
        </div>
        <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
          {!list && <li className="p-4"><div className="skeleton h-16" /></li>}
          {list?.length === 0 && <li><EmptyState title="لا مراسلات" description="ابدأ مراسلة جديدة." /></li>}
          {list?.map((c) => (
            <li key={c.id}>
              <button onClick={() => setActiveId(c.id)} className={`block w-full px-3.5 py-3 text-right transition ${activeId === c.id ? "bg-turquoise-soft/50" : "hover:bg-gray-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-navy">{c.title}</span>
                  {c.unread > 0 && <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[10.5px] font-bold text-white">{c.unread}</span>}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-gray-500">{c.last_sender}: {c.last_body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-gray-400">
                  <span className={`badge ${KIND_TONE[c.kind] ?? "badge-neutral"}`}>{KIND_LABEL[c.kind] ?? c.kind}</span>
                  {c.status === "CLOSED" && <span className="badge badge-neutral"><Lock className="h-2.5 w-2.5" /> مغلقة</span>}
                  {c.awaiting_my_reply && <span className="badge badge-warning">بانتظار ردك</span>}
                  <span>{c.school_name}</span><span>· {fmtDate(c.last_message_at ?? c.created_at)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="lg:order-1">
        {activeId ? <Thread id={activeId} onChanged={load} /> : <div className="card"><EmptyState title="اختر مراسلة" description="اختر مراسلة من القائمة لعرضها، أو ابدأ مراسلة جديدة." action={canCompose ? <button className="btn btn-primary btn-sm" onClick={() => setComposeOpen(true)}>رسالة جديدة</button> : undefined} /></div>}
      </section>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onSent={(id) => { setComposeOpen(false); setActiveId(id); void load(); }} />
    </div>
  );
}

function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { add } = useToast();
  const [d, setD] = useState<any>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/conversations/${id}`, { credentials: "include" });
    const j = await r.json();
    if (r.ok) { setD(j); onChanged(); } else add({ type: "error", message: j.message });
  }, [id, add, onChanged]);
  useEffect(() => { setD(null); void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [d?.messages?.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/conversations/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setText("");
      await load();
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  const toggle = async () => {
    const r = await fetch(`/api/conversations/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: d.conversation.status === "OPEN" ? "CLOSED" : "OPEN" }) });
    const j = await r.json();
    add({ type: r.ok ? "success" : "error", message: j.message });
    if (r.ok) void load();
  };

  if (!d) return <div className="skeleton h-96 rounded-2xl" />;
  const c = d.conversation;
  return (
    <div className="card flex max-h-[640px] min-h-[420px] flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-4">
        <div className="min-w-0">
          <h2 className="font-heading text-[17px] font-bold text-navy">{c.title}</h2>
          <p className="mt-0.5 text-[12px] text-gray-500">{c.school_name} · {d.participants.map((p: any) => `${p.name} (${p.role})`).join("، ")}</p>
        </div>
        {(c.created_by_id === d.meId) && <button className="btn btn-ghost btn-sm" onClick={toggle}>{c.status === "OPEN" ? <><Lock className="h-3.5 w-3.5" /> إغلاق</> : <><Unlock className="h-3.5 w-3.5" /> إعادة فتح</>}</button>}
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/50 p-4">
        {d.messages.map((m: any) => {
          const mine = m.sender_id === d.meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-xs ${mine ? "rounded-tr-sm bg-navy text-white" : "rounded-tl-sm border border-gray-200 bg-white text-gray-800"}`}>
                {!mine && <p className="mb-0.5 text-[11px] font-bold text-turquoise">{m.sender_name}</p>}
                <p className="whitespace-pre-line text-[13.5px] leading-[1.8]">{m.body}</p>
                <p className={`mt-1 flex items-center gap-1 text-[10.5px] ${mine ? "text-white/60" : "text-gray-400"}`}>
                  {fmtDate(m.created_at, true)}
                  {mine && (m.read_by.length ? <span className="flex items-center gap-0.5" title={`قرأها: ${m.read_by.join("، ")}`}><CheckCheck className="h-3 w-3 text-turquoise" /> قُرئت</span> : <span className="flex items-center gap-0.5"><Check className="h-3 w-3" /> أُرسلت</span>)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {c.status === "OPEN" ? (
        <footer className="flex items-end gap-2 border-t border-gray-100 p-3">
          <textarea className="input min-h-[44px] flex-1 resize-none" rows={2} placeholder="اكتب ردك…" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(); }} />
          <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={send} aria-label="إرسال">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl-flip" />}</button>
        </footer>
      ) : <p className="border-t border-gray-100 p-3 text-center text-[12.5px] text-gray-500">المراسلة مغلقة.</p>}
    </div>
  );
}

function ComposeModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (id: string) => void }) {
  const { user } = useSession();
  const { add } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [f, setF] = useState<any>({ recipientIds: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({ recipientIds: [] });
    fetch("/api/conversations/recipients", { credentials: "include" }).then((r) => r.json()).then((d) => {
      setSchools(d.schools ?? []);
      if (d.schools?.length === 1) setF((x: any) => ({ ...x, schoolId: d.schools[0].id }));
    }).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (!f.schoolId) { setRecipients([]); return; }
    fetch(`/api/conversations/recipients?schoolId=${f.schoolId}`, { credentials: "include" }).then((r) => r.json()).then((d) => {
      setRecipients(d.recipients ?? []);
      if (user?.roleKey === "TEACHER") setF((x: any) => ({ ...x, recipientIds: (d.recipients ?? []).filter((u: any) => u.roleKey === "SCHOOL_PRINCIPAL").map((u: any) => u.id) }));
    }).catch(() => {});
  }, [f.schoolId, user?.roleKey]);

  const toggle = (id: string) => setF((x: any) => ({ ...x, recipientIds: x.recipientIds.includes(id) ? x.recipientIds.filter((y: string) => y !== id) : [...x.recipientIds, id] }));
  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/conversations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      add({ type: "success", message: d.message });
      onSent(d.id);
    } catch (e: any) { add({ type: "error", message: e.message }); } finally { setBusy(false); }
  };
  const isParent = user?.roleKey === "PARENT";
  const adminRole = ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR"].includes(user?.roleKey ?? "");

  return (
    <Modal open={open} onClose={onClose} title="رسالة جديدة" description="المراسلات خاصة بين المشاركين فقط ومسجَّلة بحالة القراءة والرد" width="lg">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">المدرسة</label><select className="input" value={f.schoolId ?? ""} onChange={(e) => setF({ ...f, schoolId: e.target.value, recipientIds: [] })}><option value="">اختر…</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label">نوع المراسلة</label><select className="input" value={f.kind ?? ""} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">تلقائي</option>{adminRole && <option value="OFFICIAL">مراسلة رسمية</option>}<option value="INQUIRY">استفسار / رد</option><option value="PARENT_CHANNEL">قناة أولياء الأمور</option><option value="GENERAL">عام</option></select></div>
        </div>
        {f.schoolId && !isParent && (
          <div><label className="label">المستلمون {adminRole ? "(الافتراضي: مدير المدرسة ومنسق الجودة)" : "(الافتراضي: الإدارة التعليمية)"}</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
              {recipients.length === 0 && <p className="p-2 text-[12.5px] text-gray-400">لا مستلمين متاحين.</p>}
              {recipients.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-gray-50"><input type="checkbox" checked={f.recipientIds.includes(u.id)} onChange={() => toggle(u.id)} />{u.name}<span className="text-[11px] text-gray-400">— {u.role}</span></label>
              ))}
            </div>
          </div>
        )}
        {isParent && f.schoolId && <p className="rounded-xl bg-turquoise-soft/50 px-3 py-2 text-[12.5px] text-emerald-deep">ستصل رسالتك إلى إدارة المدرسة فقط.</p>}
        <div><label className="label">العنوان</label><input className="input" maxLength={200} value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">الرسالة</label><textarea className="input min-h-[110px]" maxLength={4000} value={f.body ?? ""} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><button className="btn btn-ghost btn-sm" onClick={onClose}>إلغاء</button><button className="btn btn-primary btn-sm" disabled={busy || !f.schoolId || (f.title ?? "").trim().length < 3 || !(f.body ?? "").trim()} onClick={submit}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} إرسال</button></div>
      </div>
    </Modal>
  );
}
