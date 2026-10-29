"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, GraduationCap, Megaphone, MessageSquare, School, UserRound } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { Rise, ScoreRing, Stagger } from "@/components/ui/extra";
import { fmtDate } from "@/lib/labels";

/** الرئيسية لأدوار ولي الأمر والمعلم والزائر: لا تعرض سوى ما صُرّح به لهذا المستخدم. */
export default function RoleHome({ user }: { user: { name: string; roleKey: string; role: string } }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/me/home", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  const isParent = user.roleKey === "PARENT";
  return (
    <div className="space-y-6">
      <PageHeader icon={UserRound} title={`أهلاً ${user.name}`} subtitle={`${user.role}${data?.school ? " — " + data.school.name : ""}`} />
      <Stagger className="space-y-6">
        {isParent && (
          <Rise>
            <section>
              <h2 className="mb-3 font-heading text-lg font-bold text-navy">أبنائي</h2>
              {!data ? <div className="skeleton h-32 rounded-2xl" /> : data.children.length === 0 ? (
                <div className="card"><EmptyState icon={GraduationCap} title="لا أبناء مرتبطون بحسابك" description="تتولى إدارة المدرسة ربط حسابك بأبنائك. تواصل معها لإتمام الربط." /></div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.children.map((c: any) => {
                    const attendance = c.attendance_days ? Math.round(((c.attendance_days - c.absences) / c.attendance_days) * 100) : null;
                    return (
                      <div key={c.id} className="card card-elevated p-5">
                        <div className="flex items-center gap-4">
                          <ScoreRing value={attendance} size={72} stroke={7} label="الحضور" />
                          <div className="min-w-0">
                            <p className="font-heading text-[17px] font-bold text-navy">{c.name}</p>
                            <p className="text-[12.5px] text-gray-600">{c.grade}{c.section ? ` — شعبة ${c.section}` : ""}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-gray-400"><School className="h-3.5 w-3.5" />{c.school_name}</p>
                          </div>
                        </div>
                        {c.results.length > 0 ? (
                          <table className="mt-4 w-full text-[12.5px]">
                            <thead><tr className="text-gray-500"><th className="py-1 text-right font-medium">المادة</th><th className="py-1 text-right font-medium">الفصل</th><th className="py-1 text-left font-medium">الدرجة</th></tr></thead>
                            <tbody>{c.results.map((r: any, i: number) => <tr key={i} className="border-t border-gray-100"><td className="py-1.5">{r.subject}</td><td>{r.term}</td><td className="text-left font-mono font-semibold">{r.score}/{r.max_score}</td></tr>)}</tbody>
                          </table>
                        ) : <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-500">لم تُدخل المدرسة نتائج دراسية بعد.</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </Rise>
        )}

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
            {user.roleKey !== "GUEST" && <QuickLink href="/communication" icon={MessageSquare} title="التواصل" desc={isParent ? "راسل إدارة المدرسة" : "الملاحظات والتغذية الراجعة"} />}
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
