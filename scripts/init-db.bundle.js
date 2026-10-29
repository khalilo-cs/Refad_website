"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/db/migrations.ts
async function runMigrations(db) {
  const hasUsers = await db.all("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'");
  if (!hasUsers.length) return 0;
  await db.script(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  const applied = new Set((await db.all("SELECT id FROM schema_migrations")).map((r) => Number(r.id)));
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.inTransaction(async () => {
      await db.script(m.sql);
      await db.script(`INSERT INTO schema_migrations (id, name) VALUES (${m.id}, '${m.name.replace(/'/g, "''")}')`);
    });
    count++;
  }
  return count;
}
var MIGRATIONS;
var init_migrations = __esm({
  "src/lib/db/migrations.ts"() {
    "use strict";
    MIGRATIONS = [
      {
        id: 1,
        name: "evaluation-history-evidence-private-storage-security",
        sql: `
      -- \u0627\u0644\u062A\u0642\u064A\u064A\u0645: \u0648\u0633\u0627\u0626\u0644 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0629\u060C \u0648\u0645\u0646 \u0623\u0646\u0634\u0623 \u0627\u0644\u062A\u0642\u064A\u064A\u0645
      ALTER TABLE evaluations ADD COLUMN verification_methods TEXT;
      ALTER TABLE evaluations ADD COLUMN created_by_id TEXT REFERENCES users(id);
      ALTER TABLE evaluations ADD COLUMN created_at TEXT;
      UPDATE evaluations SET created_at = COALESCE(rated_at, updated_at) WHERE created_at IS NULL;

      -- \u0633\u062C\u0644 \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645: \u0633\u0628\u0628 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0648\u0631\u0628\u0637\u0647 \u0628\u0627\u0644\u0632\u064A\u0627\u0631\u0629 \u0648\u0627\u0644\u0645\u0624\u0634\u0631
      ALTER TABLE evaluation_history ADD COLUMN reason TEXT;
      ALTER TABLE evaluation_history ADD COLUMN visit_id TEXT;
      ALTER TABLE evaluation_history ADD COLUMN indicator_id TEXT;

      -- \u0627\u0644\u0632\u064A\u0627\u0631\u0629: \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062A\u0642\u062F\u064A\u0645 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629
      ALTER TABLE visits ADD COLUMN submitted_at TEXT;
      ALTER TABLE visits ADD COLUMN submitted_by_id TEXT REFERENCES users(id);
      ALTER TABLE visits ADD COLUMN strengths TEXT;
      ALTER TABLE visits ADD COLUMN gaps TEXT;

      -- \u0627\u0644\u0623\u062F\u0644\u0629: \u0631\u0628\u0637 \u0628\u0627\u0644\u0645\u0624\u0634\u0631 \u0648\u0627\u0644\u0645\u0639\u064A\u0627\u0631\u060C \u0646\u0648\u0639 \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u060C \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629\u060C \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A
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

      -- \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A: \u0642\u0641\u0644 \u0645\u0624\u0642\u062A \u0628\u062F\u0644 \u0627\u0644\u0642\u0641\u0644 \u0627\u0644\u062F\u0627\u0626\u0645
      ALTER TABLE users ADD COLUMN locked_until TEXT;
      ALTER TABLE users ADD COLUMN password_changed_at TEXT;
      ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

      -- \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 (\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0639\u062F\u0644 \u0648\u0627\u0644\u062A\u062F\u0642\u064A\u0642)
      CREATE TABLE IF NOT EXISTS login_attempts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        ip TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);
      CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at);

      -- \u0627\u0644\u062D\u0648\u0627\u062F\u062B \u0627\u0644\u0623\u0645\u0646\u064A\u0629
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

      -- \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0639\u062F\u064A\u0644 \u0623\u0648 \u0627\u0644\u062D\u0630\u0641 \u0645\u0646 \u0623\u064A \u0645\u0633\u062A\u062E\u062F\u0645
      CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_logs
      WHEN NOT (NEW.user_id IS NULL AND NEW.action = OLD.action AND NEW.entity_type = OLD.entity_type
                AND IFNULL(NEW.entity_id,'') = IFNULL(OLD.entity_id,'')
                AND IFNULL(NEW.old_values,'') = IFNULL(OLD.old_values,'')
                AND IFNULL(NEW.new_values,'') = IFNULL(OLD.new_values,'')
                AND NEW.created_at = OLD.created_at)
      BEGIN SELECT RAISE(ABORT, '\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0639\u062F\u064A\u0644'); END;
      CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_logs
      BEGIN SELECT RAISE(ABORT, '\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062D\u0630\u0641'); END;
      CREATE TRIGGER IF NOT EXISTS trg_evalhist_no_update BEFORE UPDATE ON evaluation_history
      BEGIN SELECT RAISE(ABORT, '\u0633\u062C\u0644 \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0639\u062F\u064A\u0644'); END;
    `
      },
      {
        id: 2,
        name: "school-profiles-assignments-meetings",
        sql: `
      -- \u0645\u0644\u0641 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A: \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0648\u0627\u0644\u0641\u0635\u0648\u0644 \u0648\u0627\u0644\u0645\u0631\u0627\u0641\u0642 (\u064A\u064F\u062F\u062E\u0644 \u0648\u064A\u064F\u062A\u062D\u0642\u0642 \u0645\u0646\u0647 \u064A\u062F\u0648\u064A\u0627\u064B)
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

      -- \u0625\u0633\u0646\u0627\u062F \u0627\u0644\u0645\u062F\u0627\u0631\u0633 \u0644\u0644\u0645\u0641\u062A\u0634\u064A\u0646
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

      -- \u0631\u0628\u0637 \u0623\u062F\u0644\u0629 \u0628\u0625\u062C\u0631\u0627\u0621 \u062A\u0635\u062D\u064A\u062D\u064A \u0644\u0625\u062B\u0628\u0627\u062A \u0627\u0644\u0625\u0646\u062C\u0627\u0632
      ALTER TABLE evidence ADD COLUMN action_id TEXT REFERENCES corrective_actions(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_evidence_action ON evidence(action_id);

      -- \u0633\u062C\u0644 \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u0627\u062A \u0648\u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0627\u062A
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

      -- \u0645\u0648\u0627\u062F \u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0645\u0634\u062A\u0631\u0643\u0629
      CREATE TABLE IF NOT EXISTS shared_materials (
        id TEXT PRIMARY KEY,
        school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
        created_by_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A
      CREATE TABLE IF NOT EXISTS announcement_reads (
        announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (announcement_id, user_id)
      );
    `
      },
      {
        id: 3,
        name: "reports-content-snapshots",
        sql: `
      -- \u0644\u0642\u0637\u0629 \u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u062A\u064F\u062B\u0628\u064E\u0651\u062A \u0639\u0646\u062F \u0627\u0644\u0625\u0646\u0634\u0627\u0621 \u0641\u0644\u0627 \u064A\u062A\u063A\u064A\u0631 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0644\u0627\u062D\u0642\u0627\u064B
      ALTER TABLE reports ADD COLUMN content TEXT;
      ALTER TABLE reports ADD COLUMN visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL;
      ALTER TABLE reports ADD COLUMN params TEXT;
      ALTER TABLE reports ADD COLUMN submitted_at TEXT;
      ALTER TABLE reports ADD COLUMN submitted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_reports_visit ON reports(visit_id);
      CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
    `
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
    `
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
    `
      },
      {
        id: 6,
        name: "two-factor-replay-protection",
        sql: `
      ALTER TABLE users ADD COLUMN two_factor_last_step INTEGER;
    `
      },
      {
        id: 7,
        name: "rename-platform-itqan",
        sql: `
      UPDATE settings SET value = replace(replace(value, '\u0645\u0646\u0635\u0629 \u0631\u0650\u0641\u0627\u062F \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u0648\u0627\u0644\u062C\u0648\u062F\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629', '\u0645\u0646\u0635\u0629 \u0625\u062A\u0642\u0627\u0646 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0645\u062F\u0631\u0633\u064A \u0648\u0636\u0645\u0627\u0646 \u062C\u0648\u062F\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645'), '\u0631\u0650\u0641\u0627\u062F', '\u0625\u062A\u0642\u0627\u0646')
      WHERE key IN ('system.name', 'system.institution') AND value LIKE '%\u0631\u0650\u0641\u0627\u062F%';
      UPDATE schools SET name = replace(name, '\u0645\u062F\u0631\u0633\u0629 \u0631\u0650\u0641\u0627\u062F \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629', '\u0645\u062F\u0631\u0633\u0629 \u0625\u062A\u0642\u0627\u0646 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629') WHERE code LIKE 'RIFAD-DEMO-%';
    `
      }
    ];
  }
});

// src/lib/db/schema.generated.ts
var SCHEMA_SQL;
var init_schema_generated = __esm({
  "src/lib/db/schema.generated.ts"() {
    "use strict";
    SCHEMA_SQL = `-- ============================================================================
-- \u0645\u062E\u0637\u0637 \u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646\u0635\u0629 \u0625\u062A\u0642\u0627\u0646 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0645\u062F\u0631\u0633\u064A \u0648\u0636\u0645\u0627\u0646 \u062C\u0648\u062F\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645
-- \u0645\u062A\u0648\u0627\u0641\u0642 \u0645\u0639 SQLite (\u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0641\u0648\u0631\u064A) \u0648\u0642\u0627\u0628\u0644 \u0644\u0644\u0646\u0642\u0644 \u0625\u0644\u0649 PostgreSQL \u0644\u0644\u0646\u0634\u0631 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u064A.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------
-- \u0627\u0644\u062C\u062F\u0627\u0648\u0644 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629: \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0648\u0627\u0644\u0647\u064A\u0643\u0644\u0629 \u0627\u0644\u062A\u0646\u0638\u064A\u0645\u064A\u0629
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS governorates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS directorates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  governorate_id TEXT NOT NULL REFERENCES governorates(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES directorates(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_directorates_governorate ON directorates(governorate_id);

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  directorate_id TEXT NOT NULL REFERENCES directorates(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_areas_directorate ON areas(directorate_id);

-- -------------------------------------------------------
-- \u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0648\u0646
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'system',
  permissions TEXT NOT NULL DEFAULT '{}',
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified TEXT,
  password_hash TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  directorate_id TEXT REFERENCES directorates(id) ON DELETE SET NULL,
  school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_reason TEXT,
  failed_login INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 1,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  two_factor_secret TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_directorate ON users(directorate_id);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);

-- -------------------------------------------------------
-- \u0627\u0644\u0645\u062F\u0627\u0631\u0633
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  governorate_id TEXT NOT NULL REFERENCES governorates(id),
  directorate_id TEXT NOT NULL REFERENCES directorates(id),
  area_id TEXT REFERENCES areas(id),
  address TEXT,
  latitude REAL,
  longitude REAL,
  type TEXT NOT NULL,
  stage TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  principal_name TEXT,
  principal_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  data_source TEXT NOT NULL DEFAULT 'MANUAL',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
CREATE INDEX IF NOT EXISTS idx_schools_directorate ON schools(directorate_id);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

-- -------------------------------------------------------
-- \u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0648\u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0627\u0644\u0641\u0631\u0639\u064A\u0629 \u0648\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A (\u0645\u0646 \u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS criteria (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_criteria_code ON criteria(code);
CREATE INDEX IF NOT EXISTS idx_criteria_order ON criteria(order_index);

CREATE TABLE IF NOT EXISTS sub_criteria (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  criterion_id TEXT NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sub_criteria_criterion ON sub_criteria(criterion_id);
CREATE INDEX IF NOT EXISTS idx_sub_criteria_code ON sub_criteria(code);

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '[]',
  verification_tools TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  criterion_id TEXT REFERENCES criteria(id) ON DELETE CASCADE,
  sub_criterion_id TEXT REFERENCES sub_criteria(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_indicators_code ON indicators(code);
CREATE INDEX IF NOT EXISTS idx_indicators_criterion ON indicators(criterion_id);
CREATE INDEX IF NOT EXISTS idx_indicators_sub ON indicators(sub_criterion_id);
CREATE INDEX IF NOT EXISTS idx_indicators_full ON indicators(criterion_id, sub_criterion_id, order_index);

-- -------------------------------------------------------
-- \u0645\u0642\u064A\u0627\u0633 \u0627\u0644\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0639\u062F\u064A\u0644 \u0645\u0646 \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rating_scale (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label_ar TEXT NOT NULL,
  label_en TEXT,
  score INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rating_scale_key ON rating_scale(key);

-- -------------------------------------------------------
-- \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u064A\u062F\u0627\u0646\u064A\u0629
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  inspector_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'PERIODIC',
  purpose TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  notes TEXT,
  completion INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visits_school ON visits(school_id);
CREATE INDEX IF NOT EXISTS idx_visits_inspector ON visits(inspector_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_scheduled ON visits(scheduled_at);

-- -------------------------------------------------------
-- \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A \u0627\u0644\u0645\u064A\u062F\u0627\u0646\u064A\u0629 \u0644\u0644\u0645\u0624\u0634\u0631\u0627\u062A
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  indicator_id TEXT NOT NULL REFERENCES indicators(id),
  status TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
  score INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  rated_by_id TEXT REFERENCES users(id),
  rated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (visit_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluations_visit ON evaluations(visit_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_indicator ON evaluations(indicator_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status ON evaluations(status);

-- -------------------------------------------------------
-- \u0633\u062C\u0644 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 (\u062A\u062F\u0642\u064A\u0642 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0645\u0633\u062D\u0647 \u0645\u0646 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0627\u0644\u0639\u0627\u062F\u064A\u064A\u0646)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_history (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by_id TEXT REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_eval_history_eval ON evaluation_history(evaluation_id);

-- -------------------------------------------------------
-- \u0627\u0644\u0623\u062F\u0644\u0629 \u0648\u0627\u0644\u0634\u0648\u0627\u0647\u062F \u0648\u0627\u0644\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0631\u0641\u0642\u0629
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE SET NULL,
  sub_criterion_id TEXT REFERENCES sub_criteria(id) ON DELETE SET NULL,
  uploaded_by_id TEXT NOT NULL REFERENCES users(id),
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  review_notes TEXT,
  reviewed_by_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_school ON evidence(school_id);
CREATE INDEX IF NOT EXISTS idx_evidence_visit ON evidence(visit_id);
CREATE INDEX IF NOT EXISTS idx_evidence_evaluation ON evidence(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploader ON evidence(uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_evidence_review ON evidence(review_status);

-- -------------------------------------------------------
-- \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0648\u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
  directorate_id TEXT REFERENCES directorates(id) ON DELETE SET NULL,
  period_start TEXT,
  period_end TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  rejection_reason TEXT,
  generated_by_id TEXT NOT NULL REFERENCES users(id),
  approved_by_id TEXT REFERENCES users(id),
  approved_at TEXT,
  pdf_url TEXT,
  verification_code TEXT NOT NULL UNIQUE,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_number ON reports(number);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_school ON reports(school_id);
CREATE INDEX IF NOT EXISTS idx_reports_directorate ON reports(directorate_id);
CREATE INDEX IF NOT EXISTS idx_reports_type_status ON reports(type, status);
CREATE INDEX IF NOT EXISTS idx_reports_verification ON reports(verification_code);

-- -------------------------------------------------------
-- \u062E\u0637\u0637 \u0627\u0644\u062A\u062D\u0633\u064A\u0646 \u0648\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u062A\u0635\u062D\u064A\u062D\u064A\u0629
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS improvement_plans (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plans_school ON improvement_plans(school_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON improvement_plans(status);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES improvement_plans(id) ON DELETE CASCADE,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE SET NULL,
  indicator_id TEXT REFERENCES indicators(id) ON DELETE SET NULL,
  problem_description TEXT NOT NULL,
  root_cause TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  proposed_action TEXT NOT NULL,
  responsible_id TEXT NOT NULL REFERENCES users(id),
  due_date TEXT NOT NULL,
  resources TEXT,
  success_indicator TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  verification_notes TEXT,
  verified_by_id TEXT REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_actions_plan ON corrective_actions(plan_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON corrective_actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_due ON corrective_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_actions_responsible ON corrective_actions(responsible_id);

-- -------------------------------------------------------
-- \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A (\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0648\u0627\u0644\u0631\u0633\u0627\u0626\u0644)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  is_official INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_school ON conversations(school_id);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at TEXT,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_user ON conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- -------------------------------------------------------
-- \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  audience_roles TEXT NOT NULL DEFAULT '[]',
  directorate_ids TEXT NOT NULL DEFAULT '[]',
  school_ids TEXT NOT NULL DEFAULT '[]',
  published_at TEXT,
  expires_at TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at);

-- -------------------------------------------------------
-- \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631 \u0648\u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646 (\u0648\u062D\u062F\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 \u0645\u0646\u0641\u0635\u0644\u0629 \u0639\u0646 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0631\u0633\u0645\u064A)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  national_id TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parents_user ON parents(user_id);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  national_id TEXT UNIQUE,
  name TEXT NOT NULL,
  grade TEXT,
  section TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_national ON students(national_id);

CREATE TABLE IF NOT EXISTS parent_student (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT '\u0623\u0628/\u0623\u0645',
  UNIQUE (parent_id, student_id)
);

-- -------------------------------------------------------
-- \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0648\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u0648\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0648\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u0635\u062F\u064A\u0631
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO',
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS export_logs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  filters TEXT,
  file_url TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exports_creator ON export_logs(created_by_id);

-- -------------------------------------------------------
-- \u0627\u0644\u062D\u0636\u0648\u0631 \u0648\u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629 (\u0648\u062D\u062F\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 \u2014 \u0645\u0646\u0641\u0635\u0644\u0629 \u0639\u0646 \u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  UNIQUE (student_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);

CREATE TABLE IF NOT EXISTS academic_results (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  term TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  note TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_academic_student ON academic_results(student_id);
CREATE INDEX IF NOT EXISTS idx_academic_term ON academic_results(term);

-- -------------------------------------------------------
-- \u0645\u062D\u0641\u0632 \u062A\u062D\u062F\u064A\u062B updated_at \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627
-- -------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_visits_updated_at
AFTER UPDATE ON visits FOR EACH ROW
BEGIN
  UPDATE visits SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_evaluations_updated_at
AFTER UPDATE ON evaluations FOR EACH ROW
BEGIN
  UPDATE evaluations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_evidence_updated_at
AFTER UPDATE ON evidence FOR EACH ROW
BEGIN
  UPDATE evidence SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reports_updated_at
AFTER UPDATE ON reports FOR EACH ROW
BEGIN
  UPDATE reports SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_improvement_plans_updated_at
AFTER UPDATE ON improvement_plans FOR EACH ROW
BEGIN
  UPDATE improvement_plans SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_corrective_actions_updated_at
AFTER UPDATE ON corrective_actions FOR EACH ROW
BEGIN
  UPDATE corrective_actions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_conversations_updated_at
AFTER UPDATE ON conversations FOR EACH ROW
BEGIN
  UPDATE conversations SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`;
  }
});

// src/lib/db/local-driver.ts
var local_driver_exports = {};
__export(local_driver_exports, {
  openLocalDatabase: () => openLocalDatabase
});
function openLocalDatabase() {
  const dir = process.env.SQLITE_DIR ?? process.cwd();
  const file = process.env.DATABASE_FILE ?? "dev.db";
  const dbPath = import_node_path.default.resolve(dir, file);
  import_node_fs.default.mkdirSync(import_node_path.default.dirname(dbPath), { recursive: true });
  const db = new import_better_sqlite3.default(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}
var import_node_fs, import_node_path, import_better_sqlite3;
var init_local_driver = __esm({
  "src/lib/db/local-driver.ts"() {
    "use strict";
    import_node_fs = __toESM(require("node:fs"));
    import_node_path = __toESM(require("node:path"));
    import_better_sqlite3 = __toESM(require("better-sqlite3"));
  }
});

// node_modules/@libsql/core/lib-esm/api.js
var LibsqlError, LibsqlBatchError;
var init_api = __esm({
  "node_modules/@libsql/core/lib-esm/api.js"() {
    LibsqlError = class extends Error {
      /** Machine-readable error code. */
      code;
      /** Extended error code with more specific information (e.g., SQLITE_CONSTRAINT_PRIMARYKEY). */
      extendedCode;
      /** Raw numeric error code */
      rawCode;
      constructor(message, code, extendedCode, rawCode, cause) {
        if (code !== void 0) {
          message = `${code}: ${message}`;
        }
        super(message, { cause });
        this.code = code;
        this.extendedCode = extendedCode;
        this.rawCode = rawCode;
        this.name = "LibsqlError";
      }
    };
    LibsqlBatchError = class extends LibsqlError {
      /** The zero-based index of the statement that failed in the batch. */
      statementIndex;
      constructor(message, statementIndex, code, extendedCode, rawCode, cause) {
        super(message, code, extendedCode, rawCode, cause);
        this.statementIndex = statementIndex;
        this.name = "LibsqlBatchError";
      }
    };
  }
});

// node_modules/@libsql/core/lib-esm/uri.js
function parseUri(text) {
  const match = URI_RE.exec(text);
  if (match === null) {
    throw new LibsqlError(`The URL '${text}' is not in a valid format`, "URL_INVALID");
  }
  const groups = match.groups;
  const scheme = groups["scheme"];
  const authority = groups["authority"] !== void 0 ? parseAuthority(groups["authority"]) : void 0;
  const path2 = percentDecode(groups["path"]);
  const query2 = groups["query"] !== void 0 ? parseQuery(groups["query"]) : void 0;
  const fragment = groups["fragment"] !== void 0 ? percentDecode(groups["fragment"]) : void 0;
  return { scheme, authority, path: path2, query: query2, fragment };
}
function parseAuthority(text) {
  const match = AUTHORITY_RE.exec(text);
  if (match === null) {
    throw new LibsqlError("The authority part of the URL is not in a valid format", "URL_INVALID");
  }
  const groups = match.groups;
  const host = percentDecode(groups["host_br"] ?? groups["host"]);
  const port = groups["port"] ? parseInt(groups["port"], 10) : void 0;
  const userinfo = groups["username"] !== void 0 ? {
    username: percentDecode(groups["username"]),
    password: groups["password"] !== void 0 ? percentDecode(groups["password"]) : void 0
  } : void 0;
  return { host, port, userinfo };
}
function parseQuery(text) {
  const sequences = text.split("&");
  const pairs = [];
  for (const sequence of sequences) {
    if (sequence === "") {
      continue;
    }
    let key;
    let value;
    const splitIdx = sequence.indexOf("=");
    if (splitIdx < 0) {
      key = sequence;
      value = "";
    } else {
      key = sequence.substring(0, splitIdx);
      value = sequence.substring(splitIdx + 1);
    }
    pairs.push({
      key: percentDecode(key.replaceAll("+", " ")),
      value: percentDecode(value.replaceAll("+", " "))
    });
  }
  return { pairs };
}
function percentDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    if (e instanceof URIError) {
      throw new LibsqlError(`URL component has invalid percent encoding: ${e}`, "URL_INVALID", void 0, void 0, e);
    }
    throw e;
  }
}
function encodeBaseUrl(scheme, authority, path2) {
  if (authority === void 0) {
    throw new LibsqlError(`URL with scheme ${JSON.stringify(scheme + ":")} requires authority (the "//" part)`, "URL_INVALID");
  }
  const schemeText = `${scheme}:`;
  const hostText = encodeHost(authority.host);
  const portText = encodePort(authority.port);
  const userinfoText = encodeUserinfo(authority.userinfo);
  const authorityText = `//${userinfoText}${hostText}${portText}`;
  let pathText = path2.split("/").map(encodeURIComponent).join("/");
  if (pathText !== "" && !pathText.startsWith("/")) {
    pathText = "/" + pathText;
  }
  return new URL(`${schemeText}${authorityText}${pathText}`);
}
function encodeHost(host) {
  return host.includes(":") ? `[${encodeURI(host)}]` : encodeURI(host);
}
function encodePort(port) {
  return port !== void 0 ? `:${port}` : "";
}
function encodeUserinfo(userinfo) {
  if (userinfo === void 0) {
    return "";
  }
  const usernameText = encodeURIComponent(userinfo.username);
  const passwordText = userinfo.password !== void 0 ? `:${encodeURIComponent(userinfo.password)}` : "";
  return `${usernameText}${passwordText}@`;
}
var URI_RE, AUTHORITY_RE;
var init_uri = __esm({
  "node_modules/@libsql/core/lib-esm/uri.js"() {
    init_api();
    URI_RE = (() => {
      const SCHEME = "(?<scheme>[A-Za-z][A-Za-z.+-]*)";
      const AUTHORITY = "(?<authority>[^/?#]*)";
      const PATH = "(?<path>[^?#]*)";
      const QUERY = "(?<query>[^#]*)";
      const FRAGMENT = "(?<fragment>.*)";
      return new RegExp(`^${SCHEME}:(//${AUTHORITY})?${PATH}(\\?${QUERY})?(#${FRAGMENT})?$`, "su");
    })();
    AUTHORITY_RE = (() => {
      return new RegExp(`^((?<username>[^:]*)(:(?<password>.*))?@)?((?<host>[^:\\[\\]]*)|(\\[(?<host_br>[^\\[\\]]*)\\]))(:(?<port>[0-9]*))?$`, "su");
    })();
  }
});

// node_modules/js-base64/base64.mjs
var version, VERSION, _TD, _TE, b64ch, b64chs, b64tab, b64re, _fromCC, _U8Afrom, _mkUriSafe, _tidyB64, btoaPolyfill, _btoa, _fromUint8Array, fromUint8Array, cb_utob, re_utob, utob, _encode, encode, encodeURI2, re_btou, cb_btou, btou, atobPolyfill, _atob, _toUint8Array, toUint8Array, _decode, _unURI, decode, isValid, _noEnum, extendString, extendUint8Array, extendBuiltins, gBase64;
var init_base64 = __esm({
  "node_modules/js-base64/base64.mjs"() {
    version = "3.9.5";
    VERSION = version;
    _TD = typeof TextDecoder === "function" ? new TextDecoder("utf-8", { ignoreBOM: true }) : void 0;
    _TE = typeof TextEncoder === "function" ? new TextEncoder() : void 0;
    b64ch = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    b64chs = Array.prototype.slice.call(b64ch);
    b64tab = ((a) => {
      let tab = {};
      a.forEach((c, i) => tab[c] = i);
      return tab;
    })(b64chs);
    b64re = /^(?:[A-Za-z\d+\/]{4})*?(?:[A-Za-z\d+\/]{2}(?:==)?|[A-Za-z\d+\/]{3}=?)?$/;
    _fromCC = String.fromCharCode.bind(String);
    _U8Afrom = typeof Uint8Array.from === "function" ? Uint8Array.from.bind(Uint8Array) : (it) => new Uint8Array(Array.prototype.slice.call(it, 0));
    _mkUriSafe = (src) => src.replace(/=/g, "").replace(/[+\/]/g, (m0) => m0 == "+" ? "-" : "_");
    _tidyB64 = (s) => s.replace(/[^A-Za-z0-9\+\/]/g, "");
    btoaPolyfill = (bin) => {
      let u32, c0, c1, c2, asc = "";
      const pad = bin.length % 3;
      for (let i = 0; i < bin.length; ) {
        if ((c0 = bin.charCodeAt(i++)) > 255 || (c1 = bin.charCodeAt(i++)) > 255 || (c2 = bin.charCodeAt(i++)) > 255)
          throw new TypeError("invalid character found");
        u32 = c0 << 16 | c1 << 8 | c2;
        asc += b64chs[u32 >> 18 & 63] + b64chs[u32 >> 12 & 63] + b64chs[u32 >> 6 & 63] + b64chs[u32 & 63];
      }
      return pad ? asc.slice(0, pad - 3) + "===".substring(pad) : asc;
    };
    _btoa = typeof btoa === "function" ? (bin) => btoa(bin) : btoaPolyfill;
    _fromUint8Array = typeof Uint8Array.prototype.toBase64 === "function" ? Function.prototype.call.bind(Uint8Array.prototype.toBase64) : (u8a) => {
      const maxargs = 4096;
      let strs = [];
      for (let i = 0, l = u8a.length; i < l; i += maxargs) {
        strs.push(_fromCC.apply(null, u8a.subarray(i, i + maxargs)));
      }
      return _btoa(strs.join(""));
    };
    fromUint8Array = (u8a, urlsafe = false) => urlsafe ? _mkUriSafe(_fromUint8Array(u8a)) : _fromUint8Array(u8a);
    cb_utob = (c) => {
      if (c.length < 2) {
        var cc = c.charCodeAt(0);
        return cc < 128 ? c : cc < 2048 ? _fromCC(192 | cc >>> 6) + _fromCC(128 | cc & 63) : _fromCC(224 | cc >>> 12 & 15) + _fromCC(128 | cc >>> 6 & 63) + _fromCC(128 | cc & 63);
      } else {
        var cc = 65536 + (c.charCodeAt(0) - 55296) * 1024 + (c.charCodeAt(1) - 56320);
        return _fromCC(240 | cc >>> 18 & 7) + _fromCC(128 | cc >>> 12 & 63) + _fromCC(128 | cc >>> 6 & 63) + _fromCC(128 | cc & 63);
      }
    };
    re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\x00-\x7F]/g;
    utob = (u) => u.replace(re_utob, cb_utob);
    _encode = _TE ? (s) => _fromUint8Array(_TE.encode(s)) : (s) => _btoa(utob(s));
    encode = (src, urlsafe = false) => urlsafe ? _mkUriSafe(_encode(src)) : _encode(src);
    encodeURI2 = (src) => encode(src, true);
    re_btou = /[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3}/g;
    cb_btou = (cccc) => {
      switch (cccc.length) {
        case 4:
          var cp = (7 & cccc.charCodeAt(0)) << 18 | (63 & cccc.charCodeAt(1)) << 12 | (63 & cccc.charCodeAt(2)) << 6 | 63 & cccc.charCodeAt(3), offset = cp - 65536;
          return _fromCC((offset >>> 10) + 55296) + _fromCC((offset & 1023) + 56320);
        case 3:
          return _fromCC((15 & cccc.charCodeAt(0)) << 12 | (63 & cccc.charCodeAt(1)) << 6 | 63 & cccc.charCodeAt(2));
        default:
          return _fromCC((31 & cccc.charCodeAt(0)) << 6 | 63 & cccc.charCodeAt(1));
      }
    };
    btou = (b) => b.replace(re_btou, cb_btou);
    atobPolyfill = (asc) => {
      asc = asc.replace(/\s+/g, "");
      if (!b64re.test(asc))
        throw new TypeError("malformed base64.");
      asc += "==".slice(2 - (asc.length & 3));
      let u24, r1, r2;
      let binArray = [];
      for (let i = 0; i < asc.length; ) {
        u24 = b64tab[asc.charAt(i++)] << 18 | b64tab[asc.charAt(i++)] << 12 | (r1 = b64tab[asc.charAt(i++)]) << 6 | (r2 = b64tab[asc.charAt(i++)]);
        if (r1 === 64) {
          binArray.push(_fromCC(u24 >> 16 & 255));
        } else if (r2 === 64) {
          binArray.push(_fromCC(u24 >> 16 & 255, u24 >> 8 & 255));
        } else {
          binArray.push(_fromCC(u24 >> 16 & 255, u24 >> 8 & 255, u24 & 255));
        }
      }
      return binArray.join("");
    };
    _atob = typeof atob === "function" ? (asc) => atob(_tidyB64(asc)) : atobPolyfill;
    _toUint8Array = typeof Uint8Array.fromBase64 === "function" ? (a) => Uint8Array.fromBase64(a) : (a) => _U8Afrom(_atob(a).split("").map((c) => c.charCodeAt(0)));
    toUint8Array = (a) => _toUint8Array(_unURI(a));
    _decode = _TD ? (a) => _TD.decode(_toUint8Array(a)) : (a) => btou(_atob(a));
    _unURI = (a) => _tidyB64(a.replace(/[-_]/g, (m0) => m0 == "-" ? "+" : "/"));
    decode = (src) => _decode(_unURI(src));
    isValid = (src) => {
      if (typeof src !== "string")
        return false;
      const s = src.replace(/\s+/g, "").replace(/={0,2}$/, "");
      return !/[^\s0-9a-zA-Z\+/]/.test(s) || !/[^\s0-9a-zA-Z\-_]/.test(s);
    };
    _noEnum = (v) => {
      return {
        value: v,
        enumerable: false,
        writable: true,
        configurable: true
      };
    };
    extendString = function() {
      const _add = (name, body) => Object.defineProperty(String.prototype, name, _noEnum(body));
      _add("fromBase64", function() {
        return decode(this);
      });
      _add("toBase64", function(urlsafe) {
        return encode(this, urlsafe);
      });
      _add("toBase64URI", function() {
        return encode(this, true);
      });
      _add("toBase64URL", function() {
        return encode(this, true);
      });
      _add("toUint8Array", function() {
        return toUint8Array(this);
      });
    };
    extendUint8Array = function() {
      const _add = (name, body) => Object.defineProperty(Uint8Array.prototype, name, _noEnum(body));
      _add("toBase64", function(urlsafe) {
        return fromUint8Array(this, urlsafe);
      });
      _add("toBase64URI", function() {
        return fromUint8Array(this, true);
      });
      _add("toBase64URL", function() {
        return fromUint8Array(this, true);
      });
    };
    extendBuiltins = () => {
      extendString();
      extendUint8Array();
    };
    gBase64 = {
      version,
      VERSION,
      atob: _atob,
      atobPolyfill,
      btoa: _btoa,
      btoaPolyfill,
      fromBase64: decode,
      toBase64: encode,
      encode,
      encodeURI: encodeURI2,
      encodeURL: encodeURI2,
      utob,
      btou,
      decode,
      isValid,
      fromUint8Array,
      toUint8Array,
      extendString,
      extendUint8Array,
      extendBuiltins
    };
  }
});

// node_modules/@libsql/core/lib-esm/util.js
function transactionModeToBegin(mode) {
  if (mode === "write") {
    return "BEGIN IMMEDIATE";
  } else if (mode === "read") {
    return "BEGIN TRANSACTION READONLY";
  } else if (mode === "deferred") {
    return "BEGIN DEFERRED";
  } else {
    throw RangeError('Unknown transaction mode, supported values are "write", "read" and "deferred"');
  }
}
function rowToJson(row) {
  return Array.prototype.map.call(row, valueToJson);
}
function valueToJson(value) {
  if (typeof value === "bigint") {
    return "" + value;
  } else if (value instanceof ArrayBuffer) {
    return gBase64.fromUint8Array(new Uint8Array(value));
  } else {
    return value;
  }
}
var supportedUrlLink, ResultSetImpl;
var init_util = __esm({
  "node_modules/@libsql/core/lib-esm/util.js"() {
    init_base64();
    supportedUrlLink = "https://github.com/libsql/libsql-client-ts#supported-urls";
    ResultSetImpl = class {
      columns;
      columnTypes;
      rows;
      rowsAffected;
      lastInsertRowid;
      constructor(columns, columnTypes, rows, rowsAffected, lastInsertRowid) {
        this.columns = columns;
        this.columnTypes = columnTypes;
        this.rows = rows;
        this.rowsAffected = rowsAffected;
        this.lastInsertRowid = lastInsertRowid;
      }
      toJSON() {
        return {
          columns: this.columns,
          columnTypes: this.columnTypes,
          rows: this.rows.map(rowToJson),
          rowsAffected: this.rowsAffected,
          lastInsertRowid: this.lastInsertRowid !== void 0 ? "" + this.lastInsertRowid : null
        };
      }
    };
  }
});

// node_modules/@libsql/core/lib-esm/config.js
function isInMemoryConfig(config) {
  return config.scheme === "file" && (config.path === ":memory:" || config.path.startsWith(":memory:?"));
}
function expandConfig(config, preferHttp) {
  if (typeof config !== "object") {
    throw new TypeError(`Expected client configuration as object, got ${typeof config}`);
  }
  let { url, authToken, tls, intMode, concurrency } = config;
  concurrency = Math.max(0, concurrency || 20);
  intMode ??= "number";
  let connectionQueryParams = [];
  if (url === inMemoryMode) {
    url = "file::memory:";
  }
  const uri = parseUri(url);
  const originalUriScheme = uri.scheme.toLowerCase();
  const isInMemoryMode = originalUriScheme === "file" && uri.path === inMemoryMode && uri.authority === void 0;
  let queryParamsDef;
  if (isInMemoryMode) {
    queryParamsDef = {
      cache: {
        values: ["shared", "private"],
        update: (key, value) => connectionQueryParams.push(`${key}=${value}`)
      }
    };
  } else {
    queryParamsDef = {
      tls: {
        values: ["0", "1"],
        update: (_, value) => tls = value === "1"
      },
      authToken: {
        update: (_, value) => authToken = value
      }
    };
  }
  for (const { key, value } of uri.query?.pairs ?? []) {
    if (!Object.hasOwn(queryParamsDef, key)) {
      throw new LibsqlError(`Unsupported URL query parameter ${JSON.stringify(key)}`, "URL_PARAM_NOT_SUPPORTED");
    }
    const queryParamDef = queryParamsDef[key];
    if (queryParamDef.values !== void 0 && !queryParamDef.values.includes(value)) {
      throw new LibsqlError(`Unknown value for the "${key}" query argument: ${JSON.stringify(value)}. Supported values are: [${queryParamDef.values.map((x) => '"' + x + '"').join(", ")}]`, "URL_INVALID");
    }
    if (queryParamDef.update !== void 0) {
      queryParamDef?.update(key, value);
    }
  }
  const connectionQueryParamsString = connectionQueryParams.length === 0 ? "" : `?${connectionQueryParams.join("&")}`;
  const path2 = uri.path + connectionQueryParamsString;
  let scheme;
  if (originalUriScheme === "libsql") {
    if (tls === false) {
      if (uri.authority?.port === void 0) {
        throw new LibsqlError('A "libsql:" URL with ?tls=0 must specify an explicit port', "URL_INVALID");
      }
      scheme = preferHttp ? "http" : "ws";
    } else {
      scheme = preferHttp ? "https" : "wss";
    }
  } else {
    scheme = originalUriScheme;
  }
  if (scheme === "http" || scheme === "ws") {
    tls ??= false;
  } else {
    tls ??= true;
  }
  if (scheme !== "http" && scheme !== "ws" && scheme !== "https" && scheme !== "wss" && scheme !== "file") {
    throw new LibsqlError(`The client supports only "libsql:", "wss:", "ws:", "https:", "http:" and "file:" URLs, got ${JSON.stringify(uri.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
  }
  if (intMode !== "number" && intMode !== "bigint" && intMode !== "string") {
    throw new TypeError(`Invalid value for intMode, expected "number", "bigint" or "string", got ${JSON.stringify(intMode)}`);
  }
  if (uri.fragment !== void 0) {
    throw new LibsqlError(`URL fragments are not supported: ${JSON.stringify("#" + uri.fragment)}`, "URL_INVALID");
  }
  if (isInMemoryMode) {
    return {
      scheme: "file",
      tls: false,
      path: path2,
      intMode,
      concurrency,
      syncUrl: config.syncUrl,
      syncInterval: config.syncInterval,
      readYourWrites: config.readYourWrites,
      offline: config.offline,
      fetch: config.fetch,
      timeout: config.timeout,
      authToken: void 0,
      encryptionKey: void 0,
      remoteEncryptionKey: void 0,
      authority: void 0
    };
  }
  return {
    scheme,
    tls,
    authority: uri.authority,
    path: path2,
    authToken,
    intMode,
    concurrency,
    encryptionKey: config.encryptionKey,
    remoteEncryptionKey: config.remoteEncryptionKey,
    syncUrl: config.syncUrl,
    syncInterval: config.syncInterval,
    readYourWrites: config.readYourWrites,
    offline: config.offline,
    fetch: config.fetch,
    timeout: config.timeout
  };
}
var inMemoryMode;
var init_config = __esm({
  "node_modules/@libsql/core/lib-esm/config.js"() {
    init_api();
    init_uri();
    init_util();
    inMemoryMode = ":memory:";
  }
});

// node_modules/@neon-rs/load/dist/index.js
var require_dist = __commonJS({
  "node_modules/@neon-rs/load/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.load = exports2.currentTarget = void 0;
    var path2 = __importStar(require("path"));
    var fs2 = __importStar(require("fs"));
    function currentTarget() {
      let os = null;
      switch (process.platform) {
        case "android":
          switch (process.arch) {
            case "arm":
              return "android-arm-eabi";
            case "arm64":
              return "android-arm64";
          }
          os = "Android";
          break;
        case "win32":
          switch (process.arch) {
            case "x64":
              return "win32-x64-msvc";
            case "arm64":
              return "win32-arm64-msvc";
            case "ia32":
              return "win32-ia32-msvc";
          }
          os = "Windows";
          break;
        case "darwin":
          switch (process.arch) {
            case "x64":
              return "darwin-x64";
            case "arm64":
              return "darwin-arm64";
          }
          os = "macOS";
          break;
        case "linux":
          switch (process.arch) {
            case "x64":
            case "arm64":
              return isGlibc() ? `linux-${process.arch}-gnu` : `linux-${process.arch}-musl`;
            case "arm":
              return "linux-arm-gnueabihf";
          }
          os = "Linux";
          break;
        case "freebsd":
          if (process.arch === "x64") {
            return "freebsd-x64";
          }
          os = "FreeBSD";
          break;
      }
      if (os) {
        throw new Error(`Neon: unsupported ${os} architecture: ${process.arch}`);
      }
      throw new Error(`Neon: unsupported system: ${process.platform}`);
    }
    exports2.currentTarget = currentTarget;
    function isGlibc() {
      const report = process.report?.getReport();
      if (typeof report !== "object" || !report || !("header" in report)) {
        return false;
      }
      const header = report.header;
      return typeof header === "object" && !!header && "glibcVersionRuntime" in header;
    }
    function load(dirname) {
      const m = path2.join(dirname, "index.node");
      return fs2.existsSync(m) ? require(m) : null;
    }
    exports2.load = load;
  }
});

// node_modules/libsql/node_modules/detect-libc/lib/process.js
var require_process = __commonJS({
  "node_modules/libsql/node_modules/detect-libc/lib/process.js"(exports2, module2) {
    "use strict";
    var isLinux = () => process.platform === "linux";
    var report = null;
    var getReport = () => {
      if (!report) {
        report = isLinux() && process.report ? process.report.getReport() : {};
      }
      return report;
    };
    module2.exports = { isLinux, getReport };
  }
});

// node_modules/libsql/node_modules/detect-libc/lib/filesystem.js
var require_filesystem = __commonJS({
  "node_modules/libsql/node_modules/detect-libc/lib/filesystem.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var LDD_PATH = "/usr/bin/ldd";
    var readFileSync = (path2) => fs2.readFileSync(path2, "utf-8");
    var readFile = (path2) => new Promise((resolve, reject) => {
      fs2.readFile(path2, "utf-8", (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
    module2.exports = {
      LDD_PATH,
      readFileSync,
      readFile
    };
  }
});

// node_modules/libsql/node_modules/detect-libc/lib/detect-libc.js
var require_detect_libc = __commonJS({
  "node_modules/libsql/node_modules/detect-libc/lib/detect-libc.js"(exports2, module2) {
    "use strict";
    var childProcess = require("child_process");
    var { isLinux, getReport } = require_process();
    var { LDD_PATH, readFile, readFileSync } = require_filesystem();
    var cachedFamilyFilesystem;
    var cachedVersionFilesystem;
    var command = "getconf GNU_LIBC_VERSION 2>&1 || true; ldd --version 2>&1 || true";
    var commandOut = "";
    var safeCommand = () => {
      if (!commandOut) {
        return new Promise((resolve) => {
          childProcess.exec(command, (err, out) => {
            commandOut = err ? " " : out;
            resolve(commandOut);
          });
        });
      }
      return commandOut;
    };
    var safeCommandSync = () => {
      if (!commandOut) {
        try {
          commandOut = childProcess.execSync(command, { encoding: "utf8" });
        } catch (_err) {
          commandOut = " ";
        }
      }
      return commandOut;
    };
    var GLIBC = "glibc";
    var RE_GLIBC_VERSION = /GLIBC\s(\d+\.\d+)/;
    var MUSL = "musl";
    var GLIBC_ON_LDD = GLIBC.toUpperCase();
    var MUSL_ON_LDD = MUSL.toLowerCase();
    var isFileMusl = (f) => f.includes("libc.musl-") || f.includes("ld-musl-");
    var familyFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return GLIBC;
      }
      if (Array.isArray(report.sharedObjects)) {
        if (report.sharedObjects.some(isFileMusl)) {
          return MUSL;
        }
      }
      return null;
    };
    var familyFromCommand = (out) => {
      const [getconf, ldd1] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return GLIBC;
      }
      if (ldd1 && ldd1.includes(MUSL)) {
        return MUSL;
      }
      return null;
    };
    var getFamilyFromLddContent = (content) => {
      if (content.includes(MUSL_ON_LDD)) {
        return MUSL;
      }
      if (content.includes(GLIBC_ON_LDD)) {
        return GLIBC;
      }
      return null;
    };
    var familyFromFilesystem = async () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = await readFile(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromFilesystemSync = () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = readFileSync(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var family = async () => {
      let family2 = null;
      if (isLinux()) {
        family2 = await familyFromFilesystem();
        if (!family2) {
          family2 = familyFromReport();
        }
        if (!family2) {
          const out = await safeCommand();
          family2 = familyFromCommand(out);
        }
      }
      return family2;
    };
    var familySync = () => {
      let family2 = null;
      if (isLinux()) {
        family2 = familyFromFilesystemSync();
        if (!family2) {
          family2 = familyFromReport();
        }
        if (!family2) {
          const out = safeCommandSync();
          family2 = familyFromCommand(out);
        }
      }
      return family2;
    };
    var isNonGlibcLinux = async () => isLinux() && await family() !== GLIBC;
    var isNonGlibcLinuxSync = () => isLinux() && familySync() !== GLIBC;
    var versionFromFilesystem = async () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = await readFile(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromFilesystemSync = () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = readFileSync(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return report.header.glibcVersionRuntime;
      }
      return null;
    };
    var versionSuffix = (s) => s.trim().split(/\s+/)[1];
    var versionFromCommand = (out) => {
      const [getconf, ldd1, ldd2] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return versionSuffix(getconf);
      }
      if (ldd1 && ldd2 && ldd1.includes(MUSL)) {
        return versionSuffix(ldd2);
      }
      return null;
    };
    var version2 = async () => {
      let version3 = null;
      if (isLinux()) {
        version3 = await versionFromFilesystem();
        if (!version3) {
          version3 = versionFromReport();
        }
        if (!version3) {
          const out = await safeCommand();
          version3 = versionFromCommand(out);
        }
      }
      return version3;
    };
    var versionSync = () => {
      let version3 = null;
      if (isLinux()) {
        version3 = versionFromFilesystemSync();
        if (!version3) {
          version3 = versionFromReport();
        }
        if (!version3) {
          const out = safeCommandSync();
          version3 = versionFromCommand(out);
        }
      }
      return version3;
    };
    module2.exports = {
      GLIBC,
      MUSL,
      family,
      familySync,
      isNonGlibcLinux,
      isNonGlibcLinuxSync,
      version: version2,
      versionSync
    };
  }
});

// node_modules/libsql/auth.js
var require_auth = __commonJS({
  "node_modules/libsql/auth.js"(exports2, module2) {
    var Authorization = {
      /**
       * Allow access to a resource.
       * @type {number}
       */
      ALLOW: 0,
      /**
       * Deny access to a resource and throw an error in `prepare()`.
       * @type {number}
       */
      DENY: 1
    };
    module2.exports = Authorization;
  }
});

// node_modules/libsql/sqlite-error.js
var require_sqlite_error = __commonJS({
  "node_modules/libsql/sqlite-error.js"(exports2, module2) {
    "use strict";
    var descriptor = { value: "SqliteError", writable: true, enumerable: false, configurable: true };
    function SqliteError(message, code, rawCode) {
      if (new.target !== SqliteError) {
        return new SqliteError(message, code);
      }
      if (typeof code !== "string") {
        throw new TypeError("Expected second argument to be a string");
      }
      Error.call(this, message);
      descriptor.value = "" + message;
      Object.defineProperty(this, "message", descriptor);
      Error.captureStackTrace(this, SqliteError);
      this.code = code;
      this.rawCode = rawCode;
    }
    Object.setPrototypeOf(SqliteError, Error);
    Object.setPrototypeOf(SqliteError.prototype, Error.prototype);
    Object.defineProperty(SqliteError.prototype, "name", descriptor);
    module2.exports = SqliteError;
  }
});

// node_modules/libsql/index.js
var require_libsql = __commonJS({
  "node_modules/libsql/index.js"(exports2, module2) {
    "use strict";
    var { load, currentTarget } = require_dist();
    var { familySync, GLIBC, MUSL } = require_detect_libc();
    function requireNative() {
      if (process.env.LIBSQL_JS_DEV) {
        return load(__dirname);
      }
      let target = currentTarget();
      if (familySync() == GLIBC) {
        switch (target) {
          case "linux-x64-musl":
            target = "linux-x64-gnu";
            break;
          case "linux-arm64-musl":
            target = "linux-arm64-gnu";
            break;
        }
      }
      if (target === "linux-arm-gnueabihf" && familySync() == MUSL) {
        target = "linux-arm-musleabihf";
      }
      return require(`@libsql/${target}`);
    }
    var {
      databaseOpen,
      databaseOpenWithSync,
      databaseInTransaction,
      databaseInterrupt,
      databaseClose,
      databaseSyncSync,
      databaseSyncUntilSync,
      databaseExecSync,
      databasePrepareSync,
      databaseDefaultSafeIntegers,
      databaseAuthorizer,
      databaseLoadExtension,
      databaseMaxWriteReplicationIndex,
      statementRaw,
      statementIsReader,
      statementGet,
      statementRun,
      statementInterrupt,
      statementRowsSync,
      statementColumns,
      statementSafeIntegers,
      rowsNext
    } = requireNative();
    var Authorization = require_auth();
    var SqliteError = require_sqlite_error();
    function convertError(err) {
      if (err.libsqlError) {
        return new SqliteError(err.message, err.code, err.rawCode);
      }
      return err;
    }
    var Database3 = class {
      /**
       * Creates a new database connection. If the database file pointed to by `path` does not exists, it will be created.
       *
       * @constructor
       * @param {string} path - Path to the database file.
       */
      constructor(path2, opts) {
        const encryptionCipher = opts?.encryptionCipher ?? "aes256cbc";
        if (opts && opts.syncUrl) {
          var authToken = "";
          if (opts.syncAuth) {
            console.warn("Warning: The `syncAuth` option is deprecated, please use `authToken` option instead.");
            authToken = opts.syncAuth;
          } else if (opts.authToken) {
            authToken = opts.authToken;
          }
          const encryptionKey = opts?.encryptionKey ?? "";
          const syncPeriod = opts?.syncPeriod ?? 0;
          const readYourWrites = opts?.readYourWrites ?? true;
          const offline = opts?.offline ?? false;
          const remoteEncryptionKey = opts?.remoteEncryptionKey ?? "";
          this.db = databaseOpenWithSync(path2, opts.syncUrl, authToken, encryptionCipher, encryptionKey, syncPeriod, readYourWrites, offline, remoteEncryptionKey);
        } else {
          const authToken2 = opts?.authToken ?? "";
          const encryptionKey = opts?.encryptionKey ?? "";
          const timeout = opts?.timeout ?? 0;
          const remoteEncryptionKey = opts?.remoteEncryptionKey ?? "";
          this.db = databaseOpen(path2, authToken2, encryptionCipher, encryptionKey, timeout, remoteEncryptionKey);
        }
        this.memory = path2 === ":memory:";
        this.readonly = false;
        this.name = "";
        this.open = true;
        const db = this.db;
        Object.defineProperties(this, {
          inTransaction: {
            get() {
              return databaseInTransaction(db);
            }
          }
        });
      }
      sync() {
        return databaseSyncSync.call(this.db);
      }
      syncUntil(replicationIndex) {
        return databaseSyncUntilSync.call(this.db, replicationIndex);
      }
      /**
       * Prepares a SQL statement for execution.
       *
       * @param {string} sql - The SQL statement string to prepare.
       */
      prepare(sql) {
        try {
          const stmt = databasePrepareSync.call(this.db, sql);
          return new Statement(stmt);
        } catch (err) {
          throw convertError(err);
        }
      }
      /**
       * Returns a function that executes the given function in a transaction.
       *
       * @param {function} fn - The function to wrap in a transaction.
       */
      transaction(fn) {
        if (typeof fn !== "function")
          throw new TypeError("Expected first argument to be a function");
        const db = this;
        const wrapTxn = (mode) => {
          return (...bindParameters) => {
            db.exec("BEGIN " + mode);
            try {
              const result = fn(...bindParameters);
              db.exec("COMMIT");
              return result;
            } catch (err) {
              db.exec("ROLLBACK");
              throw err;
            }
          };
        };
        const properties = {
          default: { value: wrapTxn("") },
          deferred: { value: wrapTxn("DEFERRED") },
          immediate: { value: wrapTxn("IMMEDIATE") },
          exclusive: { value: wrapTxn("EXCLUSIVE") },
          database: { value: this, enumerable: true }
        };
        Object.defineProperties(properties.default.value, properties);
        Object.defineProperties(properties.deferred.value, properties);
        Object.defineProperties(properties.immediate.value, properties);
        Object.defineProperties(properties.exclusive.value, properties);
        return properties.default.value;
      }
      pragma(source, options) {
        if (options == null) options = {};
        if (typeof source !== "string") throw new TypeError("Expected first argument to be a string");
        if (typeof options !== "object") throw new TypeError("Expected second argument to be an options object");
        const simple = options["simple"];
        const stmt = this.prepare(`PRAGMA ${source}`, this, true);
        return simple ? stmt.pluck().get() : stmt.all();
      }
      backup(filename, options) {
        throw new Error("not implemented");
      }
      serialize(options) {
        throw new Error("not implemented");
      }
      function(name, options, fn) {
        if (options == null) options = {};
        if (typeof options === "function") {
          fn = options;
          options = {};
        }
        if (typeof name !== "string")
          throw new TypeError("Expected first argument to be a string");
        if (typeof fn !== "function")
          throw new TypeError("Expected last argument to be a function");
        if (typeof options !== "object")
          throw new TypeError("Expected second argument to be an options object");
        if (!name)
          throw new TypeError(
            "User-defined function name cannot be an empty string"
          );
        throw new Error("not implemented");
      }
      aggregate(name, options) {
        if (typeof name !== "string")
          throw new TypeError("Expected first argument to be a string");
        if (typeof options !== "object" || options === null)
          throw new TypeError("Expected second argument to be an options object");
        if (!name)
          throw new TypeError(
            "User-defined function name cannot be an empty string"
          );
        throw new Error("not implemented");
      }
      table(name, factory) {
        if (typeof name !== "string")
          throw new TypeError("Expected first argument to be a string");
        if (!name)
          throw new TypeError(
            "Virtual table module name cannot be an empty string"
          );
        throw new Error("not implemented");
      }
      authorizer(rules) {
        databaseAuthorizer.call(this.db, rules);
      }
      loadExtension(...args) {
        databaseLoadExtension.call(this.db, ...args);
      }
      maxWriteReplicationIndex() {
        return databaseMaxWriteReplicationIndex.call(this.db);
      }
      /**
       * Executes a SQL statement.
       *
       * @param {string} sql - The SQL statement string to execute.
       */
      exec(sql) {
        try {
          databaseExecSync.call(this.db, sql);
        } catch (err) {
          throw convertError(err);
        }
      }
      /**
       * Interrupts the database connection.
       */
      interrupt() {
        databaseInterrupt.call(this.db);
      }
      /**
       * Closes the database connection.
       */
      close() {
        databaseClose.call(this.db);
        this.open = false;
      }
      /**
       * Toggle 64-bit integer support.
       */
      defaultSafeIntegers(toggle) {
        databaseDefaultSafeIntegers.call(this.db, toggle ?? true);
        return this;
      }
      unsafeMode(...args) {
        throw new Error("not implemented");
      }
    };
    var Statement = class {
      constructor(stmt) {
        this.stmt = stmt;
        this.pluckMode = false;
      }
      /**
       * Toggle raw mode.
       *
       * @param raw Enable or disable raw mode. If you don't pass the parameter, raw mode is enabled.
       */
      raw(raw) {
        statementRaw.call(this.stmt, raw ?? true);
        return this;
      }
      /**
       * Toggle pluck mode.
       *
       * @param pluckMode Enable or disable pluck mode. If you don't pass the parameter, pluck mode is enabled.
       */
      pluck(pluckMode) {
        this.pluckMode = pluckMode ?? true;
        return this;
      }
      get reader() {
        return statementIsReader.call(this.stmt);
      }
      /**
       * Executes the SQL statement and returns an info object.
       */
      run(...bindParameters) {
        try {
          if (bindParameters.length == 1 && typeof bindParameters[0] === "object") {
            return statementRun.call(this.stmt, bindParameters[0]);
          } else {
            return statementRun.call(this.stmt, bindParameters.flat());
          }
        } catch (err) {
          throw convertError(err);
        }
      }
      /**
       * Executes the SQL statement and returns the first row.
       *
       * @param bindParameters - The bind parameters for executing the statement.
       */
      get(...bindParameters) {
        try {
          if (bindParameters.length == 1 && typeof bindParameters[0] === "object") {
            return statementGet.call(this.stmt, bindParameters[0]);
          } else {
            return statementGet.call(this.stmt, bindParameters.flat());
          }
        } catch (err) {
          throw convertError(err);
        }
      }
      /**
       * Executes the SQL statement and returns an iterator to the resulting rows.
       *
       * @param bindParameters - The bind parameters for executing the statement.
       */
      iterate(...bindParameters) {
        var rows = void 0;
        if (bindParameters.length == 1 && typeof bindParameters[0] === "object") {
          rows = statementRowsSync.call(this.stmt, bindParameters[0]);
        } else {
          rows = statementRowsSync.call(this.stmt, bindParameters.flat());
        }
        const iter = {
          nextRows: Array(100),
          nextRowIndex: 100,
          next() {
            try {
              if (this.nextRowIndex === 100) {
                rowsNext.call(rows, this.nextRows);
                this.nextRowIndex = 0;
              }
              const row = this.nextRows[this.nextRowIndex];
              this.nextRows[this.nextRowIndex] = void 0;
              if (!row) {
                return { done: true };
              }
              this.nextRowIndex++;
              return { value: row, done: false };
            } catch (err) {
              throw convertError(err);
            }
          },
          [Symbol.iterator]() {
            return this;
          }
        };
        return iter;
      }
      /**
       * Executes the SQL statement and returns an array of the resulting rows.
       *
       * @param bindParameters - The bind parameters for executing the statement.
       */
      all(...bindParameters) {
        try {
          const result = [];
          for (const row of this.iterate(...bindParameters)) {
            if (this.pluckMode) {
              result.push(row[Object.keys(row)[0]]);
            } else {
              result.push(row);
            }
          }
          return result;
        } catch (err) {
          throw convertError(err);
        }
      }
      /**
       * Interrupts the statement.
       */
      interrupt() {
        statementInterrupt.call(this.stmt);
      }
      /**
       * Returns the columns in the result set returned by this prepared statement.
       */
      columns() {
        return statementColumns.call(this.stmt);
      }
      /**
       * Toggle 64-bit integer support.
       */
      safeIntegers(toggle) {
        statementSafeIntegers.call(this.stmt, toggle ?? true);
        return this;
      }
    };
    module2.exports = Database3;
    module2.exports.Authorization = Authorization;
    module2.exports.SqliteError = SqliteError;
  }
});

// node_modules/@libsql/client/lib-esm/sqlite3.js
function _createClient(config) {
  if (config.scheme !== "file") {
    throw new LibsqlError(`URL scheme ${JSON.stringify(config.scheme + ":")} is not supported by the local sqlite3 client. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
  }
  const authority = config.authority;
  if (authority !== void 0) {
    const host = authority.host.toLowerCase();
    if (host !== "" && host !== "localhost") {
      throw new LibsqlError(`Invalid host in file URL: ${JSON.stringify(authority.host)}. A "file:" URL with an absolute path should start with one slash ("file:/absolute/path.db") or with three slashes ("file:///absolute/path.db"). For more information, please read ${supportedUrlLink}`, "URL_INVALID");
    }
    if (authority.port !== void 0) {
      throw new LibsqlError("File URL cannot have a port", "URL_INVALID");
    }
    if (authority.userinfo !== void 0) {
      throw new LibsqlError("File URL cannot have username and password", "URL_INVALID");
    }
  }
  let isInMemory = isInMemoryConfig(config);
  if (isInMemory && config.syncUrl) {
    throw new LibsqlError(`Embedded replica must use file for local db but URI with in-memory mode were provided instead: ${config.path}`, "URL_INVALID");
  }
  let path2 = config.path;
  if (isInMemory) {
    path2 = `${config.scheme}:${config.path}`;
  }
  const maxConnections = isInMemory || config.syncUrl ? 1 : Math.max(1, config.concurrency);
  const options = {
    authToken: config.authToken,
    encryptionKey: config.encryptionKey,
    remoteEncryptionKey: config.remoteEncryptionKey,
    syncUrl: config.syncUrl,
    syncPeriod: config.syncInterval,
    readYourWrites: config.readYourWrites,
    offline: config.offline,
    timeout: config.timeout
  };
  const pool = new ConnectionPool(path2, options, maxConnections);
  const db = pool.acquireSync();
  try {
    executeStmt(db, "SELECT 1 AS checkThatTheDatabaseCanBeOpened", config.intMode);
  } catch (e) {
    pool.close();
    throw e;
  }
  pool.release(db);
  return new Sqlite3Client(pool, config.intMode);
}
function closeQuietly(db) {
  try {
    if (db.open) {
      db.close();
    }
  } catch {
  }
}
function executeStmt(db, stmt, intMode) {
  let sql;
  let args;
  if (typeof stmt === "string") {
    sql = stmt;
    args = [];
  } else {
    sql = stmt.sql;
    if (Array.isArray(stmt.args)) {
      args = stmt.args.map((value) => valueToSql(value, intMode));
    } else {
      args = {};
      for (const name in stmt.args) {
        const argName = name[0] === "@" || name[0] === "$" || name[0] === ":" ? name.substring(1) : name;
        args[argName] = valueToSql(stmt.args[name], intMode);
      }
    }
  }
  try {
    const sqlStmt = db.prepare(sql);
    sqlStmt.safeIntegers(true);
    let returnsData = true;
    try {
      sqlStmt.raw(true);
    } catch {
      returnsData = false;
    }
    if (returnsData) {
      const columns = Array.from(sqlStmt.columns().map((col) => col.name));
      const columnTypes = Array.from(sqlStmt.columns().map((col) => col.type ?? ""));
      const rows = sqlStmt.all(args).map((sqlRow) => {
        return rowFromSql(sqlRow, columns, intMode);
      });
      const rowsAffected = 0;
      const lastInsertRowid = void 0;
      return new ResultSetImpl(columns, columnTypes, rows, rowsAffected, lastInsertRowid);
    } else {
      const info = sqlStmt.run(args);
      const rowsAffected = info.changes;
      const lastInsertRowid = BigInt(info.lastInsertRowid);
      return new ResultSetImpl([], [], [], rowsAffected, lastInsertRowid);
    }
  } catch (e) {
    throw mapSqliteError(e);
  }
}
function rowFromSql(sqlRow, columns, intMode) {
  const row = {};
  Object.defineProperty(row, "length", { value: sqlRow.length });
  for (let i = 0; i < sqlRow.length; ++i) {
    const value = valueFromSql(sqlRow[i], intMode);
    Object.defineProperty(row, i, { value });
    const column = columns[i];
    if (!Object.hasOwn(row, column)) {
      Object.defineProperty(row, column, {
        value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
  }
  return row;
}
function valueFromSql(sqlValue, intMode) {
  if (typeof sqlValue === "bigint") {
    if (intMode === "number") {
      if (sqlValue < minSafeBigint || sqlValue > maxSafeBigint) {
        throw new RangeError("Received integer which cannot be safely represented as a JavaScript number");
      }
      return Number(sqlValue);
    } else if (intMode === "bigint") {
      return sqlValue;
    } else if (intMode === "string") {
      return "" + sqlValue;
    } else {
      throw new Error("Invalid value for IntMode");
    }
  } else if (sqlValue instanceof import_node_buffer.Buffer) {
    return sqlValue.buffer;
  }
  return sqlValue;
}
function valueToSql(value, intMode) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Only finite numbers (not Infinity or NaN) can be passed as arguments");
    }
    return value;
  } else if (typeof value === "bigint") {
    if (value < minInteger || value > maxInteger) {
      throw new RangeError("bigint is too large to be represented as a 64-bit integer and passed as argument");
    }
    return value;
  } else if (typeof value === "boolean") {
    switch (intMode) {
      case "bigint":
        return value ? 1n : 0n;
      case "string":
        return value ? "1" : "0";
      default:
        return value ? 1 : 0;
    }
  } else if (value instanceof ArrayBuffer) {
    return import_node_buffer.Buffer.from(value);
  } else if (value instanceof Date) {
    return value.valueOf();
  } else if (value === void 0) {
    throw new TypeError("undefined cannot be passed as argument to the database");
  } else {
    return value;
  }
}
function executeMultiple(db, sql) {
  try {
    db.exec(sql);
  } catch (e) {
    throw mapSqliteError(e);
  }
}
function mapSqliteError(e) {
  if (e instanceof import_libsql.default.SqliteError) {
    const extendedCode = e.code;
    const code = mapToBaseCode(e.rawCode);
    return new LibsqlError(e.message, code, extendedCode, e.rawCode, e);
  }
  return e;
}
function mapToBaseCode(rawCode) {
  if (rawCode === void 0) {
    return "SQLITE_UNKNOWN";
  }
  const baseCode = rawCode & 255;
  return sqliteErrorCodes[baseCode] ?? `SQLITE_UNKNOWN_${baseCode.toString()}`;
}
var import_libsql, import_node_buffer, ConnectionPool, Sqlite3Client, Sqlite3Transaction, minSafeBigint, maxSafeBigint, minInteger, maxInteger, sqliteErrorCodes;
var init_sqlite3 = __esm({
  "node_modules/@libsql/client/lib-esm/sqlite3.js"() {
    import_libsql = __toESM(require_libsql(), 1);
    import_node_buffer = require("node:buffer");
    init_api();
    init_config();
    init_util();
    init_api();
    ConnectionPool = class {
      #path;
      #options;
      #maxConnections;
      #idle;
      #borrowed;
      // the subset of `#borrowed` held by an open transaction
      #heldByTransaction;
      #waiters;
      #closed;
      constructor(path2, options, maxConnections) {
        this.#path = path2;
        this.#options = options;
        this.#maxConnections = maxConnections;
        this.#idle = [];
        this.#borrowed = /* @__PURE__ */ new Set();
        this.#heldByTransaction = /* @__PURE__ */ new Set();
        this.#waiters = [];
        this.#closed = false;
      }
      // Borrows a connection, opening one if the pool is below its limit and
      // waiting for a release if it is not.
      //
      // Every borrow but a transaction's is a short synchronous call that
      // returns the connection before the caller sees it again, so waiting for
      // one is safe. A transaction holds its connection until the caller commits
      // or rolls back, so if transactions hold every connection there is nothing
      // to wait for - the caller has to act first. Say so instead of hanging.
      acquire(forTransaction = false) {
        if (!this.#closed && this.#atLimit()) {
          if (this.#heldByTransaction.size >= this.#maxConnections) {
            return Promise.reject(new LibsqlError(this.#maxConnections === 1 ? "This client has a single connection, which an open transaction is holding. In-memory databases and embedded replicas cannot have more than one. Commit or roll back the transaction before using the client again." : `All ${this.#maxConnections} of this client's connections are held by open transactions. Commit or roll back one before using the client again, or raise \`concurrency\`.`, "TRANSACTION_ACTIVE"));
          }
          return new Promise((resolve, reject) => this.#waiters.push({
            resolve: (db) => {
              if (forTransaction) {
                this.#heldByTransaction.add(db);
              }
              resolve(db);
            },
            reject
          }));
        }
        try {
          return Promise.resolve(this.acquireSync(forTransaction));
        } catch (e) {
          return Promise.reject(e);
        }
      }
      // Borrows a connection without waiting. Only valid when the pool cannot be
      // at its limit yet, which is why it is used for the initial probe.
      acquireSync(forTransaction = false) {
        this.#checkNotClosed();
        const idle = this.#idle.pop();
        const db = idle ?? new import_libsql.default(this.#path, this.#options);
        this.#borrowed.add(db);
        if (forTransaction) {
          this.#heldByTransaction.add(db);
        }
        return db;
      }
      // Returns a borrowed connection to the pool, handing it straight to a
      // waiter if there is one.
      release(db) {
        this.#borrowed.delete(db);
        this.#heldByTransaction.delete(db);
        if (db.open && db.inTransaction) {
          try {
            db.prepare("ROLLBACK").run();
          } catch {
            closeQuietly(db);
            return;
          }
        }
        if (this.#closed || !db.open) {
          closeQuietly(db);
          return;
        }
        const waiter = this.#waiters.shift();
        if (waiter !== void 0) {
          this.#borrowed.add(db);
          waiter.resolve(db);
        } else {
          this.#idle.push(db);
        }
      }
      close() {
        this.#closed = true;
        for (const db of this.#idle) {
          closeQuietly(db);
        }
        this.#idle = [];
        for (const db of this.#borrowed) {
          closeQuietly(db);
        }
        this.#borrowed.clear();
        this.#heldByTransaction.clear();
        const waiters = this.#waiters;
        this.#waiters = [];
        for (const waiter of waiters) {
          waiter.reject(new LibsqlError("The client is closed", "CLIENT_CLOSED"));
        }
      }
      reopen() {
        this.close();
        this.#closed = false;
      }
      #atLimit() {
        return this.#idle.length === 0 && this.#borrowed.size >= this.#maxConnections;
      }
      #checkNotClosed() {
        if (this.#closed) {
          throw new LibsqlError("The client is closed", "CLIENT_CLOSED");
        }
      }
    };
    Sqlite3Client = class {
      #pool;
      #intMode;
      closed;
      protocol;
      /** @private */
      constructor(pool, intMode) {
        this.#pool = pool;
        this.#intMode = intMode;
        this.closed = false;
        this.protocol = "file";
      }
      async execute(stmtOrSql, args) {
        let stmt;
        if (typeof stmtOrSql === "string") {
          stmt = {
            sql: stmtOrSql,
            args: args || []
          };
        } else {
          stmt = stmtOrSql;
        }
        this.#checkNotClosed();
        const db = await this.#pool.acquire();
        try {
          this.#checkUsable(db);
          return executeStmt(db, stmt, this.#intMode);
        } finally {
          this.#pool.release(db);
        }
      }
      async batch(stmts, mode = "deferred") {
        this.#checkNotClosed();
        const db = await this.#pool.acquire();
        try {
          this.#checkUsable(db);
          executeStmt(db, transactionModeToBegin(mode), this.#intMode);
          const resultSets = [];
          for (let i = 0; i < stmts.length; i++) {
            try {
              if (!db.inTransaction) {
                throw new LibsqlBatchError("The transaction has been rolled back", i, "TRANSACTION_CLOSED");
              }
              const stmt = stmts[i];
              const normalizedStmt = Array.isArray(stmt) ? { sql: stmt[0], args: stmt[1] || [] } : stmt;
              resultSets.push(executeStmt(db, normalizedStmt, this.#intMode));
            } catch (e) {
              if (e instanceof LibsqlBatchError) {
                throw e;
              }
              if (e instanceof LibsqlError) {
                throw new LibsqlBatchError(e.message, i, e.code, e.extendedCode, e.rawCode, e.cause instanceof Error ? e.cause : void 0);
              }
              throw e;
            }
          }
          executeStmt(db, "COMMIT", this.#intMode);
          return resultSets;
        } finally {
          this.#pool.release(db);
        }
      }
      async migrate(stmts) {
        this.#checkNotClosed();
        const db = await this.#pool.acquire();
        try {
          this.#checkUsable(db);
          executeStmt(db, "PRAGMA foreign_keys=off", this.#intMode);
          executeStmt(db, transactionModeToBegin("deferred"), this.#intMode);
          const resultSets = [];
          for (let i = 0; i < stmts.length; i++) {
            try {
              if (!db.inTransaction) {
                throw new LibsqlBatchError("The transaction has been rolled back", i, "TRANSACTION_CLOSED");
              }
              resultSets.push(executeStmt(db, stmts[i], this.#intMode));
            } catch (e) {
              if (e instanceof LibsqlBatchError) {
                throw e;
              }
              if (e instanceof LibsqlError) {
                throw new LibsqlBatchError(e.message, i, e.code, e.extendedCode, e.rawCode, e.cause instanceof Error ? e.cause : void 0);
              }
              throw e;
            }
          }
          executeStmt(db, "COMMIT", this.#intMode);
          return resultSets;
        } finally {
          if (db.inTransaction) {
            executeStmt(db, "ROLLBACK", this.#intMode);
          }
          executeStmt(db, "PRAGMA foreign_keys=on", this.#intMode);
          this.#pool.release(db);
        }
      }
      async transaction(mode = "write") {
        this.#checkNotClosed();
        const db = await this.#pool.acquire(true);
        try {
          this.#checkUsable(db);
          executeStmt(db, transactionModeToBegin(mode), this.#intMode);
        } catch (e) {
          this.#pool.release(db);
          throw e;
        }
        return new Sqlite3Transaction(db, this.#intMode, (used) => this.#pool.release(used));
      }
      async executeMultiple(sql) {
        this.#checkNotClosed();
        const db = await this.#pool.acquire();
        try {
          this.#checkUsable(db);
          return executeMultiple(db, sql);
        } finally {
          this.#pool.release(db);
        }
      }
      async sync() {
        this.#checkNotClosed();
        const db = await this.#pool.acquire();
        try {
          this.#checkUsable(db);
          const rep = await db.sync();
          return {
            frames_synced: rep.frames_synced,
            frame_no: rep.frame_no
          };
        } finally {
          this.#pool.release(db);
        }
      }
      async reconnect() {
        this.#pool.reopen();
        this.closed = false;
      }
      close() {
        this.closed = true;
        this.#pool.close();
      }
      #checkNotClosed() {
        if (this.closed) {
          throw new LibsqlError("The client is closed", "CLIENT_CLOSED");
        }
      }
      // `close()` and `reconnect()` are synchronous and can land between a
      // borrow and the work it was borrowed for, closing the connection under an
      // operation that is already holding one. Without this the operation
      // reaches libsql with a closed handle and fails with a raw TypeError.
      #checkUsable(db) {
        this.#checkNotClosed();
        if (!db.open) {
          throw new LibsqlError("The connection was closed while this operation was in flight", "CLIENT_CLOSED");
        }
      }
    };
    Sqlite3Transaction = class {
      // null once the connection has been returned to the pool
      #database;
      #intMode;
      #release;
      /** @private */
      constructor(database, intMode, release) {
        this.#database = database;
        this.#intMode = intMode;
        this.#release = release;
      }
      // Returns the connection to the pool. Idempotent, so every exit path can
      // call it without checking whether another already did.
      #settle() {
        const db = this.#database;
        if (db === null) {
          return;
        }
        this.#database = null;
        this.#release(db);
      }
      #getDatabase() {
        this.#checkNotClosed();
        return this.#database;
      }
      async execute(stmtOrSql, args) {
        let stmt;
        if (typeof stmtOrSql === "string") {
          stmt = {
            sql: stmtOrSql,
            args: args || []
          };
        } else {
          stmt = stmtOrSql;
        }
        return executeStmt(this.#getDatabase(), stmt, this.#intMode);
      }
      async batch(stmts) {
        const resultSets = [];
        for (let i = 0; i < stmts.length; i++) {
          try {
            const db = this.#getDatabase();
            const stmt = stmts[i];
            const normalizedStmt = Array.isArray(stmt) ? { sql: stmt[0], args: stmt[1] || [] } : stmt;
            resultSets.push(executeStmt(db, normalizedStmt, this.#intMode));
          } catch (e) {
            if (e instanceof LibsqlBatchError) {
              throw e;
            }
            if (e instanceof LibsqlError) {
              throw new LibsqlBatchError(e.message, i, e.code, e.extendedCode, e.rawCode, e.cause instanceof Error ? e.cause : void 0);
            }
            throw e;
          }
        }
        return resultSets;
      }
      async executeMultiple(sql) {
        return executeMultiple(this.#getDatabase(), sql);
      }
      async rollback() {
        const db = this.#database;
        if (db === null || !db.open) {
          this.#settle();
          return;
        }
        try {
          this.#checkNotClosed();
          executeStmt(db, "ROLLBACK", this.#intMode);
        } finally {
          this.#settle();
        }
      }
      async commit() {
        try {
          executeStmt(this.#getDatabase(), "COMMIT", this.#intMode);
        } finally {
          this.#settle();
        }
      }
      close() {
        const db = this.#database;
        if (db === null) {
          return;
        }
        try {
          if (db.open && db.inTransaction) {
            executeStmt(db, "ROLLBACK", this.#intMode);
          }
        } finally {
          this.#settle();
        }
      }
      get closed() {
        const db = this.#database;
        if (db === null || !db.open) {
          return true;
        }
        return !db.inTransaction;
      }
      #checkNotClosed() {
        if (this.closed) {
          throw new LibsqlError("The transaction is closed", "TRANSACTION_CLOSED");
        }
      }
    };
    minSafeBigint = -9007199254740991n;
    maxSafeBigint = 9007199254740991n;
    minInteger = -9223372036854775808n;
    maxInteger = 9223372036854775807n;
    sqliteErrorCodes = {
      1: "SQLITE_ERROR",
      2: "SQLITE_INTERNAL",
      3: "SQLITE_PERM",
      4: "SQLITE_ABORT",
      5: "SQLITE_BUSY",
      6: "SQLITE_LOCKED",
      7: "SQLITE_NOMEM",
      8: "SQLITE_READONLY",
      9: "SQLITE_INTERRUPT",
      10: "SQLITE_IOERR",
      11: "SQLITE_CORRUPT",
      12: "SQLITE_NOTFOUND",
      13: "SQLITE_FULL",
      14: "SQLITE_CANTOPEN",
      15: "SQLITE_PROTOCOL",
      16: "SQLITE_EMPTY",
      17: "SQLITE_SCHEMA",
      18: "SQLITE_TOOBIG",
      19: "SQLITE_CONSTRAINT",
      20: "SQLITE_MISMATCH",
      21: "SQLITE_MISUSE",
      22: "SQLITE_NOLFS",
      23: "SQLITE_AUTH",
      24: "SQLITE_FORMAT",
      25: "SQLITE_RANGE",
      26: "SQLITE_NOTADB",
      27: "SQLITE_NOTICE",
      28: "SQLITE_WARNING"
    };
  }
});

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes3, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            if (!options || options.protocols === void 0) {
              protocols = [];
            } else if (Array.isArray(options.protocols)) {
              protocols = options.protocols;
            } else {
              protocols = [options.protocols];
            }
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              if (options.protocols === void 0) {
                protocols = [];
              } else if (Array.isArray(options.protocols)) {
                protocols = options.protocols;
              } else {
                protocols = [options.protocols];
              }
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        this._readyState = _WebSocket.CLOSING;
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        protocols: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes3(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version2 = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version2 !== 13 && version2 !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version2 === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ws/wrapper.mjs
var import_stream, import_extension, import_permessage_deflate, import_receiver, import_sender, import_subprotocol, import_websocket, import_websocket_server;
var init_wrapper = __esm({
  "node_modules/ws/wrapper.mjs"() {
    import_stream = __toESM(require_stream(), 1);
    import_extension = __toESM(require_extension(), 1);
    import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
    import_receiver = __toESM(require_receiver(), 1);
    import_sender = __toESM(require_sender(), 1);
    import_subprotocol = __toESM(require_subprotocol(), 1);
    import_websocket = __toESM(require_websocket(), 1);
    import_websocket_server = __toESM(require_websocket_server(), 1);
  }
});

// node_modules/@libsql/isomorphic-ws/node.mjs
var init_node = __esm({
  "node_modules/@libsql/isomorphic-ws/node.mjs"() {
    init_wrapper();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/client.js
var Client;
var init_client = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/client.js"() {
    Client = class {
      /** @private */
      constructor() {
        this.intMode = "number";
      }
      /** Representation of integers returned from the database. See {@link IntMode}.
       *
       * This value is inherited by {@link Stream} objects created with {@link openStream}, but you can
       * override the integer mode for every stream by setting {@link Stream.intMode} on the stream.
       */
      intMode;
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/errors.js
var ClientError, ProtoError, ResponseError, ClosedError, WebSocketUnsupportedError, WebSocketError, HttpServerError, ProtocolVersionError, InternalError, MisuseError;
var init_errors = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/errors.js"() {
    ClientError = class extends Error {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "ClientError";
      }
    };
    ProtoError = class extends ClientError {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "ProtoError";
      }
    };
    ResponseError = class extends ClientError {
      code;
      /** @internal */
      proto;
      /** @private */
      constructor(message, protoError) {
        super(message);
        this.name = "ResponseError";
        this.code = protoError.code;
        this.proto = protoError;
        this.stack = void 0;
      }
    };
    ClosedError = class extends ClientError {
      /** @private */
      constructor(message, cause) {
        if (cause !== void 0) {
          super(`${message}: ${cause}`);
          this.cause = cause;
        } else {
          super(message);
        }
        this.name = "ClosedError";
      }
    };
    WebSocketUnsupportedError = class extends ClientError {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "WebSocketUnsupportedError";
      }
    };
    WebSocketError = class extends ClientError {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "WebSocketError";
      }
    };
    HttpServerError = class extends ClientError {
      status;
      /** @private */
      constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "HttpServerError";
      }
    };
    ProtocolVersionError = class extends ClientError {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "ProtocolVersionError";
      }
    };
    InternalError = class extends ClientError {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "InternalError";
      }
    };
    MisuseError = class extends ClientError {
      /** @private */
      constructor(message) {
        super(message);
        this.name = "MisuseError";
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/encoding/json/decode.js
function string(value) {
  if (typeof value === "string") {
    return value;
  }
  throw typeError(value, "string");
}
function stringOpt(value) {
  if (value === null || value === void 0) {
    return void 0;
  } else if (typeof value === "string") {
    return value;
  }
  throw typeError(value, "string or null");
}
function number(value) {
  if (typeof value === "number") {
    return value;
  }
  throw typeError(value, "number");
}
function boolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  throw typeError(value, "boolean");
}
function array(value) {
  if (Array.isArray(value)) {
    return value;
  }
  throw typeError(value, "array");
}
function object(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  throw typeError(value, "object");
}
function arrayObjectsMap(value, fun) {
  return array(value).map((elemValue) => fun(object(elemValue)));
}
function typeError(value, expected) {
  if (value === void 0) {
    return new ProtoError(`Expected ${expected}, but the property was missing`);
  }
  let received = typeof value;
  if (value === null) {
    received = "null";
  } else if (Array.isArray(value)) {
    received = "array";
  }
  return new ProtoError(`Expected ${expected}, received ${received}`);
}
function readJsonObject(value, fun) {
  return fun(object(value));
}
var init_decode = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/encoding/json/decode.js"() {
    init_errors();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/encoding/json/encode.js
function writeJsonObject(value, fun) {
  const output = [];
  const writer = new ObjectWriter(output);
  writer.begin();
  fun(writer, value);
  writer.end();
  return output.join("");
}
var ObjectWriter;
var init_encode = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/encoding/json/encode.js"() {
    ObjectWriter = class {
      #output;
      #isFirst;
      constructor(output) {
        this.#output = output;
        this.#isFirst = false;
      }
      begin() {
        this.#output.push("{");
        this.#isFirst = true;
      }
      end() {
        this.#output.push("}");
        this.#isFirst = false;
      }
      #key(name) {
        if (this.#isFirst) {
          this.#output.push('"');
          this.#isFirst = false;
        } else {
          this.#output.push(',"');
        }
        this.#output.push(name);
        this.#output.push('":');
      }
      string(name, value) {
        this.#key(name);
        this.#output.push(JSON.stringify(value));
      }
      stringRaw(name, value) {
        this.#key(name);
        this.#output.push('"');
        this.#output.push(value);
        this.#output.push('"');
      }
      number(name, value) {
        this.#key(name);
        this.#output.push("" + value);
      }
      boolean(name, value) {
        this.#key(name);
        this.#output.push(value ? "true" : "false");
      }
      object(name, value, valueFun) {
        this.#key(name);
        this.begin();
        valueFun(this, value);
        this.end();
      }
      arrayObjects(name, values, valueFun) {
        this.#key(name);
        this.#output.push("[");
        for (let i = 0; i < values.length; ++i) {
          if (i !== 0) {
            this.#output.push(",");
          }
          this.begin();
          valueFun(this, values[i]);
          this.end();
        }
        this.#output.push("]");
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/util.js
var VARINT, FIXED_64, LENGTH_DELIMITED, FIXED_32;
var init_util2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/util.js"() {
    VARINT = 0;
    FIXED_64 = 1;
    LENGTH_DELIMITED = 2;
    FIXED_32 = 5;
  }
});

// node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/decode.js
function readProtobufMessage(data, def) {
  const msgReader = new MessageReader(data);
  const fieldReader = new FieldReader(msgReader);
  let value = def.default();
  while (!msgReader.eof()) {
    const key = msgReader.varint();
    const tag = key >> 3;
    const wireType = key & 7;
    fieldReader.setup(wireType);
    const tagFun = def[tag];
    if (tagFun !== void 0) {
      const returnedValue = tagFun(fieldReader, value);
      if (returnedValue !== void 0) {
        value = returnedValue;
      }
    }
    fieldReader.maybeSkip();
  }
  return value;
}
var MessageReader, FieldReader;
var init_decode2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/decode.js"() {
    init_errors();
    init_util2();
    MessageReader = class {
      #array;
      #view;
      #pos;
      constructor(array2) {
        this.#array = array2;
        this.#view = new DataView(array2.buffer, array2.byteOffset, array2.byteLength);
        this.#pos = 0;
      }
      varint() {
        let value = 0;
        for (let shift = 0; ; shift += 7) {
          const byte = this.#array[this.#pos++];
          value |= (byte & 127) << shift;
          if (!(byte & 128)) {
            break;
          }
        }
        return value;
      }
      varintBig() {
        let value = 0n;
        for (let shift = 0n; ; shift += 7n) {
          const byte = this.#array[this.#pos++];
          value |= BigInt(byte & 127) << shift;
          if (!(byte & 128)) {
            break;
          }
        }
        return value;
      }
      bytes(length) {
        const array2 = new Uint8Array(this.#array.buffer, this.#array.byteOffset + this.#pos, length);
        this.#pos += length;
        return array2;
      }
      double() {
        const value = this.#view.getFloat64(this.#pos, true);
        this.#pos += 8;
        return value;
      }
      skipVarint() {
        for (; ; ) {
          const byte = this.#array[this.#pos++];
          if (!(byte & 128)) {
            break;
          }
        }
      }
      skip(count) {
        this.#pos += count;
      }
      eof() {
        return this.#pos >= this.#array.byteLength;
      }
    };
    FieldReader = class {
      #reader;
      #wireType;
      constructor(reader) {
        this.#reader = reader;
        this.#wireType = -1;
      }
      setup(wireType) {
        this.#wireType = wireType;
      }
      #expect(expectedWireType) {
        if (this.#wireType !== expectedWireType) {
          throw new ProtoError(`Expected wire type ${expectedWireType}, got ${this.#wireType}`);
        }
        this.#wireType = -1;
      }
      bytes() {
        this.#expect(LENGTH_DELIMITED);
        const length = this.#reader.varint();
        return this.#reader.bytes(length);
      }
      string() {
        return new TextDecoder().decode(this.bytes());
      }
      message(def) {
        return readProtobufMessage(this.bytes(), def);
      }
      int32() {
        this.#expect(VARINT);
        return this.#reader.varint();
      }
      uint32() {
        return this.int32();
      }
      bool() {
        return this.int32() !== 0;
      }
      uint64() {
        this.#expect(VARINT);
        return this.#reader.varintBig();
      }
      sint64() {
        const value = this.uint64();
        return value >> 1n ^ -(value & 1n);
      }
      double() {
        this.#expect(FIXED_64);
        return this.#reader.double();
      }
      maybeSkip() {
        if (this.#wireType < 0) {
          return;
        } else if (this.#wireType === VARINT) {
          this.#reader.skipVarint();
        } else if (this.#wireType === FIXED_64) {
          this.#reader.skip(8);
        } else if (this.#wireType === LENGTH_DELIMITED) {
          const length = this.#reader.varint();
          this.#reader.skip(length);
        } else if (this.#wireType === FIXED_32) {
          this.#reader.skip(4);
        } else {
          throw new ProtoError(`Unexpected wire type ${this.#wireType}`);
        }
        this.#wireType = -1;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/encode.js
function writeProtobufMessage(value, fun) {
  const w = new MessageWriter();
  fun(w, value);
  return w.data();
}
var MessageWriter;
var init_encode2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/encoding/protobuf/encode.js"() {
    init_util2();
    MessageWriter = class _MessageWriter {
      #buf;
      #array;
      #view;
      #pos;
      constructor() {
        this.#buf = new ArrayBuffer(256);
        this.#array = new Uint8Array(this.#buf);
        this.#view = new DataView(this.#buf);
        this.#pos = 0;
      }
      #ensure(extra) {
        if (this.#pos + extra <= this.#buf.byteLength) {
          return;
        }
        let newCap = this.#buf.byteLength;
        while (newCap < this.#pos + extra) {
          newCap *= 2;
        }
        const newBuf = new ArrayBuffer(newCap);
        const newArray = new Uint8Array(newBuf);
        const newView = new DataView(newBuf);
        newArray.set(new Uint8Array(this.#buf, 0, this.#pos));
        this.#buf = newBuf;
        this.#array = newArray;
        this.#view = newView;
      }
      #varint(value) {
        this.#ensure(5);
        value = 0 | value;
        do {
          let byte = value & 127;
          value >>>= 7;
          byte |= value ? 128 : 0;
          this.#array[this.#pos++] = byte;
        } while (value);
      }
      #varintBig(value) {
        this.#ensure(10);
        value = value & 0xffffffffffffffffn;
        do {
          let byte = Number(value & 0x7fn);
          value >>= 7n;
          byte |= value ? 128 : 0;
          this.#array[this.#pos++] = byte;
        } while (value);
      }
      #tag(tag, wireType) {
        this.#varint(tag << 3 | wireType);
      }
      bytes(tag, value) {
        this.#tag(tag, LENGTH_DELIMITED);
        this.#varint(value.byteLength);
        this.#ensure(value.byteLength);
        this.#array.set(value, this.#pos);
        this.#pos += value.byteLength;
      }
      string(tag, value) {
        this.bytes(tag, new TextEncoder().encode(value));
      }
      message(tag, value, fun) {
        const writer = new _MessageWriter();
        fun(writer, value);
        this.bytes(tag, writer.data());
      }
      int32(tag, value) {
        this.#tag(tag, VARINT);
        this.#varint(value);
      }
      uint32(tag, value) {
        this.int32(tag, value);
      }
      bool(tag, value) {
        this.int32(tag, value ? 1 : 0);
      }
      sint64(tag, value) {
        this.#tag(tag, VARINT);
        this.#varintBig(value << 1n ^ value >> 63n);
      }
      double(tag, value) {
        this.#tag(tag, FIXED_64);
        this.#ensure(8);
        this.#view.setFloat64(this.#pos, value, true);
        this.#pos += 8;
      }
      data() {
        return new Uint8Array(this.#buf, 0, this.#pos);
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/encoding/index.js
var init_encoding = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/encoding/index.js"() {
    init_decode();
    init_encode();
    init_decode2();
    init_encode2();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/id_alloc.js
var IdAlloc;
var init_id_alloc = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/id_alloc.js"() {
    init_errors();
    IdAlloc = class {
      // Set of all allocated ids
      #usedIds;
      // Set of all free ids lower than `#usedIds.size`
      #freeIds;
      constructor() {
        this.#usedIds = /* @__PURE__ */ new Set();
        this.#freeIds = /* @__PURE__ */ new Set();
      }
      // Returns an id that was free, and marks it as used.
      alloc() {
        for (const freeId2 of this.#freeIds) {
          this.#freeIds.delete(freeId2);
          this.#usedIds.add(freeId2);
          if (!this.#usedIds.has(this.#usedIds.size - 1)) {
            this.#freeIds.add(this.#usedIds.size - 1);
          }
          return freeId2;
        }
        const freeId = this.#usedIds.size;
        this.#usedIds.add(freeId);
        return freeId;
      }
      free(id) {
        if (!this.#usedIds.delete(id)) {
          throw new InternalError("Freeing an id that is not allocated");
        }
        this.#freeIds.delete(this.#usedIds.size);
        if (id < this.#usedIds.size) {
          this.#freeIds.add(id);
        }
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/util.js
function impossible(value, message) {
  throw new InternalError(message);
}
var init_util3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/util.js"() {
    init_errors();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/value.js
function valueToProto(value) {
  if (value === null) {
    return null;
  } else if (typeof value === "string") {
    return value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Only finite numbers (not Infinity or NaN) can be passed as arguments");
    }
    return value;
  } else if (typeof value === "bigint") {
    if (value < minInteger2 || value > maxInteger2) {
      throw new RangeError("This bigint value is too large to be represented as a 64-bit integer and passed as argument");
    }
    return value;
  } else if (typeof value === "boolean") {
    return value ? 1n : 0n;
  } else if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  } else if (value instanceof Uint8Array) {
    return value;
  } else if (value instanceof Date) {
    return +value.valueOf();
  } else if (typeof value === "object") {
    return "" + value.toString();
  } else {
    throw new TypeError("Unsupported type of value");
  }
}
function valueFromProto(value, intMode) {
  if (value === null) {
    return null;
  } else if (typeof value === "number") {
    return value;
  } else if (typeof value === "string") {
    return value;
  } else if (typeof value === "bigint") {
    if (intMode === "number") {
      const num = Number(value);
      if (!Number.isSafeInteger(num)) {
        throw new RangeError("Received integer which is too large to be safely represented as a JavaScript number");
      }
      return num;
    } else if (intMode === "bigint") {
      return value;
    } else if (intMode === "string") {
      return "" + value;
    } else {
      throw new MisuseError("Invalid value for IntMode");
    }
  } else if (value instanceof Uint8Array) {
    return value.slice().buffer;
  } else if (value === void 0) {
    throw new ProtoError("Received unrecognized type of Value");
  } else {
    throw impossible(value, "Impossible type of Value");
  }
}
var minInteger2, maxInteger2;
var init_value = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/value.js"() {
    init_errors();
    init_util3();
    minInteger2 = -9223372036854775808n;
    maxInteger2 = 9223372036854775807n;
  }
});

// node_modules/@libsql/hrana-client/lib-esm/result.js
function stmtResultFromProto(result) {
  return {
    affectedRowCount: result.affectedRowCount,
    lastInsertRowid: result.lastInsertRowid,
    columnNames: result.cols.map((col) => col.name),
    columnDecltypes: result.cols.map((col) => col.decltype)
  };
}
function rowsResultFromProto(result, intMode) {
  const stmtResult = stmtResultFromProto(result);
  const rows = result.rows.map((row) => rowFromProto(stmtResult.columnNames, row, intMode));
  return { ...stmtResult, rows };
}
function rowResultFromProto(result, intMode) {
  const stmtResult = stmtResultFromProto(result);
  let row;
  if (result.rows.length > 0) {
    row = rowFromProto(stmtResult.columnNames, result.rows[0], intMode);
  }
  return { ...stmtResult, row };
}
function valueResultFromProto(result, intMode) {
  const stmtResult = stmtResultFromProto(result);
  let value;
  if (result.rows.length > 0 && stmtResult.columnNames.length > 0) {
    value = valueFromProto(result.rows[0][0], intMode);
  }
  return { ...stmtResult, value };
}
function rowFromProto(colNames, values, intMode) {
  const row = {};
  Object.defineProperty(row, "length", { value: values.length });
  for (let i = 0; i < values.length; ++i) {
    const value = valueFromProto(values[i], intMode);
    Object.defineProperty(row, i, { value });
    const colName = colNames[i];
    if (colName !== void 0 && !Object.hasOwn(row, colName)) {
      Object.defineProperty(row, colName, { value, enumerable: true, configurable: true, writable: true });
    }
  }
  return row;
}
function errorFromProto(error) {
  return new ResponseError(error.message, error);
}
var init_result = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/result.js"() {
    init_errors();
    init_value();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/sql.js
function sqlToProto(owner, sql) {
  if (sql instanceof Sql) {
    return { sqlId: sql._getSqlId(owner) };
  } else {
    return { sql: "" + sql };
  }
}
var Sql;
var init_sql = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/sql.js"() {
    init_errors();
    Sql = class {
      #owner;
      #sqlId;
      #closed;
      /** @private */
      constructor(owner, sqlId) {
        this.#owner = owner;
        this.#sqlId = sqlId;
        this.#closed = void 0;
      }
      /** @private */
      _getSqlId(owner) {
        if (this.#owner !== owner) {
          throw new MisuseError("Attempted to use SQL text opened with other object");
        } else if (this.#closed !== void 0) {
          throw new ClosedError("SQL text is closed", this.#closed);
        }
        return this.#sqlId;
      }
      /** Remove the SQL text from the server, releasing resouces. */
      close() {
        this._setClosed(new ClientError("SQL text was manually closed"));
      }
      /** @private */
      _setClosed(error) {
        if (this.#closed === void 0) {
          this.#closed = error;
          this.#owner._closeSql(this.#sqlId);
        }
      }
      /** True if the SQL text is closed (removed from the server). */
      get closed() {
        return this.#closed !== void 0;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/queue.js
var Queue;
var init_queue = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/queue.js"() {
    Queue = class {
      #pushStack;
      #shiftStack;
      constructor() {
        this.#pushStack = [];
        this.#shiftStack = [];
      }
      get length() {
        return this.#pushStack.length + this.#shiftStack.length;
      }
      push(elem) {
        this.#pushStack.push(elem);
      }
      shift() {
        if (this.#shiftStack.length === 0 && this.#pushStack.length > 0) {
          this.#shiftStack = this.#pushStack.reverse();
          this.#pushStack = [];
        }
        return this.#shiftStack.pop();
      }
      first() {
        return this.#shiftStack.length !== 0 ? this.#shiftStack[this.#shiftStack.length - 1] : this.#pushStack[0];
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/stmt.js
function stmtToProto(sqlOwner, stmt, wantRows) {
  let inSql;
  let args = [];
  let namedArgs = [];
  if (stmt instanceof Stmt) {
    inSql = stmt.sql;
    args = stmt._args;
    for (const [name, value] of stmt._namedArgs.entries()) {
      namedArgs.push({ name, value });
    }
  } else if (Array.isArray(stmt)) {
    inSql = stmt[0];
    if (Array.isArray(stmt[1])) {
      args = stmt[1].map((arg) => valueToProto(arg));
    } else {
      namedArgs = Object.entries(stmt[1]).map(([name, value]) => {
        return { name, value: valueToProto(value) };
      });
    }
  } else {
    inSql = stmt;
  }
  const { sql, sqlId } = sqlToProto(sqlOwner, inSql);
  return { sql, sqlId, args, namedArgs, wantRows };
}
var Stmt;
var init_stmt = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/stmt.js"() {
    init_sql();
    init_value();
    Stmt = class {
      /** The SQL statement text. */
      sql;
      /** @private */
      _args;
      /** @private */
      _namedArgs;
      /** Initialize the statement with given SQL text. */
      constructor(sql) {
        this.sql = sql;
        this._args = [];
        this._namedArgs = /* @__PURE__ */ new Map();
      }
      /** Binds positional parameters from the given `values`. All previous positional bindings are cleared. */
      bindIndexes(values) {
        this._args.length = 0;
        for (const value of values) {
          this._args.push(valueToProto(value));
        }
        return this;
      }
      /** Binds a parameter by a 1-based index. */
      bindIndex(index, value) {
        if (index !== (index | 0) || index <= 0) {
          throw new RangeError("Index of a positional argument must be positive integer");
        }
        while (this._args.length < index) {
          this._args.push(null);
        }
        this._args[index - 1] = valueToProto(value);
        return this;
      }
      /** Binds a parameter by name. */
      bindName(name, value) {
        this._namedArgs.set(name, valueToProto(value));
        return this;
      }
      /** Clears all bindings. */
      unbindAll() {
        this._args.length = 0;
        this._namedArgs.clear();
        return this;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/batch.js
function executeRegular(stream, steps, batch2) {
  return stream._batch(batch2).then((result) => {
    for (let step = 0; step < steps.length; ++step) {
      const stepResult = result.stepResults.get(step);
      const stepError = result.stepErrors.get(step);
      steps[step].callback(stepResult, stepError);
    }
  });
}
async function executeCursor(stream, steps, batch2) {
  const cursor = await stream._openCursor(batch2);
  try {
    let nextStep = 0;
    let beginEntry = void 0;
    let rows = [];
    for (; ; ) {
      const entry = await cursor.next();
      if (entry === void 0) {
        break;
      }
      if (entry.type === "step_begin") {
        if (entry.step < nextStep || entry.step >= steps.length) {
          throw new ProtoError("Server produced StepBeginEntry for unexpected step");
        } else if (beginEntry !== void 0) {
          throw new ProtoError("Server produced StepBeginEntry before terminating previous step");
        }
        for (let step = nextStep; step < entry.step; ++step) {
          steps[step].callback(void 0, void 0);
        }
        nextStep = entry.step + 1;
        beginEntry = entry;
        rows = [];
      } else if (entry.type === "step_end") {
        if (beginEntry === void 0) {
          throw new ProtoError("Server produced StepEndEntry but no step is active");
        }
        const stmtResult = {
          cols: beginEntry.cols,
          rows,
          affectedRowCount: entry.affectedRowCount,
          lastInsertRowid: entry.lastInsertRowid
        };
        steps[beginEntry.step].callback(stmtResult, void 0);
        beginEntry = void 0;
        rows = [];
      } else if (entry.type === "step_error") {
        if (beginEntry === void 0) {
          if (entry.step >= steps.length) {
            throw new ProtoError("Server produced StepErrorEntry for unexpected step");
          }
          for (let step = nextStep; step < entry.step; ++step) {
            steps[step].callback(void 0, void 0);
          }
        } else {
          if (entry.step !== beginEntry.step) {
            throw new ProtoError("Server produced StepErrorEntry for unexpected step");
          }
          beginEntry = void 0;
          rows = [];
        }
        steps[entry.step].callback(void 0, entry.error);
        nextStep = entry.step + 1;
      } else if (entry.type === "row") {
        if (beginEntry === void 0) {
          throw new ProtoError("Server produced RowEntry but no step is active");
        }
        rows.push(entry.row);
      } else if (entry.type === "error") {
        throw errorFromProto(entry.error);
      } else if (entry.type === "none") {
        throw new ProtoError("Server produced unrecognized CursorEntry");
      } else {
        throw impossible(entry, "Impossible CursorEntry");
      }
    }
    if (beginEntry !== void 0) {
      throw new ProtoError("Server closed Cursor before terminating active step");
    }
    for (let step = nextStep; step < steps.length; ++step) {
      steps[step].callback(void 0, void 0);
    }
  } finally {
    cursor.close();
  }
}
function stepIndex(step) {
  if (step._index === void 0) {
    throw new MisuseError("Cannot add a condition referencing a step that has not been added to the batch");
  }
  return step._index;
}
function checkCondBatch(expectedBatch, cond) {
  if (cond._batch !== expectedBatch) {
    throw new MisuseError("Cannot mix BatchCond objects for different Batch objects");
  }
}
var Batch, BatchStep, BatchCond;
var init_batch = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/batch.js"() {
    init_errors();
    init_result();
    init_stmt();
    init_util3();
    Batch = class {
      /** @private */
      _stream;
      #useCursor;
      /** @private */
      _steps;
      #executed;
      /** @private */
      constructor(stream, useCursor) {
        this._stream = stream;
        this.#useCursor = useCursor;
        this._steps = [];
        this.#executed = false;
      }
      /** Return a builder for adding a step to the batch. */
      step() {
        return new BatchStep(this);
      }
      /** Execute the batch. */
      execute() {
        if (this.#executed) {
          throw new MisuseError("This batch has already been executed");
        }
        this.#executed = true;
        const batch2 = {
          steps: this._steps.map((step) => step.proto)
        };
        if (this.#useCursor) {
          return executeCursor(this._stream, this._steps, batch2);
        } else {
          return executeRegular(this._stream, this._steps, batch2);
        }
      }
    };
    BatchStep = class {
      /** @private */
      _batch;
      #conds;
      /** @private */
      _index;
      /** @private */
      constructor(batch2) {
        this._batch = batch2;
        this.#conds = [];
        this._index = void 0;
      }
      /** Add the condition that needs to be satisfied to execute the statement. If you use this method multiple
       * times, we join the conditions with a logical AND. */
      condition(cond) {
        this.#conds.push(cond._proto);
        return this;
      }
      /** Add a statement that returns rows. */
      query(stmt) {
        return this.#add(stmt, true, rowsResultFromProto);
      }
      /** Add a statement that returns at most a single row. */
      queryRow(stmt) {
        return this.#add(stmt, true, rowResultFromProto);
      }
      /** Add a statement that returns at most a single value. */
      queryValue(stmt) {
        return this.#add(stmt, true, valueResultFromProto);
      }
      /** Add a statement without returning rows. */
      run(stmt) {
        return this.#add(stmt, false, stmtResultFromProto);
      }
      #add(inStmt, wantRows, fromProto) {
        if (this._index !== void 0) {
          throw new MisuseError("This BatchStep has already been added to the batch");
        }
        const stmt = stmtToProto(this._batch._stream._sqlOwner(), inStmt, wantRows);
        let condition;
        if (this.#conds.length === 0) {
          condition = void 0;
        } else if (this.#conds.length === 1) {
          condition = this.#conds[0];
        } else {
          condition = { type: "and", conds: this.#conds.slice() };
        }
        const proto = { stmt, condition };
        return new Promise((outputCallback, errorCallback) => {
          const callback = (stepResult, stepError) => {
            if (stepResult !== void 0 && stepError !== void 0) {
              errorCallback(new ProtoError("Server returned both result and error"));
            } else if (stepError !== void 0) {
              errorCallback(errorFromProto(stepError));
            } else if (stepResult !== void 0) {
              outputCallback(fromProto(stepResult, this._batch._stream.intMode));
            } else {
              outputCallback(void 0);
            }
          };
          this._index = this._batch._steps.length;
          this._batch._steps.push({ proto, callback });
        });
      }
    };
    BatchCond = class _BatchCond {
      /** @private */
      _batch;
      /** @private */
      _proto;
      /** @private */
      constructor(batch2, proto) {
        this._batch = batch2;
        this._proto = proto;
      }
      /** Create a condition that evaluates to true when the given step executes successfully.
       *
       * If the given step fails error or is skipped because its condition evaluated to false, this
       * condition evaluates to false.
       */
      static ok(step) {
        return new _BatchCond(step._batch, { type: "ok", step: stepIndex(step) });
      }
      /** Create a condition that evaluates to true when the given step fails.
       *
       * If the given step succeeds or is skipped because its condition evaluated to false, this condition
       * evaluates to false.
       */
      static error(step) {
        return new _BatchCond(step._batch, { type: "error", step: stepIndex(step) });
      }
      /** Create a condition that is a logical negation of another condition.
       */
      static not(cond) {
        return new _BatchCond(cond._batch, { type: "not", cond: cond._proto });
      }
      /** Create a condition that is a logical AND of other conditions.
       */
      static and(batch2, conds) {
        for (const cond of conds) {
          checkCondBatch(batch2, cond);
        }
        return new _BatchCond(batch2, { type: "and", conds: conds.map((e) => e._proto) });
      }
      /** Create a condition that is a logical OR of other conditions.
       */
      static or(batch2, conds) {
        for (const cond of conds) {
          checkCondBatch(batch2, cond);
        }
        return new _BatchCond(batch2, { type: "or", conds: conds.map((e) => e._proto) });
      }
      /** Create a condition that evaluates to true when the SQL connection is in autocommit mode (not inside an
       * explicit transaction). This requires protocol version 3 or higher.
       */
      static isAutocommit(batch2) {
        batch2._stream.client()._ensureVersion(3, "BatchCond.isAutocommit()");
        return new _BatchCond(batch2, { type: "is_autocommit" });
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/describe.js
function describeResultFromProto(result) {
  return {
    paramNames: result.params.map((p) => p.name),
    columns: result.cols,
    isExplain: result.isExplain,
    isReadonly: result.isReadonly
  };
}
var init_describe = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/describe.js"() {
  }
});

// node_modules/@libsql/hrana-client/lib-esm/stream.js
var Stream;
var init_stream = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/stream.js"() {
    init_batch();
    init_describe();
    init_result();
    init_sql();
    init_stmt();
    Stream = class {
      /** @private */
      constructor(intMode) {
        this.intMode = intMode;
      }
      /** Execute a statement and return rows. */
      query(stmt) {
        return this.#execute(stmt, true, rowsResultFromProto);
      }
      /** Execute a statement and return at most a single row. */
      queryRow(stmt) {
        return this.#execute(stmt, true, rowResultFromProto);
      }
      /** Execute a statement and return at most a single value. */
      queryValue(stmt) {
        return this.#execute(stmt, true, valueResultFromProto);
      }
      /** Execute a statement without returning rows. */
      run(stmt) {
        return this.#execute(stmt, false, stmtResultFromProto);
      }
      #execute(inStmt, wantRows, fromProto) {
        const stmt = stmtToProto(this._sqlOwner(), inStmt, wantRows);
        return this._execute(stmt).then((r) => fromProto(r, this.intMode));
      }
      /** Return a builder for creating and executing a batch.
       *
       * If `useCursor` is true, the batch will be executed using a Hrana cursor, which will stream results from
       * the server to the client, which consumes less memory on the server. This requires protocol version 3 or
       * higher.
       */
      batch(useCursor = false) {
        return new Batch(this, useCursor);
      }
      /** Parse and analyze a statement. This requires protocol version 2 or higher. */
      describe(inSql) {
        const protoSql = sqlToProto(this._sqlOwner(), inSql);
        return this._describe(protoSql).then(describeResultFromProto);
      }
      /** Execute a sequence of statements separated by semicolons. This requires protocol version 2 or higher.
       * */
      sequence(inSql) {
        const protoSql = sqlToProto(this._sqlOwner(), inSql);
        return this._sequence(protoSql);
      }
      /** Representation of integers returned from the database. See {@link IntMode}.
       *
       * This value affects the results of all operations on this stream.
       */
      intMode;
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/cursor.js
var Cursor;
var init_cursor = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/cursor.js"() {
    Cursor = class {
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/cursor.js
var fetchChunkSize, fetchQueueSize, WsCursor;
var init_cursor2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/cursor.js"() {
    init_errors();
    init_cursor();
    init_queue();
    fetchChunkSize = 1e3;
    fetchQueueSize = 10;
    WsCursor = class extends Cursor {
      #client;
      #stream;
      #cursorId;
      #entryQueue;
      #fetchQueue;
      #closed;
      #done;
      /** @private */
      constructor(client, stream, cursorId) {
        super();
        this.#client = client;
        this.#stream = stream;
        this.#cursorId = cursorId;
        this.#entryQueue = new Queue();
        this.#fetchQueue = new Queue();
        this.#closed = void 0;
        this.#done = false;
      }
      /** Fetch the next entry from the cursor. */
      async next() {
        for (; ; ) {
          if (this.#closed !== void 0) {
            throw new ClosedError("Cursor is closed", this.#closed);
          }
          while (!this.#done && this.#fetchQueue.length < fetchQueueSize) {
            this.#fetchQueue.push(this.#fetch());
          }
          const entry = this.#entryQueue.shift();
          if (this.#done || entry !== void 0) {
            return entry;
          }
          await this.#fetchQueue.shift().then((response) => {
            if (response === void 0) {
              return;
            }
            for (const entry2 of response.entries) {
              this.#entryQueue.push(entry2);
            }
            this.#done ||= response.done;
          });
        }
      }
      #fetch() {
        return this.#stream._sendCursorRequest(this, {
          type: "fetch_cursor",
          cursorId: this.#cursorId,
          maxCount: fetchChunkSize
        }).then((resp) => resp, (error) => {
          this._setClosed(error);
          return void 0;
        });
      }
      /** @private */
      _setClosed(error) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#closed = error;
        this.#stream._sendCursorRequest(this, {
          type: "close_cursor",
          cursorId: this.#cursorId
        }).catch(() => void 0);
        this.#stream._cursorClosed(this);
      }
      /** Close the cursor. */
      close() {
        this._setClosed(new ClientError("Cursor was manually closed"));
      }
      /** True if the cursor is closed. */
      get closed() {
        return this.#closed !== void 0;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/stream.js
var WsStream;
var init_stream2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/stream.js"() {
    init_errors();
    init_queue();
    init_stream();
    init_cursor2();
    WsStream = class _WsStream extends Stream {
      #client;
      #streamId;
      #queue;
      #cursor;
      #closing;
      #closed;
      /** @private */
      static open(client) {
        const streamId = client._streamIdAlloc.alloc();
        const stream = new _WsStream(client, streamId);
        const responseCallback = () => void 0;
        const errorCallback = (e) => stream.#setClosed(e);
        const request = { type: "open_stream", streamId };
        client._sendRequest(request, { responseCallback, errorCallback });
        return stream;
      }
      /** @private */
      constructor(client, streamId) {
        super(client.intMode);
        this.#client = client;
        this.#streamId = streamId;
        this.#queue = new Queue();
        this.#cursor = void 0;
        this.#closing = false;
        this.#closed = void 0;
      }
      /** Get the {@link WsClient} object that this stream belongs to. */
      client() {
        return this.#client;
      }
      /** @private */
      _sqlOwner() {
        return this.#client;
      }
      /** @private */
      _execute(stmt) {
        return this.#sendStreamRequest({
          type: "execute",
          streamId: this.#streamId,
          stmt
        }).then((response) => {
          return response.result;
        });
      }
      /** @private */
      _batch(batch2) {
        return this.#sendStreamRequest({
          type: "batch",
          streamId: this.#streamId,
          batch: batch2
        }).then((response) => {
          return response.result;
        });
      }
      /** @private */
      _describe(protoSql) {
        this.#client._ensureVersion(2, "describe()");
        return this.#sendStreamRequest({
          type: "describe",
          streamId: this.#streamId,
          sql: protoSql.sql,
          sqlId: protoSql.sqlId
        }).then((response) => {
          return response.result;
        });
      }
      /** @private */
      _sequence(protoSql) {
        this.#client._ensureVersion(2, "sequence()");
        return this.#sendStreamRequest({
          type: "sequence",
          streamId: this.#streamId,
          sql: protoSql.sql,
          sqlId: protoSql.sqlId
        }).then((_response) => {
          return void 0;
        });
      }
      /** Check whether the SQL connection underlying this stream is in autocommit state (i.e., outside of an
       * explicit transaction). This requires protocol version 3 or higher.
       */
      getAutocommit() {
        this.#client._ensureVersion(3, "getAutocommit()");
        return this.#sendStreamRequest({
          type: "get_autocommit",
          streamId: this.#streamId
        }).then((response) => {
          return response.isAutocommit;
        });
      }
      #sendStreamRequest(request) {
        return new Promise((responseCallback, errorCallback) => {
          this.#pushToQueue({ type: "request", request, responseCallback, errorCallback });
        });
      }
      /** @private */
      _openCursor(batch2) {
        this.#client._ensureVersion(3, "cursor");
        return new Promise((cursorCallback, errorCallback) => {
          this.#pushToQueue({ type: "cursor", batch: batch2, cursorCallback, errorCallback });
        });
      }
      /** @private */
      _sendCursorRequest(cursor, request) {
        if (cursor !== this.#cursor) {
          throw new InternalError("Cursor not associated with the stream attempted to execute a request");
        }
        return new Promise((responseCallback, errorCallback) => {
          if (this.#closed !== void 0) {
            errorCallback(new ClosedError("Stream is closed", this.#closed));
          } else {
            this.#client._sendRequest(request, { responseCallback, errorCallback });
          }
        });
      }
      /** @private */
      _cursorClosed(cursor) {
        if (cursor !== this.#cursor) {
          throw new InternalError("Cursor was closed, but it was not associated with the stream");
        }
        this.#cursor = void 0;
        this.#flushQueue();
      }
      #pushToQueue(entry) {
        if (this.#closed !== void 0) {
          entry.errorCallback(new ClosedError("Stream is closed", this.#closed));
        } else if (this.#closing) {
          entry.errorCallback(new ClosedError("Stream is closing", void 0));
        } else {
          this.#queue.push(entry);
          this.#flushQueue();
        }
      }
      #flushQueue() {
        for (; ; ) {
          const entry = this.#queue.first();
          if (entry === void 0 && this.#cursor === void 0 && this.#closing) {
            this.#setClosed(new ClientError("Stream was gracefully closed"));
            break;
          } else if (entry?.type === "request" && this.#cursor === void 0) {
            const { request, responseCallback, errorCallback } = entry;
            this.#queue.shift();
            this.#client._sendRequest(request, { responseCallback, errorCallback });
          } else if (entry?.type === "cursor" && this.#cursor === void 0) {
            const { batch: batch2, cursorCallback } = entry;
            this.#queue.shift();
            const cursorId = this.#client._cursorIdAlloc.alloc();
            const cursor = new WsCursor(this.#client, this, cursorId);
            const request = {
              type: "open_cursor",
              streamId: this.#streamId,
              cursorId,
              batch: batch2
            };
            const responseCallback = () => void 0;
            const errorCallback = (e) => cursor._setClosed(e);
            this.#client._sendRequest(request, { responseCallback, errorCallback });
            this.#cursor = cursor;
            cursorCallback(cursor);
          } else {
            break;
          }
        }
      }
      #setClosed(error) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#closed = error;
        if (this.#cursor !== void 0) {
          this.#cursor._setClosed(error);
        }
        for (; ; ) {
          const entry = this.#queue.shift();
          if (entry !== void 0) {
            entry.errorCallback(error);
          } else {
            break;
          }
        }
        const request = { type: "close_stream", streamId: this.#streamId };
        const responseCallback = () => this.#client._streamIdAlloc.free(this.#streamId);
        const errorCallback = () => void 0;
        this.#client._sendRequest(request, { responseCallback, errorCallback });
      }
      /** Immediately close the stream. */
      close() {
        this.#setClosed(new ClientError("Stream was manually closed"));
      }
      /** Gracefully close the stream. */
      closeGracefully() {
        this.#closing = true;
        this.#flushQueue();
      }
      /** True if the stream is closed or closing. */
      get closed() {
        return this.#closed !== void 0 || this.#closing;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/shared/json_encode.js
function Stmt2(w, msg) {
  if (msg.sql !== void 0) {
    w.string("sql", msg.sql);
  }
  if (msg.sqlId !== void 0) {
    w.number("sql_id", msg.sqlId);
  }
  w.arrayObjects("args", msg.args, Value);
  w.arrayObjects("named_args", msg.namedArgs, NamedArg);
  w.boolean("want_rows", msg.wantRows);
}
function NamedArg(w, msg) {
  w.string("name", msg.name);
  w.object("value", msg.value, Value);
}
function Batch2(w, msg) {
  w.arrayObjects("steps", msg.steps, BatchStep2);
}
function BatchStep2(w, msg) {
  if (msg.condition !== void 0) {
    w.object("condition", msg.condition, BatchCond2);
  }
  w.object("stmt", msg.stmt, Stmt2);
}
function BatchCond2(w, msg) {
  w.stringRaw("type", msg.type);
  if (msg.type === "ok" || msg.type === "error") {
    w.number("step", msg.step);
  } else if (msg.type === "not") {
    w.object("cond", msg.cond, BatchCond2);
  } else if (msg.type === "and" || msg.type === "or") {
    w.arrayObjects("conds", msg.conds, BatchCond2);
  } else if (msg.type === "is_autocommit") {
  } else {
    throw impossible(msg, "Impossible type of BatchCond");
  }
}
function Value(w, msg) {
  if (msg === null) {
    w.stringRaw("type", "null");
  } else if (typeof msg === "bigint") {
    w.stringRaw("type", "integer");
    w.stringRaw("value", "" + msg);
  } else if (typeof msg === "number") {
    w.stringRaw("type", "float");
    w.number("value", msg);
  } else if (typeof msg === "string") {
    w.stringRaw("type", "text");
    w.string("value", msg);
  } else if (msg instanceof Uint8Array) {
    w.stringRaw("type", "blob");
    w.stringRaw("base64", gBase64.fromUint8Array(msg));
  } else if (msg === void 0) {
  } else {
    throw impossible(msg, "Impossible type of Value");
  }
}
var init_json_encode = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/shared/json_encode.js"() {
    init_base64();
    init_util3();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/json_encode.js
function ClientMsg(w, msg) {
  w.stringRaw("type", msg.type);
  if (msg.type === "hello") {
    if (msg.jwt !== void 0) {
      w.string("jwt", msg.jwt);
    }
  } else if (msg.type === "request") {
    w.number("request_id", msg.requestId);
    w.object("request", msg.request, Request2);
  } else {
    throw impossible(msg, "Impossible type of ClientMsg");
  }
}
function Request2(w, msg) {
  w.stringRaw("type", msg.type);
  if (msg.type === "open_stream") {
    w.number("stream_id", msg.streamId);
  } else if (msg.type === "close_stream") {
    w.number("stream_id", msg.streamId);
  } else if (msg.type === "execute") {
    w.number("stream_id", msg.streamId);
    w.object("stmt", msg.stmt, Stmt2);
  } else if (msg.type === "batch") {
    w.number("stream_id", msg.streamId);
    w.object("batch", msg.batch, Batch2);
  } else if (msg.type === "open_cursor") {
    w.number("stream_id", msg.streamId);
    w.number("cursor_id", msg.cursorId);
    w.object("batch", msg.batch, Batch2);
  } else if (msg.type === "close_cursor") {
    w.number("cursor_id", msg.cursorId);
  } else if (msg.type === "fetch_cursor") {
    w.number("cursor_id", msg.cursorId);
    w.number("max_count", msg.maxCount);
  } else if (msg.type === "sequence") {
    w.number("stream_id", msg.streamId);
    if (msg.sql !== void 0) {
      w.string("sql", msg.sql);
    }
    if (msg.sqlId !== void 0) {
      w.number("sql_id", msg.sqlId);
    }
  } else if (msg.type === "describe") {
    w.number("stream_id", msg.streamId);
    if (msg.sql !== void 0) {
      w.string("sql", msg.sql);
    }
    if (msg.sqlId !== void 0) {
      w.number("sql_id", msg.sqlId);
    }
  } else if (msg.type === "store_sql") {
    w.number("sql_id", msg.sqlId);
    w.string("sql", msg.sql);
  } else if (msg.type === "close_sql") {
    w.number("sql_id", msg.sqlId);
  } else if (msg.type === "get_autocommit") {
    w.number("stream_id", msg.streamId);
  } else {
    throw impossible(msg, "Impossible type of Request");
  }
}
var init_json_encode2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/json_encode.js"() {
    init_json_encode();
    init_util3();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/shared/protobuf_encode.js
function Stmt3(w, msg) {
  if (msg.sql !== void 0) {
    w.string(1, msg.sql);
  }
  if (msg.sqlId !== void 0) {
    w.int32(2, msg.sqlId);
  }
  for (const arg of msg.args) {
    w.message(3, arg, Value2);
  }
  for (const arg of msg.namedArgs) {
    w.message(4, arg, NamedArg2);
  }
  w.bool(5, msg.wantRows);
}
function NamedArg2(w, msg) {
  w.string(1, msg.name);
  w.message(2, msg.value, Value2);
}
function Batch3(w, msg) {
  for (const step of msg.steps) {
    w.message(1, step, BatchStep3);
  }
}
function BatchStep3(w, msg) {
  if (msg.condition !== void 0) {
    w.message(1, msg.condition, BatchCond3);
  }
  w.message(2, msg.stmt, Stmt3);
}
function BatchCond3(w, msg) {
  if (msg.type === "ok") {
    w.uint32(1, msg.step);
  } else if (msg.type === "error") {
    w.uint32(2, msg.step);
  } else if (msg.type === "not") {
    w.message(3, msg.cond, BatchCond3);
  } else if (msg.type === "and") {
    w.message(4, msg.conds, BatchCondList);
  } else if (msg.type === "or") {
    w.message(5, msg.conds, BatchCondList);
  } else if (msg.type === "is_autocommit") {
    w.message(6, void 0, Empty);
  } else {
    throw impossible(msg, "Impossible type of BatchCond");
  }
}
function BatchCondList(w, msg) {
  for (const cond of msg) {
    w.message(1, cond, BatchCond3);
  }
}
function Value2(w, msg) {
  if (msg === null) {
    w.message(1, void 0, Empty);
  } else if (typeof msg === "bigint") {
    w.sint64(2, msg);
  } else if (typeof msg === "number") {
    w.double(3, msg);
  } else if (typeof msg === "string") {
    w.string(4, msg);
  } else if (msg instanceof Uint8Array) {
    w.bytes(5, msg);
  } else if (msg === void 0) {
  } else {
    throw impossible(msg, "Impossible type of Value");
  }
}
function Empty(_w, _msg) {
}
var init_protobuf_encode = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/shared/protobuf_encode.js"() {
    init_util3();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/protobuf_encode.js
function ClientMsg2(w, msg) {
  if (msg.type === "hello") {
    w.message(1, msg, HelloMsg);
  } else if (msg.type === "request") {
    w.message(2, msg, RequestMsg);
  } else {
    throw impossible(msg, "Impossible type of ClientMsg");
  }
}
function HelloMsg(w, msg) {
  if (msg.jwt !== void 0) {
    w.string(1, msg.jwt);
  }
}
function RequestMsg(w, msg) {
  w.int32(1, msg.requestId);
  const request = msg.request;
  if (request.type === "open_stream") {
    w.message(2, request, OpenStreamReq);
  } else if (request.type === "close_stream") {
    w.message(3, request, CloseStreamReq);
  } else if (request.type === "execute") {
    w.message(4, request, ExecuteReq);
  } else if (request.type === "batch") {
    w.message(5, request, BatchReq);
  } else if (request.type === "open_cursor") {
    w.message(6, request, OpenCursorReq);
  } else if (request.type === "close_cursor") {
    w.message(7, request, CloseCursorReq);
  } else if (request.type === "fetch_cursor") {
    w.message(8, request, FetchCursorReq);
  } else if (request.type === "sequence") {
    w.message(9, request, SequenceReq);
  } else if (request.type === "describe") {
    w.message(10, request, DescribeReq);
  } else if (request.type === "store_sql") {
    w.message(11, request, StoreSqlReq);
  } else if (request.type === "close_sql") {
    w.message(12, request, CloseSqlReq);
  } else if (request.type === "get_autocommit") {
    w.message(13, request, GetAutocommitReq);
  } else {
    throw impossible(request, "Impossible type of Request");
  }
}
function OpenStreamReq(w, msg) {
  w.int32(1, msg.streamId);
}
function CloseStreamReq(w, msg) {
  w.int32(1, msg.streamId);
}
function ExecuteReq(w, msg) {
  w.int32(1, msg.streamId);
  w.message(2, msg.stmt, Stmt3);
}
function BatchReq(w, msg) {
  w.int32(1, msg.streamId);
  w.message(2, msg.batch, Batch3);
}
function OpenCursorReq(w, msg) {
  w.int32(1, msg.streamId);
  w.int32(2, msg.cursorId);
  w.message(3, msg.batch, Batch3);
}
function CloseCursorReq(w, msg) {
  w.int32(1, msg.cursorId);
}
function FetchCursorReq(w, msg) {
  w.int32(1, msg.cursorId);
  w.uint32(2, msg.maxCount);
}
function SequenceReq(w, msg) {
  w.int32(1, msg.streamId);
  if (msg.sql !== void 0) {
    w.string(2, msg.sql);
  }
  if (msg.sqlId !== void 0) {
    w.int32(3, msg.sqlId);
  }
}
function DescribeReq(w, msg) {
  w.int32(1, msg.streamId);
  if (msg.sql !== void 0) {
    w.string(2, msg.sql);
  }
  if (msg.sqlId !== void 0) {
    w.int32(3, msg.sqlId);
  }
}
function StoreSqlReq(w, msg) {
  w.int32(1, msg.sqlId);
  w.string(2, msg.sql);
}
function CloseSqlReq(w, msg) {
  w.int32(1, msg.sqlId);
}
function GetAutocommitReq(w, msg) {
  w.int32(1, msg.streamId);
}
var init_protobuf_encode2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/protobuf_encode.js"() {
    init_protobuf_encode();
    init_util3();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/shared/json_decode.js
function Error2(obj) {
  const message = string(obj["message"]);
  const code = stringOpt(obj["code"]);
  return { message, code };
}
function StmtResult(obj) {
  const cols = arrayObjectsMap(obj["cols"], Col);
  const rows = array(obj["rows"]).map((rowObj) => arrayObjectsMap(rowObj, Value3));
  const affectedRowCount = number(obj["affected_row_count"]);
  const lastInsertRowidStr = stringOpt(obj["last_insert_rowid"]);
  const lastInsertRowid = lastInsertRowidStr !== void 0 ? BigInt(lastInsertRowidStr) : void 0;
  return { cols, rows, affectedRowCount, lastInsertRowid };
}
function Col(obj) {
  const name = stringOpt(obj["name"]);
  const decltype = stringOpt(obj["decltype"]);
  return { name, decltype };
}
function BatchResult(obj) {
  const stepResults = /* @__PURE__ */ new Map();
  array(obj["step_results"]).forEach((value, i) => {
    if (value !== null) {
      stepResults.set(i, StmtResult(object(value)));
    }
  });
  const stepErrors = /* @__PURE__ */ new Map();
  array(obj["step_errors"]).forEach((value, i) => {
    if (value !== null) {
      stepErrors.set(i, Error2(object(value)));
    }
  });
  return { stepResults, stepErrors };
}
function CursorEntry(obj) {
  const type = string(obj["type"]);
  if (type === "step_begin") {
    const step = number(obj["step"]);
    const cols = arrayObjectsMap(obj["cols"], Col);
    return { type: "step_begin", step, cols };
  } else if (type === "step_end") {
    const affectedRowCount = number(obj["affected_row_count"]);
    const lastInsertRowidStr = stringOpt(obj["last_insert_rowid"]);
    const lastInsertRowid = lastInsertRowidStr !== void 0 ? BigInt(lastInsertRowidStr) : void 0;
    return { type: "step_end", affectedRowCount, lastInsertRowid };
  } else if (type === "step_error") {
    const step = number(obj["step"]);
    const error = Error2(object(obj["error"]));
    return { type: "step_error", step, error };
  } else if (type === "row") {
    const row = arrayObjectsMap(obj["row"], Value3);
    return { type: "row", row };
  } else if (type === "error") {
    const error = Error2(object(obj["error"]));
    return { type: "error", error };
  } else {
    throw new ProtoError("Unexpected type of CursorEntry");
  }
}
function DescribeResult(obj) {
  const params = arrayObjectsMap(obj["params"], DescribeParam);
  const cols = arrayObjectsMap(obj["cols"], DescribeCol);
  const isExplain = boolean(obj["is_explain"]);
  const isReadonly = boolean(obj["is_readonly"]);
  return { params, cols, isExplain, isReadonly };
}
function DescribeParam(obj) {
  const name = stringOpt(obj["name"]);
  return { name };
}
function DescribeCol(obj) {
  const name = string(obj["name"]);
  const decltype = stringOpt(obj["decltype"]);
  return { name, decltype };
}
function Value3(obj) {
  const type = string(obj["type"]);
  if (type === "null") {
    return null;
  } else if (type === "integer") {
    const value = string(obj["value"]);
    return BigInt(value);
  } else if (type === "float") {
    return number(obj["value"]);
  } else if (type === "text") {
    return string(obj["value"]);
  } else if (type === "blob") {
    return gBase64.toUint8Array(string(obj["base64"]));
  } else {
    throw new ProtoError("Unexpected type of Value");
  }
}
var init_json_decode = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/shared/json_decode.js"() {
    init_base64();
    init_errors();
    init_decode();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/json_decode.js
function ServerMsg(obj) {
  const type = string(obj["type"]);
  if (type === "hello_ok") {
    return { type: "hello_ok" };
  } else if (type === "hello_error") {
    const error = Error2(object(obj["error"]));
    return { type: "hello_error", error };
  } else if (type === "response_ok") {
    const requestId = number(obj["request_id"]);
    const response = Response(object(obj["response"]));
    return { type: "response_ok", requestId, response };
  } else if (type === "response_error") {
    const requestId = number(obj["request_id"]);
    const error = Error2(object(obj["error"]));
    return { type: "response_error", requestId, error };
  } else {
    throw new ProtoError("Unexpected type of ServerMsg");
  }
}
function Response(obj) {
  const type = string(obj["type"]);
  if (type === "open_stream") {
    return { type: "open_stream" };
  } else if (type === "close_stream") {
    return { type: "close_stream" };
  } else if (type === "execute") {
    const result = StmtResult(object(obj["result"]));
    return { type: "execute", result };
  } else if (type === "batch") {
    const result = BatchResult(object(obj["result"]));
    return { type: "batch", result };
  } else if (type === "open_cursor") {
    return { type: "open_cursor" };
  } else if (type === "close_cursor") {
    return { type: "close_cursor" };
  } else if (type === "fetch_cursor") {
    const entries = arrayObjectsMap(obj["entries"], CursorEntry);
    const done = boolean(obj["done"]);
    return { type: "fetch_cursor", entries, done };
  } else if (type === "sequence") {
    return { type: "sequence" };
  } else if (type === "describe") {
    const result = DescribeResult(object(obj["result"]));
    return { type: "describe", result };
  } else if (type === "store_sql") {
    return { type: "store_sql" };
  } else if (type === "close_sql") {
    return { type: "close_sql" };
  } else if (type === "get_autocommit") {
    const isAutocommit = boolean(obj["is_autocommit"]);
    return { type: "get_autocommit", isAutocommit };
  } else {
    throw new ProtoError("Unexpected type of Response");
  }
}
var init_json_decode2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/json_decode.js"() {
    init_errors();
    init_decode();
    init_json_decode();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/shared/protobuf_decode.js
var Error3, StmtResult2, Col2, Row, BatchResult2, BatchResultStepResult, BatchResultStepError, CursorEntry2, StepBeginEntry, StepEndEntry, StepErrorEntry, DescribeResult2, DescribeParam2, DescribeCol2, Value4;
var init_protobuf_decode = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/shared/protobuf_decode.js"() {
    Error3 = {
      default() {
        return { message: "", code: void 0 };
      },
      1(r, msg) {
        msg.message = r.string();
      },
      2(r, msg) {
        msg.code = r.string();
      }
    };
    StmtResult2 = {
      default() {
        return {
          cols: [],
          rows: [],
          affectedRowCount: 0,
          lastInsertRowid: void 0
        };
      },
      1(r, msg) {
        msg.cols.push(r.message(Col2));
      },
      2(r, msg) {
        msg.rows.push(r.message(Row));
      },
      3(r, msg) {
        msg.affectedRowCount = Number(r.uint64());
      },
      4(r, msg) {
        msg.lastInsertRowid = r.sint64();
      }
    };
    Col2 = {
      default() {
        return { name: void 0, decltype: void 0 };
      },
      1(r, msg) {
        msg.name = r.string();
      },
      2(r, msg) {
        msg.decltype = r.string();
      }
    };
    Row = {
      default() {
        return [];
      },
      1(r, msg) {
        msg.push(r.message(Value4));
      }
    };
    BatchResult2 = {
      default() {
        return { stepResults: /* @__PURE__ */ new Map(), stepErrors: /* @__PURE__ */ new Map() };
      },
      1(r, msg) {
        const [key, value] = r.message(BatchResultStepResult);
        msg.stepResults.set(key, value);
      },
      2(r, msg) {
        const [key, value] = r.message(BatchResultStepError);
        msg.stepErrors.set(key, value);
      }
    };
    BatchResultStepResult = {
      default() {
        return [0, StmtResult2.default()];
      },
      1(r, msg) {
        msg[0] = r.uint32();
      },
      2(r, msg) {
        msg[1] = r.message(StmtResult2);
      }
    };
    BatchResultStepError = {
      default() {
        return [0, Error3.default()];
      },
      1(r, msg) {
        msg[0] = r.uint32();
      },
      2(r, msg) {
        msg[1] = r.message(Error3);
      }
    };
    CursorEntry2 = {
      default() {
        return { type: "none" };
      },
      1(r) {
        return r.message(StepBeginEntry);
      },
      2(r) {
        return r.message(StepEndEntry);
      },
      3(r) {
        return r.message(StepErrorEntry);
      },
      4(r) {
        return { type: "row", row: r.message(Row) };
      },
      5(r) {
        return { type: "error", error: r.message(Error3) };
      }
    };
    StepBeginEntry = {
      default() {
        return { type: "step_begin", step: 0, cols: [] };
      },
      1(r, msg) {
        msg.step = r.uint32();
      },
      2(r, msg) {
        msg.cols.push(r.message(Col2));
      }
    };
    StepEndEntry = {
      default() {
        return {
          type: "step_end",
          affectedRowCount: 0,
          lastInsertRowid: void 0
        };
      },
      1(r, msg) {
        msg.affectedRowCount = r.uint32();
      },
      2(r, msg) {
        msg.lastInsertRowid = r.uint64();
      }
    };
    StepErrorEntry = {
      default() {
        return {
          type: "step_error",
          step: 0,
          error: Error3.default()
        };
      },
      1(r, msg) {
        msg.step = r.uint32();
      },
      2(r, msg) {
        msg.error = r.message(Error3);
      }
    };
    DescribeResult2 = {
      default() {
        return {
          params: [],
          cols: [],
          isExplain: false,
          isReadonly: false
        };
      },
      1(r, msg) {
        msg.params.push(r.message(DescribeParam2));
      },
      2(r, msg) {
        msg.cols.push(r.message(DescribeCol2));
      },
      3(r, msg) {
        msg.isExplain = r.bool();
      },
      4(r, msg) {
        msg.isReadonly = r.bool();
      }
    };
    DescribeParam2 = {
      default() {
        return { name: void 0 };
      },
      1(r, msg) {
        msg.name = r.string();
      }
    };
    DescribeCol2 = {
      default() {
        return { name: "", decltype: void 0 };
      },
      1(r, msg) {
        msg.name = r.string();
      },
      2(r, msg) {
        msg.decltype = r.string();
      }
    };
    Value4 = {
      default() {
        return void 0;
      },
      1(r) {
        return null;
      },
      2(r) {
        return r.sint64();
      },
      3(r) {
        return r.double();
      },
      4(r) {
        return r.string();
      },
      5(r) {
        return r.bytes();
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/protobuf_decode.js
var ServerMsg2, HelloErrorMsg, ResponseErrorMsg, ResponseOkMsg, ExecuteResp, BatchResp, FetchCursorResp, DescribeResp, GetAutocommitResp;
var init_protobuf_decode2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/protobuf_decode.js"() {
    init_protobuf_decode();
    ServerMsg2 = {
      default() {
        return { type: "none" };
      },
      1(r) {
        return { type: "hello_ok" };
      },
      2(r) {
        return r.message(HelloErrorMsg);
      },
      3(r) {
        return r.message(ResponseOkMsg);
      },
      4(r) {
        return r.message(ResponseErrorMsg);
      }
    };
    HelloErrorMsg = {
      default() {
        return { type: "hello_error", error: Error3.default() };
      },
      1(r, msg) {
        msg.error = r.message(Error3);
      }
    };
    ResponseErrorMsg = {
      default() {
        return { type: "response_error", requestId: 0, error: Error3.default() };
      },
      1(r, msg) {
        msg.requestId = r.int32();
      },
      2(r, msg) {
        msg.error = r.message(Error3);
      }
    };
    ResponseOkMsg = {
      default() {
        return {
          type: "response_ok",
          requestId: 0,
          response: { type: "none" }
        };
      },
      1(r, msg) {
        msg.requestId = r.int32();
      },
      2(r, msg) {
        msg.response = { type: "open_stream" };
      },
      3(r, msg) {
        msg.response = { type: "close_stream" };
      },
      4(r, msg) {
        msg.response = r.message(ExecuteResp);
      },
      5(r, msg) {
        msg.response = r.message(BatchResp);
      },
      6(r, msg) {
        msg.response = { type: "open_cursor" };
      },
      7(r, msg) {
        msg.response = { type: "close_cursor" };
      },
      8(r, msg) {
        msg.response = r.message(FetchCursorResp);
      },
      9(r, msg) {
        msg.response = { type: "sequence" };
      },
      10(r, msg) {
        msg.response = r.message(DescribeResp);
      },
      11(r, msg) {
        msg.response = { type: "store_sql" };
      },
      12(r, msg) {
        msg.response = { type: "close_sql" };
      },
      13(r, msg) {
        msg.response = r.message(GetAutocommitResp);
      }
    };
    ExecuteResp = {
      default() {
        return { type: "execute", result: StmtResult2.default() };
      },
      1(r, msg) {
        msg.result = r.message(StmtResult2);
      }
    };
    BatchResp = {
      default() {
        return { type: "batch", result: BatchResult2.default() };
      },
      1(r, msg) {
        msg.result = r.message(BatchResult2);
      }
    };
    FetchCursorResp = {
      default() {
        return { type: "fetch_cursor", entries: [], done: false };
      },
      1(r, msg) {
        msg.entries.push(r.message(CursorEntry2));
      },
      2(r, msg) {
        msg.done = r.bool();
      }
    };
    DescribeResp = {
      default() {
        return { type: "describe", result: DescribeResult2.default() };
      },
      1(r, msg) {
        msg.result = r.message(DescribeResult2);
      }
    };
    GetAutocommitResp = {
      default() {
        return { type: "get_autocommit", isAutocommit: false };
      },
      1(r, msg) {
        msg.isAutocommit = r.bool();
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/ws/client.js
var subprotocolsV2, subprotocolsV3, WsClient;
var init_client2 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/ws/client.js"() {
    init_client();
    init_encoding();
    init_errors();
    init_id_alloc();
    init_result();
    init_sql();
    init_util3();
    init_stream2();
    init_json_encode2();
    init_protobuf_encode2();
    init_json_decode2();
    init_protobuf_decode2();
    subprotocolsV2 = /* @__PURE__ */ new Map([
      ["hrana2", { version: 2, encoding: "json" }],
      ["hrana1", { version: 1, encoding: "json" }]
    ]);
    subprotocolsV3 = /* @__PURE__ */ new Map([
      ["hrana3-protobuf", { version: 3, encoding: "protobuf" }],
      ["hrana3", { version: 3, encoding: "json" }],
      ["hrana2", { version: 2, encoding: "json" }],
      ["hrana1", { version: 1, encoding: "json" }]
    ]);
    WsClient = class extends Client {
      #socket;
      // List of callbacks that we queue until the socket transitions from the CONNECTING to the OPEN state.
      #openCallbacks;
      // Have we already transitioned from CONNECTING to OPEN and fired the callbacks in #openCallbacks?
      #opened;
      // Stores the error that caused us to close the client (and the socket). If we are not closed, this is
      // `undefined`.
      #closed;
      // Have we received a response to our "hello" from the server?
      #recvdHello;
      // Subprotocol negotiated with the server. It is only available after the socket transitions to the OPEN
      // state.
      #subprotocol;
      // Has the `getVersion()` function been called? This is only used to validate that the API is used
      // correctly.
      #getVersionCalled;
      // A map from request id to the responses that we expect to receive from the server.
      #responseMap;
      // An allocator of request ids.
      #requestIdAlloc;
      // An allocator of stream ids.
      /** @private */
      _streamIdAlloc;
      // An allocator of cursor ids.
      /** @private */
      _cursorIdAlloc;
      // An allocator of SQL text ids.
      #sqlIdAlloc;
      /** @private */
      constructor(socket, jwt) {
        super();
        this.#socket = socket;
        this.#openCallbacks = [];
        this.#opened = false;
        this.#closed = void 0;
        this.#recvdHello = false;
        this.#subprotocol = void 0;
        this.#getVersionCalled = false;
        this.#responseMap = /* @__PURE__ */ new Map();
        this.#requestIdAlloc = new IdAlloc();
        this._streamIdAlloc = new IdAlloc();
        this._cursorIdAlloc = new IdAlloc();
        this.#sqlIdAlloc = new IdAlloc();
        this.#socket.binaryType = "arraybuffer";
        this.#socket.addEventListener("open", () => this.#onSocketOpen());
        this.#socket.addEventListener("close", (event) => this.#onSocketClose(event));
        this.#socket.addEventListener("error", (event) => this.#onSocketError(event));
        this.#socket.addEventListener("message", (event) => this.#onSocketMessage(event));
        this.#send({ type: "hello", jwt });
      }
      // Send (or enqueue to send) a message to the server.
      #send(msg) {
        if (this.#closed !== void 0) {
          throw new InternalError("Trying to send a message on a closed client");
        }
        if (this.#opened) {
          this.#sendToSocket(msg);
        } else {
          const openCallback = () => this.#sendToSocket(msg);
          const errorCallback = () => void 0;
          this.#openCallbacks.push({ openCallback, errorCallback });
        }
      }
      // The socket transitioned from CONNECTING to OPEN
      #onSocketOpen() {
        const protocol = this.#socket.protocol;
        if (protocol === void 0) {
          this.#setClosed(new ClientError("The `WebSocket.protocol` property is undefined. This most likely means that the WebSocket implementation provided by the environment is broken. If you are using Miniflare 2, please update to Miniflare 3, which fixes this problem."));
          return;
        } else if (protocol === "") {
          this.#subprotocol = { version: 1, encoding: "json" };
        } else {
          this.#subprotocol = subprotocolsV3.get(protocol);
          if (this.#subprotocol === void 0) {
            this.#setClosed(new ProtoError(`Unrecognized WebSocket subprotocol: ${JSON.stringify(protocol)}`));
            return;
          }
        }
        for (const callbacks of this.#openCallbacks) {
          callbacks.openCallback();
        }
        this.#openCallbacks.length = 0;
        this.#opened = true;
      }
      #sendToSocket(msg) {
        const encoding = this.#subprotocol.encoding;
        if (encoding === "json") {
          const jsonMsg = writeJsonObject(msg, ClientMsg);
          this.#socket.send(jsonMsg);
        } else if (encoding === "protobuf") {
          const protobufMsg = writeProtobufMessage(msg, ClientMsg2);
          this.#socket.send(protobufMsg);
        } else {
          throw impossible(encoding, "Impossible encoding");
        }
      }
      /** Get the protocol version negotiated with the server, possibly waiting until the socket is open. */
      getVersion() {
        return new Promise((versionCallback, errorCallback) => {
          this.#getVersionCalled = true;
          if (this.#closed !== void 0) {
            errorCallback(this.#closed);
          } else if (!this.#opened) {
            const openCallback = () => versionCallback(this.#subprotocol.version);
            this.#openCallbacks.push({ openCallback, errorCallback });
          } else {
            versionCallback(this.#subprotocol.version);
          }
        });
      }
      // Make sure that the negotiated version is at least `minVersion`.
      /** @private */
      _ensureVersion(minVersion, feature) {
        if (this.#subprotocol === void 0 || !this.#getVersionCalled) {
          throw new ProtocolVersionError(`${feature} is supported only on protocol version ${minVersion} and higher, but the version supported by the WebSocket server is not yet known. Use Client.getVersion() to wait until the version is available.`);
        } else if (this.#subprotocol.version < minVersion) {
          throw new ProtocolVersionError(`${feature} is supported on protocol version ${minVersion} and higher, but the WebSocket server only supports version ${this.#subprotocol.version}`);
        }
      }
      // Send a request to the server and invoke a callback when we get the response.
      /** @private */
      _sendRequest(request, callbacks) {
        if (this.#closed !== void 0) {
          callbacks.errorCallback(new ClosedError("Client is closed", this.#closed));
          return;
        }
        const requestId = this.#requestIdAlloc.alloc();
        this.#responseMap.set(requestId, { ...callbacks, type: request.type });
        this.#send({ type: "request", requestId, request });
      }
      // The socket encountered an error.
      #onSocketError(event) {
        const eventMessage = event.message;
        const message = eventMessage ?? "WebSocket was closed due to an error";
        this.#setClosed(new WebSocketError(message));
      }
      // The socket was closed.
      #onSocketClose(event) {
        let message = `WebSocket was closed with code ${event.code}`;
        if (event.reason) {
          message += `: ${event.reason}`;
        }
        this.#setClosed(new WebSocketError(message));
      }
      // Close the client with the given error.
      #setClosed(error) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#closed = error;
        for (const callbacks of this.#openCallbacks) {
          callbacks.errorCallback(error);
        }
        this.#openCallbacks.length = 0;
        for (const [requestId, responseState] of this.#responseMap.entries()) {
          responseState.errorCallback(error);
          this.#requestIdAlloc.free(requestId);
        }
        this.#responseMap.clear();
        this.#socket.close();
      }
      // We received a message from the socket.
      #onSocketMessage(event) {
        if (this.#closed !== void 0) {
          return;
        }
        try {
          let msg;
          const encoding = this.#subprotocol.encoding;
          if (encoding === "json") {
            if (typeof event.data !== "string") {
              this.#socket.close(3003, "Only text messages are accepted with JSON encoding");
              this.#setClosed(new ProtoError("Received non-text message from server with JSON encoding"));
              return;
            }
            msg = readJsonObject(JSON.parse(event.data), ServerMsg);
          } else if (encoding === "protobuf") {
            if (!(event.data instanceof ArrayBuffer)) {
              this.#socket.close(3003, "Only binary messages are accepted with Protobuf encoding");
              this.#setClosed(new ProtoError("Received non-binary message from server with Protobuf encoding"));
              return;
            }
            msg = readProtobufMessage(new Uint8Array(event.data), ServerMsg2);
          } else {
            throw impossible(encoding, "Impossible encoding");
          }
          this.#handleMsg(msg);
        } catch (e) {
          this.#socket.close(3007, "Could not handle message");
          this.#setClosed(e);
        }
      }
      // Handle a message from the server.
      #handleMsg(msg) {
        if (msg.type === "none") {
          throw new ProtoError("Received an unrecognized ServerMsg");
        } else if (msg.type === "hello_ok" || msg.type === "hello_error") {
          if (this.#recvdHello) {
            throw new ProtoError("Received a duplicated hello response");
          }
          this.#recvdHello = true;
          if (msg.type === "hello_error") {
            throw errorFromProto(msg.error);
          }
          return;
        } else if (!this.#recvdHello) {
          throw new ProtoError("Received a non-hello message before a hello response");
        }
        if (msg.type === "response_ok") {
          const requestId = msg.requestId;
          const responseState = this.#responseMap.get(requestId);
          this.#responseMap.delete(requestId);
          if (responseState === void 0) {
            throw new ProtoError("Received unexpected OK response");
          }
          this.#requestIdAlloc.free(requestId);
          try {
            if (responseState.type !== msg.response.type) {
              console.dir({ responseState, msg });
              throw new ProtoError("Received unexpected type of response");
            }
            responseState.responseCallback(msg.response);
          } catch (e) {
            responseState.errorCallback(e);
            throw e;
          }
        } else if (msg.type === "response_error") {
          const requestId = msg.requestId;
          const responseState = this.#responseMap.get(requestId);
          this.#responseMap.delete(requestId);
          if (responseState === void 0) {
            throw new ProtoError("Received unexpected error response");
          }
          this.#requestIdAlloc.free(requestId);
          responseState.errorCallback(errorFromProto(msg.error));
        } else {
          throw impossible(msg, "Impossible ServerMsg type");
        }
      }
      /** Open a {@link WsStream}, a stream for executing SQL statements. */
      openStream() {
        return WsStream.open(this);
      }
      /** Cache a SQL text on the server. This requires protocol version 2 or higher. */
      storeSql(sql) {
        this._ensureVersion(2, "storeSql()");
        const sqlId = this.#sqlIdAlloc.alloc();
        const sqlObj = new Sql(this, sqlId);
        const responseCallback = () => void 0;
        const errorCallback = (e) => sqlObj._setClosed(e);
        const request = { type: "store_sql", sqlId, sql };
        this._sendRequest(request, { responseCallback, errorCallback });
        return sqlObj;
      }
      /** @private */
      _closeSql(sqlId) {
        if (this.#closed !== void 0) {
          return;
        }
        const responseCallback = () => this.#sqlIdAlloc.free(sqlId);
        const errorCallback = (e) => this.#setClosed(e);
        const request = { type: "close_sql", sqlId };
        this._sendRequest(request, { responseCallback, errorCallback });
      }
      /** Close the client and the WebSocket. */
      close() {
        this.#setClosed(new ClientError("Client was manually closed"));
      }
      /** True if the client is closed. */
      get closed() {
        return this.#closed !== void 0;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/queue_microtask.js
var _queueMicrotask;
var init_queue_microtask = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/queue_microtask.js"() {
    if (typeof queueMicrotask !== "undefined") {
      _queueMicrotask = queueMicrotask;
    } else {
      const resolved = Promise.resolve();
      _queueMicrotask = (callback) => {
        resolved.then(callback);
      };
    }
  }
});

// node_modules/@libsql/hrana-client/lib-esm/byte_queue.js
var ByteQueue;
var init_byte_queue = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/byte_queue.js"() {
    ByteQueue = class {
      #array;
      #shiftPos;
      #pushPos;
      constructor(initialCap) {
        this.#array = new Uint8Array(new ArrayBuffer(initialCap));
        this.#shiftPos = 0;
        this.#pushPos = 0;
      }
      get length() {
        return this.#pushPos - this.#shiftPos;
      }
      data() {
        return this.#array.slice(this.#shiftPos, this.#pushPos);
      }
      push(chunk) {
        this.#ensurePush(chunk.byteLength);
        this.#array.set(chunk, this.#pushPos);
        this.#pushPos += chunk.byteLength;
      }
      #ensurePush(pushLength) {
        if (this.#pushPos + pushLength <= this.#array.byteLength) {
          return;
        }
        const filledLength = this.#pushPos - this.#shiftPos;
        if (filledLength + pushLength <= this.#array.byteLength && 2 * this.#pushPos >= this.#array.byteLength) {
          this.#array.copyWithin(0, this.#shiftPos, this.#pushPos);
        } else {
          let newCap = this.#array.byteLength;
          do {
            newCap *= 2;
          } while (filledLength + pushLength > newCap);
          const newArray = new Uint8Array(new ArrayBuffer(newCap));
          newArray.set(this.#array.slice(this.#shiftPos, this.#pushPos), 0);
          this.#array = newArray;
        }
        this.#pushPos = filledLength;
        this.#shiftPos = 0;
      }
      shift(length) {
        this.#shiftPos += length;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/json_decode.js
function PipelineRespBody(obj) {
  const baton = stringOpt(obj["baton"]);
  const baseUrl = stringOpt(obj["base_url"]);
  const results = arrayObjectsMap(obj["results"], StreamResult);
  return { baton, baseUrl, results };
}
function StreamResult(obj) {
  const type = string(obj["type"]);
  if (type === "ok") {
    const response = StreamResponse(object(obj["response"]));
    return { type: "ok", response };
  } else if (type === "error") {
    const error = Error2(object(obj["error"]));
    return { type: "error", error };
  } else {
    throw new ProtoError("Unexpected type of StreamResult");
  }
}
function StreamResponse(obj) {
  const type = string(obj["type"]);
  if (type === "close") {
    return { type: "close" };
  } else if (type === "execute") {
    const result = StmtResult(object(obj["result"]));
    return { type: "execute", result };
  } else if (type === "batch") {
    const result = BatchResult(object(obj["result"]));
    return { type: "batch", result };
  } else if (type === "sequence") {
    return { type: "sequence" };
  } else if (type === "describe") {
    const result = DescribeResult(object(obj["result"]));
    return { type: "describe", result };
  } else if (type === "store_sql") {
    return { type: "store_sql" };
  } else if (type === "close_sql") {
    return { type: "close_sql" };
  } else if (type === "get_autocommit") {
    const isAutocommit = boolean(obj["is_autocommit"]);
    return { type: "get_autocommit", isAutocommit };
  } else {
    throw new ProtoError("Unexpected type of StreamResponse");
  }
}
function CursorRespBody(obj) {
  const baton = stringOpt(obj["baton"]);
  const baseUrl = stringOpt(obj["base_url"]);
  return { baton, baseUrl };
}
var init_json_decode3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/json_decode.js"() {
    init_errors();
    init_decode();
    init_json_decode();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/protobuf_decode.js
var PipelineRespBody2, StreamResult2, StreamResponse2, ExecuteStreamResp, BatchStreamResp, DescribeStreamResp, GetAutocommitStreamResp, CursorRespBody2;
var init_protobuf_decode3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/protobuf_decode.js"() {
    init_protobuf_decode();
    PipelineRespBody2 = {
      default() {
        return { baton: void 0, baseUrl: void 0, results: [] };
      },
      1(r, msg) {
        msg.baton = r.string();
      },
      2(r, msg) {
        msg.baseUrl = r.string();
      },
      3(r, msg) {
        msg.results.push(r.message(StreamResult2));
      }
    };
    StreamResult2 = {
      default() {
        return { type: "none" };
      },
      1(r) {
        return { type: "ok", response: r.message(StreamResponse2) };
      },
      2(r) {
        return { type: "error", error: r.message(Error3) };
      }
    };
    StreamResponse2 = {
      default() {
        return { type: "none" };
      },
      1(r) {
        return { type: "close" };
      },
      2(r) {
        return r.message(ExecuteStreamResp);
      },
      3(r) {
        return r.message(BatchStreamResp);
      },
      4(r) {
        return { type: "sequence" };
      },
      5(r) {
        return r.message(DescribeStreamResp);
      },
      6(r) {
        return { type: "store_sql" };
      },
      7(r) {
        return { type: "close_sql" };
      },
      8(r) {
        return r.message(GetAutocommitStreamResp);
      }
    };
    ExecuteStreamResp = {
      default() {
        return { type: "execute", result: StmtResult2.default() };
      },
      1(r, msg) {
        msg.result = r.message(StmtResult2);
      }
    };
    BatchStreamResp = {
      default() {
        return { type: "batch", result: BatchResult2.default() };
      },
      1(r, msg) {
        msg.result = r.message(BatchResult2);
      }
    };
    DescribeStreamResp = {
      default() {
        return { type: "describe", result: DescribeResult2.default() };
      },
      1(r, msg) {
        msg.result = r.message(DescribeResult2);
      }
    };
    GetAutocommitStreamResp = {
      default() {
        return { type: "get_autocommit", isAutocommit: false };
      },
      1(r, msg) {
        msg.isAutocommit = r.bool();
      }
    };
    CursorRespBody2 = {
      default() {
        return { baton: void 0, baseUrl: void 0 };
      },
      1(r, msg) {
        msg.baton = r.string();
      },
      2(r, msg) {
        msg.baseUrl = r.string();
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/cursor.js
var HttpCursor;
var init_cursor3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/cursor.js"() {
    init_byte_queue();
    init_cursor();
    init_decode();
    init_decode2();
    init_errors();
    init_util3();
    init_json_decode3();
    init_protobuf_decode3();
    init_json_decode();
    init_protobuf_decode();
    HttpCursor = class extends Cursor {
      #stream;
      #encoding;
      #reader;
      #queue;
      #closed;
      #done;
      /** @private */
      constructor(stream, encoding) {
        super();
        this.#stream = stream;
        this.#encoding = encoding;
        this.#reader = void 0;
        this.#queue = new ByteQueue(16 * 1024);
        this.#closed = void 0;
        this.#done = false;
      }
      async open(response) {
        if (response.body === null) {
          throw new ProtoError("No response body for cursor request");
        }
        this.#reader = response.body[Symbol.asyncIterator]();
        const respBody = await this.#nextItem(CursorRespBody, CursorRespBody2);
        if (respBody === void 0) {
          throw new ProtoError("Empty response to cursor request");
        }
        return respBody;
      }
      /** Fetch the next entry from the cursor. */
      next() {
        return this.#nextItem(CursorEntry, CursorEntry2);
      }
      /** Close the cursor. */
      close() {
        this._setClosed(new ClientError("Cursor was manually closed"));
      }
      /** @private */
      _setClosed(error) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#closed = error;
        this.#stream._cursorClosed(this);
        if (this.#reader !== void 0) {
          this.#reader.return();
        }
      }
      /** True if the cursor is closed. */
      get closed() {
        return this.#closed !== void 0;
      }
      async #nextItem(jsonFun, protobufDef) {
        for (; ; ) {
          if (this.#done) {
            return void 0;
          } else if (this.#closed !== void 0) {
            throw new ClosedError("Cursor is closed", this.#closed);
          }
          if (this.#encoding === "json") {
            const jsonData = this.#parseItemJson();
            if (jsonData !== void 0) {
              const jsonText = new TextDecoder().decode(jsonData);
              const jsonValue = JSON.parse(jsonText);
              return readJsonObject(jsonValue, jsonFun);
            }
          } else if (this.#encoding === "protobuf") {
            const protobufData = this.#parseItemProtobuf();
            if (protobufData !== void 0) {
              return readProtobufMessage(protobufData, protobufDef);
            }
          } else {
            throw impossible(this.#encoding, "Impossible encoding");
          }
          if (this.#reader === void 0) {
            throw new InternalError("Attempted to read from HTTP cursor before it was opened");
          }
          const { value, done } = await this.#reader.next();
          if (done && this.#queue.length === 0) {
            this.#done = true;
          } else if (done) {
            throw new ProtoError("Unexpected end of cursor stream");
          } else {
            this.#queue.push(value);
          }
        }
      }
      #parseItemJson() {
        const data = this.#queue.data();
        const newlineByte = 10;
        const newlinePos = data.indexOf(newlineByte);
        if (newlinePos < 0) {
          return void 0;
        }
        const jsonData = data.slice(0, newlinePos);
        this.#queue.shift(newlinePos + 1);
        return jsonData;
      }
      #parseItemProtobuf() {
        const data = this.#queue.data();
        let varintValue = 0;
        let varintLength = 0;
        for (; ; ) {
          if (varintLength >= data.byteLength) {
            return void 0;
          }
          const byte = data[varintLength];
          varintValue |= (byte & 127) << 7 * varintLength;
          varintLength += 1;
          if (!(byte & 128)) {
            break;
          }
        }
        if (data.byteLength < varintLength + varintValue) {
          return void 0;
        }
        const protobufData = data.slice(varintLength, varintLength + varintValue);
        this.#queue.shift(varintLength + varintValue);
        return protobufData;
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/json_encode.js
function PipelineReqBody(w, msg) {
  if (msg.baton !== void 0) {
    w.string("baton", msg.baton);
  }
  w.arrayObjects("requests", msg.requests, StreamRequest);
}
function StreamRequest(w, msg) {
  w.stringRaw("type", msg.type);
  if (msg.type === "close") {
  } else if (msg.type === "execute") {
    w.object("stmt", msg.stmt, Stmt2);
  } else if (msg.type === "batch") {
    w.object("batch", msg.batch, Batch2);
  } else if (msg.type === "sequence") {
    if (msg.sql !== void 0) {
      w.string("sql", msg.sql);
    }
    if (msg.sqlId !== void 0) {
      w.number("sql_id", msg.sqlId);
    }
  } else if (msg.type === "describe") {
    if (msg.sql !== void 0) {
      w.string("sql", msg.sql);
    }
    if (msg.sqlId !== void 0) {
      w.number("sql_id", msg.sqlId);
    }
  } else if (msg.type === "store_sql") {
    w.number("sql_id", msg.sqlId);
    w.string("sql", msg.sql);
  } else if (msg.type === "close_sql") {
    w.number("sql_id", msg.sqlId);
  } else if (msg.type === "get_autocommit") {
  } else {
    throw impossible(msg, "Impossible type of StreamRequest");
  }
}
function CursorReqBody(w, msg) {
  if (msg.baton !== void 0) {
    w.string("baton", msg.baton);
  }
  w.object("batch", msg.batch, Batch2);
}
var init_json_encode3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/json_encode.js"() {
    init_json_encode();
    init_util3();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/protobuf_encode.js
function PipelineReqBody2(w, msg) {
  if (msg.baton !== void 0) {
    w.string(1, msg.baton);
  }
  for (const req of msg.requests) {
    w.message(2, req, StreamRequest2);
  }
}
function StreamRequest2(w, msg) {
  if (msg.type === "close") {
    w.message(1, msg, CloseStreamReq2);
  } else if (msg.type === "execute") {
    w.message(2, msg, ExecuteStreamReq);
  } else if (msg.type === "batch") {
    w.message(3, msg, BatchStreamReq);
  } else if (msg.type === "sequence") {
    w.message(4, msg, SequenceStreamReq);
  } else if (msg.type === "describe") {
    w.message(5, msg, DescribeStreamReq);
  } else if (msg.type === "store_sql") {
    w.message(6, msg, StoreSqlStreamReq);
  } else if (msg.type === "close_sql") {
    w.message(7, msg, CloseSqlStreamReq);
  } else if (msg.type === "get_autocommit") {
    w.message(8, msg, GetAutocommitStreamReq);
  } else {
    throw impossible(msg, "Impossible type of StreamRequest");
  }
}
function CloseStreamReq2(_w, _msg) {
}
function ExecuteStreamReq(w, msg) {
  w.message(1, msg.stmt, Stmt3);
}
function BatchStreamReq(w, msg) {
  w.message(1, msg.batch, Batch3);
}
function SequenceStreamReq(w, msg) {
  if (msg.sql !== void 0) {
    w.string(1, msg.sql);
  }
  if (msg.sqlId !== void 0) {
    w.int32(2, msg.sqlId);
  }
}
function DescribeStreamReq(w, msg) {
  if (msg.sql !== void 0) {
    w.string(1, msg.sql);
  }
  if (msg.sqlId !== void 0) {
    w.int32(2, msg.sqlId);
  }
}
function StoreSqlStreamReq(w, msg) {
  w.int32(1, msg.sqlId);
  w.string(2, msg.sql);
}
function CloseSqlStreamReq(w, msg) {
  w.int32(1, msg.sqlId);
}
function GetAutocommitStreamReq(_w, _msg) {
}
function CursorReqBody2(w, msg) {
  if (msg.baton !== void 0) {
    w.string(1, msg.baton);
  }
  w.message(2, msg.batch, Batch3);
}
var init_protobuf_encode3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/protobuf_encode.js"() {
    init_protobuf_encode();
    init_util3();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/stream.js
function handlePipelineResponse(pipeline, respBody) {
  if (respBody.results.length !== pipeline.length) {
    throw new ProtoError("Server returned unexpected number of pipeline results");
  }
  for (let i = 0; i < pipeline.length; ++i) {
    const result = respBody.results[i];
    const entry = pipeline[i];
    if (result.type === "ok") {
      if (result.response.type !== entry.request.type) {
        throw new ProtoError("Received unexpected type of response");
      }
      entry.responseCallback(result.response);
    } else if (result.type === "error") {
      entry.errorCallback(errorFromProto(result.error));
    } else if (result.type === "none") {
      throw new ProtoError("Received unrecognized type of StreamResult");
    } else {
      throw impossible(result, "Received impossible type of StreamResult");
    }
  }
}
async function decodePipelineResponse(resp, encoding) {
  if (encoding === "json") {
    const respJson = await resp.json();
    return readJsonObject(respJson, PipelineRespBody);
  }
  if (encoding === "protobuf") {
    const respData = await resp.arrayBuffer();
    return readProtobufMessage(new Uint8Array(respData), PipelineRespBody2);
  }
  await resp.body?.cancel();
  throw impossible(encoding, "Impossible encoding");
}
async function errorFromResponse(resp) {
  const respType = resp.headers.get("content-type") ?? "text/plain";
  let message = `Server returned HTTP status ${resp.status}`;
  if (respType === "application/json") {
    const respBody = await resp.json();
    if ("message" in respBody) {
      return errorFromProto(respBody);
    }
    return new HttpServerError(message, resp.status);
  }
  if (respType === "text/plain") {
    const respBody = (await resp.text()).trim();
    if (respBody !== "") {
      message += `: ${respBody}`;
    }
    return new HttpServerError(message, resp.status);
  }
  await resp.body?.cancel();
  return new HttpServerError(message, resp.status);
}
var HttpStream;
var init_stream3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/stream.js"() {
    init_errors();
    init_encoding();
    init_id_alloc();
    init_queue();
    init_queue_microtask();
    init_result();
    init_sql();
    init_stream();
    init_util3();
    init_cursor3();
    init_json_encode3();
    init_protobuf_encode3();
    init_json_encode3();
    init_protobuf_encode3();
    init_json_decode3();
    init_protobuf_decode3();
    HttpStream = class extends Stream {
      #client;
      #baseUrl;
      #jwt;
      #fetch;
      #remoteEncryptionKey;
      #baton;
      #queue;
      #flushing;
      #cursor;
      #closing;
      #closeQueued;
      #closed;
      #sqlIdAlloc;
      /** @private */
      constructor(client, baseUrl, jwt, customFetch, remoteEncryptionKey) {
        super(client.intMode);
        this.#client = client;
        this.#baseUrl = baseUrl.toString();
        this.#jwt = jwt;
        this.#fetch = customFetch;
        this.#remoteEncryptionKey = remoteEncryptionKey;
        this.#baton = void 0;
        this.#queue = new Queue();
        this.#flushing = false;
        this.#closing = false;
        this.#closeQueued = false;
        this.#closed = void 0;
        this.#sqlIdAlloc = new IdAlloc();
      }
      /** Get the {@link HttpClient} object that this stream belongs to. */
      client() {
        return this.#client;
      }
      /** @private */
      _sqlOwner() {
        return this;
      }
      /** Cache a SQL text on the server. */
      storeSql(sql) {
        const sqlId = this.#sqlIdAlloc.alloc();
        this.#sendStreamRequest({ type: "store_sql", sqlId, sql }).then(() => void 0, (error) => this._setClosed(error));
        return new Sql(this, sqlId);
      }
      /** @private */
      _closeSql(sqlId) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#sendStreamRequest({ type: "close_sql", sqlId }).then(() => this.#sqlIdAlloc.free(sqlId), (error) => this._setClosed(error));
      }
      /** @private */
      _execute(stmt) {
        return this.#sendStreamRequest({ type: "execute", stmt }).then((response) => {
          return response.result;
        });
      }
      /** @private */
      _batch(batch2) {
        return this.#sendStreamRequest({ type: "batch", batch: batch2 }).then((response) => {
          return response.result;
        });
      }
      /** @private */
      _describe(protoSql) {
        return this.#sendStreamRequest({
          type: "describe",
          sql: protoSql.sql,
          sqlId: protoSql.sqlId
        }).then((response) => {
          return response.result;
        });
      }
      /** @private */
      _sequence(protoSql) {
        return this.#sendStreamRequest({
          type: "sequence",
          sql: protoSql.sql,
          sqlId: protoSql.sqlId
        }).then((_response) => {
          return void 0;
        });
      }
      /** Check whether the SQL connection underlying this stream is in autocommit state (i.e., outside of an
       * explicit transaction). This requires protocol version 3 or higher.
       */
      getAutocommit() {
        this.#client._ensureVersion(3, "getAutocommit()");
        return this.#sendStreamRequest({
          type: "get_autocommit"
        }).then((response) => {
          return response.isAutocommit;
        });
      }
      #sendStreamRequest(request) {
        return new Promise((responseCallback, errorCallback) => {
          this.#pushToQueue({ type: "pipeline", request, responseCallback, errorCallback });
        });
      }
      /** @private */
      _openCursor(batch2) {
        return new Promise((cursorCallback, errorCallback) => {
          this.#pushToQueue({ type: "cursor", batch: batch2, cursorCallback, errorCallback });
        });
      }
      /** @private */
      _cursorClosed(cursor) {
        if (cursor !== this.#cursor) {
          throw new InternalError("Cursor was closed, but it was not associated with the stream");
        }
        this.#cursor = void 0;
        _queueMicrotask(() => this.#flushQueue());
      }
      /** Immediately close the stream. */
      close() {
        this._setClosed(new ClientError("Stream was manually closed"));
      }
      /** Gracefully close the stream. */
      closeGracefully() {
        this.#closing = true;
        _queueMicrotask(() => this.#flushQueue());
      }
      /** True if the stream is closed. */
      get closed() {
        return this.#closed !== void 0 || this.#closing;
      }
      /** @private */
      _setClosed(error) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#closed = error;
        if (this.#cursor !== void 0) {
          this.#cursor._setClosed(error);
        }
        this.#client._streamClosed(this);
        for (; ; ) {
          const entry = this.#queue.shift();
          if (entry !== void 0) {
            entry.errorCallback(error);
          } else {
            break;
          }
        }
        if ((this.#baton !== void 0 || this.#flushing) && !this.#closeQueued) {
          this.#queue.push({
            type: "pipeline",
            request: { type: "close" },
            responseCallback: () => void 0,
            errorCallback: () => void 0
          });
          this.#closeQueued = true;
          _queueMicrotask(() => this.#flushQueue());
        }
      }
      #pushToQueue(entry) {
        if (this.#closed !== void 0) {
          throw new ClosedError("Stream is closed", this.#closed);
        } else if (this.#closing) {
          throw new ClosedError("Stream is closing", void 0);
        } else {
          this.#queue.push(entry);
          _queueMicrotask(() => this.#flushQueue());
        }
      }
      #flushQueue() {
        if (this.#flushing || this.#cursor !== void 0) {
          return;
        }
        if (this.#closing && this.#queue.length === 0) {
          this._setClosed(new ClientError("Stream was gracefully closed"));
          return;
        }
        const endpoint = this.#client._endpoint;
        if (endpoint === void 0) {
          this.#client._endpointPromise.then(() => this.#flushQueue(), (error) => this._setClosed(error));
          return;
        }
        const firstEntry = this.#queue.shift();
        if (firstEntry === void 0) {
          return;
        } else if (firstEntry.type === "pipeline") {
          const pipeline = [firstEntry];
          for (; ; ) {
            const entry = this.#queue.first();
            if (entry !== void 0 && entry.type === "pipeline") {
              pipeline.push(entry);
              this.#queue.shift();
            } else if (entry === void 0 && this.#closing && !this.#closeQueued) {
              pipeline.push({
                type: "pipeline",
                request: { type: "close" },
                responseCallback: () => void 0,
                errorCallback: () => void 0
              });
              this.#closeQueued = true;
              break;
            } else {
              break;
            }
          }
          this.#flushPipeline(endpoint, pipeline);
        } else if (firstEntry.type === "cursor") {
          this.#flushCursor(endpoint, firstEntry);
        } else {
          throw impossible(firstEntry, "Impossible type of QueueEntry");
        }
      }
      #flushPipeline(endpoint, pipeline) {
        this.#flush(() => this.#createPipelineRequest(pipeline, endpoint), (resp) => decodePipelineResponse(resp, endpoint.encoding), (respBody) => respBody.baton, (respBody) => respBody.baseUrl, (respBody) => handlePipelineResponse(pipeline, respBody), (error) => pipeline.forEach((entry) => entry.errorCallback(error)));
      }
      #flushCursor(endpoint, entry) {
        const cursor = new HttpCursor(this, endpoint.encoding);
        this.#cursor = cursor;
        this.#flush(() => this.#createCursorRequest(entry, endpoint), (resp) => cursor.open(resp), (respBody) => respBody.baton, (respBody) => respBody.baseUrl, (_respBody) => entry.cursorCallback(cursor), (error) => entry.errorCallback(error));
      }
      #flush(createRequest, decodeResponse, getBaton, getBaseUrl, handleResponse, handleError) {
        let promise;
        try {
          const request = createRequest();
          const fetch = this.#fetch;
          promise = fetch(request);
        } catch (error) {
          promise = Promise.reject(error);
        }
        this.#flushing = true;
        promise.then((resp) => {
          if (!resp.ok) {
            return errorFromResponse(resp).then((error) => {
              throw error;
            });
          }
          return decodeResponse(resp);
        }).then((r) => {
          this.#baton = getBaton(r);
          this.#baseUrl = getBaseUrl(r) ?? this.#baseUrl;
          handleResponse(r);
        }).catch((error) => {
          this._setClosed(error);
          handleError(error);
        }).finally(() => {
          this.#flushing = false;
          this.#flushQueue();
        });
      }
      #createPipelineRequest(pipeline, endpoint) {
        return this.#createRequest(new URL(endpoint.pipelinePath, this.#baseUrl), {
          baton: this.#baton,
          requests: pipeline.map((entry) => entry.request)
        }, endpoint.encoding, PipelineReqBody, PipelineReqBody2);
      }
      #createCursorRequest(entry, endpoint) {
        if (endpoint.cursorPath === void 0) {
          throw new ProtocolVersionError(`Cursors are supported only on protocol version 3 and higher, but the HTTP server only supports version ${endpoint.version}.`);
        }
        return this.#createRequest(new URL(endpoint.cursorPath, this.#baseUrl), {
          baton: this.#baton,
          batch: entry.batch
        }, endpoint.encoding, CursorReqBody, CursorReqBody2);
      }
      #createRequest(url, reqBody, encoding, jsonFun, protobufFun) {
        let bodyData;
        let contentType;
        if (encoding === "json") {
          bodyData = writeJsonObject(reqBody, jsonFun);
          contentType = "application/json";
        } else if (encoding === "protobuf") {
          bodyData = writeProtobufMessage(reqBody, protobufFun);
          contentType = "application/x-protobuf";
        } else {
          throw impossible(encoding, "Impossible encoding");
        }
        const headers = new Headers();
        headers.set("content-type", contentType);
        if (this.#jwt !== void 0) {
          headers.set("authorization", `Bearer ${this.#jwt}`);
        }
        if (this.#remoteEncryptionKey !== void 0) {
          headers.set("x-turso-encryption-key", this.#remoteEncryptionKey);
        }
        return new Request(url.toString(), { method: "POST", headers, body: bodyData });
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/http/client.js
async function findEndpoint(customFetch, clientUrl) {
  const fetch = customFetch;
  for (const endpoint of checkEndpoints) {
    const url = new URL(endpoint.versionPath, clientUrl);
    const request = new Request(url.toString(), { method: "GET" });
    const response = await fetch(request);
    await response.arrayBuffer();
    if (response.ok) {
      return endpoint;
    }
  }
  return fallbackEndpoint;
}
var checkEndpoints, fallbackEndpoint, HttpClient;
var init_client3 = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/http/client.js"() {
    init_client();
    init_errors();
    init_stream3();
    checkEndpoints = [
      {
        versionPath: "v3-protobuf",
        pipelinePath: "v3-protobuf/pipeline",
        cursorPath: "v3-protobuf/cursor",
        version: 3,
        encoding: "protobuf"
      }
      /*
      {
          versionPath: "v3",
          pipelinePath: "v3/pipeline",
          cursorPath: "v3/cursor",
          version: 3,
          encoding: "json",
      },
      */
    ];
    fallbackEndpoint = {
      versionPath: "v2",
      pipelinePath: "v2/pipeline",
      cursorPath: void 0,
      version: 2,
      encoding: "json"
    };
    HttpClient = class extends Client {
      #url;
      #jwt;
      #fetch;
      #remoteEncryptionKey;
      #closed;
      #streams;
      /** @private */
      _endpointPromise;
      /** @private */
      _endpoint;
      /** @private */
      constructor(url, jwt, customFetch, remoteEncryptionKey, protocolVersion = 2) {
        super();
        this.#url = url;
        this.#jwt = jwt;
        this.#fetch = customFetch ?? globalThis.fetch;
        this.#remoteEncryptionKey = remoteEncryptionKey;
        this.#closed = void 0;
        this.#streams = /* @__PURE__ */ new Set();
        if (protocolVersion == 3) {
          this._endpointPromise = findEndpoint(this.#fetch, this.#url);
          this._endpointPromise.then((endpoint) => this._endpoint = endpoint, (error) => this.#setClosed(error));
        } else {
          this._endpointPromise = Promise.resolve(fallbackEndpoint);
          this._endpointPromise.then((endpoint) => this._endpoint = endpoint, (error) => this.#setClosed(error));
        }
      }
      /** Get the protocol version supported by the server. */
      async getVersion() {
        if (this._endpoint !== void 0) {
          return this._endpoint.version;
        }
        return (await this._endpointPromise).version;
      }
      // Make sure that the negotiated version is at least `minVersion`.
      /** @private */
      _ensureVersion(minVersion, feature) {
        if (minVersion <= fallbackEndpoint.version) {
          return;
        } else if (this._endpoint === void 0) {
          throw new ProtocolVersionError(`${feature} is supported only on protocol version ${minVersion} and higher, but the version supported by the HTTP server is not yet known. Use Client.getVersion() to wait until the version is available.`);
        } else if (this._endpoint.version < minVersion) {
          throw new ProtocolVersionError(`${feature} is supported only on protocol version ${minVersion} and higher, but the HTTP server only supports version ${this._endpoint.version}.`);
        }
      }
      /** Open a {@link HttpStream}, a stream for executing SQL statements. */
      openStream() {
        if (this.#closed !== void 0) {
          throw new ClosedError("Client is closed", this.#closed);
        }
        const stream = new HttpStream(this, this.#url, this.#jwt, this.#fetch, this.#remoteEncryptionKey);
        this.#streams.add(stream);
        return stream;
      }
      /** @private */
      _streamClosed(stream) {
        this.#streams.delete(stream);
      }
      /** Close the client and all its streams. */
      close() {
        this.#setClosed(new ClientError("Client was manually closed"));
      }
      /** True if the client is closed. */
      get closed() {
        return this.#closed !== void 0;
      }
      #setClosed(error) {
        if (this.#closed !== void 0) {
          return;
        }
        this.#closed = error;
        for (const stream of Array.from(this.#streams)) {
          stream._setClosed(new ClosedError("Client was closed", error));
        }
      }
    };
  }
});

// node_modules/@libsql/hrana-client/lib-esm/libsql_url.js
var init_libsql_url = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/libsql_url.js"() {
    init_errors();
  }
});

// node_modules/@libsql/hrana-client/lib-esm/index.js
function openWs(url, jwt, protocolVersion = 2) {
  if (typeof import_websocket.default === "undefined") {
    throw new WebSocketUnsupportedError("WebSockets are not supported in this environment");
  }
  var subprotocols = void 0;
  if (protocolVersion == 3) {
    subprotocols = Array.from(subprotocolsV3.keys());
  } else {
    subprotocols = Array.from(subprotocolsV2.keys());
  }
  const socket = new import_websocket.default(url, subprotocols);
  return new WsClient(socket, jwt);
}
function openHttp(url, jwt, customFetch, remoteEncryptionKey, protocolVersion = 2) {
  return new HttpClient(url instanceof URL ? url : new URL(url), jwt, customFetch, remoteEncryptionKey, protocolVersion);
}
var init_lib_esm = __esm({
  "node_modules/@libsql/hrana-client/lib-esm/index.js"() {
    init_node();
    init_client2();
    init_errors();
    init_client3();
    init_client2();
    init_node();
    init_client();
    init_errors();
    init_batch();
    init_libsql_url();
    init_sql();
    init_stmt();
    init_stream();
    init_client3();
    init_stream3();
    init_client2();
    init_stream2();
  }
});

// node_modules/@libsql/client/lib-esm/hrana.js
async function executeHranaBatch(mode, version2, batch2, hranaStmts, disableForeignKeys = false) {
  if (disableForeignKeys) {
    batch2.step().run("PRAGMA foreign_keys=off");
  }
  const beginStep = batch2.step();
  const beginPromise = beginStep.run(transactionModeToBegin(mode));
  let lastStep = beginStep;
  const stmtPromises = hranaStmts.map((hranaStmt) => {
    const stmtStep = batch2.step().condition(BatchCond.ok(lastStep));
    if (version2 >= 3) {
      stmtStep.condition(BatchCond.not(BatchCond.isAutocommit(batch2)));
    }
    const stmtPromise = stmtStep.query(hranaStmt);
    lastStep = stmtStep;
    return stmtPromise;
  });
  const commitStep = batch2.step().condition(BatchCond.ok(lastStep));
  if (version2 >= 3) {
    commitStep.condition(BatchCond.not(BatchCond.isAutocommit(batch2)));
  }
  const commitPromise = commitStep.run("COMMIT");
  const rollbackStep = batch2.step().condition(BatchCond.not(BatchCond.ok(commitStep)));
  rollbackStep.run("ROLLBACK").catch((_) => void 0);
  if (disableForeignKeys) {
    batch2.step().run("PRAGMA foreign_keys=on");
  }
  await batch2.execute();
  const resultSets = [];
  await beginPromise;
  for (let i = 0; i < stmtPromises.length; i++) {
    try {
      const hranaRows = await stmtPromises[i];
      if (hranaRows === void 0) {
        throw new LibsqlBatchError("Statement in a batch was not executed, probably because the transaction has been rolled back", i, "TRANSACTION_CLOSED");
      }
      resultSets.push(resultSetFromHrana(hranaRows));
    } catch (e) {
      if (e instanceof LibsqlBatchError) {
        throw e;
      }
      const mappedError = mapHranaError(e);
      if (mappedError instanceof LibsqlError) {
        throw new LibsqlBatchError(mappedError.message, i, mappedError.code, mappedError.extendedCode, mappedError.rawCode, mappedError.cause instanceof Error ? mappedError.cause : void 0);
      }
      throw mappedError;
    }
  }
  await commitPromise;
  return resultSets;
}
function stmtToHrana(stmt) {
  let sql;
  let args;
  if (Array.isArray(stmt)) {
    [sql, args] = stmt;
  } else if (typeof stmt === "string") {
    sql = stmt;
  } else {
    sql = stmt.sql;
    args = stmt.args;
  }
  const hranaStmt = new Stmt(sql);
  if (args) {
    if (Array.isArray(args)) {
      hranaStmt.bindIndexes(args);
    } else {
      for (const [key, value] of Object.entries(args)) {
        hranaStmt.bindName(key, value);
      }
    }
  }
  return hranaStmt;
}
function resultSetFromHrana(hranaRows) {
  const columns = hranaRows.columnNames.map((c) => c ?? "");
  const columnTypes = hranaRows.columnDecltypes.map((c) => c ?? "");
  const rows = hranaRows.rows;
  const rowsAffected = hranaRows.affectedRowCount;
  const lastInsertRowid = hranaRows.lastInsertRowid !== void 0 ? hranaRows.lastInsertRowid : void 0;
  return new ResultSetImpl(columns, columnTypes, rows, rowsAffected, lastInsertRowid);
}
function mapHranaError(e) {
  if (e instanceof ClientError) {
    const code = mapHranaErrorCode(e);
    return new LibsqlError(e.message, code, void 0, void 0, e);
  }
  return e;
}
function mapHranaErrorCode(e) {
  if (e instanceof ResponseError && e.code !== void 0) {
    return e.code;
  } else if (e instanceof ProtoError) {
    return "HRANA_PROTO_ERROR";
  } else if (e instanceof ClosedError) {
    return e.cause instanceof ClientError ? mapHranaErrorCode(e.cause) : "HRANA_CLOSED_ERROR";
  } else if (e instanceof WebSocketError) {
    return "HRANA_WEBSOCKET_ERROR";
  } else if (e instanceof HttpServerError) {
    return "SERVER_ERROR";
  } else if (e instanceof ProtocolVersionError) {
    return "PROTOCOL_VERSION_ERROR";
  } else if (e instanceof InternalError) {
    return "INTERNAL_ERROR";
  } else {
    return "UNKNOWN";
  }
}
var HranaTransaction;
var init_hrana = __esm({
  "node_modules/@libsql/client/lib-esm/hrana.js"() {
    init_lib_esm();
    init_api();
    init_util();
    HranaTransaction = class {
      #mode;
      #version;
      // Promise that is resolved when the BEGIN statement completes, or `undefined` if we haven't executed the
      // BEGIN statement yet.
      #started;
      /** @private */
      constructor(mode, version2) {
        this.#mode = mode;
        this.#version = version2;
        this.#started = void 0;
      }
      execute(stmt) {
        return this.batch([stmt]).then((results) => results[0]);
      }
      async batch(stmts) {
        const stream = this._getStream();
        if (stream.closed) {
          throw new LibsqlError("Cannot execute statements because the transaction is closed", "TRANSACTION_CLOSED");
        }
        try {
          const hranaStmts = stmts.map(stmtToHrana);
          let rowsPromises;
          if (this.#started === void 0) {
            this._getSqlCache().apply(hranaStmts);
            const batch2 = stream.batch(this.#version >= 3);
            const beginStep = batch2.step();
            const beginPromise = beginStep.run(transactionModeToBegin(this.#mode));
            let lastStep = beginStep;
            rowsPromises = hranaStmts.map((hranaStmt) => {
              const stmtStep = batch2.step().condition(BatchCond.ok(lastStep));
              if (this.#version >= 3) {
                stmtStep.condition(BatchCond.not(BatchCond.isAutocommit(batch2)));
              }
              const rowsPromise = stmtStep.query(hranaStmt);
              rowsPromise.catch(() => void 0);
              lastStep = stmtStep;
              return rowsPromise;
            });
            this.#started = batch2.execute().then(() => beginPromise).then(() => void 0);
            try {
              await this.#started;
            } catch (e) {
              this.close();
              throw e;
            }
          } else {
            if (this.#version < 3) {
              await this.#started;
            } else {
            }
            this._getSqlCache().apply(hranaStmts);
            const batch2 = stream.batch(this.#version >= 3);
            let lastStep = void 0;
            rowsPromises = hranaStmts.map((hranaStmt) => {
              const stmtStep = batch2.step();
              if (lastStep !== void 0) {
                stmtStep.condition(BatchCond.ok(lastStep));
              }
              if (this.#version >= 3) {
                stmtStep.condition(BatchCond.not(BatchCond.isAutocommit(batch2)));
              }
              const rowsPromise = stmtStep.query(hranaStmt);
              rowsPromise.catch(() => void 0);
              lastStep = stmtStep;
              return rowsPromise;
            });
            await batch2.execute();
          }
          const resultSets = [];
          for (let i = 0; i < rowsPromises.length; i++) {
            try {
              const rows = await rowsPromises[i];
              if (rows === void 0) {
                throw new LibsqlBatchError("Statement in a transaction was not executed, probably because the transaction has been rolled back", i, "TRANSACTION_CLOSED");
              }
              resultSets.push(resultSetFromHrana(rows));
            } catch (e) {
              if (e instanceof LibsqlBatchError) {
                throw e;
              }
              const mappedError = mapHranaError(e);
              if (mappedError instanceof LibsqlError) {
                throw new LibsqlBatchError(mappedError.message, i, mappedError.code, mappedError.extendedCode, mappedError.rawCode, mappedError.cause instanceof Error ? mappedError.cause : void 0);
              }
              throw mappedError;
            }
          }
          return resultSets;
        } catch (e) {
          throw mapHranaError(e);
        }
      }
      async executeMultiple(sql) {
        const stream = this._getStream();
        if (stream.closed) {
          throw new LibsqlError("Cannot execute statements because the transaction is closed", "TRANSACTION_CLOSED");
        }
        try {
          if (this.#started === void 0) {
            this.#started = stream.run(transactionModeToBegin(this.#mode)).then(() => void 0);
            try {
              await this.#started;
            } catch (e) {
              this.close();
              throw e;
            }
          } else {
            await this.#started;
          }
          await stream.sequence(sql);
        } catch (e) {
          throw mapHranaError(e);
        }
      }
      async rollback() {
        try {
          const stream = this._getStream();
          if (stream.closed) {
            return;
          }
          if (this.#started !== void 0) {
          } else {
            return;
          }
          const promise = stream.run("ROLLBACK").catch((e) => {
            throw mapHranaError(e);
          });
          stream.closeGracefully();
          await promise;
        } catch (e) {
          throw mapHranaError(e);
        } finally {
          this.close();
        }
      }
      async commit() {
        try {
          const stream = this._getStream();
          if (stream.closed) {
            throw new LibsqlError("Cannot commit the transaction because it is already closed", "TRANSACTION_CLOSED");
          }
          if (this.#started !== void 0) {
            await this.#started;
          } else {
            return;
          }
          const promise = stream.run("COMMIT").catch((e) => {
            throw mapHranaError(e);
          });
          stream.closeGracefully();
          await promise;
        } catch (e) {
          throw mapHranaError(e);
        } finally {
          this.close();
        }
      }
    };
  }
});

// node_modules/@libsql/client/lib-esm/sql_cache.js
var SqlCache, Lru;
var init_sql_cache = __esm({
  "node_modules/@libsql/client/lib-esm/sql_cache.js"() {
    SqlCache = class {
      #owner;
      #sqls;
      capacity;
      constructor(owner, capacity) {
        this.#owner = owner;
        this.#sqls = new Lru();
        this.capacity = capacity;
      }
      // Replaces SQL strings with cached `hrana.Sql` objects in the statements in `hranaStmts`. After this
      // function returns, we guarantee that all `hranaStmts` refer to valid (not closed) `hrana.Sql` objects,
      // but _we may invalidate any other `hrana.Sql` objects_ (by closing them, thus removing them from the
      // server).
      //
      // In practice, this means that after calling this function, you can use the statements only up to the
      // first `await`, because concurrent code may also use the cache and invalidate those statements.
      apply(hranaStmts) {
        if (this.capacity <= 0) {
          return;
        }
        const usedSqlObjs = /* @__PURE__ */ new Set();
        for (const hranaStmt of hranaStmts) {
          if (typeof hranaStmt.sql !== "string") {
            continue;
          }
          const sqlText = hranaStmt.sql;
          if (sqlText.length >= 5e3) {
            continue;
          }
          let sqlObj = this.#sqls.get(sqlText);
          if (sqlObj === void 0) {
            while (this.#sqls.size + 1 > this.capacity) {
              const [evictSqlText, evictSqlObj] = this.#sqls.peekLru();
              if (usedSqlObjs.has(evictSqlObj)) {
                break;
              }
              evictSqlObj.close();
              this.#sqls.delete(evictSqlText);
            }
            if (this.#sqls.size + 1 <= this.capacity) {
              sqlObj = this.#owner.storeSql(sqlText);
              this.#sqls.set(sqlText, sqlObj);
            }
          }
          if (sqlObj !== void 0) {
            hranaStmt.sql = sqlObj;
            usedSqlObjs.add(sqlObj);
          }
        }
      }
    };
    Lru = class {
      // This maps keys to the cache values. The entries are ordered by their last use (entires that were used
      // most recently are at the end).
      #cache;
      constructor() {
        this.#cache = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.#cache.get(key);
        if (value !== void 0) {
          this.#cache.delete(key);
          this.#cache.set(key, value);
        }
        return value;
      }
      set(key, value) {
        this.#cache.set(key, value);
      }
      peekLru() {
        for (const entry of this.#cache.entries()) {
          return entry;
        }
        return void 0;
      }
      delete(key) {
        this.#cache.delete(key);
      }
      get size() {
        return this.#cache.size;
      }
    };
  }
});

// node_modules/promise-limit/index.js
var require_promise_limit = __commonJS({
  "node_modules/promise-limit/index.js"(exports2, module2) {
    function limiter(count) {
      var outstanding = 0;
      var jobs = [];
      function remove() {
        outstanding--;
        if (outstanding < count) {
          dequeue();
        }
      }
      function dequeue() {
        var job = jobs.shift();
        semaphore.queue = jobs.length;
        if (job) {
          run(job.fn).then(job.resolve).catch(job.reject);
        }
      }
      function queue(fn) {
        return new Promise(function(resolve, reject) {
          jobs.push({ fn, resolve, reject });
          semaphore.queue = jobs.length;
        });
      }
      function run(fn) {
        outstanding++;
        try {
          return Promise.resolve(fn()).then(function(result) {
            remove();
            return result;
          }, function(error) {
            remove();
            throw error;
          });
        } catch (err) {
          remove();
          return Promise.reject(err);
        }
      }
      var semaphore = function(fn) {
        if (outstanding >= count) {
          return queue(fn);
        } else {
          return run(fn);
        }
      };
      return semaphore;
    }
    function map(items, mapper) {
      var failed = false;
      var limit = this;
      return Promise.all(items.map(function() {
        var args = arguments;
        return limit(function() {
          if (!failed) {
            return mapper.apply(void 0, args).catch(function(e) {
              failed = true;
              throw e;
            });
          }
        });
      }));
    }
    function addExtras(fn) {
      fn.queue = 0;
      fn.map = map;
      return fn;
    }
    module2.exports = function(count) {
      if (count) {
        return addExtras(limiter(count));
      } else {
        return addExtras(function(fn) {
          return fn();
        });
      }
    };
  }
});

// node_modules/@libsql/client/lib-esm/ws.js
function _createClient2(config) {
  if (config.scheme !== "wss" && config.scheme !== "ws") {
    throw new LibsqlError(`The WebSocket client supports only "libsql:", "wss:" and "ws:" URLs, got ${JSON.stringify(config.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
  }
  if (config.encryptionKey !== void 0) {
    throw new LibsqlError("Encryption key is not supported by the remote client.", "ENCRYPTION_KEY_NOT_SUPPORTED");
  }
  if (config.scheme === "ws" && config.tls) {
    throw new LibsqlError(`A "ws:" URL cannot opt into TLS by using ?tls=1`, "URL_INVALID");
  } else if (config.scheme === "wss" && !config.tls) {
    throw new LibsqlError(`A "wss:" URL cannot opt out of TLS by using ?tls=0`, "URL_INVALID");
  }
  const url = encodeBaseUrl(config.scheme, config.authority, config.path);
  let client;
  try {
    client = openWs(url, config.authToken);
  } catch (e) {
    if (e instanceof WebSocketUnsupportedError) {
      const suggestedScheme = config.scheme === "wss" ? "https" : "http";
      const suggestedUrl = encodeBaseUrl(suggestedScheme, config.authority, config.path);
      throw new LibsqlError(`This environment does not support WebSockets, please switch to the HTTP client by using a "${suggestedScheme}:" URL (${JSON.stringify(suggestedUrl)}). For more information, please read ${supportedUrlLink}`, "WEBSOCKETS_NOT_SUPPORTED");
    }
    throw mapHranaError(e);
  }
  return new WsClient2(client, url, config.authToken, config.intMode, config.concurrency);
}
var import_promise_limit, maxConnAgeMillis, sqlCacheCapacity, WsClient2, WsTransaction;
var init_ws = __esm({
  "node_modules/@libsql/client/lib-esm/ws.js"() {
    init_lib_esm();
    init_api();
    init_config();
    init_hrana();
    init_sql_cache();
    init_uri();
    init_util();
    import_promise_limit = __toESM(require_promise_limit(), 1);
    init_api();
    maxConnAgeMillis = 60 * 1e3;
    sqlCacheCapacity = 100;
    WsClient2 = class {
      #url;
      #authToken;
      #intMode;
      // State of the current connection. The `hrana.WsClient` inside may be closed at any moment due to an
      // asynchronous error.
      #connState;
      // If defined, this is a connection that will be used in the future, once it is ready.
      #futureConnState;
      closed;
      protocol;
      #isSchemaDatabase;
      #promiseLimitFunction;
      /** @private */
      constructor(client, url, authToken, intMode, concurrency) {
        this.#url = url;
        this.#authToken = authToken;
        this.#intMode = intMode;
        this.#connState = this.#openConn(client);
        this.#futureConnState = void 0;
        this.closed = false;
        this.protocol = "ws";
        this.#promiseLimitFunction = (0, import_promise_limit.default)(concurrency);
      }
      async limit(fn) {
        return this.#promiseLimitFunction(fn);
      }
      async execute(stmtOrSql, args) {
        let stmt;
        if (typeof stmtOrSql === "string") {
          stmt = {
            sql: stmtOrSql,
            args: args || []
          };
        } else {
          stmt = stmtOrSql;
        }
        return this.limit(async () => {
          const streamState = await this.#openStream();
          try {
            const hranaStmt = stmtToHrana(stmt);
            streamState.conn.sqlCache.apply([hranaStmt]);
            const hranaRowsPromise = streamState.stream.query(hranaStmt);
            streamState.stream.closeGracefully();
            const hranaRowsResult = await hranaRowsPromise;
            return resultSetFromHrana(hranaRowsResult);
          } catch (e) {
            throw mapHranaError(e);
          } finally {
            this._closeStream(streamState);
          }
        });
      }
      async batch(stmts, mode = "deferred") {
        return this.limit(async () => {
          const streamState = await this.#openStream();
          try {
            const normalizedStmts = stmts.map((stmt) => {
              if (Array.isArray(stmt)) {
                return {
                  sql: stmt[0],
                  args: stmt[1] || []
                };
              }
              return stmt;
            });
            const hranaStmts = normalizedStmts.map(stmtToHrana);
            const version2 = await streamState.conn.client.getVersion();
            streamState.conn.sqlCache.apply(hranaStmts);
            const batch2 = streamState.stream.batch(version2 >= 3);
            const resultsPromise = executeHranaBatch(mode, version2, batch2, hranaStmts);
            const results = await resultsPromise;
            return results;
          } catch (e) {
            throw mapHranaError(e);
          } finally {
            this._closeStream(streamState);
          }
        });
      }
      async migrate(stmts) {
        return this.limit(async () => {
          const streamState = await this.#openStream();
          try {
            const hranaStmts = stmts.map(stmtToHrana);
            const version2 = await streamState.conn.client.getVersion();
            const batch2 = streamState.stream.batch(version2 >= 3);
            const resultsPromise = executeHranaBatch("deferred", version2, batch2, hranaStmts, true);
            const results = await resultsPromise;
            return results;
          } catch (e) {
            throw mapHranaError(e);
          } finally {
            this._closeStream(streamState);
          }
        });
      }
      async transaction(mode = "write") {
        return this.limit(async () => {
          const streamState = await this.#openStream();
          try {
            const version2 = await streamState.conn.client.getVersion();
            return new WsTransaction(this, streamState, mode, version2);
          } catch (e) {
            this._closeStream(streamState);
            throw mapHranaError(e);
          }
        });
      }
      async executeMultiple(sql) {
        return this.limit(async () => {
          const streamState = await this.#openStream();
          try {
            const promise = streamState.stream.sequence(sql);
            streamState.stream.closeGracefully();
            await promise;
          } catch (e) {
            throw mapHranaError(e);
          } finally {
            this._closeStream(streamState);
          }
        });
      }
      sync() {
        throw new LibsqlError("sync not supported in ws mode", "SYNC_NOT_SUPPORTED");
      }
      async #openStream() {
        if (this.closed) {
          throw new LibsqlError("The client is closed", "CLIENT_CLOSED");
        }
        const now = /* @__PURE__ */ new Date();
        const ageMillis = now.valueOf() - this.#connState.openTime.valueOf();
        if (ageMillis > maxConnAgeMillis && this.#futureConnState === void 0) {
          const futureConnState = this.#openConn();
          this.#futureConnState = futureConnState;
          futureConnState.client.getVersion().then((_version) => {
            if (this.#connState !== futureConnState) {
              if (this.#connState.streamStates.size === 0) {
                this.#connState.client.close();
              } else {
              }
            }
            this.#connState = futureConnState;
            this.#futureConnState = void 0;
          }, (_e) => {
            this.#futureConnState = void 0;
          });
        }
        if (this.#connState.client.closed) {
          try {
            if (this.#futureConnState !== void 0) {
              this.#connState = this.#futureConnState;
            } else {
              this.#connState = this.#openConn();
            }
          } catch (e) {
            throw mapHranaError(e);
          }
        }
        const connState = this.#connState;
        try {
          if (connState.useSqlCache === void 0) {
            connState.useSqlCache = await connState.client.getVersion() >= 2;
            if (connState.useSqlCache) {
              connState.sqlCache.capacity = sqlCacheCapacity;
            }
          }
          const stream = connState.client.openStream();
          stream.intMode = this.#intMode;
          const streamState = { conn: connState, stream };
          connState.streamStates.add(streamState);
          return streamState;
        } catch (e) {
          throw mapHranaError(e);
        }
      }
      #openConn(client) {
        try {
          client ??= openWs(this.#url, this.#authToken);
          return {
            client,
            useSqlCache: void 0,
            sqlCache: new SqlCache(client, 0),
            openTime: /* @__PURE__ */ new Date(),
            streamStates: /* @__PURE__ */ new Set()
          };
        } catch (e) {
          throw mapHranaError(e);
        }
      }
      async reconnect() {
        try {
          for (const st of Array.from(this.#connState.streamStates)) {
            try {
              st.stream.close();
            } catch {
            }
          }
          this.#connState.client.close();
        } catch {
        }
        if (this.#futureConnState) {
          try {
            this.#futureConnState.client.close();
          } catch {
          }
          this.#futureConnState = void 0;
        }
        const next = this.#openConn();
        const version2 = await next.client.getVersion();
        next.useSqlCache = version2 >= 2;
        if (next.useSqlCache) {
          next.sqlCache.capacity = sqlCacheCapacity;
        }
        this.#connState = next;
        this.closed = false;
      }
      _closeStream(streamState) {
        streamState.stream.close();
        const connState = streamState.conn;
        connState.streamStates.delete(streamState);
        if (connState.streamStates.size === 0 && connState !== this.#connState) {
          connState.client.close();
        }
      }
      close() {
        this.#connState.client.close();
        this.closed = true;
        if (this.#futureConnState) {
          try {
            this.#futureConnState.client.close();
          } catch {
          }
          this.#futureConnState = void 0;
        }
        this.closed = true;
      }
    };
    WsTransaction = class extends HranaTransaction {
      #client;
      #streamState;
      /** @private */
      constructor(client, state, mode, version2) {
        super(mode, version2);
        this.#client = client;
        this.#streamState = state;
      }
      /** @private */
      _getStream() {
        return this.#streamState.stream;
      }
      /** @private */
      _getSqlCache() {
        return this.#streamState.conn.sqlCache;
      }
      close() {
        this.#client._closeStream(this.#streamState);
      }
      get closed() {
        return this.#streamState.stream.closed;
      }
    };
  }
});

// node_modules/@libsql/client/lib-esm/http.js
function _createClient3(config) {
  if (config.scheme !== "https" && config.scheme !== "http") {
    throw new LibsqlError(`The HTTP client supports only "libsql:", "https:" and "http:" URLs, got ${JSON.stringify(config.scheme + ":")}. For more information, please read ${supportedUrlLink}`, "URL_SCHEME_NOT_SUPPORTED");
  }
  if (config.encryptionKey !== void 0) {
    throw new LibsqlError("Encryption key is not supported by the remote client.", "ENCRYPTION_KEY_NOT_SUPPORTED");
  }
  if (config.scheme === "http" && config.tls) {
    throw new LibsqlError(`A "http:" URL cannot opt into TLS by using ?tls=1`, "URL_INVALID");
  } else if (config.scheme === "https" && !config.tls) {
    throw new LibsqlError(`A "https:" URL cannot opt out of TLS by using ?tls=0`, "URL_INVALID");
  }
  const url = encodeBaseUrl(config.scheme, config.authority, config.path);
  return new HttpClient2(url, config.authToken, config.intMode, config.fetch, config.concurrency, config.remoteEncryptionKey);
}
var import_promise_limit2, sqlCacheCapacity2, HttpClient2, HttpTransaction;
var init_http = __esm({
  "node_modules/@libsql/client/lib-esm/http.js"() {
    init_lib_esm();
    init_api();
    init_config();
    init_hrana();
    init_sql_cache();
    init_uri();
    init_util();
    import_promise_limit2 = __toESM(require_promise_limit(), 1);
    init_api();
    sqlCacheCapacity2 = 30;
    HttpClient2 = class {
      #client;
      protocol;
      #url;
      #intMode;
      #customFetch;
      #concurrency;
      #authToken;
      #remoteEncryptionKey;
      #promiseLimitFunction;
      /** @private */
      constructor(url, authToken, intMode, customFetch, concurrency, remoteEncryptionKey) {
        this.#url = url;
        this.#authToken = authToken;
        this.#intMode = intMode;
        this.#customFetch = customFetch;
        this.#concurrency = concurrency;
        this.#remoteEncryptionKey = remoteEncryptionKey;
        this.#client = openHttp(this.#url, this.#authToken, this.#customFetch, remoteEncryptionKey);
        this.#client.intMode = this.#intMode;
        this.protocol = "http";
        this.#promiseLimitFunction = (0, import_promise_limit2.default)(this.#concurrency);
      }
      async limit(fn) {
        return this.#promiseLimitFunction(fn);
      }
      async execute(stmtOrSql, args) {
        let stmt;
        if (typeof stmtOrSql === "string") {
          stmt = {
            sql: stmtOrSql,
            args: args || []
          };
        } else {
          stmt = stmtOrSql;
        }
        return this.limit(async () => {
          try {
            const hranaStmt = stmtToHrana(stmt);
            let rowsPromise;
            const stream = this.#client.openStream();
            try {
              rowsPromise = stream.query(hranaStmt);
            } finally {
              stream.closeGracefully();
            }
            const rowsResult = await rowsPromise;
            return resultSetFromHrana(rowsResult);
          } catch (e) {
            throw mapHranaError(e);
          }
        });
      }
      async batch(stmts, mode = "deferred") {
        return this.limit(async () => {
          try {
            const normalizedStmts = stmts.map((stmt) => {
              if (Array.isArray(stmt)) {
                return {
                  sql: stmt[0],
                  args: stmt[1] || []
                };
              }
              return stmt;
            });
            const hranaStmts = normalizedStmts.map(stmtToHrana);
            const version2 = await this.#client.getVersion();
            let resultsPromise;
            const stream = this.#client.openStream();
            try {
              const sqlCache = new SqlCache(stream, sqlCacheCapacity2);
              sqlCache.apply(hranaStmts);
              const batch2 = stream.batch(false);
              resultsPromise = executeHranaBatch(mode, version2, batch2, hranaStmts);
            } finally {
              stream.closeGracefully();
            }
            const results = await resultsPromise;
            return results;
          } catch (e) {
            throw mapHranaError(e);
          }
        });
      }
      async migrate(stmts) {
        return this.limit(async () => {
          try {
            const hranaStmts = stmts.map(stmtToHrana);
            const version2 = await this.#client.getVersion();
            let resultsPromise;
            const stream = this.#client.openStream();
            try {
              const batch2 = stream.batch(false);
              resultsPromise = executeHranaBatch("deferred", version2, batch2, hranaStmts, true);
            } finally {
              stream.closeGracefully();
            }
            const results = await resultsPromise;
            return results;
          } catch (e) {
            throw mapHranaError(e);
          }
        });
      }
      async transaction(mode = "write") {
        return this.limit(async () => {
          try {
            const version2 = await this.#client.getVersion();
            return new HttpTransaction(this.#client.openStream(), mode, version2);
          } catch (e) {
            throw mapHranaError(e);
          }
        });
      }
      async executeMultiple(sql) {
        return this.limit(async () => {
          try {
            let promise;
            const stream = this.#client.openStream();
            try {
              promise = stream.sequence(sql);
            } finally {
              stream.closeGracefully();
            }
            await promise;
          } catch (e) {
            throw mapHranaError(e);
          }
        });
      }
      sync() {
        throw new LibsqlError("sync not supported in http mode", "SYNC_NOT_SUPPORTED");
      }
      close() {
        this.#client.close();
      }
      async reconnect() {
        try {
          if (!this.closed) {
            this.#client.close();
          }
        } finally {
          this.#client = openHttp(this.#url, this.#authToken, this.#customFetch, this.#remoteEncryptionKey);
          this.#client.intMode = this.#intMode;
        }
      }
      get closed() {
        return this.#client.closed;
      }
    };
    HttpTransaction = class extends HranaTransaction {
      #stream;
      #sqlCache;
      /** @private */
      constructor(stream, mode, version2) {
        super(mode, version2);
        this.#stream = stream;
        this.#sqlCache = new SqlCache(stream, sqlCacheCapacity2);
      }
      /** @private */
      _getStream() {
        return this.#stream;
      }
      /** @private */
      _getSqlCache() {
        return this.#sqlCache;
      }
      close() {
        this.#stream.close();
      }
      get closed() {
        return this.#stream.closed;
      }
    };
  }
});

// node_modules/@libsql/client/lib-esm/node.js
var node_exports = {};
__export(node_exports, {
  LibsqlBatchError: () => LibsqlBatchError,
  LibsqlError: () => LibsqlError,
  createClient: () => createClient
});
function createClient(config) {
  return _createClient4(expandConfig(config, true));
}
function _createClient4(config) {
  if (config.scheme === "wss" || config.scheme === "ws") {
    return _createClient2(config);
  } else if (config.scheme === "https" || config.scheme === "http") {
    return _createClient3(config);
  } else {
    return _createClient(config);
  }
}
var init_node2 = __esm({
  "node_modules/@libsql/client/lib-esm/node.js"() {
    init_config();
    init_sqlite3();
    init_ws();
    init_http();
    init_api();
  }
});

// prisma/seed/data.ts
var RATING_SCALE, VERIFICATION_TOOLS, DEFAULT_VERIFICATION_TOOLS, criterion1Sub1, criterion1Sub2, criterion2Sub1, criterion2Sub2, criterion3Flat, criterion4Sub1, criterion4Sub2, criterion4Sub3, criterion4Sub4, criterion5Sub1, criterion5Sub2, criterion6Flat, criterion7Sub1, criterion7Sub2, SEED_CRITERIA, DEFAULT_SYSTEM_SETTINGS;
var init_data = __esm({
  "prisma/seed/data.ts"() {
    "use strict";
    RATING_SCALE = [
      { value: "NOT_MET", label: "\u063A\u064A\u0631 \u0645\u062A\u062D\u0642\u0642", score: 0, order: 0 },
      { value: "WEAK", label: "\u0645\u062A\u062D\u0642\u0642 \u0628\u062F\u0631\u062C\u0629 \u0636\u0639\u064A\u0641\u0629", score: 1, order: 1 },
      { value: "MEDIUM", label: "\u0645\u062A\u062D\u0642\u0642 \u0628\u062F\u0631\u062C\u0629 \u0645\u062A\u0648\u0633\u0637\u0629", score: 2, order: 2 },
      { value: "MET", label: "\u0645\u062A\u062D\u0642\u0642", score: 3, order: 3 }
    ];
    VERIFICATION_TOOLS = [
      "\u0641\u062D\u0635 \u0648\u062B\u0627\u0626\u0642",
      "\u0645\u0644\u0627\u062D\u0638\u0629",
      "\u0645\u0642\u0627\u0628\u0644\u0629"
    ];
    DEFAULT_VERIFICATION_TOOLS = [...VERIFICATION_TOOLS];
    criterion1Sub1 = {
      code: "1-1",
      title: "\u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629",
      weight: 5,
      indicators: [
        {
          code: "1-1-1",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0631\u0624\u064A\u0629 \u0648\u0631\u0633\u0627\u0644\u0629 \u0648\u0642\u064A\u0645 \u0648\u0623\u0647\u062F\u0627\u0641 \u0648\u0627\u0636\u062D\u0629 \u0648\u0645\u0639\u0644\u0646\u0629 \u0623\u0639\u062F\u062A \u0628\u0627\u0644\u0634\u0631\u0627\u0643\u0629 \u0645\u0639 \u0627\u0644\u0645\u0639\u0646\u064A\u064A\u0646\u060C \u0648\u0645\u0646\u0633\u062C\u0645\u0629 \u0645\u0639 \u0631\u0633\u0627\u0644\u0629 \u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u062A\u0631\u0628\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0645 \u0648\u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0639\u0644\u0645\u064A.",
          evidence: ["\u0645\u062D\u0636\u0631 \u0635\u064A\u0627\u063A\u0629 \u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629", "\u0644\u0648\u062D\u0629 \u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0642\u064A\u0645 \u0648\u0623\u0647\u062F\u0627\u0641"]
        },
        {
          code: "1-1-2",
          title: "\u062A\u062A\u0631\u062C\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0631\u0624\u064A\u062A\u0647\u0627 \u0648\u0631\u0633\u0627\u0644\u062A\u0647\u0627 \u0648\u0642\u064A\u0645\u0647\u0627 \u0648\u0623\u0647\u062F\u0627\u0641\u0647\u0627 \u0625\u0644\u0649 \u062E\u0637\u0637 \u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0648\u062A\u0646\u0641\u064A\u0630\u064A\u0629 \u0644\u0644\u0645\u062F\u0631\u0633\u0629.",
          evidence: ["\u0646\u0633\u062E\u0629 \u0627\u0644\u062E\u0637\u0629", "\u062A\u0642\u0627\u0631\u064A\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0637\u0629"]
        },
        {
          code: "1-1-3",
          title: "\u062A\u062A\u0631\u062C\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0631\u0624\u064A\u062A\u0647\u0627 \u0648\u0631\u0633\u0627\u0644\u062A\u0647\u0627 \u0648\u0623\u0647\u062F\u0627\u0641\u0647\u0627 \u0641\u064A \u062E\u0637\u0629 \u062A\u0637\u0648\u064A\u0631\u064A\u0629 \u062A\u0634\u062A\u0645\u0644 \u0639\u0644\u0649 \u0623\u0647\u062F\u0627\u0641 \u0648\u0623\u0646\u0634\u0637\u0629 \u0648\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0648\u0645\u0633\u0626\u0648\u0644\u064A\u0627\u062A \u0648\u0645\u0624\u0634\u0631\u0627\u062A \u0623\u062F\u0627\u0621 \u0648\u0627\u0636\u062D\u0629.",
          evidence: ["\u0646\u0633\u062E\u0629 \u0645\u0646 \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u062A\u0637\u0648\u064A\u0631\u064A\u0629", "\u062A\u0642\u0627\u0631\u064A\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0637\u0629"]
        },
        {
          code: "1-1-4",
          title: "\u062A\u0648\u062C\u0647 \u0631\u0633\u0627\u0644\u0629 \u0648\u0623\u0647\u062F\u0627\u0641 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0643\u0644\u0627 \u0645\u0646 \u0637\u0631\u0642 \u0627\u0644\u062A\u062F\u0631\u064A\u0633 \u0648\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645 \u0648\u0627\u0644\u062A\u0639\u0644\u0645 \u0648\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0648\u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u064A \u062A\u062A\u062E\u0630\u0647\u0627 \u0627\u0644\u0645\u062F\u0631\u0633\u0629.",
          evidence: [
            "\u0645\u062D\u0636\u0631 \u0635\u064A\u0627\u063A\u0629 \u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u0644\u0623\u0647\u062F\u0627\u0641",
            "\u0644\u0648\u062D\u0629 \u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u0644\u0623\u0647\u062F\u0627\u0641",
            "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0648\u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062A"
          ]
        },
        {
          code: "1-1-5",
          title: "\u064A\u062A\u0645 \u0645\u0631\u0627\u062C\u0639\u0629 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0623\u0647\u062F\u0627\u0641\u0647\u0627 \u0648\u062E\u0637\u062A\u0647\u0627 \u0627\u0644\u062A\u0637\u0648\u064A\u0631\u064A\u0629 \u062F\u0648\u0631\u064A\u0627\u064B \u0644\u0644\u062A\u0623\u0643\u062F \u0645\u0646 \u0645\u062F\u0649 \u0645\u0646\u0627\u0633\u0628\u062A\u0647\u0627 \u0644\u062D\u0627\u062C\u0627\u062A \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0648\u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631.",
          evidence: [
            "\u0648\u062B\u064A\u0642\u0629 \u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0648\u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u062A\u0637\u0648\u064A\u0631\u064A\u0629",
            "\u0645\u062D\u0636\u0631 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0627\u0644\u062A\u0642\u0631\u064A\u0631"
          ]
        }
      ]
    };
    criterion1Sub2 = {
      code: "1-2",
      title: "\u0627\u0644\u0642\u064A\u0627\u062F\u0629 \u0648\u0627\u0644\u0625\u062F\u0627\u0631\u0629",
      weight: 10,
      indicators: [
        {
          code: "1-2-1",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0647\u064A\u0643\u0644\u0627\u064B \u062A\u0646\u0638\u064A\u0645\u064A\u0627\u064B \u0648\u0627\u0636\u062D\u0627\u064B \u0648\u0645\u0639\u0644\u0646\u0627\u060C \u0648\u062A\u0648\u0635\u064A\u0641 \u0648\u0638\u064A\u0641\u064A \u064A\u062A\u0646\u0627\u0633\u0628 \u0645\u0639 \u0631\u0633\u0627\u0644\u062A\u0647\u0627 \u0648\u0623\u0647\u062F\u0627\u0641\u0647\u0627 \u0648\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A\u0647\u0627.",
          evidence: ["\u0646\u0633\u062E\u0629 \u0627\u0644\u0647\u064A\u0643\u0644 \u0627\u0644\u062A\u0646\u0638\u064A\u0645\u064A \u0648\u0627\u0644\u062A\u0648\u0635\u064A\u0641 \u0627\u0644\u0648\u0638\u064A\u0641\u064A", "\u0644\u0648\u062D\u0629 \u0627\u0644\u0647\u064A\u0643\u0644"]
        },
        {
          code: "1-2-2",
          title: "\u064A\u0645\u062A\u0644\u0643 \u0627\u0644\u0642\u0627\u0626\u0645\u0648\u0646 \u0639\u0644\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0624\u0647\u0644\u0627\u062A \u0639\u0644\u0645\u064A\u0629 \u0645\u0646\u0627\u0633\u0628\u0629\u060C \u0645\u0646 \u062D\u064A\u062B \u0627\u0644\u062A\u062E\u0635\u0635 \u0644\u0644\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u062A\u064A \u064A\u0634\u063A\u0644\u0648\u0646\u0647\u0627.",
          evidence: ["\u0643\u0634\u0648\u0641\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0644\u064A\u0646", "\u0645\u0624\u0647\u0644\u0627\u062A \u0627\u0644\u0642\u0627\u0626\u0645\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629"]
        },
        {
          code: "1-2-3",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u062C\u0644\u0633 \u0625\u062F\u0627\u0631\u0629 \u0641\u0627\u0639\u0644 \u0644\u0642\u064A\u0627\u062F\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0643\u0648\u0646 \u0645\u0646 \u062C\u0645\u064A\u0639 \u0627\u0644\u062C\u0647\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u0641\u064A\u062F\u0629 \u0645\u0646 \u0627\u0644\u0645\u062F\u0631\u0633\u0629.",
          evidence: ["\u0642\u0631\u0627\u0631 \u062A\u0634\u0643\u064A\u0644 \u0627\u0644\u0645\u062C\u0644\u0633", "\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u062C\u0644\u0633 \u0648\u0623\u0646\u0634\u0637\u062A\u0647 \u0648\u0642\u0631\u0627\u0631\u0627\u062A\u0647"]
        },
        {
          code: "1-2-4",
          title: "\u062A\u0644\u062A\u0632\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062A\u0639\u0645\u064A\u0645\u0627\u062A \u0627\u0644\u0635\u0627\u062F\u0631\u0629 \u0639\u0646 \u0627\u0644\u062C\u0647\u0627\u062A \u0627\u0644\u0645\u0639\u0646\u064A\u0629.",
          evidence: ["\u0646\u0633\u062E\u0629 \u0627\u0644\u062A\u0639\u0645\u064A\u0645\u0627\u062A"]
        },
        {
          code: "1-2-5",
          title: "\u062A\u0633\u0647\u0645 \u0645\u0645\u0627\u0631\u0633\u0627\u062A \u0648\u0642\u0631\u0627\u0631\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 \u0641\u064A \u062A\u062D\u0642\u064A\u0642 \u0631\u0624\u064A\u0629 \u0648\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629.",
          evidence: ["\u0648\u062B\u064A\u0642\u0629 \u0627\u0644\u0631\u0624\u064A\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629", "\u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629"]
        },
        {
          code: "1-2-6",
          title: "\u062A\u0648\u0638\u0641 \u0642\u064A\u0627\u062F\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0648\u0627\u0631\u062F\u0647\u0627 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u0645\u0627\u062F\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0628\u0635\u0648\u0631\u0629 \u0641\u0639\u0627\u0644\u0629.",
          evidence: ["\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u0648\u0627\u0632\u0646\u0629", "\u0646\u0633\u062E\u0629 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u0627\u0644\u064A\u0629", "\u0627\u0644\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u0645\u0627\u0644\u064A"]
        },
        {
          code: "1-2-7",
          title: "\u062A\u0648\u062C\u062F \u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062E\u0637\u0629 \u0644\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A \u0644\u0623\u062F\u0627\u0626\u0647\u0627 \u0648\u0623\u062F\u0627\u0621 \u0643\u0627\u062F\u0631\u0647\u0627 \u0648\u0627\u0644\u0627\u0633\u062A\u0641\u0627\u062F\u0629 \u0645\u0646\u0647\u0627 \u0641\u064A \u0627\u0644\u062A\u0637\u0648\u064A\u0631 \u0648\u0627\u0644\u062A\u062D\u0633\u064A\u0646.",
          evidence: ["\u062E\u0637\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A"]
        },
        {
          code: "1-2-8",
          title: "\u062A\u0636\u0639 \u0642\u064A\u0627\u062F\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062E\u0637\u0629 \u0644\u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0623\u062F\u0627\u0621 \u0641\u064A \u0636\u0648\u0621 \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A.",
          evidence: ["\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A", "\u062E\u0637\u0629 \u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0623\u062F\u0627\u0621"]
        },
        {
          code: "1-2-9",
          title: "\u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0622\u0644\u064A\u0629 \u0644\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u0624\u0633\u0633\u0627\u062A \u0627\u0644\u062F\u0648\u0644\u0629\u060C \u0648\u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0627\u0644\u0645\u062D\u0644\u064A\u060C \u0648\u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631.",
          evidence: ["\u0623\u0644\u064A\u0629 \u0627\u0644\u062A\u0648\u0627\u0635\u0644"]
        },
        {
          code: "1-2-10",
          title: "\u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0622\u0644\u064A\u0629 \u0645\u0641\u0639\u0644\u0629 \u0644\u062A\u0634\u062C\u064A\u0639 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u062A\u0639\u0627\u0648\u0646\u064A \u0648\u0627\u0644\u0639\u0645\u0644 \u0628\u0631\u0648\u062D \u0627\u0644\u0641\u0631\u064A\u0642.",
          evidence: ["\u0623\u0644\u064A\u0629 \u0644\u062A\u0634\u062C\u064A\u0639 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u062A\u0639\u0627\u0648\u0646\u064A"]
        },
        {
          code: "1-2-11",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0645\u0641\u0639\u0644\u0629 \u062A\u062D\u0641\u0632 \u0627\u0644\u0639\u0627\u0645\u0644\u064A\u0646 \u0648\u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0639\u0644\u0649 \u0645\u0645\u0627\u0631\u0633\u0629 \u0627\u0644\u0642\u064A\u0645 \u0627\u0644\u0625\u064A\u062C\u0627\u0628\u064A\u0629 \u0627\u0644\u062A\u064A \u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062C\u062A\u0645\u0639.",
          evidence: ["\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A", "\u0642\u0627\u0626\u0645\u0629 \u0628\u0627\u0644\u0642\u064A\u0645 \u0627\u0644\u0625\u064A\u062C\u0627\u0628\u064A\u0629", "\u0645\u0644\u0641 \u0628\u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A"]
        },
        {
          code: "1-2-12",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0646\u0638\u0627\u0645 \u0645\u0639\u0644\u0648\u0645\u0627\u062A\u064A \u062E\u0627\u0635 \u0628\u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0645\u062A\u0643\u0627\u0645\u0644 (\u062A\u0639\u0644\u064A\u0645\u060C \u062A\u0631\u0628\u064A\u0629\u060C \u0635\u062D\u0629) \u0648\u0645\u0624\u0631\u0634\u0641 \u0637\u0648\u0627\u0644 \u0641\u062A\u0631\u0629 \u062F\u0631\u0627\u0633\u062A\u0647\u0645.",
          evidence: ["\u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A\u064A", "\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0623\u0631\u0634\u064A\u0641"]
        },
        {
          code: "1-2-13",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u062A\u0648\u0638\u0641 \u062D\u0635\u0635 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637 \u0644\u0625\u0646\u062A\u0627\u062C \u0627\u0644\u0648\u0633\u0627\u0626\u0644 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629\u060C \u0648\u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u064A\u0648\u0645\u064A\u060C \u0648\u062A\u0646\u0638\u064A\u0645 \u0627\u0644\u0646\u0634\u0627\u0637\u0627\u062A \u0627\u0644\u0644\u0627\u0635\u0641\u064A\u0629.",
          evidence: [
            "\u062C\u062F\u0648\u0644 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637",
            "\u062C\u062F\u0648\u0644 \u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u064A\u0648\u0645\u064A \u0648\u0627\u0644\u0646\u0634\u0627\u0637\u0627\u062A \u0627\u0644\u0644\u0627\u0635\u0641\u064A\u0629",
            "\u063A\u0631\u0641\u0629 \u0627\u0644\u0648\u0633\u0627\u0626\u0644 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629"
          ]
        },
        {
          code: "1-2-14",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0623\u0644\u064A\u0629 \u062A\u0633\u0645\u062D \u0644\u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631 \u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0645\u0633\u062A\u0648\u0649 \u062A\u062D\u0635\u064A\u0644 \u0623\u0628\u0646\u0627\u0626\u0647\u0645 \u0627\u0644\u0639\u0644\u0645\u064A\u060C \u0648\u0633\u0644\u0648\u0643\u0647\u0645 \u0628\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0646 \u062E\u0644\u0627\u0644 \u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A.",
          evidence: ["\u0627\u0644\u0623\u0644\u064A\u0629", "\u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A"]
        },
        {
          code: "1-2-15",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0645\u0641\u0639\u0644\u0629 \u062A\u0636\u0645\u0646 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0641\u0639\u0627\u0644 \u0628\u064A\u0646 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u0645\u0648\u062C\u0647\u064A\u0646.",
          evidence: ["\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0648\u0623\u0644\u064A\u0627\u062A \u0627\u0644\u062A\u0648\u0627\u0635\u0644", "\u062A\u0642\u0627\u0631\u064A\u0631"]
        },
        {
          code: "1-2-16",
          title: "\u062A\u0634\u062C\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 \u0639\u0644\u0649 \u062A\u0628\u0627\u062F\u0644 \u0627\u0644\u062E\u0628\u0631\u0627\u062A \u0645\u0639 \u0627\u0644\u0645\u062F\u0627\u0631\u0633 \u0627\u0644\u0623\u062E\u0631\u0649.",
          evidence: ["\u0645\u062D\u0627\u0636\u0631 \u0644\u0642\u0627\u0621\u0627\u062A", "\u062A\u0642\u0627\u0631\u064A\u0631"]
        },
        {
          code: "1-2-17",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0648\u0642\u0639 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0639\u0644\u0649 \u0634\u0628\u0643\u0629 \u0627\u0644\u0627\u0646\u062A\u0631\u0646\u062A \u0641\u064A\u0647 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0643\u0627\u0641\u064A\u0629 \u0639\u0646 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0623\u0646\u0634\u0637\u062A\u0647\u0627 \u0648\u064A\u062D\u062F\u062B \u0628\u0635\u0641\u0629 \u062F\u0648\u0631\u064A\u0629.",
          evidence: ["\u0645\u0648\u0642\u0639 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A"]
        },
        {
          code: "1-2-18",
          title: "\u062A\u0636\u0645\u0646 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0625\u0645\u0643\u0627\u0646\u064A\u0629 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0628\u064A\u0646 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646.",
          evidence: ["\u0645\u0648\u0642\u0639 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A", "\u0623\u0644\u064A\u0629 \u0627\u0644\u062A\u0648\u0627\u0635\u0644"]
        },
        {
          code: "1-2-19",
          title: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0639\u0644\u0649 \u0645\u0648\u0642\u0639\u0647\u0627 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u064B.",
          evidence: ["\u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A", "\u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629"]
        }
      ]
    };
    criterion2Sub1 = {
      code: "2-1",
      title: "\u0627\u0644\u0645\u0639\u0644\u0645\u0648\u0646",
      weight: 14,
      indicators: [
        {
          code: "2-1-1",
          title: "\u064A\u062A\u0648\u0627\u0641\u0631 \u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0643\u0627\u062F\u0631 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A \u0627\u0644\u062B\u0627\u0628\u062A \u0648\u0627\u0644\u0645\u0624\u0647\u0644.",
          evidence: ["\u0633\u062C\u0644 \u0627\u0644\u0642\u0648\u0649 \u0627\u0644\u0639\u0627\u0645\u0644\u0629", "\u0643\u0634\u0648\u0641\u0627\u062A \u0627\u0644\u0631\u0627\u062A\u0628", "\u0627\u0644\u0645\u0624\u0647\u0644\u0627\u062A"]
        },
        {
          code: "2-1-2",
          title: "\u062A\u062A\u0646\u0627\u0633\u0628 \u0645\u0624\u0647\u0644\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0648\u062A\u062E\u0635\u0635\u0627\u062A\u0647\u0645 \u0645\u0639 \u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u062A\u064A \u064A\u062F\u0631\u0633\u0648\u0646\u0647\u0627.",
          evidence: ["\u0633\u062C\u0644 \u0627\u0644\u0642\u0648\u0649 \u0627\u0644\u0639\u0627\u0645\u0644\u0629", "\u0633\u062C\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0641 \u0627\u0644\u0648\u0638\u064A\u0641\u064A", "\u062C\u062F\u0648\u0644 \u0627\u0644\u062D\u0635\u0635"]
        },
        {
          code: "2-1-3",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062E\u0637\u0629 \u0644\u062A\u062F\u0631\u064A\u0628 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0648\u0641\u0642\u0627\u064B \u0644\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629.",
          evidence: ["\u062F\u0631\u0627\u0633\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629", "\u062E\u0637\u0629 \u0627\u0644\u062A\u062F\u0631\u064A\u0628"]
        },
        {
          code: "2-1-4",
          title: "\u062A\u0646\u0641\u0630 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0631\u0627\u0645\u062C \u062A\u0646\u0645\u064A\u0629 \u0645\u0647\u0646\u064A\u0629 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646.",
          evidence: ["\u062E\u0637\u0629 \u0627\u0644\u062A\u062F\u0631\u064A\u0628", "\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u062A\u062F\u0631\u064A\u0628", "\u0633\u062C\u0644 \u0627\u0644\u062D\u0636\u0648\u0631", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u062F\u0631\u064A\u0628"]
        },
        {
          code: "2-1-5",
          title: "\u062A\u0647\u062A\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 \u0628\u062A\u062D\u0641\u064A\u0632 \u0648\u062A\u0634\u062C\u064A\u0639 \u0645\u0639\u0644\u0645\u064A\u0646 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629.",
          evidence: ["\u0646\u0645\u0627\u0630\u062C \u0634\u0647\u0627\u062F\u0627\u062A \u062A\u0642\u062F\u064A\u0631", "\u062A\u0642\u0631\u064A\u0631 \u0641\u0639\u0627\u0644\u064A\u0627\u062A \u062A\u0643\u0631\u064A\u0645 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646"]
        },
        {
          code: "2-1-6",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0646\u0638\u0627\u0645 \u0648\u0627\u0636\u062D \u0648\u0645\u0639\u0644\u0646 \u0644\u0644\u062D\u0648\u0627\u0641\u0632 \u0627\u0644\u062A\u0634\u062C\u064A\u0639\u064A\u0629 \u0644\u0644\u0645\u0639\u0644\u0645\u064A\u0646.",
          evidence: ["\u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062D\u0641\u064A\u0632", "\u0644\u0648\u062D\u0629 \u0627\u0644\u062D\u0648\u0627\u0641\u0632"]
        },
        {
          code: "2-1-7",
          title: "\u062A\u064F\u0642\u064A\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0623\u062F\u0627\u0621 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0628\u0637\u0631\u064A\u0642\u0629 \u0645\u0648\u0636\u0648\u0639\u064A\u0629 \u0648\u0639\u0627\u062F\u0644\u0629.",
          evidence: ["\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645", "\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u062A\u0642\u064A\u064A\u0645"]
        },
        {
          code: "2-1-8",
          title: "\u062A\u0642\u064A\u0633 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 \u0623\u062B\u0631 \u0627\u0644\u062A\u0646\u0645\u064A\u0629 \u0627\u0644\u0645\u0647\u0646\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u062F\u0627\u0621.",
          evidence: ["\u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629", "\u0627\u0633\u062A\u0645\u0627\u0631\u0627\u062A \u0642\u064A\u0627\u0633 \u0627\u0644\u0623\u062B\u0631", "\u0646\u062A\u0627\u0626\u062C \u0642\u064A\u0627\u0633 \u0627\u0644\u0623\u062B\u0631"]
        },
        {
          code: "2-1-9",
          title: "\u0644\u062F\u0649 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0645\u0644\u0641\u0627\u062A \u0625\u0646\u062C\u0627\u0632.",
          evidence: ["\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0625\u0646\u062C\u0627\u0632"]
        }
      ]
    };
    criterion2Sub2 = {
      code: "2-2",
      title: "\u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629",
      weight: 6,
      indicators: [
        {
          code: "2-2-1",
          title: "\u064A\u062A\u0648\u0627\u0641\u0631 \u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0643\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A \u0648\u0627\u0644\u062E\u062F\u0645\u064A \u0627\u0644\u0645\u0646\u0627\u0633\u0628 \u0627\u0644\u0644\u0627\u0632\u0645 \u0644\u062F\u0639\u0645 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629.",
          evidence: ["\u0633\u062C\u0644 \u0627\u0644\u0642\u0648\u0649 \u0627\u0644\u0639\u0627\u0645\u0644\u0629"]
        },
        {
          code: "2-2-2",
          title: "\u062A\u062A\u0646\u0627\u0633\u0628 \u0645\u0624\u0647\u0644\u0627\u062A \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629 \u0648\u062A\u062E\u0635\u0635\u0627\u062A\u0647\u0645 \u0645\u0639 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u0646\u0627\u0637\u0629 \u0628\u0647\u0645.",
          evidence: ["\u0633\u062C\u0644 \u0627\u0644\u0642\u0648\u0649 \u0627\u0644\u0639\u0627\u0645\u0644\u0629", "\u0627\u0644\u0647\u064A\u0643\u0644 \u0627\u0644\u062A\u0646\u0638\u064A\u0645\u064A"]
        },
        {
          code: "2-2-3",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062E\u0637\u0629 \u0644\u062A\u062F\u0631\u064A\u0628 \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629 \u0648\u0641\u0642\u0627\u064B \u0644\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629.",
          evidence: ["\u062F\u0631\u0627\u0633\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629", "\u062E\u0637\u0629 \u0627\u0644\u062A\u062F\u0631\u064A\u0628"]
        },
        {
          code: "2-2-4",
          title: "\u062A\u0646\u0641\u0630 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0631\u0627\u0645\u062C \u062A\u0646\u0645\u064A\u0629 \u0645\u0647\u0646\u064A\u0629 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629.",
          evidence: ["\u062E\u0637\u0629 \u0627\u0644\u062A\u062F\u0631\u064A\u0628", "\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u062A\u062F\u0631\u064A\u0628", "\u0633\u062C\u0644 \u0627\u0644\u062D\u0636\u0648\u0631", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u062F\u0631\u064A\u0628"]
        },
        {
          code: "2-2-5",
          title: "\u062A\u0647\u062A\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 \u0628\u062A\u062D\u0641\u064A\u0632 \u0648\u062A\u0634\u062C\u064A\u0639 \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629.",
          evidence: ["\u0646\u0645\u0627\u0630\u062C \u0634\u0647\u0627\u062F\u0627\u062A \u062A\u0642\u062F\u064A\u0631", "\u062A\u0642\u0631\u064A\u0631 \u0641\u0639\u0627\u0644\u064A\u0627\u062A \u062A\u0643\u0631\u064A\u0645 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646"]
        },
        {
          code: "2-2-6",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0646\u0638\u0627\u0645 \u0648\u0627\u0636\u062D \u0648\u0645\u0639\u0644\u0646 \u0644\u0644\u062D\u0648\u0627\u0641\u0632 \u0627\u0644\u062A\u0634\u062C\u064A\u0639\u064A\u0629 \u0644\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629.",
          evidence: ["\u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062D\u0641\u064A\u0632", "\u0644\u0648\u062D\u0629 \u0627\u0644\u062D\u0648\u0627\u0641\u0632"]
        },
        {
          code: "2-2-7",
          title: "\u062A\u0642\u064A\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629 \u0628\u0637\u0631\u064A\u0642\u0629 \u0645\u0648\u0636\u0648\u0639\u064A\u0629 \u0648\u0639\u0627\u062F\u0644\u0629.",
          evidence: ["\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645", "\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u062A\u0642\u064A\u064A\u0645"]
        },
        {
          code: "2-2-8",
          title: "\u062A\u0642\u064A\u0633 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 \u0623\u062B\u0631 \u0627\u0644\u062A\u0646\u0645\u064A\u0629 \u0627\u0644\u0645\u0647\u0646\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u062F\u0627\u0621.",
          evidence: ["\u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A\u0629", "\u0627\u0633\u062A\u0645\u0627\u0631\u0627\u062A \u0642\u064A\u0627\u0633 \u0627\u0644\u0623\u062B\u0631", "\u0646\u062A\u0627\u0626\u062C \u0642\u064A\u0627\u0633 \u0627\u0644\u0623\u062B\u0631"]
        },
        {
          code: "2-2-9",
          title: "\u0644\u062F\u0649 \u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629 \u0645\u0644\u0641\u0627\u062A \u0625\u0646\u062C\u0627\u0632.",
          evidence: ["\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0625\u0646\u062C\u0627\u0632"]
        }
      ]
    };
    criterion3Flat = [
      {
        code: "3-1",
        title: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0635\u062D\u064A\u0629 \u0627\u0644\u0623\u0648\u0644\u064A\u0629 \u0648\u062A\u0641\u0639\u0644\u0647\u0627",
        evidence: [
          "\u063A\u0631\u0641\u0629 \u0627\u0644\u0639\u064A\u0627\u062F\u0629",
          "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0635\u062D\u0629",
          "\u0627\u0633\u0639\u0627\u0641\u0627\u062A \u0623\u0648\u0644\u064A\u0629",
          "\u0623\u062F\u0648\u0627\u062A \u0648\u062A\u062C\u0647\u064A\u0632\u0627\u062A \u0637\u0628\u064A\u0629",
          "\u0645\u062E\u062A\u0635 \u0635\u062D\u064A \u0645\u0624\u0647\u0644",
          "\u0622\u0644\u064A\u0629 \u0644\u0644\u062A\u0648\u0627\u0635\u0644 \u0641\u064A \u0627\u0644\u062D\u0627\u0644\u0627\u062A \u0627\u0644\u0645\u0631\u0636\u064A\u0629"
        ]
      },
      {
        code: "3-2",
        title: "\u062A\u0633\u062A\u0637\u0644\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0622\u0631\u0627\u0621 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u062D\u0648\u0644 \u062C\u0648\u062F\u0629 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0642\u062F\u0645\u0629 \u0644\u0647\u0645 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0648\u0627\u0644\u0625\u0631\u0634\u0627\u062F\u064A\u0629 \u0648\u0627\u0644\u062A\u0631\u0628\u0648\u064A\u0629",
        evidence: ["\u0627\u0633\u062A\u0628\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0633\u062A\u0637\u0644\u0627\u0639", "\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0646\u062A\u0627\u0626\u062C", "\u062E\u0637\u0637 \u0627\u0644\u062A\u062D\u0633\u064A\u0646 \u0648\u0627\u0644\u062A\u0637\u0648\u064A\u0631"]
      },
      {
        code: "3-3",
        title: "\u062A\u0648\u062C\u062F \u0644\u0627\u0626\u062D\u0629 \u0636\u0628\u0637 \u0633\u0644\u0648\u0643\u064A \u0645\u0643\u062A\u0648\u0628\u0629 \u0645\u0639\u062A\u0645\u062F\u0629 \u0648\u0645\u0639\u0644\u0646\u0629 \u062A\u0646\u0638\u0645 \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u062B\u0648\u0627\u0628 \u0648\u0627\u0644\u0639\u0642\u0627\u0628 \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0645\u0641\u0639\u0644\u0629",
        evidence: ["\u0644\u0627\u0626\u062D\u0629 \u0627\u0644\u0636\u0628\u0637 \u0627\u0644\u0633\u0644\u0648\u0643\u064A", "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u062C\u0632\u0627\u0626\u064A\u0629"]
      },
      {
        code: "3-4",
        title: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062C\u0648 \u0644\u0644\u062D\u0645\u0627\u064A\u0629 \u0645\u0646 \u0627\u0644\u062A\u0633\u0644\u0637 \u0648\u0627\u0644\u0639\u062F\u0648\u0627\u0646\u064A\u0629 \u0628\u064A\u0646 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0645\u0646\u062A\u0633\u0628\u064A\u0647\u0627 \u0648\u0641\u0642\u0627\u064B \u0644\u0644\u0627\u0626\u062D\u0629",
        evidence: [
          "\u062E\u0637\u0629 \u0627\u0644\u0623\u062E\u0635\u0627\u0626\u064A \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A",
          "\u0643\u0634\u0641 \u0628\u0627\u0644\u062D\u0627\u0644\u0627\u062A",
          "\u0637\u0631\u0642 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0645\u062A\u0628\u0639\u0629 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629",
          "\u0646\u062A\u0627\u0626\u062C \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0637\u0629"
        ]
      },
      {
        code: "3-5",
        title: "\u062A\u0642\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0625\u0631\u0634\u0627\u062F\u064A\u0629 \u0627\u0644\u062A\u0631\u0628\u0648\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0648\u0627\u0644\u0625\u064A\u0645\u0627\u0646\u064A\u0629 \u0627\u0644\u0645\u062E\u062A\u0644\u0641\u0629 \u0644\u0644\u062A\u0644\u0627\u0645\u064A\u0630",
        evidence: ["\u062E\u0637\u0629 \u0627\u0644\u0623\u062E\u0635\u0627\u0626\u064A \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u062E\u0635\u0627\u0626\u064A \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A"]
      },
      {
        code: "3-6",
        title: "\u064A\u0638\u0647\u0631 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646 \u0627\u0644\u0633\u0644\u0648\u0643 \u0627\u0644\u0623\u062E\u0644\u0627\u0642\u064A \u0648\u0627\u0644\u0627\u0639\u062A\u0632\u0627\u0632 \u0628\u0627\u0644\u0647\u0648\u064A\u0629 \u0627\u0644\u0648\u0637\u0646\u064A\u0629 (\u0627\u0644\u0627\u0644\u062A\u0632\u0627\u0645 \u0628\u062D\u0636\u0648\u0631 \u0627\u0644\u0637\u0627\u0628\u0648\u0631 \u0627\u0644\u0635\u0628\u0627\u062D\u064A- \u062A\u0631\u062F\u064A\u062F \u0627\u0644\u0646\u0634\u064A\u062F \u0627\u0644\u0648\u0637\u0646\u064A \u0628\u062D\u0645\u0627\u0633 - \u062A\u062D\u064A\u0629 \u0627\u0644\u0639\u0644\u0645 - \u0627\u0644\u0627\u0646\u0635\u0627\u062A \u0644\u0644\u0625\u0630\u0627\u0639\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629 - \u0645\u0628\u0627\u062F\u0631\u0627\u062A \u0637\u0644\u0627\u0628\u064A\u0629 \u0644\u063A\u0631\u0633 \u0627\u0644\u0642\u064A\u0645 \u0641\u064A\u0645\u0627 \u0628\u064A\u0646\u0647\u0645 \u0648\u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0627\u0644\u0645\u062C\u062A\u0645\u0639).",
        evidence: [
          "\u0637\u0627\u0628\u0648\u0631 \u0627\u0644\u0635\u0628\u0627\u062D",
          "\u0627\u0644\u0646\u0634\u064A\u062F \u0627\u0644\u0648\u0637\u0646\u064A",
          "\u062A\u062D\u064A\u0629 \u0627\u0644\u0639\u0644\u0645",
          "\u0627\u0644\u0625\u0630\u0627\u0639\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629",
          "\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629 \u0641\u064A \u0627\u0644\u0641\u0639\u0627\u0644\u064A\u0627\u062A \u0648\u0627\u0644\u0645\u0628\u0627\u062F\u0631\u0627\u062A \u0627\u0644\u062E\u064A\u0631\u064A\u0629"
        ]
      },
      {
        code: "3-7",
        title: "\u062A\u062F\u0639\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u0628\u062F\u0639\u064A\u0646 \u0648\u0627\u0644\u0645\u0628\u062A\u0643\u0631\u064A\u0646 \u0645\u0646 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646\u060C \u0648\u062A\u0634\u062C\u0639 \u0627\u0644\u062A\u0641\u0643\u064A\u0631 \u0627\u0644\u0625\u0628\u062F\u0627\u0639\u064A \u0648\u0627\u0644\u0646\u0627\u0642\u062F \u0625\u0644\u0649 \u062D\u062F \u0643\u0628\u064A\u0631",
        evidence: ["\u0622\u0644\u064A\u0629 \u0627\u0644\u062F\u0639\u0645", "\u0645\u062E\u0631\u062C\u0627\u062A \u0627\u0644\u062F\u0639\u0645", "\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0627\u062A \u0627\u0644\u0644\u0627\u0635\u0641\u064A\u0629 \u0644\u0644\u0625\u0628\u062F\u0627\u0639"]
      },
      {
        code: "3-8",
        title: "\u062A\u0634\u0631\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0641\u064A \u0623\u0646\u0634\u0637\u0629 \u0645\u062F\u0631\u0633\u064A\u0629 \u0648\u0637\u0644\u0627\u0628\u064A\u0629 \u0645\u062E\u062A\u0644\u0641\u0629 \u0628\u0635\u0641\u0629 \u0645\u0633\u062A\u0645\u0631\u0629 \u0648\u0645\u0646\u0638\u0645\u0629",
        evidence: ["\u062E\u0637\u0629 \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629"]
      },
      {
        code: "3-9",
        title: "\u062A\u0642\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0631\u0627\u0645\u062C \u0646\u0648\u0639\u064A\u0629 \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 (\u0645\u062A\u0641\u0648\u0642\u064A\u0646 \u2013 \u0645\u0628\u062F\u0639\u064A\u0646 \u2013 \u0645\u0648\u0647\u0648\u0628\u064A\u0646 \u2013 \u0645\u0647\u0627\u0631\u0627\u062A \u0627\u0644\u062D\u064A\u0627\u0629 \u2013 \u0628\u0637\u064A\u0621 \u0627\u0644\u062A\u0639\u0644\u0645)",
        evidence: ["\u0627\u0644\u0628\u0631\u0627\u0645\u062C"]
      },
      {
        code: "3-10",
        title: "\u064A\u0634\u0627\u0631\u0643 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646 \u0641\u064A \u0627\u0644\u0645\u0633\u0627\u0628\u0642\u0627\u062A \u0627\u0644\u0645\u0646\u0647\u062C\u064A\u0629 \u0648\u0627\u0644\u0625\u0628\u062F\u0627\u0639\u064A\u0629 \u0628\u0635\u0641\u0629 \u062F\u0648\u0631\u064A\u0629",
        evidence: [
          "\u0645\u0630\u0643\u0631\u0627\u062A \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0627\u062A",
          "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0625\u0646\u062C\u0627\u0632",
          "\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0627\u062A",
          "\u0642\u0627\u0626\u0645\u0629 \u0628\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u064A\u0646"
        ]
      },
      {
        code: "3-11",
        title: "\u062A\u0642\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0627\u0644\u062A\u0639\u0627\u0648\u0646 \u0645\u0639 \u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0627\u0644\u0645\u062D\u0644\u064A \u062D\u0648\u0627\u0641\u0632 \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0627\u0644\u0645\u062A\u0645\u064A\u0632\u064A\u0646 \u0648\u0627\u0644\u0645\u0628\u062F\u0639\u064A\u0646.",
        evidence: [
          "\u0643\u0634\u0648\u0641\u0627\u062A \u0628\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0628\u062F\u0639\u064A\u0646",
          "\u0641\u0639\u0627\u0644\u064A\u0627\u062A \u0627\u0644\u062A\u0643\u0631\u064A\u0645",
          "\u0645\u0630\u0643\u0631\u0627\u062A \u0637\u0644\u0628 \u0627\u0644\u062F\u0639\u0645 \u0645\u0646 \u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0627\u0644\u0645\u062D\u0644\u064A"
        ]
      },
      {
        code: "3-12",
        title: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0625\u0631\u0634\u0627\u062F\u0627\u062A \u062E\u0627\u0635\u0629 \u0628\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0648\u0627\u0636\u062D\u0629 \u0648\u0645\u0639\u0644\u0646\u0629 (\u0641\u064A \u0627\u0644\u0645\u0639\u0627\u0645\u0644 \u0648\u0627\u0644\u0645\u0642\u0635\u0641 \u0627\u0644\u0645\u062F\u0631\u0633\u064A \u0648\u0627\u0644\u0645\u0645\u0631\u0627\u062A)",
        evidence: ["\u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u0631\u0634\u0627\u062F\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629"]
      },
      {
        code: "3-13",
        title: "\u062A\u062F\u0631\u0628 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0639\u0644\u0649 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0628\u062D\u0633\u0628 \u0627\u0644\u0641\u0626\u0627\u062A \u0627\u0644\u0639\u0645\u0631\u064A\u0629",
        evidence: [
          "\u0633\u062C\u0644 \u0628\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0627\u0644\u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629",
          "\u062E\u0637\u0629 \u0648\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u062F\u0631\u064A\u0628",
          "\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u062A\u062F\u0631\u064A\u0628",
          "\u0642\u064A\u0627\u0633 \u0627\u0644\u0623\u062B\u0631"
        ]
      }
    ];
    criterion4Sub1 = {
      code: "4-1",
      title: "\u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u062A\u0639\u0644\u0645",
      weight: 5,
      indicators: [
        {
          code: "4-1-1",
          title: "\u064A\u062A\u0648\u0641\u0631 \u0627\u0644\u0643\u062A\u0627\u0628 \u0627\u0644\u0645\u062F\u0631\u0633\u064A \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u062F\u0644\u064A\u0644 \u0644\u0643\u0644 \u0645\u0639\u0644\u0645 \u0641\u064A \u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0639\u0627\u0645 \u0627\u0644\u062F\u0631\u0627\u0633\u064A",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u062A\u0633\u0644\u064A\u0645 \u0627\u0644\u0643\u062A\u0628", "\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629"]
        },
        {
          code: "4-1-2",
          title: "\u064A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0643\u062A\u0628\u0629 \u0623\u0648 \u063A\u0631\u0641\u0629 \u0645\u0635\u0627\u062F\u0631 \u062A\u0639\u0644\u0645 \u062A\u062A\u0644\u0627\u0621\u0645 \u0645\u0639 \u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646",
          evidence: ["\u062E\u0637\u0629 \u0627\u0644\u0645\u0643\u062A\u0628\u0629", "\u0645\u0642\u062A\u0646\u064A\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0648\u063A\u0631\u0641\u0629 \u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u062A\u0639\u0644\u0645"]
        },
        {
          code: "4-1-3",
          title: "\u062A\u0641\u0639\u0644 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0623\u0648 \u063A\u0631\u0641\u0629 \u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u062A\u0639\u0644\u0645 \u0628\u0645\u0627 \u064A\u0633\u0647\u0645 \u0641\u064A \u062A\u062D\u0642\u064A\u0642 \u0631\u0624\u064A\u062A\u0647\u0627 \u0648\u0631\u0633\u0627\u0644\u062A\u0647\u0627.",
          evidence: ["\u0633\u062C\u0644 \u0627\u0644\u0645\u0643\u062A\u0628\u0629", "\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u0627\u062A"]
        },
        {
          code: "4-1-4",
          title: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0623\u0648 \u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u062A\u0639\u0644\u0645 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0645\u062A\u0646\u0648\u0639\u0629 \u0645\u0637\u0628\u0648\u0639\u0629 \u0648\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629 \u0648\u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062B\u0647\u0627 \u0633\u0646\u0648\u064A\u0627",
          evidence: ["\u0633\u062C\u0644 \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0648\u0627\u0644\u0645\u0635\u0627\u062F\u0631", "\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A", "\u0634\u0628\u0643\u0629 \u0627\u0644\u0646\u062A"]
        },
        {
          code: "4-1-5",
          title: "\u062A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0633\u0627\u0626\u0644 \u062A\u0642\u0646\u064A\u0629 \u0648\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629 \u062D\u062F\u064A\u062B\u0629 \u0644\u062A\u0648\u0641\u064A\u0631 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u062F\u0639\u0645 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645 \u0648\u0627\u0644\u062A\u0639\u0644\u0645 (\u0623\u062C\u0647\u0632\u0629 \u0639\u0631\u0636 \u0630\u0643\u064A\u0629\u060C \u0623\u062C\u0647\u0632\u0629 \u0639\u0631\u0636 \u0644\u0648\u062D\u064A\u0629\u060C \u062D\u0648\u0627\u0633\u064A\u0628\u060C \u0645\u0646\u0635\u0627\u062A \u062A\u0639\u0644\u064A\u0645\u064A\u0629)",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u062C\u0631\u062F \u0627\u0644\u0648\u0633\u0627\u0626\u0644 \u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0648\u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629"]
        }
      ]
    };
    criterion4Sub2 = {
      code: "4-2",
      title: "\u062A\u0646\u0645\u064A\u0629 \u0645\u0647\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u0639\u0644\u0645",
      weight: 5,
      indicators: [
        {
          code: "4-2-1",
          title: "\u062A\u062A\u0627\u0628\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0644\u0644\u062F\u0631\u0648\u0633 \u0648\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062E\u0637\u0637 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0648\u0641\u0642\u0627\u064B \u0644\u062E\u0637\u0637 \u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0645\u0642\u0631\u0631\u0627\u062A \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629",
          evidence: [
            "\u062E\u0637\u0637 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0627\u0644\u064A\u0648\u0645\u064A\u0629/\u0627\u0644\u0641\u0635\u0644\u064A\u0629/\u0627\u0644\u0633\u0646\u0648\u064A\u0629",
            "\u062F\u0641\u0627\u062A\u0631 \u0627\u0644\u062A\u062D\u0636\u064A\u0631",
            "\u062E\u0637\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629"
          ]
        },
        {
          code: "4-2-2",
          title: "\u062A\u062A\u0627\u0628\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0627\u062A \u062A\u062F\u0631\u064A\u0633 \u062A\u0641\u0639\u0644 \u062F\u0648\u0631 \u0627\u0644\u0645\u062A\u0639\u0644\u0645 \u0641\u064A \u0627\u0644\u062A\u0639\u0644\u0645",
          evidence: [
            "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u062A\u0631\u0628\u0648\u064A (\u0628\u0646\u0648\u062F)",
            "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u0644\u0627\u0635\u0641\u064A\u0629",
            "\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u064A\u0648\u0645\u064A\u0629"
          ]
        },
        {
          code: "4-2-3",
          title: "\u062A\u062D\u062B \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0639\u0644\u0649 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0623\u062F\u0648\u0627\u062A \u0648\u0627\u0644\u0648\u0633\u0627\u0626\u0644 \u0648\u0627\u0644\u0625\u0645\u0643\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0644\u062A\u062D\u0642\u064A\u0642 \u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0648\u062A\u062A\u0627\u0628\u0639 \u0630\u0644\u0643",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u062A\u0631\u0628\u0648\u064A", "\u0627\u0644\u0648\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u062A\u0627\u062D\u0629", "\u0633\u062C\u0644 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0648\u0633\u0627\u0626\u0644"]
        },
        {
          code: "4-2-4",
          title: "\u064A\u062A\u0628\u0627\u062F\u0644 \u0627\u0644\u0645\u0639\u0644\u0645\u0648\u0646 \u0627\u0644\u062E\u0628\u0631\u0627\u062A \u0641\u064A\u0645\u0627 \u0628\u064A\u0646\u0647\u0645",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u062A\u0628\u0627\u062F\u0644 \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A", "\u0645\u062D\u0627\u0636\u0631 \u0644\u0642\u0627\u0621\u0627\u062A \u0645\u062C\u0627\u0644\u0633 \u0627\u0644\u0645\u0648\u0627\u062F"]
        },
        {
          code: "4-2-5",
          title: "\u062A\u0639\u0645\u0644 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u0648\u0646 \u0639\u0644\u0649 \u0631\u0641\u0639 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u062A\u062D\u0635\u064A\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646",
          evidence: ["\u062E\u0637\u0629 \u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u062A\u0648\u0649", "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0623\u0646\u0634\u0637\u0629"]
        }
      ]
    };
    criterion4Sub3 = {
      code: "4-3",
      title: "\u062A\u0642\u0648\u064A\u0645 \u0627\u0644\u062A\u0639\u0644\u0645",
      weight: 5,
      indicators: [
        {
          code: "4-3-1",
          title: "\u062A\u0646\u0641\u0630 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0634\u0647\u0631\u064A\u0629 \u0648\u0627\u0644\u0641\u0635\u0644\u064A\u0629 \u0648\u0627\u0644\u0646\u0647\u0627\u0626\u064A\u0629 \u0628\u0634\u0643\u0644 \u0645\u0646\u0638\u0645 \u0648\u0641\u0642\u0627\u064B \u0644\u0644\u062A\u0642\u0648\u064A\u0645 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0627\u0644\u0635\u0627\u062F\u0631 \u0639\u0646 \u0627\u0644\u0648\u0632\u0627\u0631\u0629",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A"]
        },
        {
          code: "4-3-2",
          title: "\u062A\u0642\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062A\u063A\u0630\u064A\u0629 \u0631\u0627\u062C\u0639\u0629 \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0639\u0646 \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0628\u0635\u0648\u0631\u0629 \u0645\u0633\u062A\u0645\u0631\u0629",
          evidence: ["\u0643\u0634\u0648\u0641 \u062A\u0633\u0644\u064A\u0645 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646", "\u0633\u062C\u0644 \u0644\u0642\u0627\u0621\u0627\u062A \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631"]
        },
        {
          code: "4-3-3",
          title: "\u062A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0627\u062A \u062A\u0642\u064A\u064A\u0645 \u0645\u062A\u0646\u0648\u0639\u0629 \u062A\u0631\u0627\u0639\u064A \u0627\u0644\u0641\u0631\u0648\u0642 \u0627\u0644\u0641\u0631\u062F\u064A\u0629 \u0628\u064A\u0646 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 (\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A- \u0627\u0644\u0645\u0634\u0627\u0631\u064A\u0639- \u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 - \u0627\u0644\u0639\u0631\u0648\u0636 \u0627\u0644\u062A\u0642\u062F\u064A\u0645\u064A\u0629- \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u0639\u0645\u0644\u064A\u0629)",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u062A\u0631\u0628\u0648\u064A", "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u062A\u0628\u0639\u0629"]
        },
        {
          code: "4-3-4",
          title: "\u062A\u0634\u062C\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0639\u0644\u0649 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A",
          evidence: [
            "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u062A\u0631\u0628\u0648\u064A",
            "\u0627\u0633\u062A\u0645\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A \u0644\u0644\u0645\u0639\u0644\u0645\u064A\u0646",
            "\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0630\u0627\u062A\u064A \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646"
          ]
        },
        {
          code: "4-3-5",
          title: "\u062A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0623\u062F\u0648\u0627\u062A \u0645\u0644\u0627\u0626\u0645\u0629 \u0644\u062A\u0642\u064A\u064A\u0645 \u0630\u0648\u064A \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629 \u0648\u0641\u0642 \u0627\u0644\u0644\u0627\u0626\u062D\u0629 \u0648\u0645\u0639\u062A\u0645\u062F\u0629",
          evidence: ["\u0644\u0627\u0626\u062D\u0629 \u062A\u0639\u0644\u0645 \u0630\u0648\u064A \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629", "\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u062A\u0642\u064A\u064A\u0645 \u0630\u0648\u064A \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629"]
        },
        {
          code: "4-3-6",
          title: "\u062A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0646\u0648\u0627\u062A\u062C \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0641\u064A \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062A\u0637\u0648\u064A\u0631",
          evidence: ["\u0646\u0645\u0627\u0630\u062C \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645", "\u062E\u0637\u0637 \u0627\u0644\u062A\u0637\u0648\u064A\u0631", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u0637\u0648\u064A\u0631"]
        },
        {
          code: "4-3-7",
          title: "\u062A\u0639\u062F \u0648\u062A\u0646\u0641\u0630 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0631\u0627\u0645\u062C \u062E\u0627\u0635\u0629 \u062F\u0627\u0639\u0645\u0629 \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0628\u0637\u064A\u0626\u064A \u0627\u0644\u062A\u0639\u0644\u0645",
          evidence: [
            "\u0645\u0644\u0641 \u0627\u0644\u0625\u0646\u062C\u0627\u0632",
            "\u0646\u062A\u0627\u0626\u062C \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646",
            "\u0623\u062F\u0628\u064A\u0627\u062A \u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u062F\u0627\u0639\u0645\u0629",
            "\u062A\u0642\u0627\u0631\u064A\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0628\u0631\u0627\u0645\u062C"
          ]
        }
      ]
    };
    criterion4Sub4 = {
      code: "4-4",
      title: "\u0646\u0648\u0627\u062A\u062C \u0627\u0644\u062A\u0639\u0644\u0645",
      weight: 5,
      indicators: [
        {
          code: "4-4-1",
          title: "\u064A\u062C\u062A\u0627\u0632 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0639\u0644\u0645\u064A \u0628\u0646\u062C\u0627\u062D",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0645\u0646 \u0648\u0627\u0642\u0639 \u0643\u0634\u0648\u0641 \u0627\u0644\u062A\u0635\u062D\u064A\u062D"]
        },
        {
          code: "4-4-2",
          title: "\u064A\u062D\u0627\u0641\u0638 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646 \u0639\u0644\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0645\u0648\u0627\u0631\u062F\u0647\u0627 (\u0627\u0644\u0623\u062B\u0627\u062B- \u0627\u0644\u0645\u0642\u0627\u0639\u062F \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629 - \u0627\u0644\u0633\u0628\u0648\u0631\u0627\u062A- \u0627\u0644\u062D\u0648\u0627\u0633\u064A\u0628- \u0627\u0644\u0646\u0648\u0627\u0641\u0630- \u0627\u0644\u0623\u0628\u0648\u0627\u0628 \u0648\u063A\u064A\u0631\u0647\u0627)",
          evidence: ["\u0628\u0637\u0627\u0642\u0629 \u0645\u0644\u0627\u062D\u0638\u0629", "\u062C\u062F\u0648\u0644 \u0627\u0644\u0646\u0638\u0627\u0641\u0629", "\u0627\u0644\u0645\u0648\u0627\u0631\u062F \u0627\u0644\u0645\u0627\u062F\u064A\u0629"]
        },
        {
          code: "4-4-3",
          title: "\u064A\u0645\u0627\u0631\u0633 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646 \u0627\u0644\u0645\u0646\u0627\u0642\u0634\u0629 \u0648\u0627\u0644\u062D\u0648\u0627\u0631 \u0648\u062A\u0642\u0628\u0644 \u0627\u0644\u0631\u0623\u064A \u0627\u0644\u0622\u062E\u0631 \u0648\u062A\u0628\u0627\u062F\u0644 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u0627\u0644\u062E\u0628\u0631\u0627\u062A \u0641\u064A\u0645\u0627 \u0628\u064A\u0646\u0647\u0645 \u062F\u0627\u062E\u0644 \u0627\u0644\u0635\u0641.",
          evidence: [
            "\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0627\u062A \u0627\u0644\u062A\u0639\u0644\u0645 \u0627\u0644\u0646\u0634\u0637 \u0641\u064A \u062F\u0641\u0627\u062A\u0631 \u0627\u0644\u062A\u062D\u0636\u064A\u0631",
            "(\u0627\u0644\u062A\u0639\u0644\u0645 \u0627\u0644\u062A\u0639\u0627\u0648\u0646\u064A\u060C \u0627\u0644\u062A\u0639\u0644\u0645 \u0628\u0627\u0644\u0644\u0639\u0628- \u0644\u0639\u0628 \u0627\u0644\u0623\u062F\u0648\u0627\u0631- \u0627\u0644\u062E\u0631\u0627\u0626\u0637 \u0627\u0644\u0630\u0647\u0646\u064A\u0629- \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0627\u062A \u0627\u0644\u062C\u0645\u0627\u0639\u064A\u0629- \u0648\u063A\u064A\u0631\u0647\u0627)"
          ]
        },
        {
          code: "4-4-4",
          title: "\u064A\u0631\u062A\u0641\u0639 \u0645\u0633\u062A\u0648\u0649 \u0623\u062F\u0627\u0621 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0628\u0627\u0633\u062A\u0645\u0631\u0627\u0631",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0646\u062A\u0627\u0626\u062C", "\u062A\u0642\u0627\u0631\u064A\u0631 \u062A\u062D\u0644\u064A\u0644", "\u0646\u0648\u0627\u062A\u062C \u0627\u0644\u062A\u0639\u0644\u0645"]
        }
      ]
    };
    criterion5Sub1 = {
      code: "5-1",
      title: "\u0627\u0644\u0628\u0646\u064A\u0629 \u0627\u0644\u062A\u062D\u062A\u064A\u0629",
      weight: 10,
      indicators: [
        {
          code: "5-1-1",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0628\u0646\u0649 \u0645\u0639\u062F \u0644\u064A\u0643\u0648\u0646 \u0645\u0624\u0633\u0633\u0629 \u062A\u0639\u0644\u064A\u0645\u064A\u0629",
          evidence: [
            "\u062A\u0631\u062E\u064A\u0635 \u0628\u0641\u062A\u062D \u0645\u062F\u0631\u0633\u0629 (\u0644\u0644\u0623\u0647\u0644\u064A\u0629)",
            "\u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u062E\u0645\u0633\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0644\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u064A",
            "\u062A\u0627\u0631\u064A\u062E \u0628\u062F\u0621 \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062D\u0643\u0648\u0645\u064A\u0629"
          ]
        },
        {
          code: "5-1-2",
          title: "\u062A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 (\u0643\u0647\u0631\u0628\u0627\u0621 \u0627\u0648 \u0645\u0646\u0638\u0648\u0645\u0629 \u0634\u0645\u0633\u064A\u0647\u060C \u0645\u0627\u0621\u060C \u0647\u0627\u062A\u0641).",
          evidence: ["\u062C\u0647\u0627\u0632 \u0627\u0644\u0647\u0627\u062A\u0641", "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0643\u0647\u0631\u0628\u0627\u0621 \u0648\u0627\u0644\u0645\u0627\u0621", "\u0645\u0646\u0638\u0648\u0645\u0629 \u0634\u0645\u0633\u064A\u0647"]
        },
        {
          code: "5-1-3",
          title: "\u062A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0631\u0627\u0641\u0642 \u0625\u062F\u0627\u0631\u064A\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0648\u0643\u0627\u0641\u064A\u0629.(\u0627\u0644\u0625\u062F\u0627\u0631\u0629\u2013 \u0633\u0643\u0631\u062A\u0627\u0631\u064A\u0629 \u2013 \u0635\u0627\u0644\u0629 \u0627\u062C\u062A\u0645\u0627\u0639\u0627\u062A \u2013 \u063A\u0631\u0641\u0629 \u0645\u0639\u0644\u0645\u064A\u0646/\u0645\u0639\u0644\u0645\u0627\u062A \u2013 \u0645\u062E\u0632\u0646 \u2013 \u0623\u0631\u0634\u064A\u0641)",
          evidence: ["\u0627\u0644\u0645\u0631\u0627\u0641\u0642 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629"]
        },
        {
          code: "5-1-4",
          title: "\u064A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0641\u0635\u0648\u0644 \u062F\u0631\u0627\u0633\u064A\u0629 \u062A\u062A\u0646\u0627\u0633\u0628 \u0648\u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0645\u0646\u0627\u0633\u0628\u0629 \u0645\u0646 \u062D\u064A\u062B \u0627\u0644\u0625\u0636\u0627\u0621\u0629 \u0648\u0627\u0644\u062A\u0647\u0648\u064A\u0629 \u0648\u0627\u0644\u0646\u0638\u0627\u0641\u0629 \u0648\u0627\u0644\u0623\u062B\u0627\u062B.",
          evidence: [
            "\u0627\u0644\u0641\u0635\u0648\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629",
            "\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0641\u0635\u0648\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629",
            "\u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646",
            "\u0642\u0627\u0626\u0645\u0629 \u0628\u0627\u0644\u0623\u062B\u0627\u062B \u0627\u0644\u0645\u062F\u0631\u0633\u064A"
          ]
        },
        {
          code: "5-1-5",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0639\u0627\u0645\u0644 \u0639\u0644\u0648\u0645 \u0645\u0647\u064A\u0623\u0629 \u0644\u0644\u0639\u0645\u0644 \u0648\u0645\u0641\u0639\u0644 \u0629 \u062A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0645\u0633\u062A\u0644\u0632\u0645\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u0628 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 (\u0643\u0647\u0631\u0628\u0627\u0621\u060C \u0645\u0631\u0627\u0648\u062D \u0634\u0641\u0637\u060C \u0645\u0648\u0627\u062F \u0643\u064A\u0645\u064A\u0627\u0626\u064A\u0629\u060C \u0627\u0644\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0644\u0627\u0632\u0645\u0629 \u0644\u0644\u0639\u0645\u0644 \u0641\u064A \u0627\u0644\u0645\u0639\u0645\u0644\u060C \u0625\u0631\u0634\u0627\u062F\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629).",
          evidence: [
            "\u063A\u0631\u0641 \u0627\u0644\u0645\u0639\u0627\u0645\u0644 (\u0639\u0644\u0648\u0645 \u0648\u062D\u0627\u0633\u0648\u0628)",
            "\u0644\u0648\u062D\u0629 \u0625\u0631\u0634\u0627\u062F\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0641\u064A \u0627\u0644\u0645\u0639\u0627\u0645\u0644",
            "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062C\u0631\u062F",
            "\u0633\u062C\u0644 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0639\u0645\u0644",
            "\u062C\u062F\u0648\u0644 \u0627\u0644\u0645\u0639\u0645\u0644"
          ]
        },
        {
          code: "5-1-6",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0639\u0645\u0644 \u062D\u0627\u0633\u0648\u0628 \u0645\u062C\u0647\u0632 \u0628\u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0648\u0627\u0644\u0623\u062B\u0627\u062B \u0648\u0627\u0644\u0628\u0631\u0645\u062C\u064A\u0627\u062A \u0627\u0644\u0644\u0627\u0632\u0645\u0629 \u0648\u0645\u0641\u0639\u0644.",
          evidence: ["\u063A\u0631\u0641\u0629 \u0627\u0644\u062D\u0627\u0633\u0648\u0628", "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062C\u0631\u062F", "\u0633\u062C\u0644 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0639\u0645\u0644"]
        },
        {
          code: "5-1-7",
          title: "\u062A\u062A\u0646\u0627\u0633\u0628 \u062A\u062C\u0647\u064A\u0632\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u0645\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629 \u0645\u0639 \u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629.",
          evidence: [
            "\u0645\u0639\u0645\u0644 \u0627\u0644\u062D\u0627\u0633\u0648\u0628",
            "\u0645\u0639\u0627\u0645\u0644 \u0627\u0644\u0639\u0644\u0648\u0645",
            "\u0633\u062C\u0644 \u0627\u0644\u062C\u0631\u062F",
            "\u0625\u062D\u0635\u0627\u0626\u064A\u0629 \u0628\u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646",
            "\u062A\u0642\u0633\u064A\u0645 \u0645\u062C\u0645\u0648\u0639\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u0645\u0644"
          ]
        },
        {
          code: "5-1-8",
          title: "\u062A\u0648\u062C\u062F \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0643\u062A\u0628\u0629 \u0645\u062F\u0631\u0633\u064A\u0629 \u0645\u062A\u062E\u0635\u0635\u0629 \u0648\u0645\u062A\u0646\u0648\u0639\u0629 \u0648\u0646\u0638\u0627\u0645 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0643\u062A\u0628\u0629",
          evidence: [
            "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629",
            "\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A",
            "\u062C\u062F\u0648\u0644 \u0627\u0644\u062D\u0635\u0635 \u0627\u0644\u0645\u0643\u062A\u0628\u064A\u0629",
            "\u0643\u062A\u0628 \u0645\u062A\u0646\u0648\u0639\u0629 \u0645\u0646\u0627\u0633\u0628\u0629",
            "\u0634\u0627\u0634\u0629"
          ]
        },
        {
          code: "5-1-9",
          title: "\u062A\u0648\u062C\u062F \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u063A\u0631\u0641\u0629 \u0645\u0635\u0627\u062F\u0631 \u062A\u0639\u0644\u0645 \u0645\u0646\u0648\u0639\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0641\u0626\u0627\u062A \u0627\u0644\u0639\u0645\u0631\u064A\u0629 \u0648\u0630\u0648\u064A \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629",
          evidence: ["\u0633\u062C\u0644\u0627\u062A \u063A\u0631\u0641\u0629 \u0627\u0644\u0645\u0635\u0627\u062F\u0631", "\u0646\u0638\u0627\u0645 \u0631\u0642\u0645\u064A \u0644\u0644\u063A\u0631\u0641\u0629", "\u062C\u062F\u0648\u0644 \u062D\u0635\u0635 \u063A\u0631\u0641\u0629 \u0627\u0644\u0645\u0635\u0627\u062F\u0631"]
        },
        {
          code: "5-1-10",
          title: "\u064A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0635\u0627\u0644\u0629 \u0631\u0633\u0645\u060C \u0645\u0633\u0631\u062D\u060C \u0645\u0635\u0644\u0649\u060C \u0635\u0627\u0644\u0629 \u0631\u064A\u0627\u0636\u064A\u0629.",
          evidence: ["\u0645\u062E\u0637\u0637 \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u064A"]
        },
        {
          code: "5-1-11",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0642\u0635\u0641 \u0645\u0646\u0627\u0633\u0628 \u0648\u0643\u0627\u0641\u064A \u0644\u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0645\u0623\u0643\u0648\u0644\u0627\u062A \u0648\u0627\u0644\u0645\u0634\u0631\u0648\u0628\u0627\u062A \u0627\u0644\u0635\u062D\u064A\u0629 \u0644\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646.",
          evidence: ["\u0646\u062A\u0627\u0626\u062C \u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u0642\u0635\u0641", "\u0625\u062D\u0635\u0627\u0626\u064A\u0629 \u0628\u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646"]
        },
        {
          code: "5-1-12",
          title: "\u062A\u062A\u0648\u0641\u0631 \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0635\u062D\u064A\u0629 \u0644\u0645\u0642\u0635\u0641 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 (\u0627\u0644\u062A\u0647\u0648\u064A\u0629\u060C \u0646\u0638\u0627\u0641\u0629 \u062C\u062F\u0631\u0627\u0646 \u0627\u0644\u0645\u0642\u0635\u0641\u060C \u0646\u0638\u0627\u0641\u0629 \u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0642\u0635\u0641\u060C \u0646\u0638\u0627\u0641\u0629 \u0627\u0644\u0623\u062F\u0648\u0627\u062A)\u060C \u0648\u064A\u062E\u0636\u0639 \u0644\u0644\u062A\u0641\u062A\u064A\u0634 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u062C\u0647\u0627\u062A \u0630\u0627\u062A \u0627\u0644\u0639\u0644\u0627\u0642\u0629.",
          evidence: ["\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0645\u0642\u0635\u0641", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u0641\u062A\u064A\u0634"]
        },
        {
          code: "5-1-13",
          title: "\u062A\u0648\u062C\u062F \u0628\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0631\u0627\u0641\u0642 \u0635\u062D\u064A\u0629 \u0643\u0627\u0641\u064A\u0629 \u0648\u0645\u0646\u0627\u0633\u0628\u0629 \u0645\u0646 \u062D\u064A\u062B \u0627\u0644\u0646\u0638\u0627\u0641\u0629 \u0648\u0627\u0644\u0623\u062F\u0648\u0627\u062A \u0648\u0627\u0644\u062A\u0639\u0642\u064A\u0645 \u0648\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u064A\u0627\u0647.",
          evidence: [
            "\u0627\u0644\u0645\u0631\u0627\u0641\u0642 \u0627\u0644\u0635\u062D\u064A\u0629",
            "\u0628\u0637\u0627\u0642\u0629 \u0645\u0644\u0627\u062D\u0638\u0629 \u062F\u0648\u0631\u0627\u062A \u0627\u0644\u0645\u064A\u0627\u0647",
            "\u0643\u0634\u0641 \u0628\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0641\u0629 \u0648\u0627\u0644\u062A\u0639\u0642\u064A\u0645",
            "\u0643\u0634\u0641 \u0627\u0644\u0645\u0646\u0635\u0631\u0641"
          ]
        },
        {
          code: "5-1-14",
          title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u0643\u0627\u0641\u064A\u0629 \u0644\u0625\u0642\u0627\u0645\u0629 \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u0637\u0644\u0627\u0628\u064A\u0629.",
          evidence: ["\u0645\u062E\u0637\u0637 \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u064A", "\u0625\u062D\u0635\u0627\u0626\u064A\u0629 \u0628\u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646"]
        },
        {
          code: "5-1-15",
          title: "\u062A\u0631\u0627\u0639\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0646\u0648\u0627\u062D\u064A \u0627\u0644\u062C\u0645\u0627\u0644\u064A\u0629 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0646 \u062D\u064A\u062B \u0627\u0644\u062A\u0634\u062C\u064A\u0631 \u0648\u0627\u0644\u0637\u0644\u0627\u0621.",
          evidence: ["\u0645\u0630\u0643\u0631\u0627\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629", "\u0639\u0627\u0645\u0644 \u0627\u0644\u062D\u062F\u064A\u0642\u0629"]
        },
        {
          code: "5-1-16",
          title: "\u062A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062A\u0633\u0647\u064A\u0644\u0627\u062A \u0645\u0646\u0627\u0633\u0628\u0629 \u0648\u0645\u0644\u0627\u0626\u0645\u0629 \u0644\u0630\u0648\u064A \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629 (\u0645\u0645\u0631\u0627\u062A\u060C \u0645\u0631\u0627\u0641\u0642 \u0635\u062D\u064A\u0629\u060C \u0623\u062B\u0627\u062B \u0648\u0645\u0648\u0627\u062F \u062A\u0639\u0644\u064A\u0645\u064A\u0629).",
          evidence: [
            "\u0645\u062E\u0637\u0637 \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u064A",
            "\u0643\u0634\u0641 \u0628\u0623\u0633\u0645\u0627\u0621 \u0648\u0639\u062F\u062F \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0630\u0648\u064A \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u062E\u0627\u0635\u0629",
            "\u0633\u062C\u0644 \u0627\u0644\u062C\u0631\u062F"
          ]
        },
        {
          code: "5-1-17",
          title: "\u062A\u062A\u0637\u0627\u0628\u0642 \u0645\u0633\u0627\u062D\u0627\u062A \u0627\u0644\u0641\u0635\u0648\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629 \u0648\u0627\u0644\u0645\u0631\u0627\u0641\u0642 \u0645\u0639 \u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u064A.",
          evidence: ["\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u064A", "\u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u062A\u0639\u0644\u064A\u0645"]
        }
      ]
    };
    criterion5Sub2 = {
      code: "5-2",
      title: "\u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629",
      weight: 5,
      indicators: [
        {
          code: "5-2-1",
          title: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0623\u062F\u0648\u0627\u062A \u0648\u0625\u0631\u0634\u0627\u062F\u0627\u062A \u062E\u0627\u0635\u0629 \u0628\u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0641\u064A \u0627\u0644\u0645\u0639\u0627\u0645\u0644 \u0648\u0627\u0644\u0645\u0645\u0631\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0635\u0641 \u0627\u0644\u0645\u062F\u0631\u0633\u064A",
          evidence: ["\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629", "\u0644\u0648\u062D\u0627\u062A \u0625\u0631\u0634\u0627\u062F\u0627\u062A \u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629"]
        },
        {
          code: "5-2-2",
          title: "\u062A\u0639\u0631\u0641 \u0648\u062A\u062F\u0631\u0628 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u0648\u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629 \u0639\u0644\u0649 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0623\u0645\u0646 \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629",
          evidence: [
            "\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629",
            "\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0627\u0644\u062A\u062F\u0631\u064A\u0628\u064A",
            "\u062E\u0637\u0629 \u0627\u0644\u062A\u062F\u0631\u064A\u0628",
            "\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C",
            "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629"
          ]
        },
        {
          code: "5-2-3",
          title: "\u062A\u062A\u0635\u0641 \u0628\u064A\u0626\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0623\u0646\u0647\u0627 \u0622\u0645\u0646\u0629 \u0648\u0628\u0639\u064A\u062F\u0629 \u0639\u0646 \u0627\u0644\u0623\u0645\u0627\u0643\u0646 \u0627\u0644\u062A\u064A \u062A\u0634\u0643\u0644 \u062E\u0637\u0631\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0645\u062A\u0639\u0644\u0645\u064A\u0646 (\u0643\u0627\u0628\u0644\u0627\u062A \u0636\u063A\u0637 \u0639\u0627\u0644\u064A\u060C \u0645\u062D\u0637\u0627\u062A \u0627\u0644\u063A\u0627\u0632\u060C \u0645\u062D\u0637\u0627\u062A \u0627\u0644\u0628\u062A\u0631\u0648\u0644\u060C \u0645\u062D\u0648\u0644\u0627\u062A \u0643\u0647\u0631\u0628\u0627\u0626\u064A\u0629\u060C \u0634\u0648\u0627\u0631\u0639 \u0631\u0626\u064A\u0633\u064A\u0629).",
          evidence: ["\u062E\u0631\u064A\u0637\u0629 \u0628\u0645\u0648\u0642\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0627\u0644\u0623\u0645\u0627\u0643\u0646 \u0627\u0644\u0645\u062C\u0627\u0648\u0631\u0629 \u0644\u0647\u0627"]
        },
        {
          code: "5-2-4",
          title: "\u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062E\u0637\u0629 \u0644\u0644\u0637\u0648\u0627\u0631\u0626 \u0648\u0627\u0644\u0625\u062E\u0644\u0627\u0621 \u0648\u062E\u0637\u0629 \u0644\u0644\u062A\u062F\u0631\u064A\u0628 \u0639\u0644\u064A\u0647\u0627",
          evidence: ["\u062E\u0637\u0629 \u0627\u0644\u0637\u0648\u0627\u0631\u0626 \u0648\u0627\u0644\u0625\u062E\u0644\u0627\u0621", "\u062E\u0637\u0629 \u0627\u0644\u062A\u062F\u0631\u064A\u0628", "\u0623\u062F\u0628\u064A\u0627\u062A \u0627\u0644\u062A\u062F\u0631\u064A\u0628"]
        }
      ]
    };
    criterion6Flat = [
      {
        code: "6-1",
        title: "\u064A\u062A\u0648\u0641\u0631 \u0644\u062F\u0649 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u062C\u0644\u0633 \u0622\u0628\u0627\u0621 \u0623\u0648 \u0623\u0645\u0647\u0627\u062A \u0645\u0641\u0639\u0644",
        evidence: [
          "\u0633\u062C\u0644 \u0645\u062C\u0644\u0633 \u0627\u0644\u0622\u0628\u0627\u0621/\u0627\u0644\u0623\u0645\u0647\u0627\u062A",
          "\u062E\u0637\u0629 \u0645\u062C\u0644\u0633 \u0627\u0644\u0622\u0628\u0627\u0621/\u0627\u0644\u0623\u0645\u0647\u0627\u062A",
          "\u062A\u0642\u0627\u0631\u064A\u0631",
          "\u0645\u062D\u0636\u0631 \u062A\u0634\u0643\u064A\u0644 \u0645\u062C\u0644\u0633 \u0627\u0644\u0622\u0628\u0627\u0621 \u0623\u0648 \u0627\u0644\u0623\u0645\u0647\u0627\u062A",
          "\u0645\u062D\u0636\u0631 \u0627\u062C\u062A\u0645\u0627\u0639 \u0645\u062C\u0644\u0633 \u0627\u0644\u0622\u0628\u0627\u0621/\u0627\u0644\u0623\u0645\u0647\u0627\u062A"
        ]
      },
      {
        code: "6-2",
        title: "\u062A\u0642\u064A\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0641\u0639\u0627\u0644\u064A\u0627\u062A \u0645\u0634\u062A\u0631\u0643\u0629 \u0644\u0644\u0623\u0628\u0627\u0621/\u0627\u0644\u0623\u0645\u0647\u0627\u062A \u0645\u0639 \u0623\u0628\u0646\u0627\u0626\u0647\u0645/\u0628\u0646\u0627\u062A\u0647\u0646",
        evidence: ["\u062A\u0648\u062B\u064A\u0642 \u0645\u0631\u0626\u064A", "\u0633\u062C\u0644\u0627\u062A \u062D\u0636\u0648\u0631", "\u062E\u0637\u0629 \u0627\u0644\u0623\u0646\u0634\u0637\u0629"]
      },
      {
        code: "6-3",
        title: "\u064A\u062A\u0634\u0627\u0631\u0643 \u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0627\u0644\u0645\u062D\u0644\u064A \u0648\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0641\u064A \u062D\u0636\u0648\u0631 \u0627\u0644\u0641\u0639\u0627\u0644\u064A\u0627\u062A \u0648\u0627\u0644\u0627\u062D\u062A\u0641\u0627\u0644\u0627\u062A \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0648\u0627\u0644\u0645\u062C\u062A\u0645\u0639\u064A\u0629",
        evidence: ["\u062A\u0648\u062B\u064A\u0642 \u0645\u0631\u0626\u064A", "\u0633\u062C\u0644\u0627\u062A \u062D\u0636\u0648\u0631", "\u062E\u0637\u0629 \u0627\u0644\u0623\u0646\u0634\u0637\u0629"]
      },
      {
        code: "6-4",
        title: "\u062A\u0645\u062A\u0644\u0643 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0622\u0644\u064A\u0629 \u0644\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631",
        evidence: ["\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0628\u0623\u0648\u0644\u064A\u0627\u0621 \u0627\u0644\u0623\u0645\u0648\u0631"]
      },
      {
        code: "6-5",
        title: "\u062A\u0646\u0641\u0630 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0631\u0627\u0645\u062C \u062A\u0648\u0639\u064A\u0629 \u062F\u0627\u0639\u0645\u0629 \u0644\u062B\u0642\u0627\u0641\u0629 \u0627\u0644\u0634\u0631\u0627\u0643\u0629 \u0627\u0644\u0645\u062C\u062A\u0645\u0639\u064A\u0629",
        evidence: ["\u062E\u0637\u0629 \u0627\u0644\u0623\u062E\u0635\u0627\u0626\u064A \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u062E\u0635\u0627\u0626\u064A"]
      },
      {
        code: "6-6",
        title: "\u062A\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0639 \u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0644\u062A\u0642\u062F\u064A\u0645 \u062E\u062F\u0645\u0627\u062A \u0637\u0648\u0639\u064A\u0629 \u0644\u0644\u0645\u062F\u0631\u0633\u0629",
        evidence: ["\u062E\u0637\u0629 \u062A\u0648\u0627\u0635\u0644- \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062E\u062F\u0645\u0627\u062A", "\u062A\u0648\u062B\u064A\u0642 \u0645\u0631\u0626\u064A"]
      }
    ];
    criterion7Sub1 = {
      code: "7-1",
      title: "\u0636\u0645\u0627\u0646 \u0627\u0644\u062C\u0648\u062F\u0629",
      weight: 5,
      indicators: [
        {
          code: "7-1-1",
          title: "\u064A\u0648\u062C\u062F \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0641\u0631\u064A\u0642 \u062C\u0648\u062F\u0629 \u0645\u0639\u064A\u0646 \u0628\u0642\u0631\u0627\u0631 \u0633\u0627\u0631\u064A \u0627\u0644\u0645\u0641\u0639\u0648\u0644.",
          evidence: ["\u0643\u0634\u0641 \u0628\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0639\u0627\u0645\u0644\u064A\u0646 \u0641\u064A \u0627\u0644\u0648\u062D\u062F\u0629"]
        },
        {
          code: "7-1-2",
          title: "\u062A\u0642\u0648\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0646\u0634\u0631 \u062B\u0642\u0627\u0641\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0628\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0648\u0627\u0644\u0645\u062C\u062A\u0645\u0639",
          evidence: ["\u062E\u0637\u0629 \u0627\u0644\u062C\u0648\u062F\u0629", "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u062F\u0627\u0621"]
        },
        {
          code: "7-1-3",
          title: "\u064A\u0645\u0627\u0631\u0633 \u0627\u0644\u0639\u0627\u0645\u0644\u064A\u0646 \u0641\u064A \u0648\u062D\u062F\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0645\u0647\u0627\u0645 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0646\u0627\u0637\u0629 \u0628\u0647\u0645",
          evidence: [
            "\u062E\u0637\u0629 \u0627\u0644\u062C\u0648\u062F\u0629",
            "\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629",
            "\u0627\u0644\u0645\u0647\u0627\u0645 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A",
            "\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u062C\u0648\u062F\u0629",
            "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u062F\u0627\u0621",
            "\u0645\u062D\u0627\u0636\u0631 \u0627\u062C\u062A\u0645\u0627\u0639\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0644\u064A\u0646"
          ]
        },
        {
          code: "7-1-4",
          title: "\u064A\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0645\u0643\u062A\u0628 \u062E\u0627\u0635 \u0628\u0627\u0644\u062C\u0648\u062F\u0629 \u0648\u0623\u062B\u0627\u062B \u0643\u0627\u0641\u064A \u0648\u0645\u0646\u0627\u0633\u0628 \u0644\u062D\u0641\u0638 \u0627\u0644\u0648\u062B\u0627\u0626\u0642 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0646\u0638\u0627\u0645 \u0627\u0644\u062C\u0648\u062F\u0629 (\u0645\u0643\u0627\u062A\u0628 \u0648\u0643\u0631\u0627\u0633\u064A \u0648\u062F\u0648\u0644\u0627\u0628 \u0645\u0643\u062A\u0628\u064A)",
          evidence: ["\u063A\u0631\u0641\u0629 \u0627\u0644\u062C\u0648\u062F\u0629", "\u0633\u062C\u0644 \u062C\u0631\u062F \u0627\u0644\u0623\u062B\u0627\u062B"]
        }
      ]
    };
    criterion7Sub2 = {
      code: "7-2",
      title: "\u0627\u0644\u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0645\u0633\u062A\u0645\u0631",
      weight: 5,
      indicators: [
        {
          code: "7-2-1",
          title: "\u062A\u0642\u0648\u0645 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0628\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0623\u062F\u0627\u0621 \u0628\u0635\u0641\u0629 \u062F\u0648\u0631\u064A\u0629",
          evidence: [
            "\u0622\u0644\u064A\u0629 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u062F\u0648\u0631\u064A\u0629",
            "\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u062F\u0648\u0631\u064A\u0629",
            "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u062F\u0627\u0621 \u0627\u0644\u062F\u0648\u0631\u064A\u0629 \u062E\u0637\u0629 \u0627\u0644\u062A\u062D\u0633\u064A\u0646 \u0648\u0627\u0644\u062A\u0637\u0648\u064A\u0631"
          ]
        },
        {
          code: "7-2-2",
          title: "\u062A\u0636\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u062E\u0637\u0629 \u0644\u0644\u062A\u062D\u0633\u064A\u0646 \u0648\u0627\u0644\u0627\u0628\u062A\u0643\u0627\u0631 \u0648\u0627\u0644\u062A\u0637\u0648\u064A\u0631 \u0648\u062A\u0642\u064A\u0633 \u0645\u0624\u0634\u0631\u0627\u062A\u0647\u0627 \u0628\u0635\u0641\u0629 \u062F\u0648\u0631\u064A\u0629",
          evidence: ["\u0622\u0644\u064A\u0627\u062A \u0627\u0644\u0642\u064A\u0627\u0633", "\u0646\u062A\u0627\u0626\u062C \u0648\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0642\u064A\u0627\u0633", "\u062E\u0637\u0629 \u0627\u0644\u062A\u062D\u0633\u064A\u0646 \u0648\u0627\u0644\u062A\u0637\u0648\u064A\u0631"]
        }
      ]
    };
    SEED_CRITERIA = [
      {
        code: "1",
        title: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629",
        weight: 15,
        subCriteria: [criterion1Sub1, criterion1Sub2],
        flatIndicators: null
      },
      {
        code: "2",
        title: "\u0627\u0644\u0645\u0639\u0644\u0645\u0648\u0646 \u0648\u0627\u0644\u0643\u0648\u0627\u062F\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u062E\u062F\u0645\u064A\u0629",
        weight: 20,
        subCriteria: [criterion2Sub1, criterion2Sub2],
        flatIndicators: null
      },
      {
        code: "3",
        title: "\u0627\u0644\u0645\u062A\u0639\u0644\u0645\u0648\u0646",
        weight: 15,
        subCriteria: null,
        flatIndicators: criterion3Flat
      },
      {
        code: "4",
        title: "\u0627\u0644\u062A\u0639\u0644\u064A\u0645 \u0648\u0627\u0644\u062A\u0639\u0644\u0645",
        weight: 20,
        subCriteria: [criterion4Sub1, criterion4Sub2, criterion4Sub3, criterion4Sub4],
        flatIndicators: null
      },
      {
        code: "5",
        title: "\u0627\u0644\u0628\u064A\u0626\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629",
        weight: 15,
        subCriteria: [criterion5Sub1, criterion5Sub2],
        flatIndicators: null
      },
      {
        code: "6",
        title: "\u0627\u0644\u0634\u0631\u0627\u0643\u0629 \u0627\u0644\u0645\u062C\u062A\u0645\u0639\u064A\u0629",
        weight: 5,
        subCriteria: null,
        flatIndicators: criterion6Flat
      },
      {
        code: "7",
        title: "\u0636\u0645\u0627\u0646 \u0627\u0644\u062C\u0648\u062F\u0629 \u0648\u0627\u0644\u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0645\u0633\u062A\u0645\u0631",
        weight: 10,
        subCriteria: [criterion7Sub1, criterion7Sub2],
        flatIndicators: null
      }
    ];
    DEFAULT_SYSTEM_SETTINGS = {
      schoolCodePrefix: "RIFAD",
      maxFileSizeMB: 25,
      allowedFileExtensions: "pdf,doc,docx,xls,xlsx,jpg,jpeg,png,zip,csv",
      sessionTimeoutMinutes: 480,
      requireAdminMfa: false,
      ratings: RATING_SCALE,
      visitTypes: [
        { label: "\u0632\u064A\u0627\u0631\u0629 \u062A\u0642\u064A\u064A\u0645\u064A\u0629 \u062F\u0648\u0631\u064A\u0629", color: "blue" },
        { label: "\u0632\u064A\u0627\u0631\u0629 \u0645\u062A\u0627\u0628\u0639\u0629", color: "green" },
        { label: "\u0632\u064A\u0627\u0631\u0629 \u0627\u0633\u062A\u0634\u0643\u0627\u0641\u064A\u0629", color: "amber" },
        { label: "\u0632\u064A\u0627\u0631\u0629 \u0637\u0627\u0631\u0626\u0629", color: "red" }
      ]
    };
  }
});

// node_modules/bcryptjs/index.js
function randomBytes(len) {
  try {
    return crypto.getRandomValues(new Uint8Array(len));
  } catch {
  }
  try {
    return import_crypto.default.randomBytes(len);
  } catch {
  }
  if (!randomFallback) {
    throw Error(
      "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative"
    );
  }
  return randomFallback(len);
}
function setRandomFallback(random) {
  randomFallback = random;
}
function genSaltSync(rounds, seed_length) {
  rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof rounds !== "number")
    throw Error(
      "Illegal arguments: " + typeof rounds + ", " + typeof seed_length
    );
  if (rounds < 4) rounds = 4;
  else if (rounds > 31) rounds = 31;
  var salt = [];
  salt.push("$2b$");
  if (rounds < 10) salt.push("0");
  salt.push(rounds.toString());
  salt.push("$");
  salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
  return salt.join("");
}
function genSalt(rounds, seed_length, callback) {
  if (typeof seed_length === "function")
    callback = seed_length, seed_length = void 0;
  if (typeof rounds === "function") callback = rounds, rounds = void 0;
  if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
  else if (typeof rounds !== "number")
    throw Error("illegal arguments: " + typeof rounds);
  function _async(callback2) {
    nextTick(function() {
      try {
        callback2(null, genSaltSync(rounds));
      } catch (err) {
        callback2(err);
      }
    });
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function hashSync(password, salt) {
  if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof salt === "number") salt = genSaltSync(salt);
  if (typeof password !== "string" || typeof salt !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof salt);
  return _hash(password, salt);
}
function hash(password, salt, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password === "string" && typeof salt === "number")
      genSalt(salt, function(err, salt2) {
        _hash(password, salt2, callback2, progressCallback);
      });
    else if (typeof password === "string" && typeof salt === "string")
      _hash(password, salt, callback2, progressCallback);
    else
      nextTick(
        callback2.bind(
          this,
          Error("Illegal arguments: " + typeof password + ", " + typeof salt)
        )
      );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function safeStringCompare(known, unknown) {
  var diff = known.length ^ unknown.length;
  for (var i = 0; i < known.length; ++i) {
    diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
  }
  return diff === 0;
}
function compareSync(password, hash2) {
  if (typeof password !== "string" || typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof hash2);
  if (hash2.length !== 60) return false;
  return safeStringCompare(
    hashSync(password, hash2.substring(0, hash2.length - 31)),
    hash2
  );
}
function compare(password, hashValue, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password !== "string" || typeof hashValue !== "string") {
      nextTick(
        callback2.bind(
          this,
          Error(
            "Illegal arguments: " + typeof password + ", " + typeof hashValue
          )
        )
      );
      return;
    }
    if (hashValue.length !== 60) {
      nextTick(callback2.bind(this, null, false));
      return;
    }
    hash(
      password,
      hashValue.substring(0, 29),
      function(err, comp) {
        if (err) callback2(err);
        else callback2(null, safeStringCompare(comp, hashValue));
      },
      progressCallback
    );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function getRounds(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  return parseInt(hash2.split("$")[2], 10);
}
function getSalt(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  if (hash2.length !== 60)
    throw Error("Illegal hash length: " + hash2.length + " != 60");
  return hash2.substring(0, 29);
}
function truncates(password) {
  if (typeof password !== "string")
    throw Error("Illegal arguments: " + typeof password);
  return utf8Length(password) > 72;
}
function utf8Length(string2) {
  var len = 0, c = 0;
  for (var i = 0; i < string2.length; ++i) {
    c = string2.charCodeAt(i);
    if (c < 128) len += 1;
    else if (c < 2048) len += 2;
    else if ((c & 64512) === 55296 && (string2.charCodeAt(i + 1) & 64512) === 56320) {
      ++i;
      len += 4;
    } else len += 3;
  }
  return len;
}
function utf8Array(string2) {
  var offset = 0, c1, c2;
  var buffer = new Array(utf8Length(string2));
  for (var i = 0, k = string2.length; i < k; ++i) {
    c1 = string2.charCodeAt(i);
    if (c1 < 128) {
      buffer[offset++] = c1;
    } else if (c1 < 2048) {
      buffer[offset++] = c1 >> 6 | 192;
      buffer[offset++] = c1 & 63 | 128;
    } else if ((c1 & 64512) === 55296 && ((c2 = string2.charCodeAt(i + 1)) & 64512) === 56320) {
      c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
      ++i;
      buffer[offset++] = c1 >> 18 | 240;
      buffer[offset++] = c1 >> 12 & 63 | 128;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    } else {
      buffer[offset++] = c1 >> 12 | 224;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    }
  }
  return buffer;
}
function base64_encode(b, len) {
  var off = 0, rs = [], c1, c2;
  if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
  while (off < len) {
    c1 = b[off++] & 255;
    rs.push(BASE64_CODE[c1 >> 2 & 63]);
    c1 = (c1 & 3) << 4;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 4 & 15;
    rs.push(BASE64_CODE[c1 & 63]);
    c1 = (c2 & 15) << 2;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 6 & 3;
    rs.push(BASE64_CODE[c1 & 63]);
    rs.push(BASE64_CODE[c2 & 63]);
  }
  return rs.join("");
}
function base64_decode(s, len) {
  var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
  if (len <= 0) throw Error("Illegal len: " + len);
  while (off < slen - 1 && olen < len) {
    code = s.charCodeAt(off++);
    c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    code = s.charCodeAt(off++);
    c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c1 == -1 || c2 == -1) break;
    o = c1 << 2 >>> 0;
    o |= (c2 & 48) >> 4;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c3 == -1) break;
    o = (c2 & 15) << 4 >>> 0;
    o |= (c3 & 60) >> 2;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    o = (c3 & 3) << 6 >>> 0;
    o |= c4;
    rs.push(String.fromCharCode(o));
    ++olen;
  }
  var res = [];
  for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
  return res;
}
function _encipher(lr, off, P, S) {
  var n, l = lr[off], r = lr[off + 1];
  l ^= P[0];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[1];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[2];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[3];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[4];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[5];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[6];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[7];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[8];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[9];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[10];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[11];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[12];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[13];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[14];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[15];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[16];
  lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
  lr[off + 1] = l;
  return lr;
}
function _streamtoword(data, offp) {
  for (var i = 0, word = 0; i < 4; ++i)
    word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
  return { key: word, offp };
}
function _key(key, P, S) {
  var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
  for (i = 0; i < plen; i += 2)
    lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
function _ekskey(data, key, P, S) {
  var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
  offp = 0;
  for (i = 0; i < plen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
function _crypt(b, salt, rounds, callback, progressCallback) {
  var cdata = C_ORIG.slice(), clen = cdata.length, err;
  if (rounds < 4 || rounds > 31) {
    err = Error("Illegal number of rounds (4-31): " + rounds);
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.length !== BCRYPT_SALT_LEN) {
    err = Error(
      "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN
    );
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  rounds = 1 << rounds >>> 0;
  var P, S, i = 0, j;
  if (typeof Int32Array === "function") {
    P = new Int32Array(P_ORIG);
    S = new Int32Array(S_ORIG);
  } else {
    P = P_ORIG.slice();
    S = S_ORIG.slice();
  }
  _ekskey(salt, b, P, S);
  function next() {
    if (progressCallback) progressCallback(i / rounds);
    if (i < rounds) {
      var start = Date.now();
      for (; i < rounds; ) {
        i = i + 1;
        _key(b, P, S);
        _key(salt, P, S);
        if (Date.now() - start > MAX_EXECUTION_TIME) break;
      }
    } else {
      for (i = 0; i < 64; i++)
        for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
      var ret = [];
      for (i = 0; i < clen; i++)
        ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
      if (callback) {
        callback(null, ret);
        return;
      } else return ret;
    }
    if (callback) nextTick(next);
  }
  if (typeof callback !== "undefined") {
    next();
  } else {
    var res;
    while (true) if (typeof (res = next()) !== "undefined") return res || [];
  }
}
function _hash(password, salt, callback, progressCallback) {
  var err;
  if (typeof password !== "string" || typeof salt !== "string") {
    err = Error("Invalid string / salt: Not a string");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var minor, offset;
  if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
    err = Error("Invalid salt version: " + salt.substring(0, 2));
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.charAt(2) === "$") minor = String.fromCharCode(0), offset = 3;
  else {
    minor = salt.charAt(2);
    if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
      err = Error("Invalid salt revision: " + salt.substring(2, 4));
      if (callback) {
        nextTick(callback.bind(this, err));
        return;
      } else throw err;
    }
    offset = 4;
  }
  if (salt.charAt(offset + 2) > "$") {
    err = Error("Missing salt rounds");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
  password += minor >= "a" ? "\0" : "";
  var passwordb = utf8Array(password), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
  function finish(bytes) {
    var res = [];
    res.push("$2");
    if (minor >= "a") res.push(minor);
    res.push("$");
    if (rounds < 10) res.push("0");
    res.push(rounds.toString());
    res.push("$");
    res.push(base64_encode(saltb, saltb.length));
    res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
    return res.join("");
  }
  if (typeof callback == "undefined")
    return finish(_crypt(passwordb, saltb, rounds));
  else {
    _crypt(
      passwordb,
      saltb,
      rounds,
      function(err2, bytes) {
        if (err2) callback(err2, null);
        else callback(null, finish(bytes));
      },
      progressCallback
    );
  }
}
function encodeBase64(bytes, length) {
  return base64_encode(bytes, length);
}
function decodeBase64(string2, length) {
  return base64_decode(string2, length);
}
var import_crypto, randomFallback, nextTick, BASE64_CODE, BASE64_INDEX, BCRYPT_SALT_LEN, GENSALT_DEFAULT_LOG2_ROUNDS, BLOWFISH_NUM_ROUNDS, MAX_EXECUTION_TIME, P_ORIG, S_ORIG, C_ORIG, bcryptjs_default;
var init_bcryptjs = __esm({
  "node_modules/bcryptjs/index.js"() {
    import_crypto = __toESM(require("crypto"), 1);
    randomFallback = null;
    nextTick = typeof setImmediate === "function" ? setImmediate : typeof scheduler === "object" && typeof scheduler.postTask === "function" ? scheduler.postTask.bind(scheduler) : setTimeout;
    BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
    BASE64_INDEX = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      61,
      62,
      63,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    BCRYPT_SALT_LEN = 16;
    GENSALT_DEFAULT_LOG2_ROUNDS = 10;
    BLOWFISH_NUM_ROUNDS = 16;
    MAX_EXECUTION_TIME = 100;
    P_ORIG = [
      608135816,
      2242054355,
      320440878,
      57701188,
      2752067618,
      698298832,
      137296536,
      3964562569,
      1160258022,
      953160567,
      3193202383,
      887688300,
      3232508343,
      3380367581,
      1065670069,
      3041331479,
      2450970073,
      2306472731
    ];
    S_ORIG = [
      3509652390,
      2564797868,
      805139163,
      3491422135,
      3101798381,
      1780907670,
      3128725573,
      4046225305,
      614570311,
      3012652279,
      134345442,
      2240740374,
      1667834072,
      1901547113,
      2757295779,
      4103290238,
      227898511,
      1921955416,
      1904987480,
      2182433518,
      2069144605,
      3260701109,
      2620446009,
      720527379,
      3318853667,
      677414384,
      3393288472,
      3101374703,
      2390351024,
      1614419982,
      1822297739,
      2954791486,
      3608508353,
      3174124327,
      2024746970,
      1432378464,
      3864339955,
      2857741204,
      1464375394,
      1676153920,
      1439316330,
      715854006,
      3033291828,
      289532110,
      2706671279,
      2087905683,
      3018724369,
      1668267050,
      732546397,
      1947742710,
      3462151702,
      2609353502,
      2950085171,
      1814351708,
      2050118529,
      680887927,
      999245976,
      1800124847,
      3300911131,
      1713906067,
      1641548236,
      4213287313,
      1216130144,
      1575780402,
      4018429277,
      3917837745,
      3693486850,
      3949271944,
      596196993,
      3549867205,
      258830323,
      2213823033,
      772490370,
      2760122372,
      1774776394,
      2652871518,
      566650946,
      4142492826,
      1728879713,
      2882767088,
      1783734482,
      3629395816,
      2517608232,
      2874225571,
      1861159788,
      326777828,
      3124490320,
      2130389656,
      2716951837,
      967770486,
      1724537150,
      2185432712,
      2364442137,
      1164943284,
      2105845187,
      998989502,
      3765401048,
      2244026483,
      1075463327,
      1455516326,
      1322494562,
      910128902,
      469688178,
      1117454909,
      936433444,
      3490320968,
      3675253459,
      1240580251,
      122909385,
      2157517691,
      634681816,
      4142456567,
      3825094682,
      3061402683,
      2540495037,
      79693498,
      3249098678,
      1084186820,
      1583128258,
      426386531,
      1761308591,
      1047286709,
      322548459,
      995290223,
      1845252383,
      2603652396,
      3431023940,
      2942221577,
      3202600964,
      3727903485,
      1712269319,
      422464435,
      3234572375,
      1170764815,
      3523960633,
      3117677531,
      1434042557,
      442511882,
      3600875718,
      1076654713,
      1738483198,
      4213154764,
      2393238008,
      3677496056,
      1014306527,
      4251020053,
      793779912,
      2902807211,
      842905082,
      4246964064,
      1395751752,
      1040244610,
      2656851899,
      3396308128,
      445077038,
      3742853595,
      3577915638,
      679411651,
      2892444358,
      2354009459,
      1767581616,
      3150600392,
      3791627101,
      3102740896,
      284835224,
      4246832056,
      1258075500,
      768725851,
      2589189241,
      3069724005,
      3532540348,
      1274779536,
      3789419226,
      2764799539,
      1660621633,
      3471099624,
      4011903706,
      913787905,
      3497959166,
      737222580,
      2514213453,
      2928710040,
      3937242737,
      1804850592,
      3499020752,
      2949064160,
      2386320175,
      2390070455,
      2415321851,
      4061277028,
      2290661394,
      2416832540,
      1336762016,
      1754252060,
      3520065937,
      3014181293,
      791618072,
      3188594551,
      3933548030,
      2332172193,
      3852520463,
      3043980520,
      413987798,
      3465142937,
      3030929376,
      4245938359,
      2093235073,
      3534596313,
      375366246,
      2157278981,
      2479649556,
      555357303,
      3870105701,
      2008414854,
      3344188149,
      4221384143,
      3956125452,
      2067696032,
      3594591187,
      2921233993,
      2428461,
      544322398,
      577241275,
      1471733935,
      610547355,
      4027169054,
      1432588573,
      1507829418,
      2025931657,
      3646575487,
      545086370,
      48609733,
      2200306550,
      1653985193,
      298326376,
      1316178497,
      3007786442,
      2064951626,
      458293330,
      2589141269,
      3591329599,
      3164325604,
      727753846,
      2179363840,
      146436021,
      1461446943,
      4069977195,
      705550613,
      3059967265,
      3887724982,
      4281599278,
      3313849956,
      1404054877,
      2845806497,
      146425753,
      1854211946,
      1266315497,
      3048417604,
      3681880366,
      3289982499,
      290971e4,
      1235738493,
      2632868024,
      2414719590,
      3970600049,
      1771706367,
      1449415276,
      3266420449,
      422970021,
      1963543593,
      2690192192,
      3826793022,
      1062508698,
      1531092325,
      1804592342,
      2583117782,
      2714934279,
      4024971509,
      1294809318,
      4028980673,
      1289560198,
      2221992742,
      1669523910,
      35572830,
      157838143,
      1052438473,
      1016535060,
      1802137761,
      1753167236,
      1386275462,
      3080475397,
      2857371447,
      1040679964,
      2145300060,
      2390574316,
      1461121720,
      2956646967,
      4031777805,
      4028374788,
      33600511,
      2920084762,
      1018524850,
      629373528,
      3691585981,
      3515945977,
      2091462646,
      2486323059,
      586499841,
      988145025,
      935516892,
      3367335476,
      2599673255,
      2839830854,
      265290510,
      3972581182,
      2759138881,
      3795373465,
      1005194799,
      847297441,
      406762289,
      1314163512,
      1332590856,
      1866599683,
      4127851711,
      750260880,
      613907577,
      1450815602,
      3165620655,
      3734664991,
      3650291728,
      3012275730,
      3704569646,
      1427272223,
      778793252,
      1343938022,
      2676280711,
      2052605720,
      1946737175,
      3164576444,
      3914038668,
      3967478842,
      3682934266,
      1661551462,
      3294938066,
      4011595847,
      840292616,
      3712170807,
      616741398,
      312560963,
      711312465,
      1351876610,
      322626781,
      1910503582,
      271666773,
      2175563734,
      1594956187,
      70604529,
      3617834859,
      1007753275,
      1495573769,
      4069517037,
      2549218298,
      2663038764,
      504708206,
      2263041392,
      3941167025,
      2249088522,
      1514023603,
      1998579484,
      1312622330,
      694541497,
      2582060303,
      2151582166,
      1382467621,
      776784248,
      2618340202,
      3323268794,
      2497899128,
      2784771155,
      503983604,
      4076293799,
      907881277,
      423175695,
      432175456,
      1378068232,
      4145222326,
      3954048622,
      3938656102,
      3820766613,
      2793130115,
      2977904593,
      26017576,
      3274890735,
      3194772133,
      1700274565,
      1756076034,
      4006520079,
      3677328699,
      720338349,
      1533947780,
      354530856,
      688349552,
      3973924725,
      1637815568,
      332179504,
      3949051286,
      53804574,
      2852348879,
      3044236432,
      1282449977,
      3583942155,
      3416972820,
      4006381244,
      1617046695,
      2628476075,
      3002303598,
      1686838959,
      431878346,
      2686675385,
      1700445008,
      1080580658,
      1009431731,
      832498133,
      3223435511,
      2605976345,
      2271191193,
      2516031870,
      1648197032,
      4164389018,
      2548247927,
      300782431,
      375919233,
      238389289,
      3353747414,
      2531188641,
      2019080857,
      1475708069,
      455242339,
      2609103871,
      448939670,
      3451063019,
      1395535956,
      2413381860,
      1841049896,
      1491858159,
      885456874,
      4264095073,
      4001119347,
      1565136089,
      3898914787,
      1108368660,
      540939232,
      1173283510,
      2745871338,
      3681308437,
      4207628240,
      3343053890,
      4016749493,
      1699691293,
      1103962373,
      3625875870,
      2256883143,
      3830138730,
      1031889488,
      3479347698,
      1535977030,
      4236805024,
      3251091107,
      2132092099,
      1774941330,
      1199868427,
      1452454533,
      157007616,
      2904115357,
      342012276,
      595725824,
      1480756522,
      206960106,
      497939518,
      591360097,
      863170706,
      2375253569,
      3596610801,
      1814182875,
      2094937945,
      3421402208,
      1082520231,
      3463918190,
      2785509508,
      435703966,
      3908032597,
      1641649973,
      2842273706,
      3305899714,
      1510255612,
      2148256476,
      2655287854,
      3276092548,
      4258621189,
      236887753,
      3681803219,
      274041037,
      1734335097,
      3815195456,
      3317970021,
      1899903192,
      1026095262,
      4050517792,
      356393447,
      2410691914,
      3873677099,
      3682840055,
      3913112168,
      2491498743,
      4132185628,
      2489919796,
      1091903735,
      1979897079,
      3170134830,
      3567386728,
      3557303409,
      857797738,
      1136121015,
      1342202287,
      507115054,
      2535736646,
      337727348,
      3213592640,
      1301675037,
      2528481711,
      1895095763,
      1721773893,
      3216771564,
      62756741,
      2142006736,
      835421444,
      2531993523,
      1442658625,
      3659876326,
      2882144922,
      676362277,
      1392781812,
      170690266,
      3921047035,
      1759253602,
      3611846912,
      1745797284,
      664899054,
      1329594018,
      3901205900,
      3045908486,
      2062866102,
      2865634940,
      3543621612,
      3464012697,
      1080764994,
      553557557,
      3656615353,
      3996768171,
      991055499,
      499776247,
      1265440854,
      648242737,
      3940784050,
      980351604,
      3713745714,
      1749149687,
      3396870395,
      4211799374,
      3640570775,
      1161844396,
      3125318951,
      1431517754,
      545492359,
      4268468663,
      3499529547,
      1437099964,
      2702547544,
      3433638243,
      2581715763,
      2787789398,
      1060185593,
      1593081372,
      2418618748,
      4260947970,
      69676912,
      2159744348,
      86519011,
      2512459080,
      3838209314,
      1220612927,
      3339683548,
      133810670,
      1090789135,
      1078426020,
      1569222167,
      845107691,
      3583754449,
      4072456591,
      1091646820,
      628848692,
      1613405280,
      3757631651,
      526609435,
      236106946,
      48312990,
      2942717905,
      3402727701,
      1797494240,
      859738849,
      992217954,
      4005476642,
      2243076622,
      3870952857,
      3732016268,
      765654824,
      3490871365,
      2511836413,
      1685915746,
      3888969200,
      1414112111,
      2273134842,
      3281911079,
      4080962846,
      172450625,
      2569994100,
      980381355,
      4109958455,
      2819808352,
      2716589560,
      2568741196,
      3681446669,
      3329971472,
      1835478071,
      660984891,
      3704678404,
      4045999559,
      3422617507,
      3040415634,
      1762651403,
      1719377915,
      3470491036,
      2693910283,
      3642056355,
      3138596744,
      1364962596,
      2073328063,
      1983633131,
      926494387,
      3423689081,
      2150032023,
      4096667949,
      1749200295,
      3328846651,
      309677260,
      2016342300,
      1779581495,
      3079819751,
      111262694,
      1274766160,
      443224088,
      298511866,
      1025883608,
      3806446537,
      1145181785,
      168956806,
      3641502830,
      3584813610,
      1689216846,
      3666258015,
      3200248200,
      1692713982,
      2646376535,
      4042768518,
      1618508792,
      1610833997,
      3523052358,
      4130873264,
      2001055236,
      3610705100,
      2202168115,
      4028541809,
      2961195399,
      1006657119,
      2006996926,
      3186142756,
      1430667929,
      3210227297,
      1314452623,
      4074634658,
      4101304120,
      2273951170,
      1399257539,
      3367210612,
      3027628629,
      1190975929,
      2062231137,
      2333990788,
      2221543033,
      2438960610,
      1181637006,
      548689776,
      2362791313,
      3372408396,
      3104550113,
      3145860560,
      296247880,
      1970579870,
      3078560182,
      3769228297,
      1714227617,
      3291629107,
      3898220290,
      166772364,
      1251581989,
      493813264,
      448347421,
      195405023,
      2709975567,
      677966185,
      3703036547,
      1463355134,
      2715995803,
      1338867538,
      1343315457,
      2802222074,
      2684532164,
      233230375,
      2599980071,
      2000651841,
      3277868038,
      1638401717,
      4028070440,
      3237316320,
      6314154,
      819756386,
      300326615,
      590932579,
      1405279636,
      3267499572,
      3150704214,
      2428286686,
      3959192993,
      3461946742,
      1862657033,
      1266418056,
      963775037,
      2089974820,
      2263052895,
      1917689273,
      448879540,
      3550394620,
      3981727096,
      150775221,
      3627908307,
      1303187396,
      508620638,
      2975983352,
      2726630617,
      1817252668,
      1876281319,
      1457606340,
      908771278,
      3720792119,
      3617206836,
      2455994898,
      1729034894,
      1080033504,
      976866871,
      3556439503,
      2881648439,
      1522871579,
      1555064734,
      1336096578,
      3548522304,
      2579274686,
      3574697629,
      3205460757,
      3593280638,
      3338716283,
      3079412587,
      564236357,
      2993598910,
      1781952180,
      1464380207,
      3163844217,
      3332601554,
      1699332808,
      1393555694,
      1183702653,
      3581086237,
      1288719814,
      691649499,
      2847557200,
      2895455976,
      3193889540,
      2717570544,
      1781354906,
      1676643554,
      2592534050,
      3230253752,
      1126444790,
      2770207658,
      2633158820,
      2210423226,
      2615765581,
      2414155088,
      3127139286,
      673620729,
      2805611233,
      1269405062,
      4015350505,
      3341807571,
      4149409754,
      1057255273,
      2012875353,
      2162469141,
      2276492801,
      2601117357,
      993977747,
      3918593370,
      2654263191,
      753973209,
      36408145,
      2530585658,
      25011837,
      3520020182,
      2088578344,
      530523599,
      2918365339,
      1524020338,
      1518925132,
      3760827505,
      3759777254,
      1202760957,
      3985898139,
      3906192525,
      674977740,
      4174734889,
      2031300136,
      2019492241,
      3983892565,
      4153806404,
      3822280332,
      352677332,
      2297720250,
      60907813,
      90501309,
      3286998549,
      1016092578,
      2535922412,
      2839152426,
      457141659,
      509813237,
      4120667899,
      652014361,
      1966332200,
      2975202805,
      55981186,
      2327461051,
      676427537,
      3255491064,
      2882294119,
      3433927263,
      1307055953,
      942726286,
      933058658,
      2468411793,
      3933900994,
      4215176142,
      1361170020,
      2001714738,
      2830558078,
      3274259782,
      1222529897,
      1679025792,
      2729314320,
      3714953764,
      1770335741,
      151462246,
      3013232138,
      1682292957,
      1483529935,
      471910574,
      1539241949,
      458788160,
      3436315007,
      1807016891,
      3718408830,
      978976581,
      1043663428,
      3165965781,
      1927990952,
      4200891579,
      2372276910,
      3208408903,
      3533431907,
      1412390302,
      2931980059,
      4132332400,
      1947078029,
      3881505623,
      4168226417,
      2941484381,
      1077988104,
      1320477388,
      886195818,
      18198404,
      3786409e3,
      2509781533,
      112762804,
      3463356488,
      1866414978,
      891333506,
      18488651,
      661792760,
      1628790961,
      3885187036,
      3141171499,
      876946877,
      2693282273,
      1372485963,
      791857591,
      2686433993,
      3759982718,
      3167212022,
      3472953795,
      2716379847,
      445679433,
      3561995674,
      3504004811,
      3574258232,
      54117162,
      3331405415,
      2381918588,
      3769707343,
      4154350007,
      1140177722,
      4074052095,
      668550556,
      3214352940,
      367459370,
      261225585,
      2610173221,
      4209349473,
      3468074219,
      3265815641,
      314222801,
      3066103646,
      3808782860,
      282218597,
      3406013506,
      3773591054,
      379116347,
      1285071038,
      846784868,
      2669647154,
      3771962079,
      3550491691,
      2305946142,
      453669953,
      1268987020,
      3317592352,
      3279303384,
      3744833421,
      2610507566,
      3859509063,
      266596637,
      3847019092,
      517658769,
      3462560207,
      3443424879,
      370717030,
      4247526661,
      2224018117,
      4143653529,
      4112773975,
      2788324899,
      2477274417,
      1456262402,
      2901442914,
      1517677493,
      1846949527,
      2295493580,
      3734397586,
      2176403920,
      1280348187,
      1908823572,
      3871786941,
      846861322,
      1172426758,
      3287448474,
      3383383037,
      1655181056,
      3139813346,
      901632758,
      1897031941,
      2986607138,
      3066810236,
      3447102507,
      1393639104,
      373351379,
      950779232,
      625454576,
      3124240540,
      4148612726,
      2007998917,
      544563296,
      2244738638,
      2330496472,
      2058025392,
      1291430526,
      424198748,
      50039436,
      29584100,
      3605783033,
      2429876329,
      2791104160,
      1057563949,
      3255363231,
      3075367218,
      3463963227,
      1469046755,
      985887462
    ];
    C_ORIG = [
      1332899944,
      1700884034,
      1701343084,
      1684370003,
      1668446532,
      1869963892
    ];
    bcryptjs_default = {
      setRandomFallback,
      genSaltSync,
      genSalt,
      hashSync,
      hash,
      compareSync,
      compare,
      getRounds,
      getSalt,
      truncates,
      encodeBase64,
      decodeBase64
    };
  }
});

// src/lib/db/seed-sqlite.ts
var seed_sqlite_exports = {};
__export(seed_sqlite_exports, {
  seedDatabase: () => seedDatabase
});
async function seedDatabase(opts = {}) {
  const DEMO_PASSWORD = opts.demoPassword ?? // 16 حرفاً عشوائياً: أحرف كبيرة وصغيرة وأرقام ورمز
  (0, import_crypto2.randomBytes)(12).toString("base64url") + "!9a";
  const insert = async (rs) => {
    await batch(rs.map((r) => ({ sql: r.sql, params: [...r.params] })));
  };
  const rows = [];
  const roles = [
    {
      key: "SUPER_ADMIN",
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629",
      description: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0648\u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0645\u062F\u064A\u0631\u064A\u0627\u062A \u0648\u0627\u0644\u0645\u062F\u0627\u0631\u0633 \u0648\u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0648\u0627\u0644\u0623\u0648\u0632\u0627\u0646 \u0648\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0648\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u062F\u0642\u064A\u0642",
      scope: "system",
      permissions: { all: true }
    },
    {
      key: "EDUCATION_DIRECTOR",
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 / \u0627\u0644\u0645\u062F\u064A\u0631\u064A\u0629",
      description: "\u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0627\u0644\u0645\u062F\u0627\u0631\u0633 \u0627\u0644\u062A\u0627\u0628\u0639\u0629 \u0644\u0646\u0637\u0627\u0642\u0647\u060C \u0648\u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A\u060C \u0648\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631\u060C \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F\u060C \u0648\u0645\u062A\u0627\u0628\u0639\u0629 \u062E\u0637\u0637 \u0627\u0644\u062A\u062D\u0633\u064A\u0646",
      scope: "directorate",
      permissions: {
        viewSchools: true,
        manageVisits: true,
        reviewReports: true,
        approveReports: true,
        viewReports: true,
        manageImprovementPlans: true,
        viewAnalytics: true
      }
    },
    {
      key: "INSPECTOR",
      name: "\u0627\u0644\u0645\u0641\u062A\u0634 / \u0627\u0644\u0645\u0648\u062C\u0647 \u0627\u0644\u062A\u0631\u0628\u0648\u064A",
      description: "\u0645\u0634\u0627\u0647\u062F\u0629 \u0627\u0644\u0645\u062F\u0627\u0631\u0633 \u0627\u0644\u0645\u0648\u0643\u0644\u0629 \u0625\u0644\u064A\u0647\u060C \u0648\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A\u060C \u0648\u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u064A\u062F\u0627\u0646\u064A\u060C \u0648\u0625\u0631\u0641\u0627\u0642 \u0627\u0644\u0623\u062F\u0644\u0629\u060C \u0648\u0631\u0641\u0639 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631",
      scope: "schools_assigned",
      permissions: {
        createVisits: true,
        evaluateIndicators: true,
        uploadEvidence: true,
        submitReports: true,
        createCorrectiveActions: true
      }
    },
    {
      key: "SCHOOL_PRINCIPAL",
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629",
      description: "\u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062F\u0631\u0633\u0629\u060C \u0648\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629\u060C \u0648\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0648\u0627\u0644\u0634\u0648\u0627\u0647\u062F\u060C \u0648\u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A\u060C \u0648\u0625\u0639\u062F\u0627\u062F \u062E\u0637\u0637 \u0627\u0644\u062A\u062D\u0633\u064A\u0646",
      scope: "own_school",
      permissions: {
        viewOwnSchool: true,
        manageSchoolProfile: true,
        uploadEvidence: true,
        respondToNotes: true,
        createImprovementPlans: true,
        viewReports: true
      }
    },
    {
      key: "QUALITY_COORDINATOR",
      name: "\u0645\u0646\u0633\u0642 \u0627\u0644\u062C\u0648\u062F\u0629",
      description: "\u0625\u062F\u0627\u0631\u0629 \u0623\u062F\u0644\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0648\u0645\u0631\u0627\u062C\u0639\u062A\u0647\u0627 \u0648\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u0648\u062E\u0637\u0637 \u0627\u0644\u062A\u0637\u0648\u064A\u0631 \u0648\u0646\u0633\u0628 \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0634\u0648\u0627\u0647\u062F",
      scope: "own_school",
      permissions: {
        manageEvidenceLibrary: true,
        reviewEvidence: true,
        trackIndicators: true,
        viewAnalytics: true
      }
    },
    {
      key: "TEACHER",
      name: "\u0627\u0644\u0645\u0639\u0644\u0645",
      description: "\u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A\u0647 \u0648\u0635\u0644\u0627\u062D\u064A\u0627\u062A\u0647 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629\u060C \u0648\u0631\u0641\u0639 \u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0625\u0646\u062C\u0627\u0632\u060C \u0648\u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0648\u0627\u0644\u062A\u063A\u0630\u064A\u0629 \u0627\u0644\u0631\u0627\u062C\u0639\u0629\u060C \u0648\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u062A\u0637\u0648\u064A\u0631 \u0627\u0644\u0645\u0647\u0646\u064A",
      scope: "personal",
      permissions: {
        viewOwnData: true,
        uploadAchievementFiles: true,
        viewFeedback: true
      }
    },
    {
      key: "PARENT",
      name: "\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631",
      description: "\u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0627\u0644\u0622\u0645\u0646 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0623\u0628\u0646\u0627\u0626\u0647 \u0627\u0644\u0645\u0635\u0631\u062D \u0628\u0647\u0627 \u0641\u0642\u0637\u060C \u0648\u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0645\u062F\u0631\u0633\u0629",
      scope: "personal",
      permissions: {
        viewChildren: true,
        communicateWithSchool: true
      }
    },
    {
      key: "GUEST",
      name: "\u0632\u0627\u0626\u0631 \u0639\u0627\u0645",
      description: "\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629 \u0644\u0644\u0639\u0627\u0645\u0629 \u0641\u0642\u0637",
      scope: "public",
      permissions: { viewPublicInfo: true }
    }
  ];
  for (const r of roles) {
    rows.push({
      sql: `INSERT INTO roles (id, key, name, description, scope, permissions, is_system, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET
            name=excluded.name, description=excluded.description, scope=excluded.scope,
            permissions=excluded.permissions`,
      params: [
        uuid(),
        r.key,
        r.name,
        r.description,
        r.scope,
        toJson(r.permissions),
        nowISO()
      ]
    });
  }
  await insert(rows);
  rows.length = 0;
  const settings = [
    { key: "system.name", value: { ar: "\u0645\u0646\u0635\u0629 \u0625\u062A\u0642\u0627\u0646 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0645\u062F\u0631\u0633\u064A \u0648\u0636\u0645\u0627\u0646 \u062C\u0648\u062F\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645" } },
    {
      key: "system.institution",
      value: { ar: "\u0645\u0646\u0635\u0629 \u0625\u062A\u0642\u0627\u0646 \u2014 \u0645\u062F\u064A\u0631\u064A\u0629 \u0627\u0644\u062C\u0631\u0627\u062D\u064A\u060C \u0645\u062D\u0627\u0641\u0638\u0629 \u0627\u0644\u062D\u062F\u064A\u062F\u0629" }
    },
    { key: "ratings.scale", value: RATING_SCALE },
    { key: "file.maxSizeMB", value: DEFAULT_SYSTEM_SETTINGS.maxFileSizeMB },
    {
      key: "file.allowedExtensions",
      value: DEFAULT_SYSTEM_SETTINGS.allowedFileExtensions
    },
    { key: "visit.types", value: DEFAULT_SYSTEM_SETTINGS.visitTypes },
    { key: "seeded.demo", value: true }
  ];
  for (const s of settings) {
    rows.push({
      sql: `INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      params: [s.key, toJson(s.value), nowISO()]
    });
  }
  for (const r of RATING_SCALE) {
    rows.push({
      sql: `INSERT INTO rating_scale (id, key, label_ar, label_en, score, order_index, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET
            label_ar=excluded.label_ar, score=excluded.score, order_index=excluded.order_index`,
      params: [uuid(), r.value, r.label, r.label, r.score, r.order]
    });
  }
  for (const criterion of SEED_CRITERIA) {
    const criterionId = uuid();
    rows.push({
      sql: `INSERT INTO criteria (id, code, title, weight, order_index, created_at)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET
            title=excluded.title, weight=excluded.weight`,
      params: [
        criterionId,
        criterion.code,
        criterion.title,
        criterion.weight,
        parseInt(criterion.code),
        nowISO()
      ]
    });
    const subs = criterion.subCriteria ?? [];
    for (const sub of subs) {
      const subId = uuid();
      rows.push({
        sql: `INSERT INTO sub_criteria (id, code, title, weight, order_index, criterion_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET
              title=excluded.title, weight=excluded.weight`,
        params: [
          subId,
          sub.code,
          sub.title,
          sub.weight,
          subOrder(sub.code),
          criterionId,
          nowISO()
        ]
      });
      for (const ind of sub.indicators) {
        rows.push({
          sql: `INSERT INTO indicators (id, code, title, evidence, verification_tools, order_index, criterion_id, sub_criterion_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET
                title=excluded.title, evidence=excluded.evidence, verification_tools=excluded.verification_tools`,
          params: [
            uuid(),
            ind.code,
            ind.title,
            toJson(ind.evidence),
            toJson(["\u0641\u062D\u0635 \u0648\u062B\u0627\u0626\u0642", "\u0645\u0644\u0627\u062D\u0638\u0629", "\u0645\u0642\u0627\u0628\u0644\u0629"]),
            indCodeOrder(ind.code),
            criterionId,
            subId,
            nowISO()
          ]
        });
      }
    }
    if (criterion.flatIndicators) {
      for (const ind of criterion.flatIndicators) {
        rows.push({
          sql: `INSERT INTO indicators (id, code, title, evidence, verification_tools, order_index, criterion_id, sub_criterion_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET
                title=excluded.title, evidence=excluded.evidence, verification_tools=excluded.verification_tools`,
          params: [
            uuid(),
            ind.code,
            ind.title,
            toJson(ind.evidence),
            toJson(["\u0641\u062D\u0635 \u0648\u062B\u0627\u0626\u0642", "\u0645\u0644\u0627\u062D\u0638\u0629", "\u0645\u0642\u0627\u0628\u0644\u0629"]),
            indCodeOrder(ind.code),
            criterionId,
            null,
            nowISO()
          ]
        });
      }
    }
  }
  await insert(rows);
  rows.length = 0;
  const governorateId = uuid();
  rows.push({
    sql: `INSERT INTO governorates (id, name, code, created_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING`,
    params: [
      governorateId,
      "\u0627\u0644\u062D\u062F\u064A\u062F\u0629",
      "HUDAIDAH",
      nowISO()
    ]
  });
  const directorateId = uuid();
  rows.push({
    sql: `INSERT INTO directorates (id, name, code, governorate_id, created_at)
          VALUES (?, ?, ?, (SELECT id FROM governorates WHERE code = 'HUDAIDAH'), ?)
          ON CONFLICT(code) DO NOTHING`,
    params: [directorateId, "\u0627\u0644\u062C\u0631\u0627\u062D\u064A", "JARAHI", nowISO()]
  });
  if (!opts.demo) {
    await insert(rows);
    rows.length = 0;
    console.log("\u062A\u0645 \u0628\u0630\u0631 \u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0648\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u0648\u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A. \u0623\u0646\u0634\u0626 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0623\u0648\u0644 \u0645\u0646 \u0635\u0641\u062D\u0629 /setup.");
    return {};
  }
  const DEMO_NOTE = "\u0633\u062C\u0644 \u062A\u0648\u0636\u064A\u062D\u064A \u0644\u0644\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0644 \u0641\u0642\u0637. \u064A\u064F\u062D\u0630\u0641 \u0623\u0648 \u064A\u064F\u0633\u062A\u0628\u062F\u0644 \u0628\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u062F\u0627\u0631\u0633 \u0627\u0644\u0641\u0639\u0644\u064A\u0629 \u0639\u0628\u0631 \u0627\u0633\u062A\u064A\u0631\u0627\u062F Excel/CSV \u0623\u0648 \u0627\u0644\u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u064A\u062F\u0648\u064A.";
  const demoSchools = [
    { id: uuid(), code: "RIFAD-DEMO-001", name: "\u0645\u062F\u0631\u0633\u0629 \u0625\u062A\u0642\u0627\u0646 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 (\u0623) \u2014 \u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0647\u0645\u064A\u0629 \u0644\u0644\u0639\u0631\u0636 \u0641\u0642\u0637", stage: "\u0623\u0633\u0627\u0633\u064A", lat: 14.945, lng: 43.455, type: "\u062D\u0643\u0648\u0645\u064A\u0629" },
    { id: uuid(), code: "RIFAD-DEMO-002", name: "\u0645\u062F\u0631\u0633\u0629 \u0625\u062A\u0642\u0627\u0646 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 (\u0628) \u2014 \u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0647\u0645\u064A\u0629 \u0644\u0644\u0639\u0631\u0636 \u0641\u0642\u0637", stage: "\u062B\u0627\u0646\u0648\u064A", lat: 14.9, lng: 43.5, type: "\u062D\u0643\u0648\u0645\u064A\u0629" },
    { id: uuid(), code: "RIFAD-DEMO-003", name: "\u0645\u062F\u0631\u0633\u0629 \u0625\u062A\u0642\u0627\u0646 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 (\u062C) \u2014 \u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0647\u0645\u064A\u0629 \u0644\u0644\u0639\u0631\u0636 \u0641\u0642\u0637", stage: "\u0623\u0633\u0627\u0633\u064A", lat: 14.985, lng: 43.52, type: "\u062D\u0643\u0648\u0645\u064A\u0629" }
  ];
  for (const sc of demoSchools) {
    rows.push({
      sql: `INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage, latitude, longitude, contact_phone, data_source, status, notes, last_updated_at, created_at)
            VALUES (?, ?, ?, (SELECT id FROM governorates WHERE code = 'HUDAIDAH'),
                    (SELECT id FROM directorates WHERE code = 'JARAHI'),
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING`,
      params: [
        sc.id,
        sc.code,
        sc.name,
        sc.type,
        sc.stage,
        sc.lat,
        sc.lng,
        "000-000000",
        "MANUAL",
        "ACTIVE",
        DEMO_NOTE + " \u0627\u0644\u0625\u062D\u062F\u0627\u062B\u064A\u0627\u062A \u062A\u0648\u0636\u064A\u062D\u064A\u0629.",
        nowISO(),
        nowISO()
      ]
    });
  }
  const schoolId = demoSchools[0].id;
  const demoUsers = [
    {
      key: "SUPER_ADMIN",
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A",
      email: "admin@rifad.demo",
      directorateId: null,
      schoolId: null
    },
    {
      key: "EDUCATION_DIRECTOR",
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u062F\u064A\u0631\u064A\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A",
      email: "director@rifad.demo",
      directorateId,
      schoolId: null
    },
    {
      key: "INSPECTOR",
      name: "\u0645\u0641\u062A\u0634 \u062A\u0631\u0628\u0648\u064A \u062A\u062C\u0631\u064A\u0628\u064A",
      email: "inspector@rifad.demo",
      directorateId,
      schoolId: null
    },
    {
      key: "SCHOOL_PRINCIPAL",
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A",
      email: "principal@rifad.demo",
      directorateId: null,
      schoolId
    },
    {
      key: "QUALITY_COORDINATOR",
      name: "\u0645\u0646\u0633\u0642 \u062C\u0648\u062F\u0629 \u062A\u062C\u0631\u064A\u0628\u064A",
      email: "quality@rifad.demo",
      directorateId: null,
      schoolId
    },
    {
      key: "TEACHER",
      name: "\u0645\u0639\u0644\u0645 \u062A\u062C\u0631\u064A\u0628\u064A",
      email: "teacher@rifad.demo",
      directorateId: null,
      schoolId
    },
    {
      key: "PARENT",
      name: "\u0648\u0644\u064A \u0623\u0645\u0631 \u062A\u062C\u0631\u064A\u0628\u064A",
      email: "parent@rifad.demo",
      directorateId: null,
      schoolId: null
    }
  ];
  const createdUserIds = {};
  for (const u of demoUsers) {
    const roleRow = await queryOne("SELECT id FROM roles WHERE key = ?", [u.key]);
    if (!roleRow) continue;
    const passwordHash = await bcryptjs_default.hash(DEMO_PASSWORD, 12);
    const userId = uuid();
    createdUserIds[u.key] = userId;
    rows.push({
      sql: `INSERT INTO users (id, name, email, password_hash, role_id, directorate_id, school_id, is_active, token_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?) ON CONFLICT(email) DO UPDATE SET
            name=excluded.name, role_id=excluded.role_id, directorate_id=excluded.directorate_id, school_id=excluded.school_id`,
      params: [
        userId,
        u.name,
        u.email,
        passwordHash,
        roleRow.id,
        u.directorateId,
        u.schoolId,
        nowISO(),
        nowISO()
      ]
    });
  }
  await insert(rows);
  rows.length = 0;
  const inspectorId = createdUserIds["INSPECTOR"];
  const directorId = createdUserIds["EDUCATION_DIRECTOR"];
  const principalId = createdUserIds["SCHOOL_PRINCIPAL"];
  const dayMs = 864e5;
  const iso = (offsetDays) => new Date(Date.now() + offsetDays * dayMs).toISOString();
  const DEMO_FLAG = "\u0645\u062B\u0627\u0644 \u062A\u0648\u0636\u064A\u062D\u064A \u0641\u0642\u0637 \u2014 \u0644\u064A\u0633 \u062A\u0642\u064A\u064A\u0645\u0627\u064B \u0641\u0639\u0644\u064A\u0627\u064B";
  if (inspectorId) {
    for (const sc of demoSchools) {
      await exec("INSERT OR IGNORE INTO school_assignments (id, user_id, school_id, assigned_by_id) VALUES (?,?,?,?)", [uuid(), inspectorId, sc.id, directorId ?? null]);
      await exec(`INSERT OR IGNORE INTO school_profiles (school_id, students_count, teachers_count, admin_staff_count, service_staff_count, classes_count,
           has_science_lab, has_computer_lab, has_library, has_canteen, has_playground, info_source, verified)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`, [sc.id, null, null, null, null, null, null, null, null, null, null, "\u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u2014 \u0644\u0645 \u062A\u064F\u062F\u062E\u0644 \u0628\u0639\u062F"]);
    }
    const indicators = await query("SELECT id, code FROM indicators ORDER BY order_index");
    const scoreFor = (schoolIdx, i) => {
      const base = [3, 2, 3, 1, 3, 2, 3, 0, 2, 3][(i * 7 + schoolIdx * 3) % 10];
      return schoolIdx === 1 ? Math.max(0, base - 1) : base;
    };
    const makeVisit = async (schoolIdx, status, coverage, daysAgo) => {
      const visitId = uuid();
      const when = iso(-daysAgo);
      await exec(`INSERT INTO visits (id, school_id, inspector_id, type, purpose, status, scheduled_at, started_at, ended_at, submitted_at, submitted_by_id, completion, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        visitId,
        demoSchools[schoolIdx].id,
        inspectorId,
        "PERIODIC",
        "\u0632\u064A\u0627\u0631\u0629 \u062A\u0639\u0631\u064A\u0641\u064A\u0629 \u0644\u0644\u0645\u0646\u0635\u0629 (\u062A\u0648\u0636\u064A\u062D\u064A\u0629)",
        status,
        when,
        when,
        ["SUBMITTED", "COMPLETED"].includes(status) ? when : null,
        ["SUBMITTED", "COMPLETED"].includes(status) ? when : null,
        ["SUBMITTED", "COMPLETED"].includes(status) ? inspectorId : null,
        Math.round(coverage * 100),
        when,
        when
      ]);
      const n = Math.round(indicators.length * coverage);
      await batch(indicators.slice(0, n).map((ind, i) => ({
        sql: `INSERT INTO evaluations (id, visit_id, indicator_id, status, score, notes, verification_methods, rated_by_id, rated_at, created_by_id, created_at, updated_at, version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        params: [
          uuid(),
          visitId,
          ind.id,
          "EVALUATED",
          scoreFor(schoolIdx, i),
          i % 9 === 0 ? DEMO_FLAG : null,
          JSON.stringify(["\u0641\u062D\u0635 \u0648\u062B\u0627\u0626\u0642"]),
          inspectorId,
          when,
          inspectorId,
          when,
          when
        ]
      })));
      return visitId;
    };
    const v1 = await makeVisit(0, "COMPLETED", 1, 40);
    await makeVisit(0, "COMPLETED", 1, 130);
    await makeVisit(1, "SUBMITTED", 0.7, 6);
    await makeVisit(2, "IN_PROGRESS", 0.2, 1);
    for (const [idx, off, st] of [[0, 3, "SCHEDULED"], [2, -9, "SCHEDULED"]]) {
      await exec(`INSERT INTO visits (id, school_id, inspector_id, type, purpose, status, scheduled_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`, [uuid(), demoSchools[idx].id, inspectorId, "FOLLOW_UP", "\u0632\u064A\u0627\u0631\u0629 \u0645\u062A\u0627\u0628\u0639\u0629 (\u062A\u0648\u0636\u064A\u062D\u064A\u0629)", st, iso(off), nowISO(), nowISO()]);
    }
    if (principalId) {
      const planId = uuid();
      await exec(`INSERT INTO improvement_plans (id, school_id, title, description, status, created_by_id) VALUES (?,?,?,?,?,?)`, [planId, demoSchools[0].id, "\u062E\u0637\u0629 \u062A\u062D\u0633\u064A\u0646 \u062A\u0648\u0636\u064A\u062D\u064A\u0629", DEMO_FLAG, "ACTIVE", principalId]);
      const weakInd = await query(`SELECT i.id, e.id AS eid FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
         WHERE e.visit_id = ? AND e.score <= 1 ORDER BY i.order_index LIMIT 2`, [v1]);
      await batch(weakInd.map((w, i) => ({
        sql: `INSERT INTO corrective_actions (id, plan_id, evaluation_id, indicator_id, problem_description, priority, proposed_action,
             responsible_id, due_date, success_indicator, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        params: [
          uuid(),
          planId,
          w.eid,
          w.id,
          "\u0642\u0635\u0648\u0631 \u0645\u0643\u062A\u0634\u0641 \u0641\u064A \u0627\u0644\u0632\u064A\u0627\u0631\u0629 \u0627\u0644\u062A\u0648\u0636\u064A\u062D\u064A\u0629",
          i === 0 ? "HIGH" : "MEDIUM",
          "\u0625\u062C\u0631\u0627\u0621 \u062A\u0635\u062D\u064A\u062D\u064A \u062A\u0648\u0636\u064A\u062D\u064A",
          principalId,
          iso(i === 0 ? -5 : 14).slice(0, 10),
          "\u0631\u0641\u0639 \u062F\u0644\u064A\u0644 \u062C\u062F\u064A\u062F \u064A\u062B\u0628\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629",
          "IN_PROGRESS"
        ]
      })));
    }
  }
  const parentUserId = createdUserIds["PARENT"];
  if (parentUserId) {
    const studentId = uuid();
    const parentId = uuid();
    await exec("INSERT INTO students (id, school_id, name, grade, section) VALUES (?,?,?,?,?)", [studentId, schoolId, "\u0637\u0627\u0644\u0628 \u062A\u0648\u0636\u064A\u062D\u064A", "\u0627\u0644\u0635\u0641 \u0627\u0644\u062E\u0627\u0645\u0633", "\u0623"]);
    await exec("INSERT INTO parents (id, name, user_id) VALUES (?,?,?)", [parentId, "\u0648\u0644\u064A \u0623\u0645\u0631 \u062A\u062C\u0631\u064A\u0628\u064A", parentUserId]);
    await exec("INSERT INTO parent_student (id, parent_id, student_id) VALUES (?,?,?)", [uuid(), parentId, studentId]);
  }
  console.log("\u062A\u0645 \u0628\u0630\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0648\u0644\u064A\u0629 \u0648\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u0644\u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A SQLite.");
  console.log("\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u062A\u0648\u0636\u064A\u062D\u064A\u0629 (\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0648\u062D\u064E\u0651\u062F\u0629 \u0648\u062A\u064F\u0639\u0631\u0636 \u0647\u0646\u0627 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0641\u0642\u0637 \u2014 \u0627\u062D\u0641\u0638\u0647\u0627):");
  for (const u of demoUsers) console.log(`  ${u.email}`);
  console.log(`  \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631: ${DEMO_PASSWORD}`);
  console.log("\u062A\u0646\u0628\u064A\u0647: \u0647\u0630\u0647 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0644\u0644\u0639\u0631\u0636 \u0641\u0642\u0637 \u0648\u0644\u0627 \u062A\u0645\u062B\u0644 \u0645\u062F\u0627\u0631\u0633 \u0623\u0648 \u0623\u0641\u0631\u0627\u062F\u064B\u0627 \u062D\u0642\u064A\u0642\u064A\u064A\u0646. \u0627\u062D\u0630\u0641\u0647\u0627 \u0642\u0628\u0644 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0641\u0639\u0644\u064A.");
  return { demoPassword: DEMO_PASSWORD };
}
function subOrder(code) {
  const m = code.match(/^(\d+)-(\d+)$/);
  return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
}
function indCodeOrder(code) {
  const p = code.split("-").map(Number);
  if (p.length === 3) return (p[2] || 0) * 1e4 + (p[1] || 0) * 100 + (p[0] || 0);
  return (p[1] || 0) * 1e4 + (p[0] || 0);
}
var import_crypto2;
var init_seed_sqlite = __esm({
  "src/lib/db/seed-sqlite.ts"() {
    "use strict";
    init_sqlite();
    init_data();
    init_bcryptjs();
    import_crypto2 = require("crypto");
  }
});

// src/lib/db/sqlite.ts
function uuid() {
  return (0, import_crypto3.randomUUID)();
}
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function toJson(value) {
  return JSON.stringify(value ?? null);
}
function isRemoteDb() {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}
function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}
function normalizeParams(params) {
  return params.map((v) => {
    if (v === void 0 || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    return v;
  });
}
function localRunner(db) {
  return {
    all: async (sql) => db.prepare(sql).all(),
    script: async (sql) => {
      db.exec(sql);
    },
    inTransaction: async (fn) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  };
}
function remoteRunner(client) {
  const script = async (sql) => {
    if (client.executeMultiple) await client.executeMultiple(sql);
    else for (const s of splitStatements(sql)) await client.execute({ sql: s, args: [] });
  };
  return {
    all: async (sql) => (await client.execute({ sql, args: [] })).rows,
    script,
    // ALTER TABLE في libSQL لا يُلفّ بمعاملة تفاعلية بأمان؛ تُنفَّذ الجمل بالترتيب.
    inTransaction: async (fn) => fn()
  };
}
async function local() {
  if (localDb) return localDb;
  if (!localReady) {
    localReady = (async () => {
      if (isServerlessRuntime()) throw new DbNotConfiguredError();
      const { openLocalDatabase: openLocalDatabase2 } = await Promise.resolve().then(() => (init_local_driver(), local_driver_exports));
      const db = openLocalDatabase2();
      await runMigrations(localRunner(db));
      localDb = db;
      return db;
    })();
    localReady.catch(() => {
      localReady = null;
    });
  }
  return localReady;
}
async function remote() {
  if (!remoteReady) {
    remoteReady = (async () => {
      const { createClient: createClient2 } = await Promise.resolve().then(() => (init_node2(), node_exports));
      const client = createClient2({
        url: process.env.TURSO_DATABASE_URL.trim(),
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || void 0
      });
      await client.execute({ sql: "PRAGMA foreign_keys = ON", args: [] }).catch(() => void 0);
      await runMigrations(remoteRunner(client));
      return client;
    })();
    remoteReady.catch(() => {
      remoteReady = null;
    });
  }
  return remoteReady;
}
async function waitLocalTurn() {
  if (txContext.getStore()?.local) return;
  await localTxTail;
}
function isBusy(e) {
  const code = e?.code;
  return code === "SQLITE_BUSY" || e?.rawCode === 5 || /database is locked/i.test(String(e?.message));
}
async function remoteExecute(sql, params) {
  const inTx = txContext.getStore()?.remote;
  if (inTx) return inTx.execute({ sql, args: normalizeParams(params) });
  const client = await remote();
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.execute({ sql, args: normalizeParams(params) });
    } catch (e) {
      if (!isBusy(e) || attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, Math.min(25 * 2 ** attempt, 1e3)));
    }
  }
}
async function query(sql, params = []) {
  if (isRemoteDb()) {
    const r = await remoteExecute(sql, params);
    return r.rows;
  }
  const db = await local();
  await waitLocalTurn();
  return db.prepare(sql).all(...normalizeParams(params));
}
async function queryOne(sql, params = []) {
  if (isRemoteDb()) {
    const r = await remoteExecute(sql, params);
    return r.rows[0] ?? null;
  }
  const db = await local();
  await waitLocalTurn();
  const row = db.prepare(sql).get(...normalizeParams(params));
  return row ? row : null;
}
async function exec(sql, params = []) {
  if (isRemoteDb()) {
    const r = await remoteExecute(sql, params);
    return {
      changes: r.rowsAffected ?? 0,
      lastInsertId: r.lastInsertRowid == null ? null : String(r.lastInsertRowid)
    };
  }
  const db = await local();
  await waitLocalTurn();
  const info = db.prepare(sql).run(...normalizeParams(params));
  return { changes: info.changes, lastInsertId: String(info.lastInsertRowid) };
}
async function execScript(sql) {
  if (isRemoteDb()) {
    await remoteRunner(await remote()).script(sql);
    return;
  }
  const db = await local();
  await waitLocalTurn();
  db.exec(sql);
}
async function batch(statements) {
  if (!statements.length) return;
  if (isRemoteDb() && !txContext.getStore()) {
    const client = await remote();
    const prepared = statements.map((s) => ({ sql: s.sql, args: normalizeParams(s.params ?? []) }));
    if (client.batch) await client.batch(prepared, "write");
    else for (const s of prepared) await client.execute(s);
    return;
  }
  await transaction(async () => {
    for (const s of statements) await exec(s.sql, s.params ?? []);
  });
}
async function transaction(fn) {
  if (txContext.getStore()) return fn();
  if (isRemoteDb()) {
    const client = await remote();
    let tx;
    for (let attempt = 0; ; attempt++) {
      try {
        tx = await client.transaction("write");
        break;
      } catch (e) {
        if (!isBusy(e) || attempt >= 8) throw e;
        await new Promise((r) => setTimeout(r, Math.min(25 * 2 ** attempt, 1e3)));
      }
    }
    try {
      const result = await txContext.run({ remote: tx }, fn);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback().catch(() => void 0);
      throw e;
    }
  }
  const db = await local();
  const prev = localTxTail;
  let release;
  localTxTail = new Promise((r) => release = r);
  await prev;
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await txContext.run({ local: true }, fn);
      db.exec("COMMIT");
      return result;
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      throw e;
    }
  } finally {
    release();
  }
}
async function checkpointLocal() {
  if (isRemoteDb()) return;
  try {
    (await local()).pragma("wal_checkpoint(TRUNCATE)");
  } catch {
  }
}
async function closeDb() {
  if (remoteReady) {
    const c = await remoteReady.catch(() => null);
    c?.close();
    remoteReady = null;
  }
  if (localDb) {
    localDb.close();
    localDb = null;
  }
  localReady = null;
  localTxTail = Promise.resolve();
}
async function initDatabase(opts) {
  await execScript(SCHEMA_SQL);
  if (isRemoteDb()) await runMigrations(remoteRunner(await remote()));
  else await runMigrations(localRunner(await local()));
  if (opts?.seed) {
    const { seedDatabase: seedDatabase2 } = await Promise.resolve().then(() => (init_seed_sqlite(), seed_sqlite_exports));
    return seedDatabase2({ demo: opts.demo, demoPassword: opts.demoPassword });
  }
  return {};
}
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let inS = false;
  let inD = false;
  let depth = 0;
  const lines = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    cur += ch;
    if (!inS && !inD) {
      const tail = cur.slice(-6).toUpperCase();
      if (/\bBEGIN$/.test(tail) && /CREATE\s+TRIGGER/i.test(cur)) depth++;
      if (/\bEND$/.test(tail) && depth > 0 && !/[A-Z_]/i.test(lines[i + 1] ?? " ")) depth--;
      if (ch === ";" && depth === 0) {
        const s = cur.trim();
        if (s && s !== ";") out.push(s);
        cur = "";
      }
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
var import_crypto3, import_node_async_hooks, DB_NOT_CONFIGURED_MESSAGE, DbNotConfiguredError, txContext, localDb, localReady, remoteReady, localTxTail;
var init_sqlite = __esm({
  "src/lib/db/sqlite.ts"() {
    "use strict";
    import_crypto3 = require("crypto");
    import_node_async_hooks = require("node:async_hooks");
    init_migrations();
    init_schema_generated();
    DB_NOT_CONFIGURED_MESSAGE = "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0647\u064A\u0651\u0623\u0629 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0627\u0633\u062A\u0636\u0627\u0641\u0629. \u0627\u0636\u0628\u0637 TURSO_DATABASE_URL \u0648 TURSO_AUTH_TOKEN \u0641\u064A \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0646\u0634\u0631.";
    DbNotConfiguredError = class extends Error {
      constructor() {
        super(DB_NOT_CONFIGURED_MESSAGE);
        this.name = "DbNotConfiguredError";
      }
    };
    txContext = new import_node_async_hooks.AsyncLocalStorage();
    localDb = null;
    localReady = null;
    remoteReady = null;
    localTxTail = Promise.resolve();
  }
});

// scripts/init-db.ts
init_sqlite();
async function main() {
  const demo = process.argv.includes("--demo");
  await initDatabase({ seed: true, demo, demoPassword: process.env.DEMO_PASSWORD });
  await checkpointLocal();
  await closeDb();
  console.log("\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062C\u0627\u0647\u0632\u0629.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
