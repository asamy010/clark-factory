/* ════════════════════════════════════════════════════════════════════════
   CLARK → Supabase — Collections Manifest (single source of truth)
   ════════════════════════════════════════════════════════════════════════
   مشتق حرفياً من البنية الحالية:
     - src/utils/splitCollections.js  (daily splits)
     - src/utils/partitionedCollections.js (per-id splits)
     - firestore.rules (المستندات المركزية + الأرشيف + الموسم)

   السكريبت `scripts/migrate-from-firestore.mjs` + `supabase/schema.sql`
   الاتنين بيقروا من المانيفست ده. لو ضفت collection جديدة في CLARK،
   ضيفها هنا في المكان الصح وكل حاجة تتولّد تلقائياً.

   ⚠️ القاعدة: المانيفست ده لازم يفضل متطابق مع الـ maps في الكود الأصلي.
   أي drift = داتا بتتنقل ناقصة في الـ migration.
   ════════════════════════════════════════════════════════════════════════ */

/* المستندات المركزية (factory/* + غيرها من single-docs) → جدول app_docs.
   كل واحد صف واحد بـ doc_key + JSONB data. */
export const CENTRAL_DOCS = [
  { firestore: "factory/config",     key: "config" },
  { firestore: "factory/sales",      key: "sales" },
  { firestore: "factory/tasks",      key: "tasks" },
  { firestore: "factory/roleScopes", key: "roleScopes" },
];

/* المجموعات اليومية { entries: [...] } بمفتاح يوم YYYY-MM-DD → جدول day_docs.
   القيم هي أسماء الـ Firestore collections (values من SPLIT_COLLECTIONS +
   SALES_SPLIT_COLLECTIONS + TASKS_SPLIT_COLLECTIONS) + accountingDays/
   reconciliationDays من dayDoc.js/_reconcileChecks. */
export const DAY_COLLECTIONS = [
  // SPLIT_COLLECTIONS (splitCollections.js)
  "treasuryDays", "auditDays", "hrLogDays",
  "custPaymentsDays", "supplierPaymentsDays", "wsPaymentsDays", "checksDays",
  "salesInvoicesDays", "purchaseInvoicesDays", "purchaseOrdersDays",
  "stockMovementsDays", "purchaseReceiptsDays", "treasuryTransfersDays", "salesAuditsDays",
  "notificationsDays",
  "salesCreditNotesDays", "purchaseDebitNotesDays",
  "shopifyReturnRequestsDays",
  "whatsappCampaignsDays", "whatsappCampaignRunsDays",
  "shopifyOrdersDays",
  "salesQuotationsDays", "salesOrdersDays",
  "purchaseRfqsDays",
  // factory/sales + factory/tasks splits
  "packagesDays", "custDeliverySessionsDays",
  "tasksDays", "stickyNotesDays", "inventoryAuditsDays",
  // accounting (dayDoc.js) + reconciliation (_reconcileChecks)
  "accountingDays", "reconciliationDays",
];

/* المجموعات per-id (object كامل لكل مستند، له .id) → جدول entity_docs.
   القيم من PARTITIONED_COLLECTIONS + fixedAssets + userNotifStates(email key). */
export const ENTITY_COLLECTIONS = [
  // PARTITIONED_COLLECTIONS (partitionedCollections.js)
  "hrWeeksDocs",
  "customersDocs", "suppliersDocs", "workshopsDocs", "employeesDocs",
  "empDebtsDocs", "generalProductsDocs", "fabricsDocs", "accessoriesDocs",
  "shopifyProductsDocs", "shopifyCustomersDocs",
  "recurringTreasuryDocs",
  "tagRegistryDocs", "contactsDocs",
  // single-doc-per-id collections من الـ rules
  "fixedAssets",        // key = assetId
  "userNotifStates",    // key = email
  "models",             // key = modelId
];

/* الأرشيف الشهري { ... } بمفتاح شهر YYYY-MM → جدول archive_docs. */
export const ARCHIVE_COLLECTIONS = [
  "shopifyOrdersArchive",   // key = month
  "bostaDeliveriesArchive", // key = month
];

/* الموسم: seasons/{season}/orders/{orderId} — subcollection.
   ده النمط الوحيد المتداخل (nested). بيتنقل لجدول orders بعمود season. */
export const SEASON_ORDERS = {
  parent: "seasons",
  sub: "orders",
};

/* مجموعات تشغيلية مش بيانات أعمال (backups/migrationLog) — اختياري نقلها.
   backups كبيرة جداً وممكن نتخطّاها في النسخة الاختبارية (skipByDefault). */
export const OPERATIONAL_COLLECTIONS = [
  { name: "migrationLog", skipByDefault: false },
  { name: "backups",      skipByDefault: true  }, // ضخمة — تخطّاها في الاختبار
  { name: "syncJobs",     skipByDefault: true  }, // ephemeral progress docs
];

/* أدوار الصلاحيات في CLARK (من firestore.rules helpers) — تُستخدم لتوليد
   دوال RLS مكافئة في Postgres. مرجع فقط — التنفيذ في schema.sql. */
export const ROLE_HELPERS = [
  "isAnyUser", "isManagerPlus", "isHRRole", "isOwner", "isAdmin",
];
