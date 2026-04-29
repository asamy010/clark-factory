/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AccountingPg — Main Accounting Page
   ───────────────────────────────────────────────────────────────────────
   Combines four sub-tabs:
     1. شجرة الحسابات (Chart of Accounts)
     2. دفتر اليومية (Journal)
     3. ميزان المراجعة (Trial Balance)
     4. الإعدادات (Settings + Backfill)
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { useWin } from "../components/ui.jsx";
import { ChartOfAccountsTab } from "../components/accounting/ChartOfAccountsTab.jsx";
import { JournalTab } from "../components/accounting/JournalTab.jsx";
import { TrialBalanceTab } from "../components/accounting/TrialBalanceTab.jsx";
import { FinancialReportsTab } from "../components/accounting/FinancialReportsTab.jsx";
import { PartyLedgerTab } from "../components/accounting/PartyLedgerTab.jsx";
import { AccountingSettingsTab } from "../components/accounting/AccountingSettingsTab.jsx";
import { readDayRange } from "../utils/accounting/dayDoc.js";

const TAB_DEFS = [
  {key:"coa",      label:"شجرة الحسابات", icon:"🌳"},
  {key:"journal",  label:"دفتر اليومية",  icon:"📔"},
  {key:"tb",       label:"ميزان المراجعة", icon:"⚖️"},
  {key:"party",    label:"كشف حساب طرف",   icon:"👥"},
  {key:"reports",  label:"القوائم المالية", icon:"📈"},
  {key:"settings", label:"الإعدادات",     icon:"⚙️"},
];

/* Toast helper local to this page (avoid coupling with global toast). */
function useToast(){
  const [msg, setMsg] = useState("");
  const show = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2200);
  };
  const node = msg ? <div style={{
    position:"fixed", bottom:24, insetInlineStart:"50%", transform:"translateX(-50%)",
    background:T.text, color:T.cardSolid, padding:"10px 18px", borderRadius:8,
    fontSize:FS-1, fontWeight:700, zIndex:99999, boxShadow:"0 8px 24px rgba(0,0,0,0.25)",
    pointerEvents:"none",
  }}>{msg}</div> : null;
  return [show, node];
}

export function AccountingPg({data, config, upConfig, isMob, user}){
  const [active, setActive] = useState("coa");
  const [showToast, ToastNode] = useToast();
  const winW = useWin();
  const isPhone = winW < 720;
  const userName = user?.displayName || (user?.email||"").split("@")[0] || "";

  /* For canDeleteAccount checks in CoA tab, we need to know which accounts
     are referenced in entries. Lazy-load a wide range (last 5 yrs) once. */
  const [allEntries, setAllEntries] = useState([]);
  useEffect(() => {
    let cancelled = false;
    /* On mount only — and only when CoA tab is opened (cheap on first load) */
    const today = new Date();
    const past  = new Date();
    past.setFullYear(past.getFullYear()-5);
    readDayRange(past, today).then(days => {
      if(cancelled) return;
      const flat = [];
      (days||[]).forEach(d => (d.entries||[]).forEach(e => flat.push(e)));
      setAllEntries(flat);
    }).catch(e => console.warn("[AccountingPg] preload failed:", e));
    return () => { cancelled = true; };
  }, []);

  const coa = config.coa || [];

  return <div style={{padding: isPhone ? 12 : 20, maxWidth:1400, margin:"0 auto"}}>
    {/* Page header */}
    <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
      <div style={{
        width:48, height:48, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:24, background:"linear-gradient(135deg, #0EA5E9, #8B5CF6)", color:"#fff",
        boxShadow:"0 4px 12px rgba(14,165,233,0.3)",
      }}>📊</div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:FS+4, fontWeight:800, color:T.text}}>المحاسبة</div>
        <div style={{fontSize:FS-2, color:T.textSec}}>شجرة الحسابات · دفتر اليومية · ميزان المراجعة · إعدادات الترحيل</div>
      </div>
      {coa.length === 0 && <div style={{padding:"6px 12px", borderRadius:6, background:T.warn+"15", color:T.warn, fontSize:FS-2, fontWeight:700, border:"1px solid "+T.warn+"40"}}>
        ⚠️ لم يتم إعداد شجرة الحسابات بعد
      </div>}
      {/* V18.38: failure badge with click-to-settings */}
      {(() => {
        const failures = (config.accountingPostFailures||[]).filter(f => !f.resolvedAt);
        if(failures.length === 0) return null;
        return <div onClick={() => setActive("settings")} style={{padding:"6px 12px", borderRadius:6, background:T.err+"15", color:T.err, fontSize:FS-2, fontWeight:700, border:"1px solid "+T.err+"40", cursor:"pointer", display:"flex", alignItems:"center", gap:6}}>
          <span>⚠️</span><span>{failures.length} عملية فشل ترحيلها</span><span style={{fontSize:FS-3, opacity:0.7}}>(اضغط للمراجعة)</span>
        </div>;
      })()}
    </div>

    {/* Tabs */}
    <div style={{display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", borderBottom:"2px solid "+T.brd, paddingBottom:0}}>
      {TAB_DEFS.map(t => {
        const isActive = active === t.key;
        return <div key={t.key} onClick={() => setActive(t.key)} style={{
          padding: isPhone ? "8px 12px" : "10px 18px",
          cursor:"pointer", fontSize: isPhone ? FS-1 : FS,
          fontWeight: isActive ? 800 : 600,
          color: isActive ? T.accent : T.textSec,
          borderBottom: isActive ? "3px solid "+T.accent : "3px solid transparent",
          marginBottom:-2, display:"flex", alignItems:"center", gap:6,
          transition:"all 0.15s",
        }}>
          <span>{t.icon}</span><span>{t.label}</span>
        </div>;
      })}
    </div>

    {/* Tab body */}
    {active === "coa" && <ChartOfAccountsTab
      coa={coa} allEntries={allEntries} upConfig={upConfig}
      T={T} FS={FS} isMob={isMob} showToast={showToast} userName={userName}
    />}
    {active === "journal" && <JournalTab
      coa={coa} config={config}
      T={T} FS={FS} isMob={isMob} showToast={showToast} userName={userName}
    />}
    {active === "tb" && <TrialBalanceTab
      coa={coa}
      T={T} FS={FS} isMob={isMob} showToast={showToast}
    />}
    {active === "party" && <PartyLedgerTab
      coa={coa} data={data}
      configInfo={{factoryName: config.factoryName||"CLARK", logo: config.logo, address: config.address||"", phone: config.phone||""}}
      T={T} FS={FS} isMob={isMob} showToast={showToast}
    />}
    {active === "reports" && <FinancialReportsTab
      coa={coa} configInfo={{factoryName: config.factoryName||"CLARK", logo: config.logo, address: config.address||"", phone: config.phone||""}}
      T={T} FS={FS} isMob={isMob} showToast={showToast}
    />}
    {active === "settings" && <AccountingSettingsTab
      config={config} upConfig={upConfig} coa={coa}
      T={T} FS={FS} isMob={isMob} showToast={showToast} userName={userName}
    />}

    {ToastNode}
  </div>;
}
