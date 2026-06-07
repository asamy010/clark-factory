/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AccountStatementView (V21.15.0 — Phase 13b)
   كشف حساب تراكمي (مدين/دائن/رصيد) للعميل/المورد. view-only.
   مشترك بين هَب المبيعات (عملاء) + هَب المشتريات (موردين) + جهات الاتصال.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, SearchSel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt, r2 } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import { buildAccountStatement, statementToAOA } from "../utils/accounting/statement.js";
import { printPage } from "../utils/print.js";
import { exportExcel } from "../utils/print-extras.js";

function balanceLabel(closing, partyType){
  const v = Math.abs(closing);
  if(Math.abs(closing) < 0.01) return { txt: "مُسوّى (صفر)", color: T.textSec };
  if(partyType === "customer")
    return closing > 0 ? { txt: "مستحق لنا على العميل: " + fmt(v.toFixed(2)), color: T.err }
                       : { txt: "رصيد للعميل عندنا: " + fmt(v.toFixed(2)), color: T.ok };
  return closing > 0 ? { txt: "مستحق للمورد علينا: " + fmt(v.toFixed(2)), color: T.err }
                     : { txt: "رصيد لنا عند المورد: " + fmt(v.toFixed(2)), color: T.ok };
}

export function AccountStatementView({ data, partyType = "customer", isMob, fixedPartyId }){
  const parties = partyType === "customer" ? (data.customers || []) : (data.suppliers || []);
  const accent = partyType === "customer" ? "#0EA5E9" : "#D97706";

  const [partyId, setPartyId] = useState(fixedPartyId != null ? fixedPartyId : "");
  const [mode, setMode] = useState("operational"); /* default = يطابق رصيد الشاشات الحالية */
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [invNo, setInvNo] = useState("");
  const [tf, setTf] = useState({ invoices: true, returns: true, payments: true });
  const [openingOn, setOpeningOn] = useState(true);
  const [drill, setDrill] = useState(null); /* row being drilled into */

  const party = parties.find(p => String(p.id) === String(partyId)) || (fixedPartyId != null ? parties.find(p => String(p.id) === String(fixedPartyId)) : null);
  const partyOpts = parties.filter(p => !p.archived).map(p => ({ value: p.id, label: p.name + (p.phone ? " — " + p.phone : "") }));

  const result = useMemo(() => party
    ? buildAccountStatement(data, { partyId: party.id, partyType, mode, fromDate, toDate, invoiceNoFilter: invNo, typeFilters: tf, includeOpening: openingOn })
    : null,
    [data, party, partyType, mode, fromDate, toDate, invNo, tf, openingOn]);

  /* تسوية: مقارنة الرصيد الإجمالي (بدون فلاتر) بين الوضعين — لسرعة القرار.
     الفرق غالباً = تسليمات/استلامات فعلية لسه ماترحّلتش لفواتير محاسبية. */
  const recon = useMemo(() => {
    if(!party) return null;
    const acc = buildAccountStatement(data, { partyId: party.id, partyType, mode: "accounting" }).totals.closing;
    const op = buildAccountStatement(data, { partyId: party.id, partyType, mode: "operational" }).totals.closing;
    const diff = r2(op - acc);
    return { acc, op, diff, match: Math.abs(diff) < 1 };
  }, [data, party, partyType]);

  const resetFilters = () => { setFromDate(""); setToDate(""); setInvNo(""); setTf({ invoices: true, returns: true, payments: true }); setOpeningOn(true); };

  const doPrint = () => {
    if(!result || !party) return;
    const rowsHtml = [];
    if(openingOn && (result.openingBalance || fromDate)) rowsHtml.push(`<tr style="background:#f1f5f9"><td>${fromDate || "البداية"}</td><td>رصيد افتتاحي</td><td></td><td></td><td></td><td style="font-weight:700">${fmt(result.openingBalance.toFixed(2))}</td></tr>`);
    result.rows.forEach(r => {
      rowsHtml.push(`<tr${r.draft ? ' style="color:#94a3b8;font-style:italic"' : ""}><td>${r.date || ""}</td><td style="text-align:right">${r.desc || ""}${r.sub ? '<br><span style="font-size:10px;color:#64748b">' + r.sub + "</span>" : ""}</td><td>${r.ref || ""}</td><td>${r.debit ? fmt(r.debit.toFixed(2)) : ""}</td><td>${r.credit ? fmt(r.credit.toFixed(2)) : ""}</td><td style="font-weight:700">${r.draft ? "(مسودة)" : fmt((r.balance || 0).toFixed(2))}</td></tr>`);
    });
    const html = `
      <h2 style="color:${accent};margin:0 0 4px">📊 كشف حساب — ${party.name}</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">
        ${party.phone ? "تليفون: " + party.phone + " · " : ""}${party.address ? "العنوان: " + party.address + " · " : ""}الوضع: ${mode === "accounting" ? "محاسبي" : "تشغيلي"}
        ${fromDate || toDate ? "<br>الفترة: " + (fromDate || "البداية") + " ← " + (toDate || "الآن") : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:${accent};color:#fff">
          <th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th><th style="padding:6px;border:1px solid #cbd5e1">البيان</th><th style="padding:6px;border:1px solid #cbd5e1">المرجع</th>
          <th style="padding:6px;border:1px solid #cbd5e1">مدين</th><th style="padding:6px;border:1px solid #cbd5e1">دائن</th><th style="padding:6px;border:1px solid #cbd5e1">الرصيد</th>
        </tr></thead>
        <tbody>${rowsHtml.join("")}</tbody>
        <tfoot><tr style="background:#eff6ff;font-weight:800"><td colspan="3" style="padding:6px;border:1px solid #cbd5e1;text-align:left">الإجمالي</td>
          <td style="padding:6px;border:1px solid #cbd5e1">${fmt(result.totals.debit.toFixed(2))}</td><td style="padding:6px;border:1px solid #cbd5e1">${fmt(result.totals.credit.toFixed(2))}</td>
          <td style="padding:6px;border:1px solid #cbd5e1">${fmt(result.totals.closing.toFixed(2))}</td></tr></tfoot>
      </table>
      <p style="margin-top:14px;font-weight:700">${balanceLabel(result.totals.closing, partyType).txt}</p>
      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><div>توقيع ${partyType === "customer" ? "العميل" : "المورد"}: ____________</div><div>توقيع المصنع: ____________</div></div>`;
    printPage("كشف حساب — " + party.name, html, { factoryName: data.factoryName, logo: data.logo });
  };

  const doExcel = async () => {
    if(!result || !party) return;
    try { await exportExcel(statementToAOA(result, party), "كشف-" + (party.name || "حساب")); }
    catch(e){ showToast("⛔ تعذّر التصدير: " + (e?.message || e)); }
  };

  const doWhatsApp = () => {
    if(!result || !party || !party.phone){ showToast("⛔ مفيش رقم تليفون للجهة"); return; }
    const bl = balanceLabel(result.totals.closing, partyType);
    const txt = "📊 كشف حساب — " + party.name + "\n" +
      (fromDate || toDate ? "الفترة: " + (fromDate || "البداية") + " ← " + (toDate || "الآن") + "\n" : "") +
      "إجمالي مدين: " + fmt(result.totals.debit.toFixed(0)) + "\nإجمالي دائن: " + fmt(result.totals.credit.toFixed(0)) + "\n" +
      "📌 " + bl.txt;
    const digits = String(party.phone).replace(/[^0-9]/g, "");
    const win = window.open("about:blank", "_blank");
    const url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(txt);
    if(win) win.location.href = url; else window.location.href = url;
  };

  /* cross-link: افتح المستند المصدر في صفحته (نفس آلية CLARK goto-tab + deep-link) */
  const LINK_LABEL = {
    sales_invoice: "↗️ افتح الفاتورة", purchase_invoice: "↗️ افتح الفاتورة",
    credit_note: "↗️ افتح الإشعار الدائن", debit_note: "↗️ افتح الإشعار المدين",
    receipt: "↗️ افتح الاستلام", delivery: "↗️ افتح صفحة التسليم", return: "↗️ افتح صفحة التسليم",
  };
  const openSource = (row) => {
    if(!row) return;
    const TAB = { sales_invoice: "salesInvoices", credit_note: "creditNotes", purchase_invoice: "purchaseInvoices", debit_note: "debitNotes", receipt: "purchase", delivery: "custDeliver", return: "custDeliver" };
    const tab = TAB[row.type];
    if(!tab){ showToast("⚠️ لا يوجد مستند مرتبط لفتحه"); return; }
    if(row.type === "sales_invoice"){ try { window.__clarkOpenSalesDoc = { kind: "invoice", id: row.refId }; } catch(_){} }
    window.dispatchEvent(new CustomEvent("goto-tab", { detail: tab }));
    setTimeout(() => {
      if(row.type === "sales_invoice") window.dispatchEvent(new CustomEvent("clark-open-sales-doc", { detail: { kind: "invoice", id: row.refId } }));
      else if(row.type === "purchase_invoice") window.dispatchEvent(new CustomEvent("notif-deeplink", { detail: { type: "invoice", subType: "purchase", invoiceId: row.refId } }));
      else if(row.type === "debit_note") window.dispatchEvent(new CustomEvent("notif-deeplink", { detail: { type: "debitNote", debitNoteId: row.refId } }));
    }, 350);
    setDrill(null);
  };

  const th = { padding: "8px 6px", fontSize: FS - 2, fontWeight: 800, color: "#fff", textAlign: "center", whiteSpace: "nowrap" };
  const td = { padding: "6px", fontSize: FS - 1, borderBottom: "1px solid " + T.brd, textAlign: "center" };
  const chk = (k, lbl) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS - 1, cursor: "pointer", color: T.text }}>
      <input type="checkbox" checked={tf[k]} onChange={e => setTf(s => ({ ...s, [k]: e.target.checked }))} /> {lbl}
    </label>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: accent }}>📊 كشف حساب {partyType === "customer" ? "عميل" : "مورد"}</div>
        {/* تبديل الوضع */}
        <div style={{ display: "flex", gap: 4, background: T.bg, borderRadius: 9, padding: 3, border: "1px solid " + T.brd }}>
          {[["operational", "تشغيلي"], ["accounting", "محاسبي"]].map(([m, l]) => (
            <div key={m} onClick={() => setMode(m)} style={{ padding: "5px 14px", borderRadius: 7, fontSize: FS - 1, fontWeight: 700, cursor: "pointer", background: mode === m ? accent : "transparent", color: mode === m ? "#fff" : T.textSec }}>{l}</div>
          ))}
        </div>
        {/* مؤشر التسوية تشغيلي ↔ محاسبي (لسرعة القرار) */}
        {recon && (recon.match ? (
          <div title={"تشغيلي: " + fmt(recon.op.toFixed(2)) + " · محاسبي: " + fmt(recon.acc.toFixed(2))}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, fontSize: FS - 2, fontWeight: 700, background: T.ok + "15", color: T.ok, border: "1px solid " + T.ok + "40" }}>
            ✓ التشغيلي = المحاسبي
          </div>
        ) : (
          <div title={"تشغيلي: " + fmt(recon.op.toFixed(2)) + " · محاسبي: " + fmt(recon.acc.toFixed(2)) + " · الفرق غالباً تسليمات لم تُرحّل لفواتير"}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, fontSize: FS - 2, fontWeight: 800, background: T.err + "15", color: T.err, border: "1px solid " + T.err + "55" }}>
            ⚠️ التشغيلي ≠ المحاسبي — فرق {fmt(Math.abs(recon.diff).toFixed(2))}
          </div>
        ))}
      </div>

      {/* الفلاتر */}
      <Card style={{ marginBottom: 12 }}>
        {fixedPartyId == null && <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 3 }}>{partyType === "customer" ? "العميل" : "المورد"}</label>
          <SearchSel value={partyId} onChange={setPartyId} options={partyOpts} placeholder={"اختر " + (partyType === "customer" ? "عميل" : "مورد") + "..."} showAllOnFocus maxResults={15} />
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div><label style={{ fontSize: FS - 3, color: T.textSec }}>من</label><Inp type="date" value={fromDate} onChange={setFromDate} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textSec }}>إلى</label><Inp type="date" value={toDate} onChange={setToDate} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textSec }}>رقم الفاتورة</label><Inp value={invNo} onChange={setInvNo} placeholder="بحث..." /></div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {chk("invoices", "فواتير")}{chk("returns", "مرتجعات")}{chk("payments", "دفعات")}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS - 1, cursor: "pointer", color: T.text }}>
            <input type="checkbox" checked={openingOn} onChange={e => setOpeningOn(e.target.checked)} /> رصيد افتتاحي
          </label>
          <Btn small ghost onClick={resetFilters} style={{ marginInlineStart: "auto" }}>🔄 reset</Btn>
        </div>
      </Card>

      {!party ? (
        <Card><div style={{ padding: 30, textAlign: "center", color: T.textMut }}>اختر {partyType === "customer" ? "عميل" : "مورد"} لعرض كشف الحساب</div></Card>
      ) : (
        <Card>
          {/* header الجهة + الرصيد + الإجراءات */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text }}>{party.name}</div>
              <div style={{ fontSize: FS - 2, color: T.textSec }}>{party.phone || ""}{party.address ? " · " + party.address : ""}</div>
              <div style={{ fontSize: FS, fontWeight: 800, marginTop: 4, color: balanceLabel(result.totals.closing, partyType).color }}>📌 {balanceLabel(result.totals.closing, partyType).txt}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn small onClick={doPrint} style={{ background: T.accentBg, color: T.accent }}>🖨 طباعة</Btn>
              <Btn small onClick={doExcel} style={{ background: "#10B98112", color: "#059669", border: "1px solid #10B98130" }}>📊 Excel</Btn>
              {party.phone && <Btn small onClick={doWhatsApp} style={{ background: "#25D36612", color: "#1DA851", border: "1px solid #25D36640" }}>📤 واتساب</Btn>}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr style={{ background: accent }}>
                <th style={th}>التاريخ</th><th style={{ ...th, textAlign: "right" }}>البيان</th><th style={th}>المرجع</th>
                <th style={th}>مدين</th><th style={th}>دائن</th><th style={th}>الرصيد</th>
              </tr></thead>
              <tbody>
                {openingOn && (result.openingBalance !== 0 || fromDate) && (
                  <tr style={{ background: T.bg }}>
                    <td style={td}>{fromDate || "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>رصيد افتتاحي</td>
                    <td style={td}>—</td><td style={td}>—</td><td style={td}>—</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(result.openingBalance.toFixed(2))}</td>
                  </tr>
                )}
                {result.rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: T.textMut, padding: 24 }}>لا توجد حركات في الفترة المحددة</td></tr>
                ) : result.rows.map((r, i) => (
                  <tr key={i} style={{ opacity: r.draft ? 0.55 : 1, fontStyle: r.draft ? "italic" : "normal" }}>
                    <td style={{ ...td, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.date || ""}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>{r.desc}{r.draft && <span style={{ marginInlineStart: 6, fontSize: FS - 3, color: T.warn, fontWeight: 700 }}>(مسودة)</span>}</div>
                      {r.sub && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>{r.sub}</div>}
                    </td>
                    <td style={td}>{r.detail ? (
                      <span onClick={() => setDrill(r)} title="عرض التفاصيل" style={{ color: accent, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>{r.ref || "🔍"}</span>
                    ) : <span style={{ color: accent, fontWeight: 700 }}>{r.ref || ""}</span>}</td>
                    <td style={{ ...td, color: r.debit ? T.text : T.textMut }}>{r.debit ? fmt(r.debit.toFixed(2)) : "—"}</td>
                    <td style={{ ...td, color: r.credit ? T.ok : T.textMut }}>{r.credit ? fmt(r.credit.toFixed(2)) : "—"}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{r.draft ? "—" : fmt((r.balance || 0).toFixed(2))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ background: T.accentBg }}>
                <td colSpan={3} style={{ ...td, textAlign: "left", fontWeight: 800, color: accent }}>الإجمالي ({result.totals.count} حركة)</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmt(result.totals.debit.toFixed(2))}</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmt(result.totals.credit.toFixed(2))}</td>
                <td style={{ ...td, fontWeight: 900, color: accent }}>{fmt(result.totals.closing.toFixed(2))}</td>
              </tr></tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* drill-down: تفاصيل التسليم/الفاتورة */}
      {drill && (
        <div onClick={() => setDrill(null)} style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMob ? 8 : 24, overflowY: "auto", direction: "rtl" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 640, padding: isMob ? 14 : 20, border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", margin: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: accent }}>{drill.desc}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {LINK_LABEL[drill.type] && <Btn small onClick={() => openSource(drill)} style={{ background: T.accentBg, color: T.accent }}>{LINK_LABEL[drill.type]}</Btn>}
                <Btn small ghost onClick={() => setDrill(null)}>✕</Btn>
              </div>
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10 }}>{drill.date || ""}{drill.sub ? " · " + drill.sub : ""}</div>
            <div style={{ overflowX: "auto" }}>
              {drill.detail.kind === "session" ? (
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                  <thead><tr style={{ background: accent }}>
                    <th style={th}>الموديل</th><th style={th}>الكمية</th><th style={th}>السعر</th><th style={th}>قبل الخصم</th><th style={th}>خصم %</th><th style={th}>بعد الخصم</th>
                  </tr></thead>
                  <tbody>
                    {(drill.detail.lines || []).map((ln, i) => (
                      <tr key={i}>
                        <td style={{ ...td, textAlign: "right" }}>{ln.modelNo}{ln.modelDesc ? <span style={{ color: T.textMut, fontSize: FS - 3 }}> — {ln.modelDesc}</span> : ""}</td>
                        <td style={td}>{fmt(ln.qty)}</td><td style={td}>{fmt(ln.price)}</td><td style={td}>{fmt(ln.gross)}</td>
                        <td style={td}>{ln.dPct}%</td><td style={{ ...td, fontWeight: 700 }}>{fmt(ln.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                  <thead><tr style={{ background: accent }}>
                    <th style={th}>الصنف</th><th style={th}>الكمية</th><th style={th}>السعر</th><th style={th}>الإجمالي</th>
                  </tr></thead>
                  <tbody>
                    {(drill.detail.items || []).map((it, i) => (
                      <tr key={i}>
                        <td style={{ ...td, textAlign: "right" }}>{it.name || it.modelNo || it.desc || "—"}</td>
                        <td style={td}>{fmt(Number(it.qty) || 0)}</td>
                        <td style={td}>{fmt(Number(it.unitPrice != null ? it.unitPrice : it.price) || 0)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{fmt(Number(it.lineTotal != null ? it.lineTotal : (Number(it.qty) || 0) * (Number(it.unitPrice != null ? it.unitPrice : it.price) || 0)))}</td>
                      </tr>
                    ))}
                    {(drill.detail.items || []).length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: T.textMut, padding: 18 }}>لا توجد بنود</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
