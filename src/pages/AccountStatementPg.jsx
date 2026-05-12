/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AccountStatementPg (V21.11.0 — Feature #4)
   ───────────────────────────────────────────────────────────────────────
   Standalone كشف حساب tab. Party picker (customer/supplier) → date range +
   filters → 3-column statement (debit / credit / running balance) → print
   + WhatsApp share.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, PRINT_CSS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import {
  buildAccountStatement, buildStatementWhatsAppMessage,
} from "../utils/accounting/statement.js";

export function AccountStatementPg({ data, isMob, user }){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0,4) + "-01-01";
  const [partyType, setPartyType] = useState("customer");
  const [partyId, setPartyId]     = useState("");
  const [from, setFrom]           = useState(yearStart);
  const [to, setTo]               = useState(today);
  const [invoiceNoFilter, setInvoiceNoFilter] = useState("");
  const [showInvoices, setShowInvoices] = useState(true);
  const [showCreditNotes, setShowCreditNotes] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [includeOpening, setIncludeOpening] = useState(true);

  const customers = (data.customers || []).filter(c => !c.archived);
  const suppliers = (data.suppliers || []).filter(s => !s.archived);
  const partyList = partyType === "customer" ? customers : suppliers;
  const party = partyList.find(p => p.id === partyId);

  const result = useMemo(() => {
    if(!partyId) return { rows: [], openingBalance: 0, totals: {}, legacyFragmentation: [] };
    return buildAccountStatement(data, {
      partyId,
      partyType,
      fromDate: from || null,
      toDate: to || null,
      invoiceNoFilter,
      typeFilters: { invoices: showInvoices, creditNotes: showCreditNotes, payments: showPayments },
      includeOpeningBalance: includeOpening,
    });
  }, [data, partyId, partyType, from, to, invoiceNoFilter, showInvoices, showCreditNotes, showPayments, includeOpening]);

  const { rows, openingBalance, totals, legacyFragmentation } = result;
  const closing = totals.closingBalance || 0;
  const balanceDirection = partyType === "customer"
    ? (closing > 0 ? "مدين لنا" : closing < 0 ? "ليه عندنا" : "متسوّي")
    : (closing > 0 ? "علينا للمورد" : closing < 0 ? "المورد عليه" : "متسوّي");
  const balanceColor = closing > 0 ? T.err : closing < 0 ? T.ok : T.textMut;

  const handlePrint = () => {
    if(!party) return;
    const html = buildPrintHtml(party, partyType, result, { from, to }, data);
    const w = window.open("", "_blank");
    if(!w){ showToast("⚠️ الـ popup blocker قافل النافذة"); return; }
    w.document.write(html); w.document.close();
  };

  const handleWhatsApp = () => {
    if(!party) return;
    const msg = buildStatementWhatsAppMessage(party, result);
    const phone = (party.phone || "").replace(/[^0-9]/g, "");
    if(!phone){
      showToast("⚠️ مفيش رقم تليفون للطرف");
      return;
    }
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
    window.open(url, "_blank");
  };

  return <div style={{padding: isMob ? 8 : 16, maxWidth: 1400, margin: "0 auto"}}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, flexWrap:"wrap", gap: 8}}>
      <div>
        <h2 style={{margin: 0, fontSize: FS+6, color: T.text}}>📊 كشف حساب تراكمي</h2>
        <div style={{fontSize: FS-2, color: T.textMut, marginTop: 2}}>
          مدين / دائن / رصيد — لعميل أو مورد
        </div>
      </div>
      {party && <div style={{display:"flex", gap: 6}}>
        <Btn small onClick={handlePrint}>🖨 طباعة</Btn>
        <Btn small onClick={handleWhatsApp} style={{background:"#25D366", color:"#fff"}}>📱 واتساب</Btn>
      </div>}
    </div>

    {/* Party type + party selector */}
    <Card style={{padding: 12, marginBottom: 12}}>
      <div style={{display:"grid", gridTemplateColumns:"auto 1fr", gap: 12, marginBottom: 8}}>
        <div>
          <label style={{fontSize: FS-3, color: T.textMut, fontWeight: 600}}>النوع</label>
          <div style={{display:"flex", gap: 4, marginTop: 4}}>
            <button onClick={() => { setPartyType("customer"); setPartyId(""); }}
              style={{padding:"6px 14px", borderRadius: 8, fontWeight: 700,
                background: partyType === "customer" ? T.accent : T.bg,
                color: partyType === "customer" ? "#fff" : T.text,
                border: "1px solid " + (partyType === "customer" ? T.accent : T.brd),
                cursor:"pointer"}}>
              👤 عميل
            </button>
            <button onClick={() => { setPartyType("supplier"); setPartyId(""); }}
              style={{padding:"6px 14px", borderRadius: 8, fontWeight: 700,
                background: partyType === "supplier" ? "#D97706" : T.bg,
                color: partyType === "supplier" ? "#fff" : T.text,
                border: "1px solid " + (partyType === "supplier" ? "#D97706" : T.brd),
                cursor:"pointer"}}>
              🏭 مورد
            </button>
          </div>
        </div>
        <div>
          <label style={{fontSize: FS-3, color: T.textMut, fontWeight: 600}}>{partyType === "customer" ? "العميل" : "المورد"} *</label>
          <Sel value={partyId} onChange={setPartyId}>
            <option value="">— اختر —</option>
            {partyList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Sel>
        </div>
      </div>

      {/* Filters */}
      {partyId && <div style={{display:"flex", gap: 8, flexWrap:"wrap", alignItems:"flex-end", borderTop: "1px solid " + T.brd, paddingTop: 12, marginTop: 8}}>
        <div style={{minWidth: 140}}><label style={{fontSize: FS-3, color: T.textMut}}>من</label><Inp type="date" value={from} onChange={setFrom}/></div>
        <div style={{minWidth: 140}}><label style={{fontSize: FS-3, color: T.textMut}}>إلى</label><Inp type="date" value={to} onChange={setTo}/></div>
        <div style={{minWidth: 160}}><label style={{fontSize: FS-3, color: T.textMut}}>رقم فاتورة</label><Inp value={invoiceNoFilter} onChange={setInvoiceNoFilter} placeholder="INV/PINV..."/></div>
        <div style={{display:"flex", gap: 8, alignItems:"center", flexWrap:"wrap"}}>
          <label style={{fontSize: FS-2, color: T.text, cursor:"pointer"}}>
            <input type="checkbox" checked={showInvoices} onChange={e => setShowInvoices(e.target.checked)}/> فواتير
          </label>
          <label style={{fontSize: FS-2, color: T.text, cursor:"pointer"}}>
            <input type="checkbox" checked={showCreditNotes} onChange={e => setShowCreditNotes(e.target.checked)}/> مرتجعات
          </label>
          <label style={{fontSize: FS-2, color: T.text, cursor:"pointer"}}>
            <input type="checkbox" checked={showPayments} onChange={e => setShowPayments(e.target.checked)}/> دفعات
          </label>
          <label style={{fontSize: FS-2, color: T.text, cursor:"pointer"}}>
            <input type="checkbox" checked={includeOpening} onChange={e => setIncludeOpening(e.target.checked)}/> رصيد افتتاحي
          </label>
        </div>
      </div>}
    </Card>

    {!partyId ? (
      <Card style={{padding: 60, textAlign:"center", color: T.textMut, fontSize: FS-1}}>
        اختر {partyType === "customer" ? "عميل" : "مورد"} لعرض كشف الحساب
      </Card>
    ) : (
      <>
        {/* Party header */}
        <Card style={{padding: 12, marginBottom: 12, background: T.accent + "08"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap: 8}}>
            <div>
              <div style={{fontSize: FS+2, fontWeight: 800, color: T.accent}}>{party?.name}</div>
              <div style={{fontSize: FS-2, color: T.textMut, marginTop: 2}}>
                {party?.phone ? "📱 " + party.phone : ""}
                {party?.address ? " • 📍 " + party.address : ""}
              </div>
            </div>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize: FS-2, color: T.textMut}}>الرصيد الحالي</div>
              <div style={{fontSize: FS+4, fontWeight: 800, color: balanceColor}}>
                {fmt(Math.abs(closing))} ج.م
              </div>
              <div style={{fontSize: FS-3, color: balanceColor, fontWeight: 700}}>
                {balanceDirection}
              </div>
            </div>
          </div>
        </Card>

        {/* Legacy fragmentation banner */}
        {legacyFragmentation.length > 0 && (
          <Card style={{padding: 12, marginBottom: 12, background: "#F59E0B10", border: "1px solid #F59E0B40"}}>
            <div style={{fontSize: FS-1, color: T.warn, fontWeight: 700}}>
              ⚠️ {legacyFragmentation.length} توزيعة قديمة فواتيرها متفرقة
            </div>
            <div style={{fontSize: FS-2, color: T.textSec, marginTop: 4}}>
              فيه {legacyFragmentation.length} توزيعة اتعملت قبل V21.x وفواتيرها مش مدموجة. ده تأثيره على شكل الكشف فقط — الأرقام والرصيد صحيحين. يمكن دمجها لاحقاً من DiagnosticsPanel (Feature #7).
            </div>
          </Card>
        )}

        {/* Statement table */}
        <Card style={{padding: 0, overflow:"hidden", marginBottom: 12}}>
          <div style={{overflowX: "auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize: FS-1, minWidth: 700}}>
              <thead>
                <tr style={{background: T.bg, borderBottom: "2px solid " + T.brd}}>
                  <th style={{padding:"10px 8px", textAlign:"right", whiteSpace:"nowrap"}}>التاريخ</th>
                  <th style={{padding:"10px 8px", textAlign:"right"}}>البيان</th>
                  <th style={{padding:"10px 8px", textAlign:"right", whiteSpace:"nowrap"}}>المرجع</th>
                  <th style={{padding:"10px 8px", textAlign:"left", whiteSpace:"nowrap"}}>مدين</th>
                  <th style={{padding:"10px 8px", textAlign:"left", whiteSpace:"nowrap"}}>دائن</th>
                  <th style={{padding:"10px 8px", textAlign:"left", whiteSpace:"nowrap", position: "sticky", right: 0, background: T.bg}}>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                {includeOpening && from && (
                  <tr style={{borderBottom: "2px solid " + T.brd, background: T.bg}}>
                    <td style={{padding:"8px", fontStyle:"italic", color: T.textMut}}>{from}</td>
                    <td style={{padding:"8px", fontWeight: 700, color: T.textMut}} colSpan={2}>رصيد افتتاحي حتى {from}</td>
                    <td style={{padding:"8px", textAlign:"left"}}>{openingBalance > 0 ? fmt(openingBalance) : ""}</td>
                    <td style={{padding:"8px", textAlign:"left"}}>{openingBalance < 0 ? fmt(-openingBalance) : ""}</td>
                    <td style={{padding:"8px", textAlign:"left", fontWeight: 700, position: "sticky", right: 0, background: T.bg}}>{fmt(openingBalance)}</td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i} style={{borderBottom: "1px solid " + T.brd,
                    background: r.type.includes("discount") ? T.bg : "transparent"}}>
                    <td style={{padding:"8px"}}>{r.date}</td>
                    <td style={{padding:"8px"}}>
                      {r.description}
                      {(r.linkedQuoteNo || r.linkedSONo || r.linkedPPONo || r.linkedRFQNo) && (
                        <div style={{fontSize: FS-3, color: T.textMut, marginTop: 2}}>
                          {r.linkedQuoteNo && <>🔗 {r.linkedQuoteNo} </>}
                          {r.linkedSONo && <>→ {r.linkedSONo} </>}
                          {r.linkedRFQNo && <>🔗 {r.linkedRFQNo} </>}
                          {r.linkedPPONo && <>→ {r.linkedPPONo} </>}
                          {r.linkedInvoiceNo && <>→ {r.linkedInvoiceNo}</>}
                        </div>
                      )}
                    </td>
                    <td style={{padding:"8px", fontFamily:"monospace", color: T.accent, fontWeight: 600}}>{r.refNo}</td>
                    <td style={{padding:"8px", textAlign:"left", color: r.debit > 0 ? T.text : T.textMut}}>
                      {r.debit > 0 ? fmt(r.debit) : "—"}
                    </td>
                    <td style={{padding:"8px", textAlign:"left", color: r.credit > 0 ? T.text : T.textMut}}>
                      {r.credit > 0 ? fmt(r.credit) : "—"}
                    </td>
                    <td style={{padding:"8px", textAlign:"left", fontWeight: 700, color: T.accent, position: "sticky", right: 0, background: r.type.includes("discount") ? T.bg : T.cardSolid}}>
                      {fmt(r.balance)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{padding: 40, textAlign:"center", color: T.textMut}}>
                      مفيش حركات في النطاق المحدد
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{background: T.accent + "12", borderTop: "2px solid " + T.accent}}>
                    <td colSpan={3} style={{padding:"10px 8px", fontWeight: 800, color: T.accent}}>
                      الإجمالي ({totals.rowCount} حركة)
                    </td>
                    <td style={{padding:"10px 8px", textAlign:"left", fontWeight: 800, color: T.accent}}>
                      {fmt(totals.totalDebit)}
                    </td>
                    <td style={{padding:"10px 8px", textAlign:"left", fontWeight: 800, color: T.accent}}>
                      {fmt(totals.totalCredit)}
                    </td>
                    <td style={{padding:"10px 8px", textAlign:"left", fontWeight: 800, color: T.accent, position: "sticky", right: 0, background: T.accent + "12"}}>
                      {fmt(totals.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        {/* Summary card */}
        {rows.length > 0 && (
          <Card style={{padding: 12, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap: 12}}>
            <div>
              <div style={{fontSize: FS-3, color: T.textMut}}>الرصيد الافتتاحي</div>
              <div style={{fontSize: FS+2, fontWeight: 800, color: T.text}}>{fmt(openingBalance)} ج.م</div>
            </div>
            <div>
              <div style={{fontSize: FS-3, color: T.textMut}}>إجمالي مدين</div>
              <div style={{fontSize: FS+2, fontWeight: 800, color: T.text}}>{fmt(totals.totalDebit)} ج.م</div>
            </div>
            <div>
              <div style={{fontSize: FS-3, color: T.textMut}}>إجمالي دائن</div>
              <div style={{fontSize: FS+2, fontWeight: 800, color: T.text}}>{fmt(totals.totalCredit)} ج.م</div>
            </div>
            <div>
              <div style={{fontSize: FS-3, color: T.textMut}}>صافي الحركة</div>
              <div style={{fontSize: FS+2, fontWeight: 800, color: totals.netMovement >= 0 ? T.err : T.ok}}>
                {fmt(totals.netMovement)} ج.م
              </div>
            </div>
            <div>
              <div style={{fontSize: FS-3, color: T.textMut}}>الرصيد الختامي</div>
              <div style={{fontSize: FS+2, fontWeight: 800, color: balanceColor}}>{fmt(closing)} ج.م</div>
              <div style={{fontSize: FS-3, color: balanceColor, fontWeight: 700}}>{balanceDirection}</div>
            </div>
          </Card>
        )}
      </>
    )}
  </div>;
}

/* Print template — RTL HTML with embedded CSS. */
function buildPrintHtml(party, partyType, result, dateRange, data){
  const { rows, openingBalance, totals, legacyFragmentation } = result;
  const closing = totals.closingBalance || 0;
  const direction = partyType === "customer"
    ? (closing > 0 ? "مدين لنا" : closing < 0 ? "ليه عندنا" : "متسوّي")
    : (closing > 0 ? "علينا للمورد" : closing < 0 ? "المورد عليه" : "متسوّي");
  const factoryName = data.factoryName || "CLARK";
  const logo = data.logo || "";

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>كشف حساب — ${party.name}</title>
<style>${PRINT_CSS || ""}</style></head><body>
<div class="hdr">
  ${logo ? `<img src="${logo}"/>` : `<div style="font-weight:800;font-size:18px;color:#0284C7">${factoryName}</div>`}
  <div class="hdr-info">
    <div>كشف حساب تراكمي</div>
    <div style="font-size:14px;color:#0284C7;font-weight:800">${party.name}</div>
    <div>${dateRange.from || ""} → ${dateRange.to || new Date().toISOString().split("T")[0]}</div>
  </div>
</div>
<h2>بيانات الطرف</h2>
<table>
  <tr><td><strong>الاسم:</strong></td><td>${party.name || ""}</td>
      <td><strong>النوع:</strong></td><td>${partyType === "customer" ? "عميل" : "مورد"}</td></tr>
  ${party.phone ? `<tr><td><strong>تليفون:</strong></td><td>${party.phone}</td><td></td><td></td></tr>` : ""}
  ${party.address ? `<tr><td><strong>عنوان:</strong></td><td colspan="3">${party.address}</td></tr>` : ""}
</table>
${legacyFragmentation.length > 0 ? `<div class="warn" style="padding:8px;background:#FEF3C7;border-radius:6px;margin:8px 0;font-weight:700">⚠️ يحتوي على ${legacyFragmentation.length} توزيعة قديمة بفواتير متفرقة (الأرقام صحيحة)</div>` : ""}
<h2>الحركات</h2>
<table>
  <thead><tr>
    <th>التاريخ</th><th>البيان</th><th>المرجع</th><th>مدين</th><th>دائن</th><th>الرصيد</th>
  </tr></thead>
  <tbody>
    <tr style="background:#F8FAFC;font-weight:700">
      <td>${dateRange.from || ""}</td>
      <td colspan="2">رصيد افتتاحي${dateRange.from ? " حتى " + dateRange.from : ""}</td>
      <td>${openingBalance > 0 ? Number(openingBalance).toLocaleString("en-EG") : "—"}</td>
      <td>${openingBalance < 0 ? Number(-openingBalance).toLocaleString("en-EG") : "—"}</td>
      <td><strong>${Number(openingBalance).toLocaleString("en-EG")}</strong></td>
    </tr>
    ${rows.map(r => `<tr>
      <td>${r.date}</td>
      <td>${r.description}</td>
      <td><strong>${r.refNo}</strong></td>
      <td>${r.debit > 0 ? Number(r.debit).toLocaleString("en-EG") : "—"}</td>
      <td>${r.credit > 0 ? Number(r.credit).toLocaleString("en-EG") : "—"}</td>
      <td><strong>${Number(r.balance).toLocaleString("en-EG")}</strong></td>
    </tr>`).join("")}
  </tbody>
  <tfoot>
    <tr style="background:#E0F2FE;font-weight:800">
      <td colspan="3">الإجمالي (${totals.rowCount} حركة)</td>
      <td>${Number(totals.totalDebit || 0).toLocaleString("en-EG")}</td>
      <td>${Number(totals.totalCredit || 0).toLocaleString("en-EG")}</td>
      <td>${Number(closing).toLocaleString("en-EG")}</td>
    </tr>
  </tfoot>
</table>
<h2>الخلاصة</h2>
<table>
  <tr><td><strong>الرصيد الافتتاحي:</strong></td><td>${Number(openingBalance).toLocaleString("en-EG")} ج.م</td></tr>
  <tr><td><strong>إجمالي مدين:</strong></td><td>${Number(totals.totalDebit || 0).toLocaleString("en-EG")} ج.م</td></tr>
  <tr><td><strong>إجمالي دائن:</strong></td><td>${Number(totals.totalCredit || 0).toLocaleString("en-EG")} ج.م</td></tr>
  <tr><td><strong>صافي الحركة:</strong></td><td>${Number(totals.netMovement || 0).toLocaleString("en-EG")} ج.م</td></tr>
  <tr><td><strong style="font-size:14px">الرصيد الختامي:</strong></td>
      <td class="info" style="font-size:14px">${Number(Math.abs(closing)).toLocaleString("en-EG")} ج.م ${direction}</td></tr>
</table>
<div class="sig">
  <div class="sig-box">المسؤول<br/>&nbsp;</div>
  <div class="sig-box">${partyType === "customer" ? "العميل" : "المورد"}<br/>&nbsp;</div>
</div>
<div class="foot">كشف حساب صادر في ${new Date().toISOString().split("T")[0]} — جميع الأرقام بالجنيه المصري</div>
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body></html>`;
}

export default AccountStatementPg;
