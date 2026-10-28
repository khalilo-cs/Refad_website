#!/usr/bin/env bash
# ==========================================================
# منصة رِفاد — نسخة احتياطية آمنة لقاعدة بيانات SQLite
# ----------------------------------------------------------
# ⚠️ مهم: نسخ ملف dev.db وحده غير كافٍ لأن SQLite يعمل بوضع WAL،
#    وقد تكون معظم البيانات في ملف dev.db-wal. هذا السكربت يستخدم
#    VACUUM INTO لإنتاج نسخة متسقة كاملة.
#
# الاستخدام:
#   ./scripts/backup-db.sh [مجلد-الوجهة]
#   ./scripts/backup-db.sh /var/backups/rifad
#
# الجدولة اليومية (crontab -e):
#   0 2 * * * /opt/rifad/scripts/backup-db.sh /var/backups/rifad
# ==========================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="${SQLITE_DIR:-$SCRIPT_DIR/..}"
DB_FILE="${DATABASE_FILE:-dev.db}"
SRC="$DB_DIR/$DB_FILE"
DEST_DIR="${1:-$SCRIPT_DIR/../backups}"

if [[ ! -f "$SRC" ]]; then
  echo "خطأ: قاعدة البيانات غير موجودة: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST_DIR/rifad-$STAMP.db"

node -e "
const Database = require('better-sqlite3');
const db = new Database(process.argv[1], { readonly: true });
db.exec(\"VACUUM INTO '\" + process.argv[2].replace(/'/g, \"''\") + \"'\");
db.close();
console.log('نسخة متسقة: ' + process.argv[2]);
" "$SRC" "$OUT"

gzip -f "$OUT"
echo "تم إنشاء النسخة الاحتياطية: $OUT.gz"

# الاحتفاظ بآخر 30 نسخة فقط
ls -1t "$DEST_DIR"/rifad-*.db.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "عدد النسخ المحفوظة: $(ls -1 "$DEST_DIR"/rifad-*.db.gz 2>/dev/null | wc -l)"
