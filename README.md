# مربوعة — MARBO3A

منصة تواصل اجتماعي عربية RTL مبنية على Next.js وNode/Express وPostgreSQL وRedis وSocket.IO/WebRTC، وتُنشر عبر Docker Compose خلف Nginx.

## المصدر الرسمي
- الفرع الإنتاجي: `main`
- الموقع: `https://marbo3a.ly`
- مسار النشر على الخادم: `/opt/marbo3a`

## سياسة الإصدار والنشر
لا يُعتبر وجود الكود على `main` أو نجاح build وحده تصريحًا للنشر. المرجع الرسمي للإقفال هو `docs/RELEASE-CLOSURE.md` ومصفوفة الاختبارات `docs/GROUP14-E2E-MATRIX.md`.

قبل أي نشر يجب تثبيت SHA المرشح، إكمال أدلة E2E المطلوبة، التحقق من النسخة الاحتياطية/الاسترجاع، معرفة revision الرجوع، والحصول على موافقة صريحة من مالك المشروع على Production.

فحص السورس للمرشح:
```bash
cd /opt/marbo3a
RELEASE_CANDIDATE_SHA="$(git rev-parse HEAD)" bash scripts/release-preflight.sh /opt/marbo3a
```

النشر الفعلي — بعد الموافقة الصريحة فقط — يتم عبر مسار النشر المحمي الموجود في `ops/deploy-production.sh` بدل `docker compose up -d --build` اليدوي، لأنه يملك maintenance gate وpre-deploy backup وrestore verification وhealth checks وrollback.

## فحوص سريعة
```bash
docker compose logs --tail=100 api web turn
ss -lntup | grep -E ':(80|443|3478)\\b' || true
```

## TURN / WebRTC
يجب ضبط `TURN_HOST`, `TURN_EXTERNAL_IP`, `TURN_SECRET` و`TURN_REALM` في بيئة الإنتاج. منافذ TURN الأساسية هي 3478 TCP/UDP ومجال relay المحدد في `compose.yml`. لا تُحفظ الأسرار داخل المستودع. جاهزية المكالمات لا تُعلن قبل اختبار مستخدمين/جهازين على شبكتين مختلفتين.

## النسخ الاحتياطي
نسخة Docker المحلية هي استرجاع طوارئ على نفس المضيف وليست Offsite Disaster Recovery. الإقفال الإنتاجي يتطلب نسخة مشفرة خارجية واختبار Restore معزول وفق أدوات `ops/backup-database.sh` و`ops/verify-backup-restore.sh`.

## ملاحظات الواجهة
احترم ملكية طبقات CSS والعقد المقفلة في المشروع، ولا تضف ملفات fix/final/polish عامة من أجل تجاوز النظام الحالي. أي تعديل واجهة يجب أن يتم في طبقة التصميم/المكوّن الدلالي المناسب مع الحفاظ على الهوية الرسمية المعتمدة.
