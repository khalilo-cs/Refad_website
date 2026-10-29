/**
 * ترحيلات قاعدة البيانات المرتّبة.
 * كل ترحيل يُنفَّذ مرة واحدة فقط ويُسجَّل في جدول schema_migrations،
 * وتُطبَّق تلقائياً عند أول اتصال بقاعدة بيانات مهيّأة.
 * لإضافة تغيير جديد: أضف عنصراً جديداً في نهاية المصفوفة ولا تعدّل ما سبق.
 */
import type Database from "better-sqlite3";

export type Migration = { id: number; name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "evaluation-history-evidence-private-storage-security",
    sql: `
      -- التقييم: وسائل التحقق المستخدمة، ومن أنشأ التقييم
      ALTER TABLE evaluations ADD COLUMN verification_methods TEXT;
      ALTER TABLE evaluations ADD COLUMN created_by_id TEXT REFERENCES users(id);
      ALTER TABLE evaluations ADD COLUMN created_at TEXT;
      UPDATE evaluations SET created_at = COALESCE(rated_at, updated_at) WHERE created_at IS NULL;

      -- سجل تعديلات التقييم: سبب التعديل وربطه بالزيارة والمؤشر
      ALTER TABLE evaluation_history ADD COLUMN reason TEXT;
      ALTER TABLE evaluation_history ADD COLUMN visit_id TEXT;
      ALTER TABLE evaluation_history ADD COLUMN indicator_id TEXT;

      -- الزيارة: تاريخ التقديم للمراجعة
      ALTER TABLE visits ADD COLUMN submitted_at TEXT;
      ALTER TABLE visits ADD COLUMN submitted_by_id TEXT REFERENCES users(id);
      ALTER TABLE visits ADD COLUMN strengths TEXT;
      ALTER TABLE visits ADD COLUMN gaps TEXT;

      -- الأدلة: ربط بالمؤشر والمعيار، نوع المستند، تقييم الصلاحية، الصلاحيات
      ALTER TABLE evidence ADD COLUMN indicator_id TEXT REFERENCES indicators(id) ON DELETE SET NULL;
      ALTER TABLE evidence ADD COLUMN document_type TEXT;
      ALTER TABLE evidence ADD COLUMN description TEXT;
      ALTER TABLE evidence ADD COLUMN sha256 TEXT;
      ALTER TABLE evidence ADD COLUMN validity TEXT;
      ALTER TABLE evidence ADD COLUMN plan_id TEXT;
      ALTER TABLE evidence ADD COLUMN report_id TEXT;
      ALTER TABLE evidence ADD COLUMN visibility TEXT NOT NULL DEFAULT 'SCHOOL';
      ALTER TABLE evidence ADD COLUMN can_download INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_evidence_indicator ON evidence(indicator_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_subcriterion ON evidence(sub_criterion_id);

      CREATE TABLE IF NOT EXISTS evidence_versions (
        id TEXT PRIMARY KEY,
        evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        storage_key TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT,
        uploaded_by_id TEXT REFERENCES users(id),
        change_note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (evidence_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_versions_ev ON evidence_versions(evidence_id);

      -- الحسابات: قفل مؤقت بدل القفل الدائم
      ALTER TABLE users ADD COLUMN locked_until TEXT;
      ALTER TABLE users ADD COLUMN password_changed_at TEXT;
      ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

      -- محاولات الدخول (تحديد المعدل والتدقيق)
      CREATE TABLE IF NOT EXISTS login_attempts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        ip TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at);

      -- الحوادث الأمنية
      CREATE TABLE IF NOT EXISTS security_incidents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'MEDIUM',
        status TEXT NOT NULL DEFAULT 'OPEN',
        related_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        reported_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        resolution TEXT,
        resolved_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_incidents_status ON security_incidents(status);

      -- سجل التدقيق غير قابل للتعديل أو الحذف من أي مستخدم
      CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_logs
      WHEN NOT (NEW.user_id IS NULL AND NEW.action = OLD.action AND NEW.entity_type = OLD.entity_type
                AND IFNULL(NEW.entity_id,'') = IFNULL(OLD.entity_id,'')
                AND IFNULL(NEW.old_values,'') = IFNULL(OLD.old_values,'')
                AND IFNULL(NEW.new_values,'') = IFNULL(OLD.new_values,'')
                AND NEW.created_at = OLD.created_at)
      BEGIN SELECT RAISE(ABORT, 'سجل التدقيق غير قابل للتعديل'); END;
      CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'سجل التدقيق غير قابل للحذف'); END;
      CREATE TRIGGER IF NOT EXISTS trg_evalhist_no_update BEFORE UPDATE ON evaluation_history
      BEGIN SELECT RAISE(ABORT, 'سجل تعديلات التقييم غير قابل للتعديل'); END;
    `,
  },
  {
    id: 2,
    name: "school-profiles-assignments-meetings",
    sql: `
      -- ملف المدرسة التفصيلي: الكوادر والفصول والمرافق (يُدخل ويُتحقق منه يدوياً)
      CREATE TABLE IF NOT EXISTS school_profiles (
        school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
        students_count INTEGER,
        teachers_count INTEGER,
        admin_staff_count INTEGER,
        service_staff_count INTEGER,
        classes_count INTEGER,
        has_science_lab INTEGER,
        has_computer_lab INTEGER,
        has_library INTEGER,
        has_resource_room INTEGER,
        has_canteen INTEGER,
        has_clinic INTEGER,
        has_playground INTEGER,
        has_power INTEGER,
        has_water INTEGER,
        sanitation_units INTEGER,
        special_needs_access INTEGER,
        facilities_notes TEXT,
        info_source TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        verified_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        verified_at TEXT,
        updated_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- إسناد المدارس للمفتشين
      CREATE TABLE IF NOT EXISTS school_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        assigned_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, school_id)
      );
      CREATE INDEX IF NOT EXISTS idx_assign_user ON school_assignments(user_id);
      CREATE INDEX IF NOT EXISTS idx_assign_school ON school_assignments(school_id);

      -- ربط أدلة بإجراء تصحيحي لإثبات الإنجاز
      ALTER TABLE evidence ADD COLUMN action_id TEXT REFERENCES corrective_actions(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_evidence_action ON evidence(action_id);

      -- سجل الاجتماعات والمتابعات
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        meeting_date TEXT NOT NULL,
        attendees TEXT,
        minutes TEXT,
        decisions TEXT,
        follow_up TEXT,
        created_by_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_meetings_school ON meetings(school_id);

      -- مواد تعليمية مشتركة
      CREATE TABLE IF NOT EXISTS shared_materials (
        id TEXT PRIMARY KEY,
        school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
        created_by_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- قراءة الإعلانات
      CREATE TABLE IF NOT EXISTS announcement_reads (
        announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (announcement_id, user_id)
      );
    `,
  },
  {
    id: 3,
    name: "reports-content-snapshots",
    sql: `
      -- لقطة محتوى التقرير تُثبَّت عند الإنشاء فلا يتغير التقرير المعتمد لاحقاً
      ALTER TABLE reports ADD COLUMN content TEXT;
      ALTER TABLE reports ADD COLUMN visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL;
      ALTER TABLE reports ADD COLUMN params TEXT;
      ALTER TABLE reports ADD COLUMN submitted_at TEXT;
      ALTER TABLE reports ADD COLUMN submitted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_reports_visit ON reports(visit_id);
      CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
    `,
  },
  {
    id: 4,
    name: "evidence-library",
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_library_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        indicator_codes TEXT NOT NULL DEFAULT '[]',
        document_type TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      ALTER TABLE evidence ADD COLUMN library_item_id TEXT REFERENCES evidence_library_items(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_evidence_library_item ON evidence(library_item_id);
    `,
  },
  {
    id: 5,
    name: "communication-center",
    sql: `
      ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'GENERAL';
      ALTER TABLE conversations ADD COLUMN created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN';
      ALTER TABLE conversations ADD COLUMN last_message_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_conversations_kind ON conversations(kind);
      ALTER TABLE shared_materials ADD COLUMN audience TEXT NOT NULL DEFAULT 'SCHOOL';
    `,
  },
];

/** يطبّق الترحيلات المعلّقة. لا يفعل شيئاً إن لم تُهيَّأ قاعدة البيانات بعد. */
export function runMigrations(db: Database.Database): number {
  const hasUsers = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsers) return 0;

  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id)
  );
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const tx = db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(m.id, m.name);
    });
    tx();
    count++;
  }
  return count;
}
