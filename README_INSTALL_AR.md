# AIT GeoMine 360 — GitHub Pages V4.0

هذا المجلد هو واجهة GitHub Pages فقط. قاعدة البيانات وملفات الخرائط والتقارير تبقى في Google Sheets وGoogle Drive ولا تُرفع إلى GitHub.

## التحديث

1. ارفع محتويات هذا المجلد إلى مستودع GitHub بدل النسخة السابقة.
2. راجع `dashboard/backend-config.js` وتأكد أن `webAppUrl` هو رابط نشر Apps Script المنتهي بـ `/exec`.
3. من GitHub: Settings > Pages اختر GitHub Actions.
4. بعد تحديث Apps Script، أنشئ Deployment جديدًا أو حدّث الـ Deployment الحالي.

## الصلاحيات

الصلاحيات أصبحت على مستوى كل مستخدم: `hidden` أو `view` أو `full`. يتم تعديلها من Google Sheet عبر قائمة:

`AIT GeoMine Backend > User Administration`

الصفحات المخفية لا تُحمّل بياناتها من الـ backend، ووضع المشاهدة يعطّل التصدير والتنزيل.

## ملفات Google Drive الكبيرة

حجم الملفات لا يؤثر على المزامنة لأن Apps Script يقرأ بيانات الملفات ومساراتها فقط ولا ينزّل محتواها. ارفع مجلد الملفات الكامل إلى Google Drive، ضع Folder ID في `DRIVE_ROOT_FOLDER_ID` داخل `01_Config`، ثم شغّل `Sync Drive Files`.
