# Otium Link ⚡

> **Local-First Universal Bridge for Instant Clipboard and File Sync Between PC and Phone**  
> *جسر محلي فوري لنقل الحافظة والملفات بين الحاسوب والهاتف دون إنترنت وبخصوصية مطلقة.*

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Built with Tauri v2](https://img.shields.io/badge/Built%20with-Tauri%20v2-24c8db.svg)](https://v2.tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg)](https://www.rust-lang.org/)

---

## 🏛️ أصل التسمية وفلسفة التطبيق (The Philosophy of Otium)

تعود كلمة **Otium** إلى اللاتينية الكلاسيكية، وكانت تعبّر عند الفلاسفة والمفكرين الرومان عن **«الفراغ المثمر والسكينة الواعية»** — أي الوقت الهادئ المخصص للقراءة، التأمل، والكتابة بعيداً عن صخب الحياة وتشتيت المشاغل.

في عصر التطبيقات السحابية التي تجبر المستخدمين على رفع بياناتهم الشخصية وإعلانات التتبع المستمرة، يأتي **Otium Link** ليكون الجسر الهادئ الذي يربط أجهزتك ببعضها داخل غرفتك:
* **محلي بالكامل (Local-First):** بياناتك لا تغادر راوتر شبكتك المنزلية نهائياً.
* **بلا سحابة وبلا حسابات (Zero Cloud & Zero Accounts):** لا تسجيل دخول، لا خوادم وسيطة، ولا اشتراكات شهرية.
* **صامت وخفيف (Silent & Lightweight):** يعمل في الخلفية بهدوء في شريط المهام (System Tray) وشريط الإشعارات بأقل استهلاك ممكن للذاكرة والمعالج.

---

## 🌟 الميزات الجوهرية (Core Features)

1. **الحافظة المشتركة اللحظية (Universal Live Clipboard):**
   - نسخ أي نص، كود، أو رقم هاتف على الحاسوب يجعله متاحاً للصق الفوري على الهاتف، والعكس صحيح تلقائياً.
2. **تطهير الروابط من التتبع الرقمي (Smart Link Cleaner):**
   - إزالة تلقائية لوسوم التتبع التسويقي والمراقبة (مثل `?utm_source=...`, `?si=...`, `fbclid`) من الروابط المنسوخة للحفاظ على خصوصيتك وخفة الروابط.
3. **سحب وإفلات الملفات بسرعة الشبكة القصوى (Lossless P2P File Drop):**
   - إرسال الصور والفيديوهات والمستندات الكبيرة دون أي ضغط لجودتها عبر اتصال مباشر من القرص إلى كرت الشبكة (Direct Disk-to-Socket Streaming).
4. **تكامل عضوي مع عائلة Otium:**
   - استقبال المستندات الممسوحة ضوئياً من **Otium Scan** بضغطة زر.
   - إرسال كتب الـ PDF إلى **Otium Reader** على الهاتف لمتابعة القراءة أثناء التنقل.

---

## 🤝 منظومة أوتيوم المتكاملة (The Otium Ecosystem)

صُمم **Otium Link** ليعمل بتناغم كامل مع شقيقيه في المنظومة:
* 📖 [**Otium Reader**](https://github.com/XRTM8/Otium) — قارئ كتب ومستندات PDF فائق الخفة والهدوء مع تخطيط متقن للغة العربية.
* 📷 [**Otium Scan**](https://github.com/XRTM8/Otium-Scan) — ماسح ضوئي ذكي للمستندات مع معالجة حواف دقيقة وخزنة مشفرة محلياً.

---

## ⚠️ تنويه شفاف (Honest Development Notice)

المشروع حالياً **قيد التطوير النشط (Active Development)**. نحن نصمم كل سطر برمجي بعناية ليعمل دون الاعتماد على أي خدمات طرف ثالث. إذا واجهت أي ملاحظة أو سلوك غير متوقع، نرحب بمشاركتنا عبر صفحة الـ [Issues](https://github.com/XRTM8/Otium-Link/issues).

---

## 🛠️ البناء من المصدر (Build from Source)

```bash
# 1. تثبيت الاعتماديات
npm install

# 2. تشغيل الواجهة التجريبية في المتصفح
npm run dev

# 3. تشغيل التطبيق المكتبي عبر Tauri
npm run tauri:dev

# 4. بناء الحزمة النهائية للإنتاج
npm run tauri:build
```

---

## 📄 الترخيص (License)
مرخص تحت رخصة [MIT License](LICENSE) المفتوحة والمجانية بالكامل.
