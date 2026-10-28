import { NextResponse, type NextRequest } from "next/server";
import jwt from "jsonwebtoken";

// يُقرأ من البيئة فقط؛ لا سرّ افتراضي داخل الكود.
const ACCESS_SECRET = process.env.JWT_SECRET ?? "";

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth",
  "/api/health",
  "/api/setup",
  "/_next",
  "/fonts",
  "/manifest.json",
  "/sw.js",
  "/favicon.ico",
];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/schools",
  "/visits",
  "/evaluations",
  "/evidence",
  "/reports",
  "/improvement",
  "/communication",
  "/users",
  "/settings",
  "/profile",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

  // صفحات الدخول والإعداد للمستخدمين غير المصادق عليهم
  if (!authenticated) {
    if (isProtected(pathname)) {
      const url = new URL("/login", request.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // مستخدم مصدق يحاول الدخول لصفحة تسجيل الدخول → لوحة التحكم
  if (pathname === "/login" || pathname === "/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  // وقت التشغيل Node.js ضروري حتى يُقرأ JWT_SECRET من البيئة عند التشغيل،
  // لا أن يُضمَّن قيمةً ثابتة وقت البناء (وهو ما يجعل الجلسات تفشل بعد النشر).
  runtime: "nodejs",
};
