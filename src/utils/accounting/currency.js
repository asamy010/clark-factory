/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Currency & FX Rates Utility
   ───────────────────────────────────────────────────────────────────────
   Provides:
   - Default currency list (EGP functional + common foreign)
   - FX rate lookup by (currency, date)
   - Conversion helpers (foreign ↔ functional)
   - Validation for currency settings

   Storage:
   - data.accountingSettings.currencies = [{code, name, symbol, isFunctional}]
   - data.fxRates = [{id, currency, date, rate, by, createdAt}]
       sorted any order; we always lookup the latest rate ≤ given date

   IFRS / IAS 21 alignment:
   - functional currency: the currency of the primary economic environment
     (always EGP for CLARK — Egyptian factory)
   - transaction currency: the currency the transaction is denominated in
   - presentation currency: same as functional (we don't translate to USD)
   ═══════════════════════════════════════════════════════════════════════ */

export const FUNCTIONAL_CURRENCY = "EGP";

/* Default currency list — seeded once when user enables multi-currency */
export const DEFAULT_CURRENCIES = [
  {code:"EGP", name:"جنيه مصري",       symbol:"ج.م", isFunctional:true,  decimals:2, system:true},
  {code:"USD", name:"دولار أمريكي",    symbol:"$",   isFunctional:false, decimals:2, system:false},
  {code:"EUR", name:"يورو",            symbol:"€",   isFunctional:false, decimals:2, system:false},
  {code:"SAR", name:"ريال سعودي",      symbol:"﷼",   isFunctional:false, decimals:2, system:false},
  {code:"AED", name:"درهم إماراتي",    symbol:"د.إ", isFunctional:false, decimals:2, system:false},
  {code:"GBP", name:"جنيه إسترليني",   symbol:"£",   isFunctional:false, decimals:2, system:false},
];

/* ─── Currency CRUD helpers ─── */

export function getCurrencies(config){
  const list = (config?.accountingSettings || {}).currencies;
  if(Array.isArray(list) && list.length > 0) return list;
  /* if user hasn't configured, return just functional */
  return [DEFAULT_CURRENCIES[0]];
}

export function getCurrency(config, code){
  if(!code) return null;
  return getCurrencies(config).find(c => c.code === code) || null;
}

export function getFunctionalCurrency(config){
  const list = getCurrencies(config);
  return list.find(c => c.isFunctional) || list[0] || DEFAULT_CURRENCIES[0];
}

export function isMultiCurrencyEnabled(config){
  const list = getCurrencies(config);
  return list.filter(c => !c.isFunctional).length > 0;
}

/* ─── FX rate lookup ─── */

/* Find the most recent FX rate for `currency` ON OR BEFORE `date`.
   Returns the rate object or null if none. The functional currency always
   returns rate=1. */
export function findFxRate(config, currency, date){
  if(!currency || currency === FUNCTIONAL_CURRENCY){
    return {currency: FUNCTIONAL_CURRENCY, date, rate: 1, isFunctional: true};
  }
  const rates = (config?.fxRates || []).filter(r => r.currency === currency);
  if(rates.length === 0) return null;
  /* Find latest rate ≤ date */
  const candidates = rates.filter(r => (r.date||"") <= (date||""));
  if(candidates.length === 0){
    /* No historical rate; fall back to the earliest available (a warning case) */
    return [...rates].sort((a,b) => (a.date||"").localeCompare(b.date||""))[0];
  }
  return candidates.reduce((best, r) =>
    (!best || (r.date||"").localeCompare(best.date||"") > 0) ? r : best
  , null);
}

/* Convenience: get the rate value, or 1 for functional, or null if missing */
export function getRateValue(config, currency, date){
  const r = findFxRate(config, currency, date);
  return r ? Number(r.rate) || null : null;
}

/* ─── Conversion helpers ─── */

/* Convert from a foreign currency to the functional (EGP) currency. */
export function toFunctional(amount, currency, date, config){
  if(!currency || currency === FUNCTIONAL_CURRENCY) return Number(amount)||0;
  const rate = getRateValue(config, currency, date);
  if(rate == null) throw new Error(`لا يوجد سعر صرف للعملة ${currency} في ${date} أو قبله — أضفه في الإعدادات`);
  return Math.round((Number(amount)||0) * rate * 100) / 100;
}

/* Convert from functional to foreign (rare — usually for display). */
export function fromFunctional(amount, currency, date, config){
  if(!currency || currency === FUNCTIONAL_CURRENCY) return Number(amount)||0;
  const rate = getRateValue(config, currency, date);
  if(!rate || rate === 0) throw new Error(`لا يمكن التحويل من ${FUNCTIONAL_CURRENCY} إلى ${currency} — سعر الصرف 0 أو غير موجود`);
  return Math.round((Number(amount)||0) / rate * 100) / 100;
}

/* ─── Format helpers ─── */

export function formatMoney(amount, currency, config){
  const c = getCurrency(config, currency) || DEFAULT_CURRENCIES[0];
  const n = Number(amount)||0;
  const decimals = c.decimals !== undefined ? c.decimals : 2;
  /* Use English digits, comma thousand separator */
  const txt = n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${txt} ${c.symbol}`;
}

/* ─── Validation ─── */

/* Ensure the currency settings are sane: exactly one functional, no dup codes, etc. */
export function validateCurrencySettings(currencies){
  if(!Array.isArray(currencies) || currencies.length === 0){
    return {ok:false, reason:"يجب وجود عملة واحدة على الأقل"};
  }
  const functional = currencies.filter(c => c.isFunctional);
  if(functional.length !== 1){
    return {ok:false, reason:"يجب وجود عملة أساسية واحدة بالضبط (isFunctional:true)"};
  }
  if(functional[0].code !== FUNCTIONAL_CURRENCY){
    return {ok:false, reason:`العملة الأساسية يجب أن تكون ${FUNCTIONAL_CURRENCY}`};
  }
  const codes = new Set();
  for(const c of currencies){
    if(!c.code || !/^[A-Z]{3}$/.test(c.code)){
      return {ok:false, reason:`كود العملة "${c.code}" غير صحيح — يجب أن يكون 3 حروف إنجليزية كبيرة`};
    }
    if(codes.has(c.code)){
      return {ok:false, reason:`الكود ${c.code} مكرر`};
    }
    codes.add(c.code);
  }
  return {ok:true};
}
