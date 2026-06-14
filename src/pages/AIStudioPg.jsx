/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AIStudioPg.jsx (V21.23.1 — استوديو الموديلات، زر أساسي في الهوم)
   ───────────────────────────────────────────────────────────────────────
   تلبيس الموديلات (virtual try-on) بـ Nano Banana Pro من داخل التطبيق:
   اختر موديل (اختياري) + صور المصدر (القطعة/العينة) + خيارات (وقفة/عمر/جنس/
   خلفية/إطار) + برومبت → توليد → احفظ الناتج كصورة الموديل/لون أو في المستندات.

   بيشتغل بطريقتين:
   - زر «AI Studio» في الهوم: بدون موديل محدد → فيه منتقي موديلات (اختياري).
   - زر «🪄» على بطاقة موديل: الموديل محدد سلفاً.

   كل التوليد server-side (api/ai-image/generate). هنا UI بس.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Sel, SearchSel } from "../components/ui.jsx";
import { ImagePickButton } from "../components/DocumentImagePicker.jsx";
import { T } from "../theme.js";
import { FS, FKEYS } from "../constants/index.js";
import { ask, showToast } from "../utils/popups.js";
import { uploadImageToStorage } from "../utils/imageStorage.js";
import { runWithProgress } from "../utils/syncProgress.js";
import { generateModelImage } from "../utils/aiImageClient.js";
import {
  AR_RATIOS, IMAGE_SIZES, TIERS, GENDERS, CHILD_AGES, POSES, BACKGROUNDS, FRAMINGS,
  buildStudioPrompt, describeStudioOptions,
} from "../utils/aiStudioPresets.js";

/* كل صور الموديل المتاحة كمصدر (رئيسية + ألوان) */
function modelImages(model){
  const out = [];
  if(!model) return out;
  if(model.image) out.push(model.image);
  const ci = (model.shopify_meta && model.shopify_meta.color_images) || {};
  Object.values(ci).forEach(v => { const u = v && (v.url || v); if(u) out.push(u); });
  const legacy = model.colorImages || {};
  Object.values(legacy).forEach(u => { if(u && typeof u === "string") out.push(u); });
  return [...new Set(out)];
}

/* أسماء ألوان الموديل (لحفظ الناتج كصورة لون) */
function modelColorNames(model){
  const seen = new Set(); const out = [];
  if(!model) return out;
  FKEYS.forEach(k => (model["colors" + k] || []).forEach(c => {
    const n = ((c && c.color) || "").trim();
    if(n && !seen.has(n)){ seen.add(n); out.push(n); }
  }));
  return out;
}

export function AIStudioPg({ model, models, data, upConfig, user, isMob, replaceModel, onClose }){
  const [curModel, setCurModel] = useState(model || null);
  const [sources, setSources] = useState(() => modelImages(model || null).slice(0, 1));
  const [tier, setTier] = useState("pro");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [imageSize, setImageSize] = useState("2K");
  const [genderId, setGenderId] = useState("girl");
  const [ageId, setAgeId] = useState("a4_6");
  const [poseId, setPoseId] = useState("front");
  const [backgroundId, setBackgroundId] = useState("studio_white");
  const [framingId, setFramingId] = useState("full");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]); /* [{url, storagePath, model, ts}] */
  const [saveColor, setSaveColor] = useState("");

  /* منتقي موديلات (يظهر لما نفتح من الهوم — models متوفّرة والموديل مش مثبّت) */
  const showPicker = Array.isArray(models) && models.length > 0 && !model;
  const modelOpts = useMemo(() => (Array.isArray(models) ? models : [])
    .filter(m => m && m.id).map(m => ({ value: String(m.id), label: (m.modelNo || "—") + (m.modelDesc ? " — " + m.modelDesc : "") })),
    [models]);

  const availFromModel = useMemo(() => modelImages(curModel), [curModel]);
  const colorNames = useMemo(() => modelColorNames(curModel), [curModel]);
  const isChild = genderId === "girl" || genderId === "boy";

  const opts = { genderId, ageId, poseId, backgroundId, framingId, notes };
  const prompt = useMemo(() => buildStudioPrompt(opts), [genderId, ageId, poseId, backgroundId, framingId, notes]);
  const optsDesc = describeStudioOptions(opts);

  const pickModel = (id) => {
    const m = (Array.isArray(models) ? models : []).find(x => String(x.id) === String(id)) || null;
    setCurModel(m);
    setSaveColor("");
    setSources(modelImages(m).slice(0, 1));
  };

  const addSource = (url) => { if(!url) return; setSources(p => p.includes(url) ? p : [...p, url].slice(0, 5)); };
  const removeSource = (url) => setSources(p => p.filter(u => u !== url));
  const onSourceFiles = async (files) => {
    for(const f of files){
      try { const { url } = await uploadImageToStorage("ai-sources", (curModel && curModel.id) || "studio", f); addSource(url); }
      catch(err){ showToast("⛔ فشل رفع صورة المصدر" + (err?.message ? " — " + err.message : "")); }
    }
  };

  const generate = async () => {
    if(sources.length === 0){ showToast("⚠️ أضف صورة مصدر واحدة على الأقل (القطعة)"); return; }
    const costHint = tier === "pro" ? (imageSize === "4K" ? "~‎$0.24" : "~‎$0.13") : "~‎$0.04";
    const yes = await ask("توليد صورة بالذكاء الاصطناعي",
      "هيتولّد صورة موديل لابس الطقم بـ " + (tier === "pro" ? "Nano Banana Pro" : "Flash") + " (" + imageSize + ").\n" +
      "التكلفة التقريبية: " + costHint + " للصورة.\n\nالمواصفات: " + optsDesc,
      { confirmText: "توليد" });
    if(!yes) return;
    setBusy(true);
    const r = await runWithProgress({
      label: "توليد صورة الموديل", type: "ai-image-generate",
      fn: (jobId) => generateModelImage({
        modelId: (curModel && curModel.id) || "studio", sourceImageUrls: sources, prompt,
        aspectRatio, imageSize, tier, jobId,
      }, user),
    });
    setBusy(false);
    if(r && r.ok && r.url){
      setResults(p => [{ url: r.url, storagePath: r.storagePath, model: r.model, ts: Date.now() }, ...p]);
      showToast("✓ تم توليد الصورة");
    } else {
      showToast("⛔ " + ((r && r.error) || "فشل التوليد"));
    }
  };

  /* ── حفظ الناتج ── */
  const saveAsModelImage = (res) => {
    if(!replaceModel || !curModel){ showToast("⚠️ اختر موديل الأول"); return; }
    replaceModel(curModel.id, { ...curModel, image: res.url, imageStoragePath: res.storagePath || "" });
    setCurModel(p => ({ ...p, image: res.url, imageStoragePath: res.storagePath || "" }));
    showToast("✓ اتحفظت كصورة الموديل الرئيسية");
  };
  const saveAsColorImage = (res) => {
    if(!replaceModel || !curModel) return;
    if(!saveColor){ showToast("⚠️ اختر اللون الأول"); return; }
    const next = JSON.parse(JSON.stringify(curModel));
    if(!next.shopify_meta) next.shopify_meta = {};
    if(!next.shopify_meta.color_images) next.shopify_meta.color_images = {};
    next.shopify_meta.color_images[saveColor] = { url: res.url, alt: saveColor, source: "ai" };
    replaceModel(curModel.id, next);
    setCurModel(next);
    showToast("✓ اتحفظت كصورة لون «" + saveColor + "»");
  };
  const saveToDocuments = (res) => {
    const now = new Date().toISOString();
    const by = (user && (user.displayName || user.email)) || "";
    const fileRec = {
      id: "aidoc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      name: "ai_" + ((curModel && curModel.modelNo) || "studio") + "_" + new Date(res.ts).toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png",
      folderId: "", storagePath: res.storagePath || "", downloadURL: res.url,
      contentType: "image/png", size: 0, uploadedBy: by, uploadedAt: now, source: "ai-studio",
    };
    upConfig(d => {
      if(!d.documentsTree) d.documentsTree = { folders: [], files: [] };
      if(!Array.isArray(d.documentsTree.files)) d.documentsTree.files = [];
      d.documentsTree.files.push(fileRec);
    });
    showToast("✓ اتحفظت في المستندات");
  };

  /* ── chips ── */
  const Chip = ({ on, onClick, children }) => (
    <span onClick={onClick} style={{
      cursor: "pointer", padding: "6px 12px", borderRadius: 999, fontSize: FS - 2, fontWeight: 700,
      color: on ? "#fff" : T.textSec, background: on ? T.accent : T.bg,
      border: "1px solid " + (on ? T.accent : T.brd), whiteSpace: "nowrap",
    }}>{children}</span>
  );
  const chipRow = (label, items, val, setVal) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {items.map(it => <Chip key={it.id} on={val === it.id} onClick={() => setVal(it.id)}>{it.label}</Chip>)}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: T.bg, overflowY: "auto", direction: "rtl" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMob ? 12 : "16px 20px 60px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <Btn small onClick={onClose} style={{ background: T.cardSolid, border: "1px solid " + T.brd, color: T.text }}>‹ رجوع</Btn>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS + 4, fontWeight: 900, color: T.text }}>🪄 AI Studio — استوديو الموديلات</div>
            <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 2 }}>
              {curModel ? ("موديل: " + (curModel.modelNo || "—") + (curModel.modelDesc ? " — " + curModel.modelDesc : "")) : "توليد حرّ — اختر موديل لو عاوز تحفظ النتيجة عليه"}
            </div>
          </div>
        </div>

        {/* model picker (home mode) */}
        {showPicker && (
          <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, marginBottom: 8 }}>🧩 اختر موديل (اختياري — عشان صوره تنزل كمصدر وتقدر تحفظ النتيجة عليه)</div>
            <div style={{ maxWidth: 420 }}>
              <SearchSel value={curModel ? String(curModel.id) : ""} onChange={pickModel} options={modelOpts} showAllOnFocus maxResults={8} placeholder="🔍 ابحث عن موديل..." />
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1.1fr 1fr", gap: 16 }}>
          {/* ── left: inputs ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* sources */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 8 }}>🧵 صور المصدر (القطعة/العينة) — لغاية ٥</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {sources.map(u => (
                  <div key={u} style={{ position: "relative", width: 70, height: 90, borderRadius: 10, overflow: "hidden", border: "1px solid " + T.brd }}>
                    <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span onClick={() => removeSource(u)} style={{ position: "absolute", top: 2, insetInlineEnd: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer" }}>✕</span>
                  </div>
                ))}
                {sources.length < 5 && (
                  <ImagePickButton data={data} multiple imagesOnly onFiles={onSourceFiles} onPickMany={(recs) => recs.forEach(r => addSource(r.downloadURL || r.url))}
                    triggerStyle={{ width: 70, height: 90, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, textAlign: "center" }}>
                    + أضف
                  </ImagePickButton>
                )}
              </div>
              {availFromModel.length > 0 && (
                <div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 4 }}>من صور الموديل:</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {availFromModel.map(u => (
                      <img key={u} src={u} alt="" onClick={() => addSource(u)} title="إضافة كمصدر"
                        style={{ width: 46, height: 58, objectFit: "cover", borderRadius: 8, border: "1px solid " + (sources.includes(u) ? T.accent : T.brd), cursor: "pointer", opacity: sources.includes(u) ? 0.5 : 1 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* options */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>🎛️ خيارات الموديل</div>
              {chipRow("الجنس", GENDERS, genderId, setGenderId)}
              {isChild && chipRow("العمر", CHILD_AGES, ageId, setAgeId)}
              {chipRow("الوقفة", POSES, poseId, setPoseId)}
              {chipRow("الخلفية", BACKGROUNDS, backgroundId, setBackgroundId)}
              {chipRow("الإطار", FRAMINGS, framingId, setFramingId)}
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>ملاحظات إضافية (اختياري)</div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="مثلاً: ابتسامة، إضاءة دافئة، حذاء أبيض..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 46, outline: "none" }} />
              </div>
            </div>

            {/* output settings */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>النموذج</div>
                <Sel value={tier} onChange={setTier}>{TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</Sel>
              </div>
              <div>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>الأبعاد</div>
                <Sel value={aspectRatio} onChange={setAspectRatio}>{AR_RATIOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel>
              </div>
              <div>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>الدقة</div>
                <Sel value={imageSize} onChange={setImageSize}>{IMAGE_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel>
              </div>
            </div>

            <Btn primary onClick={generate} disabled={busy || sources.length === 0}
              style={{ fontSize: FS + 1, padding: "13px 0", fontWeight: 800 }}>
              {busy ? "⏳ جاري التوليد..." : "🪄 توليد الصورة"}
            </Btn>
          </div>

          {/* ── right: results ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 8 }}>🖼️ النتائج</div>
              {results.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 16px", color: T.textMut, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🪄</div>
                  اختر صور المصدر والخيارات واضغط «توليد» — والنتيجة هتظهر هنا، وتقدر تحفظها على الموديل أو في المستندات.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {curModel && colorNames.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>حفظ كصورة لون:</span>
                      <Sel value={saveColor} onChange={setSaveColor}>
                        <option value="">— اختر اللون —</option>
                        {colorNames.map(c => <option key={c} value={c}>{c}</option>)}
                      </Sel>
                    </div>
                  )}
                  {results.map(res => (
                    <div key={res.ts} style={{ border: "1px solid " + T.brd, borderRadius: 12, overflow: "hidden", background: T.bg }}>
                      <img src={res.url} alt="" style={{ width: "100%", display: "block", maxHeight: 460, objectFit: "contain", background: "#000" }} />
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 10 }}>
                        {curModel && replaceModel && <Btn small onClick={() => saveAsModelImage(res)} style={{ background: T.accent + "14", color: T.accent, border: "1px solid " + T.accent + "33", fontWeight: 700 }}>⭐ صورة الموديل</Btn>}
                        {curModel && replaceModel && colorNames.length > 0 && <Btn small onClick={() => saveAsColorImage(res)} style={{ background: "#EC489912", color: "#EC4899", border: "1px solid #EC489933", fontWeight: 700 }}>🎨 صورة لون</Btn>}
                        <Btn small onClick={() => saveToDocuments(res)} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33", fontWeight: 700 }}>🗂️ المستندات</Btn>
                        <a href={res.url} target="_blank" rel="noreferrer"><Btn small style={{ background: T.bg, color: T.text, border: "1px solid " + T.brd }}>⬇️ تنزيل</Btn></a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIStudioPg;
