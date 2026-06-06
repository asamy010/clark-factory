/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.254 — Due-Checks Alerts generator (pure, client-side)
   ───────────────────────────────────────────────────────────────
   Materializes SIDE-PANEL notifications (exactly like transfer-approval
   alerts) for the CURRENT user when a "معلق" (outstanding) check
   approaches or passes its due date. NO external/web/OS push — these are
   plain notification entries that show in the greeting-bar list and
   auto-hide when the check is settled (same lifecycle as transfer chips).

   This module is PURE — it computes the desired actions; App.jsx applies
   them inside a single upConfig transaction (with existence guards).

   computeCheckAlertActions(...) → { toCreate:[notif...], toEndIds:[id...] }
     - toCreate : new notif objects to push (deduped by deterministic id)
     - toEndIds : ids of THIS user's outstanding chk_* notifs that should
                  be ended (state transition OR check left "معلق")

   Deterministic id: `chkd_<checkId>_<recipientEmail>_<state>` (due-date based) — so the
   split-collection transactional merge naturally dedups across devices
   (same principle as the V21.9.249/250 leg-id fixes), and a state change
   produces a NEW id (old one gets ended).
   ═══════════════════════════════════════════════════════════════ */

const OUTSTANDING = "معلق";

/* Whole-day difference (toIso - fromIso), date-only, TZ-safe (UTC midnight). */
export function daysBetween(fromIso, toIso){
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  if(isNaN(a) || isNaN(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

function fmtAmount(n){
  const v = Number(n) || 0;
  try { return v.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  catch(_) { return String(v); }
}

/* Resolve a human party name for the check (reuse CLARK conventions). */
function resolveParty(c, customers, suppliers){
  if(c.partyName) return c.partyName;
  if(c.type === "receivable" && c.custId){
    const cust = (customers || []).find(x => x && x.id === c.custId);
    if(cust) return cust.name || cust.custName || "عميل";
  }
  if(c.type === "payable" && c.supplierId){
    const sup = (suppliers || []).find(x => x && x.id === c.supplierId);
    if(sup) return sup.name || sup.supplierName || "مورد";
  }
  return c.custName || c.supplierName || c.party || c.drawerName || "—";
}

export function computeCheckAlertActions({ checks, notifications, checkAlerts, customers, suppliers, userEmail, today }){
  const out = { toCreate: [], toEndIds: [] };
  if(!checkAlerts || checkAlerts.enabled !== true) return out;
  if(!userEmail) return out;

  const payList = Array.isArray(checkAlerts.payableRecipients) ? checkAlerts.payableRecipients : [];
  const rcvList = Array.isArray(checkAlerts.receivableRecipients) ? checkAlerts.receivableRecipients : [];
  const inPay = payList.includes(userEmail);
  const inRcv = rcvList.includes(userEmail);
  if(!inPay && !inRcv) return out;

  const leadDays = Math.max(0, Number(checkAlerts.leadDays) || 0);
  const todayStr = String(today || "").slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) return out;
  const nowTs = new Date().toISOString();

  const notifs = Array.isArray(notifications) ? notifications : [];
  const desiredIds = new Set();

  for(const c of (Array.isArray(checks) ? checks : [])){
    if(!c || c.status !== OUTSTANDING) continue;
    const isPay = c.type === "payable";
    const isRcv = c.type === "receivable";
    if(isPay && !inPay) continue;
    if(isRcv && !inRcv) continue;
    if(!isPay && !isRcv) continue;

    const due = String(c.dueDate || "").slice(0, 10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;

    const diff = daysBetween(todayStr, due); /* >0 future, 0 today, <0 past */
    if(isNaN(diff)) continue;
    let state = null;
    if(diff < 0) state = "overdue";
    else if(diff === 0) state = "due";
    else if(diff <= leadDays) state = "upcoming";
    if(!state) continue;

    /* V21.9.256: id prefix "chkd_" = due-date-based. The old "chk_" prefix
       (V21.9.254/255) mistakenly used c.date (issue date) — those stale
       notifs are auto-ended by the cleanup loop below since they can never
       be in the dueDate-based desired set. */
    const id = `chkd_${c.id}_${userEmail}_${state}`;
    desiredIds.add(id);

    /* Deterministic id → if it already exists (any state on this entry id),
       don't recreate. */
    if(notifs.some(n => n && String(n.id) === id)) continue;

    const kind = isPay ? "دفع" : "قبض";
    const party = resolveParty(c, customers, suppliers);
    const amount = fmtAmount(c.amount);
    const checkNo = c.checkNo || "—";
    let msg;
    if(state === "upcoming"){
      msg = `🔔 شيك ${kind} لـ ${party} بمبلغ ${amount} مستحق بعد ${diff} يوم (يوم ${due}) — شيك رقم ${checkNo}`;
    } else if(state === "due"){
      msg = `⚠️ شيك ${kind} لـ ${party} بمبلغ ${amount} مستحق النهارده — شيك رقم ${checkNo}`;
    } else {
      msg = `🔴 شيك ${kind} لـ ${party} بمبلغ ${amount} متأخر من يوم ${due} — شيك رقم ${checkNo}`;
    }

    out.toCreate.push({
      id,
      toEmail: userEmail,
      toName: userEmail.split("@")[0],
      msg,
      type: "check_alert",
      fromName: "النظام",
      fromEmail: "system",
      createdAt: todayStr,
      createdAtTs: nowTs,
      expiresAt: null,
      endedAt: null,
      endedBy: null,
      link: { type: "treasury", id: c.id, subType: "checks", label: "الشيك" },
      checkId: c.id,
      checkState: state,
    });
  }

  /* End any of THIS user's outstanding check-alert notifs that are no longer
     desired — covers state transitions, cleanup when a check leaves "معلق",
     AND retiring the legacy "chk_" (issue-date) notifs from V21.9.254/255. */
  for(const n of notifs){
    if(!n || n.endedAt) continue;
    if(n.toEmail !== userEmail) continue;
    if(typeof n.id !== "string") continue;
    if(!n.id.startsWith("chk_") && !n.id.startsWith("chkd_")) continue;
    if(!desiredIds.has(n.id)) out.toEndIds.push(n.id);
  }

  return out;
}
