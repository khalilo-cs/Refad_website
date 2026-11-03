# الفصل التاسع: مرجع الواجهات البرمجية (API)

## قواعد عامة

- **الصيغة:** كل المسارات تحت `/api/`، وتتبادل JSON، إلا رفع الملفات (multipart) والتنزيلات.
- **الجلسة:** تُرسل عبر الكوكيز تلقائياً من المتصفح.
- **مصدر الطلب (CSRF):** طلبات التعديل (POST، PUT، PATCH، DELETE) يجب أن تأتي من نفس الموقع.
- **حالات الرد:**

| الحالة | المعنى |
|---|---|
| `401` | غير مصادق |
| `403` | غير مصرح، أو يلزم تغيير كلمة المرور (`mustChangePassword: true`) |
| `409` | تعارض، مثل استمارة مُرسلة أو بيانات مكررة |
| `422` | مدخل غير مقبول منطقياً |
| `429` | محاولات كثيرة |
| `503` | قاعدة البيانات غير مهيّأة |

- **رسائل الأخطاء:** تأتي بالعربية في الحقل `message`.

## المسارات

### المصادقة والحساب

| المسار | الطرق | الوظيفة |
|---|---|---|
| `/auth/login` | POST | الدخول بالبريد أو اسم المستخدم، ورمز المصادقة الثنائية إن كانت مفعّلة |
| `/auth/logout` | POST | الخروج |
| `/auth/me` | GET | بيانات الجلسة الحالية، ومعها `mustChangePassword` |
| `/auth/refresh` | POST | تجديد الجلسة |
| `/account` | GET, PATCH, POST, DELETE | بياناتي، وتعديلها، وتغيير كلمة المرور، وإنهاء الجلسات الأخرى |
| `/account/twofa` | POST | إعداد المصادقة الثنائية وتفعيلها وتعطيلها |
| `/setup` | GET, POST | إنشاء أول مدير (مرة واحدة فقط) |

### التقييم الذاتي ودورة التحسين

| المسار | الطرق | الوظيفة |
|---|---|---|
| `/self-assessment?schoolId=&year=` | GET | الاستمارة كاملة مع الحالة والملخص، والمقارنة بالعام السابق |
| `/self-assessment` | PUT | تقييم مؤشر (`score`، `evidenceHave` إلزامي مع التقدير، `methods`، `notes`، `isWeak`) |
| `/self-assessment/items/{id}` | GET | تاريخ المؤشر |
| `/self-assessment/items/{id}` | POST | خطوة في دورة التحسين: `plan`، `start`، `improve`، `verify`، `return` |
| `/self-assessment/submit` | POST | `submit` إرسال الاستمارة، أو `reopen` إعادة فتحها |
| `/self-assessment/status` | GET | هل الاختبار التفاعلي إجباري الآن على المستخدم؟ |
| `/self-assessment/overview?year=` | GET | لوحة متابعة الإدارة |
| `/self-assessment/insights?year=` | GET | نقاط الضعف الشائعة والأدلة الأكثر غياباً |
| `/self-assessment/remind` | POST | تذكير المدارس: `quiz`، أو `plans`، أو `submit` |
| `/certificates` | GET, POST, DELETE | مسودة الشهادة والشهادات السابقة، وإصدار شهادة، وإلغاؤها |
| `/verify/{code}` | GET | **عام بلا دخول:** التحقق من تقرير أو شهادة |

### المدارس والمواقع

| المسار | الطرق | الوظيفة |
|---|---|---|
| `/schools` | GET, POST | قائمة المدارس (بحث وتصفية وصفحات)، وإضافة مدرسة |
| `/schools/{id}` | GET, PATCH, DELETE | بيانات المدرسة، وتعديلها، وأرشفتها أو حذفها |
| `/schools/{id}/overview` | GET | ملخص صفحة المدرسة |
| `/schools/{id}/profile` | PUT | ملف المدرسة والمرافق |
| `/schools/{id}/contacts` | GET, POST | جهات الاتصال |
| `/schools/{id}/contacts/{contactId}` | PATCH, DELETE | تعديل جهة اتصال وحذفها |
| `/schools/import?commit=&update=` | POST | استيراد Excel أو CSV مع معاينة، و`update=true` لتحديث الموجود |
| `/schools/import/template` | GET | قالب الاستيراد |
| `/schools/export` | GET | تصدير Excel أو CSV |
| `/schools/map` | GET | نقاط الخريطة |
| `/geo/resolve` | POST | تحويل رابط خرائط جوجل، ولو مختصراً، إلى إحداثيات |
| `/directory` | GET | دليل الاتصال |

### المستخدمون والإدارة

| المسار | الطرق | الوظيفة |
|---|---|---|
| `/users` | GET, POST | قائمة المستخدمين بالتصفية، وإنشاء مستخدم (تُعاد كلمة المرور مرة واحدة) |
| `/users/{id}` | PATCH, DELETE | تعديل مستخدم، و`resetPassword`، والقفل والتفعيل، وإنهاء الجلسات، والحذف المنطقي |
| `/users/{id}/schools` | GET, PUT | المدارس المسندة إلى المفتش، واستبدالها بقائمة جديدة (`schoolIds`). لمدير النظام فقط |
| `/users/bulk-principals` | GET, POST | المدارس بلا حساب مدير، وإنشاء حسابات المدراء دفعة واحدة (حتى 20) |
| `/admin/data-quality` | GET | مركز التحكم |
| `/admin/structure`، `/admin/structure/{id}` | GET, POST, PATCH, DELETE | المعايير والمعايير الفرعية والمؤشرات |
| `/admin/reference`، `/admin/reference/{id}` | GET, POST, PATCH, DELETE | المحافظات والمديريات والمناطق |
| `/admin/roles`، `/admin/roles/{id}` | GET, POST, PATCH, DELETE | الأدوار والصلاحيات |
| `/admin/audit` | GET | سجل التدقيق |
| `/admin/security`، `/admin/incidents` | GET, POST, PATCH | الأمن والحوادث |
| `/admin/backup` | GET | تنزيل نسخة احتياطية |
| `/settings` | GET, PATCH, POST, DELETE | إعدادات النظام ومقياس التقدير |

### الزيارات والتقييم الميداني والأدلة والتقارير

| المسار | الطرق | الوظيفة |
|---|---|---|
| `/visits`، `/visits/{id}` | GET, POST, PATCH | الزيارات وحالاتها |
| `/evaluations/visit/{visitId}` | GET, PATCH | تقييم الزيارة: الدرجات، والسجل، والإرسال، والاعتماد |
| `/evidence` | GET, POST, PATCH, DELETE | الأدلة: البحث، والرفع، والمراجعة، والحذف |
| `/evidence/{id}/file`، `/link`، `/versions` | GET, POST | تنزيل الملف، والرابط المؤقت، والإصدارات |
| `/evidence/library` | GET, POST, PATCH | مكتبة الأدلة |
| `/reports`، `/reports/{id}`، `/status`، `/export` | GET, POST, PATCH, DELETE | التقارير ومسار اعتمادها وتصديرها |
| `/improvement`، `/improvement/required` | GET, POST, PATCH, DELETE | خطط التحسين، والمؤشرات التي تلزمها إجراءات |
| `/rankings` | GET | ترتيب المدارس، ومعه تصدير CSV |
| `/dashboard/stats` | GET | أرقام لوحة التحكم |

### التواصل والقوائم المرجعية

| المسار | الطرق | الوظيفة |
|---|---|---|
| `/conversations`، `/conversations/{id}`، `/conversations/recipients` | GET, POST, PATCH | المراسلات |
| `/announcements` | GET, POST, PATCH, DELETE | الإعلانات والتعاميم |
| `/communication/meetings`، `/communication/materials` | GET, POST, DELETE | الاجتماعات والمواد |
| `/notifications` | GET, PATCH | الإشعارات وتعليمها مقروءة |
| `/lookup/*` | GET | قوائم الاختيار: المحافظات، والمديريات، والمناطق، والمدارس، والمؤشرات، والمفتشون |
| `/me/home` | GET | بيانات لوحة المعلم |
| `/health` | GET | **عام:** فحص صحة النظام (قاعدة البيانات ونوع التخزين) |
