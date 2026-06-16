/* ═══════════════════════════════════════════════════════════════
   CLARK · ModelDetailModal.jsx (V21.27.19)
   بوب اب كبير لعرض تفاصيل الموديل (للقراءة) + تابات + الأوامر المرتبطة +
   زر تعديل وزر إغلاق. الصورة تتفتح بالجودة الكاملة (ImageLightbox).
   ═══════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { Btn, Badge } from "./ui.jsx";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { T } from "../theme.js";
import { FS, FKEYS, FCOL } from "../constants/index.js";
import { sqty, gIcon } from "../utils/format.js";
import { sanitizeHtml } from "../utils/sanitizeHtml.js";

export function ModelDetailModal({ model, data, orders, statusCards, onEdit, onClose }){
  const [tab, setTab] = useState("fabrics");
  const [zoom, setZoom] = useState(null);
  if(!model) return null;

  const fabObj = (id) => (data.fabrics || []).find(f => String(f.id) === String(id));
  const sizeLabel = model.sizeLabel || ((data.sizeSets || []).find(s => s.id === Number(model.sizeSetId)) || {}).label || "";
  const fabricList = FKEYS.filter(k => model["fabric" + k]).map(k => {
    const fb = fabObj(model["fabric" + k]);
    const cons = Number(model["cons" + k]) || 0;
    const ppl = Number(model["pcsPerLayer" + k]) || 0;
    return {
      k, idx: FKEYS.indexOf(k),
      name: (fb && fb.name) || model["fabric" + k + "Label"] || ("خامة " + k),
      unit: (fb && fb.unit) || model["fabric" + k + "Unit"] || "",
      price: (fb && fb.price) != null ? fb.price : (model["fabric" + k + "Price"] || 0),
      cons, ppl,
      per: (cons > 0 && ppl > 0) ? (Math.round(cons / ppl * 10000) / 10000) : 0,
      colors: (model["colors" + k] || []).filter(c => (c.color || "").trim()),
      pieces: model["fabricPieces" + k] || [],
    };
  });
  const accs = Array.isArray(model.accItems) ? model.accItems : [];
  const linked = (Array.isArray(orders) ? orders : []).filter(o => o && String(o.modelId) === String(model.id));
  const prodTxt = (model.prodDetails || "").replace(/<[^>]*>/g, "").trim();

  const TABS = [
    { id: "fabrics", label: "🧵 القماش/الألوان" },
    { id: "acc", label: "🔘 الإكسسوار" + (accs.length ? " (" + accs.length + ")" : "") },
    { id: "details", label: "📋 التفاصيل" },
    { id: "orders", label: "📦 الأوامر (" + linked.length + ")" },
  ];

  const sub = { fontSize: FS - 2, color: T.textSec, fontWeight: 600 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100040, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 18, width: "min(820px,100%)", maxHeight: "92vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 25px 80px rgba(0,0,0,0.4)" }}>
        {/* Header */}
        <div style={{ display: "flex", gap: 14, padding: 18, borderBottom: "1px solid " + T.brd, position: "sticky", top: 0, background: T.cardSolid, zIndex: 2, flexWrap: "wrap" }}>
          <div onClick={() => model.image && setZoom({ src: model.image, alt: model.modelNo })} style={{ width: 84, height: 106, borderRadius: 12, overflow: "hidden", border: "1.5px solid " + T.brd, flexShrink: 0, background: T.bg, cursor: model.image ? "zoom-in" : "default", display: "flex", alignItems: "center", justifyContent: "center" }} title={model.image ? "عرض بالجودة الكاملة" : ""}>
            {model.image ? <img src={model.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 32 }}>🧩</span>}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: FS + 5, fontWeight: 900, color: T.text, fontFamily: "monospace", letterSpacing: 0.5 }}>{model.modelNo || "—"}</div>
            <div style={{ fontSize: FS, color: T.textSec, fontWeight: 700, margin: "2px 0 6px" }}>{model.modelDesc || ""}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {sizeLabel && <span style={{ padding: "3px 12px", borderRadius: 999, background: T.accentBg, color: T.accent, fontSize: FS - 2, fontWeight: 700 }}>{sizeLabel}</span>}
              {(model.orderPieces || []).map((p, i) => <span key={i} style={{ padding: "3px 10px", borderRadius: 999, background: T.bg, border: "1px solid " + T.brd, fontSize: FS - 2, fontWeight: 600, color: T.textSec }}>{gIcon(p, data.garmentTypes) + " " + p}</span>)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {onEdit && <Btn small onClick={() => onEdit(model)} style={{ background: T.accent, color: "#fff", border: "none", fontWeight: 700 }}>✏️ تعديل</Btn>}
            <Btn small ghost onClick={onClose}>✕ إغلاق</Btn>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 18px 0", borderBottom: "2px solid " + T.brd, flexWrap: "wrap", position: "sticky", top: 142, background: T.cardSolid, zIndex: 1 }}>
          {TABS.map(t => <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 14px", cursor: "pointer", borderBottom: tab === t.id ? "3px solid " + T.accent : "3px solid transparent", marginBottom: -2, fontWeight: tab === t.id ? 800 : 600, color: tab === t.id ? T.accent : T.textSec, fontSize: FS - 1, whiteSpace: "nowrap" }}>{t.label}</div>)}
        </div>

        <div style={{ padding: 18 }}>
          {/* القماش/الألوان */}
          {tab === "fabrics" && (fabricList.length === 0 ? <Empty>مفيش خامات</Empty> : <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {fabricList.map(f => <div key={f.k} style={{ border: "1.5px solid " + T.brd, borderInlineStartWidth: 4, borderInlineStartColor: FCOL[f.idx], borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontWeight: 800, color: T.text }}>{"خامة " + f.k + " — " + f.name}</span>
                <span style={sub}>{f.price ? f.price + " ج.م/" + f.unit : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: FS - 1 }}>
                <span style={sub}>استهلاك/راق: <b style={{ color: T.text }}>{f.cons}</b></span>
                <span style={sub}>قطع/راق: <b style={{ color: T.text }}>{f.ppl || "—"}</b></span>
                <span style={{ color: FCOL[f.idx], fontWeight: 800 }}>🧮 استهلاك القطعة: {f.per > 0 ? f.per + " " + f.unit : "—"}</span>
              </div>
              {f.colors.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {f.colors.map((c, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, background: T.bg, border: "1px solid " + T.brd, fontSize: FS - 2, fontWeight: 600 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c.colorHex || "#ccc", border: "1px solid " + T.brd }} />{c.color}</span>)}
              </div>}
              {f.pieces.length > 0 && <div style={{ ...sub, marginTop: 6 }}>القطع: {f.pieces.join("، ")}</div>}
            </div>)}
          </div>)}

          {/* الإكسسوار */}
          {tab === "acc" && (accs.length === 0 ? <Empty>مفيش إكسسوار</Empty> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {accs.map((a, i) => { const qpp = a.qtyPerPiece == null ? 1 : (Number(a.qtyPerPiece) || 0); const per = Math.round(qpp * (Number(a.price) || 0) * 100) / 100; return <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, background: T.bg }}>
              <span style={{ fontWeight: 700, color: T.text }}>{a.name}{qpp !== 1 ? <span style={{ color: T.textMut, fontWeight: 600, fontSize: FS - 2 }}>{" ×" + qpp + " @ " + a.price}</span> : ""}</span>
              <span style={{ fontWeight: 800, color: T.accent }}>{per} ج.م/قطعة</span>
            </div>; })}
          </div>)}

          {/* التفاصيل */}
          {tab === "details" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ padding: "6px 14px", borderRadius: 10, background: T.warn + "12", border: "1px solid " + T.warn + "33", color: T.warn, fontWeight: 700, fontSize: FS - 1 }}>🗑️ هالك القماش: {Number(model.wasteFabricPct) || 0}%</span>
              <span style={{ padding: "6px 14px", borderRadius: 10, background: T.warn + "12", border: "1px solid " + T.warn + "33", color: T.warn, fontWeight: 700, fontSize: FS - 1 }}>🗑️ هالك الإكسسوار: {Number(model.wasteAccPct) || 0}%</span>
            </div>
            {prodTxt ? <div><div style={{ fontWeight: 800, color: T.text, marginBottom: 6 }}>📋 تفاصيل التشغيل / تيك باك</div><div style={{ fontSize: FS, lineHeight: 1.9, border: "1px solid " + T.brd, borderRadius: 10, padding: "12px 14px", background: T.bg }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(model.prodDetails) }} /></div>
              : <Empty>مفيش تفاصيل تشغيل</Empty>}
          </div>}

          {/* الأوامر المرتبطة */}
          {tab === "orders" && (linked.length === 0 ? <Empty>مفيش أوامر مرتبطة بالموديل ده</Empty> : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 2 }}>{linked.length + " أمر تشغيل مرتبط بالموديل ده"}</div>
            {linked.map(o => { const qty = Number(o.cutQty) || sqty(o.colorsA) || 0; return <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.brd, background: T.bg }}>
              {o.image ? <img src={o.image} alt="" onClick={() => setZoom({ src: o.image, alt: o.poNumber || o.modelNo })} style={{ width: 40, height: 50, objectFit: "cover", borderRadius: 6, cursor: "zoom-in", flexShrink: 0, border: "1px solid " + T.brd }} /> : <div style={{ width: 40, height: 50, borderRadius: 6, background: T.cardSolid, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🧩</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: T.accent, fontFamily: "monospace" }}>{o.poNumber || o.modelNo || o.id}</div>
                <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>كمية القص: <b style={{ color: T.text }}>{qty}</b> · {o.date || ""}</div>
              </div>
              {o.status && <Badge t={o.status} cards={statusCards} />}
            </div>; })}
          </div>)}
        </div>
      </div>
      {zoom && <ImageLightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}

function Empty({ children }){
  return <div style={{ textAlign: "center", padding: 28, color: T.textMut, fontSize: FS - 1, background: T.bg, borderRadius: 12, border: "1px dashed " + T.brd }}>{children}</div>;
}

export default ModelDetailModal;
