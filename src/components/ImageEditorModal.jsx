/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ImageEditorModal.jsx (V21.27.21)
   ───────────────────────────────────────────────────────────────────────
   محرّر صور client شبه Canva — فوق الصورة المنتَجة:
   • طبقات نص: محتوى/خط/حجم/لون/Bold/Italic/محاذاة/ظل/حدود/شفافية.
   • طبقات صورة/لوجو: رفع أو لوجو الشركة — تحريك + تكبير + تدوير بالماوس.
   • تحريك (سحب) · تكبير (مقبض ركن) · تدوير (مقبض فوق) لأي طبقة.
   • ترتيب الطبقات (للأمام/للخلف) · تكرار · حذف.
   • تصدير PNG بدقة الصورة الأصلية (تحميل + حفظ في النتائج).

   ملاحظة CORS: الصورة بتتحمّل crossOrigin=anonymous عشان التصدير من canvas.
   لو الـ bucket مش مظبوط CORS، التصدير ممكن يفشل (بنعرض رسالة واضحة).
   ═══════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, useCallback } from "react";
import { Btn } from "./ui.jsx";
import { ImagePickButton } from "./DocumentImagePicker.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";

const FONTS = [
  { v: "Cairo, sans-serif", n: "Cairo · عربي" },
  { v: "Tajawal, sans-serif", n: "Tajawal · عربي" },
  { v: "Almarai, sans-serif", n: "Almarai · عربي" },
  { v: "'Noto Kufi Arabic', sans-serif", n: "Kufi · عربي" },
  { v: "'Reem Kufi', sans-serif", n: "Reem Kufi · عربي" },
  { v: "Amiri, serif", n: "Amiri · عربي" },
  { v: "Lalezar, system-ui", n: "Lalezar · عربي" },
  { v: "Poppins, sans-serif", n: "Poppins" },
  { v: "Montserrat, sans-serif", n: "Montserrat" },
  { v: "'Playfair Display', serif", n: "Playfair" },
  { v: "Oswald, sans-serif", n: "Oswald" },
  { v: "'Bebas Neue', system-ui", n: "Bebas Neue" },
  { v: "Lobster, system-ui", n: "Lobster" },
  { v: "Impact, sans-serif", n: "Impact" },
  { v: "Arial, sans-serif", n: "Arial" },
  { v: "Tahoma, sans-serif", n: "Tahoma" },
  { v: "Georgia, serif", n: "Georgia" },
  { v: "'Times New Roman', serif", n: "Times" },
];
const GFONTS_HREF = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Tajawal:wght@400;700&family=Almarai:wght@400;800&family=Noto+Kufi+Arabic:wght@400;700&family=Reem+Kufi&family=Amiri:wght@400;700&family=Lalezar&family=Poppins:wght@400;700&family=Montserrat:wght@400;700;800&family=Playfair+Display:wght@400;700&family=Oswald:wght@400;600&family=Bebas+Neue&family=Lobster&display=swap";

function loadImg(src, cross){
  return new Promise((resolve, reject) => {
    const im = new Image();
    if(cross) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("تعذّر تحميل الصورة"));
    im.src = src;
  });
}

let _gfonts = false;
function ensureFonts(){
  if(_gfonts || typeof document === "undefined") return;
  _gfonts = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = GFONTS_HREF; document.head.appendChild(l);
}

export function ImageEditorModal({ src, logoUrl, data, onClose, onSave }){
  const [ready, setReady] = useState(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });     /* الأبعاد الطبيعية */
  const [scale, setScale] = useState(1);
  const [layers, setLayers] = useState([]);
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const stageRef = useRef(null);
  const scaleRef = useRef(1);
  const gestureRef = useRef(null);
  const idRef = useRef(1);
  const nid = () => "L" + (idRef.current++);

  useEffect(() => { ensureFonts(); }, []);

  /* تحميل الصورة للعرض (من غير crossOrigin — بيشتغل دايماً) + حساب التحجيم.
     التصدير بيحمّل نسخة crossOrigin وقت الحفظ فقط (CORS لو لزم). */
  useEffect(() => {
    let alive = true;
    setErr(""); setReady(false);
    loadImg(src, false).then(im => {
      if(!alive) return;
      const w = im.naturalWidth || 1024, h = im.naturalHeight || 1024;
      setDims({ w, h }); setReady(true);
      const maxW = Math.min(720, (typeof window !== "undefined" ? window.innerWidth : 720) - 360);
      const maxH = (typeof window !== "undefined" ? window.innerHeight : 800) * 0.66;
      const s = Math.min(maxW / w, maxH / h, 1);
      setScale(s); scaleRef.current = s;
    }).catch(() => { if(alive) setErr("تعذّر تحميل الصورة"); });
    return () => { alive = false; };
  }, [src]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const sel = layers.find(l => l.id === selId) || null;
  const updSel = (patch) => setLayers(ls => ls.map(l => l.id === selId ? { ...l, ...patch } : l));

  /* ── إضافة طبقات ── */
  const addText = () => {
    const id = nid();
    setLayers(ls => [...ls, { id, type: "text", cx: dims.w / 2, cy: dims.h / 2, rot: 0, opacity: 1,
      text: "اكتب هنا", font: FONTS[0].v, size: Math.max(24, Math.round(dims.h * 0.07)), color: "#FFFFFF",
      bold: true, italic: false, align: "center", shadow: true, stroke: false, strokeColor: "#000000" }]);
    setSelId(id);
  };
  const addImageLayer = async (url) => {
    try {
      const im = await loadImg(url, false);
      const id = nid();
      const w = Math.round(dims.w * 0.28);
      setLayers(ls => [...ls, { id, type: "image", cx: dims.w / 2, cy: dims.h / 2, rot: 0, opacity: 1, url, w, aspect: (im.naturalWidth / im.naturalHeight) || 1 }]);
      setSelId(id);
    } catch(e){ showToast("⛔ تعذّر تحميل الصورة"); }
  };
  const onLogo = () => { if(logoUrl) addImageLayer(logoUrl); else showToast("⚠️ مفيش لوجو محفوظ — ارفع صورة"); };

  const removeLayer = (id) => { setLayers(ls => ls.filter(l => l.id !== id)); if(selId === id) setSelId(null); };
  const dupLayer = (id) => setLayers(ls => { const i = ls.findIndex(l => l.id === id); if(i < 0) return ls; const c = { ...ls[i], id: nid(), cx: ls[i].cx + dims.w * 0.04, cy: ls[i].cy + dims.h * 0.04 }; const n = [...ls]; n.splice(i + 1, 0, c); setSelId(c.id); return n; });
  const moveZ = (id, dir) => setLayers(ls => { const i = ls.findIndex(l => l.id === id); if(i < 0) return ls; const j = dir > 0 ? Math.min(ls.length - 1, i + 1) : Math.max(0, i - 1); if(i === j) return ls; const n = [...ls]; const [it] = n.splice(i, 1); n.splice(j, 0, it); return n; });

  /* ── الإيماءات (تحريك/تكبير/تدوير) عبر مستمعين على الويندو ── */
  const onMove = useCallback((e) => {
    const g = gestureRef.current; if(!g) return;
    const s = scaleRef.current;
    if(g.type === "move"){
      const dx = (e.clientX - g.sx) / s, dy = (e.clientY - g.sy) / s;
      setLayers(ls => ls.map(l => l.id === g.id ? { ...l, cx: g.scx + dx, cy: g.scy + dy } : l));
    } else if(g.type === "resize"){
      const dist = Math.hypot(e.clientX - g.ccx, e.clientY - g.ccy);
      const ratio = Math.max(0.05, dist / (g.startDist || 1));
      setLayers(ls => ls.map(l => { if(l.id !== g.id) return l; return l.type === "text" ? { ...l, size: Math.max(6, g.startSize * ratio) } : { ...l, w: Math.max(12, g.startSize * ratio) }; }));
    } else if(g.type === "rotate"){
      const ang = Math.atan2(e.clientY - g.ccy, e.clientX - g.ccx) * 180 / Math.PI;
      setLayers(ls => ls.map(l => l.id === g.id ? { ...l, rot: Math.round(g.startRot + (ang - g.startAng)) } : l));
    }
  }, []);
  const onUp = useCallback(() => { gestureRef.current = null; }, []);
  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [onMove, onUp]);

  const centerClient = (l) => { const r = stageRef.current.getBoundingClientRect(); return { x: r.left + l.cx * scaleRef.current, y: r.top + l.cy * scaleRef.current }; };
  const startMove = (e, l) => { e.stopPropagation(); setSelId(l.id); gestureRef.current = { type: "move", id: l.id, sx: e.clientX, sy: e.clientY, scx: l.cx, scy: l.cy }; };
  const startResize = (e, l) => { e.stopPropagation(); setSelId(l.id); const c = centerClient(l); gestureRef.current = { type: "resize", id: l.id, ccx: c.x, ccy: c.y, startDist: Math.hypot(e.clientX - c.x, e.clientY - c.y), startSize: l.type === "text" ? l.size : l.w }; };
  const startRotate = (e, l) => { e.stopPropagation(); setSelId(l.id); const c = centerClient(l); gestureRef.current = { type: "rotate", id: l.id, ccx: c.x, ccy: c.y, startAng: Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI, startRot: l.rot || 0 }; };

  /* ── التصدير ── */
  const buildBlob = async () => {
    if(document.fonts && document.fonts.ready){ try { await document.fonts.ready; } catch(_){} }
    /* تحميل crossOrigin وقت التصدير عشان canvas مايتلوّثش */
    const bi = await loadImg(src, true);
    const cache = {};
    for(const L of layers){ if(L.type === "image" && !cache[L.url]){ try { cache[L.url] = await loadImg(L.url, true); } catch(_){ cache[L.url] = null; } } }
    const cv = document.createElement("canvas"); cv.width = dims.w; cv.height = dims.h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(bi, 0, 0, dims.w, dims.h);
    for(const L of layers){
      ctx.save(); ctx.translate(L.cx, L.cy); ctx.rotate((L.rot || 0) * Math.PI / 180); ctx.globalAlpha = L.opacity != null ? L.opacity : 1;
      if(L.type === "text"){
        const lines = String(L.text || "").split("\n"); const fs = L.size; const lineH = fs * 1.25;
        ctx.font = (L.italic ? "italic " : "") + (L.bold ? "700 " : "400 ") + fs + "px " + L.font;
        ctx.textBaseline = "middle"; ctx.textAlign = L.align || "center";
        const widths = lines.map(ln => ctx.measureText(ln).width); const maxW = Math.max(1, ...widths);
        const total = lines.length * lineH;
        lines.forEach((ln, i) => {
          const y = -total / 2 + lineH / 2 + i * lineH;
          const x = L.align === "left" ? -maxW / 2 : L.align === "right" ? maxW / 2 : 0;
          if(L.shadow){ ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = fs * 0.14; ctx.shadowOffsetX = fs * 0.03; ctx.shadowOffsetY = fs * 0.06; }
          if(L.stroke){ ctx.lineWidth = Math.max(1, fs * 0.07); ctx.strokeStyle = L.strokeColor || "#000"; ctx.lineJoin = "round"; ctx.strokeText(ln, x, y); }
          ctx.fillStyle = L.color || "#fff"; ctx.fillText(ln, x, y);
          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        });
      } else if(L.type === "image" && cache[L.url]){
        const h = L.w / (L.aspect || 1);
        ctx.drawImage(cache[L.url], -L.w / 2, -h / 2, L.w, h);
      }
      ctx.restore();
    }
    return await new Promise((res, rej) => { try { cv.toBlob(b => b ? res(b) : rej(new Error("فشل التصدير")), "image/png"); } catch(e){ rej(e); } });
  };
  const onDownload = async () => { setBusy(true); try { const b = await buildBlob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "clark-edit-" + Date.now() + ".png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); showToast("✓ اتحمّلت الصورة"); } catch(e){ showToast("⛔ فشل التصدير — غالباً مشكلة CORS في الصورة"); } finally { setBusy(false); } };
  const onSaveClick = async () => { if(!onSave) return onDownload(); setBusy(true); try { const b = await buildBlob(); await onSave(b); } catch(e){ showToast("⛔ فشل الحفظ — غالباً CORS"); } finally { setBusy(false); } };

  /* ── واجهة ── */
  const dispW = dims.w * scale, dispH = dims.h * scale;
  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 700 };
  const handleDot = (cur) => ({ position: "absolute", width: 16, height: 16, borderRadius: "50%", background: "#fff", border: "2px solid " + T.accent, cursor: cur, boxShadow: "0 1px 4px rgba(0,0,0,0.4)", zIndex: 5 });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100080, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, direction: "rtl" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(1140px,100%)", maxHeight: "94vh", overflow: "hidden", border: "1px solid " + T.brd, boxShadow: "0 25px 80px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid " + T.brd, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: FS + 2, fontWeight: 900, color: T.accent }}>🎨 محرّر الصورة</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn small onClick={addText} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "33", fontWeight: 700 }}>➕ نص</Btn>
            {logoUrl && <Btn small onClick={onLogo} style={{ background: "#0EA5E912", color: "#0284C7", border: "1px solid #0EA5E933", fontWeight: 700 }}>🏷️ لوجو</Btn>}
            <ImagePickButton data={data} imagesOnly onFile={f => { const u = URL.createObjectURL(f); addImageLayer(u); }} onPickUrl={u => addImageLayer(u)}
              triggerStyle={{ display: "inline-block", padding: "6px 12px", borderRadius: 8, background: "#8B5CF612", color: "#8B5CF6", border: "1px solid #8B5CF633", fontWeight: 700, fontSize: FS - 2 }}>🖼️ صورة</ImagePickButton>
            <Btn small onClick={onDownload} disabled={busy} style={{ background: T.bg, color: T.text, border: "1px solid " + T.brd, fontWeight: 700 }}>⬇️ تحميل</Btn>
            <Btn small primary onClick={onSaveClick} disabled={busy}>{busy ? "⏳..." : "💾 حفظ"}</Btn>
            <Btn small ghost onClick={onClose}>✕</Btn>
          </div>
        </div>

        <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
          {/* Stage */}
          <div style={{ flex: 1, minWidth: 0, overflow: "auto", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelId(null)}>
            {err && <div style={{ position: "absolute", top: 70, color: "#fca5a5", fontSize: FS - 2, fontWeight: 700, background: "rgba(0,0,0,0.5)", padding: "6px 12px", borderRadius: 8 }}>⚠️ {err}</div>}
            {ready && <div ref={stageRef} onClick={e => e.stopPropagation()} style={{ position: "relative", width: dispW, height: dispH, flexShrink: 0, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", userSelect: "none", touchAction: "none" }}>
              <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
              {layers.map(l => {
                const isSel = l.id === selId;
                const common = { position: "absolute", left: l.cx * scale, top: l.cy * scale, transform: "translate(-50%,-50%) rotate(" + (l.rot || 0) + "deg)", cursor: "move", opacity: l.opacity != null ? l.opacity : 1, outline: isSel ? "2px solid " + T.accent : "1px dashed rgba(255,255,255,0.45)", outlineOffset: 2 };
                return <div key={l.id} onPointerDown={e => startMove(e, l)} style={common}>
                  {l.type === "text"
                    ? <div style={{ fontFamily: l.font, fontSize: l.size * scale, color: l.color, fontWeight: l.bold ? 700 : 400, fontStyle: l.italic ? "italic" : "normal", textAlign: l.align, whiteSpace: "pre", lineHeight: 1.25, textShadow: l.shadow ? "0 " + (l.size * scale * 0.06) + "px " + (l.size * scale * 0.14) + "px rgba(0,0,0,0.55)" : "none", WebkitTextStroke: l.stroke ? Math.max(1, l.size * scale * 0.07) + "px " + (l.strokeColor || "#000") : undefined, padding: "0 2px" }}>{l.text || "نص"}</div>
                    : <img src={l.url} alt="" draggable={false} style={{ width: l.w * scale, height: "auto", display: "block", pointerEvents: "none" }} />}
                  {isSel && <>
                    <div onPointerDown={e => startResize(e, l)} style={{ ...handleDot("nwse-resize"), insetInlineEnd: -8, bottom: -8 }} title="تكبير/تصغير" />
                    <div onPointerDown={e => startRotate(e, l)} style={{ ...handleDot("grab"), insetInlineStart: "50%", marginInlineStart: -8, top: -30 }} title="تدوير" />
                  </>}
                </div>;
              })}
            </div>}
            {!ready && !err && <div style={{ color: "#94a3b8", fontWeight: 700 }}>⏳ جاري تحميل الصورة...</div>}
          </div>

          {/* Inspector */}
          <div style={{ width: 300, flexShrink: 0, borderInlineStart: "1px solid " + T.brd, overflowY: "auto", padding: 14, background: T.cardSolid }}>
            {!sel ? <div style={{ fontSize: FS - 2, color: T.textMut, lineHeight: 1.9, textAlign: "center", padding: 20 }}>اختر طبقة لتعديلها، أو أضف نص/لوجو/صورة من فوق.<br />حرّكها بالسحب · مقبض الركن للتكبير · المقبض الأعلى للتدوير.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn small onClick={() => moveZ(sel.id, 1)} style={{ background: T.bg, border: "1px solid " + T.brd, color: T.textSec }} title="للأمام">⬆️</Btn>
                  <Btn small onClick={() => moveZ(sel.id, -1)} style={{ background: T.bg, border: "1px solid " + T.brd, color: T.textSec }} title="للخلف">⬇️</Btn>
                  <Btn small onClick={() => dupLayer(sel.id)} style={{ background: T.bg, border: "1px solid " + T.brd, color: T.textSec }} title="تكرار">⧉</Btn>
                  <Btn small onClick={() => removeLayer(sel.id)} style={{ background: T.err + "12", color: T.err, border: "1px solid " + T.err + "33" }} title="حذف">🗑</Btn>
                </div>
                {sel.type === "text" && <>
                  <div><label style={lbl}>النص</label><textarea value={sel.text} onChange={e => updSel({ text: e.target.value })} rows={2} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical" }} /></div>
                  <div><label style={lbl}>الخط</label><select value={sel.font} onChange={e => updSel({ font: e.target.value })} style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, background: T.bg, color: T.text }}>{FONTS.map(f => <option key={f.v} value={f.v} style={{ fontFamily: f.v }}>{f.n}</option>)}</select></div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1 }}><label style={lbl}>الحجم: {Math.round(sel.size)}</label><input type="range" min={Math.max(8, Math.round(dims.h * 0.01))} max={Math.round(dims.h * 0.4)} value={sel.size} onChange={e => updSel({ size: Number(e.target.value) })} style={{ width: "100%" }} /></div>
                    <div><label style={lbl}>اللون</label><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(sel.color) ? sel.color : "#ffffff"} onChange={e => updSel({ color: e.target.value })} style={{ width: 40, height: 30, border: "1px solid " + T.brd, borderRadius: 8, padding: 0, cursor: "pointer" }} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[["B", "bold"], ["I", "italic"], ["⌷ ظل", "shadow"], ["A̲ حد", "stroke"]].map(([t, k]) => <Btn key={k} small onClick={() => updSel({ [k]: !sel[k] })} style={{ background: sel[k] ? T.accent : T.bg, color: sel[k] ? "#fff" : T.textSec, border: "1px solid " + (sel[k] ? T.accent : T.brd), fontWeight: 800 }}>{t}</Btn>)}
                  </div>
                  {sel.stroke && <div><label style={lbl}>لون الحد</label><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(sel.strokeColor) ? sel.strokeColor : "#000000"} onChange={e => updSel({ strokeColor: e.target.value })} style={{ width: 40, height: 30, border: "1px solid " + T.brd, borderRadius: 8, padding: 0, cursor: "pointer" }} /></div>}
                  <div style={{ display: "flex", gap: 6 }}>{[["⟮ يمين", "right"], ["▤ وسط", "center"], ["يسار ⟯", "left"]].map(([t, a]) => <Btn key={a} small onClick={() => updSel({ align: a })} style={{ flex: 1, background: sel.align === a ? T.accent : T.bg, color: sel.align === a ? "#fff" : T.textSec, border: "1px solid " + (sel.align === a ? T.accent : T.brd) }}>{t}</Btn>)}</div>
                </>}
                {sel.type === "image" && <>
                  <div><label style={lbl}>الحجم: {Math.round((sel.w / dims.w) * 100)}%</label><input type="range" min={Math.round(dims.w * 0.03)} max={dims.w} value={sel.w} onChange={e => updSel({ w: Number(e.target.value) })} style={{ width: "100%" }} /></div>
                </>}
                <div><label style={lbl}>الدوران: {Math.round(sel.rot || 0)}°</label><input type="range" min={-180} max={180} value={sel.rot || 0} onChange={e => updSel({ rot: Number(e.target.value) })} style={{ width: "100%" }} /></div>
                <div><label style={lbl}>الشفافية: {Math.round((sel.opacity != null ? sel.opacity : 1) * 100)}%</label><input type="range" min={0} max={1} step={0.05} value={sel.opacity != null ? sel.opacity : 1} onChange={e => updSel({ opacity: Number(e.target.value) })} style={{ width: "100%" }} /></div>
              </div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageEditorModal;
