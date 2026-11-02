"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, Megaphone, MessageSquare, UserRound } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { Rise, Stagger } from "@/components/ui/extra";
import { fmtDate } from "@/lib/labels";

/** الرئيسية لأدوار المعلم والزائر: لا تعرض سوى ما صُرّح به لهذا المستخدم. */
export default function RoleHome({ user }: { user: { name: string; roleKey: string; role: string } }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/me/home", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader icon={UserRound} title={`أهلاً ${user.name}`} subtitle={`${user.role}${data?.school ? " — " + data.school.name : ""}`} />
      <Stagger className="space-y-6">
        {user.roleKey === "TEACHER" && data?.myEvidence && (
          <Rise>
            <div className="grid gap-4 sm:grid-cols-3">
              {[["ملفاتي المرفوعة", data.myEvidence.total, "text-navy"], ["مقبولة", data.myEvidence.accepted, "text-success"], ["بانتظار المراجعة", data.myEvidence.pending, "text-warning"]].map(([l, v, c]: any) => (
                <div key={l} className="card p-5"><p className="text-[12px] text-gray-600">{l}</p><p className={`mt-2 font-heading text-3xl font-bold ${c}`}>{v}</p></div>
              ))}
            </div>
          </Rise>
        )}

        <Rise>
          <div className="grid gap-4 md:grid-cols-3">
            {user.roleKey === "TEACHER" && <QuickLink href="/evidence" icon={FileText} title="ملفات الإنجاز" desc="ارفع ملف إنجازك وتابع مراجعته" />}
            {user.roleKey !== "GUEST" && <QuickLink href="/communication" icon={MessageSquare} title="التواصل" desc="الملاحظات والتغذية الراجعة" />}
            <QuickLink href="/settings" icon={BookOpen} title="حسابي" desc="بياناتك وكلمة المرور" />
          </div>
        </Rise>

        <Rise>
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-bold text-navy"><Megaphone className="h-4 w-4 text-gold" /> الإعلانات والتعميمات</h2>
            {!data ? <div className="skeleton h-20" /> : data.announcements.length === 0 ? <EmptyState title="لا إعلانات حالياً" /> : (
              <ul className="divide-y divide-gray-100">
                {data.announcements.map((a: any) => (
                  <li key={a.id} className="py-3"><p className="font-semibold text-navy">{a.title}</p><p className="mt-1 text-[13px] leading-relaxed text-gray-600">{a.content}</p><p className="mt-1 text-[11px] text-gray-400">{fmtDate(a.published_at)}</p></li>
                ))}
              </ul>
            )}
          </section>
        </Rise>
      </Stagger>
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, desc }: { href: string; icon: any; title: string; desc: string }) {
  return (
    <Link href={href} className="card card-elevated flex items-center gap-4 p-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-gold-bright"><Icon className="h-6 w-6" /></span>
      <div><p className="font-heading font-bold text-navy">{title}</p><p className="text-[12.5px] text-gray-600">{desc}</p></div>
    </Link>
  );
}
