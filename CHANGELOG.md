# سجل التغييرات | Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Dates: DD/MM/YYYY. Versions: [Semantic Versioning](https://semver.org/).

---

## [1.2.0] – 12/11/2026

### Added (مضاف)
- **تقارير تفصيلية كاملة** (Item 3): شاشة التقارير تعرض كل قسم في بطاقة قابلة للطي: ملخص، حسب اليوم، حسب نوع الطلب، قائمة الطلبات مع تفاصيل الأصناف والأحجام وسجل التعديلات عند النقر، الطلبات الملغية منفصلة، مشتريات الموردين بكل فاتورة، المصروفات الأخرى سطراً بسطر، رواتب العمال. رسومان بيانيان SVG: المبيعات اليومية والمبيعات حسب النوع. تصدير Excel بورقة لكل قسم وتصدير PDF بنفس التفصيل.
- **طباعة تجريبية** (Item 9): زر "طباعة تجريبية" في الإعدادات يطبع وصلاً تجريبياً فعلياً إلى الطابعة المختارة ويُظهر toast نجاح أو رسالة الخطأ الحقيقية بالعربية. زر إضافي "حفظ تجربة PDF".
- **DateInput في المصروفات والموردين**: كل حقول التاريخ في شاشة المصروفات (فلتر + نموذج) وشاشة الموردين (تاريخ الفاتورة) استُبدلت بمكوّن DateInput لضمان DD/MM/YYYY دائماً.

### Fixed (تصحيح)
- **أيقونة رواتب العمال**: إضافة `BiGroup` إلى خريطة الأيقونات لمفتاح التنقل `workersPay` (كان يُظهر تحذير "unknown icon name").
- **ألوان CSS**: استبدال القيم الاحتياطية الثابتة `var(--color-warning, #b45309)` بـ`var(--color-warning)` في ReportsScreen.module.css.

### Technical Notes
- `electron/services/reports.js`: إضافة `queryByDay`, `queryOrdersList`, `queryCancelledOrders`, `queryWorkersPay` مع حماية من غياب جدول `worker_payments`.
- `electron/services/excelExport.js`: ورقة لكل قسم (10 أوراق).
- `electron/services/pdfExport.js`: نفس الأقسام + تواريخ DD/MM/YYYY عبر `fmtDate`.
- `electron/services/printing.js`: إضافة `buildTestReceiptHtml`, `printHtmlDirect`, `saveTestPdf`.

---

## [1.1.0] – 30/07/2025

### Added (مضاف)
- **أحجام المنتجات** (Item 1): كل منتج يدعم أحجاماً حرة يضيفها المالك. وضعان للتسعير: "سعر كامل" (الحجم = السعر الكامل) أو "زيادة على السعر الأساسي" (الحجم = إضافة على السعر الأساسي). دالة تسعير مركزية واحدة في طبقة الخدمة. نافذة اختيار الحجم (SizePickerModal) تُفتح تلقائياً. بطاقة المنتج تعرض "من <أدنى سعر>".
- **قاعدة بيانات**: هجرة 002 تضيف عمود `size_price_mode` و `sort_order` لخيارات المنتجات.
- **رواتب العمال** (Item 6): إدخال يومي للرواتب لكل عامل، إدارة العمال (تفعيل/إيقاف دون حذف)، ملخص وتفصيل لكل عامل خلال فترة. هجرة 003 تضيف جدولي `workers` و `worker_payments`.
- **DateInput** (Item 7): مكوّن إدخال التاريخ بتنسيق DD/MM/YYYY (أرقام لاتينية) مع تقويم منبثق، يحل محل `<input type="date">` الذي يتبع إعدادات Windows الإقليمية.
- **مُسجِّل الأخطاء** (Item 10): ملف سجل دوّار (1 ميجابايت، 3 ملفات) في `%APPDATA%\Raid Fast Food\logs\app.log`. زر "فتح مجلد السجلات" في الإعدادات.
- **معلومات الإصدار** (Item 11): رقم الإصدار في شاشة تسجيل الدخول وفي الإعدادات (قسم "حول البرنامج").
- `npm run check:version` يتحقق من تطابق الإصدار بين package.json و CHANGELOG.md.
- أوامر `npm run release:patch/minor/major` للإصدار.

### Changed (تغيير)
- **اسم "الكاشير" → "البائع"** (Item 5): كل النصوص الظاهرة للمستخدم تستخدم "البائع". مفتاح الدور الداخلي `'cashier'` بقي بدون تغيير.
- **اختيار الحجم في نقطة البيع** (Item 1): النقر على منتج بأحجام يفتح نافذة اختيار إجبارية بدلاً من إضافة الحجم كإضافة على السعر الأساسي. تصحيح الخطأ: الحجم لم يعد يُضاف إلى السعر الأساسي.
- **قاعدة ESLint**: حظر استخدام `toLocaleDateString/toLocaleString/toLocaleTimeString` (Item 7).
- **ألوان قسم المصروفات** والـ PrintDialog: استبدال الألوان الثابتة بمتغيرات CSS tokens (Item 4).
- أسماء المنتجات في كل الشاشات تستخدم `var(--color-text)` لضمان ظهورها في الوضع الداكن (Item 4).

### Fixed (تصحيح)
- **صورة المنتج تختفي عند التعديل** (Item 2): نموذج التعديل يُحمّل الصورة الحالية ولا يرسل `imagePath` للخادم إلا عند اختيار صورة جديدة أو الضغط على "حذف الصورة". قبلاً كان الإرسال يُرسل `null` دائماً فيمحو الصورة.
- **الشعار في ملف .exe المثبّت** (Item 8): تحسين تسلسل البحث عن مسار الشعار: userData → resources/assets → app path → مسار احتياطي. التخزين المؤقت بعد أول قراءة.

### Technical Notes
- All DB changes are new migrations only (001 unchanged).
- Money amounts: INTEGER minor units throughout; no ad-hoc ×100 or ÷100.
- `computeUnitPrice` in `electron/services/products.js` is the single pricing function.
- New tests: sizes.test.js, workers.test.js, dates.test.js, css_tokens.test.js.

---

## [1.0.0] – نسخة أولية

الإصدار الأول من تطبيق "فاست فود رائد" – نقطة بيع مكتبية للويندوز.

[1.2.0]: https://github.com/ayadseghairi/raid-fast-food/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ayadseghairi/raid-fast-food/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ayadseghairi/raid-fast-food/releases/tag/v1.0.0
