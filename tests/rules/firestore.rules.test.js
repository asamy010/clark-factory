/* ═══════════════════════════════════════════════════════════════════════
   اختبارات قواعد حماية Firestore — V21.21.35 (خطة التحصين 1.2)
   ───────────────────────────────────────────────────────────────────────
   بتجري ضد المحاكي المحلي (مفيش أي لمس لـ production):
     npm run test:rules

   ليه دي نقطة تحول: حادثة V21.9.69 (قواعد عدّت الـ syntax وكسرت كل
   الرفع في production) سببها انعدام أي بيئة اختبار للقواعد. من النهاردة
   أي تعديل في firestore.rules بيتفحص هنا وفي CI قبل ما يوصل لحد.

   ⚠️ أشكال الكتابة في الاختبارات منقولة حرفياً من الكود الفعلي:
   - الـ split sync بيكتب  {entries, count, updatedAt}  (من غير date!)
     — syncSplitCollection في splitCollections.js (V21.9.67).
   - دفتر اليومية بيكتب     {date, entries, updatedAt}
     — mutateDay في accounting/dayDoc.js.
   لو القواعد طلبت حقل مش موجود في الشكل الفعلي → كل الحفظ يقف. الاختبارات
   دي بتمنع النوع ده من الكوارث.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";

let env;

/* الشكل الحقيقي لكتابة الـ split sync (V21.9.67) */
const SPLIT_DAY_DOC = {
  entries: [{ id: "t1", type: "in", amount: 100, date: "2026-06-10" }],
  count: 1,
  updatedAt: "2026-06-10T10:00:00.000Z",
};
/* الشكل الحقيقي لكتابة دفتر اليومية (dayDoc.js) */
const JOURNAL_DAY_DOC = {
  date: "2026-06-10",
  entries: [{ id: "je1", refNo: "JE-2026-0001", status: "posted", lines: [] }],
  updatedAt: "2026-06-10T10:00:00.000Z",
};
/* شكل مشوّه — entries مش مصفوفة (خطأ كود أو عبث) */
const CORRUPT_DAY_DOC = { entries: "garbage", updatedAt: "x" };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "clark-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  /* زرع factory/config بخريطة الأدوار — getRole() في القواعد بيقرأها */
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("factory/config").set({
      users: {
        adminU: "admin",
        mgrU: "manager",
        salesAccU: "sales_accountant",
        purchAccU: "purchase_accountant",
        payrollAccU: "payroll_accountant",
        viewerU: "viewer",
      },
      factoryName: "CLARK Test",
    });
  });
});

afterAll(async () => { if (env) await env.cleanup(); });

const db = (uid) => env.authenticatedContext(uid).firestore();

/* ───────── الخزنة (treasuryDays) — أخطر مجموعة ───────── */
describe("treasuryDays — نطاق المشتريات + شكل صحيح", () => {
  it("admin يكتب بالشكل الحقيقي للـ split sync", async () => {
    await assertSucceeds(db("adminU").doc("treasuryDays/2026-06-10").set(SPLIT_DAY_DOC));
  });

  it("V21.21.35: الشكل المشوّه (entries مش list) مرفوض حتى من admin", async () => {
    await assertFails(db("adminU").doc("treasuryDays/2026-06-11").set(CORRUPT_DAY_DOC));
  });

  it("viewer لا يقرأ ولا يكتب الخزنة", async () => {
    await assertFails(db("viewerU").doc("treasuryDays/2026-06-10").get());
    await assertFails(db("viewerU").doc("treasuryDays/2026-06-10").set(SPLIT_DAY_DOC));
  });

  it("sales_accountant (خارج نطاق المشتريات) لا يكتب الخزنة", async () => {
    await assertFails(db("salesAccU").doc("treasuryDays/2026-06-10").set(SPLIT_DAY_DOC));
  });

  it("حذف اليوم الفاضي مسموح لنطاق المشتريات (tx.delete في الـ sync)", async () => {
    await assertSucceeds(db("adminU").doc("treasuryDays/2026-06-10").delete());
  });
});

/* ───────── دفتر اليومية (accountingDays) ───────── */
describe("accountingDays — المحاسبون فقط + شكل صحيح", () => {
  it("sales_accountant يكتب قيداً بالشكل الحقيقي", async () => {
    await assertSucceeds(db("salesAccU").doc("accountingDays/2026-06-10").set(JOURNAL_DAY_DOC));
  });

  it("الشكل المشوّه مرفوض", async () => {
    await assertFails(db("salesAccU").doc("accountingDays/2026-06-11").set(CORRUPT_DAY_DOC));
  });

  it("viewer لا يقرأ دفتر اليومية (سرية القيود — V19.64)", async () => {
    await assertFails(db("viewerU").doc("accountingDays/2026-06-10").get());
  });
});

/* ───────── دفعات العملاء ───────── */
describe("custPaymentsDays — قائمة الكتابة الضيقة مقصودة", () => {
  it("sales_accountant يكتب دفعة عميل", async () => {
    await assertSucceeds(db("salesAccU").doc("custPaymentsDays/2026-06-10").set(SPLIT_DAY_DOC));
  });

  it("payroll_accountant يقرأ (ضمن المحاسبين) لكن لا يكتب — قرار V21.21.35", async () => {
    await assertSucceeds(db("payrollAccU").doc("custPaymentsDays/2026-06-10").get());
    await assertFails(db("payrollAccU").doc("custPaymentsDays/2026-06-10").set(SPLIT_DAY_DOC));
  });
});

/* ───────── الشيكات والفواتير ───────── */
describe("checksDays / salesInvoicesDays — الشكل الصحيح إجباري", () => {
  it("النطاق الصحيح + الشكل الصحيح = مسموح", async () => {
    await assertSucceeds(db("purchAccU").doc("checksDays/2026-06-10").set(SPLIT_DAY_DOC));
    await assertSucceeds(db("salesAccU").doc("salesInvoicesDays/2026-06-10").set(SPLIT_DAY_DOC));
  });

  it("الشكل المشوّه مرفوض في الاتنين", async () => {
    await assertFails(db("purchAccU").doc("checksDays/2026-06-12").set(CORRUPT_DAY_DOC));
    await assertFails(db("salesAccU").doc("salesInvoicesDays/2026-06-12").set(CORRUPT_DAY_DOC));
  });
});

/* ───────── مجموعات V21.21.33 الجديدة (الوسوم وجهات الاتصال) ───────── */
describe("tagRegistryDocs / contactsDocs — قواعد V21.21.33", () => {
  it("أي مستخدم يقرأ — والكتابة للإدارة فقط", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("tagRegistryDocs/tag1").set({ id: "tag1", name: "مهم" });
    });
    await assertSucceeds(db("viewerU").doc("tagRegistryDocs/tag1").get());
    await assertSucceeds(db("mgrU").doc("tagRegistryDocs/tag2").set({ id: "tag2", name: "جديد" }));
    await assertFails(db("viewerU").doc("tagRegistryDocs/tag3").set({ id: "tag3" }));
    await assertFails(db("salesAccU").doc("contactsDocs/c1").set({ id: "c1" }));
    await assertSucceeds(db("mgrU").doc("contactsDocs/c1").set({ id: "c1", name: "جهة" }));
  });
});

/* ───────── تقارير المطابقة (V21.21.34) ───────── */
describe("reconciliationDays — قراءة إدارية، كتابة سيرفر فقط", () => {
  it("manager يقرأ — وحتى admin لا يكتب من الـ client", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("reconciliationDays/2026-06-10").set({ ok: true, issues: [] });
    });
    await assertSucceeds(db("mgrU").doc("reconciliationDays/2026-06-10").get());
    await assertFails(db("viewerU").doc("reconciliationDays/2026-06-10").get());
    await assertFails(db("adminU").doc("reconciliationDays/2026-06-10").set({ ok: false }));
  });
});

/* ───────── منع التصعيد الذاتي (تحقيق FIX-TRACKER هـ — اتقفل V21.21.40) ─────────
   خلفية: اختبار V21.21.35 التشخيصي أظهر إن guard الـ diff() لوحده عدّى
   تعديل manager على users في المحاكي (سلوك متضارب مع التحليل الساكن).
   ملحوظة منهجية: نتيجة «admin مرفوض» في التشخيص القديم طلعت عيباً في
   التشخيص نفسه — أول اختبار كان بيستبدل خريطة users فبيمسح دور الأدمن
   لباقي الاختبارات (تلوث بيانات بين الاختبارات).
   الحل: sensitiveFieldsUnchanged() — مقارنة قيمة مباشرة مستقلة عن diff().
   الاختبارات دي بتثبت إن التصعيد مرفوض مهما كان سلوك diff(). */
describe("factory/config — حماية الحقول الحساسة (V19.64 + تحصين V21.21.40)", () => {
  it("manager يعدّل الإعدادات العادية (factoryName)", async () => {
    await assertSucceeds(db("mgrU").doc("factory/config").update({ factoryName: "اسم جديد" }));
  });

  it("viewer لا يكتب factory/config إطلاقاً", async () => {
    await assertFails(db("viewerU").doc("factory/config").update({ factoryName: "x" }));
  });

  it("V21.21.40: manager ممنوع يرقّي نفسه عبر users — حتى لو diff() اتخدع", async () => {
    await assertFails(db("mgrU").doc("factory/config").update({ users: { mgrU: "admin" } }));
  });

  it("V21.21.40: manager ممنوع يلمس permissions أو customRoles أو usersList", async () => {
    await assertFails(db("mgrU").doc("factory/config").update({ permissions: { hack: 1 } }));
    await assertFails(db("mgrU").doc("factory/config").update({ customRoles: { x: {} } }));
    await assertFails(db("mgrU").doc("factory/config").update({ usersList: [{ email: "x@x", role: "admin" }] }));
  });

  it("V21.21.40: manager ممنوع يكتب factory/roleScopes (إعادة تعريف الأدوار = تصعيد)", async () => {
    await assertFails(db("mgrU").doc("factory/roleScopes").set({ isAdmin: ["admin", "manager"] }));
  });

  it("admin يقدر يضيف مستخدماً (الصلاحية الكاملة محفوظة)", async () => {
    /* بنبعت الخريطة كاملة + إضافة — update بيستبدل الحقل كله،
       والحفاظ على الأدوار الأصلية بيمنع تلوث باقي الاختبارات */
    await assertSucceeds(db("adminU").doc("factory/config").update({
      users: {
        adminU: "admin", mgrU: "manager", salesAccU: "sales_accountant",
        purchAccU: "purchase_accountant", payrollAccU: "payroll_accountant",
        viewerU: "viewer", newU: "viewer",
      },
    }));
  });
});
