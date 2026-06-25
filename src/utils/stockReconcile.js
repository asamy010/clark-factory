/* ═══════════════════════════════════════════════════════════════════════
   CLARK · stockReconcile (V21.27.131)
   ───────────────────────────────────────────────────────────────────────
   أداة «مطابقة المخزون» — بتكتشف حالتين بتخلّي رصيد الصنف غلط:

   1) حركات يتيمة (orphan movements): حركة مخزن (in/out/opening/adjust) الـ
      itemId بتاعها مش بيطابق أي صنف حالي (قماش/إكسسوار/منتج عام/صنف مخزني).
      ده بيحصل لما صنف يتحذف (soft-delete بيشيله من القائمة بس بيسيب حركاته)
      ويتعاد إنشاؤه بـ id جديد، أو لما الاستلام اتسجّل لـ id قديم. النتيجة:
      كميات «طايرة» مش بتتجمّع على أي صنف معروض → الرصيد بيبان ناقص (TEST بان
      50 وهو المفروض يجمّع مشترياته).

      ⚠️ ملاحظة مهمة: الرصيد (computeStockNetMap) بيتجمّع بالـ itemId **بس** —
      الـ itemType مالوش دخل بالحساب. فالكشف بالـ itemId هو الصح. بنستبعد
      حركات الجاهز (itemType:"order") والخدمات (itemType:"service") لأنها مش
      أصناف مخزون.

   2) درِفت الرصيد المخزّن (stored drift): صنف له حركات، لكن item.stock
      المخزّن مختلف عن صافي الحركات (الـ ledger). العرض في المخزن بيستخدم صافي
      الحركات أصلاً (netStockOf) فالدرِفت مش بيأثر على العرض، لكن أكواد تانية
      بتقرا item.stock مباشرة (applyStockDelta للمتوسط المرجّح، تقييم المخزون)
      فالأنضف إن المخزّن يساوي الـ ledger.

   كله pure — آمن للاختبار والاستيراد في أي مكان (مفيش side effects).
   ═══════════════════════════════════════════════════════════════════════ */

import { computeStockNetMap } from "./stockLedger.js";
import { r2 } from "./format.js";

/* itemTypes في الحركات اللي مش أصناف مخزون لها رصيد قابل للمطابقة. */
const NON_STOCK_TYPES = new Set(["order", "service"]);

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

/* كل أصناف المخزون الحالية (الأربع قوائم) في شكل موحّد للفهرسة والربط.
   _listKey = اسم المصفوفة في data عشان الـ mutation يعرف يحدّث فين. */
export function getAllStockItems(data) {
  const out = [];
  (data.fabrics || []).forEach(f => out.push({ id: f.id, name: f.name || "", unit: f.unit || "", stock: Number(f.stock) || 0, _cat: "fabric", _listKey: "fabrics", _label: "خامة" }));
  (data.accessories || []).forEach(a => out.push({ id: a.id, name: a.name || "", unit: a.unit || "", stock: Number(a.stock) || 0, _cat: "accessory", _listKey: "accessories", _label: "إكسسوار" }));
  (data.generalProducts || []).forEach(g => out.push({ id: g.id, name: g.name || "", unit: g.unit || "", stock: Number(g.stock) || 0, _cat: "general", _listKey: "generalProducts", _label: "منتج عام" }));
  (data.inventoryItems || []).forEach(i => out.push({ id: i.id, name: i.name || "", unit: i.unit || "", stock: Number(i.stock) || 0, _cat: "inventory", _listKey: "inventoryItems", _label: "صنف مخزني", categoryId: i.categoryId }));
  return out;
}

/* صافي الرصيد + المتوسط المرجّح للتكلفة لصنف واحد من حركاته (بنفس قواعد
   computeStockNetMap + applyStockDelta). يُستخدم بعد الربط لمزامنة الصنف،
   وكمان لحساب «صافي» مجموعة الحركات اليتيمة. */
export function recomputeItemLedgerState(stockMovements, itemId) {
  const key = String(itemId);
  const moves = (stockMovements || [])
    .filter(mv => mv && !NON_STOCK_TYPES.has(mv.itemType) && mv.itemId != null && String(mv.itemId) === key)
    .slice()
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  let stock = 0, avg = 0;
  for (const mv of moves) {
    const q = Math.abs(Number(mv.qty) || 0);
    const p = Number(mv.price) || 0;
    if (mv.type === "adjust") {
      stock = q; /* المتوسط مش بيتغير في التسوية */
    } else if (mv.type === "out") {
      stock = stock - q;
      if (stock <= 0) avg = 0; /* فضي الرصيد → صفّر المتوسط (زي applyStockDelta) */
    } else { /* in | opening */
      const tot = stock + q;
      avg = tot > 0 ? (stock * avg + q * p) / tot : p;
      stock = tot;
    }
  }
  return { stock: r2(stock), avgCost: r2(avg) };
}

/* التحليل الكامل. بيرجّع:
   - orphans: [{ itemId, itemName, count, net, itemTypes:[], suggestId, suggestName,
               ambiguous, candidates:[{id,name,label}] }]
   - drift:   [{ id, name, listKey, label, stored, net, diff }]
   - counts:  { orphanGroups, orphanMoves, drift }
   - hasIssues
*/
export function analyzeStockReconciliation(data) {
  const movements = data.stockMovements || [];
  const allItems = getAllStockItems(data);
  const idSet = new Set(allItems.map(it => String(it.id)));

  /* فهرس الاسم → أصناف (للترشيح بالاسم) */
  const nameIndex = new Map();
  for (const it of allItems) {
    const k = norm(it.name);
    if (!k) continue;
    if (!nameIndex.has(k)) nameIndex.set(k, []);
    nameIndex.get(k).push(it);
  }

  /* ── 1) كشف الحركات اليتيمة — مجمّعة بالـ itemId ── */
  const groups = new Map(); /* String(itemId) → group */
  for (const mv of movements) {
    if (!mv || NON_STOCK_TYPES.has(mv.itemType) || mv.itemId == null) continue;
    const k = String(mv.itemId);
    if (idSet.has(k)) continue; /* مربوط بصنف موجود — تمام */
    let g = groups.get(k);
    if (!g) { g = { itemId: mv.itemId, itemName: "", count: 0, _itemTypes: new Set(), _moves: [] }; groups.set(k, g); }
    g.count++;
    g._moves.push(mv);
    if (mv.itemType) g._itemTypes.add(mv.itemType);
    if (!g.itemName && mv.itemName) g.itemName = mv.itemName;
  }

  const orphans = [];
  for (const g of groups.values()) {
    const { stock: net } = recomputeItemLedgerState(g._moves, g.itemId);
    const matches = nameIndex.get(norm(g.itemName)) || [];
    const suggest = matches.length === 1 ? matches[0] : null;
    orphans.push({
      itemId: g.itemId,
      itemName: g.itemName || "(بدون اسم)",
      count: g.count,
      net,
      itemTypes: Array.from(g._itemTypes),
      suggestId: suggest ? suggest.id : null,
      suggestName: suggest ? suggest.name : "",
      ambiguous: matches.length > 1,
      candidates: matches.map(m => ({ id: m.id, name: m.name, label: m._label })),
    });
  }
  /* الأكتر حركات الأول (أهم) */
  orphans.sort((a, b) => b.count - a.count || norm(a.itemName).localeCompare(norm(b.itemName)));

  /* ── 2) كشف درِفت الرصيد المخزّن للأصناف اللي لها حركات ── */
  const netMap = computeStockNetMap(movements);
  const drift = [];
  for (const it of allItems) {
    const k = String(it.id);
    if (!netMap.has(k)) continue; /* مفيش حركات → المخزّن هو المصدر، مفيش مطابقة */
    const net = r2(netMap.get(k));
    const stored = r2(Number(it.stock) || 0);
    if (Math.abs(net - stored) > 0.001) {
      drift.push({ id: it.id, name: it.name || "(بدون اسم)", listKey: it._listKey, label: it._label, stored, net, diff: r2(net - stored) });
    }
  }
  drift.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const orphanMoves = orphans.reduce((s, o) => s + o.count, 0);
  return {
    orphans,
    drift,
    allItems,
    counts: { orphanGroups: orphans.length, orphanMoves, drift: drift.length },
    hasIssues: orphans.length > 0 || drift.length > 0,
  };
}

/* ── Mutations (تُستدعى داخل upConfig، بتعدّل d) ── */

/* ربط كل حركات itemId اليتيم إلى صنف الهدف + مزامنة رصيد/تكلفة الهدف من
   الـ ledger بعد الربط. آمن/idempotent: لو اتنادت تاني والـ itemId اليتيم
   مبقاش موجود، مش هتعمل حاجة. بيرجّع عدد الحركات اللي اتعدّلت. */
export function relinkOrphanMovements(d, orphanItemId, target) {
  if (!d || !target) return 0;
  const oldKey = String(orphanItemId);
  /* itemType القانوني للهدف */
  const canonType = target._cat === "inventory" ? (target.categoryId || "inventory") : target._cat;
  let changed = 0;
  (d.stockMovements || []).forEach(mv => {
    if (!mv || NON_STOCK_TYPES.has(mv.itemType) || mv.itemId == null) return;
    if (String(mv.itemId) !== oldKey) return;
    mv._relinkedFrom = mv.itemId;
    mv.itemId = target.id;
    mv.itemName = target.name;
    if (canonType) mv.itemType = canonType;
    changed++;
  });
  if (changed > 0) syncStoredStockFromLedger(d, target);
  return changed;
}

/* مزامنة item.stock + avgCost للصنف من صافي حركاته في الـ ledger. */
export function syncStoredStockFromLedger(d, item) {
  if (!d || !item || !item._listKey) return false;
  const list = d[item._listKey];
  if (!Array.isArray(list)) return false;
  const idx = list.findIndex(x => String(x.id) === String(item.id));
  if (idx < 0) return false;
  const { stock, avgCost } = recomputeItemLedgerState(d.stockMovements, item.id);
  list[idx].stock = stock;
  /* المتوسط: نحدّثه بس لو الـ ledger طلع قيمة موجبة (فيه حركات دخول بأسعار) —
     ما نمسحش متوسط يدوي مظبوط لو الحركات كلها بدون سعر. */
  if (avgCost > 0) list[idx].avgCost = avgCost;
  return true;
}
