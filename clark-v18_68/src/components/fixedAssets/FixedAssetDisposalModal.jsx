/* ═══════════════════════════════════════════════════════════════════════
   CLARK · FixedAssetDisposalModal (V18.67)
   ───────────────────────────────────────────────────────────────────────
   Disposes of a fixed asset (sale or scrap).
   Shows live gain/loss preview and posts the disposal entry.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp } from "../ui.jsx";
import { AccountSelector } from "../accounting/AccountSelector.jsx";
import { buildDisposalAnalysis, postAssetDisposal } from "../../utils/accounting/assetDisposal.js";
import { fmt } from "../../utils/format.js";
import { tell } from "../../utils/popups.js";

export function FixedAssetDisposalModal({
  asset, coa, config, T, FS, isMob,
  onClose, showToast, userName,
}){
  const [disposalDate, setDisposalDate]   = useState(new Date().toISOString().split("T")[0]);
  const [disposalAmount, setAmount]       = useState("");
  const [proceedsCode, setProceedsCode]   = useState("1110"); /* default cash */
  const [notes, setNotes]                 = useState("");
  const [busy, setBusy]                   = useState(false);

  const analysis = useMemo(
    () => buildDisposalAnalysis(asset, disposalAmount),
    [asset, disposalAmount],
  );

  const _resolveAccount = (code) => (coa || []).find(a => a.code === code) || null;

  const handleConfirm = async () => {
    if(!disposalDate){
      await tell("بيانات ناقصة", "حدد تاريخ التصرف", { danger: true });
      return;
    }
    if(analysis.proceeds > 0 && !proceedsCode){
      await tell("بيانات ناقصة", "اختر حساب المتحصلات", { danger: true });
      return;
    }
    setBusy(true);
    try {
      await postAssetDisposal({
        asset,
        disposalDate,
        disposalAmount: analysis.proceeds,
        proceedsAccountCode: proceedsCode,
        coa,
        userName,
        configForLockCheck: config,
        notes: notes.trim(),
      });
      showToast("✓ تم تسجيل التصرف في الأصل");
      onClose();
    } catch(e){
      console.error(e);
      await tell("فشل التصرف", e.message || String(e), { danger: true });
    } finally {
      setBusy(false);
    }
  };

  const _amt = (n) => Math.abs(n) < 0.005 ? "—" : fmt(n.toFixed(2));

  return <div className="pop-overlay" style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 4 : 16,
  }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 600,
      maxHeight: "94vh", display: "flex", flexDirection: "column",
      border: "1px solid "+T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>

      <div style={{
        padding: isMob ? "12px 14px" : "14px 18px", borderBottom: "1px solid "+T.brd,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div>
          <div style={{fontSize: FS+2, fontWeight: 800, color: T.warn}}>🗑️ التصرف في أصل ثابت</div>
          <div style={{fontSize: FS-2, color: T.textSec, marginTop: 2}}>
            {asset.code} · {asset.name}
          </div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      <div style={{flex: 1, overflowY: "auto", padding: isMob ? 12 : 16}}>

        {/* Asset summary */}
        <div style={{
          padding: "10px 12px", background: T.bg, borderRadius: 8,
          border: "1px solid "+T.brd, marginBottom: 14,
        }}>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: FS-2}}>
            <div>
              <div style={{color: T.textMut}}>التكلفة الأصلية</div>
              <div style={{fontWeight: 800, direction: "ltr", fontFamily: "monospace"}}>{_amt(analysis.cost)}</div>
            </div>
            <div>
              <div style={{color: T.textMut}}>الإهلاك المتراكم</div>
              <div style={{fontWeight: 800, color: T.err, direction: "ltr", fontFamily: "monospace"}}>({_amt(analysis.accumulatedDepreciation)})</div>
            </div>
            <div>
              <div style={{color: T.textMut}}>القيمة الدفترية</div>
              <div style={{fontWeight: 800, color: T.accent, direction: "ltr", fontFamily: "monospace"}}>{_amt(analysis.bookValue)}</div>
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              تاريخ التصرف *
            </label>
            <Inp type="date" value={disposalDate} onChange={setDisposalDate}/>
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              قيمة البيع (0 = تخلص بدون مقابل)
            </label>
            <Inp type="number" value={disposalAmount} onChange={setAmount} placeholder="0.00"/>
          </div>
        </div>

        {analysis.proceeds > 0 && <div style={{marginBottom: 12}}>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
            حساب المتحصلات (يستلم قيمة البيع)
          </label>
          <AccountSelector
            value={_resolveAccount(proceedsCode)?.id || null}
            onChange={id => { const a = (coa || []).find(x => x.id === id); if(a) setProceedsCode(a.code); }}
            coa={coa} T={T} FS={FS} filterType="asset"
          />
        </div>}

        <div style={{marginBottom: 12}}>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
            ملاحظات
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="ظروف التصرف، اسم المشتري، إلخ..."
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "1px solid "+T.brd, fontSize: FS-1, fontFamily: "inherit",
              background: T.cardSolid, color: T.text, boxSizing: "border-box",
              minHeight: 50, resize: "vertical",
            }}
          />
        </div>

        {/* Result preview */}
        {(analysis.hasGain || analysis.hasLoss || analysis.breakEven) && <div style={{
          padding: "12px 14px",
          background: analysis.hasGain ? T.ok+"10" : analysis.hasLoss ? T.err+"10" : T.bg,
          borderRadius: 8,
          border: "1px solid " + (analysis.hasGain ? T.ok+"40" : analysis.hasLoss ? T.err+"40" : T.brd),
          fontSize: FS-1, fontWeight: 700, marginBottom: 12,
        }}>
          {analysis.hasGain && <div style={{color: T.ok}}>
            ✓ صافي ربح من التصرف: <span style={{direction: "ltr", fontFamily: "monospace"}}>{_amt(analysis.gain)}</span> ج.م
          </div>}
          {analysis.hasLoss && <div style={{color: T.err}}>
            ⚠ صافي خسارة من التصرف: <span style={{direction: "ltr", fontFamily: "monospace"}}>{_amt(analysis.loss)}</span> ج.م
          </div>}
          {analysis.breakEven && analysis.proceeds === 0 && <div style={{color: T.textMut}}>
            تخلص بدون مقابل (لا ربح ولا خسارة — الأصل مُهلك بالكامل)
          </div>}
          {analysis.breakEven && analysis.proceeds > 0 && <div style={{color: T.text}}>
            بيع بالقيمة الدفترية تماماً (لا ربح ولا خسارة)
          </div>}
        </div>}

        {/* Last depreciation warning */}
        {asset.lastDepreciatedThrough && (
          () => {
            const lastDep = asset.lastDepreciatedThrough;
            const targetMonth = disposalDate.slice(0, 7);
            if(targetMonth > lastDep) return <div style={{
              padding: "10px 12px", background: T.warn+"10", borderRadius: 8,
              border: "1px solid "+T.warn+"40", fontSize: FS-2, color: T.warn,
              fontWeight: 600, lineHeight: 1.6,
            }}>
              ⚠️ الأصل لم يتم إهلاكه عن الفترة بعد <b>{lastDep}</b>. لو تحب تشغل إهلاك جزئي لحد تاريخ التصرف، روح لتاب "الإهلاك الشهري" أولاً.
            </div>;
            return null;
          }
        )()}
      </div>

      <div style={{
        padding: isMob ? 12 : 14, background: T.bg, borderTop: "1px solid "+T.brd,
        display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0,
      }}>
        <Btn ghost onClick={onClose} disabled={busy}>↩️ إلغاء</Btn>
        <Btn primary onClick={handleConfirm} disabled={busy} style={{
          background: T.warn, color: "#fff", border: "none",
          fontWeight: 800, padding: "10px 22px",
        }}>
          {busy ? "⏳ جاري الترحيل..." : "🗑️ تأكيد التصرف"}
        </Btn>
      </div>
    </div>
  </div>;
}
