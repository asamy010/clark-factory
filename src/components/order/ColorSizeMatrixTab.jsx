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

import { useMemo, useEffect, useState } from "react";
import { Btn, Card, Inp, Sel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS, FKEYS } from "../../constants/index.js";
import { getSizesFromSet } from "../../utils/format.js";
import { compressImage, dataUrlToBlob } from "../../utils/image.js";
import { showToast } from "../../utils/popups.js";
import { storage } from "../../firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { ImagePickButton } from "../DocumentImagePicker.jsx";

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
  /* الخامات اللي ليها ألوان — كل خامة لوحدها (مش مدمجة) */
  const fabricsWithColors = useMemo(() => {
    const out = [];
    FKEYS.forEach(k => {
      const arr = order["colors" + k];
      if(!Array.isArray(arr)) return;
      const objs = []; const seen = new Set();
      arr.forEach(c => {
        const nm = String((typeof c === "string" ? c : (c?.color || c?.n || c?.name || "")) || "").trim();
        if(!nm || seen.has(nm.toLowerCase())) return;
        seen.add(nm.toLowerCase());
        objs.push({ color: nm, colorHex: (typeof c === "object" ? (c.colorHex || "") : ""), qty: (typeof c === "object" ? (Number(c.qty) || 0) : 0) });
      });
      if(objs.length > 0) out.push({ key: k, colors: objs });
    });
    return out;
  }, [order]);

  /* مصدر الألوان (خامة واحدة) — نفس اللي الـ push بيستخدمه (color_source_fabric).
     مش بنجمع كل الخامات عشان الإجمالي يبقى صح ومطابق لشوبيفاي. */
  const [colorSource, setColorSource] = useState(order.shopify_meta?.color_source_fabric || (fabricsWithColors[0]?.key) || "A");
  /* لو المصدر الحالي مالوش ألوان، حوّل لأول خامة ليها ألوان */
  useEffect(() => {
    if(fabricsWithColors.length > 0 && !fabricsWithColors.some(f => f.key === colorSource)) setColorSource(fabricsWithColors[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricsWithColors.length]);
  /* خزّن المصدر في الأوردر عشان الـ push يقراه */
  useEffect(() => {
    if(!canEdit) return;
    if(!fabricsWithColors.some(f => f.key === colorSource)) return;
    if(order.shopify_meta?.color_source_fabric === colorSource) return;
    updOrder(sel, o => { if(!o.shopify_meta) o.shopify_meta = {}; o.shopify_meta.color_source_fabric = colorSource; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSource]);

  const colors = useMemo(() => (fabricsWithColors.find(f => f.key === colorSource)?.colors) || [], [fabricsWithColors, colorSource]);

  const sizeInfo = getSizesFromSet(order, data) || {};
  const sizesArr = Array.isArray(sizeInfo.sizes) ? sizeInfo.sizes : [];
  const uniqueSizes = useMemo(() => [...new Set(sizesArr)], [sizesArr.join("|")]);

  const stored = order.shopify_meta?.stock_matrix;
  const colorImages = order.shopify_meta?.color_images || {};

  /* ── lightbox عارض صور الألوان (سهم تنقّل + اسم اللون على الصورة) ── */
  const imaged = colors.filter(c => colorImages[c.color]?.url).map(c => ({ color: c.color, url: colorImages[c.color].url }));
  const [viewer, setViewer] = useState(null); /* index في imaged */
  const viewerColor = (viewer != null && imaged[viewer]) ? imaged[viewer] : null;
  const openViewer = (color) => { const idx = imaged.findIndex(x => x.color === color); if(idx >= 0) setViewer(idx); };
  const navViewer = (dir) => setViewer(v => (v == null || imaged.length === 0) ? v : (v + dir + imaged.length) % imaged.length);
  useEffect(() => {
    if(viewer == null) return;
    const h = (e) => { if(e.key === "Escape") setViewer(null); else if(e.key === "ArrowRight") navViewer(-1); else if(e.key === "ArrowLeft") navViewer(1); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, imaged.length]);

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

  /* حفظ التوزيع التلقائي لأي لون (من المصدر الحالي) لسه مش متخزّن — عشان الـ
     push يلاقي بيانات، ويشتغل صح كمان لو غيّرت مصدر الألوان. */
  useEffect(() => {
    if(!canEdit) return;
    if(colors.length === 0 || uniqueSizes.length === 0) return;
    const cur = order.shopify_meta?.stock_matrix || {};
    const missing = colors.filter(c => !cur[c.color] || typeof cur[c.color] !== "object");
    if(missing.length === 0) return;
    updOrder(sel, o => {
      if(!o.shopify_meta) o.shopify_meta = {};
      if(!o.shopify_meta.stock_matrix) o.shopify_meta.stock_matrix = {};
      missing.forEach(c => { o.shopify_meta.stock_matrix[c.color] = distribute(c.qty, sizesArr, uniqueSizes); });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSource, colors.length, uniqueSizes.length]);

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

  /* V21.22.21: ربط صورة لون من المستندات (URL جاهز — مفيش رفع جديد) */
  const setColorImageUrl = (color, url) => {
    if(!url) return;
    updOrder(sel, o => {
      if(!o.shopify_meta) o.shopify_meta = {};
      if(!o.shopify_meta.color_images) o.shopify_meta.color_images = {};
      o.shopify_meta.color_images[color] = { url, alt: color, source: "document" };
    });
    showToast("✓ تم ربط صورة " + color + " من المستندات");
  };

  /* V21.22.22: اختيار صور متعددة (من الكمبيوتر أو المستندات) وتوزيعها على
     الألوان اللي لسه مفيهاش صور — بالترتيب المعروض. */
  const colorsMissingImages = () => colors.filter(c => !(order.shopify_meta?.color_images?.[c.color]?.url)).map(c => c.color);
  const assignDocsToColors = (recs) => {
    const missing = colorsMissingImages();
    if(missing.length === 0){ showToast("⚠️ كل الألوان عندها صور بالفعل"); return; }
    const n = Math.min(recs.length, missing.length);
    updOrder(sel, o => {
      if(!o.shopify_meta) o.shopify_meta = {};
      if(!o.shopify_meta.color_images) o.shopify_meta.color_images = {};
      for(let i = 0; i < n; i++){ const url = recs[i].downloadURL || recs[i].url; if(url) o.shopify_meta.color_images[missing[i]] = { url, alt: missing[i], source: "document" }; }
    });
    showToast("✓ اتربطت " + n + " صورة على الألوان" + (recs.length > missing.length ? " (الزيادة اتجاهلت)" : ""));
  };
  const uploadOneColorImage = async (file) => {
    const dataUrl = await compressImage(file, 1200, 0.85);
    const blob = await dataUrlToBlob(dataUrl);
    if(!blob || blob.size === 0) throw new Error("صورة غير صالحة");
    const path = "shopify-products/" + (order.id || "anon") + "/colors/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    const r = storageRef(storage, path);
    await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(r);
  };
  const assignFilesToColors = async (files) => {
    const missing = colorsMissingImages();
    if(missing.length === 0){ showToast("⚠️ كل الألوان عندها صور بالفعل"); return; }
    const n = Math.min(files.length, missing.length);
    showToast("⏳ جاري رفع " + n + " صورة...");
    const urls = [];
    for(let i = 0; i < n; i++){ try { urls.push(await uploadOneColorImage(files[i])); } catch(_) { urls.push(null); } }
    updOrder(sel, o => {
      if(!o.shopify_meta) o.shopify_meta = {};
      if(!o.shopify_meta.color_images) o.shopify_meta.color_images = {};
      for(let i = 0; i < n; i++){ if(urls[i]) o.shopify_meta.color_images[missing[i]] = { url: urls[i], alt: missing[i], source: "manual" }; }
    });
    showToast("✓ اترفعت وارتبطت " + urls.filter(Boolean).length + " صورة");
  };

  const removeColorImage = (color) => {
    updOrder(sel, o => { if(o.shopify_meta?.color_images) delete o.shopify_meta.color_images[color]; });
    showToast("✓ اتحذفت صورة " + color);
  };

  if(fabricsWithColors.length === 0 || uniqueSizes.length === 0){
    return <Card title="🎨 لون / مقاس">
      <div style={{ padding: 28, textAlign: "center", color: T.textMut, lineHeight: 1.8 }}>
        {fabricsWithColors.length === 0 ? "⚠️ مفيش خامات بألوان — حدّد ألوان القماش في تاب «القماش والخامات» أولاً." : "⚠️ مفيش مقاسات — اختر مجموعة مقاسات (Size Set) للأوردر أولاً."}
      </div>
    </Card>;
  }

  const th = { padding: "10px 8px", fontSize: FS - 2, fontWeight: 800, color: T.textSec, textAlign: "center", borderBottom: "2px solid " + T.brd, whiteSpace: "nowrap" };
  const td = { padding: "6px 6px", borderBottom: "1px solid " + T.brd, textAlign: "center" };
  const grandTotal = colors.reduce((s, c) => s + uniqueSizes.reduce((ss, sz) => ss + (Number(effective[c.color]?.[sz]) || 0), 0), 0);

  return (
    <>
    <Card title={"🎨 لون / مقاس — ماتريكس الـ variants (" + colors.length + " لون × " + uniqueSizes.length + " مقاس)"}>
      {/* مصدر الألوان — خامة واحدة (نفس الـ push). مش بنجمع كل الخامات. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, background: "#EC489908", border: "1px solid #EC489925", marginBottom: 10 }}>
        <label style={{ fontSize: FS - 1, fontWeight: 800, color: "#EC4899", whiteSpace: "nowrap" }}>🎨 مصدر الألوان</label>
        <div style={{ minWidth: 220, flex: 1 }}>
          {canEdit ? (
            <Sel value={colorSource} onChange={setColorSource}>
              {fabricsWithColors.map(f => (
                <option key={f.key} value={f.key}>{"خامة " + f.key + " — " + f.colors.length + " لون: " + f.colors.slice(0, 3).map(c => c.color).join("، ") + (f.colors.length > 3 ? "…" : "")}</option>
              ))}
            </Sel>
          ) : <span style={{ fontWeight: 700, color: T.text }}>{"خامة " + colorSource}</span>}
        </div>
        <span style={{ fontSize: FS - 2, color: T.textMut }}>الألوان والإجمالي من الخامة دي بس</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: FS - 1, color: T.textSec }}>الكميات بتتوزّع تلقائياً وتقدر تعدّلها. بتترحّل لشوبيفاي كمخزون لكل variant، وصورة كل لون بتظهر لما العميل يختاره.</div>
        {canEdit && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ImagePickButton data={data} multiple imagesOnly onFiles={assignFilesToColors} onPickMany={assignDocsToColors}
            triggerStyle={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "35", fontWeight: 700, fontSize: FS - 2 }}
            title="اختر صور متعددة وتتوزّع على الألوان اللي مفيهاش صور">🗂️ صور متعددة</ImagePickButton>
          <Btn small onClick={redistribute} style={{ background: "#EC489912", color: "#EC4899", border: "1px solid #EC489935", fontWeight: 700 }}>🔄 إعادة توزيع تلقائي</Btn>
        </div>}
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
                        <img src={img.url} alt={c.color} onClick={() => openViewer(c.color)} title="اضغط لعرض الصورة كاملة" style={{ width: 46, height: 62, objectFit: "cover", borderRadius: 6, border: "1px solid " + T.brd, cursor: "pointer" }} />
                        {canEdit && <div style={{ display: "flex", gap: 4 }}>
                          <ImagePickButton data={data} onFile={f => uploadColorImage(c.color, f)} onPickUrl={url => setColorImageUrl(c.color, url)} triggerStyle={{ fontSize: FS - 3, color: T.accent, fontWeight: 700 }}>تغيير</ImagePickButton>
                          <span onClick={() => removeColorImage(c.color)} style={{ cursor: "pointer", fontSize: FS - 3, color: T.err, fontWeight: 700 }}>حذف</span>
                        </div>}
                      </div>
                    : (canEdit
                      ? <ImagePickButton data={data} onFile={f => uploadColorImage(c.color, f)} onPickUrl={url => setColorImageUrl(c.color, url)} triggerStyle={{ display: "inline-block", padding: "6px 8px", borderRadius: 8, background: "#EC489910", color: "#EC4899", border: "1px dashed #EC489950", fontSize: FS - 3, fontWeight: 700 }}>📷 صورة</ImagePickButton>
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

    {/* ── Lightbox: صورة اللون كاملة بالطول + أسهم تنقّل + اسم اللون على الصورة ── */}
    {viewerColor && (
      <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ position: "absolute", top: 14, insetInlineEnd: 18, display: "flex", gap: 14, alignItems: "center", zIndex: 3 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: FS }}>{(viewer + 1) + " / " + imaged.length}</span>
          <span onClick={() => setViewer(null)} style={{ cursor: "pointer", color: "#fff", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>✕</span>
        </div>
        {imaged.length > 1 && <div onClick={e => { e.stopPropagation(); navViewer(1); }} style={{ position: "absolute", insetInlineStart: 10, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 32, color: "#fff", background: "rgba(255,255,255,0.14)", borderRadius: "50%", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>‹</div>}
        {imaged.length > 1 && <div onClick={e => { e.stopPropagation(); navViewer(-1); }} style={{ position: "absolute", insetInlineEnd: 10, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 32, color: "#fff", background: "rgba(255,255,255,0.14)", borderRadius: "50%", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>›</div>}
        <div onClick={e => e.stopPropagation()} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", maxWidth: "94vw", maxHeight: "90vh" }}>
          <div style={{ position: "absolute", top: 12, insetInlineStart: "50%", transform: "translateX(-50%)", background: "#EC4899", color: "#fff", padding: "5px 18px", borderRadius: 20, fontWeight: 800, fontSize: FS + 1, zIndex: 2, boxShadow: "0 2px 10px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>🎨 {viewerColor.color}</div>
          <img src={viewerColor.url} alt={viewerColor.color} style={{ maxHeight: "90vh", maxWidth: "94vw", objectFit: "contain", borderRadius: 12, boxShadow: "0 10px 50px rgba(0,0,0,0.6)" }} />
        </div>
      </div>
    )}
    </>
  );
}
