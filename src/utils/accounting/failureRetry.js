/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Failure Retry Utility
   ───────────────────────────────────────────────────────────────────────
   Given a recorded failure and the current data snapshot, finds the
   original source operation (sale, payment, etc.) and re-runs the
   appropriate autoPost.* method. On success, the failure is auto-cleared
   by autoPost itself.

   Public API:
     await retryFailure(config, failure)
       → {ok, error?} — never throws

     await retryAllFailures(config, options?)
       → {total, succeeded, failed, errors[]}
   ═══════════════════════════════════════════════════════════════════════ */

import { autoPost } from "./autoPost.js";

/* Find the source operation in the current data based on type + sourceId.
   Returns the args to pass to autoPost.<type>() or null if untraceable. */
function findSourceOperation(config, failure){
  const data = config;
  const t = failure.type;
  const sid = failure.sourceId;
  if(!sid) return null;

  switch(t){
    case "sale": {
      /* sourceId is order's _key on a customerDelivery */
      for(const order of (data.orders||[])){
        const idx = (order.customerDeliveries||[]).findIndex(d => (d._key||"") === sid);
        if(idx >= 0){
          const delivery = order.customerDeliveries[idx];
          const customer = (data.customers||[]).find(c => c.id === delivery.custId);
          if(!customer) return null;
          return ["sale", [delivery, customer, order]];
        }
      }
      return null;
    }
    case "saleReturn": {
      for(const order of (data.orders||[])){
        const idx = (order.customerReturns||[]).findIndex(r => (r._key||"") === sid);
        if(idx >= 0){
          const ret = order.customerReturns[idx];
          const customer = (data.customers||[]).find(c => c.id === ret.custId);
          if(!customer) return null;
          return ["saleReturn", [ret, customer, order]];
        }
      }
      return null;
    }
    case "customerPay": {
      const p = (data.custPayments||[]).find(x => x.id === sid);
      if(!p) return null;
      const c = (data.customers||[]).find(x => x.id === p.custId);
      if(!c) return null;
      return ["customerPay", [p, c]];
    }
    case "customerCheck":
    case "customerCheckCollect": {
      const chk = (data.checks||[]).find(x => x.id === sid);
      if(!chk) return null;
      const c = (data.customers||[]).find(x => x.id === chk.partyId);
      return [t, t === "customerCheck" ? [chk, c] : [chk]];
    }
    case "workshopReceive": {
      /* sourceId may be the receive's id or a synthetic key */
      for(const order of (data.orders||[])){
        for(const wd of (order.workshopDeliveries||[])){
          const rcv = (wd.receives||[]).find(r => (r.id||"") === sid);
          if(rcv){
            const ws = (data.workshops||[]).find(w => w.name === wd.wsName || w.id === wd.wsId);
            return ["workshopReceive", [rcv, ws, order, wd]];
          }
        }
      }
      return null;
    }
    case "workshopPay": {
      const p = (data.wsPayments||[]).find(x => x.id === sid);
      if(!p) return null;
      const ws = (data.workshops||[]).find(w => w.name === p.wsName || w.id === p.wsId);
      return ["workshopPay", [p, ws]];
    }
    case "hr": {
      const log = (data.hrLog||[]).find(x => x.id === sid);
      if(!log) return null;
      const emp = (data.employees||[]).find(e => e.id === log.empId);
      return ["hr", [log, emp]];
    }
    case "treasury": {
      const tx = (data.treasury||[]).find(x => x.id === sid);
      if(!tx) return null;
      return ["treasury", [tx]];
    }
    default:
      return null;
  }
}

/* Retry a single failure. Returns {ok, error?, sourceFound}. */
export async function retryFailure(config, failure, createdBy){
  const found = findSourceOperation(config, failure);
  if(!found){
    return {ok:false, sourceFound:false, error:"العملية الأصلية غير موجودة (ربما تم حذفها)"};
  }
  const [method, args] = found;
  if(typeof autoPost[method] !== "function"){
    return {ok:false, sourceFound:true, error:"نوع العملية غير معروف"};
  }
  /* Each autoPost method takes (config, ...args, createdBy) */
  const result = await autoPost[method](config, ...args, createdBy);
  return {
    ok: !!result.ok,
    sourceFound: true,
    error: result.error||null,
  };
}

/* Retry all currently-unresolved failures. */
export async function retryAllFailures(config, options){
  const onProgress = options?.onProgress || (() => {});
  const createdBy = options?.createdBy || "retry";
  const failures = (config.accountingPostFailures||[]).filter(f => !f.resolvedAt);
  let succeeded = 0, failed = 0;
  const errors = [];
  for(let i=0; i<failures.length; i++){
    const f = failures[i];
    onProgress(i, failures.length, f.label||f.type);
    try {
      const r = await retryFailure(config, f, createdBy);
      if(r.ok) succeeded++;
      else { failed++; errors.push({type:f.type, sourceId:f.sourceId, error:r.error}); }
    } catch(e){
      failed++;
      errors.push({type:f.type, sourceId:f.sourceId, error:e.message});
    }
  }
  onProgress(failures.length, failures.length, "اكتمل");
  return {total: failures.length, succeeded, failed, errors};
}

/* Utility: clear a specific failure manually (used when user decides not to retry) */
export function dismissFailure(upConfig, failureId){
  upConfig(d => {
    if(!Array.isArray(d.accountingPostFailures)) return;
    const f = d.accountingPostFailures.find(x => x.id === failureId);
    if(f){
      f.resolvedAt = new Date().toISOString();
      f.dismissed = true;
    }
  });
}

/* Utility: hard-delete resolved failures (cleanup) */
export function purgeResolvedFailures(upConfig){
  upConfig(d => {
    if(!Array.isArray(d.accountingPostFailures)) return;
    d.accountingPostFailures = d.accountingPostFailures.filter(f => !f.resolvedAt);
  });
}
