# مربوعة — MARBO3A

منصة تواصل اجتماعي عربية RTL مبنية على Next.js وNode/Express وPostgreSQL وRedis وSocket.IO/WebRTC، وتُنشر عبر Docker Compose خلف Nginx.

## المصدر الرسمي
- الفرع الإنتاجي: `main`
- الموقع: `https://marbo3a.ly`
- مسار النشر على الخادم: `/opt/marbo3a`

## نشر آخر تحديث على الخادم
```bash
cd /opt/marbo3a
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose up -d --build --remove-orphans
docker compose ps
```

## فحوص سريعة
```bash
docker compose logs --tail=100 api web turn
ss -lntup | grep -E ':(80|443|3478)\\b' || true
```

## TURN / WebRTC
يجب ضبط `TURN_HOST`, `TURN_EXTERNAL_IP`, `TURN_SECRET` و`TURN_REALM` في بيئة الإنتاج. منافذ TURN الأساسية هي 3478 TCP/UDP ومجال relay المحدد في `compose.yml`. لا تُحفظ الأسرار داخل المستودع.

## ملاحظات الواجهة
`frontend/app/system.css` هو طبقة التنسيق الموحدة النهائية للتوافق مع الهاتف والـsafe-area والـdock والشات. تجنب إضافة ملفات CSS من نوع fix/final/polish جديدة؛ عدّل النظام الموحد أو ملف المكوّن الدلالي المناسب.
