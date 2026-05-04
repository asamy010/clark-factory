/* ═══════════════════════════════════════════════════════════════
   CLARK — Size Budget (V16.0)
   
   Tracks the byte size of each major data feature with pre-defined
   budgets. Each feature has a soft warning (85%) and hard limit.
   
   Budgets tuned to keep factory/config under 500 KB total forever.
   
   Usage:
     import { analyzeBudgets, getBudgetSummary } from "./utils/sizeBudget.js";
     const report = analyzeBudgets(configDoc, salesDoc, tasksDoc);
   ═══════════════════════════════════════════════════════════════ */

/* Helpers */
const _bytes=(obj)=>obj?new Blob([JSON.stringify(obj)]).size:0;
const _fmtKB=(b)=>(b/1024).toFixed(1)+" KB";
const _fmt=(b)=>{if(b<1024)return b+" B";if(b<1024*1024)return(b/1024).toFixed(1)+" KB";return(b/(1024*1024)).toFixed(2)+" MB"};

/* Status levels based on usage percentage */
export function getStatus(pct){
  if(pct<50)return{level:"ok",color:"#10B981",icon:"🟢",label:"ممتاز"};
  if(pct<70)return{level:"good",color:"#0EA5E9",icon:"🔵",label:"جيد"};
  if(pct<85)return{level:"warn",color:"#F59E0B",icon:"🟡",label:"تحذير"};
  if(pct<100)return{level:"high",color:"#F97316",icon:"🟠",label:"مرتفع"};
  return{level:"critical",color:"#EF4444",icon:"🔴",label:"حرج"};
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE BUDGETS — Tuned for 1MB Firestore doc limit
   
   Each budget represents a soft limit. When a feature exceeds its budget,
   the dashboard recommends archiving/splitting. Hard limit = 1MB per doc.
   ═══════════════════════════════════════════════════════════════ */
export const FEATURE_BUDGETS=[
  {
    key:"treasury",
    label:"💰 الخزنة (مقسّمة يومياً)",
    docRef:"treasuryDays/*",
    budget:5_000_000,/* 5 MB موزّعة على أيام — حد عملي وليس حد ملف */
    getData:(d)=>d?.treasury||[],
    getSize:(d)=>_bytes(d?.treasury),
    getCount:(d)=>(d?.treasury||[]).length,
    advice:"V16.74: مخزّنة في collection يومية، كل يوم في document منفصل. لا تتأثر بحد الـ1MB.",
    dataType:"split",
  },
  {
    key:"hrLog",
    label:"📋 سجل HR (مقسّم يومياً)",
    docRef:"hrLogDays/*",
    budget:3_000_000,/* 3 MB موزّعة */
    getData:(d)=>d?.hrLog||[],
    getSize:(d)=>_bytes(d?.hrLog),
    getCount:(d)=>(d?.hrLog||[]).length,
    advice:"V16.74: مخزّن في hrLogDays — كل يوم لوحده.",
    dataType:"split",
  },
  {
    key:"hrWeeks",
    label:"📅 أسابيع المرتبات (مقسّم)",
    docRef:"hrWeeksDocs/*",
    budget:10_000_000,/* 10 MB موزّعة على documents — كل أسبوع document */
    getData:(d)=>d?.hrWeeks||[],
    getSize:(d)=>_bytes(d?.hrWeeks),
    getCount:(d)=>(d?.hrWeeks||[]).length,
    advice:"V16.75: كل أسبوع document منفصل في hrWeeksDocs. لا تتأثر بحد الـ1MB.",
    dataType:"partitioned",
  },
  {
    key:"auditLog",
    label:"📝 سجل الأحداث (مقسّم يومياً)",
    docRef:"auditDays/*",
    budget:5_000_000,/* 5 MB موزّعة على أيام */
    getData:(d)=>d?.auditLog||[],
    getSize:(d)=>_bytes(d?.auditLog),
    getCount:(d)=>(d?.auditLog||[]).length,
    advice:"V16.74: مخزّن في auditDays — كل يوم في document منفصل.",
    dataType:"split",
  },
  {
    key:"custPayments",
    label:"💳 مدفوعات العملاء (مقسّمة يومياً)",
    docRef:"custPaymentsDays/*",
    budget:5_000_000,/* 5 MB موزّعة على أيام */
    getData:(d)=>d?.custPayments||[],
    getSize:(d)=>_bytes(d?.custPayments),
    getCount:(d)=>(d?.custPayments||[]).length,
    advice:"V19.49: مخزّنة في custPaymentsDays — كل يوم لوحده. لا تتأثر بحد الـ1MB.",
    dataType:"split",
  },
  {
    key:"supplierPayments",
    label:"🏢 مدفوعات الموردين (مقسّمة يومياً)",
    docRef:"supplierPaymentsDays/*",
    budget:5_000_000,/* 5 MB موزّعة على أيام */
    getData:(d)=>d?.supplierPayments||[],
    getSize:(d)=>_bytes(d?.supplierPayments),
    getCount:(d)=>(d?.supplierPayments||[]).length,
    advice:"V19.49: مخزّنة في supplierPaymentsDays — كل يوم في document منفصل.",
    dataType:"split",
  },
  {
    key:"wsPayments",
    label:"🏭 دفعات الورش (مقسّمة يومياً)",
    docRef:"wsPaymentsDays/*",
    budget:5_000_000,/* 5 MB موزّعة على أيام */
    getData:(d)=>d?.wsPayments||[],
    getSize:(d)=>_bytes(d?.wsPayments),
    getCount:(d)=>(d?.wsPayments||[]).length,
    advice:"V19.49: مخزّنة في wsPaymentsDays — كل دفعة ≈ 200 بايت.",
    dataType:"split",
  },
  {
    key:"checks",
    label:"🧾 الشيكات (مقسّمة يومياً)",
    docRef:"checksDays/*",
    budget:3_000_000,/* 3 MB موزّعة على أيام */
    getData:(d)=>d?.checks||[],
    getSize:(d)=>_bytes(d?.checks),
    getCount:(d)=>(d?.checks||[]).length,
    advice:"V19.49: مخزّنة في checksDays — مستلمة + مدفوعة. كل شيك ≈ 250 بايت.",
    dataType:"split",
  },
  {
    key:"employees",
    label:"👥 الموظفين",
    docRef:"factory/config",
    budget:80_000,/* 80 KB */
    getData:(d)=>d?.employees||[],
    getSize:(d)=>_bytes(d?.employees),
    getCount:(d)=>(d?.employees||[]).length,
    advice:"ثابت نسبياً. 30 موظف ≈ 15 KB.",
    dataType:"config",
  },
  {
    key:"customers",
    label:"🧑‍💼 العملاء",
    docRef:"factory/config",
    budget:80_000,/* 80 KB */
    getData:(d)=>d?.customers||[],
    getSize:(d)=>_bytes(d?.customers),
    getCount:(d)=>(d?.customers||[]).length,
    advice:"ثابت نسبياً. كل عميل ≈ 500 بايت.",
    dataType:"config",
  },
  {
    key:"suppliers",
    label:"🏢 الموردين",
    docRef:"factory/config",
    budget:40_000,/* 40 KB */
    getData:(d)=>d?.suppliers||[],
    getSize:(d)=>_bytes(d?.suppliers),
    getCount:(d)=>(d?.suppliers||[]).length,
    advice:"ثابت نسبياً.",
    dataType:"config",
  },
  {
    key:"workshops",
    label:"🔨 الورش",
    docRef:"factory/config",
    budget:80_000,/* 80 KB */
    getData:(d)=>d?.workshops||[],
    getSize:(d)=>_bytes(d?.workshops),
    getCount:(d)=>(d?.workshops||[]).length,
    advice:"الصور ممكن تكبرها. استخدم Firebase Storage بدل base64.",
    dataType:"config",
  },
  {
    key:"empDebts",
    label:"💸 ديون الموظفين",
    docRef:"factory/config",
    budget:30_000,
    getData:(d)=>d?.empDebts||[],
    getSize:(d)=>_bytes(d?.empDebts),
    getCount:(d)=>(d?.empDebts||[]).length,
    advice:"ديون/أقساط متعثرة. احذف المغلق.",
    dataType:"config",
  },
];

/* Sales-doc features */
export const SALES_BUDGETS=[
  {
    key:"sessions",
    label:"📦 جلسات التسليم",
    docRef:"factory/sales",
    budget:500_000,/* 500 KB */
    getData:(d)=>d?.sessions||[],
    getSize:(d)=>_bytes(d?.sessions),
    getCount:(d)=>(d?.sessions||[]).length,
    advice:"جلسات التسليم اليومية. أرشف بعد 6 أشهر.",
    dataType:"sales",
  },
];

/* Tasks-doc features */
export const TASKS_BUDGETS=[
  {
    key:"tasks",
    label:"📌 المهام",
    docRef:"factory/tasks",
    budget:400_000,
    getData:(d)=>d?.tasks||[],
    getSize:(d)=>_bytes(d?.tasks),
    getCount:(d)=>(d?.tasks||[]).length,
    advice:"مهام الإنتاج والملاحظات. أرشف المكتملة.",
    dataType:"tasks",
  },
];

/* ═══════════════════════════════════════════════════════════════
   ANALYZERS
   ═══════════════════════════════════════════════════════════════ */

/* Analyze all budgets against actual data. Returns array of feature reports. */
export function analyzeBudgets(configDoc,salesDoc,tasksDoc){
  const results=[];
  const all=[
    ...FEATURE_BUDGETS.map(b=>({b,src:configDoc})),
    ...SALES_BUDGETS.map(b=>({b,src:salesDoc})),
    ...TASKS_BUDGETS.map(b=>({b,src:tasksDoc})),
  ];
  all.forEach(({b,src})=>{
    const size=b.getSize(src||{});
    const count=b.getCount(src||{});
    const pct=Math.min(999,Math.round((size/b.budget)*100));
    const status=getStatus(pct);
    const avgPerItem=count>0?Math.round(size/count):0;
    results.push({
      key:b.key,
      label:b.label,
      docRef:b.docRef,
      dataType:b.dataType,
      size,
      sizeFmt:_fmt(size),
      budget:b.budget,
      budgetFmt:_fmt(b.budget),
      pct,
      count,
      avgPerItem,
      avgPerItemFmt:_fmt(avgPerItem),
      status,
      advice:b.advice,
    });
  });
  return results.sort((a,b)=>b.pct-a.pct);
}

/* Per-document total size with context */
export function getDocTotals(configDoc,salesDoc,tasksDoc){
  const configSize=_bytes(configDoc);
  const salesSize=_bytes(salesDoc);
  const tasksSize=_bytes(tasksDoc);
  const LIMIT=1_048_576;/* 1 MB Firestore hard limit */
  return{
    config:{size:configSize,pct:Math.round((configSize/LIMIT)*100),fmt:_fmt(configSize),status:getStatus((configSize/LIMIT)*100)},
    sales:{size:salesSize,pct:Math.round((salesSize/LIMIT)*100),fmt:_fmt(salesSize),status:getStatus((salesSize/LIMIT)*100)},
    tasks:{size:tasksSize,pct:Math.round((tasksSize/LIMIT)*100),fmt:_fmt(tasksSize),status:getStatus((tasksSize/LIMIT)*100)},
    total:{size:configSize+salesSize+tasksSize,fmt:_fmt(configSize+salesSize+tasksSize)},
    limit:LIMIT,
  };
}

/* Overall summary — how many features are over budget */
export function getBudgetSummary(reports){
  const critical=reports.filter(r=>r.status.level==="critical").length;
  const high=reports.filter(r=>r.status.level==="high").length;
  const warn=reports.filter(r=>r.status.level==="warn").length;
  const ok=reports.filter(r=>r.status.level==="ok"||r.status.level==="good").length;
  let overall="ok";
  if(critical>0)overall="critical";
  else if(high>0)overall="high";
  else if(warn>0)overall="warn";
  return{critical,high,warn,ok,overall,total:reports.length};
}

/* Get top-N largest features */
export function getTopFeatures(reports,n=5){
  return[...reports].sort((a,b)=>b.size-a.size).slice(0,n);
}

/* Format utilities exported for use in UI */
export const fmt=_fmt;
export const fmtKB=_fmtKB;
export const bytes=_bytes;
