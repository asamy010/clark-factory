/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ReviewRequestModal (V18.90)
   ───────────────────────────────────────────────────────────────────────
   Lightweight modal for "طلب مراجعة" — sends a notification to a chosen
   user with a deep-link back to the entity (invoice/order/etc).

   Used by SalesInvoicesPg, PurchaseInvoicesPg, DetPg (orders), and later
   TreasuryPg, ExtProdPg, HRPg.

   The notification uses the existing schema from V18.87 with one new
   field: `link: {type, id, subType?, label}` which the click handler
   in App.jsx routes to the right destination.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";

export function ReviewRequestModal({
  /* The entity being referenced */
  link,        /* {type, id, subType?, label} */
  /* Default message text (caller can pre-fill, user can edit) */
  defaultMsg,
  /* Source */
  data, upConfig, user, userRole,
  /* Lifecycle */
  onClose,
}){
  const me = useMemo(() => ({
    email: user?.email || "",
    name: user?.displayName || (user?.email||"").split("@")[0] || "",
  }), [user]);

  /* Available recipients = all users except me. Admin sees all; others see all too
     but may need to consider permissions on the destination. We keep it open and
     trust the user to pick the right person. */
  const allUsers = (data.usersList || []).filter(u => u.email && u.email !== me.email);

  const [toEmail, setToEmail] = useState(allUsers[0]?.email || "");
  const [msg, setMsg] = useState(defaultMsg || "راجع من فضلك");
  const [type, setType] = useState("طلب");/* default: طلب */
  const [duration, setDuration] = useState("1d");/* default: 1 day for review requests */

  const canSend = toEmail && msg.trim() && link?.type && link?.id;

  const send = () => {
    if(!canSend) return;
    const target = allUsers.find(u => u.email === toEmail);
    /* Compute expiresAt */
    let expiresAt = null;
    const now = new Date();
    if(duration === "1h") expiresAt = new Date(now.getTime() + 60*60*1000).toISOString();
    else if(duration === "2h") expiresAt = new Date(now.getTime() + 2*60*60*1000).toISOString();
    else if(duration === "1d") expiresAt = new Date(now.getTime() + 24*60*60*1000).toISOString();
    else if(duration === "endday") {const eod = new Date(now); eod.setHours(23,59,59,999); expiresAt = eod.toISOString();}
    /* "none" → null */

    upConfig(d => {
      if(!d.notifications) d.notifications = [];
      d.notifications.push({
        id: Date.now(),
        toEmail,
        toName: target?.name || toEmail.split("@")[0],
        msg: msg.trim(),
        type,
        fromName: me.name,
        fromEmail: me.email,
        createdAt: new Date().toISOString().split("T")[0],
        createdAtTs: new Date().toISOString(),
        expiresAt,
        endedAt: null,
        endedBy: null,
        /* V19.53: readBy/dismissedBy moved to userNotifStates/{email} per-user docs */
        /* V18.90: deep-link payload — clicked → routes to entity */
        link: {
          type: link.type,
          id: link.id,
          subType: link.subType || null,
          label: link.label || "",
        },
      });
    });
    showToast("📌 تم إرسال طلب مراجعة لـ "+(target?.name||toEmail.split("@")[0]));
    onClose();
  };

  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={(e)=>{if(e.target===e.currentTarget)onClose()}}>
    <div style={{background:T.bg,borderRadius:14,maxWidth:480,width:"100%",border:"2px solid #8B5CF640",boxShadow:"0 25px 70px rgba(0,0,0,0.4)",overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.brd,background:"#8B5CF608"}}>
        <div style={{fontSize:FS+2,fontWeight:900,color:"#8B5CF6"}}>📌 طلب مراجعة</div>
        <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>
          الوجهة: <b style={{color:T.text}}>{link?.label||"—"}</b>
        </div>
      </div>

      <div style={{padding:18,display:"flex",flexDirection:"column",gap:12}}>
        {allUsers.length === 0 ? (
          <div style={{padding:14,borderRadius:10,background:T.warn+"15",color:T.warn,fontSize:FS-1,textAlign:"center",fontWeight:700}}>
            ⚠️ لا يوجد مستخدمين آخرين لإرسال الطلب لهم
          </div>
        ) : (<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>إلى *</label>
              <Sel value={toEmail} onChange={setToEmail}>
                {allUsers.map(u => <option key={u.email} value={u.email}>{u.name || u.email.split("@")[0]}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>النوع</label>
              <Sel value={type} onChange={setType}>
                <option value="طلب">📩 طلب</option>
                <option value="مهمة">📌 مهمة</option>
                <option value="مهمة عاجلة">🔴 عاجل</option>
              </Sel>
            </div>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:700}}>الرسالة *</label>
            <Inp value={msg} onChange={setMsg} placeholder="مثلاً: راجع الكميات قبل الترحيل"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:"#8B5CF6",fontWeight:700}}>⏱ مدة العرض</label>
            <Sel value={duration} onChange={setDuration}>
              <option value="1h">🕐 ساعة</option>
              <option value="2h">⏰ ساعتين</option>
              <option value="1d">📅 يوم</option>
              <option value="endday">🌅 آخر اليوم</option>
              <option value="none">🔓 بدون حد</option>
            </Sel>
          </div>
        </>)}

        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:6,paddingTop:12,borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={onClose}>إلغاء</Btn>
          <Btn onClick={send} disabled={!canSend} style={{background:canSend?"#8B5CF6":T.brd,color:"#fff",fontWeight:700,opacity:canSend?1:0.5}}>📌 إرسال</Btn>
        </div>
      </div>
    </div>
  </div>;
}
