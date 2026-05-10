/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ShopifyPushModal (V21.0 Phase 10)
   ───────────────────────────────────────────────────────────────────────
   A self-contained modal that lets the user:
   • Configure Shopify push details for a CLARK order/model
     (description, images, color source fabric, SKU pattern, vendor, tags)
   • Preview the variants matrix (Color × Size from selected fabric)
   • Push to Shopify with one click

   Triggered from anywhere with: <ShopifyPushModal order={order} onClose={...} />.
   Reads CLARK order schema (modelNo, modelDesc, garmentType, fabricA-H,
   sizes, sellPrice). Saves the config back to order.shopify_meta on push.

   Image upload: uses Firebase Storage (existing CLARK pattern).
   The URL is then sent to Shopify which fetches it.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useRef } from "react";
import { Btn, Card, Inp, Sel, LoadingBtn, Spinner } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { ask, tell, showToast } from "../utils/popups.js";
import { compressImage } from "../utils/image.js";
import { shopifyPushProductFromClark } from "../utils/shopify/shopifyClient.js";

/* Reuse CLARK's existing image upload to Firebase Storage */
import { storage } from "../firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const FABRIC_KEYS = ["A","B","C","D","E","F","G","H"];
const STATUS_OPTS = [
  { value: "active",   label: "🟢 Active (مرئي للعملاء)" },
  { value: "draft",    label: "📝 Draft (مخفي)" },
  { value: "archived", label: "📦 Archived" },
];

function extractColorsFromFabric(order, fabricKey){
  if(!order || !fabricKey) return [];
  const f = order["fabric" + fabricKey];
  if(!f) return [];
  const cols = Array.isArray(f.colors) ? f.colors : [];
  return cols
    .map(c => typeof c === "string" ? c : (c?.n || c?.name || ""))
    .map(c => String(c).trim())
    .filter(Boolean);
}

function buildPreviewSku(pattern, ctx){
  const safe = (s) => String(s || "").normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9؀-ۿ\-_]/g, "")
    .slice(0, 60);
  return String(pattern || "{modelNo}-{color}-{size}")
    .replace(/\{modelNo\}/g, safe(ctx.modelNo))
    .replace(/\{color\}/g, safe(ctx.color))
    .replace(/\{size\}/g, safe(ctx.size))
    .replace(/\{garment\}/g, safe(ctx.garment))
    .replace(/\{fabric\}/g, safe(ctx.fabric))
    .replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function ShopifyPushModal({ order, onClose, user, isMob }){
  const meta = order?.shopify_meta || {};

  /* Form state — initialized from order.shopify_meta or defaults */
  const [description, setDescription] = useState(meta.description || "");
  const [colorSource, setColorSource] = useState(meta.color_source_fabric || "A");
  const [skuPattern, setSkuPattern] = useState(meta.sku_pattern || "{modelNo}-{color}-{size}");
  const [vendor, setVendor] = useState(meta.vendor || "CLARK Store");
  const [productType, setProductType] = useState(meta.product_type || order?.garmentType || "");
  const [tags, setTags] = useState(meta.tags || "");
  const [status, setStatus] = useState(meta.status || "active");
  const [images, setImages] = useState(Array.isArray(meta.images) ? meta.images : []);
  const [busy, setBusy] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [pushResult, setPushResult] = useState(null);
  const fileInputRef = useRef(null);

  /* Detected fabric colors per source */
  const detectedColors = useMemo(() => extractColorsFromFabric(order, colorSource), [order, colorSource]);
  const sizes = useMemo(() => Array.isArray(order?.sizes) ? order.sizes : [], [order]);

  /* List of available fabrics (those that have at least 1 color) */
  const availableFabrics = useMemo(() => {
    return FABRIC_KEYS.map(k => ({
      key: k,
      colors: extractColorsFromFabric(order, k),
    })).filter(f => f.colors.length > 0);
  }, [order]);

  /* Compute the variants matrix for preview */
  const matrix = useMemo(() => {
    const colors = detectedColors;
    if(colors.length === 0 && sizes.length === 0){
      return { rows: [], total: 0, hasOptions: false };
    }
    const rows = [];
    if(colors.length > 0 && sizes.length > 0){
      for(const c of colors){
        for(const s of sizes){
          rows.push({
            color: c, size: s,
            sku: buildPreviewSku(skuPattern, {
              modelNo: order.modelNo, color: c, size: s, garment: order.garmentType, fabric: colorSource
            }),
          });
        }
      }
    } else if(sizes.length > 0){
      for(const s of sizes) rows.push({ color: "", size: s, sku: buildPreviewSku(skuPattern, { modelNo: order.modelNo, size: s, garment: order.garmentType, fabric: colorSource }) });
    } else if(colors.length > 0){
      for(const c of colors) rows.push({ color: c, size: "", sku: buildPreviewSku(skuPattern, { modelNo: order.modelNo, color: c, garment: order.garmentType, fabric: colorSource }) });
    }
    return { rows, total: rows.length, hasOptions: colors.length > 0 || sizes.length > 0 };
  }, [order, detectedColors, sizes, skuPattern, colorSource]);

  /* ── Image upload ── */
  const handleImageUpload = async (files) => {
    if(!files || files.length === 0) return;
    const list = Array.from(files);
    for(let i = 0; i < list.length; i++){
      const file = list[i];
      const idx = images.length + i;
      setUploadingIdx(idx);
      try {
        /* Compress image first (CLARK's existing utility) */
        const compressed = await compressImage(file, 1200, 0.85);
        /* Upload to Firebase Storage */
        const path = "shopify-products/" + order.id + "/" + Date.now() + "-" + i + "-" + (file.name || "img.jpg").replace(/[^a-zA-Z0-9.-]/g, "_");
        const ref = storageRef(storage, path);
        await uploadBytes(ref, compressed);
        const url = await getDownloadURL(ref);
        setImages(prev => [...prev, { url, alt: order.modelNo + " - " + (prev.length + 1), position: prev.length + 1 }]);
      } catch(e){
        showToast("⛔ فشل رفع الصورة: " + (e.message || ""));
      }
    }
    setUploadingIdx(null);
  };

  const removeImage = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const moveImage = (idx, dir) => {
    setImages(prev => {
      const next = prev.slice();
      const newIdx = idx + dir;
      if(newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((img, i) => ({ ...img, position: i + 1 }));
    });
  };

  /* ── Push handler ── */
  const handlePush = async () => {
    if(matrix.total === 0){
      showToast("⚠️ مفيش variants — تأكد من اختيار الـ fabric أو إضافة sizes");
      return;
    }
    const yes = await ask("🛍️ Push للـ Shopify",
      `هـ يتعمل ${meta.shopify_product_id ? "تحديث" : "إنشاء"} للـ product في Shopify بـ:\n\n` +
      `• ${matrix.total} variant (${detectedColors.length || "—"} ألوان × ${sizes.length || "—"} مقاسات)\n` +
      `• ${images.length} صورة\n` +
      `• Status: ${status}\n\n` +
      `تأكيد؟`);
    if(!yes) return;
    setBusy(true);
    try {
      const r = await shopifyPushProductFromClark({
        orderId: order.id,
        description,
        images,
        colorSourceFabric: colorSource,
        skuPattern,
        vendor,
        product_type: productType,
        tags,
        status,
      }, user);
      if(r?.ok){
        setPushResult(r);
        showToast(`✅ ${r.action === "created" ? "تم إنشاء" : "تم تحديث"} المنتج · ${r.variants_count} variant · ${r.images_uploaded} صورة جديدة`);
      } else {
        showToast("⛔ " + (r?.error || "فشل"));
      }
    } catch(e){
      showToast("⛔ " + e.message);
    } finally {
      setBusy(false);
    }
  };

  if(!order) return null;

  const labelStyle = { display: "block", fontSize: FS - 1, color: T.textSec, fontWeight: 700, marginBottom: 6 };

  return (
    <div className="pop-overlay" style={{
      position: "fixed", inset: 0, zIndex: 99998,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 12, direction: "rtl",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.cardSolid, borderRadius: 16,
        width: "100%", maxWidth: 900, maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          background: "linear-gradient(135deg, #96BF4815, #96BF4805)",
          borderBottom: "1px solid " + T.brd,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 8,
          position: "sticky", top: 0, zIndex: 5, backdropFilter: "blur(10px)",
        }}>
          <div>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>🛍️ Push Model → Shopify</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>
              {order.modelNo} {order.modelDesc && "— " + order.modelDesc}
              {meta.shopify_product_id && (
                <span style={{ marginInlineStart: 8, padding: "1px 8px", borderRadius: 6, background: T.ok + "15", color: T.ok, fontWeight: 700, fontSize: FS - 3 }}>
                  ✓ متزامن (سيتم التحديث)
                </span>
              )}
            </div>
          </div>
          <Btn small onClick={onClose}>✕ إغلاق</Btn>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Push result */}
          {pushResult && (
            <Card title="✅ نتيجة الـ Push">
              <div style={{ fontSize: FS - 1, lineHeight: 1.8, color: T.textSec }}>
                <div>الإجراء: <b style={{ color: T.ok }}>{pushResult.action === "created" ? "تم الإنشاء" : "تم التحديث"}</b></div>
                <div>Shopify Product ID: <code style={{ fontFamily: "monospace" }}>{pushResult.shopify_product_id}</code></div>
                <div>Variants: <b>{pushResult.variants_count}</b></div>
                <div>صور جديدة: <b>{pushResult.images_uploaded}</b></div>
                {pushResult.shopify_admin_url && (
                  <div style={{ marginTop: 8 }}>
                    <a href={pushResult.shopify_admin_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: "underline" }}>
                      ↗ افتح في Shopify Admin
                    </a>
                  </div>
                )}
                {pushResult.errors && pushResult.errors.length > 0 && (
                  <div style={{ marginTop: 8, padding: 8, background: T.warn + "15", borderRadius: 6, color: T.warn }}>
                    ⚠️ {pushResult.errors.length} تحذير: {pushResult.errors.map(e => e.stage + (e.error ? " (" + e.error + ")" : "")).join(", ")}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Basic info */}
          <Card title="📝 المعلومات الأساسية">
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Vendor</label>
                <Inp value={vendor} onChange={setVendor} placeholder="CLARK Store" />
              </div>
              <div>
                <label style={labelStyle}>Product Type</label>
                <Inp value={productType} onChange={setProductType} placeholder="Jacket" />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <Sel value={status} onChange={setStatus}>
                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Sel>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Tags (مفصولين بفاصلة)</label>
              <Inp value={tags} onChange={setTags} placeholder="winter, pro, new-arrival" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>الوصف (description) — markdown مدعوم</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="شيك ودافي · مناسب للشتاء · **مميزات الموديل:**&#10;- خامة 100% قطن&#10;- بطانة دافية"
                rows={6}
                style={{
                  width: "100%", padding: 10, borderRadius: 8, border: "1px solid " + T.brd,
                  fontFamily: "'Cairo', sans-serif", fontSize: FS - 1, lineHeight: 1.7,
                  background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical",
                }}
              />
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                💡 <code>**bold**</code>، <code>*italic*</code>، <code>- list item</code>
              </div>
            </div>
          </Card>

          {/* Variants config */}
          <Card title="🎨 الـ Variants Matrix">
            {availableFabrics.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: T.warn, background: T.warn + "10", borderRadius: 8 }}>
                ⚠️ مفيش خامات بـ ألوان في الموديل ده. ارجع للـ OrdForm وضيف لون لخامة A على الأقل.
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 2fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>الـ Color Source (مصدر الألوان للـ variants)</label>
                    <Sel value={colorSource} onChange={setColorSource}>
                      {availableFabrics.map(f => (
                        <option key={f.key} value={f.key}>
                          خامة {f.key} — {f.colors.length} لون: {f.colors.slice(0, 3).join("، ")}{f.colors.length > 3 ? "…" : ""}
                        </option>
                      ))}
                    </Sel>
                  </div>
                  <div>
                    <label style={labelStyle}>SKU Pattern</label>
                    <Inp value={skuPattern} onChange={setSkuPattern} placeholder="{modelNo}-{color}-{size}" />
                    <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                      Placeholders: <code>{"{modelNo}"}</code>، <code>{"{color}"}</code>، <code>{"{size}"}</code>، <code>{"{garment}"}</code>، <code>{"{fabric}"}</code>
                    </div>
                  </div>
                </div>

                {/* Matrix preview */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>
                    📐 Matrix Preview ({matrix.total} variant)
                  </div>
                  {matrix.total === 0 ? (
                    <div style={{ padding: 12, color: T.warn, background: T.warn + "10", borderRadius: 6 }}>
                      ⚠️ مفيش variants — اختار خامة بـ ألوان أو ضيف sizes للموديل
                    </div>
                  ) : detectedColors.length > 0 && sizes.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 2 }}>
                        <thead>
                          <tr style={{ background: T.bg }}>
                            <th style={{ padding: 8, border: "1px solid " + T.brd, textAlign: "right" }}>Color \\ Size</th>
                            {sizes.map(s => (
                              <th key={s} style={{ padding: 8, border: "1px solid " + T.brd }}>{s}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detectedColors.map(c => (
                            <tr key={c}>
                              <td style={{ padding: 8, border: "1px solid " + T.brd, fontWeight: 700, background: T.bg }}>{c}</td>
                              {sizes.map(s => (
                                <td key={s} style={{ padding: 8, border: "1px solid " + T.brd, textAlign: "center", fontSize: FS - 3, fontFamily: "monospace", color: T.textMut }}>
                                  {buildPreviewSku(skuPattern, { modelNo: order.modelNo, color: c, size: s, garment: order.garmentType, fabric: colorSource })}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {matrix.rows.slice(0, 20).map((r, i) => (
                        <div key={i} style={{ padding: "6px 10px", background: T.bg, borderRadius: 6, fontSize: FS - 2, fontFamily: "monospace" }}>
                          {r.color || r.size} → <span style={{ color: T.textMut }}>{r.sku}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Images */}
          <Card title={"🖼 الصور (" + images.length + ")"}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={e => handleImageUpload(e.target.files)}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <Btn small onClick={() => fileInputRef.current?.click()} disabled={uploadingIdx != null}>
                {uploadingIdx != null ? "⏳ جاري الرفع..." : "➕ ارفع صور (multiple)"}
              </Btn>
              <span style={{ fontSize: FS - 3, color: T.textMut }}>
                ينضغطوا تلقائياً (1200px) ويرفعوا على Firebase Storage. الـ URL بـ يـ pass لـ Shopify.
              </span>
            </div>

            {images.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: T.textMut, border: "2px dashed " + T.brd, borderRadius: 10 }}>
                <div style={{ fontSize: 32, marginBottom: 6, opacity: 0.5 }}>📷</div>
                <div>اضغط "ارفع صور" لاختيار صور المنتج</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {images.map((img, i) => (
                  <div key={i} style={{
                    position: "relative",
                    width: isMob ? 90 : 110,
                    height: isMob ? 120 : 147, /* 3:4 portrait */
                    borderRadius: 8,
                    border: "1px solid " + T.brd,
                    overflow: "hidden",
                    background: T.bg,
                  }}>
                    <img
                      src={img.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
                      loading="lazy"
                    />
                    {i === 0 && (
                      <div style={{ position: "absolute", top: 4, insetInlineStart: 4, fontSize: FS - 4, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: T.accent, color: "#fff" }}>
                        رئيسية
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, background: "rgba(0,0,0,0.6)", padding: 4, display: "flex", gap: 2, justifyContent: "space-around" }}>
                      <button onClick={() => moveImage(i, -1)} disabled={i === 0} style={btnStyle}>◀</button>
                      <button onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} style={btnStyle}>▶</button>
                      <button onClick={() => removeImage(i)} style={{ ...btnStyle, color: "#FCA5A5" }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Push button */}
          <div style={{
            position: "sticky", bottom: 0, padding: 12,
            background: T.cardSolid, borderTop: "1px solid " + T.brd,
            display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
          }}>
            <Btn small onClick={onClose}>إلغاء</Btn>
            <LoadingBtn primary loading={busy} loadingText="جاري الـ Push..."
              onClick={handlePush}
              disabled={matrix.total === 0}
              style={{ minHeight: 38, fontWeight: 800 }}
            >
              {meta.shopify_product_id ? "🔄 تحديث في Shopify" : "🛍️ Push للـ Shopify"}
            </LoadingBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: "transparent",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  padding: "2px 6px",
};
