/* ═══════════════════════════════════════════════════════════════════════
   CLARK · FixedAssetEditModal (V18.67)
   ───────────────────────────────────────────────────────────────────────
   Modal to add a new fixed asset or edit an existing one.
   On save, also triggers the optional initial purchase journal entry
   (Dr asset / Cr cash or supplier) if the user opts in.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Inp, Sel } from "../ui.jsx";
import { AccountSelector } from "../accounting/AccountSelector.jsx";
import {
  createFixedAsset, updateFixedAsset, ASSET_CATEGORIES,
  computeDepreciationSchedule, monthlyDepreciation,
} from "../../utils/accounting/fixedAssets.js";
import { fmt } from "../../utils/format.js";
import { ask, tell } from "../../utils/popups.js";

export function FixedAssetEditModal({
  asset, allAssets, coa, T, FS, isMob,
  onClose, showToast, userName,
}){
  const isEdit = !!asset?.id;

  /* Form state */
  const [name, setName]                 = useState(asset?.name || "");
  const [category, setCategory]         = useState(asset?.category || ASSET_CATEGORIES[0]);
  const [acquisitionDate, setAcqDate]   = useState(asset?.acquisitionDate || new Date().toISOString().split("T")[0]);
  const [acquisitionCost, setAcqCost]   = useState(asset?.acquisitionCost || "");
  const [salvageValue, setSalvage]      = useState(asset?.salvageValue || "");
  const [usefulLifeMonths, setLife]     = useState(asset?.usefulLifeMonths || 60);
  const [convention, setConvention]     = useState(asset?.convention || "next-month");
  const [assetCode, setAssetCode]       = useState(asset?.assetAccountCode || "1410");
  const [accCode, setAccCode]           = useState(asset?.accumDepAccountCode || "1490");
  const [expCode, setExpCode]           = useState(asset?.depExpenseAccountCode || "5410");
  const [notes, setNotes]               = useState(asset?.notes || "");
  const [busy, setBusy]                 = useState(false);

  /* Live computed schedule + monthly amount */
  const schedule = useMemo(() => computeDepreciationSchedule(
    acquisitionDate,
    Number(usefulLifeMonths) || 0,
    convention,
  ), [acquisitionDate, usefulLifeMonths, convention]);

  const monthlyAmt = useMemo(() => monthlyDepreciation({
    acquisitionCost: Number(acquisitionCost) || 0,
    salvageValue: Number(salvageValue) || 0,
    usefulLifeMonths: Number(usefulLifeMonths) || 0,
  }), [acquisitionCost, salvageValue, usefulLifeMonths]);

  const validate = () => {
    if(!name.trim()) return "أدخل اسم الأصل";
    if(!acquisitionDate) return "أدخل تاريخ الاقتناء";
    const cost = Number(acquisitionCost) || 0;
    if(cost <= 0) return "تكلفة الاقتناء يجب أن تكون أكبر من صفر";
    const salvage = Number(salvageValue) || 0;
    if(salvage < 0) return "قيمة الخردة لا يمكن أن تكون سالبة";
    if(salvage >= cost) return "قيمة الخردة لا يمكن أن تكون أكبر من أو تساوي التكلفة";
    const life = Number(usefulLifeMonths) || 0;
    if(life <= 0) return "العمر الإنتاجي يجب أن يكون أكبر من صفر";
    if(life > 600) return "العمر الإنتاجي طويل جداً (الحد الأقصى 50 سنة = 600 شهر)";
    if(!assetCode || !accCode || !expCode) return "اختر الحسابات الثلاثة (الأصل + مجمع الإهلاك + مصروف الإهلاك)";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if(err){ await tell("بيانات ناقصة", err, { danger: true }); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || ASSET_CATEGORIES[0],
        acquisitionDate,
        acquisitionCost: Number(acquisitionCost) || 0,
        salvageValue: Number(salvageValue) || 0,
        usefulLifeMonths: Number(usefulLifeMonths) || 0,
        depreciationMethod: "straight_line",
        convention,
        assetAccountCode: assetCode,
        accumDepAccountCode: accCode,
        depExpenseAccountCode: expCode,
        notes: notes.trim(),
      };
      if(isEdit){
        await updateFixedAsset(asset.id, payload, userName);
        showToast("✓ تم تحديث بيانات الأصل");
      } else {
        await createFixedAsset(payload, allAssets, userName);
        showToast("✓ تم إضافة الأصل");
      }
      onClose();
    } catch(e){
      console.error(e);
      await tell("فشل الحفظ", e.message || String(e), { danger: true });
    } finally {
      setBusy(false);
    }
  };

  const _resolveAccount = (code) => {
    const acc = (coa || []).find(a => a.code === code);
    return acc || null;
  };

  return <div className="pop-overlay" style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 4 : 16,
  }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 720,
      maxHeight: "94vh", display: "flex", flexDirection: "column",
      border: "1px solid "+T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>

      {/* Header */}
      <div style={{
        padding: isMob ? "12px 14px" : "14px 18px", borderBottom: "1px solid "+T.brd,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div>
          <div style={{fontSize: FS+2, fontWeight: 800, color: T.accent}}>
            {isEdit ? "✏️ تعديل أصل ثابت" : "🏭 أصل ثابت جديد"}
          </div>
          {isEdit && <div style={{fontSize: FS-2, color: T.textSec, marginTop: 2}}>
            {asset.code}
          </div>}
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Body */}
      <div style={{flex: 1, overflowY: "auto", padding: isMob ? 12 : 16}}>

        {/* Basic info */}
        <div style={{fontSize: FS-1, fontWeight: 800, color: T.text, marginBottom: 8}}>📋 البيانات الأساسية</div>
        <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "2fr 1fr", gap: 10, marginBottom: 14}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              الاسم *
            </label>
            <Inp value={name} onChange={setName} placeholder="مثال: ماكينة Juki 8500"/>
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              الفئة
            </label>
            <Sel value={category} onChange={setCategory}>
              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>
        </div>

        {/* Cost & life */}
        <div style={{fontSize: FS-1, fontWeight: 800, color: T.text, marginBottom: 8}}>💰 التكلفة والعمر</div>
        <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 12}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              تاريخ الاقتناء *
            </label>
            <Inp type="date" value={acquisitionDate} onChange={setAcqDate}/>
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              التكلفة الأصلية *
            </label>
            <Inp type="number" value={acquisitionCost} onChange={setAcqCost} placeholder="0.00"/>
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              قيمة الخردة
            </label>
            <Inp type="number" value={salvageValue} onChange={setSalvage} placeholder="0"/>
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              العمر الإنتاجي (شهور) *
            </label>
            <Inp type="number" value={usefulLifeMonths} onChange={setLife} placeholder="60"/>
          </div>
        </div>

        {/* Convention */}
        <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 2fr", gap: 10, marginBottom: 14}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              نمط بداية الإهلاك
            </label>
            <Sel value={convention} onChange={setConvention}>
              <option value="next-month">يبدأ من الشهر التالي</option>
              <option value="full-month">يبدأ من نفس الشهر (كامل)</option>
            </Sel>
          </div>
          <div style={{
            padding: "10px 12px", background: T.accent+"08",
            borderRadius: 8, border: "1px solid "+T.accent+"30",
            fontSize: FS-2, color: T.text, lineHeight: 1.6,
          }}>
            {schedule.startMonth && schedule.endMonth ? <>
              <div>📅 جدولة: من <b style={{fontFamily: "monospace"}}>{schedule.startMonth}</b> إلى <b style={{fontFamily: "monospace"}}>{schedule.endMonth}</b></div>
              <div>💰 إهلاك شهري: <b style={{color: T.accent, direction: "ltr", fontFamily: "monospace"}}>{fmt(monthlyAmt.toFixed(2))}</b> ج.م</div>
            </> : <div style={{color: T.textMut}}>أدخل التكلفة والعمر لمعرفة الإهلاك الشهري</div>}
          </div>
        </div>

        {/* Accounts mapping */}
        <div style={{fontSize: FS-1, fontWeight: 800, color: T.text, marginBottom: 8}}>📊 الحسابات المرتبطة</div>
        <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 14}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              حساب الأصل (مدين عند الشراء)
            </label>
            <AccountSelector
              value={_resolveAccount(assetCode)?.id || null}
              onChange={id => { const a = (coa || []).find(x => x.id === id); if(a) setAssetCode(a.code); }}
              coa={coa} T={T} FS={FS} filterType="asset"
            />
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              مجمع الإهلاك (دائن مع كل قيد)
            </label>
            <AccountSelector
              value={_resolveAccount(accCode)?.id || null}
              onChange={id => { const a = (coa || []).find(x => x.id === id); if(a) setAccCode(a.code); }}
              coa={coa} T={T} FS={FS} filterType="asset"
            />
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
              مصروف الإهلاك (مدين شهرياً)
            </label>
            <AccountSelector
              value={_resolveAccount(expCode)?.id || null}
              onChange={id => { const a = (coa || []).find(x => x.id === id); if(a) setExpCode(a.code); }}
              coa={coa} T={T} FS={FS} filterType="expense"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4}}>
            ملاحظات
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="رقم تسلسلي، موقع، تعليقات..."
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "1px solid "+T.brd, fontSize: FS-1, fontFamily: "inherit",
              background: T.cardSolid, color: T.text, boxSizing: "border-box",
              minHeight: 60, resize: "vertical",
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: isMob ? 12 : 14, background: T.bg, borderTop: "1px solid "+T.brd,
        display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0,
      }}>
        <Btn ghost onClick={onClose} disabled={busy}>↩️ إلغاء</Btn>
        <Btn primary onClick={handleSave} disabled={busy} style={{
          background: T.accent, color: "#fff", border: "none",
          fontWeight: 800, padding: "10px 22px",
        }}>
          {busy ? "⏳ جاري الحفظ..." : (isEdit ? "💾 حفظ التعديلات" : "➕ إضافة الأصل")}
        </Btn>
      </div>
    </div>
  </div>;
}
