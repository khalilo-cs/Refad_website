#!/usr/bin/env bash
# استعادة نسخة احتياطية: ./scripts/restore-db.sh <rifad-XXXX.db.gz> [rifad-uploads-XXXX.tar.gz]
# أوقف التطبيق قبل التشغيل. تُحفظ النسخة الحالية بلاحقة .before-restore.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="${SQLITE_DIR:-$SCRIPT_DIR/..}"
DB_FILE="${DATABASE_FILE:-dev.db}"
TARGET="$DB_DIR/$DB_FILE"
[[ $# -ge 1 && -f "$1" ]] || { echo "الاستخدام: $0 <db.gz> [uploads.tar.gz]" >&2; exit 1; }
if [[ -f "$TARGET" ]]; then cp "$TARGET" "$TARGET.before-restore"; fi
rm -f "$TARGET-wal" "$TARGET-shm"
gunzip -c "$1" > "$TARGET"
node -e "const D=require('better-sqlite3');const d=new D(process.argv[1],{readonly:true});const r=d.pragma('integrity_check',{simple:true});console.log('integrity_check: '+r);process.exit(r==='ok'?0:1)" "$TARGET"
if [[ $# -ge 2 && -f "$2" ]]; then
  mkdir -p "$DB_DIR/data"
  tar -xzf "$2" -C "$DB_DIR/data"
  echo "تمت استعادة الأدلة."
fi
echo "تمت الاستعادة."
