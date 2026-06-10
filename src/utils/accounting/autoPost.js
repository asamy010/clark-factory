/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Auto-post Bridge (Hooks API)
   ───────────────────────────────────────────────────────────────────────
   Single entry-point that all operation pages call when creating, editing,
   or deleting operations. Builds a journal entry, validates it, posts it
   to the appropriate day-doc, and (V18.38) records any failures into
   data.accountingPostFailures so they can be reviewed and retried.

   Failure storage pattern:
     data.accountingPostFailures = [{
       id, type,                  // sale | customerPay | hr | ...
       sourceId,                  // the source operation's id (for retry)
       errorMessage,              // human-readable reason
       errorCode,                 // optional category (e.g. "coa-empty", "missing-mapping")
       payload,                   // serialized snapshot of the args passed to the builder
       happenedAt, attempts,      // for retry tracking
       resolvedAt?, resolvedBy?,  // set after successful retry
     }]

   The autoPost module is registered with a `setUpConfigCallback(fn)` once
   at app startup so it can write failures without each call site needing
   to pass upConfig.
   ═══════════════════════════════════════════════════════════════════════ */

import { postEntry, reverseEntry } from "./posting.js";
import {
  buildSaleEntry, buildSaleReturnEntry, buildCustomerPaymentEntry,
  buildCustomerCheckEntry, buildCheckCollectionEntry,
  buildWorkshopReceiveEntry, buildWorkshopPaymentEntry,
  buildHrEntry, buildTreasuryEntry,
  buildSaleCogsEntry, buildSaleReturnCogsEntry,
  buildSalesInvoicePostedEntry, buildSalesInvoiceCogsEntry,
  buildPurchaseInvoicePostedEntry, buildInvoiceVoidEntry,
  buildCreditNotePostedEntry, buildCreditNoteCogsEntry,
  /* V19.40: purchase returns */
  buildDebitNotePostedEntry,
} from "./postingRules.js";
import { isDateLocked, getLockReason } from "./periodLock.js";
import { resolveUnitCost } from "./unitCost.js";

/* ── module-level upConfig registry ──
   App.jsx registers its upConfig once on mount. autoPost calls it to
   persist failures. If unregistered, failures still get console.warn'd
   but won't show in the UI. */
let _upConfigCallback = null;

export function setUpConfigCallback(fn){
  if(typeof fn === "function") _upConfigCallback = fn;
}

/* Persist a failure to data.accountingPostFailures.
   Idempotent on (type, sourceId): if the same operation fails repeatedly,
   we update the existing record (bump `attempts`, refresh errorMessage).
   This prevents the failures list from ballooning with duplicates. */
function recordFailure(type, label, error, sourceId, payload){
  if(!_upConfigCallback) return;/* registry not set up yet */
  try {
    _upConfigCallback(d => {
      if(!Array.isArray(d.accountingPostFailures)) d.accountingPostFailures = [];
      const errMsg = (error && error.message) ? error.message : String(error||"");
      /* Categorize error for filterability */
      let errCode = "unknown";
      if(/شجرة الحسابات فارغة|coa.*empty/i.test(errMsg)) errCode = "coa-empty";
      else if(/غير موجود|not found|missing/i.test(errMsg)) errCode = "missing-mapping";
      else if(/ليس حساباً فرعياً/i.test(errMsg)) errCode = "non-leaf";
      else if(/غير متوازن|imbalance/i.test(errMsg)) errCode = "unbalanced";
      else if(/permission|firestore/i.test(errMsg)) errCode = "firestore";

      const existing = sourceId ? d.accountingPostFailures.find(f => f.type===type && f.sourceId===sourceId && !f.resolvedAt) : null;
      if(existing){
        existing.errorMessage = errMsg;
        existing.errorCode = errCode;
        existing.attempts = (existing.attempts||1) + 1;
        existing.lastAttemptAt = new Date().toISOString();
      } else {
        d.accountingPostFailures.push({
          id: "fail_" + Date.now() + "_" + Math.random().toString(36).slice(2,9),
          type, label,
          sourceId: sourceId||null,
          /* V21.21.39 ROOT CAUSE FIX (اكتشفه ESLint no-undef): كان مكتوب
             `errorCode,` (shorthand) والمتغير اسمه errCode → ReferenceError
             عند إنشاء أي سجل فشل جديد → الـ catch الأخير تحت بيبلعه →
             سجلات الفشل الجديدة كانت بتضيع بصمت من يوم ما النظام اتكتب
             (تحديث السجلات الموجودة فقط كان شغال). */
          errorMessage: errMsg, errorCode: errCode,
          payload: payload ? sanitizePayload(payload) : null,
          happenedAt: new Date().toISOString(),
          lastAttemptAt: new Date().toISOString(),
          attempts: 1,
        });
      }
      /* Cap the list to last 200 unresolved entries to prevent unbounded growth */
      const unresolved = d.accountingPostFailures.filter(f => !f.resolvedAt);
      if(unresolved.length > 200){
        const toKeep = unresolved.slice(-200).map(f => f.id);
        d.accountingPostFailures = d.accountingPostFailures.filter(f => f.resolvedAt || toKeep.includes(f.id));
      }
    });
  } catch(e){
    /* Last-resort: never let a failure-recorder error mask the original failure */
    console.warn("[CLARK autoPost] failed to record failure:", e);
  }
}

/* Strip non-serializable junk from payloads (DOM nodes, functions, circular refs).
   We keep only primitive fields and small objects (1-level deep). */
function sanitizePayload(args){
  try {
    return args.map(a => {
      if(a == null) return null;
      const t = typeof a;
      if(t === "string" || t === "number" || t === "boolean") return a;
      if(t === "function" || t === "symbol") return "[function]";
      if(Array.isArray(a)) return `[Array(${a.length})]`;
      if(t === "object"){
        /* keep id + name + key fields only */
        const out = {};
        ["id","code","name","custId","wsId","empId","amount","date","sourceType","_key"].forEach(k => {
          if(a[k] !== undefined) out[k] = a[k];
        });
        return out;
      }
      return String(a);
    });
  } catch(e){
    return null;
  }
}

/* V18.40 → V21.21.38 — تكلفة الوحدة اتوحّدت في موديول unitCost.js المشترك
   (كانت منسوخة هنا وفي postingRules.js مع تعليق «خلّيهم متزامنين يدوياً»
   — V21.9.87). راجع unitCost.js للأولوية manual/computed/auto. */

function isCogsEnabled(config){
  /* COGS posting is opt-in. Defaults to ON if not set, since it's the
     accounting-correct behavior. Users can disable from settings. */
  const s = config?.accountingSettings || {};
  return s.cogsEnabled !== false;
}

/* ── helpers ── */

function isEnabled(config){
  const s = config?.accountingSettings || {};
  return s.autoPostEnabled !== false;
}

function getCoa(config){
  return config?.coa || [];
}

function getRules(config){
  return (config?.accountingSettings || {}).rules;
}

function getCategoryMap(config){
  return (config?.accountingSettings || {}).categoryMap;
}

/* Mark a failure as resolved (called by retry success). */
function clearFailure(type, sourceId){
  if(!_upConfigCallback || !sourceId) return;
  try {
    _upConfigCallback(d => {
      if(!Array.isArray(d.accountingPostFailures)) return;
      const f = d.accountingPostFailures.find(x => x.type===type && x.sourceId===sourceId && !x.resolvedAt);
      if(f){
        f.resolvedAt = new Date().toISOString();
      }
    });
  } catch(e){/* swallow */}
}

/* Internal: build → post pipeline. Returns {ok, sourceId, entryId?}.
   On failure, records to data.accountingPostFailures (idempotent). */
async function _buildAndPost(label, type, builder, args, config, createdBy){
  let entry;
  try {
    entry = builder(...args);
  } catch(e){
    console.warn(`[CLARK auto-post:${label}] build failed:`, e.message);
    recordFailure(type, label, e, args?.[0]?.id || args?.[0]?._key, args);
    return {ok:false, error: e.message};
  }
  if(!entry) return {ok:false, skipped:"no-entry-for-input"};

  /* V18.54: Period lock — block posting to a closed period (or locked day) */
  if(isDateLocked(entry.date, config)){
    const reason = getLockReason(entry.date, config) || "تاريخ مقفل";
    const e = new Error(reason);
    console.warn(`[CLARK auto-post:${label}] blocked by period lock: ${entry.date}`);
    recordFailure(type, label, e, entry.sourceId, args);
    return {ok:false, error: reason, lockedPeriod: true};
  }

  const coa = getCoa(config);
  if(!coa.length){
    const e = new Error("شجرة الحسابات فارغة — ازرع الشجرة الافتراضية أولاً من تبويب 'شجرة الحسابات'");
    recordFailure(type, label, e, entry.sourceId, args);
    return {ok:false, error: e.message};
  }

  try {
    await postEntry({...entry, coa, createdBy});
    /* Success: clear any previous failure for the same source */
    if(entry.sourceId) clearFailure(type, entry.sourceId);
    return {ok:true, sourceId: entry.sourceId};
  } catch(e){
    console.warn(`[CLARK auto-post:${label}] post failed:`, e.message);
    recordFailure(type, label, e, entry.sourceId, args);
    return {ok:false, error: e.message};
  }
}

/* Reverse with failure recording */
async function _reverse(type, sourceType, sourceId, date, reason, createdBy){
  try {
    return await reverseEntry({date, sourceType, sourceId, reason, createdBy});
  } catch(e){
    console.warn(`[CLARK auto-post:reverse:${type}] failed:`, e.message);
    recordFailure(type+":reverse", "إلغاء "+type, e, sourceId, [{sourceType, sourceId, date}]);
    return {reversed:false, error: e.message};
  }
}

/* ═════════════ Public API ═════════════ */

export const autoPost = {

  sale(config, delivery, customer, order, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("sale", "sale", buildSaleEntry, [delivery, customer, order, getCoa(config), getRules(config)], config, createdBy);
  },

  saleReturn(config, ret, customer, order, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("saleReturn", "saleReturn", buildSaleReturnEntry, [ret, customer, order, getCoa(config), getRules(config)], config, createdBy);
  },

  /* V18.40 — Cost of Goods Sold companion entry for a sale.
     Should be called AFTER autoPost.sale() succeeds. Skipped silently if:
     - COGS posting is disabled in settings
     - the order has no resolvable unit cost (no costPrice + computed=0) */
  saleCogs(config, delivery, order, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    if(!isCogsEnabled(config)) return Promise.resolve({ok:false, skipped:"cogs-disabled"});
    const unitCost = resolveUnitCost(order, config);
    if(unitCost <= 0) return Promise.resolve({ok:false, skipped:"no-cost"});
    return _buildAndPost("saleCogs", "saleCogs", buildSaleCogsEntry, [delivery, order, unitCost, getCoa(config), getRules(config)], config, createdBy);
  },

  /* V18.40 — COGS reversal companion for a sale return. */
  saleReturnCogs(config, ret, order, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    if(!isCogsEnabled(config)) return Promise.resolve({ok:false, skipped:"cogs-disabled"});
    const unitCost = resolveUnitCost(order, config);
    if(unitCost <= 0) return Promise.resolve({ok:false, skipped:"no-cost"});
    return _buildAndPost("saleReturnCogs", "saleReturnCogs", buildSaleReturnCogsEntry, [ret, order, unitCost, getCoa(config), getRules(config)], config, createdBy);
  },

  customerPay(config, payment, customer, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("customerPay", "customerPay", buildCustomerPaymentEntry, [payment, customer, getCoa(config), getRules(config), config], config, createdBy);
  },

  customerCheck(config, check, customer, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("customerCheck", "customerCheck", buildCustomerCheckEntry, [check, customer, getCoa(config), getRules(config)], config, createdBy);
  },

  customerCheckCollect(config, check, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("customerCheckCollect", "customerCheckCollect", buildCheckCollectionEntry, [check, getCoa(config), getRules(config), config], config, createdBy);
  },

  workshopReceive(config, receive, ws, order, wd, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("workshopReceive", "workshopReceive", buildWorkshopReceiveEntry, [receive, ws, order, wd, getCoa(config), getRules(config)], config, createdBy);
  },

  workshopPay(config, payment, ws, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("workshopPay", "workshopPay", buildWorkshopPaymentEntry, [payment, ws, getCoa(config), getRules(config), config], config, createdBy);
  },

  hr(config, hrLog, employee, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("hr", "hr", buildHrEntry, [hrLog, employee, getCoa(config), getRules(config), config], config, createdBy);
  },

  treasury(config, tx, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("treasury", "treasury", buildTreasuryEntry, [tx, getCoa(config), getRules(config), getCategoryMap(config), config], config, createdBy);
  },

  /* V18.50 — Post a sales invoice (status: posted). Generates the main
     revenue entry + COGS companion. Returns combined result.
     V18.85 — Skip COGS for service invoices (no inventory involved). */
  salesInvoicePosted(config, invoice, customer, order, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    /* Main entry: AR/Revenue/Discount */
    const main = _buildAndPost("salesInvoice", "salesInvoice", buildSalesInvoicePostedEntry, [invoice, customer, order, getCoa(config), getRules(config)], config, createdBy);
    /* COGS companion (soft fail — log but don't block). Skipped for service invoices. */
    let cogs = {ok:false, skipped:"no-order"};
    if(invoice && invoice.subtype === "service"){
      cogs = {ok:false, skipped:"service-invoice"};
    } else if(order && isCogsEnabled(config)){
      cogs = _buildAndPost("salesInvoiceCogs", "salesInvoiceCogs", buildSalesInvoiceCogsEntry, [invoice, order, getCoa(config), getRules(config), config], config, createdBy);
    }
    return {ok: main.ok, main, cogs};
  },

  /* V18.50 — Post a purchase invoice (status: posted). */
  purchaseInvoicePosted(config, invoice, supplier, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("purchaseInvoice", "purchaseInvoice", buildPurchaseInvoicePostedEntry, [invoice, supplier, getCoa(config), getRules(config)], config, createdBy);
  },

  /* V18.50 — Reverse an invoice's journal entries when it's voided.
     The invoice must have postedJournalRef pointing to the original entry. */
  invoiceVoided(config, invoice, sourceType, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    if(!invoice.postedJournalRef) return Promise.resolve({ok:false, skipped:"no-original-ref"});
    const ref = invoice.postedJournalRef;
    return _reverse(sourceType, sourceType, invoice.id, ref.date, "إلغاء فاتورة "+invoice.invoiceNo, createdBy);
  },

  /* V18.51 — Post a credit note (sales return as standalone entity). */
  creditNotePosted(config, creditNote, customer, order, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    const main = _buildAndPost("creditNote", "creditNote", buildCreditNotePostedEntry, [creditNote, customer, order, getCoa(config), getRules(config)], config, createdBy);
    let cogs = {ok:false, skipped:"no-order"};
    if(order && isCogsEnabled(config)){
      cogs = _buildAndPost("creditNoteCogs", "creditNoteCogs", buildCreditNoteCogsEntry, [creditNote, order, getCoa(config), getRules(config), config], config, createdBy);
    }
    return {ok: main.ok, main, cogs};
  },

  /* V18.51 — Reverse a credit note's journal entries when voided. */
  creditNoteVoided(config, creditNote, sourceType, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    if(!creditNote.postedJournalRef) return Promise.resolve({ok:false, skipped:"no-original-ref"});
    const ref = creditNote.postedJournalRef;
    return _reverse(sourceType, sourceType, creditNote.id, ref.date, "إلغاء إشعار دائن "+creditNote.creditNoteNo, createdBy);
  },

  /* V19.40 — Post a debit note (purchase return).
     Generates a single entry: Dr supplier-payable / Cr purchase-returns.
     No COGS companion — purchases don't run through COGS at the time of
     purchase (they hit inventory directly), so there's nothing to reverse
     on the COGS side. The contra-expense account handles the offset. */
  debitNotePosted(config, debitNote, supplier, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _buildAndPost("debitNote", "debitNote", buildDebitNotePostedEntry, [debitNote, supplier, getCoa(config), getRules(config)], config, createdBy);
  },

  /* V19.40 → V21.9.56 — Reverse a debit note's journal entry when voided.
     V21.9.56 (Audit F10): accept sourceType param for parity with
     creditNoteVoided (above). Pre-V21.9.56 this was hardcoded to "debitNote",
     but if the underlying JE was posted with a different sourceType (e.g.
     "purchaseReturn"), the reverse would silently no-op → orphan JE.
     Falls back to "debitNote" if caller doesn't pass sourceType (backward
     compatibility with existing call sites). */
  debitNoteVoided(config, debitNote, sourceType, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    if(!debitNote.postedJournalRef) return Promise.resolve({ok:false, skipped:"no-original-ref"});
    /* V21.9.56: support legacy 3-arg callers (config, debitNote, createdBy) by
       detecting if `sourceType` looks like a username (no sourceType passed).
       In practice, sourceType is one of "debitNote" | "purchaseReturn" etc. */
    if (typeof sourceType === "string" && !createdBy && (sourceType.includes("@") || /\s/.test(sourceType))) {
      createdBy = sourceType;
      sourceType = "debitNote";
    }
    const ref = debitNote.postedJournalRef;
    const sType = sourceType || "debitNote";
    return _reverse(sType, sType, debitNote.id, ref.date, "إلغاء إشعار مدين "+debitNote.debitNoteNo, createdBy);
  },

  reverse(config, sourceType, sourceId, date, reason, createdBy){
    if(!isEnabled(config)) return Promise.resolve({ok:false, skipped:"disabled"});
    return _reverse(sourceType, sourceType, sourceId, date, reason, createdBy);
  },
};
