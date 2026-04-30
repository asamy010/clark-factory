/* ═══════════════════════════════════════════════════════════════
   CLARK - Data Limits Utility (V15.5)
   
   Prevents Firestore 1MB document limit by capping large arrays.
   Must be called inside upConfig callbacks to trim data before write.
   
   Limits chosen to preserve recent history while staying safe:
   - stockMovements: 2000 (covers ~3-6 months of active factory)
   - notifications: 500 (plenty for user-facing alerts)
   - hrLog: 2000 (covers ~1 year of weekly payrolls for 50 employees)
   - custPayments, supplierPayments, wsPayments: 3000 each
   - checks: 1000 (covers 1-2 years of checks)
   ═══════════════════════════════════════════════════════════════ */

const LIMITS = {
  stockMovements: 2000,
  notifications: 500,
  hrLog: 2000,
  custPayments: 3000,
  supplierPayments: 3000,
  wsPayments: 3000,
  checks: 1000,
  auditLog: 5000, /* already capped in addAudit but safe to enforce here too */
  treasury: 3000,
};

/* Call this inside any upConfig callback to keep data trim */
export function enforceDataLimits(d){
  if(!d)return;
  Object.entries(LIMITS).forEach(([key,limit])=>{
    const arr=d[key];
    if(Array.isArray(arr)&&arr.length>limit){
      /* Keep most recent entries. Assume newer entries are at the start (unshift pattern) */
      /* If the list uses push pattern, keep the end */
      /* Check by looking at first vs last entry's timestamp/date */
      if(arr.length>=2){
        const first=arr[0];const last=arr[arr.length-1];
        const firstTime=first&&(first.ts||first.date||first.createdAt||"");
        const lastTime=last&&(last.ts||last.date||last.createdAt||"");
        if(firstTime&&lastTime&&firstTime<lastTime){
          /* Oldest first → keep last N */
          d[key]=arr.slice(-limit);
        } else {
          /* Newest first → keep first N */
          d[key]=arr.slice(0,limit);
        }
      } else {
        d[key]=arr.slice(0,limit);
      }
    }
  });
}

export{LIMITS};
