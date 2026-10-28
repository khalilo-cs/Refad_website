# دليل النشر على خادم — منصة رِفاد

هذا الدليل ينقل المنصة من الكود إلى خدمة تعمل على خادم حقيقي بعنوان IP.

---

## أولاً: ما تحتاجه قبل البدء

| المتطلب | الحد الأدنى | الملاحظة |
|---|---|---|
| خادم | 1 vCPU، 1 GB ذاكرة، 10 GB قرص | Ubuntu 22.04 أو 24.04 |
| نظام | Linux x86_64 | Alpine يعمل أيضاً عبر Docker |
| Node.js | 22 LTS | إن لم تستخدم Docker |
| نطاق (اختياري) | — | لشهادة HTTPS |

> **ملاحظة صريحة عن عنوان IP:** لا أستطيع حجز أو تسجيل عنوان IP عام باسمك — عناوين IP تُمنح من مزوّد الخدمة السحابية أو شركة الاتصالات عند شراء الخادم. ما تجهّزه المنصة هو كل ما يلزم ليعمل الخادم على **العنوان الذي تحصل عليه**. الخطوات أدناه تشمل كيفية معرفة العنوان وضبطه.

---

## ثانياً: الحصول على عنوان IP للخادم

بعد إنشاء الخادم من أي مزوّد (DigitalOcean، Hetzner، AWS، أو خادم محلي في المديرية):

```bash
# 1) العنوان الداخلي
hostname -I

# 2) العنوان العام كما يراه الإنترنت
curl -4 ifconfig.me

# 3) التأكد من فتح المنافذ
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

العنوان العام الناتج (مثل `203.0.113.10`) هو ما ستضعه في `APP_URL` وتفتحه في المتصفح.

> إن كان الخادم داخل شبكة المديرية خلف راوتر، وجّه منفذ 80/443 في الراوتر إلى عنوان الخادم الداخلي (Port Forwarding)، واستخدم عنوان IP العام للراوتر.

---

## ثالثاً: الطريقة الأولى — Docker (الأسهل والأسرع)

### 1. تثبيت Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

### 2. جلب المشروع
```bash
sudo mkdir -p /opt/rifad && sudo chown $USER:$USER /opt/rifad
git clone -b main https://github.com/khalilo-cs/-.git /opt/rifad
cd /opt/rifad
```

### 3. إعداد الأسرار
```bash
cp .env.production.example .env.production
chmod 600 .env.production

# ولّد سرّين قويين وضعهما في الملف
openssl rand -hex 32     # ضعه في JWT_SECRET
openssl rand -hex 32     # ضعه في JWT_REFRESH_SECRET

nano .env.production     # عدّل APP_URL إلى http://<IP-الخادم>
```

### 4. التشغيل
```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

### 5. التهيئة الأولى لقاعدة البيانات
الحاوية تنشئ قاعدة بيانات فارغة عند أول تشغيل. بذرها بالمعايير والمؤشرات:

```bash
docker compose exec app node -e "console.log('الحاوية تعمل')"
# نفّذ البذر (مرة واحدة فقط عند أول تركيب)
docker compose exec app node scripts/init-db.js 2>/dev/null || \
  docker compose exec app npx tsx scripts/init-db.ts
```

> بعد البذر، ادخل إلى `http://<IP>/setup` لإنشاء حساب المسؤول الأول، أو استخدم الحسابات التجريبية ثم غيّر كلمات مرورها فوراً.

> ⚠️ **قبل الإنتاج:** ملف `dev.db` المرفق في الحزمة يحتوي بيانات عرض تجريبية
> (حسابات `@rifad.demo` ومدرسة وهمية موسومة صراحةً بأنها غير حقيقية). لا تنقل
> هذا الملف إلى خادم إنتاج. أنشئ قاعدة نظيفة:
>
> ```bash
> rm -f dev.db dev.db-wal dev.db-shm
> npm run db:init          # ينشئ المخطط + المعايير والمؤشرات فقط
> ```
> ثم أنشئ حساب المسؤول من `http://<IP>/setup`. وإن أردت الحسابات التجريبية
> على بيئة اختبار، فغيّر كلمات مرورها كلها قبل فتح المنصة لأي مستخدم.

> 🔐 **السرّ مطلوب دائماً:** الخادم يرفض الإقلاع إذا كان `JWT_SECRET` فارغاً أو
> أقصر من 32 حرفاً أو يحتوي قيمة نائبة مثل `change_me` أو `ضع-هنا`. ولّد سرّاً حقيقياً:
> `openssl rand -hex 32`

### 6. أوامر يومية
```bash
docker compose logs -f app        # المتابعة
docker compose restart app        # إعادة تشغيل
docker compose down               # إيقاف
docker compose up -d --build      # تحديث بعد سحب كود جديد
```

---

## رابعاً: الطريقة الثانية — بدون Docker (systemd)

### 1. تثبيت Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs python3 make g++
```

### 2. إنشاء مستخدم الخدمة
```bash
sudo useradd -r -s /bin/false -d /opt/rifad rifad
sudo mkdir -p /opt/rifad /opt/rifad/data
sudo chown -R rifad:rifad /opt/rifad
```

### 3. جلب المشروع والبناء
```bash
sudo -u rifad git clone -b main https://github.com/khalilo-cs/-.git /opt/rifad
cd /opt/rifad
sudo -u rifad npm ci --ignore-scripts
sudo -u rifad npm rebuild better-sqlite3
sudo -u rifad npm run build
```

### 4. الإعدادات
```bash
sudo -u rifad cp .env.example .env
sudo -u rifad nano .env       # اضبط JWT_SECRET وAPP_URL وSQLITE_DIR=/opt/rifad/data
sudo chmod 600 /opt/rifad/.env
sudo chown rifad:rifad /opt/rifad/.env
```

### 5. تجهيز مخرجات البناء المستقلة
```bash
cd /opt/rifad
sudo -u rifad cp -r .next/standalone/. /opt/rifad-dist/
sudo -u rifad cp -r public /opt/rifad-dist/public
sudo -u rifad mkdir -p /opt/rifad-dist/.next
sudo -u rifad cp -r .next/static /opt/rifad-dist/.next/static
```

### 6. بذر قاعدة البيانات ثم التشغيل
```bash
sudo -u rifad npx tsx scripts/init-db.ts
sudo cp deploy/rifad.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rifad
sudo systemctl status rifad
```

الخدمة تستمع على `127.0.0.1:3000` فقط — الوصول إليها عبر Nginx.

---

## خامساً: Nginx كواجهة عامة

```bash
sudo apt install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/conf.d/rifad.conf
```

عدّل `deploy/nginx.conf`:
- إن استخدمت Docker: أبقِ `server app:3000;`
- إن استخدمت systemd: غيّره إلى `server 127.0.0.1:3000;`

ثم:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

الآن المنصة متاحة على `http://<IP-الخادم>`.

---

## سادساً: HTTPS (موصى به بشدة)

المنصة تعالج بيانات مدارس وحسابات مستخدمين؛ بدون HTTPS تمر كلمات المرور نصاً صريحاً.

```bash
sudo apt install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot -d your-domain.edu.ye
```

ثم:
1. انسخ الشهادات:
   ```bash
   sudo mkdir -p /opt/rifad/deploy/certs
   sudo cp /etc/letsencrypt/live/your-domain.edu.ye/fullchain.pem /opt/rifad/deploy/certs/
   sudo cp /etc/letsencrypt/live/your-domain.edu.ye/privkey.pem /opt/rifad/deploy/certs/
   ```
2. أزل التعليق عن كتلة `server { listen 443 ... }` في `deploy/nginx.conf`
3. أزل التعليق عن `return 301 https://...` في كتلة المنفذ 80
4. `sudo nginx -t && sudo systemctl reload nginx`

تجديد تلقائي:
```bash
sudo systemctl enable --now certbot.timer
```

---

## سابعاً: النسخ الاحتياطي — تحذير مهم

قاعدة البيانات تعمل بوضع WAL. **نسخ ملف `dev.db` وحده يفقد معظم البيانات** لأنها قد تكون في `dev.db-wal`. استخدم السكربت المرفق:

```bash
./scripts/backup-db.sh /var/backups/rifad
```

جدولة يومية:
```bash
crontab -e
# أضف:
0 2 * * * /opt/rifad/scripts/backup-db.sh /var/backups/rifad
```

يستخدم السكربت `VACUUM INTO` لضمان نسخة متسقة، ويحتفظ بآخر 30 نسخة.

---

## ثامناً: بعد التشغيل — قائمة تحقق

| الخطوة | الأمر / الرابط |
|---|---|
| الخدمة تعمل | `curl http://<IP>/api/health` → `{"status":"ok"}` |
| إنشاء حساب المسؤول | `http://<IP>/setup` |
| تغيير كلمات المرور التجريبية | من قائمة المستخدمين بعد الدخول |
| التحقق من الترويسات | `curl -I http://<IP>/login` |
| تأكيد عدم وجود `.env` في الصورة | `docker run --rm rifad-platform:latest ls -a /app \| grep env` |

---

## تاسعاً: حل المشكلات الشائعة

| الأعراض | السبب | الحل |
|---|---|---|
| `JWT_SECRET غير مضبوط` عند الإقلاع | المتغير مفقود أو أقصر من 32 حرفاً | `openssl rand -hex 32` وضعه في `.env` |
| الدخول يعمل لكن التنقل يعيد لصفحة الدخول | سرّ مختلف بين وقت البناء ووقت التشغيل | أعد البناء بعد ضبط `.env` النهائي |
| `no such table: users` | قاعدة البيانات غير مبذورة | `npm run db:init` أو `npx tsx scripts/init-db.ts` |
| البيانات اختفت بعد إعادة النشر | لم يُستخدم مُجلَّد دائم (volume) | تأكد من `rifad-data:/app/data` في docker-compose |
| نسخة احتياطية فارغة | نُسخ `dev.db` بدون WAL | استخدم `scripts/backup-db.sh` |
| `EADDRINUSE` | منفذ مشغول | `sudo lsof -i :3000` ثم أوقف العملية |
| فشل بناء `better-sqlite3` | أدوات البناء ناقصة | `sudo apt install python3 make g++` |

---

## عاشراً: حالة الإصدار الحالي

**جاهز ويعمل ومُختبَر:**
- تسجيل الدخول والصلاحيات المطبَّقة في الخادم (7 أدوار).
- التقييم الميداني على 109 مؤشراً موزعة على 7 معايير و12 معياراً فرعياً،
  مع حالة «لم يُقيَّم» منفصلة عن «لم يتحقق».
- الأدلة والشواهد وأدوات التحقق معروضة لكل مؤشر من الاستمارة الأصلية.
- التقارير بأربع حالات (مسودة/قيد المراجعة/معتمد/مرفوض) مع سجل اعتماد
  يحمل اسم المعتمِد وتاريخه وسبب الرفض عند الرفض.
- تصدير PDF عربي RTL بخط أميري، وExcel (xlsx) وCSV، ومعاينة قبل الطباعة.
- رمز تحقق عام لكل تقرير مع رمز QR يُطبع في ملف PDF، وصفحة `/verify`
  تعرض بيانات التقرير دون كشف بيانات المستخدمين.
- إدارة المدارس مع استيراد Excel/CSV على مرحلتين: فحص أولاً ثم تأكيد،
  وقالب تنزيل جاهز.
- لوحة تحكم بإحصاءات واتجاهات، وخطط تحسين، وتعاملات التواصل الداخلي.
- لوحة إدارة شاملة (7 أقسام) تُتيح لمدير النظام إضافة وتعديل وحذف
  المدارس والبيانات المرجعية والمعايير والمؤشرات والأدوار والمستخدمين والإعدادات.
- PWA: ملف تثبيت وأيقونات، وعامل خدمة يخزّن قشرة التطبيق، وصفحة `/offline`.
- مسودات التقييم تُحفظ في IndexedDB عند انقطاع الشبكة وتُزامَن تلقائياً
  عند عودتها، مع شريط حالة وعدّاد لما لم يُرفع بعد.
- 123 اختباراً آلياً (تقييم، صلاحيات، بيانات البذور، أسرار، مكوّنات، PWA، إدارة).
- إدارة كاملة من داخل الموقع: أدوار وصلاحيات مخصّصة، سجل تدقيق، نسخة احتياطية بضغطة،
  إضافة مستويات مقياس تقدير، وإعدادات عامة — دون أي تعديل في الكود.

**قيود معروفة يجب ذكرها بصراحة:**
- لا توجد بيانات مدارس حقيقية في المستودع. السجل الموجود موسوم صراحة
  بأنه «بيانات وهمية للعرض فقط»، والمطلوب إدخال المدارس الفعلية عبر
  الاستيراد أو الإدخال اليدوي.
- التقرير لا يُوصف بأنه «معتمد رسمياً» إلا إذا حمل حالة «معتمد» وسجل
  اعتماد موثّقاً. المنصة لا تُصدر أختاماً أو شعارات حكومية مزيفة.
- استعادة كلمة المرور تعمل عبر المدير، لا عبر بريد إلكتروني تلقائي.
- المزامنة عند عودة الاتصال ترفع الدرجات المحفوظة محلياً بالتسلسل، ولا
  تحلّ تعارضات تحرير متزامنة من جهازين مختلفين لنفس المؤشر (آخر وصول يفوز).
