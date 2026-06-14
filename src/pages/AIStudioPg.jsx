/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AIStudioPg.jsx (V21.23.2 — استوديو الموديلات Phase 2b)
   ───────────────────────────────────────────────────────────────────────
   تلبيس الموديلات (virtual try-on) + لقطات منتج احترافية بـ Nano Banana Pro.

   Phase 2b:
   - نوع اللقطة: موديل لابس · مانيكان شبح (ghost) · فرش مسطّح (flat-lay).
   - توليد متعدد: عدد صور (تنويعات) أو وقفات متعددة (صورة لكل وقفة).
   - مكتبة قابلة للتعديل: وقفات/خلفيات مخصّصة + حفظ/تطبيق قوالب (cfg).
   - معرض محفوظ لكل موديل (model.aiImages) + إعادة استخدام/ترقية/حذف.
   - تعديل صورة مولّدة (refine) بتعليمات + عدّاد تكلفة الجلسة.

   كل التوليد server-side (api/ai-image/generate). هنا UI بس.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Sel, Inp, SearchSel, BlockingOverlay } from "../components/ui.jsx";
import { ImagePickButton } from "../components/DocumentImagePicker.jsx";
import { T } from "../theme.js";
import { FS, FKEYS } from "../constants/index.js";
import { ask, showToast } from "../utils/popups.js";
import { uploadImageToStorage } from "../utils/imageStorage.js";
import { generateModelImage, analyzePrompt } from "../utils/aiImageClient.js";
import {
  AR_RATIOS, IMAGE_SIZES, TIERS, SHOT_TYPES, GENDERS, CHILD_AGES, FRAMINGS,
  SKIN_TONES, LIGHTINGS, REFERENCE_TRYON_PROMPT,
  mergePresets, buildStudioPrompt, buildEditPrompt, describeStudioOptions,
} from "../utils/aiStudioPresets.js";

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
function modelColorNames(model){
  const seen = new Set(); const out = [];
  if(!model) return out;
  FKEYS.forEach(k => (model["colors" + k] || []).forEach(c => {
    const n = ((c && c.color) || "").trim();
    if(n && !seen.has(n)){ seen.add(n); out.push(n); }
  }));
  return out;
}
const unitCost = (tier, size) => tier === "pro" ? (size === "4K" ? 0.24 : 0.13) : 0.04;

export function AIStudioPg({ model, models, data, upConfig, user, isMob, replaceModel, onClose }){
  const lib = useMemo(() => mergePresets(data), [data]);

  const [curModel, setCurModel] = useState(model || null);
  const [sources, setSources] = useState(() => modelImages(model || null).slice(0, 1));
  const [tier, setTier] = useState("pro");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [imageSize, setImageSize] = useState("2K");
  const [shotType, setShotType] = useState("model");
  const [genderId, setGenderId] = useState("girl");
  const [ageId, setAgeId] = useState("a4_6");
  const [poseId, setPoseId] = useState("front");
  const [backgroundId, setBackgroundId] = useState("studio_white");
  const [framingId, setFramingId] = useState("full");
  const [skinToneId, setSkinToneId] = useState("any");
  const [lightingId, setLightingId] = useState("soft");
  const [notes, setNotes] = useState("");
  const [customOn, setCustomOn] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [count, setCount] = useState(1);
  const [multiPose, setMultiPose] = useState(false);
  const [selPoses, setSelPoses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const [results, setResults] = useState([]);
  const [saveColor, setSaveColor] = useState("");
  const [genCount, setGenCount] = useState(0);
  const [spent, setSpent] = useState(0);
  const [editFor, setEditFor] = useState(null);
  const [editInstr, setEditInstr] = useState("");
  const [showLib, setShowLib] = useState(false);
  const [newPose, setNewPose] = useState({ label: "", prompt: "" });
  const [newBg, setNewBg] = useState({ label: "", prompt: "" });
  const [tplName, setTplName] = useState("");

  const showPicker = Array.isArray(models) && models.length > 0 && !model;
  const modelOpts = useMemo(() => (Array.isArray(models) ? models : [])
    .filter(m => m && m.id).map(m => ({ value: String(m.id), label: (m.modelNo || "—") + (m.modelDesc ? " — " + m.modelDesc : "") })),
    [models]);

  const availFromModel = useMemo(() => modelImages(curModel), [curModel]);
  const colorNames = useMemo(() => modelColorNames(curModel), [curModel]);
  const gallery = (curModel && Array.isArray(curModel.aiImages)) ? curModel.aiImages : [];
  const isModelShot = shotType === "model";
  const isReference = shotType === "reference";
  const isChild = genderId === "girl" || genderId === "boy";
  const opts = { shotType, genderId, ageId, poseId, backgroundId, framingId, skinToneId, lightingId, notes };
  /* البرومبت الفعلي: حر (لو مفعّل وفيه نص) → وإلا المبني من الـ chips (وضع
     «موديل مرجعي» buildStudioPrompt بيرجّع برومبت التلبيس المرجعي). */
  const useCustom = (customOn || isReference) && customPrompt.trim();
  const effPrompt = (o) => useCustom ? customPrompt.trim() : buildStudioPrompt(o, lib);

  const setShot = (id) => {
    setShotType(id);
    if(id === "reference" && !customPrompt.trim()){ setCustomPrompt(REFERENCE_TRYON_PROMPT); setCustomOn(true); }
  };
  /* وضع موديل مرجعي: sources[0] = Image1 (الموديل) · الباقي = Image2 (القطعة) */
  const setRefModel = (url) => { if(url) setSources(p => [url, ...p.slice(1)]); };
  const clearRefModel = () => setSources(p => p.slice(1));

  const pickModel = (id) => {
    const m = (Array.isArray(models) ? models : []).find(x => String(x.id) === String(id)) || null;
    setCurModel(m); setSaveColor(""); setSources(modelImages(m).slice(0, 1));
  };

  const addSource = (url) => { if(!url) return; setSources(p => p.includes(url) ? p : [...p, url].slice(0, 5)); };
  const removeSource = (url) => setSources(p => p.filter(u => u !== url));
  const onSourceFiles = async (files) => {
    for(const f of files){
      try { const { url } = await uploadImageToStorage("ai-sources", (curModel && curModel.id) || "studio", f); addSource(url); }
      catch(err){ showToast("⛔ فشل رفع صورة المصدر" + (err?.message ? " — " + err.message : "")); }
    }
  };

  /* ── التوليد ── */
  const callOnce = async (o, srcUrls) => {
    const pr = effPrompt(o);
    const r = await generateModelImage({
      modelId: (curModel && curModel.id) || "studio", sourceImageUrls: srcUrls,
      prompt: pr, aspectRatio, imageSize, tier,
    }, user);
    if(r && r.ok && r.url){
      const entry = {
        id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        url: r.url, storagePath: r.storagePath || "", prompt: pr, desc: describeStudioOptions(o, lib),
        tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: o,
      };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1);
      setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      return entry;
    }
    showToast("⛔ " + ((r && r.error) || "فشل التوليد"));
    return null;
  };

  const generate = async () => {
    if(sources.length === 0){ showToast("⚠️ أضف صورة مصدر واحدة على الأقل (القطعة)"); return; }
    if(isReference && sources.length < 2){ showToast("⚠️ وضع «موديل مرجعي» محتاج صورة موديل (Image 1) + صورة قطعة (Image 2)"); return; }
    let jobs;
    if(isModelShot && multiPose && selPoses.length > 0) jobs = selPoses.map(pid => ({ ...opts, poseId: pid }));
    else { const n = Math.max(1, Math.min(4, Number(count) || 1)); jobs = Array.from({ length: n }, () => ({ ...opts })); }
    const total = Math.round(unitCost(tier, imageSize) * jobs.length * 100) / 100;
    const yes = await ask("توليد بالذكاء الاصطناعي",
      "عدد الصور: " + jobs.length + " · النموذج: " + (tier === "pro" ? "Nano Banana Pro" : "Flash") + " (" + imageSize + ")\n" +
      "التكلفة التقريبية الإجمالية: ~‎$" + total + "\n\nالنوع: " + (SHOT_TYPES.find(s => s.id === shotType) || {}).label,
      { confirmText: "توليد" });
    if(!yes) return;
    setBusy(true);
    for(let i = 0; i < jobs.length; i++){
      setBatchMsg(jobs.length > 1 ? ("جاري توليد " + (i + 1) + " من " + jobs.length + "...") : "جاري التوليد...");
      const e = await callOnce(jobs[i], sources);
      if(!e) break;
    }
    setBusy(false); setBatchMsg("");
  };

  const runAnalyze = async () => {
    const p = customPrompt.trim();
    if(!p){ showToast("⚠️ اكتب برومبت الأول"); return; }
    setAnalyzing(true);
    const r = await analyzePrompt({ prompt: p, options: {
      genders: GENDERS, ages: CHILD_AGES, backgrounds: lib.backgrounds,
      framings: FRAMINGS, poses: lib.poses, skinTones: SKIN_TONES, lightings: LIGHTINGS,
    } }, user);
    setAnalyzing(false);
    if(!r || !r.ok || !r.fields){ showToast("⛔ " + ((r && r.error) || "فشل التحليل")); return; }
    const f = r.fields;
    const has = (arr, id) => Array.isArray(arr) && arr.some(x => x.id === id);
    if(has(GENDERS, f.genderId)) setGenderId(f.genderId);
    if(has(CHILD_AGES, f.ageId)) setAgeId(f.ageId);
    if(has(lib.backgrounds, f.backgroundId)) setBackgroundId(f.backgroundId);
    if(has(FRAMINGS, f.framingId)) setFramingId(f.framingId);
    if(has(lib.poses, f.poseId)) setPoseId(f.poseId);
    if(has(SKIN_TONES, f.skinToneId)) setSkinToneId(f.skinToneId);
    if(has(LIGHTINGS, f.lightingId)) setLightingId(f.lightingId);
    if(f.extraNotes && String(f.extraNotes).trim()) setNotes(n => (n ? n + " · " : "") + String(f.extraNotes).trim());
    if(shotType === "reference" || shotType === "ghost" || shotType === "flat") setShotType("model");
    showToast("✓ " + (f.summary || "تم تحليل البرومبت وتطبيق الإعدادات"));
  };

  const doEdit = async () => {
    if(!editFor || !editInstr.trim()){ showToast("⚠️ اكتب تعليمات التعديل"); return; }
    setBusy(true); setBatchMsg("جاري تعديل الصورة...");
    const r = await generateModelImage({
      modelId: (curModel && curModel.id) || "studio", sourceImageUrls: [editFor.url],
      prompt: buildEditPrompt(editInstr), aspectRatio, imageSize, tier,
    }, user);
    setBusy(false); setBatchMsg("");
    if(r && r.ok && r.url){
      const entry = { id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), url: r.url, storagePath: r.storagePath || "", prompt: buildEditPrompt(editInstr), desc: "تعديل: " + editInstr.trim(), tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: editFor.options || opts };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1); setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      setEditFor(null); setEditInstr(""); showToast("✓ تم التعديل");
    } else showToast("⛔ " + ((r && r.error) || "فشل التعديل"));
  };

  /* ── حفظ / معرض ── */
  const saveAsModelImage = (res) => {
    if(!replaceModel || !curModel){ showToast("⚠️ اختر موديل الأول"); return; }
    const next = { ...curModel, image: res.url, imageStoragePath: res.storagePath || "" };
    replaceModel(curModel.id, next); setCurModel(next);
    showToast("✓ اتحفظت كصورة الموديل الرئيسية");
  };
  const saveAsColorImage = (res) => {
    if(!replaceModel || !curModel) return;
    if(!saveColor){ showToast("⚠️ اختر اللون الأول"); return; }
    const next = JSON.parse(JSON.stringify(curModel));
    if(!next.shopify_meta) next.shopify_meta = {};
    if(!next.shopify_meta.color_images) next.shopify_meta.color_images = {};
    next.shopify_meta.color_images[saveColor] = { url: res.url, alt: saveColor, source: "ai" };
    replaceModel(curModel.id, next); setCurModel(next);
    showToast("✓ اتحفظت كصورة لون «" + saveColor + "»");
  };
  const saveToGallery = (res) => {
    if(!replaceModel || !curModel){ showToast("⚠️ اختر موديل عشان تحفظ في معرضه"); return; }
    if(gallery.some(g => g.url === res.url)){ showToast("موجودة في المعرض بالفعل"); return; }
    const item = { id: res.id, url: res.url, storagePath: res.storagePath || "", desc: res.desc || "", prompt: res.prompt || "", tier: res.tier, ts: res.ts, by: res.by, options: res.options || null };
    const next = { ...curModel, aiImages: [item, ...gallery] };
    replaceModel(curModel.id, next); setCurModel(next);
    showToast("✓ اتحفظت في معرض الموديل");
  };
  const deleteFromGallery = (id) => {
    if(!replaceModel || !curModel) return;
    const next = { ...curModel, aiImages: gallery.filter(g => g.id !== id) };
    replaceModel(curModel.id, next); setCurModel(next);
    showToast("🗑 اتشالت من المعرض");
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
  const saveAllToDocuments = () => {
    if(results.length === 0) return;
    results.forEach(saveToDocuments);
    showToast("✓ اتحفظت كل النتائج (" + results.length + ") في المستندات");
  };

  const applyOptions = (o) => {
    if(!o) return;
    if(o.shotType) setShotType(o.shotType);
    if(o.genderId) setGenderId(o.genderId);
    if(o.ageId) setAgeId(o.ageId);
    if(o.poseId) setPoseId(o.poseId);
    if(o.backgroundId) setBackgroundId(o.backgroundId);
    if(o.framingId) setFramingId(o.framingId);
    if(o.notes != null) setNotes(o.notes);
    setMultiPose(false);
    showToast("✓ تم تحميل الإعدادات");
  };

  /* ── المكتبة (cfg.aiStudioPresets) ── */
  const savePresets = (mut) => upConfig(d => {
    if(!d.aiStudioPresets) d.aiStudioPresets = { poses: [], backgrounds: [], templates: [] };
    if(!Array.isArray(d.aiStudioPresets.poses)) d.aiStudioPresets.poses = [];
    if(!Array.isArray(d.aiStudioPresets.backgrounds)) d.aiStudioPresets.backgrounds = [];
    if(!Array.isArray(d.aiStudioPresets.templates)) d.aiStudioPresets.templates = [];
    mut(d.aiStudioPresets);
  });
  const addCustomPose = () => {
    if(!newPose.label.trim() || !newPose.prompt.trim()){ showToast("⚠️ اكتب الاسم والوصف الإنجليزي"); return; }
    savePresets(p => p.poses.push({ id: "cp_" + Date.now().toString(36), label: newPose.label.trim(), prompt: newPose.prompt.trim(), custom: true }));
    setNewPose({ label: "", prompt: "" }); showToast("✓ اتضافت وقفة");
  };
  const addCustomBg = () => {
    if(!newBg.label.trim() || !newBg.prompt.trim()){ showToast("⚠️ اكتب الاسم والوصف الإنجليزي"); return; }
    savePresets(p => p.backgrounds.push({ id: "cb_" + Date.now().toString(36), label: newBg.label.trim(), prompt: newBg.prompt.trim(), custom: true }));
    setNewBg({ label: "", prompt: "" }); showToast("✓ اتضافت خلفية");
  };
  const delCustom = (kind, id) => savePresets(p => { p[kind] = p[kind].filter(x => x.id !== id); });
  const saveTemplate = () => {
    if(!tplName.trim()){ showToast("⚠️ اكتب اسم القالب"); return; }
    savePresets(p => p.templates.push({ id: "tpl_" + Date.now().toString(36), name: tplName.trim(), options: opts }));
    setTplName(""); showToast("✓ اتحفظ القالب");
  };

  /* ── chips ── */
  const Chip = ({ on, onClick, children }) => (
    <span onClick={onClick} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 999, fontSize: FS - 2, fontWeight: 700, color: on ? "#fff" : T.textSec, background: on ? T.accent : T.bg, border: "1px solid " + (on ? T.accent : T.brd), whiteSpace: "nowrap" }}>{children}</span>
  );
  const chipRow = (label, items, val, setVal) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{items.map(it => <Chip key={it.id} on={val === it.id} onClick={() => setVal(it.id)}>{it.label}</Chip>)}</div>
    </div>
  );

  const resultActions = (res, inGallery) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 10 }}>
      {curModel && replaceModel && <Btn small onClick={() => saveAsModelImage(res)} style={{ background: T.accent + "14", color: T.accent, border: "1px solid " + T.accent + "33", fontWeight: 700 }}>⭐ رئيسية</Btn>}
      {curModel && replaceModel && colorNames.length > 0 && <Btn small onClick={() => saveAsColorImage(res)} style={{ background: "#EC489912", color: "#EC4899", border: "1px solid #EC489933", fontWeight: 700 }}>🎨 لون</Btn>}
      {!inGallery && curModel && replaceModel && <Btn small onClick={() => saveToGallery(res)} style={{ background: "#8B5CF612", color: "#8B5CF6", border: "1px solid #8B5CF633", fontWeight: 700 }}>💾 المعرض</Btn>}
      <Btn small onClick={() => saveToDocuments(res)} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33", fontWeight: 700 }}>🗂️ مستندات</Btn>
      <Btn small onClick={() => { setEditFor(res); setEditInstr(""); }} style={{ background: T.warn + "12", color: T.warn, border: "1px solid " + T.warn + "33", fontWeight: 700 }}>✏️ تعديل</Btn>
      {res.options && <Btn small onClick={() => applyOptions(res.options)} style={{ background: T.bg, color: T.textSec, border: "1px solid " + T.brd }}>🔁 إعدادات</Btn>}
      <a href={res.url} target="_blank" rel="noreferrer"><Btn small style={{ background: T.bg, color: T.text, border: "1px solid " + T.brd }}>⬇️</Btn></a>
      {inGallery && <Btn small onClick={() => deleteFromGallery(res.id)} style={{ background: T.err + "12", color: T.err, border: "1px solid " + T.err + "33" }}>🗑</Btn>}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: T.bg, overflowY: "auto", direction: "rtl" }}>
      <BlockingOverlay show={busy} text={batchMsg || "جاري التوليد..."} sub="بـ Nano Banana Pro — ثواني" />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: isMob ? 12 : "16px 20px 60px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <Btn small onClick={onClose} style={{ background: T.cardSolid, border: "1px solid " + T.brd, color: T.text }}>‹ رجوع</Btn>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS + 4, fontWeight: 900, color: T.text }}>🪄 AI Studio — استوديو الموديلات</div>
            <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 2 }}>
              {curModel ? ("موديل: " + (curModel.modelNo || "—") + (curModel.modelDesc ? " — " + curModel.modelDesc : "")) : "توليد حرّ — اختر موديل لو عاوز تحفظ النتيجة عليه"}
            </div>
          </div>
          {genCount > 0 && <div style={{ textAlign: "center", background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 10, padding: "6px 12px" }}>
            <div style={{ fontSize: FS - 3, color: T.textMut }}>هذه الجلسة</div>
            <div style={{ fontSize: FS, fontWeight: 800, color: T.text }}>{genCount} صورة · ~‎${spent}</div>
          </div>}
        </div>

        {showPicker && (
          <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, marginBottom: 8 }}>🧩 اختر موديل (اختياري)</div>
            <div style={{ maxWidth: 420 }}>
              <SearchSel value={curModel ? String(curModel.id) : ""} onChange={pickModel} options={modelOpts} showAllOnFocus maxResults={8} placeholder="🔍 ابحث عن موديل..." />
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1.1fr 1fr", gap: 16 }}>
          {/* ── left: inputs ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* shot type */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>📸 نوع اللقطة</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{SHOT_TYPES.map(s => <Chip key={s.id} on={shotType === s.id} onClick={() => setShot(s.id)}>{s.label}</Chip>)}</div>
            </div>

            {/* sources */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              {isReference ? (
                <>
                  <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 4 }}>🖼️ صور «موديل مرجعي»</div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 10, lineHeight: 1.6 }}>صورة الموديل (من النت/أي مصدر) + صورة القطعة بتاعتك — البرنامج بيبدّل القطعة على الموديل ويحافظ على كل التفاصيل.</div>
                  <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>🧍 الموديل المرجعي (Image 1)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {sources[0] ? (
                      <div style={{ position: "relative", width: 80, height: 104, borderRadius: 10, overflow: "hidden", border: "2px solid " + T.accent }}>
                        <img src={sources[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span onClick={clearRefModel} style={{ position: "absolute", top: 2, insetInlineEnd: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer" }}>✕</span>
                      </div>
                    ) : (
                      <ImagePickButton data={data} imagesOnly onFile={async f => { try { const { url } = await uploadImageToStorage("ai-sources", (curModel && curModel.id) || "studio", f); setRefModel(url); } catch(err){ showToast("⛔ فشل رفع الموديل" + (err?.message ? " — " + err.message : "")); } }} onPickUrl={url => setRefModel(url)}
                        triggerStyle={{ width: 80, height: 104, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, textAlign: "center" }}>+ موديل</ImagePickButton>
                    )}
                  </div>
                  <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>🧵 القطعة (Image 2)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sources.slice(1).map(u => (
                      <div key={u} style={{ position: "relative", width: 70, height: 90, borderRadius: 10, overflow: "hidden", border: "1px solid " + T.brd }}>
                        <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span onClick={() => removeSource(u)} style={{ position: "absolute", top: 2, insetInlineEnd: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer" }}>✕</span>
                      </div>
                    ))}
                    {sources.length < 5 && (
                      <ImagePickButton data={data} multiple imagesOnly onFiles={onSourceFiles} onPickMany={(recs) => recs.forEach(r => addSource(r.downloadURL || r.url))}
                        triggerStyle={{ width: 70, height: 90, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, textAlign: "center" }}>+ قطعة</ImagePickButton>
                    )}
                  </div>
                </>
              ) : (
                <>
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
                        triggerStyle={{ width: 70, height: 90, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, textAlign: "center" }}>+ أضف</ImagePickButton>
                    )}
                  </div>
                  {availFromModel.length > 0 && (
                    <div>
                      <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 4 }}>من صور الموديل:</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {availFromModel.map(u => <img key={u} src={u} alt="" onClick={() => addSource(u)} title="إضافة كمصدر" style={{ width: 46, height: 58, objectFit: "cover", borderRadius: 8, border: "1px solid " + (sources.includes(u) ? T.accent : T.brd), cursor: "pointer", opacity: sources.includes(u) ? 0.5 : 1 }} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* options */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>🎛️ الخيارات</div>
              {isReference && <div style={{ fontSize: FS - 2, color: T.textMut, lineHeight: 1.7 }}>في وضع «موديل مرجعي» كل التفاصيل (الوقفة/الخلفية/الإضاءة/الهوية) بتتاخد من صورة الموديل (Image 1) والبرومبت بيقفلها. عدّل البرومبت من قسم «✍️ البرومبت» تحت لو محتاج.</div>}
              {isModelShot && chipRow("الجنس", GENDERS, genderId, setGenderId)}
              {isModelShot && isChild && chipRow("العمر", CHILD_AGES, ageId, setAgeId)}
              {isModelShot && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>الوقفة {multiPose ? "(متعددة — صورة لكل وقفة)" : ""}</span>
                    <span onClick={() => { setMultiPose(v => !v); setSelPoses(multiPose ? [] : [poseId]); }} style={{ cursor: "pointer", fontSize: FS - 3, fontWeight: 700, color: multiPose ? T.accent : T.textMut }}>{multiPose ? "✓ وقفات متعددة" : "وقفات متعددة"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {lib.poses.map(it => {
                      const on = multiPose ? selPoses.includes(it.id) : poseId === it.id;
                      return <Chip key={it.id} on={on} onClick={() => { if(multiPose) setSelPoses(p => p.includes(it.id) ? p.filter(x => x !== it.id) : [...p, it.id]); else setPoseId(it.id); }}>{it.label}{it.custom ? " ✦" : ""}</Chip>;
                    })}
                  </div>
                </div>
              )}
              {isModelShot && chipRow("الإطار", FRAMINGS, framingId, setFramingId)}
              {isModelShot && chipRow("لون البشرة", SKIN_TONES, skinToneId, setSkinToneId)}
              {isModelShot && chipRow("الإضاءة", LIGHTINGS, lightingId, setLightingId)}
              {!isReference && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>الخلفية</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{lib.backgrounds.map(it => <Chip key={it.id} on={backgroundId === it.id} onClick={() => setBackgroundId(it.id)}>{it.label}{it.custom ? " ✦" : ""}</Chip>)}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>ملاحظات إضافية (اختياري)</div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="مثلاً: ابتسامة، إضاءة دافئة، حذاء أبيض..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 46, outline: "none" }} />
              </div>
            </div>

            {/* custom prompt + analyze */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>✍️ البرومبت {isReference ? "(مرجعي)" : "الحر"}</span>
                {!isReference && <span onClick={() => setCustomOn(v => !v)} style={{ cursor: "pointer", fontSize: FS - 3, fontWeight: 700, color: customOn ? T.accent : T.textMut }}>{customOn ? "✓ مستخدَم في التوليد" : "استخدمه في التوليد"}</span>}
              </div>
              {(customOn || isReference) ? (
                <>
                  <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={isReference ? 8 : 5} placeholder="اكتب البرومبت الكامل (الإنجليزي أدق)..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 2, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 90, outline: "none", lineHeight: 1.6 }} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <Btn small onClick={() => setCustomPrompt(REFERENCE_TRYON_PROMPT)} style={{ background: T.bg, color: T.textSec, border: "1px solid " + T.brd }}>📋 قالب التلبيس المرجعي</Btn>
                    <Btn small onClick={runAnalyze} disabled={analyzing} style={{ background: "#8B5CF612", color: "#8B5CF6", border: "1px solid #8B5CF633", fontWeight: 700 }}>{analyzing ? "⏳ تحليل..." : "🔎 تحليل البرومبت"}</Btn>
                    {customPrompt && <Btn small onClick={() => setCustomPrompt("")} style={{ background: T.err + "10", color: T.err, border: "1px solid " + T.err + "30" }}>مسح</Btn>}
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 6, lineHeight: 1.6 }}>🔎 «تحليل» بيقرأ البرومبت ويظبط الشيبس (السن/الخلفية/لون البشرة/الإضاءة) تلقائياً.</div>
                </>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: FS - 2, color: T.textMut }}>اكتب برومبت كامل بنفسك بدل الخيارات.</span>
                  <Btn small onClick={() => setCustomOn(true)} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "33", fontWeight: 700 }}>✍️ فعّل البرومبت الحر</Btn>
                </div>
              )}
            </div>

            {/* library */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div onClick={() => setShowLib(v => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>🛠️ المكتبة والقوالب</span>
                <span style={{ color: T.textMut }}>{showLib ? "▲" : "▼"}</span>
              </div>
              {showLib && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* templates */}
                  <div>
                    <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>القوالب المحفوظة</div>
                    {lib.templates.length === 0 ? <div style={{ fontSize: FS - 3, color: T.textMut }}>مفيش قوالب — احفظ الإعدادات الحالية كقالب.</div>
                      : <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{lib.templates.map(t => (
                        <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: T.bg, border: "1px solid " + T.brd, fontSize: FS - 2 }}>
                          <span onClick={() => applyOptions(t.options)} style={{ cursor: "pointer", fontWeight: 700, color: T.accent }}>{t.name}</span>
                          <span onClick={() => savePresets(p => { p.templates = p.templates.filter(x => x.id !== t.id); })} style={{ cursor: "pointer", color: T.err }}>×</span>
                        </span>))}</div>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <Inp value={tplName} onChange={setTplName} placeholder="اسم القالب (مثلاً: صيفي خارجي)" />
                      <Btn small onClick={saveTemplate} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33", whiteSpace: "nowrap" }}>💾 حفظ الإعدادات</Btn>
                    </div>
                  </div>
                  {/* custom pose */}
                  <div>
                    <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>إضافة وقفة مخصّصة</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                      <Inp value={newPose.label} onChange={v => setNewPose(p => ({ ...p, label: v }))} placeholder="الاسم (عربي)" />
                      <Inp value={newPose.prompt} onChange={v => setNewPose(p => ({ ...p, prompt: v }))} placeholder="الوصف (English)" />
                      <Btn small onClick={addCustomPose} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "33" }}>+</Btn>
                    </div>
                  </div>
                  {/* custom bg */}
                  <div>
                    <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>إضافة خلفية مخصّصة</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                      <Inp value={newBg.label} onChange={v => setNewBg(p => ({ ...p, label: v }))} placeholder="الاسم (عربي)" />
                      <Inp value={newBg.prompt} onChange={v => setNewBg(p => ({ ...p, prompt: v }))} placeholder="الوصف (English)" />
                      <Btn small onClick={addCustomBg} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "33" }}>+</Btn>
                    </div>
                    {(lib.poses.some(p => p.custom) || lib.backgrounds.some(b => b.custom)) && (
                      <div style={{ marginTop: 8, fontSize: FS - 3, color: T.textMut }}>
                        المخصّص (✦): {lib.poses.filter(p => p.custom).map(p => <span key={p.id} onClick={() => delCustom("poses", p.id)} style={{ cursor: "pointer", marginInlineEnd: 6, color: T.err }}>{p.label} ×</span>)}
                        {lib.backgrounds.filter(b => b.custom).map(b => <span key={b.id} onClick={() => delCustom("backgrounds", b.id)} style={{ cursor: "pointer", marginInlineEnd: 6, color: T.err }}>{b.label} ×</span>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* output settings */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
              <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>النموذج</div><Sel value={tier} onChange={setTier}>{TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</Sel></div>
              <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>الأبعاد</div><Sel value={aspectRatio} onChange={setAspectRatio}>{AR_RATIOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></div>
              <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>الدقة</div><Sel value={imageSize} onChange={setImageSize}>{IMAGE_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel></div>
              <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>عدد الصور</div><Sel value={String(count)} onChange={v => setCount(Number(v))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</Sel></div>
            </div>

            <Btn primary onClick={generate} disabled={busy || sources.length === 0 || (isReference && sources.length < 2)} style={{ fontSize: FS + 1, padding: "13px 0", fontWeight: 800 }}>
              {busy ? "⏳ جاري التوليد..." : "🪄 توليد الصورة" + (isModelShot && multiPose && selPoses.length > 0 ? " (" + selPoses.length + " وقفة)" : (Number(count) > 1 ? " (" + count + ")" : ""))}
            </Btn>
          </div>

          {/* ── right: results + gallery ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>🖼️ نتائج الجلسة</span>
                {results.length > 1 && <Btn small onClick={saveAllToDocuments} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33" }}>🗂️ حفظ الكل</Btn>}
              </div>
              {results.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 16px", color: T.textMut, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🪄</div>
                  اختر صور المصدر والخيارات واضغط «توليد» — والنتيجة هتظهر هنا.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {curModel && colorNames.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>اللون للحفظ:</span>
                      <Sel value={saveColor} onChange={setSaveColor}><option value="">— اختر اللون —</option>{colorNames.map(c => <option key={c} value={c}>{c}</option>)}</Sel>
                    </div>
                  )}
                  {results.map(res => (
                    <div key={res.id} style={{ border: "1px solid " + T.brd, borderRadius: 12, overflow: "hidden", background: T.bg }}>
                      <img src={res.url} alt="" style={{ width: "100%", display: "block", maxHeight: 460, objectFit: "contain", background: "#000" }} />
                      {res.desc && <div style={{ fontSize: FS - 3, color: T.textMut, padding: "6px 10px 0" }}>{res.desc}</div>}
                      {resultActions(res, false)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* persisted gallery */}
            {curModel && gallery.length > 0 && (
              <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>📚 معرض الموديل المحفوظ ({gallery.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {gallery.map(g => (
                    <div key={g.id} style={{ border: "1px solid " + T.brd, borderRadius: 12, overflow: "hidden", background: T.bg }}>
                      <img src={g.url} alt="" style={{ width: "100%", display: "block", maxHeight: 380, objectFit: "contain", background: "#000" }} />
                      {g.desc && <div style={{ fontSize: FS - 3, color: T.textMut, padding: "6px 10px 0" }}>{g.desc}</div>}
                      {resultActions(g, true)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* edit modal */}
      {editFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setEditFor(null); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 460, padding: 20, border: "1px solid " + T.brd }}>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>✏️ تعديل الصورة بالذكاء الاصطناعي</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10 }}>اكتب التعديل المطلوب — هيتطبّق على الصورة دي مباشرة (نفس القطعة).</div>
            <img src={editFor.url} alt="" style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid " + T.brd, marginBottom: 10 }} />
            <textarea value={editInstr} onChange={e => setEditInstr(e.target.value)} rows={3} placeholder="مثلاً: غيّر الخلفية لحديقة · خلّي الموديل بيبتسم · أضف حذاء أبيض" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 64, outline: "none", marginBottom: 12 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn ghost onClick={() => setEditFor(null)}>إلغاء</Btn>
              <Btn primary onClick={doEdit} disabled={busy || !editInstr.trim()}>✏️ طبّق التعديل (~‎${unitCost(tier, imageSize)})</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIStudioPg;
