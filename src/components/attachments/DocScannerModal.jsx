/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocScannerModal.jsx (V21.27.61)
   ───────────────────────────────────────────────────────────────────────
   سكانر مستندات client زي «كاميرا سكانر»:
     1) قصّ بالزوايا الأربعة (perspective) — اسحب كل زاوية على حواف الورقة.
     2) تصحيح المنظور (dewarp) → صورة مستوية.
     3) فلاتر تحسين الوضوح: أصلي / تلقائي (auto-levels) / رمادي / أبيض-وأسود
        (Otsu) + سطوع/تباين.
     4) حفظ النتيجة → onSave(blob) (المستدعي بيرفعها كمرفق جديد، الأصل بيفضل).

   CORS: الصورة بتتحمّل عبر /api/img-proxy عشان canvas.getImageData مايتلوّثش
   (نفس آلية ImageEditorModal).
   ═══════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, useCallback } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { showToast } from "../../utils/popups.js";
import { dewarp, suggestOutputSize, applyDocFilter } from "../../utils/imageScan.js";

const MAX_BASE = 2200; /* أقصى بُعد للـ canvas المصدر (ذاكرة/أداء) */

function loadImg(src, cross){
  return new Promise((resolve, reject) => {
    const im = new Image();
    if(cross) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("تعذّر تحميل الصورة"));
    im.src = src;
  });
}
const proxify = (u) => (/^https?:/i.test(u) ? ("/api/img-proxy?url=" + encodeURIComponent(u)) : u);

const FILTERS = [
  { k: "auto", n: "✨ تلقائي" },
  { k: "bw", n: "📄 أبيض وأسود" },
  { k: "gray", n: "🌫️ رمادي" },
  { k: "none", n: "🎨 أصلي" },
];

export function DocScannerModal({ src, fileName, onClose, onSave }){
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState("edit");        /* edit | preview */
  const [corners, setCorners] = useState(null);    /* [TL,TR,BR,BL] بإحداثيات baseCanvas */
  const [scale, setScale] = useState(1);
  const [filter, setFilter] = useState("auto");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const baseRef = useRef(null);      /* canvas المصدر (CORS-clean) */
  const dewarpRef = useRef(null);    /* canvas بعد تصحيح المنظور (قبل الفلتر) */
  const dragRef = useRef(null);      /* { idx } */
  const baseDims = baseRef.current ? { w: baseRef.current.width, h: baseRef.current.height } : { w: 0, h: 0 };

  /* تحميل الصورة → baseCanvas + زوايا افتراضية (هامش 6%). */
  useEffect(() => {
    let alive = true;
    setErr(""); setReady(false);
    loadImg(proxify(src), true).then(im => {
      if(!alive) return;
      let w = im.naturalWidth || 1024, h = im.naturalHeight || 1024;
      const m = Math.max(w, h);
      const s = m > MAX_BASE ? MAX_BASE / m : 1;
      w = Math.round(w * s); h = Math.round(h * s);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.drawImage(im, 0, 0, w, h);
      /* اختبار إن canvas مش tainted */
      try { ctx.getImageData(0, 0, 1, 1); } catch(e){ setErr("تعذّر قراءة الصورة (CORS) — حاول تاني"); return; }
      baseRef.current = cv;
      const mx = w * 0.06, my = h * 0.06;
      setCorners([{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }]);
      fitStage(w, h);
      setReady(true);
    }).catch(() => { if(alive) setErr("تعذّر تحميل الصورة"); });
    return () => { alive = false; };
  }, [src]);

  const fitStage = (w, h) => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxW = Math.max(260, vw * 0.92 - (vw > 820 ? 40 : 0));
    const maxH = vh * 0.62;
    setScale(Math.min(maxW / w, maxH / h, 1));
  };

  /* سحب الزوايا */
  const onMove = useCallback((e) => {
    const g = dragRef.current; if(!g || !baseRef.current) return;
    const rect = g.stageRect;
    const s = g.scale;
    let x = (e.clientX - rect.left) / s, y = (e.clientY - rect.top) / s;
    x = Math.max(0, Math.min(baseRef.current.width, x));
    y = Math.max(0, Math.min(baseRef.current.height, y));
    setCorners(cs => cs.map((c, i) => i === g.idx ? { x, y } : c));
  }, []);
  const onUp = useCallback(() => { dragRef.current = null; }, []);
  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [onMove, onUp]);

  const stageWrapRef = useRef(null);
  const startDrag = (e, idx) => {
    e.stopPropagation(); e.preventDefault();
    const el = stageWrapRef.current; if(!el) return;
    dragRef.current = { idx, stageRect: el.getBoundingClientRect(), scale };
  };

  const rotate90 = () => {
    const cv = baseRef.current; if(!cv) return;
    const w = cv.width, h = cv.height;
    const out = document.createElement("canvas");
    out.width = h; out.height = w;
    const ctx = out.getContext("2d");
    ctx.translate(h / 2, w / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(cv, -w / 2, -h / 2);
    baseRef.current = out;
    const mx = out.width * 0.06, my = out.height * 0.06;
    setCorners([{ x: mx, y: my }, { x: out.width - mx, y: my }, { x: out.width - mx, y: out.height - my }, { x: mx, y: out.height - my }]);
    fitStage(out.width, out.height);
  };
  const resetCorners = () => {
    const cv = baseRef.current; if(!cv) return;
    setCorners([{ x: 0, y: 0 }, { x: cv.width, y: 0 }, { x: cv.width, y: cv.height }, { x: 0, y: cv.height }]);
  };

  /* تصحيح المنظور → cache في dewarpRef، ثم فلتر → preview */
  const buildPreview = (mode, br, ct) => {
    const dw = dewarpRef.current; if(!dw) return;
    const work = document.createElement("canvas");
    work.width = dw.width; work.height = dw.height;
    work.getContext("2d").drawImage(dw, 0, 0);
    applyDocFilter(work, mode, { brightness: br, contrast: ct });
    dewarpRef.current._work = work;
    setPreviewUrl(work.toDataURL("image/jpeg", 0.92));
  };
  const applyScan = () => {
    if(!baseRef.current || !corners) return;
    setBusy(true);
    /* نأجّل شوية عشان الـ spinner يظهر قبل العملية الثقيلة */
    setTimeout(() => {
      try {
        const sz = suggestOutputSize(corners, 1600);
        dewarpRef.current = dewarp(baseRef.current, corners, sz.w, sz.h);
        buildPreview(filter, brightness, contrast);
        setStep("preview");
      } catch(e){ showToast("⛔ تعذّر المعالجة"); }
      finally { setBusy(false); }
    }, 30);
  };
  /* تغيير الفلتر/السطوع/التباين في وضع المعاينة — رخيص (على الـ dewarp المخزّن) */
  const setFilterLive = (mode) => { setFilter(mode); if(step === "preview") buildPreview(mode, brightness, contrast); };
  const setBriLive = (v) => { setBrightness(v); if(step === "preview") buildPreview(filter, v, contrast); };
  const setConLive = (v) => { setContrast(v); if(step === "preview") buildPreview(filter, brightness, v); };

  const save = async () => {
    const work = dewarpRef.current && dewarpRef.current._work;
    if(!work){ showToast("⚠️ اعمل معالجة الأول"); return; }
    setBusy(true);
    try {
      const blob = await new Promise((res, rej) => work.toBlob(b => b ? res(b) : rej(new Error("فشل")), "image/jpeg", 0.92));
      await onSave(blob);
    } catch(e){ showToast("⛔ فشل الحفظ"); }
    finally { setBusy(false); }
  };

  const dispW = baseDims.w * scale, dispH = baseDims.h * scale;
  const handle = (cur) => ({ position: "absolute", width: 26, height: 26, marginInlineStart: -13, marginTop: -13, borderRadius: "50%", background: "rgba(46,123,237,0.25)", border: "3px solid " + T.accent, cursor: cur, touchAction: "none", boxShadow: "0 1px 6px rgba(0,0,0,0.5)", zIndex: 5 });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100090, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 10, direction: "rtl" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "fit-content", maxWidth: "98vw", maxHeight: "96vh", overflow: "hidden", border: "1px solid " + T.brd, boxShadow: "0 25px 80px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid " + T.brd, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: FS + 2, fontWeight: 900, color: T.accent }}>🪄 سكانر المستند {step === "preview" && <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>· المعاينة</span>}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {step === "edit" && <>
              <Btn small onClick={rotate90} style={{ background: T.bg, border: "1px solid " + T.brd, color: T.textSec, fontWeight: 700 }} title="تدوير 90°">🔄 تدوير</Btn>
              <Btn small onClick={resetCorners} style={{ background: T.bg, border: "1px solid " + T.brd, color: T.textSec, fontWeight: 700 }} title="الصورة كاملة">⛶ الكل</Btn>
              <Btn small primary onClick={applyScan} disabled={busy || !ready}>{busy ? "⏳..." : "تطبيق ◀"}</Btn>
            </>}
            {step === "preview" && <>
              <Btn small onClick={() => setStep("edit")} style={{ background: T.bg, border: "1px solid " + T.brd, color: T.textSec, fontWeight: 700 }}>▶ رجوع للقص</Btn>
              <Btn small primary onClick={save} disabled={busy}>{busy ? "⏳..." : "💾 حفظ كمرفق"}</Btn>
            </>}
            <Btn small ghost onClick={onClose}>✕</Btn>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: "auto", padding: 14, background: "#0f172a", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, minHeight: 200 }}>
          {err && <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: FS - 1, padding: 30 }}>⚠️ {err}</div>}
          {!err && !ready && <div style={{ color: "#94a3b8", fontWeight: 700, padding: 40 }}>⏳ جاري تحميل الصورة...</div>}

          {/* خطوة القص */}
          {ready && step === "edit" && (
            <>
              <div style={{ color: "#cbd5e1", fontSize: FS - 2, fontWeight: 600 }}>اسحب الزوايا الأربعة على حواف الورقة، وبعدين «تطبيق».</div>
              <div ref={stageWrapRef} style={{ position: "relative", width: dispW, height: dispH, flexShrink: 0, touchAction: "none", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
                <img src={baseRef.current.toDataURL("image/jpeg", 0.92)} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none", userSelect: "none" }} />
                {corners && <svg width={dispW} height={dispH} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  <polygon points={corners.map(c => (c.x * scale) + "," + (c.y * scale)).join(" ")} fill="rgba(46,123,237,0.12)" stroke={T.accent} strokeWidth={2} />
                </svg>}
                {corners && corners.map((c, i) => (
                  <div key={i} onPointerDown={e => startDrag(e, i)} style={{ ...handle("grab"), left: c.x * scale, top: c.y * scale }} />
                ))}
              </div>
            </>
          )}

          {/* خطوة المعاينة */}
          {ready && step === "preview" && (
            <>
              {previewUrl && <img src={previewUrl} alt="" style={{ maxWidth: "100%", maxHeight: "52vh", objectFit: "contain", background: "#fff", borderRadius: 6, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {FILTERS.map(f => <Btn key={f.k} small onClick={() => setFilterLive(f.k)} style={{ background: filter === f.k ? T.accent : "rgba(255,255,255,0.12)", color: filter === f.k ? "#fff" : "#e2e8f0", border: "1px solid " + (filter === f.k ? T.accent : "rgba(255,255,255,0.2)"), fontWeight: 700 }}>{f.n}</Btn>)}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", color: "#cbd5e1", fontSize: FS - 2 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 150 }}>السطوع: {brightness}
                  <input type="range" min={-100} max={100} value={brightness} onChange={e => setBriLive(Number(e.target.value))} /></label>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 150 }}>التباين: {contrast}
                  <input type="range" min={-100} max={100} value={contrast} onChange={e => setConLive(Number(e.target.value))} /></label>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocScannerModal;
