/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PromptExtractModal.jsx (V21.27.13)
   ───────────────────────────────────────────────────────────────────────
   رفع مجموعة صور وقفات → استخراج «برومبت» لكل صورة (Gemini vision) → preview
   قابل للتعديل → حفظ في مكتبة البرومبتس بالصورة (cfg.aiStudioPresets.savedPrompts).
   ═══════════════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { Btn } from "./ui.jsx";
import { ImagePickButton } from "./DocumentImagePicker.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";
import { describeImage } from "../utils/aiImageClient.js";
import { uploadImageToStorage } from "../utils/imageStorage.js";

/* تصغير الصورة لـ base64 (vision مايحتاجش دقة عالية + يقلّل حجم الطلب) */
function fileToResizedBase64(file, maxDim = 1280, quality = 0.85){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if(Math.max(w, h) > maxDim){ const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL("image/jpeg", quality);
      resolve({ dataUrl, base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذّر قراءة الصورة")); };
    img.src = url;
  });
}

export function PromptExtractModal({ data, onClose, onSavePrompts }){
  const [items, setItems] = useState([]); /* {id,name,prompt,image,thumb,status,error} */
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(""); /* نص التقدّم */

  const upd = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  const mkId = (i) => "ex_" + Date.now().toString(36) + "_" + i + "_" + Math.random().toString(36).slice(2, 5);

  /* من الكمبيوتر — File[] → resize → base64 → describe → رفع للمكتبة */
  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => (f.type || "").startsWith("image/"));
    if(files.length === 0) return;
    setBusy(true);
    const fresh = files.map((f, i) => ({ id: mkId(i), name: "", prompt: "", image: "", thumb: "", status: "pending", error: "" }));
    setItems(prev => [...prev, ...fresh]);
    for(let i = 0; i < files.length; i++){
      const f = files[i]; const it = fresh[i];
      setProgress("بيحلّل صورة " + (i + 1) + " من " + files.length + "...");
      try {
        const { dataUrl, base64, mimeType } = await fileToResizedBase64(f);
        upd(it.id, { thumb: dataUrl });
        const r = await describeImage({ imageBase64: base64, mimeType });
        if(!r.ok){ upd(it.id, { status: "error", error: r.error || "فشل التحليل" }); continue; }
        /* رفع الصورة الأصلية للمكتبة (URL ثابت) — best effort */
        let url = "";
        try { const up = await uploadImageToStorage("ai-prompt-thumbs", "pose", f); url = up.url; }
        catch(e){ console.warn("[PromptExtract] upload failed:", e); }
        upd(it.id, { status: "done", name: r.name || ("وقفة " + (i + 1)), prompt: r.prompt || "", image: url || dataUrl });
      } catch(e){
        upd(it.id, { status: "error", error: (e && e.message) || "خطأ" });
      }
    }
    setProgress(""); setBusy(false);
  };

  /* من مساحة التخزين — records (downloadURL) → describe (السيرفر بيجيب الصورة) */
  const onPickDocs = async (recs) => {
    const list = (recs || []).map(r => ({ url: r.downloadURL || r.url, name: r.name || "" })).filter(x => x.url);
    if(list.length === 0) return;
    setBusy(true);
    const fresh = list.map((x, i) => ({ id: mkId(i), name: "", prompt: "", image: x.url, thumb: x.url, status: "pending", error: "" }));
    setItems(prev => [...prev, ...fresh]);
    for(let i = 0; i < list.length; i++){
      const x = list[i]; const it = fresh[i];
      setProgress("بيحلّل صورة " + (i + 1) + " من " + list.length + "...");
      try {
        const r = await describeImage({ imageUrl: x.url });
        if(!r.ok){ upd(it.id, { status: "error", error: r.error || "فشل التحليل" }); continue; }
        upd(it.id, { status: "done", name: r.name || ("وقفة " + (i + 1)), prompt: r.prompt || "", image: x.url });
      } catch(e){
        upd(it.id, { status: "error", error: (e && e.message) || "خطأ" });
      }
    }
    setProgress(""); setBusy(false);
  };

  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id));
  const doneItems = items.filter(it => it.status === "done" && (it.prompt || "").trim());

  const saveAll = () => {
    const valid = doneItems.filter(it => (it.name || "").trim() && (it.prompt || "").trim());
    if(valid.length === 0){ showToast("⚠️ مفيش برومبتس جاهزة للحفظ"); return; }
    onSavePrompts(valid.map(it => ({ name: it.name.trim(), prompt: it.prompt.trim(), image: it.image || "" })));
    onClose && onClose();
  };

  return (
    <div onClick={() => !busy && onClose && onClose()} style={{ position: "fixed", inset: 0, zIndex: 100050, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(720px,100%)", maxHeight: "90vh", overflowY: "auto", border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: FS + 3, fontWeight: 900, color: T.accent }}>🪄 استخراج برومبتس من صور الوقفات</div>
          <Btn ghost onClick={() => !busy && onClose && onClose()}>✕</Btn>
        </div>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12, lineHeight: 1.7 }}>ارفع صور وقفات، والبرنامج يطلّع لكل صورة برومبت كامل (وقفة/إطار/إضاءة/خلفية/مود). راجع وعدّل، وبعدها احفظ الكل في مكتبة البرومبتس بالصور.</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <ImagePickButton data={data} multiple imagesOnly onFiles={onFiles} onPickMany={onPickDocs} disabled={busy}
            triggerStyle={{ display: "inline-block", padding: "9px 16px", borderRadius: 8, background: T.accent, color: "#fff", fontWeight: 800, fontSize: FS - 1, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "⏳ " + (progress || "بيشتغل...") : "📥 اختر صور الوقفات (كمبيوتر / مساحة التخزين)"}
          </ImagePickButton>
          {items.length > 0 && <span style={{ fontSize: FS - 2, color: T.textMut }}>{doneItems.length + " جاهز · " + items.length + " إجمالي"}</span>}
        </div>

        {items.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 14 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: "flex", gap: 10, padding: 10, borderRadius: 12, border: "1px solid " + (it.status === "error" ? T.err + "50" : T.brd), background: T.bg }}>
              <div style={{ width: 74, height: 96, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: T.cardSolid, border: "1px solid " + T.brd, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {it.thumb ? <img src={it.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22 }}>🖼️</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {it.status === "pending" ? <div style={{ fontSize: FS - 1, color: T.textMut, fontWeight: 700 }}>⏳ بيحلّل...</div>
                  : it.status === "error" ? <div style={{ fontSize: FS - 1, color: T.err, fontWeight: 700 }}>⛔ {it.error}</div>
                  : <>
                    <input value={it.name} onChange={e => upd(it.id, { name: e.target.value })} placeholder="اسم الوقفة" style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid " + T.brd, fontSize: FS - 1, fontWeight: 700, fontFamily: "inherit", background: T.cardSolid, color: T.text }} />
                    <textarea value={it.prompt} onChange={e => upd(it.id, { prompt: e.target.value })} dir="ltr" rows={3} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid " + T.brd, fontSize: FS - 2, fontFamily: "inherit", background: T.cardSolid, color: T.text, resize: "vertical", lineHeight: 1.5 }} />
                  </>}
              </div>
              <Btn small ghost onClick={() => removeItem(it.id)} title="حذف" style={{ color: T.err, alignSelf: "flex-start" }}>🗑</Btn>
            </div>
          ))}
        </div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid " + T.brd, paddingTop: 14 }}>
          <Btn ghost disabled={busy} onClick={() => onClose && onClose()}>إغلاق</Btn>
          <Btn primary disabled={busy || doneItems.length === 0} onClick={saveAll}>💾 حفظ الكل ({doneItems.length})</Btn>
        </div>
      </div>
    </div>
  );
}

export default PromptExtractModal;
