/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Default Chart of Accounts
   ───────────────────────────────────────────────────────────────────────
   Seed for a typical Egyptian garment factory. Used when the user clicks
   "📥 شجرة افتراضية" in the CoA tab.

   Convention:
   - 4-digit codes; first digit = type (1=asset, 2=liability, ...).
   - Parents are referenced by code (resolved to id at seed time).
   - System accounts (system:true) cannot be deleted.

   Each entry: { code, name, type, parentCode, isLeaf, system }
   ═══════════════════════════════════════════════════════════════════════ */

export const DEFAULT_COA = [
  /* ═══ 1000 الأصول ═══ */
  {code:"1000", name:"الأصول",                type:"asset",     parentCode:null,   isLeaf:false, system:true},
  {code:"1100", name:"النقدية والبنوك",       type:"asset",     parentCode:"1000", isLeaf:false, system:true},
  {code:"1110", name:"الخزينة الرئيسية",      type:"asset",     parentCode:"1100", isLeaf:true,  system:true},/* fallback for unmapped cash; user creates subaccounts 1111+ for specific cash boxes */
  {code:"1120", name:"البنوك",                type:"asset",     parentCode:"1100", isLeaf:true,  system:false},/* fallback for unmapped bank; user creates 1121+ for specific banks */
  {code:"1130", name:"شيكات تحت التحصيل",     type:"asset",     parentCode:"1100", isLeaf:true,  system:true},
  {code:"1200", name:"المدينون",              type:"asset",     parentCode:"1000", isLeaf:false, system:true},
  {code:"1210", name:"عملاء",                 type:"asset",     parentCode:"1200", isLeaf:true,  system:true},
  {code:"1220", name:"سلف موظفين",            type:"asset",     parentCode:"1200", isLeaf:true,  system:false},
  {code:"1300", name:"المخزون",               type:"asset",     parentCode:"1000", isLeaf:false, system:true},
  {code:"1310", name:"مخزون خامات",          type:"asset",     parentCode:"1300", isLeaf:true,  system:false},
  {code:"1320", name:"مخزون منتج تام",       type:"asset",     parentCode:"1300", isLeaf:true,  system:false},
  {code:"1330", name:"مخزون تحت التشغيل",    type:"asset",     parentCode:"1300", isLeaf:true,  system:false},
  {code:"1400", name:"الأصول الثابتة",        type:"asset",     parentCode:"1000", isLeaf:false, system:true},
  {code:"1410", name:"معدات وآلات",          type:"asset",     parentCode:"1400", isLeaf:true,  system:false},
  {code:"1420", name:"أثاث ومفروشات",        type:"asset",     parentCode:"1400", isLeaf:true,  system:false},
  {code:"1430", name:"كمبيوترات وأجهزة",     type:"asset",     parentCode:"1400", isLeaf:true,  system:false},/* V18.67 */
  {code:"1440", name:"وسائل نقل (عربيات)",   type:"asset",     parentCode:"1400", isLeaf:true,  system:false},/* V18.67 */
  {code:"1450", name:"تحسينات على المأجور",  type:"asset",     parentCode:"1400", isLeaf:true,  system:false},/* V18.67 */
  {code:"1490", name:"(−) مجمع الإهلاك",      type:"asset",     parentCode:"1400", isLeaf:true,  system:true}, /* V18.67 contra-asset */

  /* ═══ 2000 الخصوم ═══ */
  {code:"2000", name:"الخصوم",                type:"liability", parentCode:null,   isLeaf:false, system:true},
  {code:"2100", name:"الدائنون",              type:"liability", parentCode:"2000", isLeaf:false, system:true},
  {code:"2110", name:"موردون خامات",         type:"liability", parentCode:"2100", isLeaf:true,  system:false},
  {code:"2120", name:"ورش خارجية",           type:"liability", parentCode:"2100", isLeaf:true,  system:true},
  {code:"2130", name:"أجور مستحقة",          type:"liability", parentCode:"2100", isLeaf:true,  system:true},
  {code:"2200", name:"شيكات الدفع",           type:"liability", parentCode:"2000", isLeaf:true,  system:true},
  {code:"2300", name:"قروض",                 type:"liability", parentCode:"2000", isLeaf:false, system:false},
  {code:"2310", name:"قروض قصيرة الأجل",    type:"liability", parentCode:"2300", isLeaf:true,  system:false},

  /* ═══ 3000 حقوق الملكية ═══ */
  {code:"3000", name:"حقوق الملكية",          type:"equity",    parentCode:null,   isLeaf:false, system:true},
  {code:"3100", name:"رأس المال",            type:"equity",    parentCode:"3000", isLeaf:true,  system:true},
  {code:"3200", name:"أرباح محتجزة",         type:"equity",    parentCode:"3000", isLeaf:true,  system:true},
  {code:"3300", name:"المسحوبات",            type:"equity",    parentCode:"3000", isLeaf:true,  system:false},

  /* ═══ 4000 الإيرادات ═══ */
  {code:"4000", name:"الإيرادات",             type:"revenue",   parentCode:null,   isLeaf:false, system:true},
  {code:"4100", name:"إيرادات المبيعات",     type:"revenue",   parentCode:"4000", isLeaf:true,  system:true},
  {code:"4110", name:"خصم مسموح به",         type:"revenue",   parentCode:"4000", isLeaf:true,  system:true},/* contra-revenue */
  {code:"4120", name:"مرتجع مبيعات",         type:"revenue",   parentCode:"4000", isLeaf:true,  system:true},/* contra-revenue */
  {code:"4900", name:"إيرادات أخرى",         type:"revenue",   parentCode:"4000", isLeaf:true,  system:false},
  {code:"4910", name:"فرق صرف عملة (مكاسب)", type:"revenue",   parentCode:"4000", isLeaf:true,  system:true},/* V18.41 — FX gain */
  {code:"4920", name:"ربح بيع أصول ثابتة",   type:"revenue",   parentCode:"4000", isLeaf:true,  system:true},/* V18.67 */

  /* ═══ 5000 المصروفات ═══ */
  {code:"5000", name:"المصروفات",             type:"expense",   parentCode:null,   isLeaf:false, system:true},
  {code:"5100", name:"تكلفة البضاعة المباعة", type:"expense",  parentCode:"5000", isLeaf:false, system:false},
  {code:"5110", name:"تكلفة الخامات",        type:"expense",   parentCode:"5100", isLeaf:true,  system:false},
  {code:"5120", name:"أجور تشغيل خارجي",    type:"expense",   parentCode:"5100", isLeaf:true,  system:true},
  {code:"5130", name:"تكلفة البضاعة المباعة (مبيعات)", type:"expense", parentCode:"5100", isLeaf:true, system:true},/* used by sale-COGS auto-post */
  {code:"5200", name:"الأجور والمرتبات",     type:"expense",   parentCode:"5000", isLeaf:false, system:true},
  {code:"5210", name:"رواتب ثابتة",          type:"expense",   parentCode:"5200", isLeaf:true,  system:true},
  {code:"5220", name:"حوافز وعمولات",        type:"expense",   parentCode:"5200", isLeaf:true,  system:false},
  {code:"5230", name:"مكافآت",               type:"expense",   parentCode:"5200", isLeaf:true,  system:false},
  {code:"5300", name:"المصروفات الإدارية",   type:"expense",   parentCode:"5000", isLeaf:false, system:false},
  {code:"5310", name:"إيجار",                type:"expense",   parentCode:"5300", isLeaf:true,  system:false},
  {code:"5320", name:"كهرباء وماء",          type:"expense",   parentCode:"5300", isLeaf:true,  system:false},
  {code:"5330", name:"اتصالات وإنترنت",     type:"expense",   parentCode:"5300", isLeaf:true,  system:false},
  {code:"5340", name:"نقل ومواصلات",        type:"expense",   parentCode:"5300", isLeaf:true,  system:false},
  {code:"5350", name:"صيانة",                type:"expense",   parentCode:"5300", isLeaf:true,  system:false},
  {code:"5390", name:"مصروفات إدارية أخرى", type:"expense",    parentCode:"5300", isLeaf:true,  system:false},
  {code:"5400", name:"الإهلاكات",             type:"expense",   parentCode:"5000", isLeaf:false, system:true},/* V18.67 */
  {code:"5410", name:"مصروف الإهلاك",         type:"expense",   parentCode:"5400", isLeaf:true,  system:true},/* V18.67 */
  {code:"5420", name:"خسارة بيع/تخلص من أصول ثابتة", type:"expense", parentCode:"5400", isLeaf:true, system:true},/* V18.67 */
  {code:"5910", name:"فرق صرف عملة (خسائر)", type:"expense",   parentCode:"5000", isLeaf:true,  system:true},/* V18.41 — FX loss */
];

/* Default mapping rules: which CoA codes should be used by the auto-posting
   engine for each operation type. The user can override these in
   Accounting Settings; we lookup by code at posting time so renames are safe. */
export const DEFAULT_POSTING_RULES = {
  /* Sales: customer delivery confirmed
     Dr عملاء (1210)              <amount before discount>
       Cr إيرادات المبيعات (4100)
     If discount > 0:
       Dr خصم مسموح به (4110)     <discount>
         Cr عملاء (1210) [reduce] */
  sale:               {customerAccount:"1210", revenueAccount:"4100", discountAccount:"4110"},
  /* Customer return: customer delivery reversed/returned
     Dr مرتجع مبيعات (4120)       <amount>
       Cr عملاء (1210) */
  saleReturn:         {customerAccount:"1210", returnAccount:"4120"},
  /* V18.40 — COGS on sale: shift the goods' cost from inventory to expense.
     Dr تكلفة البضاعة المباعة (5130)  <qty × unitCost>
       Cr مخزون منتج تام (1320)
     Posted alongside the sale entry. Skipped when unit cost = 0. */
  saleCogs:           {cogsAccount:"5130", finishedAccount:"1320"},
  /* V18.40 — COGS reversal on return: bring goods back into inventory.
     Dr مخزون منتج تام (1320)         <qty × unitCost>
       Cr تكلفة البضاعة المباعة (5130) */
  saleReturnCogs:     {finishedAccount:"1320", cogsAccount:"5130"},
  /* Customer payment: cash/transfer
     Dr الخزينة (1110) أو البنوك  <amount>
       Cr عملاء (1210) */
  customerPayCash:    {cashAccount:"1110", customerAccount:"1210"},
  customerPayTransfer:{bankAccount:"1120",  customerAccount:"1210"},
  /* Customer check received (post-dated)
     Dr شيكات تحت التحصيل (1130)
       Cr عملاء (1210)
     When the check is collected:
       Dr الخزينة/البنوك
         Cr شيكات تحت التحصيل */
  customerCheck:      {checksReceivableAccount:"1130", customerAccount:"1210"},
  customerCheckCollect:{cashAccount:"1110", checksReceivableAccount:"1130"},
  /* Workshop deliver to: increase WIP, no cash effect
     Dr مخزون تحت التشغيل (1330)
       Cr ورش خارجية (2120) [if priced]
     If unpriced (factory still tracking pieces): no entry, just stock movement. */
  workshopDeliver:    {wipAccount:"1330", workshopAccount:"2120"},
  /* Workshop receive: pieces back; recognize labor cost
     Dr مخزون منتج تام (1320)     <pieces × cost>
       Cr مخزون تحت التشغيل (1330) */
  workshopReceive:    {finishedAccount:"1320", wipAccount:"1330"},
  /* Workshop payment to ws (cash out)
     Dr ورش خارجية (2120)         <amount>
       Cr الخزينة (1110) */
  workshopPay:        {workshopAccount:"2120", cashAccount:"1110"},
  /* Workshop purchase (we paid them for materials they bought for us)
     Dr مخزون خامات (1310)        <amount>
       Cr الخزينة (1110) */
  workshopPurchase:   {materialsAccount:"1310", cashAccount:"1110"},
  /* HR: salary payment
     Dr رواتب ثابتة (5210)        <amount>
       Cr الخزينة (1110) */
  hrSalary:           {salaryAccount:"5210", cashAccount:"1110"},
  /* HR: bonus / advance
     Dr مكافآت (5230)             <amount>
       Cr الخزينة (1110) */
  hrBonus:            {bonusAccount:"5230", cashAccount:"1110"},
  /* HR: advance to employee
     Dr سلف موظفين (1220)         <amount>
       Cr الخزينة (1110) */
  hrAdvance:          {advanceAccount:"1220", cashAccount:"1110"},
  /* Generic treasury expense (when category doesn't match anything specific)
     Dr مصروفات إدارية أخرى (5390) <amount>
       Cr الخزينة (1110) */
  treasuryExpense:    {expenseAccount:"5390", cashAccount:"1110"},
  /* Generic treasury income
     Dr الخزينة (1110)
       Cr إيرادات أخرى (4900) */
  treasuryIncome:     {cashAccount:"1110", incomeAccount:"4900"},
  /* V18.41 — FX gain/loss accounts (used when settling foreign-currency
     payments where the rate has changed since the original transaction). */
  fxGainLoss:         {gainAccount:"4910", lossAccount:"5910"},
};

/* Map treasury category strings to specific posting rules so users can
   refine which expense account each category goes to. */
export const DEFAULT_CATEGORY_MAP = {
  "إيجار":               "5310",
  "كهرباء وماء":         "5320",
  "اتصالات وإنترنت":     "5330",
  "نقل ومواصلات":        "5340",
  "صيانة":               "5350",
  "مشتريات خامات":       "1310",
  "تشغيل خارجي":         "5120",
  "رواتب":               "5210",
  "حوافز":               "5220",
  "مكافآت":              "5230",
  "سلف":                 "1220",
  "أخرى":                "5390",
};
