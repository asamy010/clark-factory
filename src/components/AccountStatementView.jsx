/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AccountStatementView (V21.15.0 — Phase 13b)
   كشف حساب تراكمي (مدين/دائن/رصيد) للعميل/المورد. view-only.
   مشترك بين هَب المبيعات (عملاء) + هَب المشتريات (موردين) + جهات الاتصال.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect, Fragment } from "react";
import { Btn, Card, Inp, SearchSel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt, r2, ltrPhone } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import { buildAccountStatement, statementToAOA } from "../utils/accounting/statement.js";
import { DocItemsTable } from "./DocItemsTable.jsx";
import { buildDocColumns } from "../utils/docColumns.js";
import { printPage } from "../utils/print.js";
import { exportExcel } from "../utils/print-extras.js";

function _esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* HTML مدمج لتفاصيل صف الكشف (للطباعة في وضع الحساب التفصيلي). */
function detailTableHTML(r, accent){
  const di = docItemsForRow(r);
  if(di){
    if(!di.items.length) return "";
    const { rows } = buildDocColumns(di.items, { headerDiscountAmount: di.headerDiscountAmount || undefined });
    const bd = "1px solid #e2e8f0";
    const body = rows.map(x => x.isSection
      ? `<tr><td colspan="8" style="background:#f1f5f9;font-weight:700;padding:4px 6px;border:${bd}">📑 ${_esc(x.title)}</td></tr>`
      : `<tr><td style="padding:3px 5px;border:${bd};text-align:center">${_esc(x.code) || "—"}</td><td style="padding:3px 5px;border:${bd}">${_esc(x.name) || "—"}</td><td style="padding:3px 5px;border:${bd};text-align:center">${_esc(x.unit) || "—"}</td><td style="padding:3px 5px;border:${bd};text-align:center">${fmt(x.qty)}</td><td style="padding:3px 5px;border:${bd};text-align:center">${fmt(x.price)}</td><td style="padding:3px 5px;border:${bd};text-align:center">${fmt(x.subBefore)}</td><td style="padding:3px 5px;border:${bd};text-align:center;color:#dc2626">${x.discountPct > 0 ? x.discountPct + "%" : "—"}</td><td style="padding:3px 5px;border:${bd};text-align:center;font-weight:700">${fmt(x.subAfter)}</td></tr>`
    ).join("");
    return `<table style="width:100%;border-collapse:collapse;font-size:10px;margin:3px 0"><thead><tr style="background:${accent}22"><th style="padding:3px 5px;border:${bd}">الكود</th><th style="padding:3px 5px;border:${bd}">اسم الصنف</th><th style="padding:3px 5px;border:${bd}">الوحدة</th><th style="padding:3px 5px;border:${bd}">الكمية</th><th style="padding:3px 5px;border:${bd}">السعر</th><th style="padding:3px 5px;border:${bd}">قبل الخصم</th><th style="padding:3px 5px;border:${bd}">الخصم%</th><th style="padding:3px 5px;border:${bd}">بعد الخصم</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  const pr = paymentDetailRows(r);
  if(!pr.length) return "";
  return `<div style="font-size:10px;color:#334155;padding:3px 0">${pr.map(([k, v]) => `<b>${_esc(k)}:</b> ${_esc(v)}`).join(" &nbsp;·&nbsp; ")}</div>`;
}

/* V21.21.56: بنود صف الكشف بصيغة docColumns (الكود-الاسم-الوحدة-الكمية-السعر-
   قبل/نسبة/بعد الخصم) + خصم الرأس. session = تسليم/أمر بيع (خصم per-line)؛
   invoice = فاتورة/استلام (خصم على الرأس). */
function docItemsForRow(r){
  if(!r || !r.detail) return null;
  if(r.detail.kind === "session"){
    const items = (r.detail.lines || []).map(l => ({
      code: l.code || "", modelNo: l.modelNo, description: l.modelDesc || "",
      unit: l.unit || "قطعة", qty: l.qty, unitPrice: l.price,
      discountType: "pct", discountValue: l.dPct,
    }));
    return { items, headerDiscountAmount: 0 };
  }
  const items = r.detail.items || [];
  /* خصم الرأس: من inv.discount لو متخزّن، وإلا (subtotal − total) للفواتير.
     الاستلام مفهوش subtotal/total → hd=0 (مجموع البنود = الإجمالي بلا خصم). */
  const raw = r.raw || {};
  let hd = Number(raw.discount) || 0;
  if(!hd && raw.subtotal != null && raw.total != null){
    const d = r2(Number(raw.subtotal) - Number(raw.total));
    if(d > 0) hd = d;
  }
  return { items, headerDiscountAmount: hd > 0 ? hd : 0 };
}

/* تفاصيل الدفعة/الحركة (صفوف مفتاح-قيمة) للصفوف اللي مالهاش بنود. */
function paymentDetailRows(r){
  const raw = r.raw || {};
  const out = [];
  const add = (k, v) => { if(v != null && v !== "" && v !== 0) out.push([k, v]); };
  const amt = fmt(r2((Number(raw.amount) || Number(raw.total) || Number(r.debit) || Number(r.credit) || 0))) + " ج.م";
  if(r.type === "check"){
    add("النوع", "🧾 شيك"); add("رقم الشيك", raw.checkNo || ""); add("البنك", raw.bankName || raw.bank || "");
    add("المبلغ", amt); add("تاريخ الاستحقاق", raw.dueDate || ""); add("الحالة", raw.status || ""); add("ملاحظات", raw.notes || "");
  } else if(r.type === "treasury"){
    add("النوع", "🏦 حركة خزنة"); add("المبلغ", amt); add("الخزنة", raw.account || ""); add("البيان", raw.desc || raw.category || "");
  } else if(r.type === "credit_note" || r.type === "debit_note"){
    add("النوع", r.type === "credit_note" ? "🔄 إشعار دائن (مرتجع مبيعات)" : "🔄 إشعار مدين (مرتجع مشتريات)");
    add("المبلغ", amt); add("الفاتورة المرتبطة", raw.linkedInvoiceNo || ""); add("الحالة", raw.status || ""); add("ملاحظات", raw.notes || "");
  } else if(r.type === "receipt_paid"){
    add("النوع", "💵 مدفوع عند الاستلام"); add("المبلغ", amt); add("طريقة الدفع", raw.paymentMethod || ""); add("الخزنة", raw.treasuryAccount || "");
  } else {
    add("النوع", "💰 دفعة"); add("الطريقة", raw.method || "نقدي"); add("المبلغ", amt);
    add("الخزنة", raw.account || raw.treasuryAccount || ""); add("التاريخ", raw.date || r.date || ""); add("ملاحظات", raw.notes || "");
  }
  return out;
}

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
  const [detailed, setDetailed] = useState(false); /* V21.21.56: حساب تفصيلي — الافتراضي عادي */
  const [drill, setDrill] = useState(null); /* row being drilled into */

  const party = parties.find(p => String(p.id) === String(partyId)) || (fixedPartyId != null ? parties.find(p => String(p.id) === String(fixedPartyId)) : null);
  const partyOpts = parties.filter(p => !p.archived).map(p => ({ value: p.id, label: p.name + (p.phone ? " — " + ltrPhone(p.phone) : "") }));

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
    if(openingOn && (result.openingBalance || fromDate)){
      /* V21.21.57: مدين/دائن في سطر الافتتاحي بالطباعة */
      const ob = result.openingBalance; const isD = ob > 0.005, isC = ob < -0.005;
      const tg = isD ? " (مدين)" : isC ? " (دائن)" : " (مُسوّى)";
      rowsHtml.push(`<tr style="background:#f1f5f9"><td>${fromDate || "البداية"}</td><td style="text-align:right">رصيد افتتاحي${tg}</td><td>${isD ? fmt(Math.abs(ob).toFixed(2)) : ""}</td><td>${isC ? fmt(Math.abs(ob).toFixed(2)) : ""}</td><td style="font-weight:700">${fmt(ob.toFixed(2))}</td></tr>`);
    }
    result.rows.forEach(r => {
      rowsHtml.push(`<tr${r.draft ? ' style="color:#94a3b8;font-style:italic"' : ""}><td>${r.date || ""}</td><td style="text-align:right">${r.desc || ""}${r.sub ? '<br><span style="font-size:10px;color:#64748b">' + r.sub + "</span>" : ""}</td><td>${r.debit ? fmt(r.debit.toFixed(2)) : ""}</td><td>${r.credit ? fmt(r.credit.toFixed(2)) : ""}</td><td style="font-weight:700">${r.draft ? "(مسودة)" : fmt((r.balance || 0).toFixed(2))}</td></tr>`);
      /* V21.21.56: سطر التفاصيل تحت كل حركة في وضع الحساب التفصيلي */
      if(detailed){
        const dh = detailTableHTML(r, accent);
        if(dh) rowsHtml.push(`<tr><td colspan="5" style="padding:4px 12px;background:#f8fafc">${dh}</td></tr>`);
      }
    });
    const html = `
      <h2 style="color:${accent};margin:0 0 4px">📊 كشف حساب — ${party.name}</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">
        ${party.phone ? "تليفون: " + ltrPhone(party.phone) + " · " : ""}${party.address ? "العنوان: " + party.address + " · " : ""}الوضع: ${mode === "accounting" ? "محاسبي" : "تشغيلي"}
        ${fromDate || toDate ? "<br>الفترة: " + (fromDate || "البداية") + " ← " + (toDate || "الآن") : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:${accent};color:#fff">
          <th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th><th style="padding:6px;border:1px solid #cbd5e1">البيان</th>
          <th style="padding:6px;border:1px solid #cbd5e1">مدين</th><th style="padding:6px;border:1px solid #cbd5e1">دائن</th><th style="padding:6px;border:1px solid #cbd5e1">الرصيد</th>
        </tr></thead>
        <tbody>${rowsHtml.join("")}</tbody>
        <tfoot><tr style="background:#eff6ff;font-weight:800"><td colspan="2" style="padding:6px;border:1px solid #cbd5e1;text-align:left">الإجمالي</td>
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
    receipt: "↗️ افتح الاستلام",
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

  /* جمّد التمرير في الخلفية طول ما الـ popup مفتوح */
  useEffect(() => {
    if(!drill) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drill]);

  /* إجماليات تفاصيل التسليم/الفاتورة (للـ popup) */
  const drillTotals = useMemo(() => {
    if(!drill || !drill.detail) return null;
    if(drill.detail.kind === "session"){
      const lines = drill.detail.lines || [];
      return {
        kind: "session", count: new Set(lines.map(l => l.modelNo)).size,
        qty: lines.reduce((s, l) => s + (Number(l.qty) || 0), 0),
        gross: r2(lines.reduce((s, l) => s + (Number(l.gross) || 0), 0)),
        net: r2(lines.reduce((s, l) => s + (Number(l.net) || 0), 0)),
      };
    }
    const items = drill.detail.items || [];
    return {
      kind: "invoice", count: items.length,
      qty: items.reduce((s, it) => s + (Number(it.qty) || 0), 0),
      total: r2(items.reduce((s, it) => s + (Number(it.lineTotal != null ? it.lineTotal : (Number(it.qty) || 0) * (Number(it.unitPrice != null ? it.unitPrice : it.price) || 0))), 0)),
    };
  }, [drill]);

  /* طباعة/PDF لتفاصيل الحركة المعروضة في الـ popup (بالتاريخ وكل التفاصيل) */
  const printDrill = () => {
    if(!drill || !party) return;
    const head = (cols) => `<tr style="background:${accent};color:#fff">${cols.map(c => `<th style="padding:6px;border:1px solid #cbd5e1">${c}</th>`).join("")}</tr>`;
    let body = "", foot = "";
    if(drill.detail.kind === "session"){
      body = (drill.detail.lines || []).map(l => `<tr><td style="border:1px solid #e2e8f0;padding:5px;text-align:right">${l.modelNo}${l.modelDesc ? " — " + l.modelDesc : ""}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(l.qty)}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(l.price)}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(l.gross)}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${l.dPct}%</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(l.net)}</td></tr>`).join("");
      foot = `<tfoot><tr style="background:#eff6ff;font-weight:800"><td style="padding:6px;border:1px solid #cbd5e1">الإجمالي (${drillTotals.count} موديل)</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(drillTotals.qty)}</td><td style="border:1px solid #cbd5e1"></td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(drillTotals.gross)}</td><td style="border:1px solid #cbd5e1"></td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(drillTotals.net)}</td></tr></tfoot>`;
      var thead = head(["الموديل", "الكمية", "السعر", "قبل الخصم", "خصم %", "بعد الخصم"]);
    } else {
      body = (drill.detail.items || []).map(it => { const up = Number(it.unitPrice != null ? it.unitPrice : it.price) || 0; const lt = Number(it.lineTotal != null ? it.lineTotal : (Number(it.qty) || 0) * up); return `<tr><td style="border:1px solid #e2e8f0;padding:5px;text-align:right">${it.name || it.modelNo || "—"}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(Number(it.qty) || 0)}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(up)}</td><td style="border:1px solid #e2e8f0;padding:5px;text-align:center">${fmt(lt)}</td></tr>`; }).join("");
      foot = `<tfoot><tr style="background:#eff6ff;font-weight:800"><td style="padding:6px;border:1px solid #cbd5e1">الإجمالي (${drillTotals.count} صنف)</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(drillTotals.qty)}</td><td style="border:1px solid #cbd5e1"></td><td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${fmt(drillTotals.total)}</td></tr></tfoot>`;
      var thead = head(["الصنف", "الكمية", "السعر", "الإجمالي"]);
    }
    const h = `
      <h2 style="color:${accent};margin:0 0 4px">${drill.desc}</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:10px">${party.name}${party.phone ? " · " + ltrPhone(party.phone) : ""} · التاريخ: ${drill.date || "—"}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px"><thead>${thead}</thead><tbody>${body}</tbody>${foot}</table>`;
    printPage(drill.desc + " — " + party.name, h, { factoryName: data.factoryName, logo: data.logo });
  };

  const whatsappDrill = () => {
    if(!drill || !party || !party.phone){ showToast("⛔ مفيش رقم تليفون للجهة"); return; }
    let txt = "📄 " + drill.desc + "\n" + party.name + " · التاريخ: " + (drill.date || "—") + "\n━━━━━━━━━━\n";
    if(drill.detail.kind === "session"){
      (drill.detail.lines || []).forEach(l => { txt += "• " + l.modelNo + " — " + fmt(l.qty) + " قطعة × " + fmt(l.price) + " = " + fmt(l.gross) + (l.dPct ? " (خصم " + l.dPct + "% → " + fmt(l.net) + ")" : "") + "\n"; });
      txt += "━━━━━━━━━━\n📦 الكمية: *" + fmt(drillTotals.qty) + "* · موديلات: *" + drillTotals.count + "*\n💰 قبل الخصم: *" + fmt(drillTotals.gross) + "* · بعد الخصم: *" + fmt(drillTotals.net) + "*";
    } else {
      (drill.detail.items || []).forEach(it => { const up = Number(it.unitPrice != null ? it.unitPrice : it.price) || 0; const lt = Number(it.lineTotal != null ? it.lineTotal : (Number(it.qty) || 0) * up); txt += "• " + (it.name || it.modelNo || "—") + " — " + fmt(Number(it.qty) || 0) + " × " + fmt(up) + " = " + fmt(lt) + "\n"; });
      txt += "━━━━━━━━━━\n📦 الكمية: *" + fmt(drillTotals.qty) + "* · أصناف: *" + drillTotals.count + "*\n💰 الإجمالي: *" + fmt(drillTotals.total) + "*";
    }
    const digits = String(party.phone).replace(/[^0-9]/g, "");
    const win = window.open("about:blank", "_blank");
    const url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(txt);
    if(win) win.location.href = url; else window.location.href = url;
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
        {/* V21.21.25: المورد/العميل + التواريخ + رقم الفاتورة على صف واحد لتوفير المساحة */}
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : (fixedPartyId == null ? "2fr 1fr 1fr 1fr" : "1fr 1fr 1fr"), gap: 8, marginBottom: 8, alignItems: "end" }}>
          {fixedPartyId == null && <div style={{ gridColumn: isMob ? "1 / -1" : "auto" }}>
            <label style={{ fontSize: FS - 3, color: T.textSec, display: "block", marginBottom: 3 }}>{partyType === "customer" ? "العميل" : "المورد"}</label>
            <SearchSel value={partyId} onChange={setPartyId} options={partyOpts} placeholder={"اختر " + (partyType === "customer" ? "عميل" : "مورد") + "..."} showAllOnFocus maxResults={15} />
          </div>}
          <div><label style={{ fontSize: FS - 3, color: T.textSec }}>من</label><Inp type="date" value={fromDate} onChange={setFromDate} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textSec }}>إلى</label><Inp type="date" value={toDate} onChange={setToDate} /></div>
          <div><label style={{ fontSize: FS - 3, color: T.textSec }}>رقم الفاتورة</label><Inp value={invNo} onChange={setInvNo} placeholder="بحث..." /></div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {chk("invoices", "فواتير")}{chk("returns", "مرتجعات")}{chk("payments", "دفعات")}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS - 1, cursor: "pointer", color: T.text }}>
            <input type="checkbox" checked={openingOn} onChange={e => setOpeningOn(e.target.checked)} /> رصيد افتتاحي
          </label>
          {/* V21.21.56: حساب تفصيلي — كل صف بينفرد تحته ببنوده وتفاصيله */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS - 1, cursor: "pointer", color: detailed ? accent : T.text, fontWeight: detailed ? 800 : 600, padding: "3px 10px", borderRadius: 8, background: detailed ? accent + "15" : "transparent", border: "1px solid " + (detailed ? accent + "55" : "transparent") }}>
            <input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)} /> 🧾 حساب تفصيلي
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
              <div style={{ fontSize: FS - 2, color: T.textSec }}>{party.phone ? ltrPhone(party.phone) : ""}{party.address ? " · " + party.address : ""}</div>
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
                {openingOn && (result.openingBalance !== 0 || fromDate) && (() => {
                  /* V21.21.57: سطر الرصيد الافتتاحي يوضّح مدين/دائن صراحةً —
                     المبلغ في عمود مدين أو دائن حسب الإشارة + وسم. */
                  const ob = result.openingBalance;
                  const isDeb = ob > 0.005, isCred = ob < -0.005;
                  const tag = isDeb ? "مدين" : isCred ? "دائن" : "مُسوّى";
                  const tagColor = isDeb ? T.err : isCred ? T.ok : T.textMut;
                  return (
                  <tr style={{ background: T.bg }}>
                    <td style={td}>{fromDate || "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>رصيد افتتاحي <span style={{ fontSize: FS - 3, color: tagColor, fontWeight: 800 }}>({tag})</span></td>
                    <td style={td}>—</td>
                    <td style={{ ...td, color: isDeb ? T.text : T.textMut, fontWeight: isDeb ? 800 : 400 }}>{isDeb ? fmt(Math.abs(ob).toFixed(2)) : "—"}</td>
                    <td style={{ ...td, color: isCred ? T.ok : T.textMut, fontWeight: isCred ? 800 : 400 }}>{isCred ? fmt(Math.abs(ob).toFixed(2)) : "—"}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(ob.toFixed(2))}</td>
                  </tr>
                  );
                })()}
                {result.rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: T.textMut, padding: 24 }}>لا توجد حركات في الفترة المحددة</td></tr>
                ) : result.rows.map((r, i) => {
                  const di = detailed && r.detail ? docItemsForRow(r) : null;
                  const payRows = detailed && !r.detail ? paymentDetailRows(r) : null;
                  return (
                  <Fragment key={i}>
                  <tr style={{ opacity: r.draft ? 0.55 : 1, fontStyle: r.draft ? "italic" : "normal" }}>
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
                  {detailed && (di || (payRows && payRows.length > 0)) && (
                    <tr>
                      <td colSpan={6} style={{ padding: "2px 12px 14px", background: T.bg, borderBottom: "2px solid " + accent + "22" }}>
                        <div style={{ fontSize: FS - 2, color: accent, fontWeight: 800, margin: "6px 0 8px" }}>📄 {r.desc}{r.sub ? " · " + r.sub : ""}</div>
                        {di ? (
                          di.items.length > 0
                            ? <DocItemsTable items={di.items} headerDiscountAmount={di.headerDiscountAmount || undefined} accent={accent} />
                            : <div style={{ fontSize: FS - 2, color: T.textMut, padding: 8 }}>لا توجد بنود تفصيلية</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8, padding: "10px 12px", background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 8 }}>
                            {payRows.map(([k, v], j) => (<div key={j}><div style={{ fontSize: FS - 3, color: T.textMut }}>{k}</div><div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{v}</div></div>))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
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
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Btn small onClick={printDrill} style={{ background: T.accentBg, color: T.accent }}>🖨 طباعة / PDF</Btn>
                {party && party.phone && <Btn small onClick={whatsappDrill} style={{ background: "#25D36612", color: "#1DA851", border: "1px solid #25D36640" }}>📤 واتساب</Btn>}
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
                  {drillTotals && <tfoot><tr style={{ background: T.accentBg }}>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: accent }}>الإجمالي ({drillTotals.count} موديل)</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(drillTotals.qty)}</td>
                    <td style={td}></td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(drillTotals.gross)}</td>
                    <td style={td}></td>
                    <td style={{ ...td, fontWeight: 900, color: accent }}>{fmt(drillTotals.net)}</td>
                  </tr></tfoot>}
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
                  {drillTotals && drillTotals.kind === "invoice" && (drill.detail.items || []).length > 0 && <tfoot><tr style={{ background: T.accentBg }}>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: accent }}>الإجمالي ({drillTotals.count} صنف)</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt(drillTotals.qty)}</td>
                    <td style={td}></td>
                    <td style={{ ...td, fontWeight: 900, color: accent }}>{fmt(drillTotals.total)}</td>
                  </tr></tfoot>}
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
