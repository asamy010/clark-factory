/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Sync invoice discounts from distributions (V21.26.17)
   ───────────────────────────────────────────────────────────────────────
   ROOT CAUSE (نزاع عميل — V21.26.16):
     خصم الفاتورة بيتختم وقت الإنشاء من delivery.discPct (المتفرّع أصلاً من
     خصم التوزيعة custDeliverySessions[sid].custDisc[custId]). لو المستخدم
     غيّر خصم التوزيعة بعد ما الفاتورة اتعملت، الفاتورة تفضل بالخصم القديم
     → الكشف المحاسبي (المبني على الفواتير) يبان بخصم مختلف عن الكشف
     التشغيلي (المبني على التوزيعة — اللي اتظبط في V21.26.16).

   الحل: أداة صيانة تطابق خصم الفاتورة مع خصم التوزيعة (مصدر الحقيقة §14.1).

   ─── سلامة مالية (CLAUDE.md §0.1 / §10 — مفيش بيئة اختبار) ───
     • الفواتير المسودة (draft): آمنة — لسه مفيش قيود محاسبية، فبنطابقها.
     • الفواتير المرحّلة (posted): لها قيود يومية (إيراد/عملاء/خصم + تكلفة).
       تعديل الخصم بدون عكس وإعادة ترحيل القيد بيكسر ميزان المراجعة. عشان
       كده الأداة **مابتلمسهاش** — بتعرضها للمستخدم في قائمة منفصلة عشان
       يلغيها ويعيد إصدارها يدوياً (قرار واعي، مش mutation صامت).
     • فواتير مرتبطة بأكتر من توزيعة بخصومات مختلفة (ambiguous): بتتعرض
       وتتخطّى — مفيش خصم واحد صحيح نطابق بيه.
     • فواتير الخدمات (subtype=service): مالهاش deliveryRef → بتتجاهل.
     • idempotent: بعد المطابقة، الخصم بيساوي خصم التوزيعة فمابيظهرش تاني.
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

/* Resolve the distribution discount % for a sales invoice by looking up the
   session(s) referenced in its deliveryRefs and reading custDisc[customerId].
   Returns:
     null                                 → no linked session carries an override
     { pct, ambiguous:false, sessionIds } → single, unambiguous distribution %
     { pct:null, ambiguous:true, ... }    → multiple conflicting % merged in one inv */
function resolveDistributionDiscount(inv, sessionsById){
  const refs = Array.isArray(inv.deliveryRefs) && inv.deliveryRefs.length
    ? inv.deliveryRefs
    : (inv.deliveryRef ? [inv.deliveryRef] : []);
  const custId = inv.customerId;
  const pcts = new Set();
  const sessionIds = [];
  for(const ref of refs){
    const sid = ref && ref.sessionId;
    if(!sid) continue;
    const s = sessionsById[sid];
    if(!s) continue;
    const m = s.custDisc;
    if(m && m[custId] != null && m[custId] !== ""){
      const n = Number(m[custId]);
      if(!isNaN(n)){ pcts.add(n); sessionIds.push(sid); }
    }
  }
  if(pcts.size === 0) return null;
  if(pcts.size > 1) return { pct: null, ambiguous: true, sessionIds };
  return { pct: [...pcts][0], ambiguous: false, sessionIds };
}

/* Pure analysis pass — no mutation. Returns the diff buckets for the UI.
   { draft:[row], posted:[row], ambiguous:[row], scanned, linked }
   row = { id, invoiceNo, customerName, status, date, subtotal,
           currentPct, newPct, currentTotal, newTotal, newDiscount, delta } */
export function computeInvoiceDiscountDiffs(data){
  const sessions = (data && data.custDeliverySessions) || [];
  const sessionsById = {};
  sessions.forEach(s => { if(s && s.id) sessionsById[s.id] = s; });

  const out = { draft: [], posted: [], ambiguous: [], scanned: 0, linked: 0 };
  ((data && data.salesInvoices) || []).forEach(inv => {
    if(!inv || inv.status === "void") return;
    if(inv.subtype === "service") return;            /* لا توزيعة */
    out.scanned++;
    const res = resolveDistributionDiscount(inv, sessionsById);
    if(!res) return;
    out.linked++;
    const curPct = Number(inv.discountPct) || 0;
    if(res.ambiguous){
      out.ambiguous.push({ id: inv.id, invoiceNo: inv.invoiceNo, customerName: inv.customerName || "",
        status: inv.status, date: inv.date || "", currentPct: curPct, sessionIds: res.sessionIds });
      return;
    }
    if(Math.abs(curPct - res.pct) < 0.01) return;    /* مطابق بالفعل */
    const subtotal = r2(Number(inv.subtotal) || Number(inv.total) || 0);
    const newDiscount = r2(subtotal * (res.pct / 100));
    const newTotal = r2(subtotal - newDiscount);
    const currentTotal = r2(Number(inv.total) != null ? Number(inv.total) : subtotal);
    const row = {
      id: inv.id, invoiceNo: inv.invoiceNo, customerName: inv.customerName || "",
      status: inv.status, date: inv.date || "",
      subtotal, currentPct: curPct, newPct: res.pct,
      currentTotal, newTotal, newDiscount,
      delta: r2(newTotal - currentTotal),
      sessionIds: res.sessionIds,
    };
    if(inv.status === "posted") out.posted.push(row);
    else out.draft.push(row);
  });
  /* ترتيب بالأحدث تاريخاً أولاً للعرض */
  const byDateDesc = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
  out.draft.sort(byDateDesc); out.posted.sort(byDateDesc); out.ambiguous.sort(byDateDesc);
  return out;
}

/* upConfig mutator — applies the distribution discount to DRAFT invoices only.
   SAFETY: hard-gated on status==="draft" so a posted invoice can NEVER be
   mutated here even if its id is passed in (defends against UI drift).
   Recomputes discount/total from the stored subtotal (gross). idempotent.
   `rows` = the draft rows from computeInvoiceDiscountDiffs().draft
   Returns the count actually applied. */
export function applyDraftDiscountSyncMutator(d, rows){
  if(!d || !Array.isArray(d.salesInvoices)) return 0;
  const byId = {};
  (rows || []).forEach(r => { if(r && r.id) byId[r.id] = r; });
  let applied = 0;
  d.salesInvoices.forEach(inv => {
    if(!inv || inv.status !== "draft") return;       /* drafts only — GL safety */
    const r = byId[inv.id];
    if(!r) return;
    const pct = Number(r.newPct);
    if(isNaN(pct)) return;
    const subtotal = r2(Number(inv.subtotal) || Number(inv.total) || 0);
    inv.discountPct = pct;
    inv.discount = r2(subtotal * (pct / 100));
    inv.total = r2(subtotal - inv.discount);
    inv._discSyncedAt = new Date().toISOString();    /* أثر تدقيق — إعادة التشغيل غير ضارة */
    applied++;
  });
  return applied;
}
