# النشر على Vercel — منصة إتقان

Vercel لا يمنح قرصاً دائماً، لذلك تحتاج المنصة خدمتين خارجيتين:

| ما تحتاجه | لماذا |
|---|---|
| قاعدة بيانات **libSQL / Turso** | مكان دائم لبيانات المدارس والتقييمات والتقارير |
| متجر **Vercel Blob** | مكان دائم وخاص لملفات الأدلة المرفوعة |

الكود يختار المحرّك تلقائياً: عند ضبط `TURSO_DATABASE_URL` يعمل على Turso، وإلا على ملف SQLite محلي.
وعند وجود `BLOB_READ_WRITE_TOKEN` تُخزَّن الأدلة في Blob بوصول **خاص** (private) ولا تُفتح إلا عبر المنصة بعد فحص الصلاحية.

## الخطوات

### 1) قاعدة البيانات (Turso)
من لوحة Vercel: **Storage ← Marketplace ← Turso**، فتُضاف المتغيرات للمشروع تلقائياً. أو من الطرفية:
```bash
turso db create itqan
turso db show itqan --url      # libsql://itqan-<org>.turso.io
turso db tokens create itqan
```

### 2) متجر الملفات (Blob)
**Storage ← Create ← Blob** ثم اربطه بالمشروع؛ يُضاف `BLOB_READ_WRITE_TOKEN` تلقائياً.

### 3) ربط المستودع
**Add New ← Project ← Import** واختر `khalilo-cs/Refad_website` والفرع `khalilo-cs`.
إعدادات البناء تُقرأ من `vercel.json`.

### 4) متغيرات البيئة (Settings ← Environment Variables)

| المتغيّر | القيمة |
|---|---|
| `JWT_SECRET` | ناتج `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | ناتج `openssl rand -hex 32` (قيمة مختلفة) |
| `APP_URL` | `https://<project>.vercel.app` أو نطاقك |
| `TURSO_DATABASE_URL` | `libsql://itqan-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | رمز Turso |
| `BLOB_READ_WRITE_TOKEN` | يُضاف تلقائياً |

لا تُكتب أي أسرار في المستودع.

### 5) النشر والتهيئة
اضغط **Deploy**. أول طلب على `/login` أو `/setup` يُنشئ المخطط ويبذر المعايير السبعة و109 مؤشرات والأدوار تلقائياً،
ثم افتح `/setup` لإنشاء حساب المسؤول الأول. لا توجد حسابات أو كلمات مرور افتراضية.

## إنشاء حساب المسؤول من المتغيرات (بديل عن /setup)
أضف مؤقتاً ثم أعد النشر وافتح `/login`:

| المتغيّر | القيمة |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | بريد المسؤول |
| `BOOTSTRAP_ADMIN_PASSWORD` | 10 خانات فأكثر تحتوي حرفاً ورقماً (تُضبط هنا فقط، ولا تُكتب في المستودع) |
| `BOOTSTRAP_ADMIN_NAME` | الاسم الظاهر (اختياري) |
| `BOOTSTRAP_ADMIN_FORCE` | `1` فقط لإعادة تعيين كلمة مرور حساب قائم |

بعد نجاح الدخول احذف هذه المتغيرات وأعد النشر. العملية تُسجَّل في سجل التدقيق.

## ما الذي يختلف على Vercel
| الوظيفة | الحالة |
|---|---|
| كل وظائف المنصة (مدارس، زيارات، تقييم، تقارير، تواصل) | تعمل على Turso |
| رفع الأدلة وتنزيلها | Vercel Blob خاص |
| تقارير PDF العربية | تُولَّد من الخادم (الخطوط مضمّنة في الدالة) |
| النسخ الاحتياطي من لوحة الإدارة | ملف `.sql` بدل ملف SQLite |

استعادة نسخة SQL: `turso db shell itqan < itqan-backup.sql`.

## النطاق الخاص
أضفه من **Settings ← Domains**، وعند مسجّل النطاق: سجل `A` للجذر `@` إلى `216.198.79.1`، و`CNAME` لـ `www` إلى `cname.vercel-dns.com`.
ثم حدّث `APP_URL` وأعد النشر.

## التحقق بعد النشر
1. `/api/health` ← `{"status":"ok","database":"connected","engine":"libsql"}`.
2. `/setup` أو الدخول بحساب المسؤول.
3. إضافة مدرسة وزيارة وحفظ درجة مؤشر.
4. رفع دليل PDF ثم تنزيله.
5. توليد تقرير PDF والتحقق منه عبر `/verify`.

> الخطة المجانية (Hobby) في Vercel مخصّصة للاستخدام غير التجاري؛ الاستخدام المؤسسي يستلزم خطة Pro.
