"use client";

import { useEffect } from "react";

/**
 * يسجّل عامل الخدمة بعد تحميل الصفحة.
 * لا يُسجَّل في بيئة التطوير إلا عند طلب ذلك صراحة،
 * حتى لا يعترض التخزين المؤقت تحديثات المطوّر.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "1") {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* التسجيل غير الحرج — لا نُزعج المستخدم */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
