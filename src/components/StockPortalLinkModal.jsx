/* ═══════════════════════════════════════════════════════════════
   CLARK — Stock Portal Link Modal (V21.21.68)

   توليد/إدارة لينك بورتال المخزن المتاح (admin/manager).
   - بيجيب اللينك الحالي (وبينشئ المفتاح أول مرة) من /api/stock-portal-sign.
   - نسخ / فتح اللينك.
   - حفظ رقم واتساب الاستلام (يظهر زر «اطلب» في البورتال).
   - تدوير اللينك → إلغاء كل اللينكات القديمة فوراً (revoke).
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { Btn } from "./ui.jsx";
import { auth } from "../firebase.js";
import { ask } from "../utils/popups.js";

export function StockPortalLinkModal({ T, FS, isMob, showToast, onClose }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  const call = async (payload) => {
    const user = auth.currentUser;
    if (!user) throw new Error("يرجى تسجيل الدخول");
    const token = await user.getIdToken();
    const res = await fetch("/api/stock-portal-sign", {
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
        setPhone(j.phone || "");
        setPhoneInput(j.phone || "");
      } catch (e) { setError(e.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  /* V21.27.134: لينك «معرض الصور» = نفس اللينك + view=showcase (نفس التوقيع/الأمان). */
  const showcaseUrl = url ? (url + "&view=showcase") : "";
  /* V21.27.135: لينك «معرض بالأسعار» = صورة كبيرة + العدد + سعر الجملة + رقم الموديل. */
  const catalogUrl = url ? (url + "&view=catalog") : "";

  const copyUrl = async (u) => {
    try { await navigator.clipboard.writeText(u); showToast && showToast("✅ تم نسخ اللينك"); }
    catch (e) { showToast && showToast("⚠️ انسخ يدوياً"); }
  };

  const savePhone = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const j = await call({ phone: phoneInput.trim() });
      setPhone(j.phone || "");
      showToast && showToast("✅ تم حفظ رقم الواتساب");
    } catch (e) { showToast && showToast("⛔ " + (e.message || "فشل الحفظ")); }
    finally { setBusy(false); }
  };

  const rotate = async () => {
    if (busy) return;
    const ok = await ask("تدوير اللينك",
      "هيتولّد لينك جديد و**كل اللينكات القديمة هتتلغي فوراً** (أي حد فاتح اللينك القديم مش هيشوف حاجة). متأكد؟",
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

  const shareWa = (u, label) => {
    const txt = (label || "شوف المخزن المتاح عندنا") + " 👇\n" + u;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  };

  /* بلوك لينك واحد (الرابط + نسخ + معاينة + مشاركة) — يُعاد استخدامه للينكين. */
  const linkBlock = (title, sub, u, accent, shareLabel) => (
    <div style={{ border: "1px solid " + T.brd, borderRadius: 12, padding: 12, marginBottom: 12, background: T.bg }}>
      <div style={{ fontSize: FS - 1, fontWeight: 800, color: accent, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 8, lineHeight: 1.5 }}>{sub}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input readOnly value={u} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 160, padding: "9px 11px", borderRadius: 10, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontSize: FS - 3, direction: "ltr", fontFamily: "monospace" }} />
        <Btn small onClick={() => copyUrl(u)} style={{ background: accent, color: "#fff", border: "none", fontWeight: 800 }}>📋 نسخ</Btn>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn small ghost onClick={() => window.open(u, "_blank")}>👁 معاينة</Btn>
        <Btn small onClick={() => shareWa(u, shareLabel)} style={{ background: "#25D36612", color: "#1DA851", border: "1px solid #25D36640", fontWeight: 800 }}>💬 شارك على واتساب</Btn>
      </div>
    </div>
  );

  return <div onClick={onClose} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 8 : 16,
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 560,
      maxHeight: "92vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>
      {/* Header */}
      <div style={{ padding: isMob ? "14px 16px" : "16px 20px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.accent }}>🔗 لينك المخزن المتاح</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>٣ لينكات: تفصيلي · معرض صور (المتاح بس) · معرض بالأسعار</div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      <div style={{ padding: isMob ? 16 : 20 }}>
        {loading
          ? <div style={{ padding: 30, textAlign: "center", color: T.textSec }}>⏳ جاري التحميل...</div>
          : error
          ? <div style={{ padding: 16, background: T.err + "10", border: "1px solid " + T.err + "30", borderRadius: 10, color: T.err, fontSize: FS - 1 }}>⛔ {error}</div>
          : <>
            {/* V21.27.134: لينكين من نفس الزر */}
            {linkBlock(
              "🛍️ لينك تفصيلي",
              "الموديلات + الألوان المتاحة (بالصور) + الكمية + سعر الجملة + زر «اطلب».",
              url, T.accent, "شوف المخزن المتاح بالتفصيل عندنا")}
            {linkBlock(
              "🖼️ لينك معرض الصور",
              "صورة كبيرة لكل موديل في صف واحد + «متاح كام» بس — للعرض السريع (زي الكتالوج).",
              showcaseUrl, "#8B5CF6", "شوف معرض الموديلات المتاحة عندنا")}
            {linkBlock(
              "💰 لينك معرض بالأسعار",
              "صورة كبيرة لكل موديل في صف واحد + العدد المتاح + سعر الجملة + رقم الموديل.",
              catalogUrl, "#D97706", "شوف معرض الموديلات بالأسعار عندنا")}

            {/* WhatsApp receive phone */}
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>رقم واتساب الاستلام (لزر «اطلب» في البورتال)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="مثال: 201001234567" style={{ flex: 1, minWidth: 180, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontSize: FS - 1, direction: "ltr" }} />
              <Btn small onClick={savePhone} disabled={busy || phoneInput.trim() === phone} style={{ background: T.ok, color: "#fff", border: "none", fontWeight: 800 }}>💾 حفظ</Btn>
            </div>
            <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 18 }}>{phone ? "الحالي: " + phone : "مفيش رقم — زر «اطلب» مش هيظهر للعميل"}</div>

            {/* Privacy + revoke */}
            <div style={{ padding: "10px 12px", background: T.warn + "08", border: "1px solid " + T.warn + "30", borderRadius: 10, fontSize: FS - 3, color: T.warn, lineHeight: 1.6, marginBottom: 14 }}>
              ⚠️ اللينك بيعرض أسعار الجملة لأي حد يفتحه. لو اتسرّب، دوّر اللينك لإلغائه فوراً.
            </div>
            <Btn onClick={rotate} disabled={busy} style={{ width: "100%", background: T.err + "10", color: T.err, border: "1px solid " + T.err + "30", fontWeight: 800 }}>
              🔄 تدوير اللينك (إلغاء كل اللينكات القديمة)
            </Btn>
          </>}
      </div>
    </div>
  </div>;
}
