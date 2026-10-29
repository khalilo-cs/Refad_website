/**
 * بذر البيانات الأولية لقاعدة البيانات.
 * يُستدعى من src/lib/db/sqlite.ts عند تشغيل المنصة لأول مرة.
 * جميع النصوص المستخرجة من استمارة التقييم الذاتي (المرفق)، والبيانات التجريبية
 مُعلمة بوضوح بأنها للعرض التوضيحي فقط.
 */

import { uuid, nowISO, toJson, query, queryOne, exec, batch } from "./sqlite";
import {
  SEED_CRITERIA,
  RATING_SCALE,
  DEFAULT_SYSTEM_SETTINGS,
} from "../../../prisma/seed/data";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";


type Row = { sql: string; params: unknown[] };

export type SeedOptions = {
  /** يضيف مدارس ومستخدمين وزيارات توضيحية. يُستخدم للعرض الأول فقط. */
  demo?: boolean;
  /** كلمة مرور الحسابات التوضيحية؛ إن لم تُحدَّد تُولَّد عشوائياً وتُطبع مرة واحدة. */
  demoPassword?: string;
};

export async function seedDatabase(opts: SeedOptions = {}): Promise<{ demoPassword?: string }> {
  const DEMO_PASSWORD =
    opts.demoPassword ??
    // 16 حرفاً عشوائياً: أحرف كبيرة وصغيرة وأرقام ورمز
    randomBytes(12).toString("base64url") + "!9a";
  const insert = async (rs: Row[]) => {
    await batch(rs.map((r) => ({ sql: r.sql, params: [...r.params] })));
  };

  const rows: Row[] = [];

  // ----------------------------------------------------------
  // 1. الأدوار النظامية (تُدخل أولاً لأن المستخدمين يعتمدون عليها)
  // ----------------------------------------------------------
  const roles = [
    {
      key: "SUPER_ADMIN",
      name: "مدير المنصة",
      description:
        "إدارة الحسابات والأدوار والمديريات والمدارس والمعايير والأوزان والإعدادات وسجلات التدقيق",
      scope: "system",
      permissions: { all: true },
    },
    {
      key: "EDUCATION_DIRECTOR",
      name: "مدير الإدارة التعليمية / المديرية",
      description:
        "الاطلاع على المدارس التابعة لنطاقه، وتوزيع الزيارات، ومراجعة التقارير، والاعتماد، ومتابعة خطط التحسين",
      scope: "directorate",
      permissions: {
        viewSchools: true,
        manageVisits: true,
        reviewReports: true,
        approveReports: true,
        viewReports: true,
        manageImprovementPlans: true,
        viewAnalytics: true,
      },
    },
    {
      key: "INSPECTOR",
      name: "المفتش / الموجه التربوي",
      description:
        "مشاهدة المدارس الموكلة إليه، وإنشاء الزيارات، والتقييم الميداني، وإرفاق الأدلة، ورفع التقارير",
      scope: "schools_assigned",
      permissions: {
        createVisits: true,
        evaluateIndicators: true,
        uploadEvidence: true,
        submitReports: true,
        createCorrectiveActions: true,
      },
    },
    {
      key: "SCHOOL_PRINCIPAL",
      name: "مدير المدرسة",
      description:
        "الاطلاع على بيانات المدرسة، وإدارة الملفات الأساسية، وإضافة المستندات والشواهد، والرد على الملاحظات، وإعداد خطط التحسين",
      scope: "own_school",
      permissions: {
        viewOwnSchool: true,
        manageSchoolProfile: true,
        uploadEvidence: true,
        respondToNotes: true,
        createImprovementPlans: true,
        viewReports: true,
      },
    },
    {
      key: "QUALITY_COORDINATOR",
      name: "منسق الجودة",
      description:
        "إدارة أدلة الجودة ومراجعتها ومتابعة المؤشرات وخطط التطوير ونسب اكتمال الشواهد",
      scope: "own_school",
      permissions: {
        manageEvidenceLibrary: true,
        reviewEvidence: true,
        trackIndicators: true,
        viewAnalytics: true,
      },
    },
    {
      key: "TEACHER",
      name: "المعلم",
      description:
        "الاطلاع على بياناته وصلاحياته التعليمية، ورفع ملفات الإنجاز، واستلام الملاحظات والتغذية الراجعة، ومتابعة التطوير المهني",
      scope: "personal",
      permissions: {
        viewOwnData: true,
        uploadAchievementFiles: true,
        viewFeedback: true,
      },
    },
    {
      key: "PARENT",
      name: "ولي الأمر",
      description:
        "الاطلاع الآمن على بيانات أبنائه المصرح بها فقط، والتواصل مع المدرسة",
      scope: "personal",
      permissions: {
        viewChildren: true,
        communicateWithSchool: true,
      },
    },
    {
      key: "GUEST",
      name: "زائر عام",
      description: "الوصول إلى المعلومات المنشورة للعامة فقط",
      scope: "public",
      permissions: { viewPublicInfo: true },
    },
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
        nowISO(),
      ],
    });
  }
  await insert(rows);
  rows.length = 0;

  // ----------------------------------------------------------
  // 2. الإعدادات الافتراضية
  // ----------------------------------------------------------
  const settings = [
    { key: "system.name", value: { ar: "منصة إتقان للاعتماد المدرسي وضمان جودة التعليم" } },
    {
      key: "system.institution",
      value: { ar: "منصة إتقان — مديرية الجراحي، محافظة الحديدة" },
    },
    { key: "ratings.scale", value: RATING_SCALE },
    { key: "file.maxSizeMB", value: DEFAULT_SYSTEM_SETTINGS.maxFileSizeMB },
    {
      key: "file.allowedExtensions",
      value: DEFAULT_SYSTEM_SETTINGS.allowedFileExtensions,
    },
    { key: "visit.types", value: DEFAULT_SYSTEM_SETTINGS.visitTypes },
    { key: "seeded.demo", value: true },
  ];
  for (const s of settings) {
    rows.push({
      sql: `INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      params: [s.key, toJson(s.value), nowISO()],
    });
  }

  // ----------------------------------------------------------
  // 3. مقياس التقدير الافتراضي
  // ----------------------------------------------------------
  for (const r of RATING_SCALE) {
    rows.push({
      sql: `INSERT INTO rating_scale (id, key, label_ar, label_en, score, order_index, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET
            label_ar=excluded.label_ar, score=excluded.score, order_index=excluded.order_index`,
      params: [uuid(), r.value, r.label, r.label, r.score, r.order],
    });
  }

  // ----------------------------------------------------------
  // 4. المعايير والمعايير الفرعية والمؤشرات (من الاستمارة)
  // ----------------------------------------------------------
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
        nowISO(),
      ],
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
          nowISO(),
        ],
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
            toJson(["فحص وثائق", "ملاحظة", "مقابلة"]),
            indCodeOrder(ind.code),
            criterionId,
            subId,
            nowISO(),
          ],
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
            toJson(["فحص وثائق", "ملاحظة", "مقابلة"]),
            indCodeOrder(ind.code),
            criterionId,
            null,
            nowISO(),
          ],
        });
      }
    }
  }

  await insert(rows);
  rows.length = 0;

  // ----------------------------------------------------------
  // 5. موقع تجريبي واضح التسمية (محافظة الحديدة، مديرية الجراحي)
  // ----------------------------------------------------------
  const governorateId = uuid();
  rows.push({
    sql: `INSERT INTO governorates (id, name, code, created_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING`,
    params: [
      governorateId,
      "الحديدة",
      "HUDAIDAH",
      nowISO(),
    ],
  });

  const directorateId = uuid();
  rows.push({
    sql: `INSERT INTO directorates (id, name, code, governorate_id, created_at)
          VALUES (?, ?, ?, (SELECT id FROM governorates WHERE code = 'HUDAIDAH'), ?)
          ON CONFLICT(code) DO NOTHING`,
    params: [directorateId, "الجراحي", "JARAHI", nowISO()],
  });

  if (!opts.demo) {
    await insert(rows);
    rows.length = 0;
    console.log("تم بذر المعايير والمؤشرات والأدوار والإعدادات. أنشئ حساب المسؤول الأول من صفحة /setup.");
    return {};
  }

  // ثلاث مدارس تجريبية بمواضع توضيحية للخريطة فقط (ليست مواقع حقيقية).
  const DEMO_NOTE =
    "سجل توضيحي للعرض الأول فقط. يُحذف أو يُستبدل بسجلات المدارس الفعلية عبر استيراد Excel/CSV أو الإدخال اليدوي.";
  const demoSchools = [
    { id: uuid(), code: "RIFAD-DEMO-001", name: "مدرسة إتقان التجريبية (أ) — بيانات وهمية للعرض فقط", stage: "أساسي", lat: 14.945, lng: 43.455, type: "حكومية" },
    { id: uuid(), code: "RIFAD-DEMO-002", name: "مدرسة إتقان التجريبية (ب) — بيانات وهمية للعرض فقط", stage: "ثانوي", lat: 14.9, lng: 43.5, type: "حكومية" },
    { id: uuid(), code: "RIFAD-DEMO-003", name: "مدرسة إتقان التجريبية (ج) — بيانات وهمية للعرض فقط", stage: "أساسي", lat: 14.985, lng: 43.52, type: "حكومية" },
  ];
  for (const sc of demoSchools) {
    rows.push({
      sql: `INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage, latitude, longitude, contact_phone, data_source, status, notes, last_updated_at, created_at)
            VALUES (?, ?, ?, (SELECT id FROM governorates WHERE code = 'HUDAIDAH'),
                    (SELECT id FROM directorates WHERE code = 'JARAHI'),
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING`,
      params: [sc.id, sc.code, sc.name, sc.type, sc.stage, sc.lat, sc.lng, "000-000000", "MANUAL", "ACTIVE",
        DEMO_NOTE + " الإحداثيات توضيحية.", nowISO(), nowISO()],
    });
  }
  const schoolId = demoSchools[0].id;

  // ----------------------------------------------------------
  // 6. مستخدمون تجريبيون لكل دور (كلمة مرور واحدة للعرض التوضيحي)
  // ----------------------------------------------------------
  const demoUsers = [
    {
      key: "SUPER_ADMIN",
      name: "مدير النظام التجريبي",
      email: "admin@rifad.demo",
      directorateId: null,
      schoolId: null,
    },
    {
      key: "EDUCATION_DIRECTOR",
      name: "مدير المديرية التجريبي",
      email: "director@rifad.demo",
      directorateId,
      schoolId: null,
    },
    {
      key: "INSPECTOR",
      name: "مفتش تربوي تجريبي",
      email: "inspector@rifad.demo",
      directorateId,
      schoolId: null,
    },
    {
      key: "SCHOOL_PRINCIPAL",
      name: "مدير المدرسة التجريبي",
      email: "principal@rifad.demo",
      directorateId: null,
      schoolId,
    },
    {
      key: "QUALITY_COORDINATOR",
      name: "منسق جودة تجريبي",
      email: "quality@rifad.demo",
      directorateId: null,
      schoolId,
    },
    {
      key: "TEACHER",
      name: "معلم تجريبي",
      email: "teacher@rifad.demo",
      directorateId: null,
      schoolId,
    },
    {
      key: "PARENT",
      name: "ولي أمر تجريبي",
      email: "parent@rifad.demo",
      directorateId: null,
      schoolId: null,
    },
  ];

  const createdUserIds: Record<string, string> = {};
  for (const u of demoUsers) {
    const roleRow = await queryOne("SELECT id FROM roles WHERE key = ?", [u.key]) as { id: string } | undefined;
    if (!roleRow) continue;
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
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
        nowISO(),
      ],
    });
  }
  await insert(rows);
  rows.length = 0;

  // ----------------------------------------------------------
  // 7. بيانات توضيحية للزيارات والتقييم وخطط التحسين (للعرض الأول فقط)
  // ----------------------------------------------------------
  const inspectorId = createdUserIds["INSPECTOR"];
  const directorId = createdUserIds["EDUCATION_DIRECTOR"];
  const principalId = createdUserIds["SCHOOL_PRINCIPAL"];
  const dayMs = 86400000;
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString();
  const DEMO_FLAG = "مثال توضيحي فقط — ليس تقييماً فعلياً";

  if (inspectorId) {
    // إسناد المدارس للمفتش وإنشاء ملف تعريفي أولي لكل مدرسة (غير موثّق)
    for (const sc of demoSchools) {
      await exec("INSERT OR IGNORE INTO school_assignments (id, user_id, school_id, assigned_by_id) VALUES (?,?,?,?)", [uuid(), inspectorId, sc.id, directorId ?? null]);
      await exec(`INSERT OR IGNORE INTO school_profiles (school_id, students_count, teachers_count, admin_staff_count, service_staff_count, classes_count,
           has_science_lab, has_computer_lab, has_library, has_canteen, has_playground, info_source, verified)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`, [sc.id, null, null, null, null, null, null, null, null, null, null, "بيانات توضيحية — لم تُدخل بعد"]);
    }

    const indicators = await query("SELECT id, code FROM indicators ORDER BY order_index") as { id: string; code: string }[];
    // درجات حتمية (بلا عشوائية) حتى تتكرر نتائج العرض نفسها في كل تثبيت
    const scoreFor = (schoolIdx: number, i: number) => {
      const base = [3, 2, 3, 1, 3, 2, 3, 0, 2, 3][(i * 7 + schoolIdx * 3) % 10];
      return schoolIdx === 1 ? Math.max(0, base - 1) : base;
    };
    const makeVisit = async (schoolIdx: number, status: string, coverage: number, daysAgo: number) => {
      const visitId = uuid();
      const when = iso(-daysAgo);
      await exec(`INSERT INTO visits (id, school_id, inspector_id, type, purpose, status, scheduled_at, started_at, ended_at, submitted_at, submitted_by_id, completion, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [visitId, demoSchools[schoolIdx].id, inspectorId, "PERIODIC", "زيارة تعريفية للمنصة (توضيحية)", status,
        when, when, ["SUBMITTED", "COMPLETED"].includes(status) ? when : null,
        ["SUBMITTED", "COMPLETED"].includes(status) ? when : null,
        ["SUBMITTED", "COMPLETED"].includes(status) ? inspectorId : null,
        Math.round(coverage * 100), when, when]);
      const n = Math.round(indicators.length * coverage);
      await batch(indicators.slice(0, n).map((ind, i) => ({
        sql: `INSERT INTO evaluations (id, visit_id, indicator_id, status, score, notes, verification_methods, rated_by_id, rated_at, created_by_id, created_at, updated_at, version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`, params: [uuid(), visitId, ind.id, "EVALUATED", scoreFor(schoolIdx, i), i % 9 === 0 ? DEMO_FLAG : null,
          JSON.stringify(["فحص وثائق"]), inspectorId, when, inspectorId, when, when] })));
      return visitId;
    };

    const v1 = await makeVisit(0, "COMPLETED", 1, 40);
    await makeVisit(0, "COMPLETED", 1, 130); // زيارة أقدم لإظهار اتجاه التحسن
    await makeVisit(1, "SUBMITTED", 0.7, 6);
    await makeVisit(2, "IN_PROGRESS", 0.2, 1);
    // زيارة قادمة وأخرى متأخرة (للتنبيهات)
    for (const [idx, off, st] of [[0, 3, "SCHEDULED"], [2, -9, "SCHEDULED"]] as [number, number, string][]) {
      await exec(`INSERT INTO visits (id, school_id, inspector_id, type, purpose, status, scheduled_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`, [uuid(), demoSchools[idx].id, inspectorId, "FOLLOW_UP", "زيارة متابعة (توضيحية)", st, iso(off), nowISO(), nowISO()]);
    }

    // خطة تحسين توضيحية بإجراءين: أحدهما متأخر
    if (principalId) {
      const planId = uuid();
      await exec(`INSERT INTO improvement_plans (id, school_id, title, description, status, created_by_id) VALUES (?,?,?,?,?,?)`, [planId, demoSchools[0].id, "خطة تحسين توضيحية", DEMO_FLAG, "ACTIVE", principalId]);
      const weakInd = await query(`SELECT i.id, e.id AS eid FROM evaluations e JOIN indicators i ON i.id = e.indicator_id
         WHERE e.visit_id = ? AND e.score <= 1 ORDER BY i.order_index LIMIT 2`, [v1]) as { id: string; eid: string }[];
      await batch(weakInd.map((w, i) => ({
        sql: `INSERT INTO corrective_actions (id, plan_id, evaluation_id, indicator_id, problem_description, priority, proposed_action,
             responsible_id, due_date, success_indicator, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, params: [uuid(), planId, w.eid, w.id, "قصور مكتشف في الزيارة التوضيحية", i === 0 ? "HIGH" : "MEDIUM",
          "إجراء تصحيحي توضيحي", principalId, iso(i === 0 ? -5 : 14).slice(0, 10), "رفع دليل جديد يثبت المعالجة", "IN_PROGRESS"] })));
    }
  }

  // طالب وولي أمر توضيحيان لربط حساب ولي الأمر (بيانات وهمية)
  const parentUserId = createdUserIds["PARENT"];
  if (parentUserId) {
    const studentId = uuid();
    const parentId = uuid();
    await exec("INSERT INTO students (id, school_id, name, grade, section) VALUES (?,?,?,?,?)", [studentId, schoolId, "طالب توضيحي", "الصف الخامس", "أ"]);
    await exec("INSERT INTO parents (id, name, user_id) VALUES (?,?,?)", [parentId, "ولي أمر تجريبي", parentUserId]);
    await exec("INSERT INTO parent_student (id, parent_id, student_id) VALUES (?,?,?)", [uuid(), parentId, studentId]);
  }

  console.log("تم بذر البيانات الأولية والبيانات التوضيحية لقاعدة بيانات SQLite.");
  console.log("الحسابات التوضيحية (كلمة المرور موحَّدة وتُعرض هنا مرة واحدة فقط — احفظها):");
  for (const u of demoUsers) console.log(`  ${u.email}`);
  console.log(`  كلمة المرور: ${DEMO_PASSWORD}`);
  console.log("تنبيه: هذه بيانات تجريبية للعرض فقط ولا تمثل مدارس أو أفرادًا حقيقيين. احذفها قبل الاستخدام الفعلي.");
  return { demoPassword: DEMO_PASSWORD };
}

function subOrder(code: string): number {
  const m = code.match(/^(\d+)-(\d+)$/);
  return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
}

/**
 * ترتيب المؤشر: رمز المؤشر في الاستمارة بصيغة «رقم المؤشر-المعيار الفرعي-المعيار» (مثال 18-2-1)،
 * أو «رقم المؤشر-المعيار» للمعايير بلا معايير فرعية (مثال 5-3). الترتيب: المعيار ثم الفرعي ثم رقم المؤشر.
 */
function indCodeOrder(code: string): number {
  const p = code.split("-").map(Number);
  if (p.length === 3) return (p[2] || 0) * 10000 + (p[1] || 0) * 100 + (p[0] || 0);
  return (p[1] || 0) * 10000 + (p[0] || 0);
}
