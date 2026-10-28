import { Suspense } from "react";
import VerifyClient from "./verify-client";

export const metadata = {
  title: "التحقق من تقرير — منصة رِفاد",
  description: "تحقّق من صحة تقرير صادر عن منصة رِفاد برمز التحقق المطبوع عليه.",
};

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyClient />
    </Suspense>
  );
}

function VerifyFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-warm-white">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise border-t-transparent" />
        <span className="text-sm">جارٍ التحميل…</span>
      </div>
    </div>
  );
}
