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

import { useState, useMemo, useEffect, useRef } from "react";
import { Btn, Sel, Inp, SearchSel, BlockingOverlay } from "../components/ui.jsx";
import { ImagePickButton } from "../components/DocumentImagePicker.jsx";
import { T } from "../theme.js";
import { FS, FKEYS } from "../constants/index.js";
import { ask, showToast, askInput } from "../utils/popups.js";
import { uploadImageToStorage, deleteStorageImage } from "../utils/imageStorage.js";
import { generateModelImage, analyzePrompt } from "../utils/aiImageClient.js";
import { PromptExtractModal } from "../components/PromptExtractModal.jsx";
import { ImageLinkModal } from "../components/ImageLinkModal.jsx";
import {
  AR_RATIOS, IMAGE_SIZES, TIERS, SHOT_TYPES, GENDERS, EXPRESSIONS, CHILD_AGES, FRAMINGS,
  SKIN_TONES, LIGHTINGS, CAMERA_PRESETS, CAM_STYLES, REALISM_LEVELS,
  COVER_STYLES, mergePresets, buildStudioPrompt, buildEditPrompt, buildCoverPrompt,
  buildRealismSuffix, cameraPromptOf, stylePromptOf, describeStudioOptions,
  LOGO_POSITIONS, LOGO_SIZES, buildLogoPrompt, SCENERY_BACKGROUNDS, QUICK_EDITS, FOOTWEAR_CLAUSE,
} from "../utils/aiStudioPresets.js";
import { LIBRARY_GROUPS, loadPromptLibrary, savePromptGroup, seedPromptLibrary } from "../utils/aiPromptLibrary.js";
import { loadSessionIndex, loadSession as loadSessionDoc, saveSession as saveSessionDoc, deleteSession as deleteSessionDoc } from "../utils/aiStudioSessions.js";

/* رسم توضيحي مبسّط لتأثير العدسة (عمق الميدان/الخلفية) */
function CamDiagram({ type, on }){
  const s = on ? "#fff" : "#94a3b8";
  const figure = <g fill="none" stroke={s} strokeWidth="2.2"><circle cx="32" cy="15" r="5" /><path d="M23 39 q9 -17 18 0" /></g>;
  let scene = null;
  if(type === "bokeh") scene = <g fill={s}><circle cx="14" cy="19" r="9" opacity="0.18" /><circle cx="50" cy="15" r="11" opacity="0.13" /><circle cx="46" cy="33" r="7" opacity="0.2" /></g>;
  else if(type === "balanced") scene = <g fill={s}><circle cx="13" cy="18" r="6" opacity="0.16" /><circle cx="51" cy="20" r="6" opacity="0.16" /></g>;
  else if(type === "wide") scene = <g stroke={s} strokeWidth="1.5" fill="none" opacity="0.45"><line x1="4" y1="40" x2="60" y2="40" /><rect x="6" y="22" width="8" height="16" /><rect x="50" y="20" width="8" height="18" /></g>;
  else if(type === "film") scene = <g fill={s} opacity="0.45">{[[10,10],[52,12],[14,34],[50,33],[30,8],[8,24],[56,26],[36,38]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.3" />)}</g>;
  else if(type === "deep") scene = <g stroke={s} strokeWidth="1" opacity="0.3">{[12,24,40,52].map(x=><line key={x} x1={x} y1="6" x2={x} y2="40" />)}</g>;
  return (
    <svg viewBox="0 0 64 46" width="58" height="42" style={{ borderRadius: 8, background: on ? T.accent : T.bg, border: "1px solid " + (on ? T.accent : T.brd), flexShrink: 0 }}>
      {type === "auto"
        ? <text x="32" y="30" textAnchor="middle" fontSize="20" fontWeight="800" fill={s}>A</text>
        : <>{scene}{figure}</>}
    </svg>
  );
}

/* رسم بسيط لشكل الصورة حسب نسبة الأبعاد (طولي/أفقي/مربّع) — preview جانبي */
function ARDiagram({ ratio, on }){
  const parts = String(ratio).split(":").map(Number);
  const W = parts[0] || 1, H = parts[1] || 1;
  const box = 32, max = 24;
  let rw, rh;
  if(W >= H){ rw = max; rh = max * H / W; } else { rh = max; rw = max * W / H; }
  const x = (box - rw) / 2, y = (box - rh) / 2;
  const stroke = on ? T.accent : T.textMut;
  return (
    <svg width={box} height={box} viewBox={"0 0 " + box + " " + box} style={{ flexShrink: 0 }}>
      <rect x={x} y={y} width={rw} height={rh} rx="2.5" fill={on ? T.accent + "22" : "transparent"} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
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

/* V21.26.18: نسبة أبعاد الصورة من الميتاداتا (تقدير أوّلي قبل تحميل الصورة).
   portrait/مربّع → عمود واحد (صورتين في الصف)؛ landscape → عرض كامل. */
function arInfo(ar){
  const p = String(ar || "3:4").split(":");
  const w = Number(p[0]) || 3, h = Number(p[1]) || 4;
  return { css: w + " / " + h, portrait: h >= w };
}

/* V21.26.18: كارت نتيجة — يقيس أبعاد الصورة الفعلية عند التحميل فيلغي المساحة
   السوداء (objectFit:cover مع نسبة أبعاد مطابقة)، والـ landscape بياخد عرض
   كامل (gridColumn 1/-1) بينما الطولي بياخد عمود واحد → صورتين جنب بعض.
   مُعرّف على مستوى الموديول (مش جوّا الصفحة) عشان حالة القياس متتفقدش مع كل
   re-render للأب. */
function ResultCard({ res, isMob, onDelete, onZoom, children }){
  const init = arInfo(res.aspectRatio);
  const [css, setCss] = useState(init.css);
  const [portrait, setPortrait] = useState(init.portrait);
  const onLoad = (e) => {
    const w = e.target.naturalWidth, h = e.target.naturalHeight;
    if(w > 0 && h > 0){ setCss(w + " / " + h); setPortrait(h > w); }
  };
  const fullW = !isMob && !portrait;   /* أفقي → عرض كامل */
  const ovBtn = (bg, color) => ({ width: 30, height: 30, borderRadius: "50%", background: bg, color, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" });
  return (
    <div style={{ gridColumn: fullW ? "1 / -1" : "auto", border: "1px solid " + T.brd, borderRadius: 12, overflow: "hidden", background: T.bg, position: "relative" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: css, background: T.cardSolid }}>
        <img src={res.url} alt="" loading="lazy" onLoad={onLoad} onClick={() => onZoom && onZoom(res)} title="اضغط لعرض الصورة بكامل الجودة" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "zoom-in" }} />
        <div style={{ position: "absolute", top: 6, insetInlineEnd: 6, display: "flex", gap: 6 }}>
          {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(res); }} title="حذف الصورة من النتائج والتخزين" style={ovBtn("rgba(0,0,0,0.55)", "#fff")}>🗑</button>}
        </div>
      </div>
      {res.desc && <div style={{ fontSize: FS - 3, color: T.textMut, padding: "6px 10px 0" }}>{res.desc}</div>}
      {children}
    </div>
  );
}

export function AIStudioPg({ model, models, data, upConfig, user, isMob, replaceModel, updOrder, onClose }){
  const lib = useMemo(() => mergePresets(data), [data]);

  const [curModel, setCurModel] = useState(model || null);
  const [sources, setSources] = useState(() => modelImages(model || null).slice(0, 1));
  const [tier, setTier] = useState("pro");
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [imageSize, setImageSize] = useState("1K");
  const [shotType, setShotType] = useState("model");
  const [genderId, setGenderId] = useState("boy");
  const [expressionId, setExpressionId] = useState("smile"); /* افتراضي ابتسامة */
  const [ageId, setAgeId] = useState("a4_6");
  const [poseId, setPoseId] = useState("front");
  const [backgroundId, setBackgroundId] = useState("studio_white");
  const [framingId, setFramingId] = useState("full");
  const [skinToneId, setSkinToneId] = useState("any");
  const [lightingId, setLightingId] = useState("soft");
  const [notes, setNotes] = useState("");
  const [realismOn, setRealismOn] = useState(true);
  const [realismLevel, setRealismLevel] = useState("medium");
  const [cameraId, setCameraId] = useState("dslr85");
  const [camStyle, setCamStyle] = useState("pro");
  const [storageFolder, setStorageFolder] = useState((model && model.modelNo) || "");
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
  const [genTotal, setGenTotal] = useState(1);   /* نسبة تقدّم التوليد */
  const [genDone, setGenDone] = useState(0);
  const [genPct, setGenPct] = useState(0);
  const [editFor, setEditFor] = useState(null);
  const [imgZoom, setImgZoom] = useState(null); /* {url, desc} — عرض الصورة بكامل الجودة */
  const [editInstr, setEditInstr] = useState("");
  const [showLib, setShowLib] = useState(false);
  const [newPose, setNewPose] = useState({ label: "", prompt: "" });
  const [newBg, setNewBg] = useState({ label: "", prompt: "" });
  const [tplName, setTplName] = useState("");
  const [spForm, setSpForm] = useState(null); /* {name,prompt,image} | null — إضافة برومبت جاهز */
  const [extractOpen, setExtractOpen] = useState(false); /* V21.27.13: استخراج برومبتس من صور */
  /* مكتبة برومبتس تجربة الملابس (factory/aiPromptLibrary_*) — lazy + editable */
  const [library, setLibrary] = useState(null);     /* { [group]: prompt[] } | null=بيحمّل */
  const [libErr, setLibErr] = useState("");
  const [libBusy, setLibBusy] = useState("");        /* رسالة أثناء seed/save | "" */
  const [openGroup, setOpenGroup] = useState("");    /* الجروب المفتوح حالياً */
  const [libEditFor, setLibEditFor] = useState(null);/* {group,id?,name,prompt,image} | null */
  /* هيستوري الجلسات (مشترك على المصنع) — lazy */
  const [sessionList, setSessionList] = useState(null); /* الفهرس | null=بيحمّل */
  const [showHistory, setShowHistory] = useState(false);
  const sessionIdRef = useRef(null);                    /* id الجلسة الحالية (upsert) */
  const sessSaveTimer = useRef(null);
  const [showUsage, setShowUsage] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [coverFor, setCoverFor] = useState(null); /* {res} */
  const [coverForm, setCoverForm] = useState({ styleId: "none", magName: "CLARK", withModelNo: true, withLogo: true, extra: "" });
  const [logoFor, setLogoFor] = useState(null); /* {res} — إدراج لوجو */
  const [linkFor, setLinkFor] = useState(null); /* V21.26.20: {res} — ربط الصورة بموديل من قايمة بالرقم */
  const [linkTab, setLinkTab] = useState("model"); /* V21.26.25: model | order */
  const [linkOrderId, setLinkOrderId] = useState(null); /* الأمر المختار في تبويب الأوامر (لاختيار اللون) */
  const [logoForm, setLogoForm] = useState({ logoUrl: "", position: "top-right", size: "small" });
  const [autoSave, setAutoSave] = useState(true);
  const [savedIds, setSavedIds] = useState(() => new Set());
  /* V21.26.18: تثبيت نتائج (تفضل فوق لحد ما المستخدم يخلّص شغله عليها) */
  /* V21.26.22: تثبيت «صورة المصدر/العينة» — بتتحفظ في localStorage فتفضل
     موجودة لو قفلت وفتحت الاستوديو من غير رفع تاني (الروابط من Storage ثابتة). */
  const PIN_SRC_KEY = "clark_ai_pinned_sources";
  const loadPinnedSrc = () => { try { const a = JSON.parse(localStorage.getItem(PIN_SRC_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string" && x) : []; } catch(_e){ return []; } };
  const [pinnedSrc, setPinnedSrc] = useState(loadPinnedSrc);
  const savePinnedSrc = (arr) => { try { localStorage.setItem(PIN_SRC_KEY, JSON.stringify(arr.slice(0, 5))); } catch(_e){} };
  const togglePinSrc = (url) => setPinnedSrc(prev => {
    const has = prev.includes(url);
    const next = has ? prev.filter(u => u !== url) : [...prev, url].slice(0, 5);
    savePinnedSrc(next);
    if(!has) setSources(s => s.includes(url) ? s : [...s, url].slice(0, 5)); /* اظهرها فوراً */
    return next;
  });
  /* استرجاع العينات المثبّتة عند فتح الاستوديو (مرة واحدة) — من غير رفع تاني */
  useEffect(() => {
    if(!pinnedSrc.length) return;
    setSources(s => { const m = s.slice(); for(const u of pinnedSrc) if(!m.includes(u)) m.push(u); return m.slice(0, 5); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* إجماليات الاستهلاك المحفوظة (يومي/شهري + لكل موديل + ميزانية) */
  const budget = Number(data.aiStudioBudget) || 0;
  const usage = useMemo(() => {
    const u = data.aiStudioUsage || {};
    const days = u.days || {};
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    let tC = 0, tCost = 0, mC = 0, mCost = 0;
    Object.entries(days).forEach(([k, v]) => {
      const c = (v && v.count) || 0, co = (v && v.cost) || 0;
      if(k === today){ tC += c; tCost += co; }
      if(k.startsWith(month)){ mC += c; mCost += co; }
    });
    const models = Object.entries(u.models || {}).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.cost || 0) - (a.cost || 0));
    return { today: { count: tC, cost: Math.round(tCost * 100) / 100 }, month: { count: mC, cost: Math.round(mCost * 100) / 100 }, models };
  }, [data.aiStudioUsage]);

  const recordUsage = (n, cost) => {
    if(!n) return;
    const today = new Date().toISOString().slice(0, 10);
    const r2 = (x) => Math.round(x * 100) / 100;
    const mid = curModel && curModel.id, mno = (curModel && curModel.modelNo) || "";
    upConfig(d => {
      if(!d.aiStudioUsage) d.aiStudioUsage = { days: {}, models: {} };
      if(!d.aiStudioUsage.days) d.aiStudioUsage.days = {};
      if(!d.aiStudioUsage.models) d.aiStudioUsage.models = {};
      const cur = d.aiStudioUsage.days[today] || { count: 0, cost: 0 };
      d.aiStudioUsage.days[today] = { count: cur.count + n, cost: r2(cur.cost + cost) };
      if(mid){
        const m = d.aiStudioUsage.models[mid] || { count: 0, cost: 0, modelNo: mno };
        d.aiStudioUsage.models[mid] = { count: m.count + n, cost: r2(m.cost + cost), modelNo: mno || m.modelNo, lastTs: Date.now() };
      }
    });
  };
  const saveBudget = () => {
    const v = Math.max(0, Math.round((Number(budgetInput) || 0) * 100) / 100);
    upConfig(d => { d.aiStudioBudget = v; });
    showToast(v > 0 ? ("✓ اتحدّدت الميزانية الشهرية: ~$" + v) : "✓ اتشالت الميزانية");
  };

  const resetSession = () => {
    setSources(curModel ? modelImages(curModel).slice(0, 1) : []);
    setResults([]); setCustomPrompt(""); setCustomOn(false); setNotes("");
    setEditFor(null); setEditInstr(""); setGenCount(0); setSpent(0);
    setMultiPose(false); setSelPoses([]); setCount(1); setShotType("model");
    setSavedIds(new Set());
    sessionIdRef.current = null; /* جلسة جديدة → هيستوري جديد */
    showToast("🆕 جلسة جديدة");
  };

  const showPicker = Array.isArray(models) && models.length > 0 && !model;
  const modelOpts = useMemo(() => (Array.isArray(models) ? models : [])
    .filter(m => m && m.id).map(m => ({ value: String(m.id), label: (m.modelNo || "—") + (m.modelDesc ? " — " + m.modelDesc : "") })),
    [models]);
  /* V21.26.25: أوامر التشغيل (للربط بأمر/لون) — من data.orders.
     V21.26.26: البحث برقم الموديل اللي جوّه الأمر (label = modelNo أولاً) —
     مع fallback لرقم الأمر/الـ id لو الموديل فاضي. */
  const orders = useMemo(() => (Array.isArray(data.orders) ? data.orders : []), [data.orders]);
  const orderOpts = useMemo(() => orders
    .filter(o => o && o.id).map(o => ({ value: String(o.id), label: (o.modelNo || o.poNumber || o.id || "—") + (o.modelDesc ? " — " + o.modelDesc : "") })),
    [orders]);
  /* ألوان أمر (dedup عبر colorsA..H) — نفس منطق ColorSizeMatrixTab */
  const orderColorsOf = (o) => {
    const out = []; const seen = new Set();
    if(!o) return out;
    FKEYS.forEach(k => (o["colors" + k] || []).forEach(c => {
      const nm = String((typeof c === "string" ? c : (c?.color || c?.n || c?.name || "")) || "").trim();
      const hex = (typeof c === "object" ? (c.colorHex || "#cbd5e1") : "#cbd5e1");
      if(nm && !seen.has(nm.toLowerCase())){ seen.add(nm.toLowerCase()); out.push({ color: nm, colorHex: hex }); }
    }));
    return out;
  };

  const availFromModel = useMemo(() => modelImages(curModel), [curModel]);
  const colorNames = useMemo(() => modelColorNames(curModel), [curModel]);
  const gallery = (curModel && Array.isArray(curModel.aiImages)) ? curModel.aiImages : [];
  const isModelShot = shotType === "model";
  const isReference = shotType === "reference";
  const isChild = genderId === "girl" || genderId === "boy";
  /* V21.26.21: «وضع البرومبت الجاهز» — لما مجموعة برومبت مفتوحة (openGroup)،
     خيارات الموديل اللي مابتأثّرش على تنفيذ البرومبت الجاهز تتعرض باهتة (غير
     مؤثّرة). المؤثّر فعلاً على البرومبت الجاهز: العمر (لغير جروبات الكبار) +
     لون البشرة + الملاحظات + العدد + صورة المصدر. باقي الخيارات (نوع التصوير/
     الجنس/التعبير/الوقفة/الإطار/الإضاءة/الخلفية/الواقعية/الكاميرا/البرومبت الحر)
     بتغذّي وضع «موديل» اليدوي بس — مالهاش تأثير على البرومبت الجاهز. */
  const readyMode = !!openGroup;
  const groupIsAdult = openGroup === "FOR HIM" || openGroup === "FOR HER";
  const ageInert = readyMode && groupIsAdult;  /* العمر باهت لجروبات الكبار */
  const optInert = readyMode;                  /* باقي خيارات الموديل باهتة */
  const opts = { shotType, genderId, expressionId, ageId, poseId, backgroundId, framingId, skinToneId, lightingId, notes };
  /* البرومبت الفعلي: حر (لو مفعّل وفيه نص) → وإلا المبني من الـ chips (وضع
     «موديل مرجعي» buildStudioPrompt بيرجّع برومبت التلبيس المرجعي). */
  /* V21.26.0: البرومبت الحر يُستخدم فقط في وضع «موديل» ولمّا المستخدم يفعّله
     بنفسه — مايتسرّبش للمرجعي/المفرغ/المسطح (دول بيستخدموا برومبتهم الداخلي). */
  const useCustom = isModelShot && customOn && customPrompt.trim();
  /* لاحقة تقنية: نمط التصوير + العدسة + معزّز الواقعية — بتتلصق على أي برومبت */
  const techSuffix = () => {
    let s = "";
    const st = stylePromptOf(camStyle); if(st) s += " " + st + ".";
    const cam = cameraPromptOf(cameraId); if(cam) s += " " + cam + ".";
    if(realismOn) s += " " + buildRealismSuffix(realismLevel, shotType === "model" || shotType === "reference");
    return s;
  };
  /* V21.26.14: «تيك باك» رسم خطّي — من غير لاحقة الكاميرا/الواقعية (تتعارض مع line art). */
  const effPrompt = (o) => { const base = useCustom ? customPrompt.trim() : buildStudioPrompt(o, lib); return ((o && o.shotType) === "techpack") ? base : base + techSuffix(); };

  /* V21.26.0: اختيار نوع اللقطة مابيفعّلش البرومبت الحر إطلاقاً. المرجعي/
     المفرغ/المسطح بيبنوا برومبتهم الداخلي في buildStudioPrompt (مخفي/غير قابل
     للتعديل). البرومبت الحر اختياري يدوي في وضع «موديل» فقط. */
  const setShot = (id) => { setShotType(id); };
  /* وضع موديل مرجعي: sources[0] = Image1 (الموديل) · الباقي = Image2 (القطعة) */
  const setRefModel = (url) => { if(url) setSources(p => [url, ...p.slice(1)]); };
  const clearRefModel = () => setSources(p => p.slice(1));

  const pickModel = (id) => {
    const m = (Array.isArray(models) ? models : []).find(x => String(x.id) === String(id)) || null;
    setCurModel(m); setSaveColor(""); setSources(modelImages(m).slice(0, 1));
    if(m && m.modelNo) setStorageFolder(m.modelNo);
  };

  const addSource = (url) => { if(!url) return; setSources(p => p.includes(url) ? p : [...p, url].slice(0, 5)); };
  const removeSource = (url) => { setSources(p => p.filter(u => u !== url)); setPinnedSrc(prev => { if(!prev.includes(url)) return prev; const next = prev.filter(u => u !== url); savePinnedSrc(next); return next; }); };
  const onSourceFiles = async (files) => {
    for(const f of files){
      try { const { url } = await uploadImageToStorage("ai-sources", (curModel && curModel.id) || "studio", f); addSource(url); }
      catch(err){ showToast("⛔ فشل رفع صورة المصدر" + (err?.message ? " — " + err.message : "")); }
    }
  };

  /* ── التوليد ── */
  const callOnce = async (o, srcUrls, promptOverride, extra) => {
    const pr = promptOverride || effPrompt(o);
    const r = await generateModelImage({
      modelId: (curModel && curModel.id) || "studio", sourceImageUrls: srcUrls,
      prompt: pr, aspectRatio, imageSize, tier,
    }, user);
    if(r && r.ok && r.url){
      const baseDesc = describeStudioOptions(o, lib);
      const entry = {
        id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        url: r.url, storagePath: r.storagePath || "", prompt: pr,
        desc: (extra && extra.color ? "🎨 " + extra.color + " · " : "") + baseDesc,
        tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: o,
        ...(extra || {}),
      };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1);
      setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      return entry;
    }
    showToast("⛔ " + ((r && r.error) || "فشل التوليد"));
    return null;
  };

  /* ── كل ألوان الموديل دفعة واحدة ── */
  const colorList = useMemo(() => {
    if(!curModel) return [];
    const ci = (curModel.shopify_meta && curModel.shopify_meta.color_images) || {};
    const seen = new Set(); const out = [];
    FKEYS.forEach(k => (curModel["colors" + k] || []).forEach(c => {
      const name = ((c && c.color) || "").trim();
      if(name && !seen.has(name)){ seen.add(name); out.push({ name, hex: (c && c.colorHex) || "", image: (ci[name] && (ci[name].url || ci[name])) || "" }); }
    }));
    return out;
  }, [curModel]);

  const generateAllColors = async () => {
    if(sources.length === 0){ showToast("⚠️ اختار صورة المصدر الأول"); return; }
    if(colorList.length === 0){ showToast("⚠️ الموديل مفيهوش ألوان"); return; }
    if(isReference && sources.length < 2){ showToast("⚠️ وضع «موديل مرجعي» محتاج موديل + قطعة"); return; }
    const total = Math.round(unitCost(tier, imageSize) * colorList.length * 100) / 100;
    const over = budget > 0 && (usage.month.cost + total) > budget;
    const yes = await ask("توليد كل الألوان",
      "هيتولّد " + colorList.length + " صورة (لون لكل لون: " + colorList.map(c => c.name).join("، ") + ").\n" +
      "التكلفة التقريبية: ~‎$" + total + (over ? "\n\n⚠️ هتتجاوز ميزانية الشهر (~$" + budget + ")" : ""),
      { confirmText: "توليد" });
    if(!yes) return;
    setBusy(true); setGenTotal(colorList.length); setGenDone(0);
    const news = [];
    for(let i = 0; i < colorList.length; i++){
      const col = colorList[i];
      setBatchMsg("لون " + (i + 1) + " من " + colorList.length + ": " + col.name);
      const srcUrls = col.image ? [col.image, ...sources.filter(u => u !== col.image)].slice(0, 5) : sources;
      const colorInstr = col.image ? "" : (" The garment must be in this exact color: " + (col.hex || col.name) + " (keep the same design and details, only the color is " + col.name + ").");
      const e = await callOnce({ ...opts }, srcUrls, effPrompt({ ...opts }) + colorInstr, { color: col.name });
      if(!e) break;
      news.push(e); setGenDone(d => d + 1);
    }
    setBusy(false); setBatchMsg("");
    if(news.length){ recordUsage(news.length, Math.round(news.length * unitCost(tier, imageSize) * 100) / 100); autoSaveEntries(news); }
  };

  /* ── غلاف/نص على الصورة ── */
  const doCover = async () => {
    if(!coverFor) return;
    const pr = buildCoverPrompt({ ...coverForm, modelNo: (curModel && curModel.modelNo) || storageFolder || "" });
    setBusy(true); setGenTotal(1); setGenDone(0); setBatchMsg("🏷️ إضافة الغلاف/النص...");
    const r = await generateModelImage({ modelId: (curModel && curModel.id) || "studio", sourceImageUrls: [coverFor.url], prompt: pr, aspectRatio, imageSize, tier }, user);
    setBusy(false); setBatchMsg("");
    if(r && r.ok && r.url){
      const entry = { id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), url: r.url, storagePath: r.storagePath || "", prompt: pr, desc: "📔 " + (COVER_STYLES.find(s => s.id === coverForm.styleId) || {}).label, tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: coverFor.options || opts };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1); setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      recordUsage(1, unitCost(tier, imageSize)); autoSaveEntries([entry]);
      setCoverFor(null); showToast("✓ اتعمل الغلاف/النص");
    } else showToast("⛔ " + ((r && r.error) || "فشل"));
  };

  /* ── إدراج لوجو على الصورة (V21.26.5) — Image1=الصورة · Image2=اللوجو ── */
  const onLogoImage = async (file) => {
    try { const { url } = await uploadImageToStorage("ai-logos", "logo", file); setLogoForm(f => ({ ...f, logoUrl: url })); }
    catch(err){ showToast("⛔ فشل رفع اللوجو" + (err?.message ? " — " + err.message : "")); }
  };
  const doLogo = async () => {
    if(!logoFor) return;
    if(!logoForm.logoUrl){ showToast("⚠️ اختر صورة اللوجو الأول"); return; }
    const pr = buildLogoPrompt(logoForm.position, logoForm.size);
    setBusy(true); setGenTotal(1); setGenDone(0); setBatchMsg("🏷️ إضافة اللوجو...");
    const r = await generateModelImage({ modelId: (curModel && curModel.id) || "studio", sourceImageUrls: [logoFor.url, logoForm.logoUrl], prompt: pr, aspectRatio, imageSize, tier }, user);
    setBusy(false); setBatchMsg("");
    if(r && r.ok && r.url){
      const entry = { id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), url: r.url, storagePath: r.storagePath || "", prompt: pr, desc: "🏷️ لوجو", tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: logoFor.options || opts };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1); setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      recordUsage(1, unitCost(tier, imageSize)); autoSaveEntries([entry]);
      setLogoFor(null); showToast("✓ اتضاف اللوجو");
    } else showToast("⛔ " + ((r && r.error) || "فشل"));
  };

  const generate = async () => {
    if(sources.length === 0){ showToast("⚠️ أضف صورة مصدر واحدة على الأقل (القطعة)"); return; }
    if(isReference && sources.length < 2){ showToast("⚠️ وضع «موديل مرجعي» محتاج صورة موديل (Image 1) + صورة قطعة (Image 2)"); return; }
    let jobs;
    if(isModelShot && multiPose && selPoses.length > 0) jobs = selPoses.map(pid => ({ ...opts, poseId: pid }));
    else { const n = Math.max(1, Math.min(4, Number(count) || 1)); jobs = Array.from({ length: n }, () => ({ ...opts })); }
    const total = Math.round(unitCost(tier, imageSize) * jobs.length * 100) / 100;
    const over = budget > 0 && (usage.month.cost + total) > budget;
    const yes = await ask("توليد بالذكاء الاصطناعي",
      "عدد الصور: " + jobs.length + " · النموذج: " + (tier === "pro" ? "Nano Banana Pro" : "Flash") + " (" + imageSize + ")\n" +
      "التكلفة التقريبية الإجمالية: ~‎$" + total + "\n\nالنوع: " + (SHOT_TYPES.find(s => s.id === shotType) || {}).label +
      (over ? "\n\n⚠️ هتتجاوز ميزانية الشهر (~$" + budget + ")" : ""),
      { confirmText: "توليد" });
    if(!yes) return;
    setBusy(true); setGenTotal(jobs.length); setGenDone(0);
    const news = [];
    for(let i = 0; i < jobs.length; i++){
      setBatchMsg(jobs.length > 1 ? ("جاري توليد " + (i + 1) + " من " + jobs.length + "...") : "جاري التوليد...");
      const e = await callOnce(jobs[i], sources);
      if(!e) break;
      news.push(e); setGenDone(d => d + 1);
    }
    setBusy(false); setBatchMsg("");
    if(news.length){ recordUsage(news.length, Math.round(news.length * unitCost(tier, imageSize) * 100) / 100); autoSaveEntries(news); }
  };

  /* تنفيذ برومبت جاهز — V21.26.4: بنضيف «الملاحظات الإضافية» لو المستخدم كتب
     حاجة (زي «أضف كوتش أبيض»)، عشان يقدر يخصّص حتى البرومبت الجاهز. */
  const runSavedPrompt = async (sp, group) => {
    if(!sp || !sp.prompt) return;
    if(sources.length === 0){ showToast("⚠️ اختر صورة المصدر الأول"); return; }
    const n = Math.max(1, Math.min(4, Number(count) || 1));
    const notesTxt = String(notes || "").trim();
    /* V21.26.13: استبدال {{AGE}} بالعمر اللي اختاره المستخدم (قسم New). */
    const ageObj = CHILD_AGES.find(a => a.id === ageId);
    const ageTxt = (ageObj && ageObj.prompt) || "young child";
    const hadAgePlaceholder = /\{\{AGE\}\}/.test(sp.prompt);
    const baseP = String(sp.prompt || "").replace(/\{\{AGE\}\}/g, ageTxt);
    /* V21.26.20: طبّق العمر + لون البشرة المختارين على أي برومبت جاهز (override
       لأي وصف مخالف جوّه البرومبت) — عشان إعدادات «العمر/لون البشرة» تنفّذ فعلاً
       على كل المكتبة مش بس قسم New. العمر بيتخطّى لجروبات الكبار (FOR HIM/HER)
       لأنه عمر طفل. لو البرومبت فيه {{AGE}} العمر اتحقن خلاص (مفيش تكرار). */
    const ADULT_GROUPS = ["FOR HIM", "FOR HER"];
    const isAdultGroup = group && ADULT_GROUPS.includes(group);
    const toneObj = SKIN_TONES.find(s => s.id === skinToneId);
    const toneTxt = (toneObj && skinToneId !== "any" && toneObj.prompt) ? toneObj.prompt : "";
    const attrLines = [];
    if(!hadAgePlaceholder && !isAdultGroup) attrLines.push("- Subject age: " + ageTxt);
    if(toneTxt) attrLines.push("- Subject skin tone: " + toneTxt);
    const attrClause = attrLines.length
      ? "\n\nSubject attributes (must apply — override any conflicting age/skin description above):\n" + attrLines.join("\n")
      : "";
    /* V21.26.10: الموديل دايماً لابس شوز (افتراضي) + الملاحظات الإضافية. */
    const promptWithNotes = baseP + attrClause + "\n\n" + FOOTWEAR_CLAUSE + (notesTxt ? "\n\nAdditional requirements (must apply): " + notesTxt : "");
    setBusy(true); setGenTotal(n); setGenDone(0);
    const news = [];
    for(let i = 0; i < n; i++){
      setBatchMsg(n > 1 ? ("جاري توليد " + (i + 1) + " من " + n + "...") : ("جاري تنفيذ «" + (sp.name || "برومبت") + "»..."));
      const e = await callOnce({ ...opts }, sources, promptWithNotes);
      if(!e) break;
      news.push(e); setGenDone(d => d + 1);
    }
    setBusy(false); setBatchMsg("");
    if(news.length){ recordUsage(news.length, Math.round(news.length * unitCost(tier, imageSize) * 100) / 100); autoSaveEntries(news); }
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
    setBusy(true); setGenTotal(1); setGenDone(0); setBatchMsg("جاري تعديل الصورة...");
    const r = await generateModelImage({
      modelId: (curModel && curModel.id) || "studio", sourceImageUrls: [editFor.url],
      prompt: buildEditPrompt(editInstr), aspectRatio, imageSize, tier,
    }, user);
    setBusy(false); setBatchMsg("");
    if(r && r.ok && r.url){
      const entry = { id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), url: r.url, storagePath: r.storagePath || "", prompt: buildEditPrompt(editInstr), desc: "تعديل: " + editInstr.trim(), tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: editFor.options || opts };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1); setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      recordUsage(1, unitCost(tier, imageSize)); autoSaveEntries([entry]);
      setEditFor(null); setEditInstr(""); showToast("✓ تم التعديل");
    } else showToast("⛔ " + ((r && r.error) || "فشل التعديل"));
  };

  /* ✨ تحسين واقعية صورة مولّدة (re-render كصورة حقيقية) */
  const enhanceRealism = async (res) => {
    setBusy(true); setGenTotal(1); setGenDone(0); setBatchMsg("✨ تحسين الواقعية...");
    const pr = buildEditPrompt("Re-render this exact image as a believable real photograph. " +
      (cameraPromptOf(cameraId) ? cameraPromptOf(cameraId) + ". " : "") +
      buildRealismSuffix("strong", shotType === "model" || shotType === "reference") +
      " Keep the same subject, garment, pose and composition identical.");
    const r = await generateModelImage({ modelId: (curModel && curModel.id) || "studio", sourceImageUrls: [res.url], prompt: pr, aspectRatio, imageSize, tier }, user);
    setBusy(false); setBatchMsg("");
    if(r && r.ok && r.url){
      const entry = { id: "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), url: r.url, storagePath: r.storagePath || "", prompt: pr, desc: "✨ واقعية معزّزة", tier, aspectRatio, imageSize, ts: Date.now(), by: (user && (user.displayName || user.email)) || "", options: res.options || opts };
      setResults(p => [entry, ...p]);
      setGenCount(c => c + 1); setSpent(s => Math.round((s + unitCost(tier, imageSize)) * 100) / 100);
      recordUsage(1, unitCost(tier, imageSize)); autoSaveEntries([entry]);
      showToast("✓ اتعزّزت الواقعية");
    } else showToast("⛔ " + ((r && r.error) || "فشل التحسين"));
  };

  /* ── حفظ / معرض ── */
  const saveAsModelImage = (res) => {
    if(!replaceModel || !curModel){ showToast("⚠️ اختر موديل الأول"); return; }
    const next = { ...curModel, image: res.url, imageStoragePath: res.storagePath || "" };
    replaceModel(curModel.id, next); setCurModel(next);
    showToast("✓ اتحفظت كصورة الموديل الرئيسية");
  };
  /* V21.26.20: ربط صورة بموديل مختار من القايمة (بالرقم) — بيحفظ رابط الصورة
     كصورة رئيسية للموديل (= الأوردر: order.image + imageStoragePath)، ويملا
     فولدر التخزين برقم الموديل. بيشتغل حتى لو مفيش موديل مختار من الأول، فالترقيم
     مضمون من القايمة الحقيقية مش كتابة حرة. */
  const linkImageToModel = (res, modelId) => {
    if(!replaceModel){ showToast("⚠️ الربط مش متاح هنا"); return; }
    const m = (Array.isArray(models) ? models : []).find(x => String(x.id) === String(modelId));
    if(!m){ showToast("⚠️ اختر موديل من القايمة"); return; }
    const next = { ...m, image: res.url, imageStoragePath: res.storagePath || "" };
    replaceModel(m.id, next);
    if(curModel && String(curModel.id) === String(m.id)) setCurModel(next);
    if(m.modelNo) setStorageFolder(m.modelNo);
    setLinkFor(null);
    showToast("🔗 اتربطت الصورة بموديل «" + (m.modelNo || m.id) + "» (الصورة الرئيسية)");
  };
  /* V21.26.25: ربط صورة بأمر تشغيل — إمّا الصورة الرئيسية (order.image) أو صورة
     لون معيّن (order.shopify_meta.color_images[color]) اللي بتظهر في شبكة اللون/
     المقاس + بتترحّل لشوبيفاي كصورة الـ variant. updOrder هو المسار الآمن
     (بيقرا الأمر الحالي ويكتبه كامل). */
  const linkImageToOrder = (res, orderId, color) => {
    if(!updOrder){ showToast("⚠️ ربط الأوامر مش متاح من هنا"); return; }
    const o = orders.find(x => String(x.id) === String(orderId));
    if(!o){ showToast("⚠️ اختر أمر تشغيل"); return; }
    if(color){
      updOrder(orderId, d => {
        if(!d.shopify_meta) d.shopify_meta = {};
        if(!d.shopify_meta.color_images) d.shopify_meta.color_images = {};
        d.shopify_meta.color_images[color] = { url: res.url, alt: color, source: "ai" };
      });
      showToast("🎨 اتربطت الصورة بلون «" + color + "» في أمر «" + (o.modelNo || orderId) + "» — هتظهر في شبكة اللون/المقاس");
    } else {
      updOrder(orderId, d => { d.image = res.url; d.imageStoragePath = res.storagePath || ""; });
      showToast("🔗 اتربطت كصورة رئيسية لأمر «" + (o.modelNo || orderId) + "»");
    }
    if(o.modelNo) setStorageFolder(o.modelNo);
    setLinkFor(null); setLinkOrderId(null);
  };
  const saveAsColorImage = (res) => {
    if(!replaceModel || !curModel) return;
    const color = (res && res.color) || saveColor;
    if(!color){ showToast("⚠️ اختر اللون الأول"); return; }
    const next = JSON.parse(JSON.stringify(curModel));
    if(!next.shopify_meta) next.shopify_meta = {};
    if(!next.shopify_meta.color_images) next.shopify_meta.color_images = {};
    next.shopify_meta.color_images[color] = { url: res.url, alt: color, source: "ai" };
    replaceModel(curModel.id, next); setCurModel(next);
    showToast("✓ اتحفظت كصورة لون «" + color + "»");
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
  /* V21.24.2: كل الصور بتتحفظ تحت فولدر «AI Studio» → وجوّاه فولدر فرعي
     برقم الموديل (storageFolder). حفظ تلقائي افتراضي. */
  const AI_ROOT = "AI Studio";
  const _initTree = (d) => {
    if(!d.documentsTree) d.documentsTree = { folders: [], files: [] };
    if(!Array.isArray(d.documentsTree.folders)) d.documentsTree.folders = [];
    if(!Array.isArray(d.documentsTree.files)) d.documentsTree.files = [];
  };
  const _findOrMakeFolder = (d, name, parentId, icon, by, now) => {
    let f = d.documentsTree.folders.find(x => x && !x.deletedAt && (x.parentId || null) === (parentId || null) && String(x.name || "").trim().toLowerCase() === name.toLowerCase());
    if(!f){
      f = { id: "fold_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6), name, icon, color: "#8B5CF6", parentId: parentId || null, orderIndex: (d.documentsTree.folders.length || 0) + 1, createdBy: by, createdAt: now, lastModifiedAt: now };
      d.documentsTree.folders.push(f);
    }
    return f.id;
  };
  /* بيرجّع id الفولدر اللي هتتحفظ فيه: AI Studio[/<sub>] */
  const _ensureAiFolder = (d, sub, by, now) => {
    const rootId = _findOrMakeFolder(d, AI_ROOT, null, "🪄", by, now);
    if(!sub) return rootId;
    return _findOrMakeFolder(d, sub, rootId, "📁", by, now);
  };
  const _fileRec = (res, folderId, by, now, fname) => ({
    id: "aidoc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    name: "ai_" + (fname || (curModel && curModel.modelNo) || "studio") + "_" + new Date(res.ts).toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png",
    folderId, storagePath: res.storagePath || "", downloadURL: res.url,
    contentType: "image/png", size: 0, uploadedBy: by, uploadedAt: now, source: "ai-studio",
  });
  const _pathLabel = (fname) => "🪄 AI Studio" + (fname ? " / " + fname : "");

  /* حفظ مجموعة نتائج دفعة واحدة (للحفظ التلقائي + اليدوي) */
  const _saveEntries = (entries, silent) => {
    const list = (entries || []).filter(r => r && r.url && !savedIds.has(r.id));
    if(list.length === 0){ if(!silent) showToast("✓ محفوظة بالفعل"); return; }
    const now = new Date().toISOString();
    const by = (user && (user.displayName || user.email)) || "";
    const fname = String(storageFolder || "").trim();
    upConfig(d => { _initTree(d); const fid = _ensureAiFolder(d, fname, by, now); list.forEach(res => d.documentsTree.files.push(_fileRec(res, fid, by, now, fname))); });
    setSavedIds(prev => { const n = new Set(prev); list.forEach(r => n.add(r.id)); return n; });
    if(!silent) showToast("✓ اتحفظت " + (list.length > 1 ? list.length + " صور " : "") + "في " + _pathLabel(fname));
  };
  const autoSaveEntries = (entries) => { if(autoSave) _saveEntries(entries, true); };
  const saveToDocuments = (res) => _saveEntries([res], false);
  const saveAllToDocuments = () => _saveEntries(results, false);

  /* V21.26.22: التثبيت اتنقل من النتائج لصورة المصدر — النتائج بترتيبها كما هي */
  const sortedResults = results;

  /* V21.26.18: حذف نتيجة من النتائج + من مساحة التخزين + الملف الأصلي من Storage.
     دفاعي: لو الصورة محفوظة كصورة موديل رئيسية أو في المعرض، مابنحذفش الملف
     الأصلي (عشان مايكسرش المحفوظ) — بنشيلها من النتائج بس. */
  const deleteResult = async (res) => {
    if(!res) return;
    const refInGallery = gallery.some(g => (res.storagePath && g.storagePath === res.storagePath) || g.url === res.url);
    const refMain = !!(curModel && ((res.storagePath && curModel.imageStoragePath === res.storagePath) || curModel.image === res.url));
    const referenced = refInGallery || refMain;
    const ok = await ask("حذف الصورة؟",
      referenced
        ? "الصورة دي محفوظة كصورة موديل/في المعرض — هتتشال من النتائج بس، والملف الأصلي مش هيتحذف عشان مايأثرش على المحفوظ."
        : "هتتشال من النتائج ومن مساحة التخزين، والملف الأصلي هيتحذف من السيرفر نهائياً — مش هينفع ترجعها.",
      { danger: true });
    if(!ok) return;
    /* state: شيلها من النتائج + التثبيت + المحفوظة */
    setResults(prev => prev.filter(r => r.id !== res.id));
    setPinnedIds(prev => { if(!prev.has(res.id)) return prev; const n = new Set(prev); n.delete(res.id); return n; });
    setSavedIds(prev => { if(!prev.has(res.id)) return prev; const n = new Set(prev); n.delete(res.id); return n; });
    /* مساحة التخزين: شيل سجل/سجلات الملف المطابق (storagePath أولاً، وإلا الرابط) */
    upConfig(d => {
      if(!d.documentsTree || !Array.isArray(d.documentsTree.files)) return;
      d.documentsTree.files = d.documentsTree.files.filter(f =>
        !(f && f.source === "ai-studio" && ((res.storagePath && f.storagePath === res.storagePath) || f.downloadURL === res.url)));
    });
    /* Storage: احذف الملف الأصلي (idempotent) — إلا لو مرجوع في المحفوظ */
    if(!referenced && res.storagePath){ try { await deleteStorageImage(res.storagePath); } catch(_){} }
    showToast("🗑 اتشالت الصورة" + (referenced ? " من النتائج" : " ومن التخزين"));
  };

  const applyOptions = (o) => {
    if(!o) return;
    if(o.shotType) setShotType(o.shotType);
    if(o.genderId) setGenderId(o.genderId);
    if(o.expressionId) setExpressionId(o.expressionId);
    if(o.ageId) setAgeId(o.ageId);
    if(o.poseId) setPoseId(o.poseId);
    if(o.backgroundId) setBackgroundId(o.backgroundId);
    if(o.framingId) setFramingId(o.framingId);
    if(o.skinToneId) setSkinToneId(o.skinToneId);
    if(o.lightingId) setLightingId(o.lightingId);
    if(o.camStyle) setCamStyle(o.camStyle);
    if(o.cameraId) setCameraId(o.cameraId);
    if(o.realismLevel) setRealismLevel(o.realismLevel);
    if(o.notes != null) setNotes(o.notes);
    setMultiPose(false);
    showToast("✓ تم تحميل الإعدادات");
  };

  /* ── المكتبة (cfg.aiStudioPresets) ── */
  const savePresets = (mut) => upConfig(d => {
    if(!d.aiStudioPresets) d.aiStudioPresets = { poses: [], backgrounds: [], templates: [], savedPrompts: [] };
    if(!Array.isArray(d.aiStudioPresets.poses)) d.aiStudioPresets.poses = [];
    if(!Array.isArray(d.aiStudioPresets.backgrounds)) d.aiStudioPresets.backgrounds = [];
    if(!Array.isArray(d.aiStudioPresets.templates)) d.aiStudioPresets.templates = [];
    if(!Array.isArray(d.aiStudioPresets.savedPrompts)) d.aiStudioPresets.savedPrompts = [];
    if(!Array.isArray(d.aiStudioPresets.promptGroups)) d.aiStudioPresets.promptGroups = []; /* V21.27.20: أقسام مخصّصة */
    mut(d.aiStudioPresets);
  });
  /* برومبتس جاهزة بصور (حرّة) */
  const addSavedPrompt = () => {
    if(!spForm || !spForm.name.trim() || !spForm.prompt.trim()){ showToast("⚠️ اكتب الاسم والبرومبت"); return; }
    savePresets(p => p.savedPrompts.unshift({ id: "sp_" + Date.now().toString(36), name: spForm.name.trim(), prompt: spForm.prompt.trim(), image: spForm.image || "", ts: Date.now() }));
    setSpForm(null); showToast("✓ اتحفظ البرومبت في المكتبة");
  };
  const delSavedPrompt = (id) => savePresets(p => { p.savedPrompts = (p.savedPrompts || []).filter(x => x.id !== id); });
  const onSpImage = async (file) => {
    try { const { url } = await uploadImageToStorage("ai-prompt-thumbs", "lib", file); setSpForm(p => ({ ...(p || {}), image: url })); }
    catch(err){ showToast("⛔ فشل رفع الصورة" + (err?.message ? " — " + err.message : "")); }
  };

  /* ── مكتبة برومبتس تجربة الملابس (lazy load + CRUD على مستندات factory/) ── */
  useEffect(() => {
    let alive = true;
    /* V21.26.13: قسم «New» (40 برومبت أولاد) مشحون static من public — بيتدمج
       مع مكتبة Firestore. read-only (builtin) + العمر بيتحكم فيه المستخدم. */
    Promise.all([
      loadPromptLibrary((data.aiStudioPresets && data.aiStudioPresets.promptGroups) || []),
      fetch("/aiPromptLibraryNew.json", { cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([lib, newP]) => { if(alive){
        /* V21.26.15: لو فيه نسخة معدّلة من «New» في Firestore استخدمها (التعديل
           يثبت)؛ غير كده استخدم الـ static المشحون. أول تعديل بيـ materialize
           الـ 40 في Firestore. */
        const staticNew = (Array.isArray(newP) ? newP : []).map(r => ({ ...r, group: "New", builtin: true }));
        const fsNew = (lib.New && lib.New.length) ? lib.New : staticNew;
        setLibrary({ ...lib, New: fsNew }); setLibErr("");
      } })
      .catch(e => { if(alive){ setLibrary({}); setLibErr(e?.message || "فشل تحميل المكتبة"); } });
    return () => { alive = false; };
  }, []);
  const libTotal = useMemo(() => library ? Object.values(library).reduce((s, a) => s + (a ? a.length : 0), 0) : 0, [library]);
  /* V21.27.20: أقسام مخصّصة يضيفها المستخدم (cfg.aiStudioPresets.promptGroups) */
  const customGroups = useMemo(() => (data.aiStudioPresets && Array.isArray(data.aiStudioPresets.promptGroups)) ? data.aiStudioPresets.promptGroups.filter(g => g && !LIBRARY_GROUPS.includes(g)) : [], [data.aiStudioPresets]);
  const allGroups = useMemo(() => [...LIBRARY_GROUPS, ...customGroups], [customGroups]);
  /* إضافة قسم جديد للمكتبة */
  const addLibGroup = async () => {
    const name = await askInput("قسم جديد للمكتبة", { label: "اسم القسم:", placeholder: "مثلاً: BABY GIRL", validate: v => v.trim() ? null : "الاسم مطلوب" });
    if(!name) return;
    const g = name.trim();
    if(allGroups.includes(g)){ showToast("⚠️ القسم موجود بالفعل"); return; }
    savePresets(p => { if(!Array.isArray(p.promptGroups)) p.promptGroups = []; if(!p.promptGroups.includes(g)) p.promptGroups.push(g); });
    setLibrary(prev => ({ ...(prev || {}), [g]: (prev && prev[g]) ? prev[g] : [] }));
    setOpenGroup(g);
    showToast("✓ اتضاف قسم «" + g + "» — تقدر تضيف فيه برومبتس");
  };

  /* نسبة تقدّم التوليد (٪): تقدير سلس بيتسلّق مع كل صورة تخلص في الباتش،
     ومحاكاة ناعمة جوّه الصورة الواحدة (الـ API مبيرجّعش progress حقيقي). */
  useEffect(() => {
    if(!busy){ setGenPct(0); return; }
    const id = setInterval(() => {
      setGenPct(prev => {
        const tot = Math.max(1, genTotal);
        const target = Math.min(97, ((genDone + 0.9) / tot) * 100);
        if(prev >= target) return target;
        return prev + Math.max(0.5, (target - prev) * 0.08);
      });
    }, 150);
    return () => clearInterval(id);
  }, [busy, genTotal, genDone]);

  /* ── هيستوري الجلسات (مشترك) ── */
  useEffect(() => {
    let alive = true;
    loadSessionIndex().then(l => { if(alive) setSessionList(l); }).catch(() => { if(alive) setSessionList([]); });
    return () => { alive = false; };
  }, []);
  /* لقطة كل الإعدادات الحالية — لإعادة فتح الجلسة وتعديلها */
  const snapshotSettings = () => ({
    shotType, genderId, expressionId, ageId, poseId, backgroundId, framingId, skinToneId, lightingId, notes,
    tier, aspectRatio, imageSize, cameraId, camStyle, realismOn, realismLevel, customOn, customPrompt, storageFolder,
  });
  const restoreSettings = (s) => {
    if(!s) return;
    if(s.shotType) setShotType(s.shotType);
    if(s.genderId) setGenderId(s.genderId);
    if(s.expressionId) setExpressionId(s.expressionId);
    if(s.ageId) setAgeId(s.ageId);
    if(s.poseId) setPoseId(s.poseId);
    if(s.backgroundId) setBackgroundId(s.backgroundId);
    if(s.framingId) setFramingId(s.framingId);
    if(s.skinToneId) setSkinToneId(s.skinToneId);
    if(s.lightingId) setLightingId(s.lightingId);
    if(s.notes != null) setNotes(s.notes);
    if(s.tier) setTier(s.tier);
    if(s.aspectRatio) setAspectRatio(s.aspectRatio);
    if(s.imageSize) setImageSize(s.imageSize);
    if(s.cameraId) setCameraId(s.cameraId);
    if(s.camStyle) setCamStyle(s.camStyle);
    if(typeof s.realismOn === "boolean") setRealismOn(s.realismOn);
    if(s.realismLevel) setRealismLevel(s.realismLevel);
    if(typeof s.customOn === "boolean") setCustomOn(s.customOn);
    if(s.customPrompt != null) setCustomPrompt(s.customPrompt);
    if(s.storageFolder != null) setStorageFolder(s.storageFolder);
    setMultiPose(false);
  };
  /* حفظ تلقائي للجلسة الحالية كل ما النتايج تتغيّر (debounced) */
  useEffect(() => {
    if(!results.length) return;
    if(sessSaveTimer.current) clearTimeout(sessSaveTimer.current);
    sessSaveTimer.current = setTimeout(async () => {
      if(!sessionIdRef.current) sessionIdRef.current = "ses_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 5);
      const sess = {
        id: sessionIdRef.current, ts: Date.now(),
        by: (user && (user.displayName || user.email)) || "",
        modelNo: (curModel && curModel.modelNo) || storageFolder || "",
        label: describeStudioOptions(opts, lib),
        settings: snapshotSettings(),
        results: results.slice(0, 24).map(r => ({ id: r.id, url: r.url, storagePath: r.storagePath || "", desc: r.desc || "", prompt: r.prompt || "", aspectRatio: r.aspectRatio || aspectRatio, ts: r.ts || Date.now(), options: r.options || null })),
      };
      try { const list = await saveSessionDoc(sess); if(list) setSessionList(list); } catch(e){}
    }, 1600);
    return () => { if(sessSaveTimer.current) clearTimeout(sessSaveTimer.current); };
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps
  const openSession = async (meta) => {
    setShowHistory(false);
    const full = await loadSessionDoc(meta.id);
    if(!full){ showToast("⛔ تعذّر فتح الجلسة"); return; }
    restoreSettings(full.settings || {});
    setResults(Array.isArray(full.results) ? full.results : []);
    sessionIdRef.current = full.id;
    showToast("✓ اتفتحت الجلسة — عدّل وكمّل عليها");
  };
  const removeSession = async (id) => {
    const ok = await ask("حذف الجلسة؟", "هتتشال من الهيستوري نهائياً (الصور المحفوظة في المخزن متتأثرش).");
    if(!ok) return;
    try { const list = await deleteSessionDoc(id); setSessionList(list); if(sessionIdRef.current === id) sessionIdRef.current = null; } catch(e){ showToast("⛔ فشل الحذف"); }
  };

  const doSeedLibrary = async () => {
    if(libBusy) return;
    const ok = await ask("تحميل المكتبة الجاهزة؟", "هيتحمّل ~180 برومبت تجربة ملابس (5 جروبات) مع صورهم. تقدر تعدّلهم أو تحذفهم بعد كده.");
    if(!ok) return;
    setLibBusy("جاري تحميل المكتبة الجاهزة...");
    try { const byGroup = await seedPromptLibrary(); setLibrary(byGroup); setLibErr(""); showToast("✓ اتحمّلت المكتبة"); }
    catch(e){ showToast("⛔ " + (e?.message || "فشل التحميل")); }
    finally { setLibBusy(""); }
  };
  /* حفظ تعديل/إضافة على مستوى جروب واحد (merge-then-persist) */
  const persistGroup = async (group, prompts) => {
    setLibrary(prev => ({ ...(prev || {}), [group]: prompts }));
    setLibBusy("جاري الحفظ...");
    try { await savePromptGroup(group, prompts); }
    catch(e){ showToast("⛔ فشل الحفظ — " + (e?.message || "")); }
    finally { setLibBusy(""); }
  };
  const saveLibEdit = async () => {
    const f = libEditFor; if(!f) return;
    if(!f.name?.trim() || !f.prompt?.trim()){ showToast("⚠️ اكتب الاسم والبرومبت"); return; }
    const group = f.group;
    const cur = (library && library[group]) ? [...library[group]] : [];
    if(f.id){
      const i = cur.findIndex(x => x.id === f.id);
      if(i >= 0) cur[i] = { ...cur[i], name: f.name.trim(), prompt: f.prompt.trim(), image: f.image || "" };
    } else {
      cur.unshift({ id: "lib_u_" + Date.now().toString(36), name: f.name.trim(), prompt: f.prompt.trim(), image: f.image || "", group, ts: Date.now() });
    }
    setLibEditFor(null);
    await persistGroup(group, cur);
    showToast("✓ اتحفظ");
  };
  const delLibPrompt = async (group, id) => {
    /* V21.26.10: برومبتس المكتبة الأساسية (builtin) ممنوع حذفها — المضافة فقط. */
    const target = ((library && library[group]) || []).find(x => x.id === id);
    if(target && target.builtin){ showToast("🔒 ده برومبت أساسي في المكتبة — مينفعش يتحذف (تقدر تعدّله)"); return; }
    const ok = await ask("حذف البرومبت؟", "هيتشال من المكتبة نهائياً.");
    if(!ok) return;
    const cur = ((library && library[group]) || []).filter(x => x.id !== id);
    await persistGroup(group, cur);
  };
  const onLibEditImage = async (file) => {
    try { const { url } = await uploadImageToStorage("ai-prompt-thumbs", "lib", file); setLibEditFor(p => ({ ...(p || {}), image: url })); }
    catch(err){ showToast("⛔ فشل رفع الصورة" + (err?.message ? " — " + err.message : "")); }
  };
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
    savePresets(p => p.templates.push({ id: "tpl_" + Date.now().toString(36), name: tplName.trim(), options: { ...opts, camStyle, cameraId, realismLevel } }));
    setTplName(""); showToast("✓ اتحفظ القالب");
  };

  /* ── chips ── */
  const Chip = ({ on, onClick, children }) => (
    <span onClick={onClick} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: 999, fontSize: FS - 2, fontWeight: 700, color: on ? "#fff" : T.textSec, background: on ? T.accent : T.bg, border: "1px solid " + (on ? T.accent : T.brd), whiteSpace: "nowrap" }}>{children}</span>
  );
  const chipRow = (label, items, val, setVal, inert) => (
    <div style={{ marginBottom: 10, opacity: inert ? 0.4 : 1, transition: "opacity .15s" }} title={inert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
      <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>{label}{inert ? " · غير مؤثّر" : ""}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{items.map(it => <Chip key={it.id} on={val === it.id} onClick={() => setVal(it.id)}>{it.label}</Chip>)}</div>
    </div>
  );
  /* V21.26.21: ستايل تعتيم لأي بلوك إعدادات غير مؤثّر في الوضع الحالي. */
  const inertCard = (inert) => inert ? { opacity: 0.4, transition: "opacity .15s" } : null;

  const resultActions = (res, inGallery) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 10 }}>
      {(replaceModel || updOrder) && <Btn small onClick={() => { setLinkFor(res); setLinkOrderId(null); setLinkTab(replaceModel ? "model" : "order"); }} style={{ background: T.accent + "1f", color: T.accent, border: "1px solid " + T.accent + "55", fontWeight: 800 }} title="ربط الصورة بموديل أو أمر تشغيل (بالرقم) أو بلون">🔗 ربط</Btn>}
      {curModel && replaceModel && <Btn small onClick={() => saveAsModelImage(res)} style={{ background: T.accent + "14", color: T.accent, border: "1px solid " + T.accent + "33", fontWeight: 700 }}>⭐ رئيسية</Btn>}
      {curModel && replaceModel && (colorNames.length > 0 || res.color) && <Btn small onClick={() => saveAsColorImage(res)} style={{ background: "#EC489912", color: "#EC4899", border: "1px solid #EC489933", fontWeight: 700 }}>🎨 {res.color ? "لون «" + res.color + "»" : "لون"}</Btn>}
      {!inGallery && curModel && replaceModel && <Btn small onClick={() => saveToGallery(res)} style={{ background: "#8B5CF612", color: "#8B5CF6", border: "1px solid #8B5CF633", fontWeight: 700 }}>💾 المعرض</Btn>}
      <Btn small onClick={() => saveToDocuments(res)} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33", fontWeight: 700 }}>🗂️ تخزين</Btn>
      <Btn small onClick={() => enhanceRealism(res)} disabled={busy} style={{ background: "#0EA5E912", color: "#0EA5E9", border: "1px solid #0EA5E933", fontWeight: 700 }} title="إعادة رسم كصورة حقيقية">✨ واقعية</Btn>
      <Btn small onClick={() => { setCoverForm(f => ({ ...f, modelNo: (curModel && curModel.modelNo) || "" })); setCoverFor(res); }} style={{ background: "#A855F712", color: "#A855F7", border: "1px solid #A855F733", fontWeight: 700 }} title="غلاف مجلة / نص ولوجو">📔 غلاف/نص</Btn>
      <Btn small onClick={() => setLogoFor(res)} style={{ background: "#0EA5E912", color: "#0284C7", border: "1px solid #0EA5E933", fontWeight: 700 }} title="إدراج لوجو على الصورة">🏷️ لوجو</Btn>
      <Btn small onClick={() => { setEditFor(res); setEditInstr(""); }} style={{ background: T.warn + "12", color: T.warn, border: "1px solid " + T.warn + "33", fontWeight: 700 }}>✏️ تعديل</Btn>
      {res.options && <Btn small onClick={() => applyOptions(res.options)} style={{ background: T.bg, color: T.textSec, border: "1px solid " + T.brd }}>🔁 إعدادات</Btn>}
      <a href={res.url} target="_blank" rel="noreferrer"><Btn small style={{ background: T.bg, color: T.text, border: "1px solid " + T.brd }}>⬇️</Btn></a>
      {inGallery && <Btn small onClick={() => deleteFromGallery(res.id)} style={{ background: T.err + "12", color: T.err, border: "1px solid " + T.err + "33" }}>🗑</Btn>}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: T.bg, overflow: isMob ? "auto" : "hidden", direction: "rtl" }}>
      <BlockingOverlay show={busy} text={batchMsg || "جاري التوليد..."} pct={genPct} sub="بـ Nano Banana Pro — ثواني" />
      <div style={{ maxWidth: 1720, margin: "0 auto", padding: isMob ? 12 : "16px 24px 16px", height: isMob ? undefined : "100%", display: isMob ? undefined : "flex", flexDirection: isMob ? undefined : "column", boxSizing: "border-box" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap", flexShrink: 0 }}>
          <Btn small onClick={onClose} style={{ background: T.cardSolid, border: "1px solid " + T.brd, color: T.text }}>‹ رجوع</Btn>
          <Btn small onClick={resetSession} disabled={busy} style={{ background: "#10B98112", color: "#10B981", border: "1px solid #10B98133", fontWeight: 700 }}>🆕 جديد</Btn>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS + 4, fontWeight: 900, color: T.text }}>🪄 AI Studio — استوديو الموديلات</div>
            <div style={{ fontSize: FS - 1, color: T.textSec, marginTop: 2 }}>
              {curModel ? ("موديل: " + (curModel.modelNo || "—") + (curModel.modelDesc ? " — " + curModel.modelDesc : "")) : "توليد حرّ — اختر موديل لو عاوز تحفظ النتيجة عليه"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div onClick={() => { setBudgetInput(budget ? String(budget) : ""); setShowUsage(true); }} title="الميزانية وسجل التكلفة" style={{ cursor: "pointer", textAlign: "center", background: (budget > 0 && usage.month.cost >= budget) ? T.err + "12" : T.cardSolid, border: "1px solid " + ((budget > 0 && usage.month.cost >= budget) ? T.err : T.brd), borderRadius: 10, padding: "6px 12px" }}>
              <div style={{ fontSize: FS - 3, color: T.textMut }}>🗓️ الشهر {budget > 0 ? "/ الميزانية" : ""} 💰</div>
              <div style={{ fontSize: FS, fontWeight: 800, color: (budget > 0 && usage.month.cost >= budget) ? T.err : T.text }}>{usage.month.count} · ~‎${usage.month.cost}{budget > 0 ? " / $" + budget : ""}</div>
            </div>
            <div style={{ textAlign: "center", background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 10, padding: "6px 12px" }}>
              <div style={{ fontSize: FS - 3, color: T.textMut }}>📅 اليوم</div>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text }}>{usage.today.count} · ~‎${usage.today.cost}</div>
            </div>
            {genCount > 0 && <div style={{ textAlign: "center", background: T.accent + "0D", border: "1px solid " + T.accent + "30", borderRadius: 10, padding: "6px 12px" }}>
              <div style={{ fontSize: FS - 3, color: T.textMut }}>الجلسة</div>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.accent }}>{genCount} · ~‎${spent}</div>
            </div>}
          </div>
        </div>

        {showPicker && (
          <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14, marginBottom: 14, flexShrink: 0 }}>
            <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, marginBottom: 8 }}>🧩 اختر موديل (اختياري)</div>
            <div style={{ maxWidth: 420 }}>
              <SearchSel value={curModel ? String(curModel.id) : ""} onChange={pickModel} options={modelOpts} showAllOnFocus maxResults={8} placeholder="🔍 ابحث عن موديل..." />
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1.25fr 1fr", gap: 16, alignItems: isMob ? "start" : "stretch", flex: isMob ? undefined : 1, minHeight: isMob ? undefined : 0, overflow: isMob ? undefined : "hidden" }}>
          {/* ── left: inputs (عمود الإعدادات — اسكرول مستقل) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: isMob ? undefined : "auto", minHeight: isMob ? undefined : 0, paddingInlineEnd: isMob ? undefined : 4 }}>
            {/* shot type */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14, ...inertCard(optInert) }} title={optInert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
              <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>📸 نوع التصوير{optInert ? " · غير مؤثّر" : ""}</div>
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
                  <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 4 }}>🧵 صور المصدر (القطعة/العينة) — لغاية ٥</div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 8, lineHeight: 1.6 }}>📌 ثبّت العينة عشان تفضل محفوظة لو قفلت وفتحت الاستوديو — من غير ما ترفعها تاني.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {sources.map(u => {
                      const pin = pinnedSrc.includes(u);
                      return (
                      <div key={u} style={{ position: "relative", width: 70, height: 90, borderRadius: 10, overflow: "hidden", border: "2px solid " + (pin ? T.accent : T.brd), boxShadow: pin ? "0 0 0 2px " + T.accent + "55" : undefined }}>
                        <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span onClick={() => togglePinSrc(u)} title={pin ? "إلغاء تثبيت العينة" : "تثبيت العينة (تفضل محفوظة لو قفلت وفتحت)"} style={{ position: "absolute", top: 2, insetInlineStart: 2, width: 18, height: 18, borderRadius: "50%", background: pin ? T.accent : "rgba(0,0,0,0.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, cursor: "pointer" }}>📌</span>
                        <span onClick={() => removeSource(u)} style={{ position: "absolute", top: 2, insetInlineEnd: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer" }}>✕</span>
                      </div>
                      );
                    })}
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

            {/* مكتبة البرومبتس — مخزن منفصل (factory/aiPromptLibrary_*) lazy + editable.
                V21.27.18: «برومبتس جاهزة» اتدمجت هنا؛ الاستخراج من الصور بقى يحفظ هنا. */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>🗂️ مكتبة البرومبتس {libTotal > 0 && <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>({libTotal})</span>}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {library !== null && <Btn small onClick={addLibGroup} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33", fontWeight: 700 }} title="أضف قسم جديد للمكتبة">🗂️ قسم جديد</Btn>}
                  {library !== null && <Btn small onClick={() => setExtractOpen(true)} style={{ background: "#8B5CF612", color: "#8B5CF6", border: "1px solid #8B5CF633", fontWeight: 700 }} title="ارفع صور وقفات واستخرج منها برومبتس → تتحفظ في القسم اللي تختاره">🪄 استخراج من صور</Btn>}
                  {(libTotal > 0 || customGroups.length > 0) && <Btn small onClick={() => setLibEditFor({ group: openGroup || allGroups[0], name: "", prompt: customPrompt || "", image: "" })} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "33", fontWeight: 700 }}>➕ إضافة</Btn>}
                </div>
              </div>
              {/* V21.26.4: ملاحظات إضافية تنطبق على أي برومبت جاهز وقت تنفيذه (نفس حقل ملاحظات الخيارات) */}
              <div style={{ marginBottom: 10 }}>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="✏️ ملاحظات إضافية للبرومبت الجاهز (مثلاً: أضف كوتش أبيض)" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 2, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", outline: "none" }} />
              </div>
              {library === null ? (
                <div style={{ fontSize: FS - 2, color: T.textMut }}>جاري تحميل المكتبة...</div>
              ) : (libTotal === 0 && customGroups.length === 0) ? (
                <div style={{ fontSize: FS - 2, color: T.textMut, lineHeight: 1.8 }}>
                  مكتبة جاهزة من برومبتس تجربة الملابس (Virtual Try-On) مقسّمة بالجروبات — اختار صورة المصدر واضغط أي برومبت يتنفّذ على طول.
                  <div style={{ marginTop: 10 }}>
                    <Btn primary onClick={doSeedLibrary}>📥 تحميل المكتبة الجاهزة (~180)</Btn>
                  </div>
                  {libErr && <div style={{ marginTop: 8, fontSize: FS - 3, color: T.err }}>⚠️ {libErr}</div>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {allGroups.filter(g => (library[g] && library[g].length) || customGroups.includes(g)).map(g => {
                    const items = library[g] || [];
                    const open = openGroup === g;
                    return (
                      <div key={g} style={{ border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden" }}>
                        <div onClick={() => setOpenGroup(open ? "" : g)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px", cursor: "pointer", background: open ? T.accent + "0D" : T.bg }}>
                          <span style={{ fontSize: FS - 1, fontWeight: 800, color: T.text }}>{open ? "▾" : "▸"} {g} <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>({items.length})</span></span>
                          <span onClick={e => { e.stopPropagation(); setLibEditFor({ group: g, name: "", prompt: customPrompt || "", image: "" }); }} style={{ fontSize: FS - 3, fontWeight: 700, color: T.accent }}>➕</span>
                        </div>
                        {open && g === "New" && <div style={{ fontSize: FS - 3, color: T.textSec, background: T.accent + "0D", borderTop: "1px solid " + T.brd, padding: "7px 11px", lineHeight: 1.6 }}>⭐ مجموعة أولاد احترافية — <b>اختر العمر من «الخيارات ← العمر»</b>. تقدر تعدّل أي برومبت (زرار ✏️) وتغيّر صورته بصورة حقيقية للوقفة — والتعديل بيثبت.</div>}
                        {open && items.length === 0 && <div style={{ fontSize: FS - 3, color: T.textMut, borderTop: "1px solid " + T.brd, padding: "10px 11px", lineHeight: 1.6 }}>القسم فاضي — اضغط <b style={{ color: T.accent }}>➕</b> لإضافة برومبت، أو <b style={{ color: "#8B5CF6" }}>🪄 استخراج من صور</b>.</div>}
                        {open && items.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 8, padding: 10 }}>
                            {items.map(sp => (
                              <div key={sp.id} style={{ position: "relative", border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden", background: T.bg, cursor: busy ? "wait" : "pointer" }} onClick={() => !busy && runSavedPrompt(sp, g)} title={sp.prompt}>
                                <div style={{ width: "100%", aspectRatio: "3 / 4", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {sp.image ? <img src={sp.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 26 }}>📝</span>}
                                </div>
                                <div style={{ padding: "4px 6px", fontSize: FS - 3, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sp.name || "—"}</div>
                                <span onClick={e => { e.stopPropagation(); setLibEditFor({ group: g, id: sp.id, name: sp.name || "", prompt: sp.prompt || "", image: sp.image || "" }); }} style={{ position: "absolute", top: 3, insetInlineStart: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✏️</span>
                                {!sp.builtin && <span onClick={e => { e.stopPropagation(); delLibPrompt(g, sp.id); }} style={{ position: "absolute", top: 3, insetInlineEnd: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✕</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* options */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>🎛️ الخيارات</div>
              {readyMode && (
                <div style={{ fontSize: FS - 3, color: T.textSec, background: T.accent + "0D", border: "1px solid " + T.accent + "22", borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.7 }}>
                  📸 إنت في مجموعة برومبت جاهز «{openGroup}» — المؤثّر بس: <b>{groupIsAdult ? "لون البشرة + الملاحظات" : "العمر + لون البشرة + الملاحظات"}</b>. باقي الإعدادات <b>الباهتة</b> دي للوضع اليدوي (موديل) ومالهاش تأثير على البرومبت الجاهز.
                </div>
              )}
              {isReference && <div style={{ fontSize: FS - 2, color: T.textMut, lineHeight: 1.7 }}>في وضع «موديل مرجعي» البرومبت بيتنفّذ تلقائياً — كل التفاصيل (الوقفة/الخلفية/الإضاءة/الهوية) بتتاخد من صورة الموديل (Image 1)، والقطعة من Image 2. مفيش برومبت تكتبه.</div>}
              {isModelShot && chipRow("الجنس", GENDERS, genderId, setGenderId, optInert)}
              {((isModelShot && isChild) || readyMode) && chipRow("العمر", CHILD_AGES, ageId, setAgeId, ageInert)}
              {isModelShot && chipRow("تعبير الوجه 😊", EXPRESSIONS, expressionId, setExpressionId, optInert)}
              {isModelShot && (
                <div style={{ marginBottom: 10, opacity: optInert ? 0.4 : 1, transition: "opacity .15s" }} title={optInert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>الوقفة{optInert ? " · غير مؤثّر" : ""} {multiPose ? "(متعددة — صورة لكل وقفة)" : ""}</span>
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
              {isModelShot && chipRow("الإطار", FRAMINGS, framingId, setFramingId, optInert)}
              {(isModelShot || readyMode) && chipRow("لون البشرة", SKIN_TONES, skinToneId, setSkinToneId)}
              {isModelShot && chipRow("الإضاءة", LIGHTINGS, lightingId, setLightingId, optInert)}
              {!isReference && (
                <div style={{ marginBottom: 10, opacity: optInert ? 0.4 : 1, transition: "opacity .15s" }} title={optInert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
                  <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>الخلفية{optInert ? " · غير مؤثّر" : ""}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{lib.backgrounds.map(it => <Chip key={it.id} on={backgroundId === it.id} onClick={() => setBackgroundId(it.id)}>{it.label}{it.custom ? " ✦" : ""}</Chip>)}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>ملاحظات إضافية (اختياري)</div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="مثلاً: ابتسامة، إضاءة دافئة، حذاء أبيض..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 46, outline: "none" }} />
              </div>
            </div>

            {/* realism booster */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, padding: 14, borderRadius: 14, ...inertCard(optInert) }} title={optInert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>🎞️ تعزيز الواقعية{optInert ? " · غير مؤثّر" : ""}</span>
                <span onClick={() => setRealismOn(v => !v)} style={{ cursor: "pointer", fontSize: FS - 3, fontWeight: 700, color: realismOn ? T.accent : T.textMut }}>{realismOn ? "✓ مفعّل" : "متوقّف"}</span>
              </div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: realismOn ? 8 : 0, lineHeight: 1.6 }}>بيخلّي الصورة تبان فوتوغرافيا حقيقية (نسيج جلد/خامة طبيعي + نفي «شكل الـ AI») — مهم لمصداقية العملاء.</div>
              {realismOn && chipRow("القوة", REALISM_LEVELS, realismLevel, setRealismLevel)}
            </div>

            {/* camera settings — with visual diagrams */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, padding: 14, borderRadius: 14, ...inertCard(optInert) }} title={optInert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
              <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 4 }}>📷 إعدادات الكاميرا{optInert ? " · غير مؤثّر" : ""}</div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 10, lineHeight: 1.6 }}>اختار العدسة — كل واحدة ليها شكل مختلف للخلفية والعمق (الرسم جنبها بيوضّح). الافتراضي احترافي (بورتريه 85mm).</div>
              {chipRow("النمط", CAM_STYLES, camStyle, setCamStyle)}
              <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>العدسة / المدى البؤري</div>
              <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 8 }}>
                {CAMERA_PRESETS.map(c => {
                  const on = cameraId === c.id;
                  return (
                    <div key={c.id} onClick={() => setCameraId(c.id)} style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", padding: 9, borderRadius: 10, border: "1px solid " + (on ? T.accent : T.brd), background: on ? T.accent + "0D" : T.bg }}>
                      <CamDiagram type={c.diagram} on={on} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: FS - 1, fontWeight: 800, color: on ? T.accent : T.text }}>{c.label}</div>
                        <div style={{ fontSize: FS - 4, color: T.textMut, lineHeight: 1.5 }}>{c.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                    <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>القوالب الجاهزة والمحفوظة (اضغط للتطبيق)</div>
                    {lib.templates.length === 0 ? <div style={{ fontSize: FS - 3, color: T.textMut }}>مفيش قوالب — احفظ الإعدادات الحالية كقالب.</div>
                      : <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{lib.templates.map(t => (
                        <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: t.builtin ? T.accent + "0D" : T.bg, border: "1px solid " + (t.builtin ? T.accent + "30" : T.brd), fontSize: FS - 2 }}>
                          <span onClick={() => applyOptions(t.options)} style={{ cursor: "pointer", fontWeight: 700, color: T.accent }}>{t.name}</span>
                          {!t.builtin && <span onClick={() => savePresets(p => { p.templates = p.templates.filter(x => x.id !== t.id); })} style={{ cursor: "pointer", color: T.err }}>×</span>}
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

            {/* custom prompt + analyze — وضع «موديل» فقط (المرجعي/المفرغ/المسطح
                بيستخدموا برومبتهم الداخلي المخفي). يدوي بالكامل — مايتفعّلش لوحده. */}
            {isModelShot && (
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, padding: 14, borderRadius: 14, ...inertCard(optInert) }} title={optInert ? "غير مؤثّر على البرومبت الجاهز" : undefined}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>✍️ البرومبت الحر{optInert ? " · غير مؤثّر" : ""} <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>(اختياري)</span></span>
                <span onClick={() => setCustomOn(v => !v)} style={{ cursor: "pointer", fontSize: FS - 3, fontWeight: 700, color: customOn ? T.accent : T.textMut }}>{customOn ? "✓ مستخدَم في التوليد" : "استخدمه في التوليد"}</span>
              </div>
              {customOn ? (
                <>
                  <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={5} placeholder="اكتب البرومبت الكامل (الإنجليزي أدق)..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 2, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 90, outline: "none", lineHeight: 1.6 }} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
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
            )}

            {/* output settings */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 8 }}>🖼️ شكل الصورة (الأبعاد)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {AR_RATIOS.map(a => {
                  const on = aspectRatio === a.id;
                  const [w, h] = a.id.split(":").map(Number);
                  const orient = w === h ? "مربّع" : (w < h ? "طولي" : "أفقي");
                  return (
                    <div key={a.id} onClick={() => setAspectRatio(a.id)} title={a.label} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 6px", borderRadius: 10, border: "1px solid " + (on ? T.accent : T.brd), background: on ? T.accent + "0D" : T.bg, width: 70 }}>
                      <ARDiagram ratio={a.id} on={on} />
                      <div style={{ fontSize: FS - 2, fontWeight: 800, color: on ? T.accent : T.text }}>{a.id}</div>
                      <div style={{ fontSize: FS - 4, color: T.textMut }}>{orient}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(3,1fr)", gap: 10 }}>
                <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>النموذج</div><Sel value={tier} onChange={setTier}>{TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</Sel></div>
                <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>الدقة</div><Sel value={imageSize} onChange={setImageSize}>{IMAGE_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel></div>
                <div><div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 4 }}>عدد الصور</div><Sel value={String(count)} onChange={v => setCount(Number(v))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</Sel></div>
              </div>
            </div>

            {/* زر التوليد مثبّت أسفل العمود مع الاسكرول — يفضل ظاهر أثناء ضبط الخيارات */}
            <div style={{ position: "sticky", bottom: 0, zIndex: 6, background: T.bg, padding: "10px 0 6px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid " + T.brd, boxShadow: "0 -10px 20px -10px rgba(0,0,0,0.22)" }}>
              <Btn primary onClick={generate} disabled={busy || sources.length === 0 || (isReference && sources.length < 2)} style={{ fontSize: FS + 1, padding: "13px 0", fontWeight: 800 }}>
                {busy ? "⏳ جاري التوليد..." : "🪄 توليد الصورة" + (isModelShot && multiPose && selPoses.length > 0 ? " (" + selPoses.length + " وقفة)" : (Number(count) > 1 ? " (" + count + ")" : ""))}
              </Btn>
              {curModel && colorList.length > 0 && (
                <Btn onClick={generateAllColors} disabled={busy || sources.length === 0} style={{ padding: "11px 0", fontWeight: 800, background: "#EC489912", color: "#EC4899", border: "1px solid #EC489940" }}>
                  🎨 توليد كل الألوان ({colorList.length})
                </Btn>
              )}
            </div>
          </div>

          {/* ── right: results + gallery (نتائج الجلسة — ثابتة، اسكرول مستقل) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: isMob ? undefined : "auto", minHeight: isMob ? undefined : 0, paddingInlineStart: isMob ? undefined : 4 }}>
            {/* هيستوري الجلسات السابقة — مشترك، lazy */}
            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div onClick={() => setShowHistory(v => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>🕘 جلسات سابقة {sessionList && sessionList.length > 0 && <span style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600 }}>({sessionList.length})</span>}</span>
                <span style={{ color: T.textMut, fontSize: FS - 2 }}>{showHistory ? "▲ إخفاء" : "▼ عرض"}</span>
              </div>
              {showHistory && (
                sessionList === null ? <div style={{ fontSize: FS - 2, color: T.textMut, marginTop: 10 }}>جاري التحميل...</div>
                : sessionList.length === 0 ? <div style={{ fontSize: FS - 2, color: T.textMut, marginTop: 10, lineHeight: 1.7 }}>لسه مفيش جلسات محفوظة — أي توليد بيتحفظ تلقائياً هنا، وتقدر ترجعله بإعداداته.</div>
                : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(86px,1fr))", gap: 8, marginTop: 12, maxHeight: 320, overflowY: "auto" }}>
                  {sessionList.map(s => (
                    <div key={s.id} onClick={() => openSession(s)} title={s.label || ""} style={{ position: "relative", border: "1px solid " + (sessionIdRef.current === s.id ? T.accent : T.brd), borderRadius: 10, overflow: "hidden", background: T.bg, cursor: "pointer" }}>
                      <div style={{ width: "100%", aspectRatio: "3 / 4", background: "#0000000a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {s.thumb ? <img src={s.thumb} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22 }}>🖼️</span>}
                      </div>
                      <div style={{ padding: "3px 5px" }}>
                        <div style={{ fontSize: FS - 4, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.modelNo || "بدون موديل"}</div>
                        <div style={{ fontSize: FS - 5, color: T.textMut }}>{new Date(s.ts || 0).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" })} · {s.count || 0}🖼️</div>
                      </div>
                      <span onClick={e => { e.stopPropagation(); removeSession(s.id); }} style={{ position: "absolute", top: 3, insetInlineEnd: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✕</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: FS, fontWeight: 800, color: T.text }}>🖼️ نتائج الجلسة</span>
                {results.length > 1 && <Btn small onClick={saveAllToDocuments} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33" }}>🗂️ حفظ الكل</Btn>}
              </div>
              {/* storage folder + auto-save */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 800, whiteSpace: "nowrap" }}>🪄 AI Studio /</span>
                  <div style={{ flex: 1, minWidth: 120 }}><Inp value={storageFolder} onChange={setStorageFolder} placeholder="رقم الموديل (افتراضي)" /></div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: FS - 2, color: autoSave ? T.ok : T.textMut, fontWeight: 700, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} /> 💾 حفظ تلقائي
                  </label>
                </div>
                <div style={{ fontSize: FS - 4, color: T.textMut, marginTop: 4 }}>كل الصور بتتحفظ تلقائياً في «AI Studio / {storageFolder.trim() || "(الجذر)"}» — غيّر الاسم لفولدر تاني.</div>
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
                  {/* V21.26.18: شبكة — الطولي صورتين جنب بعض، الأفقي عرض كامل، بدون مساحة سوداء */}
                  <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12, alignItems: "start" }}>
                    {sortedResults.map(res => (
                      <ResultCard key={res.id} res={res} isMob={isMob}
                        onDelete={deleteResult} onZoom={(r) => setImgZoom({ url: r.url, desc: r.desc })}>
                        {resultActions(res, false)}
                      </ResultCard>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* persisted gallery */}
            {curModel && gallery.length > 0 && (
              <div style={{ background: T.cardSolid, border: "1px solid " + T.brd, borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 10 }}>📚 معرض الموديل المحفوظ ({gallery.length})</div>
                {/* V21.26.18: نفس شبكة العرض بدون مساحة سوداء (المعرض له زرّ حذفه الخاص) */}
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12, alignItems: "start" }}>
                  {gallery.map(g => (
                    <ResultCard key={g.id} res={g} isMob={isMob} onZoom={(r) => setImgZoom({ url: r.url, desc: r.desc })}>
                      {resultActions(g, true)}
                    </ResultCard>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* image zoom lightbox — الصورة بكامل الجودة والتفاصيل */}
      {imgZoom && (
        <div onClick={() => setImgZoom(null)} style={{ position: "fixed", inset: 0, zIndex: 100001, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl", cursor: "zoom-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 14, insetInlineEnd: 14, display: "flex", gap: 8 }}>
            <a href={imgZoom.url} target="_blank" rel="noreferrer" download onClick={e => e.stopPropagation()} style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", fontWeight: 700, fontSize: FS - 2, textDecoration: "none", fontFamily: "inherit", display: "inline-flex", alignItems: "center" }}>⬇️ تنزيل</a>
            <button onClick={() => setImgZoom(null)} style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>✕ إغلاق</button>
          </div>
          <img src={imgZoom.url} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: "96vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", cursor: "default" }} />
          {imgZoom.desc && <div onClick={e => e.stopPropagation()} style={{ color: "#fff", fontSize: FS - 2, marginTop: 12, textAlign: "center", maxWidth: "90vw", background: "rgba(0,0,0,0.4)", padding: "6px 14px", borderRadius: 10 }}>{imgZoom.desc}</div>}
        </div>
      )}

      {/* usage / budget modal */}
      {showUsage && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setShowUsage(false); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 520, padding: 20, border: "1px solid " + T.brd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>💰 الميزانية وسجل التكلفة</span>
              <Btn small ghost onClick={() => setShowUsage(false)}>✕</Btn>
            </div>
            {/* month vs budget */}
            <div style={{ background: T.bg, borderRadius: 12, padding: 14, marginBottom: 12, border: "1px solid " + T.brd }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS - 1, marginBottom: 6 }}>
                <span style={{ color: T.textSec, fontWeight: 700 }}>استهلاك الشهر</span>
                <strong style={{ color: (budget > 0 && usage.month.cost >= budget) ? T.err : T.text }}>{usage.month.count} صورة · ~‎${usage.month.cost}{budget > 0 ? " / $" + budget : ""}</strong>
              </div>
              {budget > 0 && <div style={{ height: 8, background: T.cardSolid, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, width: Math.min(100, (usage.month.cost / budget) * 100) + "%", background: usage.month.cost >= budget ? T.err : (usage.month.cost >= 0.8 * budget ? T.warn : T.ok) }} />
              </div>}
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, whiteSpace: "nowrap" }}>الميزانية الشهرية ($):</span>
                <div style={{ flex: 1 }}><Inp type="number" value={budgetInput} onChange={setBudgetInput} placeholder="0 = بدون حد" /></div>
                <Btn small onClick={saveBudget} style={{ background: T.ok + "12", color: T.ok, border: "1px solid " + T.ok + "33" }}>حفظ</Btn>
              </div>
            </div>
            {/* per-model */}
            <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, marginBottom: 8 }}>التكلفة لكل موديل</div>
            {usage.models.length === 0 ? <div style={{ fontSize: FS - 2, color: T.textMut, textAlign: "center", padding: 16 }}>مفيش بيانات لسه.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {usage.models.slice(0, 30).map(m => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.bg, borderRadius: 8, border: "1px solid " + T.brd }}>
                    <span style={{ fontSize: FS - 1, fontWeight: 700, color: T.text }}>{m.modelNo || m.id}</span>
                    <span style={{ fontSize: FS - 2, color: T.textSec }}>{m.count} صورة · <strong style={{ color: T.text }}>~‎${m.cost}</strong></span>
                  </div>
                ))}
              </div>}
          </div>
        </div>
      )}

      {/* V21.26.25: ربط الصورة بموديل أو أمر تشغيل (بالرقم) أو بلون معيّن */}
      {/* V21.27.14: الربط في الاستوديو بقى يستخدم نفس المودال المشترك (موديل
          رئيسية/لون + أمر رئيسية/لون، الألوان مفلترة لخامة الماتريكس). */}
      {linkFor && <ImageLinkModal
        image={{ url: linkFor.url, storagePath: linkFor.storagePath || "" }}
        models={models}
        orders={orders}
        replaceModel={replaceModel}
        updOrder={updOrder}
        onClose={() => { setLinkFor(null); setLinkOrderId(null); }}
      />}

      {/* V21.27.13: استخراج برومبتس من صور الوقفات → مكتبة البرومبتس بالصور */}
      {extractOpen && <PromptExtractModal data={data} groups={allGroups} defaultGroup={openGroup || allGroups[0]} onClose={() => setExtractOpen(false)}
        onSave={async (entries, group) => {
          const recs = (entries || []).map((e, i) => ({ id: "lib_x_" + Date.now().toString(36) + "_" + i, name: e.name, prompt: e.prompt, image: e.image || "", group, ts: Date.now() }));
          const cur = (library && library[group]) ? [...library[group]] : [];
          await persistGroup(group, [...recs, ...cur]);
          showToast("✓ اتحفظ " + recs.length + " برومبت في «" + group + "»");
        }} />}

      {/* cover / text modal */}
      {coverFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setCoverFor(null); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 560, padding: 20, border: "1px solid " + T.brd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>📔 غلاف / نص على الصورة</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12 }}>اكتب رقم الموديل + لوجو CLARK، أو اعمل غلاف مجلة بأنماط مختلفة.</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <img src={coverFor.url} alt="" style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid " + T.brd, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>نمط الغلاف</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{COVER_STYLES.map(s => <Chip key={s.id} on={coverForm.styleId === s.id} onClick={() => setCoverForm(f => ({ ...f, styleId: s.id }))}>{s.label}</Chip>)}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>اسم المجلة / الماستهيد</label>
                <Inp value={coverForm.magName} onChange={v => setCoverForm(f => ({ ...f, magName: v }))} placeholder="CLARK" />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingBottom: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: FS - 1, color: T.text }}><input type="checkbox" checked={coverForm.withModelNo} onChange={e => setCoverForm(f => ({ ...f, withModelNo: e.target.checked }))} /> رقم الموديل</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: FS - 1, color: T.text }}><input type="checkbox" checked={coverForm.withLogo} onChange={e => setCoverForm(f => ({ ...f, withLogo: e.target.checked }))} /> لوجو CLARK</label>
              </div>
            </div>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>عناوين / نص إضافي (اختياري)</label>
            <textarea value={coverForm.extra} onChange={e => setCoverForm(f => ({ ...f, extra: e.target.value }))} rows={2} placeholder="مثلاً: تشكيلة صيف 2026 · خصم 20%" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 44, outline: "none", marginBottom: 12 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn ghost onClick={() => setCoverFor(null)}>إلغاء</Btn>
              <Btn primary onClick={doCover} disabled={busy}>📔 تنفيذ (~‎${unitCost(tier, imageSize)})</Btn>
            </div>
          </div>
        </div>
      )}

      {/* logo overlay modal */}
      {logoFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setLogoFor(null); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 520, padding: 20, border: "1px solid " + T.brd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>🏷️ إدراج لوجو على الصورة</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12 }}>اختار صورة اللوجو (يفضّل PNG بخلفية شفافة)، ومكانه وحجمه — هيتحط بنفس شكله الأصلي.</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <img src={logoFor.url} alt="" style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid " + T.brd, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>صورة اللوجو</div>
                <ImagePickButton data={data} imagesOnly onFile={onLogoImage} onPickUrl={url => setLogoForm(f => ({ ...f, logoUrl: url }))}
                  triggerStyle={{ width: 120, height: 76, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: logoForm.logoUrl ? T.bg : T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, overflow: "hidden" }}>
                  {logoForm.logoUrl ? <img src={logoForm.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "🖼️ اختر لوجو"}
                </ImagePickButton>
              </div>
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>المكان</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{LOGO_POSITIONS.map(p => <Chip key={p.id} on={logoForm.position === p.id} onClick={() => setLogoForm(f => ({ ...f, position: p.id }))}>{p.label}</Chip>)}</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>الحجم</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>{LOGO_SIZES.map(s => <Chip key={s.id} on={logoForm.size === s.id} onClick={() => setLogoForm(f => ({ ...f, size: s.id }))}>{s.label}</Chip>)}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn ghost onClick={() => setLogoFor(null)}>إلغاء</Btn>
              <Btn primary onClick={doLogo} disabled={busy || !logoForm.logoUrl}>🏷️ إضافة اللوجو (~‎${unitCost(tier, imageSize)})</Btn>
            </div>
          </div>
        </div>
      )}

      {/* add saved-prompt modal */}
      {spForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setSpForm(null); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 480, padding: 20, border: "1px solid " + T.brd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>📸 إضافة برومبت جاهز</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12 }}>احفظ برومبت كامل بصورة مثال — وبعدين اضغط عليه من المكتبة للتنفيذ المباشر.</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              <ImagePickButton data={data} imagesOnly onFile={onSpImage} onPickUrl={url => setSpForm(p => ({ ...(p || {}), image: url }))}
                triggerStyle={{ width: 80, height: 104, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: spForm.image ? "transparent" : T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, overflow: "hidden", flexShrink: 0 }}>
                {spForm.image ? <img src={spForm.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📷 صورة"}
              </ImagePickButton>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>اسم البرومبت</label>
                <Inp value={spForm.name} onChange={v => setSpForm(p => ({ ...p, name: v }))} placeholder="مثلاً: تلبيس استوديو أبيض" />
              </div>
            </div>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>نص البرومبت</label>
            <textarea value={spForm.prompt} onChange={e => setSpForm(p => ({ ...p, prompt: e.target.value }))} rows={6} placeholder="الصق البرومبت الكامل هنا..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 2, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 110, outline: "none", lineHeight: 1.6, marginBottom: 12 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn ghost onClick={() => setSpForm(null)}>إلغاء</Btn>
              <Btn primary onClick={addSavedPrompt}>💾 حفظ في المكتبة</Btn>
            </div>
          </div>
        </div>
      )}

      {/* library add/edit modal — مكتبة تجربة الملابس */}
      {libEditFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setLibEditFor(null); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 480, padding: 20, border: "1px solid " + T.brd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>{libEditFor.id ? "✏️ تعديل برومبت" : "➕ إضافة برومبت"} <span style={{ fontSize: FS - 2, color: T.accent }}>· {libEditFor.group}</span></div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12 }}>برومبت تجربة ملابس بصورة مثال — يتنفّذ بضغطة على صورة المصدر.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {allGroups.map(g => <Chip key={g} on={libEditFor.group === g} onClick={() => setLibEditFor(p => ({ ...p, group: g }))}>{g}</Chip>)}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              <ImagePickButton data={data} imagesOnly onFile={onLibEditImage} onPickUrl={url => setLibEditFor(p => ({ ...(p || {}), image: url }))}
                triggerStyle={{ width: 80, height: 104, borderRadius: 10, border: "1px dashed " + T.accent + "66", background: libEditFor.image ? "transparent" : T.accent + "0D", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS - 2, fontWeight: 700, overflow: "hidden", flexShrink: 0 }}>
                {libEditFor.image ? <img src={libEditFor.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📷 صورة"}
              </ImagePickButton>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>اسم البرومبت</label>
                <Inp value={libEditFor.name} onChange={v => setLibEditFor(p => ({ ...p, name: v }))} placeholder="مثلاً: BOY #1" />
              </div>
            </div>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>نص البرومبت</label>
            <textarea value={libEditFor.prompt} onChange={e => setLibEditFor(p => ({ ...p, prompt: e.target.value }))} rows={6} placeholder="الصق البرومبت الكامل هنا..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 2, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 110, outline: "none", lineHeight: 1.6, marginBottom: 12 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn ghost onClick={() => setLibEditFor(null)}>إلغاء</Btn>
              <Btn primary onClick={saveLibEdit}>💾 حفظ</Btn>
            </div>
          </div>
        </div>
      )}

      <BlockingOverlay show={!!libBusy} text={libBusy || "..."} />

      {/* edit modal */}
      {editFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={e => { if(e.target === e.currentTarget) setEditFor(null); }}>
          <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 540, padding: 20, border: "1px solid " + T.brd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>✏️ تعديل الصورة بالذكاء الاصطناعي</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10 }}>اختار تعديل جاهز أو اكتب اللي إنت عايزه — هيتطبّق على الصورة دي مباشرة (نفس القطعة).</div>
            <img src={editFor.url} alt="" style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid " + T.brd, marginBottom: 10 }} />
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>🌄 تغيير الخلفية لمشهد طبيعي</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{SCENERY_BACKGROUNDS.map(s => <Chip key={s.id} on={editInstr === s.instr} onClick={() => setEditInstr(s.instr)}>{s.label}</Chip>)}</div>
            <div style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, marginBottom: 6 }}>⚡ تعديلات سريعة</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{QUICK_EDITS.map(q => <Chip key={q.id} on={editInstr === q.instr} onClick={() => setEditInstr(q.instr)}>{q.label}</Chip>)}</div>
            <textarea value={editInstr} onChange={e => setEditInstr(e.target.value)} rows={3} placeholder="أو اكتب تعديلك: غيّر الخلفية لحديقة · خلّي الموديل بيبتسم · أضف حذاء أبيض" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 64, outline: "none", marginBottom: 12 }} />
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
