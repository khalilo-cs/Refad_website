# ==========================================================
# منصة رِفاد — صورة إنتاج متعددة المراحل
# ----------------------------------------------------------
# تعتمد على مخرجات Next.js المستقلة (standalone) لتقليل حجم الصورة.
# تُبنى بالوحدة الأصلية better-sqlite3 داخل الحاوية نفسها.
# ==========================================================

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# أدوات بناء الوحدات الأصلية (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild better-sqlite3

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3
COPY . .
# متغيرات وقت البناء: قيم مؤقتة فقط — الأسرار الحقيقية تُمرَّر وقت التشغيل.
ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=build-time-placeholder-not-used-at-runtime-000000
RUN npx next build \
    && npx esbuild scripts/init-db.ts --bundle --platform=node --format=cjs \
         --outfile=scripts/init-db.bundle.js --external:better-sqlite3

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SQLITE_DIR=/app/data \
    DATABASE_FILE=rifad.db

RUN groupadd -r -g 1001 nodejs \
    && useradd -r -u 1001 -g nodejs nextjs \
    && mkdir -p /app/data \
    && chown -R nextjs:nodejs /app

# مخرجات البناء المستقلة (تتضمن node_modules المطلوبة فقط)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# مخطط قاعدة البيانات (يُقرأ من process.cwd()/prisma/schema.sql)
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.sql ./prisma/schema.sql

# سكربت البذر مُجمَّعاً إلى JavaScript (لا يحتاج TypeScript في صورة الإنتاج)
COPY --from=builder --chown=nextjs:nodejs /app/scripts/init-db.bundle.js ./scripts/init-db.js

# لا تنسخ ملف .env إلى الصورة مطلقاً.
RUN rm -f ./.env

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
