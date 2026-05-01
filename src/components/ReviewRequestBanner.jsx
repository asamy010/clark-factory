/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ReviewRequestBanner (V18.94)
   ───────────────────────────────────────────────────────────────────────
   Yellow banner shown ABOVE the destination entity (invoice/order/etc)
   when:
   - The current user is the SENDER of an active review request (fromEmail === me)
   - The notification's link.id matches the entity being viewed
   - The notification is still active (!endedAt && !expired)

   The button "⏹ إنهاء طلب المراجعة" lets the sender close the loop
   after they've confirmed the work was done — the chip vanishes for
   everyone (recipient + admins).
   ═══════════════════════════════════════════════════════════════════════ */

import { useMemo } from "react";
import { Btn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";

export function ReviewRequestBanner({
  /* What entity are we on? */
  linkType,    /* "invoice" | "order" | "treasury" | "workshop" | "hrWeek" */
  linkId,      /* the id we're viewing */
  linkSubType, /* optional — for invoice: "sales" | "purchase" */
  /* Source */
  data, upConfig, user,
}){
  const userEmail = user?.email || "";

  /* Find active review request that I sent for this exact entity */
  const myRequest = useMemo(() => {
    const _now = Date.now();
    return (data.notifications || []).find(n => {
      if(!n.link) return false;
      if(n.fromEmail !== userEmail) return false;
      if(n.link.type !== linkType) return false;
      if(String(n.link.id) !== String(linkId)) return false;
      if(linkSubType && n.link.subType && n.link.subType !== linkSubType) return false;
      if(n.endedAt) return false;
      if(n.expiresAt && new Date(n.expiresAt).getTime() <= _now) return false;
      return true;
    });
  }, [data.notifications, userEmail, linkType, linkId, linkSubType]);

  if(!myRequest) return null;

  /* Format relative "since" — how long ago */
  const sinceText = (() => {
    if(!myRequest.createdAtTs) return "";
    const ms = Date.now() - new Date(myRequest.createdAtTs).getTime();
    if(ms < 0) return "";
    const mins = Math.floor(ms / 60000);
    if(mins < 1) return "الآن";
    if(mins < 60) return "منذ " + mins + " دقيقة";
    const hrs = Math.floor(mins / 60);
    if(hrs < 24) return "منذ " + hrs + " ساعة" + (mins%60>0?" و"+(mins%60)+" دقيقة":"");
    const days = Math.floor(hrs / 24);
    return "منذ " + days + " يوم" + (hrs%24>0?" و"+(hrs%24)+" ساعة":"");
  })();

  const endRequest = () => {
    upConfig(d => {
      const n = (d.notifications || []).find(x => x.id === myRequest.id);
      if(!n) return;
      n.endedAt = new Date().toISOString();
      n.endedBy = userEmail;
    });
    showToast("⏹ تم إنهاء طلب المراجعة");
  };

  return <div style={{
    padding: "12px 16px",
    background: "#FEF3C7",
    border: "1.5px solid #F59E0B",
    borderRadius: 10,
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  }}>
    <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>📌</span>
    <div style={{ flex: 1, minWidth: 0, fontSize: FS-1, color: "#78350F", lineHeight: 1.6 }}>
      إنت طلبت مراجعة من <b style={{ color: "#92400E" }}>{myRequest.toName || myRequest.toEmail || "—"}</b>
      {sinceText && <span style={{ opacity: 0.75 }}> · {sinceText}</span>}
      {myRequest.msg && <div style={{ fontSize: FS-2, color: "#A16207", marginTop: 3, fontStyle: "italic" }}>"{myRequest.msg}"</div>}
    </div>
    <Btn onClick={endRequest} style={{
      background: "#DC2626",
      color: "#fff",
      border: "none",
      fontWeight: 800,
      whiteSpace: "nowrap",
      fontSize: FS-1,
      padding: "8px 16px",
    }}>⏹ إنهاء طلب المراجعة</Btn>
  </div>;
}
