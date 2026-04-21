/* ═══════════════════════════════════════════════════════════════
   CLARK - Audit Log
   Security tracking for sensitive operations.
   
   Usage (inside upConfig callback):
     addAudit(d, { category, action, target, oldValue, newValue, user, notes })
   
   Categories: "attendance", "salary", "advance", "employee", "week", "settings"
   Each entry is timestamped and immutable (append-only).
   ═══════════════════════════════════════════════════════════════ */

export function addAudit(d,{category,action,target,oldValue,newValue,user,notes,severity}){
  if(!d.auditLog)d.auditLog=[];
  /* Keep only last 5000 entries to prevent bloat */
  if(d.auditLog.length>5000)d.auditLog=d.auditLog.slice(0,5000);
  d.auditLog.unshift({
    id:"aud_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7),
    ts:new Date().toISOString(),
    date:new Date().toISOString().split("T")[0],
    category:category||"general",
    action:action||"",
    target:target||"",
    oldValue:oldValue!==undefined?String(oldValue).slice(0,200):"",
    newValue:newValue!==undefined?String(newValue).slice(0,200):"",
    user:user||"",
    notes:(notes||"").slice(0,200),
    severity:severity||"info"/* info, warning, danger */
  });
}
