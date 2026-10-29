import type { NextConfig } from "next";

const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // بناء مستقل للخوادم وDocker؛ على Vercel تتولى المنصة التجميع.
  ...(isVercel ? {} : { output: "standalone" as const }),

  // وحدات أصلية/خادمية لا تُجمَّع داخل الحزمة.
  serverExternalPackages: ["better-sqlite3", "@libsql/client"],

  // خطوط التقرير العربي والشعارات تُقرأ من القرص عند توليد PDF؛
  // يجب تضمينها في دوال الخادم على الاستضافات بلا خادم.
  outputFileTracingIncludes: {
    "/api/reports/**": ["./public/fonts/Amiri-Regular.ttf", "./public/fonts/Amiri-Bold.ttf", "./public/brand/*.png"],
  },

  // إخفاء ترويسة الإصدار.
  poweredByHeader: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // ترويسات أمان تُطبَّق على كل المسارات.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
              "font-src 'self' data:",
              "connect-src 'self'",
              "worker-src 'self'",
              "manifest-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
