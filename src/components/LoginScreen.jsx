/* ═══════════════════════════════════════════════════════════════
   CLARK - LoginScreen.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: LoginScreen
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Spinner } from "../components/ui.jsx";
import { FS } from "../constants/index.js";
import { CLARK_LOGO } from "../constants/logo.js";
import { auth, db } from "../firebase";
import { T } from "../theme.js";

export function LoginScreen(){
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{if(!email||!pass){setErr("ادخل الايميل وكلمة المرور");return}setLoading(true);setErr("");try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){setErr(e.code==="auth/invalid-credential"?"بيانات الدخول غلط":"خطأ: "+e.message)}setLoading(false)};
  const iS={width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid "+T.brd,fontSize:FS+1,fontFamily:"inherit",boxSizing:"border-box",background:T.cardSolid,color:T.text,outline:"none"};
  return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#EFF6FF,#DBEAFE,#E0F2FE)",direction:"rtl",fontFamily:"'Cairo',sans-serif",padding:20}}>
    <div style={{width:"100%",maxWidth:420,background:T.card,backdropFilter:"blur(20px)",borderRadius:28,padding:44,border:"1px solid "+T.brd,boxShadow:T.shadow}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <img src={CLARK_LOGO} alt="CLARK" style={{width:200,marginBottom:12}}/>
        <div style={{fontSize:FS,color:T.textSec}}>نظام ادارة القص والتشغيل</div>
      </div>
      <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>البريد الالكتروني</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@email.com" type="email" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
      <div style={{marginBottom:20}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>كلمة المرور</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
      {err&&<div style={{color:T.err,fontSize:FS,marginBottom:12,textAlign:"center",fontWeight:600}}>{err}</div>}
      <button onClick={handleLogin} disabled={loading} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",color:"#fff",fontSize:FS+2,fontWeight:800,border:"none",cursor:loading?"default":"pointer",boxShadow:"0 4px 16px "+T.accent+"33",fontFamily:"inherit",opacity:loading?0.85:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:10}}>{loading&&<Spinner size="small" color="#fff" inline/>}<span>{loading?"جاري الدخول...":"تسجيل الدخول"}</span></button>
      <div style={{textAlign:"center",marginTop:14,fontSize:FS-1,color:T.textMut}}>تواصل مع المدير للحصول على حساب</div>
    </div>
  </div>
}

export const TABS=[
  {key:"dashboard",label:"لوحة التحكم",icon:"📊",color:"#0EA5E9",bg:"#E0F2FE",svg:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20h20"/></>},
  {key:"details",label:"أوامر القص",icon:"✂️",color:"#8B5CF6",bg:"#EDE9FE",svg:<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></>},
  {key:"external",label:"تشغيل خارجي",icon:"🏗️",color:"#10B981",bg:"#D1FAE5",svg:<><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect x="2" y="6" width="20" height="16" rx="2"/><path d="M2 10h20"/></>},
  /* V18.25: 'تسليم مخزن جاهز' tab removed — same functionality available via the '+ تسليم' button inside each order's detail page */
  {key:"reports",label:"التقارير",icon:"📑",color:"#06B6D4",bg:"#CFFAFE",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>},
  {key:"tasks",label:"المهام",icon:"✅",color:"#F59E0B",bg:"#FEF3C7",svg:<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>},
  {key:"db",label:"قاعدة البيانات",icon:"🗃️",color:"#EF4444",bg:"#FEE2E2",svg:<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>},
  {key:"custDeliver",label:"مبيعات",icon:"🛒",color:"#059669",bg:"#ECFDF5",svg:<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>},
  /* V21.10.0 — Sales Pipeline (#3 Slice 1): Quotations as the upstream document. */
  {key:"salesQuotations",label:"عروض الأسعار",icon:"📋",color:"#0EA5E9",bg:"#E0F2FE",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>},
  /* V21.10.1 — Sales Pipeline (#3 Slice 2): Sales Orders confirmed from quotations. */
  {key:"salesOrders",label:"أوامر البيع",icon:"📑",color:"#8B5CF6",bg:"#EDE9FE",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></>},
  {key:"salesInvoices",label:"فواتير المبيعات",icon:"📤",color:"#10B981",bg:"#D1FAE5",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>},
  {key:"creditNotes",label:"إشعارات دائنة",icon:"↩️",color:"#EF4444",bg:"#FEE2E2",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 14l-2 2 2 2"/><path d="M7 16h6a3 3 0 0 0 3-3v-1"/></>},
  /* V21.10.5 — Purchase Pipeline #3 Slice 6: RFQs */
  {key:"purchaseRFQs",label:"عروض الموردين",icon:"📋",color:"#0EA5E9",bg:"#E0F2FE",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>},
  {key:"purchase",label:"مشتريات",icon:"🛍️",color:"#D97706",bg:"#FEF3C7",svg:<><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>},
  {key:"purchaseInvoices",label:"فواتير المشتريات",icon:"📥",color:"#F59E0B",bg:"#FEF3C7",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></>},
  /* V19.41: Debit notes (purchase returns) */
  {key:"debitNotes",label:"إشعارات مدينة",icon:"↪️",color:"#3B82F6",bg:"#DBEAFE",svg:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M15 14l2 2-2 2"/><path d="M17 16h-6a3 3 0 0 1-3-3v-1"/></>},
  {key:"warehouse",label:"المخازن",icon:"📦",color:"#0D9488",bg:"#CCFBF1",svg:<><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35a2 2 0 0 1 1.26-1.86l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35z"/><path d="M6 18V10"/><path d="M18 18V10"/><path d="M6 14h12"/></>},
  /* V19.81.0: Pieces lookup — scan a piece QR to see its full lifecycle (sold/returned/re-sold).
     Sits next to المخازن because it's a warehouse-floor tool. */
  {key:"pieces",label:"تتبع القطع (QR)",icon:"🔍",color:"#0EA5E9",bg:"#E0F2FE",svg:<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><rect x="7" y="7" width="2.5" height="2.5"/><rect x="12.5" y="7" width="2.5" height="2.5"/><rect x="7" y="12.5" width="2.5" height="2.5"/></>},
  {key:"treasury",label:"الخزنة",icon:"💵",color:"#0D9488",bg:"#CCFBF1",svg:<><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01 M18 12h.01"/></>},
  {key:"hr",label:"مرتبات + موظفين",icon:"🧑‍💼",color:"#7C3AED",bg:"#EDE9FE",svg:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>},
  /* V19.19: Bulk messaging campaigns */
  {key:"campaigns",label:"الحملات والرسائل",icon:"📣",color:"#7C3AED",bg:"#EDE9FE",svg:<><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></>},
  /* V19.68: Automation hub — daily reports + event triggers via WhatsApp bridge.
     V19.73: Label switched to English "Automation" for consistency with the
     "AI Agent" tab label — both are technical/communication features and the
     English term reads cleaner alongside the Arabic operational labels. */
  {key:"automation",label:"Automation",icon:"🤖",color:"#0EA5E9",bg:"#E0F2FE",svg:<><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></>},
  /* V19.71: AI Agent — control center + training school for the WhatsApp B2B sales agent.
     Distinct from "الأتمتة" (rule-based scheduling): this is the LLM-driven conversational agent.
     Label is intentionally English ("AI Agent") per user preference — it's a globally recognized
     product term and visually separates it from the rule-based automation tab above.
     V19.72: Icon swapped to a solid-fill robot mascot (square head + antenna + side ears + 2 round
     eyes) per user's uploaded reference. The Home tile's outer SVG is `fill="none" stroke="currentColor"`,
     so we override fill="currentColor" on body/ears/antenna-bulb and fill="white" on eyes to get
     the solid look against the tile's tinted background. */
  {key:"aiAgent",label:"AI Agent",icon:"🤖",color:"#8B5CF6",bg:"#EDE9FE",svg:<>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <circle cx="12" cy="2" r="0.9" fill="currentColor"/>
    <rect x="2" y="11" width="2.6" height="4.2" rx="0.6" fill="currentColor" stroke="none"/>
    <rect x="19.4" y="11" width="2.6" height="4.2" rx="0.6" fill="currentColor" stroke="none"/>
    <rect x="5" y="6" width="14" height="14" rx="2.4" fill="currentColor"/>
    <circle cx="9.4" cy="13" r="1.7" fill="white" stroke="none"/>
    <circle cx="14.6" cy="13" r="1.7" fill="white" stroke="none"/>
  </>},
  /* V19.91: Shopify B2C Integration — Two-Stage COD-aware workflow.
     Order Stage (reservation) → Delivery Stage (invoice + treasury).
     Shopify SKU = CLARK model_no, default customer "Shopify Customer".
     Phase 0 in MVP: only Connection sub-tab is functional; the other 6 sub-tabs
     show "قيد التطوير" placeholders pending Phase 1+ rollout. */
  {key:"shopify",label:"Shopify",icon:"🛍️",color:"#96BF48",bg:"#F1F8E5",svg:<><path d="M9 4l-2 2v3a3 3 0 0 1-3 3v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a3 3 0 0 1-3-3V6l-2-2z"/><path d="M9 4c0-1 1-2 3-2s3 1 3 2"/><circle cx="12" cy="14" r="1.5"/></>},
  {key:"audit",label:"سجل التدقيق",icon:"🔍",color:"#DC2626",bg:"#FEE2E2",svg:<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M11 8v3l2 2"/></>},
  {key:"accounting",label:"محاسبة",icon:"📊",color:"#0891B2",bg:"#CFFAFE",svg:<><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/><circle cx="7" cy="14" r="1.5"/><circle cx="11" cy="10" r="1.5"/><circle cx="15" cy="14" r="1.5"/><circle cx="20" cy="9" r="1.5"/></>},
  {key:"fixedAssets",label:"أصول ثابتة",icon:"🏭",color:"#0EA5E9",bg:"#E0F2FE",svg:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M5 17l3-3 4 2 7-7"/></>},
  {key:"settings",label:"الاعدادات",icon:"⚙️",color:"#64748B",bg:"#F1F5F9",svg:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}
];

/* ══ MAIN APP ══ */
