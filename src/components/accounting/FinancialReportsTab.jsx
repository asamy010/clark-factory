/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · Financial Reports Hub
   ───────────────────────────────────────────────────────────────────────
   Container with sub-tabs for the three primary statements:
     1. قائمة الدخل (Income Statement)
     2. المركز المالي (Balance Sheet)
     3. التدفقات النقدية (Cash Flow)
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { IncomeStatement } from "./IncomeStatement.jsx";
import { BalanceSheet } from "./BalanceSheet.jsx";
import { CashFlowStatement } from "./CashFlowStatement.jsx";

const SUB_TABS = [
  {key:"is", label:"قائمة الدخل",       icon:"📊", desc:"الإيرادات والمصروفات وصافي الربح"},
  {key:"bs", label:"المركز المالي",     icon:"🏛️", desc:"الأصول والخصوم وحقوق الملكية"},
  {key:"cf", label:"التدفقات النقدية",   icon:"💸", desc:"حركة الكاش بحسب النشاط"},
];

export function FinancialReportsTab({coa, configInfo, T, FS, isMob, showToast}){
  const [active, setActive] = useState("is");

  return <div>
    {/* Sub-tab strip */}
    <div style={{display:"flex", gap:8, marginBottom:14, flexWrap:"wrap"}}>
      {SUB_TABS.map(t => {
        const isActive = active === t.key;
        return <div key={t.key} onClick={() => setActive(t.key)} style={{
          flex: isMob ? "1 1 calc(33% - 8px)" : "0 0 auto",
          padding: isMob ? "10px 12px" : "12px 18px",
          cursor:"pointer",
          background: isActive ? T.accent+"15" : T.cardSolid,
          border:"2px solid "+(isActive ? T.accent : T.brd),
          borderRadius:10,
          transition:"all 0.15s",
          minWidth: isMob ? 0 : 180,
        }}>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom: isMob?0:4}}>
            <span style={{fontSize:isMob?16:18}}>{t.icon}</span>
            <span style={{fontSize: isMob?FS-2:FS, fontWeight:800, color: isActive ? T.accent : T.text}}>{t.label}</span>
          </div>
          {!isMob && <div style={{fontSize:FS-3, color:T.textMut, marginInlineStart:26}}>{t.desc}</div>}
        </div>;
      })}
    </div>

    {/* Active sub-tab body */}
    {active === "is" && <IncomeStatement coa={coa} configInfo={configInfo} T={T} FS={FS} isMob={isMob} showToast={showToast}/>}
    {active === "bs" && <BalanceSheet     coa={coa} configInfo={configInfo} T={T} FS={FS} isMob={isMob} showToast={showToast}/>}
    {active === "cf" && <CashFlowStatement coa={coa} configInfo={configInfo} T={T} FS={FS} isMob={isMob} showToast={showToast}/>}
  </div>;
}
