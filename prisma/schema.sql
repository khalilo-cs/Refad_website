-- ============================================================================
-- مخطط قاعدة بيانات منصة رِفاد للمتابعة والجودة المدرسية
-- متوافق مع SQLite (التشغيل الفوري) وقابل للنقل إلى PostgreSQL للنشر الإنتاجي.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------
-- الجداول الأساسية: المواقع والهيكلة التنظيمية
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
-- الأدوار والمستخدمون
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
-- المدارس
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
-- المعايير والمعايير الفرعية والمؤشرات (من استمارة التقييم الذاتي)
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
-- مقياس التقدير القابل للتعديل من لوحة الإدارة
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
-- الزيارات الميدانية
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
-- التقييمات الميدانية للمؤشرات
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
-- سجل تعديل التقييم (تدقيق لا يمكن مسحه من المستخدمين العاديين)
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
-- الأدلة والشواهد والملفات المرفقة
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
-- التقارير ومسارات الاعتماد
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
-- خطط التحسين والإجراءات التصحيحية
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
-- التواصل الإلكتروني (المحادثات والرسائل)
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
-- الإعلانات
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
-- أولياء الأمور والمتعلمون (وحدة إضافية منفصلة عن التقييم الرسمي)
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
  relationship TEXT NOT NULL DEFAULT 'أب/أم',
  UNIQUE (parent_id, student_id)
);

-- -------------------------------------------------------
-- الإشعارات وسجل التدقيق والإعدادات وسجلات التصدير
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
-- الحضور والنتائج الدراسية (وحدة إضافية — منفصلة عن استمارة التقييم)
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
-- محفز تحديث updated_at تلقائيًا
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
