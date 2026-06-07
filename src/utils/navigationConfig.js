/* ═══════════════════════════════════════════════════════════════════════
   CLARK · navigationConfig (V21.9.155 — Mobile Redesign Phase A)
   ───────────────────────────────────────────────────────────────────────
   Central source-of-truth لـ الـ bottom navigation على mobile.

   3 exports:
     1. BOTTOM_TABS — الـ 5 high-level tabs (الرئيسية / المبيعات / المخزون
        / المالية / المزيد).
     2. TAB_SUBVIEWS — sub-views per tab: كل واحدة بـ id + label + الـ key
        الـ existing tab في PERMISSION_TABS اللي بـ تفتح.
     3. FAB_ACTIONS — الـ 5 quick actions في الـ FAB menu (per V21.9.154
        audit decisions).

   Design philosophy (per audit V21.9.154):
   - الـ bottom nav إضافة على الـ mobile فقط — الـ desktop home (4-column,
     V21.9.142-148) يفضل لا تغيير.
   - الـ sub-views بـ تـ map لـ الـ existing PERMISSION_TABS keys → ما نـ
     duplicate-ش الـ pages؛ بـ نـ navigate الـ existing `tab` state.
   - الـ permissions: لو user مش له أي sub-view في tab → الـ tab نفسه يـ
     hide من الـ bottom bar.
   - الـ tab الـ default sub-view = الأول الـ user له canViewTab له (مش
     hardcoded — يتم تحديده بـ runtime).
   ═══════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────
   الـ 4 tabs الرئيسية في الـ bottom nav (V21.9.157: 5→4).
   الـ FAB يـ sit في النص بين tab #2 (sales) و tab #3 (finance).

   "المخزون" tab اتـ removed — items (details/warehouse/external/pieces)
   اتـ moved لـ "المزيد" tab بدلاً منها. السبب: per user feedback، الـ
   mobile experience مطلوب يكون simpler — 4 categories أوضح من 5.
   ──────────────────────────────────────────────────────────── */
export const BOTTOM_TABS = [
  { id: "home",    label: "الرئيسية", icon: "🏠" },
  { id: "sales",   label: "المبيعات",  icon: "🧾" },
  /* FAB goes here visually (centered) */
  { id: "finance", label: "المالية",   icon: "💰" },
  { id: "more",    label: "المزيد",    icon: "☰" },
];

/* ────────────────────────────────────────────────────────────
   Sub-views per tab.
   كل sub-view بـ `tabKey` = key في PERMISSION_TABS — الـ same value
   اللي بـ يـ pass لـ setTab() عشان الـ existing render switch يـ
   match-ـه (مثلاً tab === "treasury" → TreasuryPg).

   ملاحظات:
   - "home" مفيش sub-views (single dashboard view + الـ tasks panel
     جزء من الـ home نفسه بعد V21.9.134).
   - "more" مفيش sub-views — بـ يـ render MoreMenuPage بدلاً منها (vertical list).
   - الـ sub-views مرتبة بـ priority — الأول = default.
   ──────────────────────────────────────────────────────────── */
export const TAB_SUBVIEWS = {
  home: [
    /* الـ home الـ existing layout بـ tiles + notes + tasks. تـ render
       بدون chips لأنه view واحد. */
    { id: "dashboard", label: "الرئيسية", tabKey: "home" },
  ],
  sales: [
    { id: "custDeliver",     label: "مبيعات",        tabKey: "custDeliver" },
    { id: "salesQuotations", label: "عروض الأسعار",  tabKey: "salesQuotations" },
    { id: "salesOrders",     label: "أوامر البيع",   tabKey: "salesOrders" },
    { id: "salesInvoices",   label: "فواتير",        tabKey: "salesInvoices" },
    { id: "creditNotes",     label: "إشعارات دائنة", tabKey: "creditNotes" },
    { id: "shopify",        label: "Shopify",       tabKey: "shopify",
      /* shopify يـ hide تلقائياً لو غير enabled — checked in App.jsx */
      requiresShopify: true },
  ],
  /* V21.9.157: "inventory" tab removed. The 4 keys below moved to "more"
     (see TAB_SUBVIEWS.more). Kept as commented placeholder in case the
     user wants to restore the dedicated tab later. */
  /* inventory: [details, warehouse, external, pieces], */
  finance: [
    { id: "treasury",          label: "الخزنة",            tabKey: "treasury" },
    { id: "purchase",          label: "مشتريات",           tabKey: "purchase" },
    { id: "purchaseInvoices",  label: "فواتير المشتريات",   tabKey: "purchaseInvoices" },
    { id: "debitNotes",        label: "إشعارات مدينة",      tabKey: "debitNotes" },
    { id: "accounting",        label: "محاسبة",            tabKey: "accounting" },
    { id: "fixedAssets",       label: "أصول ثابتة",         tabKey: "fixedAssets" },
  ],
  /* "more" — vertical menu page بدل chips.
     V21.9.157: ضم الـ inventory items (details / warehouse / external / pieces)
     لأنهم كانوا في tab منفصل اتـ remove. الترتيب: الإنتاج أولاً (الأكثر استخداماً
     في الفاكتوري daily) → ثم business → ثم admin. */
  more: [
    /* ─── إنتاج (formerly inventory tab) ─── */
    { id: "details",    label: "التصنيع",      tabKey: "details",    icon: "✂️" },
    { id: "warehouse",  label: "المخازن",         tabKey: "warehouse",  icon: "📦" },
    { id: "external",   label: "تشغيل خارجي",     tabKey: "external",   icon: "🏗️" },
    { id: "pieces",     label: "تتبع القطع",      tabKey: "pieces",     icon: "🔍" },
    /* ─── business ─── */
    { id: "contacts",   label: "جهات الاتصال",     tabKey: "contacts",   icon: "👥" },
    { id: "hr",         label: "مرتبات + موظفين",  tabKey: "hr",         icon: "🧑‍💼" },
    { id: "reports",    label: "التقارير",          tabKey: "reports",    icon: "📑" },
    { id: "campaigns",  label: "الحملات والرسائل",  tabKey: "campaigns",  icon: "📣" },
    { id: "automation", label: "Automation",        tabKey: "automation", icon: "🤖" },
    { id: "aiAgent",    label: "AI Agent",          tabKey: "aiAgent",    icon: "🤖" },
    { id: "db",         label: "قاعدة البيانات",    tabKey: "db",         icon: "🗃️" },
    { id: "documents",  label: "المستندات",         tabKey: "documents",  icon: "📁" },
    { id: "tasks",      label: "المهام",            tabKey: "tasks",      icon: "✅" },
    /* ─── admin ─── */
    { id: "audit",      label: "سجل التدقيق",       tabKey: "audit",      icon: "🔍" },
    { id: "settings",   label: "الإعدادات",          tabKey: "settings",   icon: "⚙️" },
  ],
};

/* ────────────────────────────────────────────────────────────
   FAB Actions — 5 quick actions per V21.9.154 audit.
   كل action له `kind` يحدد إيه يحصل لما الـ user يضغط — App.jsx
   بـ يقرأ الـ kind ويـ dispatch للـ handler الصح.
   ──────────────────────────────────────────────────────────── */
export const FAB_ACTIONS = [
  {
    id: "invoice",
    label: "فاتورة بيع",
    icon: "🧾",
    color: "#0369a1",
    kind: "navigateAndAction",
    targetTab: "salesInvoices",
    /* App.jsx بـ يـ navigate ثم يـ dispatch event للـ SalesInvoicesPg لفتح
       new-invoice form. */
    action: "newInvoice",
  },
  {
    id: "treasury",
    label: "حركة خزنة",
    icon: "💵",
    color: "#dc2626",
    kind: "navigateAndAction",
    targetTab: "treasury",
    action: "newEntry",
  },
  {
    id: "contact",
    label: "جهة اتصال",
    icon: "👥",
    color: "#DB2777",
    kind: "navigateAndAction",
    targetTab: "contacts",
    action: "newContact",
  },
  {
    id: "task",
    label: "مهمة جديدة",
    icon: "✅",
    color: "#F59E0B",
    /* الـ QuickPopup الموجود في App.jsx — `quickPopup` state */
    kind: "openQuickPopup",
    mode: "task",
  },
  {
    id: "notif",
    label: "إرسال إشعار",
    icon: "📩",
    color: "#8B5CF6",
    kind: "openQuickPopup",
    mode: "notif",
  },
];

/* ────────────────────────────────────────────────────────────
   Helper: determine الـ bottom-tab الحالي من الـ current `tab` value.
   مفيد لـ highlighting الـ active bottom tab لما الـ user يـ navigate
   عن طريق طريقة تانية (مثلاً deep-link من notification).

   Returns "home" if no match (e.g. غير معروف tab).
   ──────────────────────────────────────────────────────────── */
export function bottomTabFromTabKey(tabKey) {
  if (!tabKey || tabKey === "home") return "home";
  if (tabKey === "sales") return "sales"; // V21.11.0: مفتاح الهَب المجمّع
  if (tabKey === "purchases") return "finance"; // V21.12.0: هَب المشتريات
  for (const bottomId of Object.keys(TAB_SUBVIEWS)) {
    const subviews = TAB_SUBVIEWS[bottomId];
    if (subviews.some(sv => sv.tabKey === tabKey)) return bottomId;
  }
  return "home";
}

/* ────────────────────────────────────────────────────────────
   Helper: get الـ visible sub-views لـ tab (after permission filter).
   `canViewTab` is the function from App.jsx (canViewPermFromRegistry).
   `flags` = { shopifyEnabled: boolean } for conditional gating.

   Returns array of sub-view objects the user can actually access.
   Empty array → الـ tab نفسه should hide from the bottom bar.
   ──────────────────────────────────────────────────────────── */
export function visibleSubViews(bottomTabId, canViewTab, flags) {
  const list = TAB_SUBVIEWS[bottomTabId] || [];
  return list.filter(sv => {
    if (!canViewTab(sv.tabKey)) return false;
    /* Shopify gate (per V21.9.154 audit) */
    if (sv.requiresShopify && flags?.shopifyEnabled === false) return false;
    return true;
  });
}
