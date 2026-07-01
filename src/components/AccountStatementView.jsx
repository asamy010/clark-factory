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
import { buildAccountStatement, statementToAOA, journalLocatorForRow } from "../utils/accounting/statement.js";
import { DocItemsTable } from "./DocItemsTable.jsx";
import { DiscountModal } from "./sales/DiscountModal.jsx";
import { DiscountsManager } from "./sales/DiscountsManager.jsx";
/* V21.27.52: تعديل حركات الخصم/التحويل من الكشف */
import { editCustomerDiscount } from "../utils/sales/discounts.js";
import { editPartyTransfer } from "../utils/contacts.js";
import { buildDocColumns } from "../utils/docColumns.js";
import { printPage } from "../utils/print.js";
import { tafqitEGP } from "../utils/tafqit.js";/* V21.27.202: تفقيط عربي احترافي للإجمالي */
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

/* عدد القطع لصف (من بنوده). */
function rowQtyOf(r){
  if(!r || !r.detail) return 0;
  if(r.detail.kind === "session") return (r.detail.lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  return (r.detail.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
}
/* هل الصف دفعة بشيك؟ (type=check أو طريقة الدفع شيك). */
function isCheckRow(r){
  if(r.type === "check") return true;
  const m = String((r.raw && (r.raw.method || r.raw.paymentMethod)) || "").toLowerCase();
  return m.includes("شيك") || m.includes("check");
}
/* V21.21.58: ملخّص KPIs من نفس صفوف الكشف المفلترة (يحترم العميل/المورد +
   التاريخ + النوع + الوضع). صفر mutation — مشتق بحت. */
function computeStatementKpis(result){
  const z = { sales: 0, salesQty: 0, returns: 0, returnsQty: 0, cash: 0, check: 0, discount: 0, closing: 0 };
  if(!result) return z;
  z.closing = r2(Number(result.totals.closing) || 0);
  for(const r of result.rows){
    if(r.draft) continue; /* المسودات مش داخلة الرصيد ولا الإجماليات */
    const t = r.type;
    if(t === "discount"){
      z.discount = r2(z.discount + (Number(r.credit) || 0));
    } else if(t === "return" || t === "credit_note" || t === "debit_note"){
      z.returns = r2(z.returns + (Number(r.credit) || 0)); z.returnsQty += rowQtyOf(r);
    } else if(t === "payment" || t === "treasury" || t === "receipt_paid" || t === "check"){
      if(isCheckRow(r)) z.check = r2(z.check + (Number(r.credit) || 0));
      else z.cash = r2(z.cash + (Number(r.credit) || 0));
    } else {
      /* مستند بيع/شراء (مدين) */
      z.sales = r2(z.sales + (Number(r.debit) || 0)); z.salesQty += rowQtyOf(r);
    }
  }
  return z;
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

export function AccountStatementView({ data, partyType = "customer", isMob, fixedPartyId, upConfig, user }){
  const parties = partyType === "customer" ? (data.customers || []) : (data.suppliers || []);
  const accent = partyType === "customer" ? "#0EA5E9" : "#D97706";
  /* V21.21.59: زر الخصم الإضافي — للعملاء فقط ولو فيه صلاحية كتابة (upConfig) */
  const canDiscount = partyType === "customer" && typeof upConfig === "function";
  const [showDiscount, setShowDiscount] = useState(false);

  const [partyId, setPartyId] = useState(fixedPartyId != null ? fixedPartyId : "");
  const [mode, setMode] = useState("operational"); /* default = يطابق رصيد الشاشات الحالية */
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [invNo, setInvNo] = useState("");
  const [tf, setTf] = useState({ invoices: true, returns: true, payments: true });
  const [openingOn, setOpeningOn] = useState(true);
  const [detailed, setDetailed] = useState(false); /* V21.21.56: حساب تفصيلي — الافتراضي عادي */
  const [drill, setDrill] = useState(null); /* row being drilled into */
  /* V21.27.52: تعديل حركة خصم/تحويل من الكشف */
  const canEditEntry = typeof upConfig === "function";
  const userName = (user && (user.name || user.displayName || user.email)) || "";
  const [editEntry, setEditEntry] = useState(null); /* {kind:"discount"|"transfer", raw, transferId, amount, reason, date, note} */
  const [savingEntry, setSavingEntry] = useState(false);
  /* كاشفات نوع الصف */
  const isDiscountRow = (r) => r && r.type === "discount" && r.raw && r.raw.kind === "discount" && r.raw.status !== "void";
  const isTransferRow = (r) => r && r.raw && (r.raw.transferId || r.raw.method === "تحميل حساب");
  const openEditEntry = (r) => {
    if(!canEditEntry) return;
    if(isDiscountRow(r)){
      setEditEntry({ kind: "discount", raw: r.raw, amount: Number(r.raw.total) || 0, reason: r.raw.reason || "", date: r.raw.date || "" });
    } else if(isTransferRow(r)){
      setEditEntry({ kind: "transfer", raw: r.raw, transferId: r.raw.transferId, amount: Math.abs(Number(r.raw.amount) || 0), date: r.raw.date || "", note: r.raw.note || r.raw.notes || "" });
    }
  };
  const saveEditEntry = async () => {
    if(!editEntry || savingEntry) return;
    setSavingEntry(true);
    try {
      if(editEntry.kind === "discount"){
        const res = await editCustomerDiscount(data, upConfig, editEntry.raw, { amount: editEntry.amount, reason: editEntry.reason, date: editEntry.date }, party, userName);
        showToast(res && res.ok ? "✓ تم تعديل الخصم (نفس القيد)" : "⛔ " + ((res && res.error) || "تعذّر التعديل"));
        if(res && res.ok) setEditEntry(null);
      } else if(editEntry.kind === "transfer"){
        let err = "";
        await upConfig(d => {
          try { const r = editPartyTransfer(editEntry.transferId, d, { magnitude: editEntry.amount, date: editEntry.date, note: editEntry.note }); d.custPayments = r.patch.custPayments; d.supplierPayments = r.patch.supplierPayments; }
          catch(e){ err = e.message || String(e); }
        });
        showToast(err ? "⛔ " + err : "✓ تم تعديل التحويل");
        if(!err) setEditEntry(null);
      }
    } catch(e){ showToast("⛔ " + (e.message || "تعذّر التعديل")); }
    finally { setSavingEntry(false); }
  };

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

  /* V21.21.58: بطاقات KPI ديناميكية من نفس الـ result المفلتر.
     لون الرصيد النهائي: أخضر = للمصنع (مستحق لنا) · أحمر = على المصنع. */
  const kpis = useMemo(() => {
    if(!result) return null;
    const k = computeStatementKpis(result);
    const settled = Math.abs(k.closing) < 0.005;
    const inFav = partyType === "customer" ? k.closing > 0.005 : k.closing < -0.005;
    return { ...k, balColor: settled ? T.textSec : (inFav ? T.ok : T.err), balTag: settled ? "مُسوّى (صفر)" : (inFav ? "للمصنع" : "على المصنع") };
  }, [result, partyType]);

  const doPrint = () => {
    if(!result || !party) return;
    const rowsHtml = [];
    if(openingOn && (result.openingBalance || fromDate)){
      /* V21.21.57: مدين/دائن في سطر الافتتاحي بالطباعة */
      const ob = result.openingBalance; const isD = ob > 0.005, isC = ob < -0.005;
      const tg = isD ? " (مدين)" : isC ? " (دائن)" : " (مُسوّى)";
      rowsHtml.push(`<tr style="background:#f1f5f9"><td>${fromDate || "البداية"}</td><td style="text-align:right">رصيد افتتاحي${tg}</td><td>${isD ? fmt(Math.abs(ob).toFixed(2)) : ""}</td><td>${isC ? fmt(Math.abs(ob).toFixed(2)) : ""}</td><td style="font-weight:700">${fmt(ob.toFixed(2))}</td></tr>`);
    }
    result.rows.forEach((r, i) => {
      /* V21.27.59: سطر-لون-وسطر (zebra) — كل حركة لها لون بالتناوب (أبيض/رمادي
         فاتح)، وسطر تفاصيلها في الوضع التفصيلي بياخد نفس اللون عشان يبان إنهم
         بند واحد. */
      const zebra = i % 2 === 0 ? "#ffffff" : "#f1f5f9";
      rowsHtml.push(`<tr style="background:${zebra}${r.draft ? ';color:#94a3b8;font-style:italic' : ''}"><td>${r.date || ""}</td><td style="text-align:right">${r.desc || ""}${r.sub ? '<br><span style="font-size:10px;color:#64748b">' + r.sub + "</span>" : ""}</td><td>${r.debit ? fmt(r.debit.toFixed(2)) : ""}</td><td>${r.credit ? fmt(r.credit.toFixed(2)) : ""}</td><td style="font-weight:700">${r.draft ? "(مسودة)" : fmt((r.balance || 0).toFixed(2))}</td></tr>`);
      /* V21.21.56: سطر التفاصيل تحت كل حركة في وضع الحساب التفصيلي — نفس لون الحركة */
      if(detailed){
        const dh = detailTableHTML(r, accent);
        if(dh) rowsHtml.push(`<tr><td colspan="5" style="padding:4px 12px;background:${zebra}">${dh}</td></tr>`);
      }
    });
    /* V21.21.58: بطاقات KPI مبسّطة وصغيرة أعلى الطباعة */
    const _k = computeStatementKpis(result);
    const _settled = Math.abs(_k.closing) < 0.005;
    const _inFav = partyType === "customer" ? _k.closing > 0.005 : _k.closing < -0.005;
    const _balC = _settled ? "#64748b" : (_inFav ? "#059669" : "#dc2626");
    const _balTag = _settled ? "مُسوّى" : (_inFav ? "للمصنع" : "على المصنع");
    const _kc = (title, val, sub, color) => `<div style="flex:1;min-width:88px;border:1px solid #e2e8f0;border-radius:6px;padding:4px 7px;background:#f8fafc"><div style="font-size:8.5px;color:#64748b">${title}</div><div style="font-size:12px;font-weight:800;color:${color || "#0f172a"};direction:ltr;text-align:right">${val}</div>${sub ? `<div style="font-size:8.5px;color:${color || "#64748b"};font-weight:700">${sub}</div>` : ""}</div>`;
    const kpiBlock = `<div style="display:flex;gap:5px;flex-wrap:wrap;margin:6px 0 10px">
      ${_kc(partyType === "customer" ? "إجمالي المبيعات" : "إجمالي المشتريات", fmt(_k.sales.toFixed(2)), fmt(_k.salesQty) + " قطعة", "#0ea5e9")}
      ${_kc("إجمالي المرتجعات", fmt(_k.returns.toFixed(2)), fmt(_k.returnsQty) + " قطعة", "#d97706")}
      ${_kc("دفعات نقدي", fmt(_k.cash.toFixed(2)), "", "#059669")}
      ${_kc("دفعات شيكات", fmt(_k.check.toFixed(2)), "", "#8b5cf6")}
      ${_kc("الرصيد النهائي", fmt(_k.closing.toFixed(2)), _balTag, _balC)}
    </div>`;
    /* V21.27.59: عنوان أدق — «كشف حساب تفصيلي» في الوضع التفصيلي */
    const docTitle = (detailed ? "كشف حساب تفصيلي" : "كشف حساب") + " — " + party.name;
    const html = `
      <h2 style="color:${accent};margin:0 0 4px">📊 ${docTitle}</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">
        ${party.phone ? "تليفون: " + ltrPhone(party.phone) + " · " : ""}${party.address ? "العنوان: " + party.address + " · " : ""}الوضع: ${mode === "accounting" ? "محاسبي" : "تشغيلي"}
        ${fromDate || toDate ? "<br>الفترة: " + (fromDate || "البداية") + " ← " + (toDate || "الآن") : ""}
      </div>
      ${kpiBlock}
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
      <div style="margin-top:6px;font-size:12px;color:#0f172a;font-weight:700;border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px;background:#f8fafc">${tafqitEGP(result.totals.closing)}</div>
      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><div>توقيع ${partyType === "customer" ? "العميل" : "المورد"}: ____________</div><div>توقيع المصنع: ____________</div></div>`;
    printPage(docTitle, html, { factoryName: data.factoryName, logo: data.logo });
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

  /* V21.27.56: لينك «القيد اليومية» لحركة الكشف. بنبعت الـ locator (sourceType/
     sourceId/date) لتاب المحاسبة اللي بيحلّ الـ entryId الفعلي من day-docs
     async (القيود مش محمّلة في data). نفس آلية goto-tab + clark-open-journal-entry
     المستخدمة في الفاتورة ودفتر الأستاذ. */
  const openJournalEntry = (loc) => {
    if(!loc) return;
    try { window.__clarkOpenJournalEntry = { ...loc }; } catch(_){}
    window.dispatchEvent(new CustomEvent("goto-tab", { detail: "accounting" }));
    setTimeout(() => window.dispatchEvent(new CustomEvent("clark-open-journal-entry", { detail: { ...loc } })), 250);
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
              {canDiscount && <Btn small onClick={() => setShowDiscount(true)} style={{ background: "#DB277712", color: "#DB2777", border: "1px solid #DB277740", fontWeight: 700 }}>🏷️ خصم إضافي</Btn>}
              <Btn small onClick={doPrint} style={{ background: T.accentBg, color: T.accent }}>🖨 طباعة</Btn>
              <Btn small onClick={doExcel} style={{ background: "#10B98112", color: "#059669", border: "1px solid #10B98130" }}>📊 Excel</Btn>
              {party.phone && <Btn small onClick={doWhatsApp} style={{ background: "#25D36612", color: "#1DA851", border: "1px solid #25D36640" }}>📤 واتساب</Btn>}
            </div>
          </div>

          {/* V21.21.58/59: بطاقات KPI صغيرة ديناميكية مع الفلتر (+ خصومات إضافية للعملاء) */}
          {kpis && (
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(auto-fit, minmax(115px,1fr))", gap: 8, marginBottom: 12 }}>
              {[
                { t: partyType === "customer" ? "🧾 إجمالي المبيعات" : "🧾 إجمالي المشتريات", v: fmt(kpis.sales.toFixed(2)), s: fmt(kpis.salesQty) + " قطعة", c: accent },
                { t: "↩️ إجمالي المرتجعات", v: fmt(kpis.returns.toFixed(2)), s: fmt(kpis.returnsQty) + " قطعة", c: T.warn },
                ...(partyType === "customer" ? [{ t: "🏷️ خصومات إضافية", v: fmt(kpis.discount.toFixed(2)), s: "", c: "#DB2777" }] : []),
                { t: "💵 دفعات نقدي", v: fmt(kpis.cash.toFixed(2)), s: "", c: T.ok },
                { t: "🧾 دفعات شيكات", v: fmt(kpis.check.toFixed(2)), s: "", c: "#8B5CF6" },
                { t: "📌 الرصيد النهائي", v: fmt(kpis.closing.toFixed(2)), s: kpis.balTag, c: kpis.balColor, big: true },
              ].map((c, i) => (
                <div key={i} style={{ border: "1px solid " + c.c + "33", borderRadius: 10, padding: "8px 10px", background: c.c + "0c", minWidth: 0 }}>
                  <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.t}</div>
                  <div style={{ fontSize: FS + (c.big ? 1 : 0), fontWeight: 800, color: c.c, marginTop: 2, direction: "ltr", textAlign: "right" }}>{c.v}</div>
                  {c.s && <div style={{ fontSize: FS - 3, color: c.c, fontWeight: 700, marginTop: 1 }}>{c.s}</div>}
                </div>
              ))}
            </div>
          )}

          {/* V21.21.60: إدارة الخصومات الإضافية (إلغاء/حذف) */}
          {canDiscount && <DiscountsManager data={data} upConfig={upConfig} user={user} customerId={party.id} accent="#DB2777" />}

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
                  /* V21.27.59: سطر-لون-وسطر (zebra) — كل حركة لها لون بالتناوب
                     (أبيض/رمادي فاتح)؛ في الوضع التفصيلي سطر التفاصيل بياخد نفس
                     اللون عشان يبان إن البند سطر واحد. */
                  const zebra = i % 2 === 0 ? T.cardSolid : T.bg;
                  return (
                  <Fragment key={i}>
                  <tr style={{ background: zebra, opacity: r.draft ? 0.55 : 1, fontStyle: r.draft ? "italic" : "normal" }}>
                    <td style={{ ...td, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.date || ""}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {/* V21.27.52: صفوف الخصم/التحويل قابلة للضغط → بوب اب تعديل */}
                      {canEditEntry && (isDiscountRow(r) || isTransferRow(r))
                        ? <div onClick={() => openEditEntry(r)} title="اضغط للتعديل" style={{ fontWeight: 600, cursor: "pointer", color: accent, textDecoration: "underline", textUnderlineOffset: 2 }}>{r.desc} ✏️</div>
                        : <div style={{ fontWeight: 600 }}>{r.desc}{r.draft && <span style={{ marginInlineStart: 6, fontSize: FS - 3, color: T.warn, fontWeight: 700 }}>(مسودة)</span>}</div>}
                      {r.sub && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>{r.sub}</div>}
                    </td>
                    <td style={td}>{r.detail ? (
                      <span onClick={() => setDrill(r)} title="عرض التفاصيل" style={{ color: accent, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>{r.ref || "🔍"}</span>
                    ) : <span style={{ color: accent, fontWeight: 700 }}>{r.ref || ""}</span>}
                      {/* V21.27.56: لينك القيد اليومية للحركة (لو ليها قيد 1:1) */}
                      {(() => { const loc = journalLocatorForRow(r, partyType); return loc ? (
                        <div onClick={() => openJournalEntry(loc)} title="افتح قيد اليومية لهذه الحركة" style={{ marginTop: 3, fontSize: FS - 4, color: T.textSec, cursor: "pointer", fontWeight: 700 }}>📔 القيد ↗</div>
                      ) : null; })()}</td>
                    <td style={{ ...td, color: r.debit ? T.text : T.textMut }}>{r.debit ? fmt(r.debit.toFixed(2)) : "—"}</td>
                    <td style={{ ...td, color: r.credit ? T.ok : T.textMut }}>{r.credit ? fmt(r.credit.toFixed(2)) : "—"}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{r.draft ? "—" : fmt((r.balance || 0).toFixed(2))}</td>
                  </tr>
                  {detailed && (di || (payRows && payRows.length > 0)) && (
                    <tr>
                      <td colSpan={6} style={{ padding: "2px 12px 14px", background: zebra, borderBottom: "2px solid " + accent + "22" }}>
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
              ) : (<>
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
                {/* V21.27.101 (issue #3): ملخّص الخصم في بوب اب الفاتورة المحاسبي
                    — كان بيعرض البنود والإجمالي بس من غير ما يبيّن إن فيه خصم. */}
                {(() => {
                  const inv = drill.raw || {};
                  const subtotal = Number(inv.subtotal) || 0;
                  const total = Number(inv.total != null ? inv.total : subtotal);
                  const disc = Number(inv.discount) || Math.max(0, subtotal - total);
                  const dPct = Number(inv.discountPct) || (subtotal > 0 ? Math.round(disc / subtotal * 1000) / 10 : 0);
                  if(!(subtotal > 0 || disc > 0)) return null;
                  return <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.brd, background: T.bg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS - 1, marginBottom: 4 }}><span style={{ color: T.textSec }}>الإجمالي قبل الخصم</span><span style={{ fontWeight: 700 }}>{fmt(subtotal.toFixed(2))}</span></div>
                    {disc > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS - 1, marginBottom: 4, color: T.err }}><span style={{ fontWeight: 600 }}>{"الخصم" + (dPct > 0 ? " (" + dPct + "%)" : "")}</span><span style={{ fontWeight: 700, direction: "ltr" }}>{"-" + fmt(disc.toFixed(2))}</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS, paddingTop: 6, borderTop: "1px solid " + T.brd }}><span style={{ fontWeight: 800, color: accent }}>المستحق</span><span style={{ fontWeight: 900, color: accent }}>{fmt(total.toFixed(2))}</span></div>
                  </div>;
                })()}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* V21.21.59: مودال الخصم الإضافي (للعميل المحدّد) */}
      {showDiscount && canDiscount && (
        <DiscountModal data={data} upConfig={upConfig} user={user} fixedCustomerId={party ? party.id : null} onClose={() => setShowDiscount(false)} />
      )}

      {/* V21.27.52: بوب اب تعديل حركة خصم/تحويل */}
      {editEntry && (
        <div onClick={() => !savingEntry && setEditEntry(null)} style={{ position: "fixed", inset: 0, zIndex: 100003, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 420, padding: 20, border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: accent }}>
                {editEntry.kind === "discount" ? "🏷️ تعديل خصم إضافي" : "💱 تعديل تحميل حساب"}
              </div>
              <Btn small ghost onClick={() => !savingEntry && setEditEntry(null)}>✕</Btn>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>{editEntry.kind === "discount" ? "مبلغ الخصم (ج.م)" : "المبلغ المحوّل (ج.م)"}</label>
                <Inp type="number" value={String(editEntry.amount)} onChange={v => setEditEntry(p => ({ ...p, amount: v }))} />
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>التاريخ</label>
                <Inp type="date" value={editEntry.date || ""} onChange={v => setEditEntry(p => ({ ...p, date: v }))} />
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>{editEntry.kind === "discount" ? "السبب" : "ملاحظة"}</label>
                <Inp value={(editEntry.kind === "discount" ? editEntry.reason : editEntry.note) || ""} onChange={v => setEditEntry(p => editEntry.kind === "discount" ? ({ ...p, reason: v }) : ({ ...p, note: v }))} placeholder={editEntry.kind === "discount" ? "سبب الخصم..." : "ملاحظة التحويل..."} />
              </div>
              {editEntry.kind === "discount"
                ? <div style={{ fontSize: FS - 3, color: T.textMut, lineHeight: 1.6 }}>💡 التعديل بيظبط نفس القيد المحاسبي (نفس الرقم) — مش بيعمل قيد جديد.</div>
                : <div style={{ fontSize: FS - 3, color: T.textMut, lineHeight: 1.6 }}>💡 التعديل بيظبط رِجلَي التحويل (الطرفين) معاً.</div>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <Btn ghost disabled={savingEntry} onClick={() => setEditEntry(null)}>إلغاء</Btn>
              <Btn disabled={savingEntry} onClick={saveEditEntry} style={{ background: accent, color: "#fff", border: "none", fontWeight: 700 }}>{savingEntry ? "⏳ جاري الحفظ..." : "💾 حفظ"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
