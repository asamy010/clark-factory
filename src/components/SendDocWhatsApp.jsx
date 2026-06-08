/* ═══════════════════════════════════════════════════════════════════════
   CLARK · SendDocWhatsApp (V21.20.3)
   إرسال عرض السعر / أمر البيع عبر واتساب بريدج: اختيار عميل أو رقم يدوي،
   مع إرفاق PDF + نص. الـ bridge يدعم media (PDF) — { phone, message, media }.
   + زر طباعة/PDF للمتصفح.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Inp, SearchSel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";
import { printPage } from "../utils/print.js";
import { htmlToPdfBase64 } from "../utils/htmlToPdf.js";
import { cleanPhone } from "../utils/whatsappBridge.js";
import { buildSalesDocHTML, buildSalesDocText } from "../utils/sales/docPrint.js";

export function SendDocWhatsApp({ data, doc, kind, onClose }){
  const customers = (data.customers || []).filter(c => !c.archived);
  const [customerId, setCustomerId] = useState(doc.customerId || "");
  const [manual, setManual] = useState(doc.customerId ? "" : (doc.customerPhone || ""));
  const [sending, setSending] = useState(false);
  const title = kind === "quote" ? "عرض سعر" : "أمر بيع";
  const no = doc.quoteNo || doc.orderNo || "";

  const selCust = customers.find(c => String(c.id) === String(customerId));
  const resolvedPhone = (manual.trim() || selCust?.phone || doc.customerPhone || "");

  const doPrint = () => printPage(title + " — " + no, buildSalesDocHTML(doc, data, kind), { factoryName: data.factoryName, logo: data.logo });

  const send = async () => {
    const url = (data.campaignBridge || {}).url || "";
    const token = (data.campaignBridge || {}).token || "";
    if(!url){ showToast("⛔ الـ Bridge URL غير مضبوط — اضبطه من Campaigns → Bridge"); return; }
    const phone = cleanPhone(resolvedPhone);
    if(!phone){ showToast("⛔ اختر عميل ليه رقم أو اكتب رقم صحيح"); return; }
    setSending(true);
    try {
      let media = null;
      try {
        const b64 = await htmlToPdfBase64(buildSalesDocHTML(doc, data, kind), { fontFamily: "Cairo, sans-serif" });
        if(b64) media = [{ base64: b64, mime: "application/pdf", name: (title + "_" + no).replace(/[^؀-ۿa-zA-Z0-9_-]/g, "_") + ".pdf" }];
      } catch(e){ console.warn("[SendDocWhatsApp] pdf gen failed:", e); }
      const headers = { "Content-Type": "application/json" };
      if(token) headers["Authorization"] = "Bearer " + token;
      const body = { phone, message: buildSalesDocText(doc, kind) };
      if(media) body.media = media;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      let r, j;
      try {
        r = await fetch(url.replace(/\/+$/, "") + "/send", { method: "POST", headers, body: JSON.stringify({ messages: [body] }), signal: ctrl.signal });
        j = await r.json().catch(() => ({}));
      } finally { clearTimeout(to); }
      if(r && r.ok && j && j.ok !== false){ showToast("✅ اتبعت عبر واتساب" + (media ? " (PDF + نص)" : " (نص)")); onClose && onClose(); }
      else showToast("⛔ فشل الإرسال: " + ((j && j.error) || (r && r.status) || "غير معروف"));
    } catch(e){ showToast("⛔ " + (e?.name === "AbortError" ? "انتهت المهلة — راجع البريدج" : (e?.message || e))); }
    finally { setSending(false); }
  };

  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 };

  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 460, padding: 18, border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#1DA851" }}>📤 إرسال {title} عبر واتساب</div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>
        <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 12 }}>{no} · هيتبعت <b>PDF + نص</b> عبر البريدج.</div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>العميل</label>
          <SearchSel value={customerId} onChange={v => { setCustomerId(v); setManual(""); }} options={customers.map(c => ({ value: c.id, label: c.name + (c.phone ? " — " + c.phone : "") }))} placeholder="اختر عميل..." showAllOnFocus maxResults={12} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>أو رقم تليفون يدوي</label>
          <Inp value={manual} onChange={v => { setManual(v); if(v) setCustomerId(""); }} placeholder="01xxxxxxxxx" />
        </div>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 14 }}>الإرسال إلى: <b style={{ color: resolvedPhone ? T.ok : T.err, direction: "ltr" }}>{resolvedPhone || "— لا يوجد رقم —"}</b></div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Btn ghost onClick={doPrint}>🖨 طباعة / PDF</Btn>
          <Btn onClick={send} disabled={sending || !resolvedPhone} style={{ background: sending || !resolvedPhone ? T.brd : "#25D366", color: "#fff", fontWeight: 700 }}>{sending ? "⏳ بيبعت..." : "📤 إرسال"}</Btn>
        </div>
      </div>
    </div>
  );
}
