import { NextResponse, type NextRequest } from "next/server";
import jwt from "jsonwebtoken";

// يُقرأ من البيئة فقط؛ لا سرّ افتراضي داخل الكود.
const ACCESS_SECRET = process.env.JWT_SECRET ?? "";

/** مسارات متاحة بلا جلسة. كل ما عداها يتطلب تسجيل الدخول. */
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/verify",
  "/about",
  "/offline",
  "/api/auth",
  "/api/health",
  "/api/setup",
  "/api/verify",
  "/_next",
  "/fonts",
  "/brand",
  "/icons",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
  "/favicon.svg",
  "/icon.svg",
  "/icon.png",
  "/logo.svg",
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** رابط الدليل المؤقت الموقَّع: يُقبل بلا جلسة (التحقق من التوقيع والانتهاء يتم في المسار نفسه). */
function isSignedEvidenceLink(request: NextRequest): boolean {
  return /^\/api\/evidence\/[^/]+\/file$/.test(request.nextUrl.pathname) && !!request.nextUrl.searchParams.get("token");
}

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function json(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // حماية CSRF: الطلبات المغيِّرة يجب أن تأتي من نفس المضيف.
  if (isApi && !SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === host;
      } catch {
        ok = false;
      }
      if (!ok) return json(403, "مصدر الطلب غير مسموح");
    } else if (request.headers.get("sec-fetch-site") === "cross-site") {
      return json(403, "مصدر الطلب غير مسموح");
    }
  }

  const token = request.cookies.get("access_token")?.value;
  let payload: { userId?: string } | null = null;
  if (token) {
    try {
      payload = jwt.verify(token, ACCESS_SECRET, {
        issuer: "rifad",
        audience: "rifad-app",
      }) as { userId?: string };
    } catch {
      payload = null;
    }
  }
  const authenticated = !!payload?.userId;
  // رمز التجديد وحده يكفي لعدم الطرد؛ الصفحة تجدد الجلسة من الخادم.
  const hasRefresh = !!request.cookies.get("refresh_token")?.value;

  if (!authenticated && !hasRefresh && !isPublic(pathname) && !isSignedEvidenceLink(request)) {
    if (isApi) return json(401, "يجب تسجيل الدخول");
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (authenticated && (pathname === "/login" || pathname === "/setup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const res = NextResponse.next();
  if (isApi) res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  // وقت التشغيل Node.js ضروري حتى يُقرأ JWT_SECRET من البيئة عند التشغيل،
  // لا أن يُضمَّن قيمةً ثابتة وقت البناء (وهو ما يجعل الجلسات تفشل بعد النشر).
  runtime: "nodejs",
};
