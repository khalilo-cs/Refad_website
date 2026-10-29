"use client";

import { Suspense, useState } from "react";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/ui/extra";
import { useSession } from "@/components/providers";
import MessagesPanel from "@/components/communication/messages-panel";
import AnnouncementsPanel from "@/components/communication/announcements-panel";
import MeetingsPanel from "@/components/communication/meetings-panel";
import MaterialsPanel from "@/components/communication/materials-panel";

type Tab = "messages" | "announcements" | "meetings" | "materials";

export default function CommunicationPage() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><Inner /></Suspense>;
}

function Inner() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("messages");
  const staff = !!user && ["SUPER_ADMIN", "EDUCATION_DIRECTOR", "INSPECTOR", "SCHOOL_PRINCIPAL", "QUALITY_COORDINATOR"].includes(user.roleKey);
  const tabs: { key: Tab; label: string }[] = [
    { key: "messages", label: "المراسلات" },
    { key: "announcements", label: "الإعلانات والتعميمات" },
    ...(staff ? [{ key: "meetings" as Tab, label: "الاجتماعات والمتابعات" }] : []),
    { key: "materials", label: "المواد التعليمية" },
  ];
  return (
    <div className="space-y-5">
      <PageHeader icon={Mail} title="مركز التواصل" subtitle="مراسلات رسمية وقناة آمنة مع أولياء الأمور، إعلانات وتعاميم، سجل اجتماعات، ومواد تعليمية مشتركة — لكل مدرسة مساحة خاصة." />
      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
      {tab === "messages" && <MessagesPanel />}
      {tab === "announcements" && <AnnouncementsPanel />}
      {tab === "meetings" && staff && <MeetingsPanel />}
      {tab === "materials" && <MaterialsPanel />}
    </div>
  );
}
