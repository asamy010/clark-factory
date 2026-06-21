/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PrintPriceChoiceModal (V21.27.84)
   بوب اب صغير قبل الطباعة: «مع الأسعار» أو «بدون الأسعار» (كميات فقط).
   onPick(showPrices:boolean) — المستدعي بيطبع النسخة المناسبة.
   ═══════════════════════════════════════════════════════════════════════ */

import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { Btn } from "./ui.jsx";

export function PrintPriceChoiceModal({ title = "طباعة", onPick, onClose }){
  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100004, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 360, padding: 20, border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>🖨️ {title}</div>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 16 }}>اختر نوع النسخة المطبوعة.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div onClick={() => onPick(true)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, border: "1px solid " + T.brd, cursor: "pointer", background: T.bg }}>
            <span style={{ fontSize: 22 }}>💰</span>
            <div><div style={{ fontWeight: 800, color: T.text, fontSize: FS }}>مع الأسعار</div><div style={{ fontSize: FS - 3, color: T.textMut }}>نسخة كاملة (أسعار + إجماليات)</div></div>
          </div>
          <div onClick={() => onPick(false)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, border: "1px solid " + T.accent + "40", cursor: "pointer", background: T.accent + "0D" }}>
            <span style={{ fontSize: 22 }}>📦</span>
            <div><div style={{ fontWeight: 800, color: T.accent, fontSize: FS }}>بدون الأسعار</div><div style={{ fontSize: FS - 3, color: T.textMut }}>كميات فقط (بدون سعر / خصم / إجمالي)</div></div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Btn ghost small onClick={onClose}>إلغاء</Btn>
        </div>
      </div>
    </div>
  );
}

export default PrintPriceChoiceModal;
