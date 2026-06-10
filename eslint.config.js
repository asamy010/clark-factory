/* ═══════════════════════════════════════════════════════════════════════
   CLARK · إعداد ESLint — V21.21.39 (مرحلة النظافة 2.1)
   ───────────────────────────────────────────────────────────────────────
   فلسفة المرحلة الأولى (حسب docs/ROADMAP-PROFESSIONAL.md):
   «البداية بـ errors فقط — مش airbnb الكامل، هيغرّقنا في 10,000 تحذير.
    التشديد تدريجي.»

   القواعد المفعّلة = صائدات الأخطاء الحقيقية فقط (متغير غير معرّف، مفتاح
   مكرر، كود بعد return، مقارنة NaN غلط...). القواعد «الأسلوبية» والصاخبة
   (no-unused-vars، no-empty) مُعطّلة عمداً في المرحلة دي:
   - no-empty: الـ catch الفاضية الباقية معظمها تنظيف كاميرات/طباعة
     موثّق (V21.21.31 صلّح المالية منها) — تشديدها مرحلة لاحقة.
   - no-unused-vars: مئات النتائج القديمة — تنظيفها ملف-بملف مع كل
     مراجعة، مش دفعة واحدة.
   أي قاعدة هنا = خطأ يكسر CI. مفيش warnings — يا أخضر يا أحمر.
   ═══════════════════════════════════════════════════════════════════════ */
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "clark-wa-bridge/**", "public/**"],
  },
  {
    files: ["src/**/*.{js,jsx}", "api/**/*.js", "tests/**/*.js", "*.js"],
    /* الكود القديم فيه eslint-disable directives لقواعد react-hooks —
       بنسجّل الـ plugin (من غير تفعيل قواعده) عشان الـ directives تتحلّ
       بدل خطأ rule-not-found. تفعيل قواعد الـ hooks مرحلة لاحقة. */
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      /* ── صائدات أخطاء التنفيذ (runtime bugs) ── */
      "no-undef": "error",            /* متغير غير معرّف = ReferenceError مؤكد */
      "no-dupe-keys": "error",        /* مفتاح مكرر في object — الأخير بيمسح الأول بصمت */
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",      /* كود بعد return/throw — غالباً bug */
      "no-unsafe-negation": "error",
      "use-isnan": "error",           /* x === NaN دايماً false */
      "valid-typeof": "error",
      "no-const-assign": "error",
      "no-class-assign": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-sparse-arrays": "error",
      "no-async-promise-executor": "error",
      "getter-return": "error",
      "no-setter-return": "error",
      "no-obj-calls": "error",
      "no-new-native-nonconstructor": "error",
      "no-loss-of-precision": "error",
      "no-irregular-whitespace": "error",
      "no-debugger": "error",
      "no-ex-assign": "error",
      "no-fallthrough": "error",
      "no-global-assign": "error",
      "for-direction": "error",
      "no-constant-binary-expression": "error",
    },
  },
];
