/* ═══════════════════════════════════════════════════════════════
   CLARK — Order Stock Transaction Helpers (V21.27.218 · C1 fix)

   ROOT CAUSE (من الفحص الشامل C1): ترانزاكشنات addOrder/replaceOrder/delOrder
   كانت بتقرا factory/config الخام وتنادي checkStockAvailability/
   deductStockForOrder عليه. بعد ترحيلات V19.52 (stockMovements → split) و
   V19.57 (fabrics/accessories → partitioned) الحقول دي مابقتش في المستند →
   الفحص بيعدّي دايمًا والخصم no-op صامت، مع ختم الأوردر «مخصوم» كذبًا.

   الحل: الفحص والخصم بيتعملوا على المستندات المنفصلة نفسها جوه نفس
   الترانزاكشن الذرّية:
     fabricsDocs/{id} · accessoriesDocs/{id} · stockMovementsDays/{YYYY-MM-DD}
   القراءة (txReadStockDocs) بتجيب بس الأصناف اللي الأوردر محتاجها → بنبني
   draft صغير → دوال المنطق النقية الموجودة (checkStockAvailability/
   deductStockForOrder) بتشتغل عليه من غير أي تعديل في عقودها → الكتابة
   (txWriteStockDocs) بترجّع المستندات المتغيّرة + حركات اليوم. الأوردر بيتكتب
   في نفس الترانزاكشن → «صارم» بمعناه الحقيقي: الأوردر والمخزون يتحفظوا معًا
   أو ولا حاجة، والـ TOCTOU مقفول على مستوى مستندات الأصناف نفسها (مش config).

   ملاحظة معمارية: مفيش قراءة/كتابة لـ factory/config هنا خالص — بيوفّر
   contention على أكبر مستند في النظام وبيمنع إعادة حقن المصفوفات المقصوصة
   (الـ bonus invariant break اللي الفحص لقاه في orders.js:436).
   ═══════════════════════════════════════════════════════════════ */

import { doc } from "firebase/firestore";
import { calcStockNeeded } from "./orders.js";
import { r2 } from "./format.js";

/* أسماء الـ collections — ثابتة من registries الترحيل (V19.52/V19.57) */
const FABRICS_COLL = "fabricsDocs";
const ACCESSORIES_COLL = "accessoriesDocs";
const MOVEMENTS_DAYS_COLL = "stockMovementsDays";

/* اتحاد معرّفات الأصناف اللي العملية هتلمسها: المطلوب الجديد + snapshot الخصم
   السابق (للـ delta/الإرجاع) + المخصوم فعليًا (للاسترداد عند الحذف). */
export function collectStockIds(order){
  const needed = calcStockNeeded(order);
  const prev = (order && order._stockDeducted) || {};
  const actual = (order && order._stockDeductedActual) || {};
  const uniq = (...objs)=>[...new Set(objs.flatMap(o=>Object.keys(o||{})))];
  return {
    fabricIds: uniq(needed.fabrics, prev.fabrics, actual.fabrics),
    accessoryIds: uniq(needed.accessories, prev.accessories, actual.accessories),
  };
}

/* التاريخ المحلي (نفس اللي deductStockForOrder بيستخدمه) */
export function stockTxToday(){
  return new Date().toISOString().split("T")[0];
}

/* Phase 1 — قراءات (لازم كلها قبل أي كتابة في ترانزاكشن Firestore).
   بيرجّع ctx فيه المستندات المقروءة + refs الكتابة + نسخ أصلية للمقارنة. */
export async function txReadStockDocs(tx, db, ids, today){
  const fabRefs = {}, accRefs = {};
  ids.fabricIds.forEach(id=>{ fabRefs[id] = doc(db, FABRICS_COLL, String(id)); });
  ids.accessoryIds.forEach(id=>{ accRefs[id] = doc(db, ACCESSORIES_COLL, String(id)); });
  const dayRef = doc(db, MOVEMENTS_DAYS_COLL, today);
  const [fabSnaps, accSnaps, daySnap] = await Promise.all([
    Promise.all(ids.fabricIds.map(id=>tx.get(fabRefs[id]))),
    Promise.all(ids.accessoryIds.map(id=>tx.get(accRefs[id]))),
    tx.get(dayRef),
  ]);
  const fabrics = [], accessories = [];
  const before = {};/* id → {stock, avgCost} للمقارنة (نكتب المتغيّر بس) */
  fabSnaps.forEach(s=>{
    if(!s.exists())return;/* صنف اتحذف — بيتتخطّى زي سلوك findIndex<0 */
    const d = { ...s.data() };
    if(d.id==null)d.id = s.id;/* دفاعي — doc id هو الـ item id */
    fabrics.push(d);
    before["f:"+String(d.id)] = { stock: Number(d.stock)||0, avgCost: Number(d.avgCost)||0 };
  });
  accSnaps.forEach(s=>{
    if(!s.exists())return;
    const d = { ...s.data() };
    if(d.id==null)d.id = s.id;
    accessories.push(d);
    before["a:"+String(d.id)] = { stock: Number(d.stock)||0, avgCost: Number(d.avgCost)||0 };
  });
  const dayData = daySnap.exists() ? daySnap.data() : null;
  const dayEntries = (dayData && Array.isArray(dayData.entries)) ? dayData.entries : [];
  return { fabRefs, accRefs, dayRef, fabrics, accessories, dayEntries, before, today };
}

/* Phase 2 — كتابات: المستندات اللي رصيدها/تكلفتها اتغيّرت + حركات اليوم.
   draft = {fabrics, accessories, stockMovements} بعد ما دوال المنطق اشتغلت عليه. */
export function txWriteStockDocs(tx, ctx, draft){
  let wrote = 0;
  (draft.fabrics||[]).forEach(f=>{
    const key = "f:"+String(f.id);
    const b = ctx.before[key];
    if(!b)return;/* صنف مش من قراءتنا — ماينفعش يتكتب في الترانزاكشن دي */
    if(r2(Number(f.stock)||0)===r2(b.stock)&&r2(Number(f.avgCost)||0)===r2(b.avgCost))return;
    tx.set(ctx.fabRefs[String(f.id)], f);
    wrote++;
  });
  (draft.accessories||[]).forEach(a=>{
    const key = "a:"+String(a.id);
    const b = ctx.before[key];
    if(!b)return;
    if(r2(Number(a.stock)||0)===r2(b.stock)&&r2(Number(a.avgCost)||0)===r2(b.avgCost))return;
    tx.set(ctx.accRefs[String(a.id)], a);
    wrote++;
  });
  const moves = draft.stockMovements||[];
  if(moves.length){
    /* كل الحركات بتتختم بتاريخ اليوم المقروء — عشان تنزل في نفس الـ day doc
       اللي الترانزاكشن قرأته (أمان حافة منتصف الليل). */
    const stamped = moves.map(m=>({ ...m, date: ctx.today }));
    tx.set(ctx.dayRef, { entries: [...ctx.dayEntries, ...stamped] });
    wrote++;
  }
  return wrote;
}
