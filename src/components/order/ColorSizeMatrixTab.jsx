/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ColorSizeMatrixTab (V21.14.0) — تاب «لون / مقاس»
   ───────────────────────────────────────────────────────────────────────
   ماتريكس: صفوف = الألوان (من order.colorsA..H) · أعمدة = المقاسات (من السيت)
   · خلية = كمية الـ variant (توزيع تلقائي من كمية اللون، قابلة للتعديل) ·
   آخر كل صف = صورة اللون.

   التخزين (نفس الحقول اللي الـ push بيقراها تلقائياً — صفر تعديل في endpoint):
     • order.shopify_meta.stock_matrix = { [color]: { [size]: qty } }
     • order.shopify_meta.color_images = { [color]: { url, alt, source } }
   عند الـ push: buildVariantMatrix بيقرا الألوان من الأوردر، والـ endpoint بياخد
   stock_matrix للمخزون و color_images لصور الـ variants. (CLAUDE.md §4/§5)
   ═══════════════════════════════════════════════════════════════════════ */

import { useMemo, useEffect, useRef } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS, FKEYS } from "../../constants/index.js";
import { getSizesFromSet } from "../../utils/format.js";
import { compressImage, dataUrlToBlob } from "../../utils/image.js";
import { showToast } from "../../utils/popups.js";
import { storage } from "../../firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/* وزّع إجمالي اللون على المقاسات حسب تكرارها في السيت (نِسَب) + largest-remainder */
function distribute(total, sizesArr, uniqueSizes){
  const res = {}; uniqueSizes.forEach(s => res[s] = 0);
  total = Math.max(0, Math.floor(Number(total) || 0));
  if(uniqueSizes.length === 0 || total <= 0) return res;
  const w = {}; sizesArr.forEach(s => w[s] = (w[s] || 0) + 1);
  const tw = sizesArr.length || uniqueSizes.length;
  let assigned = 0;
  uniqueSizes.forEach(s => { const q = Math.floor(total * (w[s] || 1) / tw); res[s] = q; assigned += q; });
  let rem = total - assigned, i = 0;
  while(rem > 0){ res[uniqueSizes[i % uniqueSizes.length]] += 1; rem--; i++; }
  return res;
}

export function ColorSizeMatrixTab({ order, data, sel, updOrder, canEdit, isMob }){
  const autoPersistRef = useRef(false);

  /* الألوان — مجمّعة من كل الأقمشة، مدمجة بالاسم */
  const colors = useMemo(() => {
    const map = new Map();
    FKEYS.forEach(k => {
      const arr = order["colors" + k];
      if(!Array.isArray(arr)) return;
      arr.forEach(c => {
        const nm = String((typeof c === "string" ? c : (c?.color || c?.n || c?.name || "")) || "").trim();
        if(!nm) return;
        const qty = typeof c === "object" ? (Number(c.qty) || 0) : 0;
        const hex = typeof c === "object" ? (c.colorHex || "") : "";
        if(map.has(nm)){ const e = map.get(nm); e.qty += qty; if(!e.colorHex && hex) e.colorHex = hex; }
        else map.set(nm, { color: nm, colorHex: hex, qty });
      });
    });
    return [...map.values()];
  }, [order]);

  const sizeInfo = getSizesFromSet(order, data) || {};
  const sizesArr = Array.isArray(sizeInfo.sizes) ? sizeInfo.sizes : [];
  const uniqueSizes = useMemo(() => [...new Set(sizesArr)], [sizesArr.join("|")]);

  const stored = order.shopify_meta?.stock_matrix;
  const colorImages = order.shopify_meta?.color_images || {};

  /* الماتريكس الفعّالة: التوزيع التلقائي كأساس + قيم المستخدم المخزّنة فوقه */
  const effective = useMemo(() => {
    const m = {};
    colors.forEach(c => {
      const auto = distribute(c.qty, sizesArr, uniqueSizes);
      const s = stored && stored[c.color];
      m[c.color] = (s && typeof s === "object") ? { ...auto, ...s } : auto;
    });
    return m;
  }, [colors, stored, uniqueSizes.join("|"), sizesArr.join("|")]);

  /* حفظ التوزيع التلقائي مرة واحدة لو الماتريكس فاضية (عشان الـ push يلاقي بيانات) */
  useEffect(() => {
    if(!canEdit || autoPersistRef.current) return;
    if(stored && Object.keys(stored).length > 0) return;
    if(colors.length === 0 || uniqueSizes.length === 0) return;
    autoPersistRef.current = true;
    const m = {};
    colors.forEach(c => { m[c.color] = distribute(c.qty, sizesArr, uniqueSizes); });
    updOrder(sel, o => { if(!o.shopify_meta) o.shopify_meta = {}; o.shopify_meta.stock_matrix = m; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors.length, uniqueSizes.length]);

  const setCell = (color, size, val) => {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    updOrder(sel, o => {
      if(!o.shopify_meta) o.shopify_meta = {};
      if(!o.shopify_meta.stock_matrix) o.shopify_meta.stock_matrix = {};
      if(!o.shopify_meta.stock_matrix[color] || typeof o.shopify_meta.stock_matrix[color] !== "object") o.shopify_meta.stock_matrix[color] = { ...effective[color] };
      o.shopify_meta.stock_matrix[color][size] = n;
    });
  };

  const redistribute = () => {
    updOrder(sel, o => {
      if(!o.shopify_meta) o.shopify_meta = {};
      const m = {}; colors.forEach(c => { m[c.color] = distribute(c.qty, sizesArr, uniqueSizes); });
      o.shopify_meta.stock_matrix = m;
    });
    showToast("✓ تمت إعادة التوزيع التلقائي");
  };

  const uploadColorImage = async (color, file) => {
    if(!file) return;
    try {
      showToast("⏳ جاري رفع صورة " + color + "...");
      const dataUrl = await compressImage(file, 1200, 0.85);
      const blob = await dataUrlToBlob(dataUrl);
      if(!blob || blob.size === 0) throw new Error("الصورة غير صالحة");
      const path = "shopify-products/" + (order.id || "anon") + "/colors/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
      const r = storageRef(storage, path);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(r);
      updOrder(sel, o => {
        if(!o.shopify_meta) o.shopify_meta = {};
        if(!o.shopify_meta.color_images) o.shopify_meta.color_images = {};
        o.shopify_meta.color_images[color] = { url, alt: color, source: "manual" };
      });
      showToast("✓ اترفعت صورة " + color);
    } catch(e){ showToast("⛔ فشل رفع الصورة: " + (e?.message || e)); }
  };

  const removeColorImage = (color) => {
    updOrder(sel, o => { if(o.shopify_meta?.color_images) delete o.shopify_meta.color_images[color]; });
    showToast("✓ اتحذفت صورة " + color);
  };

  if(colors.length === 0 || uniqueSizes.length === 0){
    return <Card title="🎨 لون / مقاس">
      <div style={{ padding: 28, textAlign: "center", color: T.textMut, lineHeight: 1.8 }}>
        {colors.length === 0 ? "⚠️ مفيش ألوان — حدّد ألوان القماش في تاب «القماش والخامات» أولاً." : "⚠️ مفيش مقاسات — اختر مجموعة مقاسات (Size Set) للأوردر أولاً."}
      </div>
    </Card>;
  }

  const th = { padding: "10px 8px", fontSize: FS - 2, fontWeight: 800, color: T.textSec, textAlign: "center", borderBottom: "2px solid " + T.brd, whiteSpace: "nowrap" };
  const td = { padding: "6px 6px", borderBottom: "1px solid " + T.brd, textAlign: "center" };
  const grandTotal = colors.reduce((s, c) => s + uniqueSizes.reduce((ss, sz) => ss + (Number(effective[c.color]?.[sz]) || 0), 0), 0);

  return (
    <Card title={"🎨 لون / مقاس — ماتريكس الـ variants (" + colors.length + " لون × " + uniqueSizes.length + " مقاس)"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>الكميات بتتوزّع تلقائياً وتقدر تعدّلها. بتترحّل لشوبيفاي كمخزون لكل variant، وصورة كل لون بتظهر لما العميل يختاره.</div>
        {canEdit && <Btn small onClick={redistribute} style={{ background: "#EC489912", color: "#EC4899", border: "1px solid #EC489935", fontWeight: 700 }}>🔄 إعادة توزيع تلقائي</Btn>}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "right", minWidth: 110 }}>اللون</th>
            {uniqueSizes.map(s => <th key={s} style={th}>{s}</th>)}
            <th style={{ ...th, color: T.accent }}>الإجمالي</th>
            <th style={{ ...th, minWidth: 96 }}>الصورة</th>
          </tr></thead>
          <tbody>
            {colors.map(c => {
              const row = effective[c.color] || {};
              const rowTotal = uniqueSizes.reduce((s, sz) => s + (Number(row[sz]) || 0), 0);
              const img = colorImages[c.color];
              return <tr key={c.color}>
                <td style={{ ...td, textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: c.colorHex || "#ccc", border: "1px solid " + T.brd, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: T.text, fontSize: FS - 1 }}>{c.color}</span>
                  </div>
                </td>
                {uniqueSizes.map(s => <td key={s} style={td}>
                  {canEdit
                    ? <input type="number" min="0" value={row[s] ?? 0} onChange={e => setCell(c.color, s, e.target.value)} style={{ width: 52, padding: "5px 4px", textAlign: "center", border: "1px solid " + T.brd, borderRadius: 6, fontSize: FS - 1, fontFamily: "inherit", background: T.inputBg || "#fff", color: T.text }} />
                    : <span style={{ fontWeight: 700 }}>{row[s] ?? 0}</span>}
                </td>)}
                <td style={{ ...td, fontWeight: 800, color: T.accent }}>{rowTotal}</td>
                <td style={td}>
                  {img?.url
                    ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <img src={img.url} alt={c.color} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid " + T.brd }} />
                        {canEdit && <div style={{ display: "flex", gap: 4 }}>
                          <label style={{ cursor: "pointer", fontSize: FS - 3, color: T.accent, fontWeight: 700 }}>تغيير<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { uploadColorImage(c.color, e.target.files?.[0]); e.target.value = ""; }} /></label>
                          <span onClick={() => removeColorImage(c.color)} style={{ cursor: "pointer", fontSize: FS - 3, color: T.err, fontWeight: 700 }}>حذف</span>
                        </div>}
                      </div>
                    : (canEdit
                      ? <label style={{ cursor: "pointer", display: "inline-block", padding: "6px 8px", borderRadius: 8, background: "#EC489910", color: "#EC4899", border: "1px dashed #EC489950", fontSize: FS - 3, fontWeight: 700 }}>📷 صورة<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { uploadColorImage(c.color, e.target.files?.[0]); e.target.value = ""; }} /></label>
                      : <span style={{ color: T.textMut, fontSize: FS - 3 }}>—</span>)}
                </td>
              </tr>;
            })}
            <tr style={{ background: T.accentBg }}>
              <td style={{ ...td, fontWeight: 800, color: T.accent, textAlign: "right" }}>الإجمالي</td>
              <td colSpan={uniqueSizes.length} />
              <td style={{ ...td, fontWeight: 900, color: T.accent, fontSize: FS + 2 }}>{grandTotal}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
