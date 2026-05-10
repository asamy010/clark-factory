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
import { compressImage, dataUrlToBlob } from "../utils/image.js";
import { shopifyPushProductFromClark, shopifyVerifyProductPushed } from "../utils/shopify/shopifyClient.js";
/* V21.9.3 fix: resolve sizes from data.sizeSets via order.sizeSetId */
import { getSizesFromSet } from "../utils/format.js";

/* Reuse CLARK's existing image upload to Firebase Storage */
import { storage } from "../firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const FABRIC_KEYS = ["A","B","C","D","E","F","G","H"];
const STATUS_OPTS = [
  { value: "active",   label: "🟢 Active (مرئي للعملاء)" },
  { value: "draft",    label: "📝 Draft (مخفي)" },
  { value: "archived", label: "📦 Archived" },
];

/* CLARK schema (V21.8 Phase 11a fix):
   Colors are stored in a SEPARATE top-level field `colors`+letter (e.g. colorsA,
   colorsB, ...), NOT inside `fabricA`. Each entry is { color, colorHex, layers,
   pcsPerLayer, qty }. The color NAME is `.color`, not `.n`. */
function extractColorsFromFabric(order, fabricKey){
  if(!order || !fabricKey) return [];
  const key = String(fabricKey).toUpperCase();
  const cols = Array.isArray(order["colors" + key]) ? order["colors" + key] : [];
  const out = [];
  const seen = new Set();
  for(const c of cols){
    let name = "";
    if(typeof c === "string") name = c;
    else if(c && typeof c === "object") name = c.color || c.n || c.name || "";
    name = String(name || "").trim();
    if(!name) continue;
    const k = name.toLowerCase();
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
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

export function ShopifyPushModal({ order, data, onClose, user, isMob }){
  const meta = order?.shopify_meta || {};

  /* V21.9.5: build a sensible default title from modelNo + modelDesc */
  const defaultTitle = (order?.modelNo ? order.modelNo : "")
    + (order?.modelDesc ? (order?.modelNo ? " — " : "") + order.modelDesc : "");

  /* Form state — initialized from order.shopify_meta or defaults */
  const [title, setTitle] = useState(meta.title || defaultTitle);
  const [description, setDescription] = useState(meta.description || "");
  const [colorSource, setColorSource] = useState(meta.color_source_fabric || "A");
  const [skuPattern, setSkuPattern] = useState(meta.sku_pattern || "{modelNo}-{color}-{size}");
  const [vendor, setVendor] = useState(meta.vendor || "CLARK Store");
  const [productType, setProductType] = useState(meta.product_type || order?.garmentType || "");
  const [tags, setTags] = useState(meta.tags || "");
  const [status, setStatus] = useState(meta.status || "active");
  /* V21.9.5: seed product images with the order's main image (from CLARK
     OrdForm) by default, so the user doesn't have to re-upload it. */
  const [images, setImages] = useState(() => {
    const arr = Array.isArray(meta.images) ? meta.images : [];
    if(arr.length > 0) return arr;
    if(order?.image){
      return [{
        url: order.image,
        alt: defaultTitle || order?.modelNo || "",
        position: 1,
        source: "clark_order_image",
      }];
    }
    return [];
  });
  /* V21.9.5: per-color image map. Shape: { [colorName]: { url, alt, source } }
     When pushing, the matrix builder picks the right color image for each
     variant. Falls back to the global `images` list if no per-color image. */
  const [colorImages, setColorImages] = useState(() => meta.color_images || {});
  /* V21.9.11: per-color price map. Shape: { [colorName]: number }
     Sent to the server which uses it in buildVariantMatrix when computing
     variant.price. If unset for a color, falls back to order.sellPrice
     (existing behavior). Lets the user charge a different price per color
     (e.g. premium colors cost more). */
  const [colorPrices, setColorPrices] = useState(() => {
    const fromMeta = meta.color_prices && typeof meta.color_prices === "object" ? meta.color_prices : {};
    return { ...fromMeta };
  });
  const [busy, setBusy] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [uploadingColorKey, setUploadingColorKey] = useState(null);
  const [pushResult, setPushResult] = useState(null);
  const fileInputRef = useRef(null);
  const colorFileInputRef = useRef(null);
  const [pickingColorForUpload, setPickingColorForUpload] = useState(null); /* color name or null */
  /* V21.9.13: bidirectional verify state. When the modal mounts on an order
     that's marked as pushed, we ping Shopify to confirm the product still
     exists. If 404, the verify endpoint clears shopify_meta — the next
     onSnapshot refresh propagates the clear to the order card. */
  const [verifyState, setVerifyState] = useState(null); /* null | "checking" | "exists" | "deleted" */

  /* V21.9.13: Bidirectional verify on mount.
     If this order was pushed previously, ping Shopify to confirm the product
     still exists. The verify endpoint clears shopify_meta server-side on 404
     so the order card unmarks itself automatically. We don't block the modal
     on this — the form is usable in parallel; we just surface the result as
     a banner so the user knows the badge state is fresh. */
  useEffect(() => {
    let cancelled = false;
    const shopifyId = meta?.shopify_product_id;
    if(!shopifyId || meta?.push_status === "deleted_on_shopify") return;
    if(!user) return;
    setVerifyState("checking");
    (async () => {
      try {
        const r = await shopifyVerifyProductPushed(order.id, user);
        if(cancelled) return;
        if(r?.ok && r.exists) setVerifyState("exists");
        else if(r?.ok && r.cleared) setVerifyState("deleted");
        else setVerifyState(null);
      } catch(_) {
        /* Transient failure — don't change state, leave as "checking" briefly
           then null. Don't surface a popup; the user can still push. */
        if(!cancelled) setVerifyState(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, meta?.shopify_product_id]);

  /* Detected fabric colors per source */
  const detectedColors = useMemo(() => extractColorsFromFabric(order, colorSource), [order, colorSource]);
  /* V21.9.3 fix: CLARK orders don't have an `order.sizes` array directly.
     Sizes are derived from `order.sizeSetId` which references `data.sizeSets[i]`.
     getSizesFromSet handles label parsing + pcsPerSeries reconciliation. */
  const sizes = useMemo(() => {
    if(!data || !order) return [];
    const r = getSizesFromSet(order, data);
    return Array.isArray(r?.sizes) ? r.sizes : [];
  }, [order, data]);

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

  /* ── Image upload ──
     V21.9.11 ROOT-CAUSE FIX:
     Pre-V21.9.11 we did `new Blob([compressed])` where `compressed` was the
     dataURL STRING returned by compressImage(). That wraps the literal
     text "data:image/jpeg;base64,..." as the file body — Firebase accepted
     the upload but the stored bytes were TEXT, not JPEG. Result: every
     <img> showed "فشل تحميل" and Shopify's image-by-URL fetch got garbage.
     Fix: use dataUrlToBlob() helper that properly converts dataURL → Blob
     via fetch(dataUrl).blob(). The Blob now has real JPEG bytes + correct
     content-type. */
  const sanitizeFileName = (n) => String(n || "img.jpg").replace(/[^a-zA-Z0-9.-]/g, "_");

  const uploadOne = async (file, pathPrefix) => {
    const dataUrl = await compressImage(file, 1200, 0.85);
    const blob = await dataUrlToBlob(dataUrl);
    if(!blob || blob.size === 0){
      throw new Error("الـ compression أرجع Blob فاضي — راجع الصورة");
    }
    /* Force a .jpg extension since compressImage outputs JPEG regardless of input */
    const baseName = sanitizeFileName(file.name).replace(/\.[a-zA-Z0-9]+$/, "");
    const fname = (baseName || "img") + ".jpg";
    const path = pathPrefix + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + fname;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(ref);
  };

  const handleImageUpload = async (files) => {
    if(!files || files.length === 0) return;
    const list = Array.from(files);
    for(let i = 0; i < list.length; i++){
      const file = list[i];
      const idx = images.length + i;
      setUploadingIdx(idx);
      try {
        const url = await uploadOne(file, "shopify-products/" + (order.id || "anon"));
        setImages(prev => [...prev, {
          url,
          alt: title || order.modelNo + " - " + (prev.length + 1),
          position: prev.length + 1,
          source: "user_upload",
        }]);
      } catch(e){
        showToast("⛔ فشل رفع الصورة: " + (e.message || ""));
        console.error("[ShopifyPushModal] upload failed:", e);
      }
    }
    setUploadingIdx(null);
  };

  /* V21.9.5: per-color image upload.
     User picks a color from the matrix → picks file → uploads → saved in
     colorImages[colorName]. The color image is also added to the global
     images list (pushed to Shopify) AND tagged with the color name. */
  const handleColorImageUpload = async (colorName, files) => {
    if(!colorName || !files || files.length === 0) return;
    const file = files[0];
    setUploadingColorKey(colorName);
    try {
      const url = await uploadOne(file, "shopify-products/" + (order.id || "anon") + "/colors");
      const entry = {
        url,
        alt: (title || order.modelNo) + " - " + colorName,
        color: colorName,
        source: "color_image",
      };
      setColorImages(prev => ({ ...prev, [colorName]: entry }));
      /* Also append to images list so it gets pushed to Shopify.
         Replace existing color image for this color if present. */
      setImages(prev => {
        const filtered = prev.filter(im => im.color !== colorName);
        return [...filtered, { ...entry, position: filtered.length + 1 }];
      });
    } catch(e){
      showToast("⛔ فشل رفع صورة اللون: " + (e.message || ""));
      console.error("[ShopifyPushModal] color image upload failed:", e);
    } finally {
      setUploadingColorKey(null);
      setPickingColorForUpload(null);
    }
  };

  const removeImage = (idx) => {
    setImages(prev => {
      const removed = prev[idx];
      const next = prev.filter((_, i) => i !== idx).map((img, i) => ({ ...img, position: i + 1 }));
      /* If removing a color image, also clear it from colorImages */
      if(removed?.color){
        setColorImages(c => {
          const n = { ...c };
          delete n[removed.color];
          return n;
        });
      }
      return next;
    });
  };

  const removeColorImage = (colorName) => {
    setColorImages(prev => {
      const n = { ...prev };
      delete n[colorName];
      return n;
    });
    setImages(prev => prev.filter(im => im.color !== colorName).map((img, i) => ({ ...img, position: i + 1 })));
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
        title, /* V21.9.5: explicit title override */
        description,
        images,
        colorImages, /* V21.9.5: per-color image map */
        colorPrices, /* V21.9.11: per-color price overrides */
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

          {/* V21.9.13: bidirectional verify banner */}
          {verifyState === "checking" && meta?.shopify_product_id && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: T.accent + "10", border: "1px solid " + T.accent + "30",
              color: T.accent, fontSize: FS - 1, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Spinner size={14} />
              <span>جاري التحقق من حالة المنتج على Shopify...</span>
            </div>
          )}
          {verifyState === "deleted" && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: T.warn + "12", border: "1px solid " + T.warn + "40",
              color: T.warn, fontSize: FS - 1, fontWeight: 700, lineHeight: 1.6,
            }}>
              ⚠️ المنتج اتـ delete من Shopify. تم إلغاء حالة "Pushed" — لو محتاج تـ resync اضغط Push تاني.
            </div>
          )}

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
            {/* V21.9.5: Title + Model number + auto-SKU info */}
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>📌 اسم المنتج (Title) في Shopify</label>
                <Inp value={title} onChange={setTitle} placeholder={defaultTitle} />
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  افتراضياً: رقم الموديل + الوصف من CLARK
                </div>
              </div>
              <div>
                <label style={labelStyle}>🏷 رقم الموديل (CLARK)</label>
                <div style={{
                  padding: "8px 12px", background: T.bg, border: "1px solid " + T.brd,
                  borderRadius: 8, fontFamily: "monospace", fontSize: FS, fontWeight: 800,
                  color: T.accent, letterSpacing: 1,
                }}>
                  {order.modelNo || "—"}
                </div>
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>
                  بـ يدخل تلقائياً في الـ SKU pattern
                </div>
              </div>
            </div>
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
          {/* V21.9.5: Per-color image upload — one image per color
             V21.9.11: + per-color price input (sent to Shopify per variant) */}
          {detectedColors.length > 0 && (
            <Card title={"🎨 صورة + سعر لكل لون (" + Object.keys(colorImages).length + "/" + detectedColors.length + ")"}>
              <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 12, lineHeight: 1.7 }}>
                ℹ️ ارفع صورة منفصلة لكل لون من خامة {colorSource} + حدّد سعر مخصص (اختياري).
                <br/>
                💰 لو سيبت السعر فاضي، هيستخدم سعر البيع الافتراضي للموديل: <b>{Number(order?.sellPrice || 0).toFixed(2)} ج.م</b>
              </div>
              <input
                ref={colorFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={e => {
                  if(pickingColorForUpload && e.target.files){
                    handleColorImageUpload(pickingColorForUpload, e.target.files);
                  }
                  e.target.value = ""; /* allow re-uploading same file */
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {detectedColors.map(colorName => {
                  const ci = colorImages[colorName];
                  const isUploading = uploadingColorKey === colorName;
                  const cp = colorPrices[colorName];
                  const priceVal = (cp === "" || cp == null) ? "" : String(cp);
                  return (
                    <div key={colorName} style={{
                      width: isMob ? 110 : 145,
                      borderRadius: 10,
                      border: "1.5px solid " + (ci ? T.ok : T.brd),
                      background: ci ? T.ok + "08" : T.bg,
                      padding: 6,
                      display: "flex", flexDirection: "column", gap: 6, alignItems: "center",
                    }}>
                      {/* Color label */}
                      <div style={{
                        fontSize: FS - 2, fontWeight: 800, color: T.text,
                        textAlign: "center", lineHeight: 1.3,
                      }}>
                        {colorName}
                      </div>
                      {/* Image preview slot */}
                      <div style={{
                        width: "100%",
                        aspectRatio: "3 / 4",
                        borderRadius: 6,
                        border: "1px dashed " + T.brd,
                        background: T.bg,
                        position: "relative",
                        overflow: "hidden",
                      }}>
                        {isUploading ? (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 3, color: T.textMut }}>
                            ⏳ جاري الرفع...
                          </div>
                        ) : ci ? (
                          <img
                            src={ci.url}
                            alt={colorName}
                            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.opacity = "0.3"; }}
                          />
                        ) : (
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.textMut, fontSize: 20, opacity: 0.5 }}>
                            📷
                          </div>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 4, width: "100%" }}>
                        <Btn small onClick={() => {
                          setPickingColorForUpload(colorName);
                          colorFileInputRef.current?.click();
                        }} disabled={isUploading} style={{ flex: 1, fontSize: FS - 3, padding: "4px 6px" }}>
                          {ci ? "🔄 تغيير" : "➕ اختر"}
                        </Btn>
                        {ci && (
                          <Btn small ghost danger onClick={() => removeColorImage(colorName)} style={{ fontSize: FS - 3, padding: "4px 6px" }}>
                            🗑
                          </Btn>
                        )}
                      </div>
                      {/* V21.9.11: per-color price input */}
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
                        <label style={{ fontSize: FS - 4, color: T.textSec, fontWeight: 700 }}>
                          💰 السعر (ج.م)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceVal}
                          placeholder={String(Number(order?.sellPrice || 0).toFixed(2))}
                          onChange={e => {
                            const v = e.target.value;
                            setColorPrices(prev => {
                              const next = { ...prev };
                              if(v === "" || v == null){
                                delete next[colorName];
                              } else {
                                next[colorName] = Number(v);
                              }
                              return next;
                            });
                          }}
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px solid " + T.brd,
                            background: T.bg,
                            color: T.text,
                            fontSize: FS - 2,
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* General product images (gallery) — non-color-specific */}
          <Card title={"🖼 صور إضافية (" + images.filter(i => !i.color).length + ")"}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={e => { handleImageUpload(e.target.files); e.target.value = ""; }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <Btn small onClick={() => fileInputRef.current?.click()} disabled={uploadingIdx != null}>
                {uploadingIdx != null ? "⏳ جاري الرفع..." : "➕ ارفع صور (multiple)"}
              </Btn>
              <span style={{ fontSize: FS - 3, color: T.textMut }}>
                صور عامة للمنتج (مش مخصصة للون). 1200px JPEG على Firebase Storage. الـ URL بـ يـ pass لـ Shopify.
              </span>
            </div>

            {images.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: T.textMut, border: "2px dashed " + T.brd, borderRadius: 10 }}>
                <div style={{ fontSize: 32, marginBottom: 6, opacity: 0.5 }}>📷</div>
                <div>اضغط "ارفع صور" لاختيار صور المنتج</div>
                {order?.image && (
                  <div style={{ fontSize: FS - 3, marginTop: 6 }}>
                    💡 صورة الموديل من CLARK اتـ added تلقائياً
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {images.map((img, i) => (
                  <div key={i} style={{
                    position: "relative",
                    width: isMob ? 90 : 110,
                    height: isMob ? 120 : 147, /* 3:4 portrait */
                    borderRadius: 8,
                    border: "1px solid " + (img.color ? T.accent + "60" : T.brd),
                    overflow: "hidden",
                    background: T.bg,
                  }}>
                    <img
                      src={img.url}
                      alt={img.alt || ""}
                      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
                      loading="lazy"
                      onError={(e) => {
                        /* V21.9.5: error indicator if image fails to load */
                        const wrap = e.currentTarget.parentElement;
                        if(wrap && !wrap.querySelector(".img-err")){
                          const div = document.createElement("div");
                          div.className = "img-err";
                          div.textContent = "⚠️ فشل تحميل";
                          div.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);color:#fff;font-size:10px;text-align:center;padding:4px";
                          wrap.appendChild(div);
                        }
                      }}
                    />
                    {i === 0 && (
                      <div style={{ position: "absolute", top: 4, insetInlineStart: 4, fontSize: FS - 4, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: T.accent, color: "#fff" }}>
                        رئيسية
                      </div>
                    )}
                    {img.color && (
                      <div style={{ position: "absolute", top: 4, insetInlineEnd: 4, fontSize: FS - 4, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: T.ok, color: "#fff" }}>
                        🎨 {img.color}
                      </div>
                    )}
                    {img.source === "clark_order_image" && (
                      <div style={{ position: "absolute", bottom: 28, insetInlineStart: 4, fontSize: FS - 5, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#FF6F61", color: "#fff" }}>
                        من CLARK
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, background: "rgba(0,0,0,0.7)", padding: 4, display: "flex", gap: 2, justifyContent: "space-around" }}>
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
