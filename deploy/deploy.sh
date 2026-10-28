#!/usr/bin/env bash
# ==========================================================
# منصة رِفاد — سكربت التحديث والنشر
# ----------------------------------------------------------
# يجلب آخر نسخة من الفرع، يعيد البناء، ثم يعيد تشغيل الخدمة.
#
# على الخادم (بعد التركيب الأول):
#   cd /opt/rifad && ./deploy/deploy.sh
# ==========================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

echo "==> المجلد: $APP_DIR"
echo "==> الفرع: $BRANCH"

if [[ ! -f .env ]]; then
  echo "خطأ: ملف .env غير موجود. انسخ .env.example إلى .env واضبط القيم." >&2
  exit 1
fi

echo "==> نسخة احتياطية احترازية لقاعدة البيانات"
./scripts/backup-db.sh ./backups || echo "تنبيه: تعذّرت النسخة الاحتياطية — يُستحسن التحقق يدوياً"

echo "==> جلب آخر التحديثات"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> تثبيت الاعتماديات"
if [[ -f package-lock.json ]]; then
  npm ci --ignore-scripts
  npm rebuild better-sqlite3
else
  npm install --ignore-scripts
  npm rebuild better-sqlite3
fi

echo "==> بناء الإنتاج"
npm run build

echo "==> إعادة تشغيل الخدمة"
if command -v systemctl >/dev/null && systemctl list-unit-files | grep -q '^rifad.service'; then
  sudo systemctl restart rifad
  sudo systemctl --no-pager status rifad | head -12
elif command -v docker >/dev/null && [[ -f docker-compose.yml ]]; then
  docker compose up -d --build
  docker compose ps
else
  echo "لم أجد خدمة systemd ولا Docker. شغّل يدوياً: node server.js"
fi

echo "==> اكتمل النشر"
