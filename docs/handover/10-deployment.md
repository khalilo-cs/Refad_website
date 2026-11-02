# الفصل العاشر: التشغيل والنشر

يمكن تشغيل المنصة بثلاث طرق، وتختار المنصة طبقة البيانات والتخزين **تلقائياً** من متغيرات البيئة:

| الطريقة | قاعدة البيانات | الملفات | المناسبة لـ |
|---|---|---|---|
| **Vercel** (الحالية) | Turso | Vercel Blob | استضافة سحابية بلا إدارة خوادم |
| **خادم + Docker** | SQLite على قرص الخادم | مجلد خاص على القرص | خادم خاص بالوزارة أو المديرية |
| **خادم دون Docker** | SQLite | مجلد خاص | خادم Linux عادي (systemd + Nginx) |

## متغيرات البيئة

| المتغير | إلزامي؟ | الوصف |
|---|---|---|
| `JWT_SECRET` | **نعم** | سرّ توقيع الجلسات: 32 حرفاً عشوائياً على الأقل، ويُولَّد بـ `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | يُنصح به | سرّ منفصل لرموز التجديد |
| `JWT_ACCESS_TTL_MINUTES` / `JWT_REFRESH_TTL_DAYS` | لا | مدة الجلسة. الافتراضي 60 دقيقة و7 أيام |
| `APP_URL` | يُنصح به | رابط المنصة العام (للروابط والتحقق) |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | على Vercel | قاعدة Turso. تُضاف تلقائياً عند ربط Turso من Vercel |
| `BLOB_READ_WRITE_TOKEN` | على Vercel | تخزين Blob. يُضاف تلقائياً عند ربط Blob |
| `SQLITE_DIR` / `DATABASE_FILE` | على الخادم | مكان ملف قاعدة البيانات واسمه |
| `UPLOAD_DIR` | على الخادم | مجلد الأدلة المرفوعة (خارج `public`) |
| `MAX_UPLOAD_MB` | لا | الحد الأقصى لحجم الملف. الافتراضي 15 |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_NAME` | لأول تشغيل | إنشاء حساب مدير النظام الأول. **احذفها بعد أول دخول** |

> **لا تضع أي سرّ داخل الكود أو المستودع.** ملف `.env` مستثنى من Git.

## أولاً: النشر على Vercel (خطوة بخطوة)

### 1. ربط المشروع

1. في Vercel: **Add New ← Project**، ثم اختر المستودع `khalilo-cs/Refad_website`، ثم **Import**.
2. **Environment Variables**: أضف `JWT_SECRET`، و`JWT_REFRESH_SECRET`، و`BOOTSTRAP_ADMIN_EMAIL`، و`BOOTSTRAP_ADMIN_PASSWORD`.
3. اضغط **Deploy**.

### 2. ربط الخدمات

1. **Storage ← Create ← Turso** (من Marketplace)، ثم اربطها بالمشروع.
2. **Storage ← Create ← Blob**، ثم اربطه بالمشروع.
3. **Deployments ← آخر نشر ← ⋯ ← Redeploy**.

### 3. ضبط فرع الإنتاج

**Settings ← Environments ← Production ← Branch Tracking** ← اكتب الفرع `khalilo-cs` ثم احفظ. بعدها يُنشر كل تحديث على هذا الفرع تلقائياً.

إن ظهر نشر جديد بعلامة **Preview** بدل **Production**: افتح **⋯**، ثم **Promote to Production**.

### 4. أول دخول

1. افتح الموقع وادخل ببريد المدير وكلمة مروره.
2. احذف `BOOTSTRAP_ADMIN_EMAIL` و`BOOTSTRAP_ADMIN_PASSWORD`، ثم **Redeploy**.
3. **الفحص:** افتح `/api/health`، ويجب أن يظهر فيه `"status":"ok"` و`"engine":"libsql"`.

## ثانياً: التشغيل على خادم (Docker)

```bash
git clone https://github.com/khalilo-cs/Refad_website.git
cd Refad_website
cp .env.production.example .env      # ثم ضع الأسرار
docker compose up -d --build
```

بعدها افتح المنصة، ثم أنشئ أول مدير من صفحة `/setup`. التفاصيل الكاملة موجودة في `DEPLOY.md`:

- Nginx.
- HTTPS عبر Let's Encrypt.
- systemd.
- النسخ الاحتياطي المجدول.
- حل المشكلات.

## ثالثاً: التشغيل المحلي للتطوير

```bash
npm install
cp .env.example .env              # ضع JWT_SECRET
npm run db:init                   # المعايير والمؤشرات فقط
DEMO_PASSWORD='كلمة-قوية' npm run db:demo   # (اختياري) بيانات وحسابات تجريبية @rifad.demo
npm run dev                       # http://localhost:3000
```

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` | البناء للإنتاج |
| `npm start` | تشغيل نسخة الإنتاج |
| `npm test` | الاختبارات على SQLite |
| `TEST_LIBSQL=1 npm test` | الاختبارات نفسها على محرّك Turso/libSQL |
| `npm run lint` | فحص جودة الكود |

## رابعاً: إدخال البيانات الحقيقية بعد النشر

1. **المدارس ← استيراد**: ارفع كشف المدارس، مع ترك «تحديث المدارس الموجودة» مفعّلاً. راجع المعاينة، ثم اضغط **تأكيد**.
2. **الإدارة ← مركز التحكم**: أكمل ما ينقص، مثل المواقع والهواتف وأسماء المدراء.
3. **المستخدمون ← حسابات مدراء المدارس**: أنشئ الحسابات على دفعات، وسلّم بيانات الدخول بالواتساب أو الطباعة.
4. **حسابات الإشراف**: أنشئ حسابات المفتشين وأسند المدارس لهم.
5. **إعلان البدء**: أعلن للمدراء بدء الاختبار التفاعلي من **التواصل ← الإعلانات**.
6. **المتابعة اليومية**: تابع من **متابعة الجودة والتحسين**.
