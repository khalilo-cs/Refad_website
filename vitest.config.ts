import { defineConfig } from "vitest/config";
import path from "node:path";
import crypto from "node:crypto";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // أسرار اختبار عشوائية تُولَّد لحظة التشغيل — لا توجد قيمة ثابتة في المستودع،
    // وبذلك تبقى سياسة رفض الأسرار النائبة فعّالة داخل الاختبارات أيضاً.
    env: {
      JWT_SECRET: crypto.randomBytes(32).toString("hex"),
      JWT_REFRESH_SECRET: crypto.randomBytes(32).toString("hex"),
      NODE_ENV: "test",
    },
  },
});
