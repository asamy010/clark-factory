# 🚀 CLARK — START HERE (افتح ده أول حاجة في أي session جديد)

> **الغرض:** أي session جديد (Claude Code على الويب/الموبايل/الـ CLI) يقرأ الملف
> ده الأول فيفهم: المشروع إيه، البروتوكول إيه، والتفويضات الدائمة من Ahmed.
> ده ملخّص تشغيلي — المرجع الكامل في **`CLAUDE.md`** (جذر الريبو) و**تاريخ
> التطوير التفصيلي في `docs/RELEASE-LOG.md`**.

---

## 0. اقرأ بالترتيب ده قبل أي شغل

1. **`CLAUDE.md`** (جذر المشروع) — البروتوكول الكامل + الأنماط المعمارية +
   anti-patterns. **ملزم.**
2. **`docs/RELEASE-LOG.md`** — أحدث الإصدارات وإيه اللي اتعمل (الأحدث في الأعلى).
3. الملف ده (`docs/NEW-SESSION-START.md`) — التفويضات والـ workflow المختصر.

---

## 1. المشروع باختصار

- **CLARK** = نظام ERP لمصنع ملابس (Arabic RTL). React + Vite + Firebase
  (Firestore) + Vercel. كل نصوص الـ UI **بالعربي (لهجة مصرية)**.
- **البناء:** `npm run build` (لازم `✓ built` وصفر أخطاء قبل أي commit).
- **النشر:** Vercel بيـ auto-deploy على push لـ `main`.
- **مفيش بيئة تست محلية** — النشر مباشر على البرودكشن. أي تغيير في data-flow
  حسّاس (محاسبة/خزنة/مخزون/migrations) لازم **تحذّر** وتقترح اختبار يدوي. شوف
  §0.1 «Push Back» في `CLAUDE.md`.

### الفروع (Branches)
- **فرع التطوير الحالي:** `claude/release-log-review-j3ye96`
- **البرودكشن:** `main` (Vercel).
- طوّر على فرع التطوير، وادفع على **الاتنين** (فرع التطوير + `main`).
- **ممنوع:** `git push --force` على `main` · `git add .` · `--no-verify` ·
  commit لأي secrets (`shpat_`/`shpss_`/`.env`).

---

## 2. ✅ التفويضات الدائمة من Ahmed (نفّذها تلقائي — من غير ما تسأل)

> دي أوامر دائمة سارية للسيشن ده وكل اللي بعده:

1. **«ادفع دايمًا على main بدون ما ترجعلي.»** — بعد كل نسخة، ادفع تلقائي على
   فرع التطوير **و** `main`. مفيش استئذان لكل push.
2. **«اعمل زيب فايل لكل نسخة أو تعديل.»** — كل version bump (حتى لو صغير) لازم
   يطلع معاه zip ويتبعت للمستخدم في الشات. لا استثناءات.
3. **«انصحني/اعترض على اللي غلط.»** — مش executor أعمى. لو الطلب خطر أو غلط أو
   محتاج تفكير أكتر، اعترض **قبل** التنفيذ (§0.1 في `CLAUDE.md`). للتغييرات
   المالية المعقّدة: استخدم `AskUserQuestion` لتأكيد المقاربة قبل الشحن.

---

## 3. ⚡ الـ AUTO-WORKFLOW — نفّذه تلقائي بعد كل تعديل في الكود

من غير ما تسأل، نفّذ التسلسل ده بالترتيب:

```
1) BUILD    → npm run build           (لازم ✓ built + صفر أخطاء)
2) BUMP     → النسخة في 3 أماكن:
             • package.json                "version": "21.X.Y"
             • src/constants/index.js      export const APP_VERSION = "V21.X.Y"
             • public/changelog.json       prepend object جديد في أول الـ array
3) LOG      → docs/RELEASE-LOG.md          ضيف إدخال للنسخة (الأحدث في الأعلى)
4) COMMIT   → ملفات محدّدة بس (مفيش git add .)، رسالة V-tagged
5) PUSH     → فرع التطوير + main (الاتنين)
6) ZIP      → clark-v<النسخة>.zip وابعته للمستخدم في الشات
```

### تفاصيل كل خطوة

**(2) `public/changelog.json`** — JSON صالح (double-quotes)، الأحدث في أول الـ array:
```json
{
 "version": "V21.X.Y",
 "date": "YYYY-MM-DD",
 "types": ["fix"],
 "title": "<emoji> Phase NN — <عنوان قصير>",
 "changes": [ { "type": "fix", "text": "وصف عربي مفصّل..." } ]
}
```
بعد التعديل: `node -e "JSON.parse(require('fs').readFileSync('public/changelog.json','utf8'))"` للتأكد إنه صالح.

**(4) COMMIT** — stage الملفات المعدّلة بالاسم فقط، ورسالة بتنتهي بالـ footer ده **بالظبط**:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019xnGKbKnkeMixvGLiFHcUG
```
> ⚠️ مُعرّف الموديل (claude-opus-...) **ممنوع** يظهر في الكوميت/الكود/أي artifact.

**(5) PUSH** — الأمرين:
```bash
git push -u origin claude/release-log-review-j3ye96
git push origin claude/release-log-review-j3ye96:main
```
لو فشل لأسباب شبكة: retry مع backoff (2s, 4s, 8s, 16s). لو اترفض بـ
`fetch first`: اعمل `git fetch origin main` ثم rebase ثم أعد المحاولة.

**(6) ZIP** (في البيئة السحابية — من غير node_modules/dist):
```bash
git archive --format=zip --prefix=clark-v21.X.Y/ -o clark-v21.X.Y.zip HEAD
```
وابعته للمستخدم (الزيب جزء إلزامي من كل نسخة).

---

## 4. مزامنة Git (أول أمر في أي session)

أحيانًا الـ working tree المحلي بيبدأ متأخّر عن `origin`. أول حاجة:
```bash
git fetch origin claude/release-log-review-j3ye96 main
git log --oneline -3 origin/claude/release-log-review-j3ye96
# لو origin أحدث ومفيش شغل محلي غير متكوميت:
git reset --hard origin/claude/release-log-review-j3ye96
```
وقبل كل commit جديد: `git fetch` ثم تأكّد إنك على رأس الفرع.

---

## 5. أنماط معمارية لازم تعرفها (تفاصيل في CLAUDE.md)

- **تقسيم المستندات (Document Splitting):** أي مصفوفة بتكبر مع الوقت لازم
  تتقسّم (daily أو per-id) — حد Firestore 1 MB. شوف §2 في `CLAUDE.md`.
- **الأوامر في `seasons/{season}/orders/`** — مش في `cfg.orders`.
- **الخامات/الألوان:** `order.fabricA`..`H` + `order.colorsA` (الاسم `c.color`).
- **المقاسات:** من `order.sizeSetId` عبر `getSizesFromSet`.
- **أوامر البيع / التوزيعات:** التوزيعة = مصدر الحقيقة للرصيد/المخزون؛ المرآة
  (`sourceDistributionId`) مستند عرض/فوترة بس. `computeSoReserved` بيستبعدها.
- **الفوترة (V21.27.90):** البيع السريع بيولّد «أمر بيع» تلقائي بس — **مايرحّلش
  فاتورة**. الترحيل بيحصل من «ترحيل فاتورة» على أمر البيع (الإيراد/COGS وقتها).

---

## 6. الحالة الحالية (آخر تحديث)

- **آخر نسخة منشورة:** **V21.27.90** (2026-06-21).
- آخر 4 إصدارات (تفاصيلها في `RELEASE-LOG.md`):
  - **V21.27.90** — البيع السريع: أمر بيع تلقائي بدل فاتورة مرحلة مباشرة (باجز
    خطير في دورة البيع).
  - **V21.27.89** — سجل حركات الجاهز اتنقل لـ «المخزن والجرد» + اتشال من المشتريات.
  - **V21.27.88** — كارت الصنف (الجاهز) بيخصم أوامر البيع من الرصيد.
  - **V21.27.87** — الرصيد المتاح جنب الصنف (inline) + في أوامر البيع.

### 🔜 متابعات مفتوحة (راجعها مع Ahmed)
- **اختبار يدوي مطلوب لـ V21.27.90:** بيعة سريعة واحدة تجريبية للتأكد إنها بتظهر
  كأمر بيع (مش فاتورة مرحلة)، و«ترحيل فاتورة» من الأمر بيعمل فاتورة واحدة بس
  (مفيش ازدواج) والإيراد بيتسجّل صح.
- مرتجع البيع السريع لسه بيرحّل زي ما هو (Ahmed سأل عن البيع فقط) — يتراجع لو حبّ
  ياخد نفس منطق V21.27.90.
- بنود مؤجّلة (محتاجة تأكيد قبل البدء): دعم عملة USD في أوامر الشراء · رفع مرفقات
  أثناء إنشاء أمر الشراء قبل الحفظ الأول.

---

> **الخلاصة:** اقرأ `CLAUDE.md` + `RELEASE-LOG.md` → اعمل شغلك → بعد كل تعديل:
> build · bump (3 أماكن) · حدّث RELEASE-LOG · commit (ملفات محددة) · push
> (تطوير + main) · zip وابعته. ادفع على main تلقائي. زيب لكل نسخة. اعترض على
> الغلط.
