/* V21.27.218 (C1) — اختبار سحابي موجّه (§0.2): خصم/استرداد مخزون أمر التشغيل
   على Firestore Emulator حقيقي، بنفس دوال الإنتاج بالحرف:
   collectStockIds/txReadStockDocs/txWriteStockDocs (orderStockTx.js) +
   checkStockAvailability/deductStockForOrder/refundActualStockForOrder (orders.js)
   وبنفس تسلسل addOrder/replaceOrder/delOrder في App.jsx.

   تشغيل:
   npx firebase-tools emulators:exec --only firestore --project demo-clark \
     "node scripts/emu-order-stock.mjs"
*/
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, runTransaction, collection } from "firebase/firestore";
import { checkStockAvailability, deductStockForOrder, refundActualStockForOrder } from "../src/utils/orders.js";
import { collectStockIds, txReadStockDocs, txWriteStockDocs, stockTxToday } from "../src/utils/orderStockTx.js";

const PS = { stockEnabled: true, autoDeductOnCut: true, blockOnInsufficientStock: true, stockActivationDate: "" };
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✅ " + label); } else { fail++; console.error("  ❌ " + label); } };

const env = await initializeTestEnvironment({
  projectId: "demo-clark",
  firestore: { host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080) },
});

/* المنطق هو موضوع الاختبار (الـ rules ليها test:rules الخاص بها) */
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();

  /* ── Seed: مخزون حقيقي في المستندات المنفصلة (وضع ما بعد الترحيل) ── */
  await setDoc(doc(db, "fabricsDocs", "f1"), { id: "f1", name: "قطن", unit: "متر", stock: 100, avgCost: 40 });
  await setDoc(doc(db, "accessoriesDocs", "a1"), { id: "a1", name: "زرار", unit: "قطعة", stock: 500, avgCost: 1 });

  const mkOrder = (id, layers) => ({
    id, modelNo: "M-" + id, date: "2026-07-01", season: "WS26",
    fabricA: "f1", consA: 2, colorsA: [{ color: "أسود", layers, pcsPerLayer: 5, qty: layers * 5 }],
    accItems: [{ accId: "a1", name: "زرار", qtyPerPiece: 2, price: 1 }],
  });
  /* نفس جسم ترانزاكشن addOrder/replaceOrder في App.jsx (المسار المرحّل) */
  const saveOrderTx = async (o, orderRef) => runTransaction(db, async (tx) => {
    const ctx2 = await txReadStockDocs(tx, db, collectStockIds(o), stockTxToday());
    const draft = { purchaseSettings: PS, fabrics: ctx2.fabrics, accessories: ctx2.accessories, stockMovements: [] };
    const fresh = checkStockAvailability(o, draft);
    if (!fresh.ok) { const e = new Error("STOCK_INSUFFICIENT"); e.shortages = fresh.shortages; throw e; }
    deductStockForOrder(draft, o, "emu");
    txWriteStockDocs(tx, ctx2, draft);
    tx.set(orderRef, o);
  });
  const readStock = async () => ({
    fab: (await getDoc(doc(db, "fabricsDocs", "f1"))).data().stock,
    acc: (await getDoc(doc(db, "accessoriesDocs", "a1"))).data().stock,
  });
  const readDayEntries = async () => {
    const s = await getDoc(doc(db, "stockMovementsDays", stockTxToday()));
    return s.exists() ? (s.data().entries || []) : [];
  };

  /* ── 1) إنشاء أوردر: 10 فرشات → خصم 20م قماش + 100 إكسسوار ذرّيًا ── */
  const o1 = mkOrder("ord1", 10);
  const ref1 = doc(collection(db, "seasons", "WS26", "orders"));
  await saveOrderTx(o1, ref1);
  let st = await readStock();
  ok(st.fab === 80 && st.acc === 400, `إنشاء: خصم فعلي من المستندات المنفصلة (قماش ${st.fab}/80 · إكسسوار ${st.acc}/400)`);
  let entries = await readDayEntries();
  ok(entries.filter(m => m.sourceType === "cut" && m.type === "out").length === 2, `إنشاء: حركتا cut في stockMovementsDays (${entries.length})`);
  const saved1 = (await getDoc(ref1)).data();
  ok(saved1._stockDeductedActual?.fabrics?.f1 === 20, "إنشاء: _stockDeductedActual مختوم بالحقيقة (20م)");

  /* ── 2) النقص بيترفض ذرّيًا (الوضع الصارم) والمخزون مايتلمسش ── */
  let threw = null;
  try { await saveOrderTx(mkOrder("ordBig", 100), doc(collection(db, "seasons", "WS26", "orders"))); }
  catch (e) { threw = e; }
  st = await readStock();
  ok(threw?.message === "STOCK_INSUFFICIENT" && st.fab === 80, `نقص: الترانزاكشن اترفضت والرصيد ثابت (${st.fab}/80)`);

  /* ── 3) تعديل (delta): 10 → 15 فرشة → خصم 10م إضافية بس ── */
  const o1edit = { ...saved1, colorsA: [{ color: "أسود", layers: 15, pcsPerLayer: 5, qty: 75 }] };
  await saveOrderTx(o1edit, ref1);
  st = await readStock();
  ok(st.fab === 70, `تعديل: delta-aware (خصم 10م إضافية → ${st.fab}/70)`);

  /* ── 4) حذف: استرداد المخصوم فعليًا (زي delOrder) ── */
  const ordFinal = (await getDoc(ref1)).data();
  await runTransaction(db, async (tx) => {
    const ctx2 = await txReadStockDocs(tx, db, collectStockIds(ordFinal), stockTxToday());
    const draft = { fabrics: ctx2.fabrics, accessories: ctx2.accessories, stockMovements: [] };
    refundActualStockForOrder(draft, ordFinal, "emu");
    txWriteStockDocs(tx, ctx2, draft);
    tx.delete(ref1);
  });
  st = await readStock();
  ok(st.fab === 100 && st.acc === 500, `حذف: استرداد كامل للمخصوم فعليًا (قماش ${st.fab}/100 · إكسسوار ${st.acc}/500)`);

  /* ── 5) C1 regression: حذف أوردر الفترة الوهمية → صفر استرداد ── */
  const ghost = { ...mkOrder("ghost", 10), _stockDeducted: { fabrics: { f1: 20 }, accessories: { a1: 100 } } };
  const ghostRef = doc(collection(db, "seasons", "WS26", "orders"));
  await setDoc(ghostRef, ghost);/* اتحفظ زمان والخصم كان no-op */
  await runTransaction(db, async (tx) => {
    const ids = collectStockIds(ghost);
    const hasActual = Object.values(ghost._stockDeductedActual?.fabrics || {}).some(Number)
      || Object.values(ghost._stockDeductedActual?.accessories || {}).some(Number);
    if (hasActual) {
      const ctx2 = await txReadStockDocs(tx, db, ids, stockTxToday());
      const draft = { fabrics: ctx2.fabrics, accessories: ctx2.accessories, stockMovements: [] };
      refundActualStockForOrder(draft, ghost, "emu");
      txWriteStockDocs(tx, ctx2, draft);
    }
    tx.delete(ghostRef);
  });
  st = await readStock();
  ok(st.fab === 100 && st.acc === 500, `حذف أوردر وهمي: مفيش تضخّم كاذب (قماش ${st.fab}/100)`);
});

await env.cleanup();
console.log(`\n=== EMU ORDER-STOCK: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
