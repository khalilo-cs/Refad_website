/**
 * بذر البيانات الأولية لقاعدة بيانات SQLite.
 * يُستدعى من src/lib/db/sqlite.ts عند تشغيل المنصة لأول مرة.
 * جميع النصوص المستخرجة من استمارة التقييم الذاتي (المرفق)، والبيانات التجريبية
 مُعلمة بوضوح بأنها للعرض التوضيحي فقط.
 */

import type Database from "better-sqlite3";
import { uuid, nowISO, toJson } from "./sqlite";
import {
  SEED_CRITERIA,
  RATING_SCALE,
  DEFAULT_SYSTEM_SETTINGS,
} from "../../../prisma/seed/data";
import bcrypt from "bcryptjs";

const DEMO_PASSWORD = "R!f@d_2026_DemoAccess";

type Row = { sql: string; params: unknown[] };

export async function seedDatabase(db: Database.Database): Promise<void> {
  const insert = (rows: Row[]) => {
    const tx = db.transaction((rs: Row[]) => {
      for (const r of rs) db.prepare(r.sql).run(...r.params);
    });
    tx(rows);
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
  insert(rows);
  rows.length = 0;

  // ----------------------------------------------------------
  // 2. الإعدادات الافتراضية
  // ----------------------------------------------------------
  const settings = [
    { key: "system.name", value: { ar: "منصة رِفاد للمتابعة والجودة المدرسية" } },
    {
      key: "system.institution",
      value: { ar: "منصة رِفاد — مديرية الجراحي، محافظة الحديدة" },
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

  insert(rows);
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

  const schoolId = uuid();
  rows.push({
    sql: `INSERT INTO schools (id, code, name, governorate_id, directorate_id, type, stage, contact_phone, data_source, status, notes, last_updated_at, created_at)
          VALUES (?, ?, ?, (SELECT id FROM governorates WHERE code = 'HUDAIDAH'),
                  (SELECT id FROM directorates WHERE code = 'JARAHI'),
                  ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING`,
    params: [
      schoolId,
      "RIFAD-DEMO-001",
      "مدرسة رِفاد التجريبية (بيانات وهمية للعرض فقط — ليست مدرسة حقيقية)",
      "حكومية",
      "أساسي",
      "000-000000",
      "MANUAL",
      "ACTIVE",
      "سجل توضيحي للعرض الأول فقط. يُحذف أو يُستبدل بسجلات المدارس الفعلية عبر استيراد Excel/CSV أو الإدخال اليدوي.",
      nowISO(),
      nowISO(),
    ],
  });

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
    const roleRow = db
      .prepare("SELECT id FROM roles WHERE key = ?")
      .get(u.key) as { id: string } | undefined;
    if (!roleRow) continue;
    const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 12);
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
  insert(rows);
  rows.length = 0;

  // ----------------------------------------------------------
  // 7. سجل توضيحي واحد للزيارة والتقييم (لعرض واجهة النظام فقط)
  // ----------------------------------------------------------
  const inspectorId = createdUserIds["INSPECTOR"];
  if (inspectorId && schoolId) {
    const visitId = uuid();
    db.prepare(
      `INSERT INTO visits (id, school_id, inspector_id, type, purpose, status, scheduled_at, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      visitId,
      schoolId,
      inspectorId,
      "PERIODIC",
      "زيارة تعريفية للمنصة",
      "COMPLETED",
      nowISO(),
      nowISO(),
      nowISO(),
      nowISO()
    );

    const sampleIndicators = ["1-1-1", "2-1-1", "3-1", "4-1-1", "5-1-4"];
    for (const code of sampleIndicators) {
      const ind = db
        .prepare("SELECT id, code FROM indicators WHERE code = ?")
        .get(code) as { id: string; code: string } | undefined;
      if (!ind) continue;
      const evalId = uuid();
      db.prepare(
        `INSERT INTO evaluations (id, visit_id, indicator_id, status, score, notes, rated_by_id, rated_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        evalId,
        visitId,
        ind.id,
        "MET",
        3,
        "مثال توضيحي فقط — ليس تقييمًا فعليًا",
        inspectorId,
        nowISO(),
        nowISO()
      );
    }
  }

  console.log("تم بذر البيانات الأولية لقاعدة بيانات SQLite.");
  console.log("حساب الدخول التجريبي المشترك لجميع المستخدمين التجريبيين:");
  console.log(`  البريد: <أي بريد أعلاه>   كلمة المرور: ${DEMO_PASSWORD}`);
  console.log("تنبيه: هذه بيانات تجريبية للعرض فقط ولا تمثل مدارس أو أفرادًا حقيقيين.");
}

function subOrder(code: string): number {
  const m = code.match(/^(\d+)-(\d+)$/);
  return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
}

function indCodeOrder(code: string): number {
  const parts = code.split("-").map(Number);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}
