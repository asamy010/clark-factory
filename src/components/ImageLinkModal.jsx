/* ═══════════════════════════════════════════════════════════════
   CLARK — ImageLinkModal (V21.27.7)

   ربط صورة بموديل أو أمر تشغيل (أو بلون داخل الأمر) — نفس أوبشن الربط اللي في
   الاستوديو (AIStudioPg)، متعمل كمكوّن قابل لإعادة الاستخدام عشان يتنده من
   «مساحة التخزين» (DocumentsPg) كمان.

   props:
     image       = { url, storagePath }  الصورة اللي هتتربط
     models      = []                    قايمة الموديلات (لها id + modelNo)
     orders      = []                    أوامر التشغيل (data.orders)
     replaceModel(id, next)              كاتب الموديل (اختياري — يفعّل تبويب موديل)
     updOrder(orderId, fn)               كاتب الأمر (اختياري — يفعّل تبويب أمر)
     onClose()                           إغلاق

   ملاحظة: بنمرّر image.storagePath زي ما هو لـ imageStoragePath. لو الصورة من
   مستند مشترك (مساحة التخزين) مرّر storagePath:"" عشان حذف الموديل/الأمر
   مايمسحش المستند المشترك.
   ═══════════════════════════════════════════════════════════════ */
import { useMemo, useState } from "react";
import { Btn, SearchSel } from "./ui.jsx";
import { FKEYS } from "../constants/index.js";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";

/* ألوان أمر (dedup عبر colorsA..H) — نفس منطق ColorSizeMatrixTab/الاستوديو */
function orderColorsOf(o){
  const out = []; const seen = new Set();
  if(!o) return out;
  FKEYS.forEach(k => (o["colors" + k] || []).forEach(c => {
    const nm = String((typeof c === "string" ? c : (c?.color || c?.n || c?.name || "")) || "").trim();
    const hex = (typeof c === "object" ? (c.colorHex || "#cbd5e1") : "#cbd5e1");
    if(nm && !seen.has(nm.toLowerCase())){ seen.add(nm.toLowerCase()); out.push({ color: nm, colorHex: hex }); }
  }));
  return out;
}

export function ImageLinkModal({ image, models, orders, replaceModel, updOrder, onClose }){
  const canModel = !!replaceModel;
  const canOrder = !!updOrder;
  const [linkTab, setLinkTab] = useState(canModel ? "model" : "order");
  const [linkOrderId, setLinkOrderId] = useState(null);
  const [linkModelId, setLinkModelId] = useState(null);

  const modelOpts = useMemo(() => (Array.isArray(models) ? models : [])
    .filter(m => m && m.id).map(m => ({ value: String(m.id), label: (m.modelNo || "—") + (m.modelDesc ? " — " + m.modelDesc : "") })),
    [models]);
  const ordersArr = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);
  const orderOpts = useMemo(() => ordersArr
    .filter(o => o && o.id).map(o => ({ value: String(o.id), label: (o.modelNo || o.poNumber || o.id || "—") + (o.modelDesc ? " — " + o.modelDesc : "") })),
    [ordersArr]);

  if(!image) return null;
  const tab = ((linkTab === "order" && canOrder) || !canModel) ? "order" : "model";
  const selOrder = linkOrderId ? ordersArr.find(o => String(o.id) === String(linkOrderId)) : null;
  const selColors = selOrder ? orderColorsOf(selOrder) : [];
  const selModel = linkModelId ? (Array.isArray(models) ? models : []).find(m => String(m.id) === String(linkModelId)) : null;
  const selModelColors = selModel ? orderColorsOf(selModel) : [];

  /* V21.27.9: ربط بالموديل = صورة رئيسية (أول اختيار) أو صورة لون — زي الأمر.
     صورة الموديل/صور ألوانه بتنزل تلقائياً لأي أوردر يتعمل منه (buildOrderFromModel). */
  const linkToModel = (id, color) => {
    const m = (Array.isArray(models) ? models : []).find(x => String(x.id) === String(id));
    if(!m){ showToast("⚠️ اختر موديل من القايمة"); return; }
    if(color){
      const sm = { ...(m.shopify_meta || {}) };
      sm.color_images = { ...(sm.color_images || {}), [color]: { url: image.url, alt: color, source: "document" } };
      replaceModel(m.id, { ...m, shopify_meta: sm });
      showToast("🎨 اتربطت الصورة بلون «" + color + "» في موديل «" + (m.modelNo || m.id) + "» — هتنزل لأوامره");
    } else {
      replaceModel(m.id, { ...m, image: image.url, imageStoragePath: image.storagePath || "" });
      showToast("🔗 اتربطت كصورة رئيسية لموديل «" + (m.modelNo || m.id) + "» — هتنزل لأوامره");
    }
    onClose && onClose();
  };
  const linkToOrder = (orderId, color) => {
    const o = ordersArr.find(x => String(x.id) === String(orderId));
    if(!o){ showToast("⚠️ اختر أمر تشغيل"); return; }
    if(color){
      updOrder(orderId, d => {
        if(!d.shopify_meta) d.shopify_meta = {};
        if(!d.shopify_meta.color_images) d.shopify_meta.color_images = {};
        d.shopify_meta.color_images[color] = { url: image.url, alt: color, source: "document" };
      });
      showToast("🎨 اتربطت الصورة بلون «" + color + "» في أمر «" + (o.modelNo || orderId) + "»");
    } else {
      updOrder(orderId, d => { d.image = image.url; d.imageStoragePath = image.storagePath || ""; });
      showToast("🔗 اتربطت كصورة رئيسية لأمر «" + (o.modelNo || orderId) + "»");
    }
    onClose && onClose();
  };

  const tabBtn = (on) => ({ flex: 1, background: on ? T.accent : T.accent + "12", color: on ? "#fff" : T.accent, border: "1px solid " + T.accent + (on ? "" : "33"), fontWeight: 800 });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bg, borderRadius: 14, width: "100%", maxWidth: 460, border: "2px solid " + T.accent + "30", boxShadow: "0 25px 70px rgba(0,0,0,0.4)", padding: 18, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: FS + 2, fontWeight: 900, color: T.accent }}>🔗 ربط الصورة</div>
          <Btn ghost onClick={onClose}>✕</Btn>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <img src={image.url} alt="" style={{ width: 64, height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid " + T.brd, flexShrink: 0 }} />
          <div style={{ fontSize: FS - 2, color: T.textSec, lineHeight: 1.6 }}>{tab === "model"
            ? "اكتب رقم الموديل واختاره — الصورة بتتحفظ كصورة رئيسية للموديل."
            : "دوّر على الأمر بـ«رقم الموديل اللي جوّاه» — اربط الصورة كصورة رئيسية للأمر، أو بلون معيّن فتظهر في شبكة اللون/المقاس."}</div>
        </div>
        {canModel && canOrder && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <Btn small onClick={() => { setLinkTab("model"); setLinkOrderId(null); }} style={tabBtn(tab === "model")}>🧩 موديل</Btn>
            <Btn small onClick={() => setLinkTab("order")} style={tabBtn(tab === "order")}>📋 أمر تشغيل</Btn>
          </div>
        )}
        {tab === "model" ? (
          modelOpts.length === 0 ? (
            <div style={{ fontSize: FS - 2, color: T.textMut, background: T.cardSolid, border: "1px dashed " + T.brd, borderRadius: 8, padding: "12px 14px", lineHeight: 1.7, textAlign: "center" }}>مفيش موديلات متاحة للربط — أنشئ موديل الأول من تبويب «الموديلات».</div>
          ) : !selModel ? (
            <SearchSel value="" onChange={(id) => setLinkModelId(id)} options={modelOpts} showAllOnFocus maxResults={10} placeholder="🔍 اكتب رقم الموديل..." />
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 10px", background: T.accent + "0D", borderRadius: 8, border: "1px solid " + T.accent + "22" }}>
                <div style={{ fontWeight: 800, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🧩 {selModel.modelNo || selModel.id}{selModel.modelDesc ? " — " + selModel.modelDesc : ""}</div>
                <span onClick={() => setLinkModelId(null)} style={{ cursor: "pointer", color: T.accent, fontWeight: 700, fontSize: FS - 2, flexShrink: 0 }}>تغيير</span>
              </div>
              <Btn primary onClick={() => linkToModel(linkModelId, null)} style={{ width: "100%", marginBottom: 12 }}>📌 ربط كصورة رئيسية للموديل</Btn>
              <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>🎨 أو اربطها بلون (تظهر في شبكة اللون/المقاس وتنزل لأوامره):</div>
              {selModelColors.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {selModelColors.map(c => (
                    <span key={c.color} onClick={() => linkToModel(linkModelId, c.color)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: "1px solid " + T.brd, background: T.cardSolid, cursor: "pointer", fontWeight: 700, fontSize: FS - 1, color: T.text }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: c.colorHex || "#ccc", border: "1px solid " + T.brd }} />
                      {c.color}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: FS - 2, color: T.textMut }}>الموديل مفيهوش ألوان محددة.</div>
              )}
            </div>
          )
        ) : !selOrder ? (
          orderOpts.length > 0 ? (
            <SearchSel value="" onChange={(id) => setLinkOrderId(id)} options={orderOpts} showAllOnFocus maxResults={10} placeholder="🔍 اكتب رقم الموديل اللي في الأمر..." />
          ) : (
            <div style={{ fontSize: FS - 2, color: T.textMut, background: T.cardSolid, border: "1px dashed " + T.brd, borderRadius: 8, padding: "12px 14px", lineHeight: 1.7, textAlign: "center" }}>مفيش أوامر تشغيل.</div>
          )
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 10px", background: T.accent + "0D", borderRadius: 8, border: "1px solid " + T.accent + "22" }}>
              <div style={{ fontWeight: 800, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📋 {selOrder.modelNo || selOrder.id}{selOrder.modelDesc ? " — " + selOrder.modelDesc : ""}</div>
              <span onClick={() => setLinkOrderId(null)} style={{ cursor: "pointer", color: T.accent, fontWeight: 700, fontSize: FS - 2, flexShrink: 0 }}>تغيير</span>
            </div>
            <Btn primary onClick={() => linkToOrder(linkOrderId, null)} style={{ width: "100%", marginBottom: 12 }}>📌 ربط كصورة رئيسية للأمر</Btn>
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>🎨 أو اربطها بلون (تظهر في شبكة اللون/المقاس):</div>
            {selColors.length > 0 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selColors.map(c => (
                  <span key={c.color} onClick={() => linkToOrder(linkOrderId, c.color)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: "1px solid " + T.brd, background: T.cardSolid, cursor: "pointer", fontWeight: 700, fontSize: FS - 1, color: T.text }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: c.colorHex || "#ccc", border: "1px solid " + T.brd }} />
                    {c.color}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: FS - 2, color: T.textMut }}>الأمر مفيهوش ألوان محددة.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageLinkModal;
