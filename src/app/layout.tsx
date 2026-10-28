import type { Metadata } from "next";
import { SessionProvider, ToastProvider } from "@/components/providers";
import ServiceWorkerRegister from "@/components/pwa/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "منصة رِفاد للمتابعة والجودة المدرسية — مديرية الجراحي، محافظة الحديدة",
  description:
    "نظام إلكتروني متكامل لمتابعة وتقييم جودة المدارس وفق استمارة التقييم الذاتي للمدارس الصادرة عن مجلس الاعتماد الأكاديمي وضمان جودة التعليم، الجمهورية اليمنية.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  manifest: "/manifest.webmanifest",
  applicationName: "منصة رِفاد",
  appleWebApp: {
    capable: true,
    title: "رِفاد",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  alternates: { canonical: "/" },
  openGraph: {
    locale: "ar_YE",
    type: "website",
    siteName: "منصة رِفاد",
    title: "منصة رِفاد للمتابعة والجودة المدرسية",
    description: "منصة متقدمة لإدارة ومتابعة وتقييم جودة المدارس في مديرية الجراحي بمحافظة الحديدة.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <head>
        <meta name="theme-color" content="#0B2545" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
