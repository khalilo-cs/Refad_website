/* ==========================================================
   منصة رِفاد — عامل الخدمة (Service Worker)

   سياسة التخزين المؤقت:
   - قشرة التطبيق (HTML/JS/CSS/الخطوط): cache-first مع تحديث خلفي.
   - طلبات GET لواجهات القراءة: network-first مع رجوع إلى النسخة المخزنة.
   - الكتابة (POST/PATCH/DELETE): تُمرَّر مباشرة للشبكة ولا تُخزَّن أبداً.
     المسودات تُحفظ في IndexedDB من داخل الصفحة، لا هنا.
   - أي طلب فاشل لصفحة: تُعرض صفحة /offline.
   ========================================================== */

const VERSION = "rifad-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL_ASSETS = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/brand/logo-mark.svg",
  "/logo.svg",
  "/favicon.svg",
  "/fonts/Amiri-Regular.ttf",
  "/fonts/Amiri-Bold.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // نضيف ما تيسّر — فشل عنصر واحد لا يُفشل التثبيت
      await Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // لا نتدخل في غير GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // لا نتدخل في مسارات المصادقة أو التحقق أو التصدير
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/verify") ||
    url.pathname.startsWith("/api/setup") ||
    url.pathname.includes("/export")
  ) {
    return;
  }

  // واجهات القراءة: شبكة أولاً ثم ذاكرة مؤقتة
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ message: "لا يوجد اتصال بالشبكة وهذه البيانات غير محفوظة محلياً." }),
            { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } }
          );
        }
      })()
    );
    return;
  }

  // الملاحة بين الصفحات: شبكة أولاً ثم صفحة عدم الاتصال
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match("/offline")) || Response.error();
        }
      })()
    );
    return;
  }

  // الأصول الثابتة: أولاً من الذاكرة ثم الشبكة
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (url.origin === self.location.origin)) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return Response.error();
      }
    })()
  );
});
