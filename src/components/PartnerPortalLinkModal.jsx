/* ═══════════════════════════════════════════════════════════════
   CLARK — Partner Portal Link & Settings Modal (V21.21.69)

   توليد/إدارة لينك بورتال الشريك + إعدادات العرض (admin/manager).
   - بيجيب اللينك الحالي + إعدادات العرض من /api/partner-portal-sign.
   - toggles: المالك يختار إيه يتعرض للشريك (مبيعات/مشتريات/مخزون/أرباح/
     أوامر/تفصيل العملاء/تفصيل الموردين).
   - نسخ / معاينة / مشاركة اللينك.
   - تدوير اللينك → إلغاء كل اللينكات القديمة فوراً.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { Btn } from "./ui.jsx";
import { auth } from "../firebase.js";
import { ask } from "../utils/popups.js";
import { PARTNER_TOGGLES, PARTNER_TOGGLE_LABELS, defaultVisibility } from "../utils/partnerPortal.js";

export function PartnerPortalLinkModal({ T, FS, isMob, showToast, onClose }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [vis, setVis] = useState(defaultVisibility());

  const call = async (payload) => {
    const user = auth.currentUser;
    if (!user) throw new Error("يرجى تسجيل الدخول");
    const token = await user.getIdToken();
    const res = await fetch("/api/partner-portal-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminToken: token, ...payload }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "فشل العملية");
    return json;
  };

  useEffect(() => {
    (async () => {
      try {
        const j = await call({});
        setUrl(j.url || "");
        setVis({ ...defaultVisibility(), ...(j.visibility || {}) });
      } catch (e) { setError(e.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); showToast && showToast("✅ تم نسخ اللينك"); }
    catch (e) { showToast && showToast("⚠️ انسخ يدوياً"); }
  };

  const toggle = async (key) => {
    if (busy) return;
    const next = { ...vis, [key]: !vis[key] };
    setVis(next); /* optimistic */
    setBusy(true);
    try { await call({ visibility: next }); }
    catch (e) { setVis(vis); showToast && showToast("⛔ " + (e.message || "فشل الحفظ")); }
    finally { setBusy(false); }
  };

  const rotate = async () => {
    if (busy) return;
    const ok = await ask("تدوير اللينك",
      "هيتولّد لينك جديد و**كل اللينكات القديمة هتتلغي فوراً**. متأكد؟",
      { confirmText: "دوّر وألغِ القديم", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const j = await call({ rotate: true });
      setUrl(j.url || "");
      showToast && showToast("🔄 تم تدوير اللينك — القديم اتلغى");
    } catch (e) { showToast && showToast("⛔ " + (e.message || "فشل التدوير")); }
    finally { setBusy(false); }
  };

  const shareWa = () => window.open("https://wa.me/?text=" + encodeURIComponent("لوحة التحكم 👇\n" + url), "_blank");

  return <div onClick={onClose} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 8 : 16,
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 580,
      maxHeight: "92vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>
      <div style={{ padding: isMob ? "14px 16px" : "16px 20px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#6366F1" }}>📊 لينك لوحة التحكم</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>لوحة لحظية — تختار إيه يتعرض</div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      <div style={{ padding: isMob ? 16 : 20 }}>
        {loading
          ? <div style={{ padding: 30, textAlign: "center", color: T.textSec }}>⏳ جاري التحميل...</div>
          : error
          ? <div style={{ padding: 16, background: T.err + "10", border: "1px solid " + T.err + "30", borderRadius: 10, color: T.err, fontSize: FS - 1 }}>⛔ {error}</div>
          : <>
            {/* link */}
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>الرابط</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <input readOnly value={url} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 180, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.brd, background: T.bg, color: T.text, fontSize: FS - 2, direction: "ltr", fontFamily: "monospace" }} />
              <Btn small onClick={copy} style={{ background: "#6366F1", color: "#fff", border: "none", fontWeight: 800 }}>📋 نسخ</Btn>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              <Btn small ghost onClick={() => window.open(url, "_blank")}>👁 معاينة</Btn>
              <Btn small onClick={shareWa} style={{ background: "#25D36612", color: "#1DA851", border: "1px solid #25D36640", fontWeight: 800 }}>💬 شارك على واتساب</Btn>
            </div>

            {/* visibility toggles */}
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 8 }}>إيه اللي يتعرض في اللوحة؟</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              {PARTNER_TOGGLES.map(key => {
                const on = !!vis[key];
                return <div key={key} onClick={() => toggle(key)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "10px 12px", borderRadius: 10, cursor: busy ? "wait" : "pointer",
                  background: on ? "#6366F108" : T.bg, border: "1px solid " + (on ? "#6366F130" : T.brd),
                }}>
                  <span style={{ fontSize: FS - 1, fontWeight: 700, color: on ? T.text : T.textMut }}>{PARTNER_TOGGLE_LABELS[key]}</span>
                  <span style={{
                    width: 42, height: 24, borderRadius: 999, background: on ? "#6366F1" : T.brd,
                    position: "relative", transition: "background 0.15s", flexShrink: 0,
                  }}>
                    <span style={{ position: "absolute", top: 2, insetInlineStart: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "inset-inline-start 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                  </span>
                </div>;
              })}
            </div>

            <div style={{ padding: "10px 12px", background: T.warn + "08", border: "1px solid " + T.warn + "30", borderRadius: 10, fontSize: FS - 3, color: T.warn, lineHeight: 1.6, marginBottom: 14 }}>
              ⚠️ اللينك بيعرض بيانات مالية حسّاسة لأي حد يفتحه. لو اتسرّب، دوّر اللينك فوراً.
            </div>
            <Btn onClick={rotate} disabled={busy} style={{ width: "100%", background: T.err + "10", color: T.err, border: "1px solid " + T.err + "30", fontWeight: 800 }}>
              🔄 تدوير اللينك (إلغاء كل اللينكات القديمة)
            </Btn>
          </>}
      </div>
    </div>
  </div>;
}
