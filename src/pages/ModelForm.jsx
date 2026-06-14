/* ═══════════════════════════════════════════════════════════════
   CLARK — ModelForm.jsx (V21.22.3)

   فورم إنشاء/تعديل الموديل، مقسّم تابات (زي عرض الأوردر):
     🧵 القماش والخامات · 🎨 اللون/المقاس (+صور) · 🔘 الاكسسوار · 📎 المرفقات
   بيعيد استخدام FCTable/AccPicker المُختبَرين. الموديل = وصفة (من غير
   PO/حالة/كميات تنفيذ). الناتج متوافق مع buildOrderFromModel.
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, Inp, Sel, SearchSel, FCTable, AccPicker } from "../components/ui.jsx";
import { FCOL, FKEYS, FS } from "../constants/index.js";
import { T } from "../theme.js";
import { gIcon, gid, getSizesFromSet } from "../utils/format.js";
import { uploadOrderImageFile, deleteOrderImage } from "../utils/orderImages.js";
import { uploadMultiple, deleteAttachment, getFileIcon, formatFileSize, isAllowedFile, MAX_FILE_SIZE } from "../utils/attachments.js";
import { compressImage } from "../utils/image.js";
import { tell, showToast } from "../utils/popups.js";

const TABS = [
  { id: "fabrics",   label: "🧵 القماش والخامات" },
  { id: "colorsize", label: "🎨 اللون / المقاس" },
  { id: "acc",       label: "🔘 الاكسسوار" },
  { id: "attach",    label: "📎 المرفقات" },
];

/* أسماء الألوان الفريدة عبر كل الأقمشة (للصور) */
function uniqueColors(form){
  const seen = new Set(); const out = [];
  FKEYS.forEach(k => (form["colors" + k] || []).forEach(c => {
    const n = ((c && c.color) || "").trim();
    if(n && !seen.has(n)){ seen.add(n); out.push({ name: n, hex: (c && c.colorHex) || "#cbd5e1" }); }
  }));
  return out;
}

export function ModelForm({ data, initial, onSave, onCancel, isMob, upConfig, user }){
  const [form, setForm] = useState(initial);
  const [tab, setTab] = useState("fabrics");
  const [errs, setErrs] = useState([]);
  const [visibleFabricCount, setVisibleFabricCount] = useState(() => Math.max(1, FKEYS.filter(k => initial["fabric" + k]).length));
  const [uploadingImg, setUploadingImg] = useState(false);
  const [qfab, setQfab] = useState(null);
  const [busyAttach, setBusyAttach] = useState(false);

  const updF = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const fabObj = (id) => (data.fabrics || []).find(f => String(f.id) === String(id));
  const fabOpts = (data.fabrics || []).map(f => ({ value: String(f.id), label: f.name + " — " + f.price + " ج.م/" + f.unit }));
  const ssPps = (() => { const ss = (data.sizeSets || []).find(s => s.id === Number(form.sizeSetId)); return ss ? ss.pcsPerSeries : 0; })();

  /* ── الصورة الرئيسية ── */
  const handleImg = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if(!f) return;
    if(!f.type.startsWith("image/")){ await tell("نوع غير مدعوم", "الملف لازم يكون صورة", { type: "warning" }); return; }
    setUploadingImg(true);
    try {
      const oldPath = form.imageStoragePath;
      const meta = await uploadOrderImageFile(form.id || initial?.id || gid(), f);
      setForm(p => ({ ...p, image: meta.url, imageStoragePath: meta.storagePath }));
      if(oldPath) deleteOrderImage(oldPath).catch(() => {});
    } catch(err){ await tell("فشل رفع الصورة", err?.message || String(err), { type: "error" }); }
    finally { setUploadingImg(false); }
  };

  /* ── صور الألوان/المقاسات (base64 مضغوط على الموديل — per-doc آمن) ── */
  const pickAssetImg = async (file, applyFn) => {
    if(!file) return;
    if(!(file.type || "").startsWith("image/")){ showToast("⚠️ اختر صورة"); return; }
    try { const url = await compressImage(file, 400, 0.6); applyFn(url); }
    catch(_){ showToast("⛔ فشل تحميل الصورة"); }
  };
  const setColorImg = (name, url) => setForm(p => { const m = { ...(p.colorImages || {}) }; if(url) m[name] = url; else delete m[name]; return { ...p, colorImages: m }; });
  const setSizeImg = (name, url) => setForm(p => { const m = { ...(p.sizeImages || {}) }; if(url) m[name] = url; else delete m[name]; return { ...p, sizeImages: m }; });

  /* ── المرفقات (Storage) ── */
  const handleAttach = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if(files.length === 0) return;
    const bad = files.find(f => !isAllowedFile(f) || f.size > MAX_FILE_SIZE);
    if(bad){ await tell("ملف غير صالح", "نوع غير مدعوم أو الحجم أكبر من المسموح: " + bad.name, { type: "warning" }); return; }
    setBusyAttach(true);
    try {
      const uploaded = await uploadMultiple(form.id || initial?.id || gid(), files, (user && (user.displayName || user.email)) || "");
      setForm(p => ({ ...p, attachments: [...(p.attachments || []), ...uploaded] }));
      showToast("✓ تم رفع " + uploaded.length + " مرفق");
    } catch(err){ await tell("فشل الرفع", err?.message || String(err), { type: "error" }); }
    finally { setBusyAttach(false); }
  };
  const removeAttach = async (att) => {
    setForm(p => ({ ...p, attachments: (p.attachments || []).filter(a => a !== att) }));
    if(att.storagePath) deleteAttachment(att.storagePath).catch(() => {});
  };

  const addFabric = () => setVisibleFabricCount(c => Math.min(FKEYS.length, c + 1));
  const removeFabric = (k) => {
    setForm(p => { const n = { ...p }; n["fabric" + k] = ""; n["cons" + k] = 0; n["pcsPerLayer" + k] = 0; n["cutDate" + k] = ""; n["colors" + k] = []; n["fabricPieces" + k] = []; n["fabric" + k + "Label"] = ""; n["fabric" + k + "Price"] = 0; n["fabric" + k + "Unit"] = ""; return n; });
    const idx = FKEYS.indexOf(k);
    if(idx === visibleFabricCount - 1) setVisibleFabricCount(c => Math.max(1, c - 1));
  };

  const save = () => {
    const v = [];
    if(!(form.modelNo || "").trim()) v.push("رقم/اسم الموديل مطلوب");
    if(!(form.modelDesc || "").trim()) v.push("وصف الموديل مطلوب");
    if(!form.sizeSetId) v.push("المقاس مطلوب (تاب اللون/المقاس)");
    if(!form.fabricA) v.push("لازم خامة واحدة على الأقل");
    if((form.colorsA || []).filter(c => (c.color || "").trim()).length === 0) v.push("لازم لون واحد على الأقل في الخامة الأولى");
    if(v.length > 0){ setErrs(v); return; }
    setErrs([]);
    const ss = (data.sizeSets || []).find(s => s.id === Number(form.sizeSetId));
    const o = { ...form, sizeLabel: ss ? ss.label : "", _isModel: true };
    if(!o.id) o.id = gid();
    FKEYS.forEach(k => { const fb = fabObj(o["fabric" + k]); o["fabric" + k + "Label"] = fb ? (fb.name + " - " + fb.unit) : ""; o["fabric" + k + "Price"] = fb ? fb.price : 0; o["fabric" + k + "Unit"] = fb ? fb.unit : ""; });
    delete o.poNumber; delete o.status; delete o.cutQty; delete o._docId;
    onSave(o);
  };

  const visible = FKEYS.slice(0, visibleFabricCount);
  const sizes = getSizesFromSet(form, data).sizes || [];
  const cols = uniqueColors(form);
  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 };

  return <Card title={initial.id ? "🧩 تعديل موديل" : "🧩 موديل جديد"} accent={"linear-gradient(135deg," + T.accent + "," + T.accent + "CC)"}
    extra={<div style={{display:"flex",gap:8}}><Btn small onClick={save} style={{background:"#fff",color:T.accent,border:"none",fontWeight:700}}>حفظ</Btn><Btn small onClick={onCancel} style={{background:"rgba(255,255,255,0.3)",color:"#fff",border:"none"}}>الغاء</Btn></div>}
    style={{marginBottom:20}}>

    {errs.length > 0 && <div style={{background:T.err+"12",border:"1px solid "+T.err+"40",borderRadius:10,padding:"8px 12px",marginBottom:12}}>{errs.map((e,i) => <div key={i} style={{fontSize:FS-1,color:T.err,fontWeight:600}}>• {e}</div>)}</div>}

    {/* ── Header: image + identity (always visible) ── */}
    <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{position:"relative",width:88,height:110,borderRadius:12,overflow:"hidden",border:"1.5px solid "+T.brd,flexShrink:0,background:T.bg}}>
        {form.image ? <img src={form.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>🧩</div>}
        <input type="file" accept="image/*" onChange={handleImg} disabled={uploadingImg} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
        {uploadingImg && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:FS-2,fontWeight:700}}>⏳</div>}
      </div>
      <div style={{flex:1,minWidth:200,display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr",gap:8,alignContent:"start"}}>
        <div><label style={lbl}>رقم الموديل *</label><Inp value={form.modelNo} onChange={v => updF("modelNo", v)}/></div>
        <div><label style={lbl}>الوصف *</label><Inp value={form.modelDesc} onChange={v => updF("modelDesc", v)}/></div>
        <div style={{gridColumn:isMob?"auto":"1 / -1"}}>
          <label style={lbl}>قطع الموديل ({(form.orderPieces || []).length}/5)</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <Sel value="" onChange={v => { if(!v || (form.orderPieces || []).length >= 5) return; updF("orderPieces", [...(form.orderPieces || []), v]); }} style={{maxWidth:160}}>
              <option value="">+ اضف قطعة</option>
              {(data.garmentTypes || []).filter(g => !(form.orderPieces || []).includes(g.name)).map(g => <option key={g.id} value={g.name}>{(g.icon || gIcon(g.name)) + " " + g.name}</option>)}
            </Sel>
            {(form.orderPieces || []).map((p, i) => <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.accent+"30",fontSize:FS-2,fontWeight:600,color:T.accent}}>{gIcon(p, data.garmentTypes) + " " + p}<span onClick={() => updF("orderPieces", (form.orderPieces || []).filter((_, j) => j !== i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>×</span></span>)}
          </div>
        </div>
      </div>
    </div>

    {/* ── Tab bar ── */}
    <div style={{display:"flex",gap:4,marginBottom:14,borderBottom:"2px solid "+T.brd,flexWrap:"wrap"}}>
      {TABS.map(t => <div key={t.id} onClick={() => setTab(t.id)} style={{padding:"8px 14px",cursor:"pointer",borderBottom:tab===t.id?"3px solid "+T.accent:"3px solid transparent",marginBottom:-2,fontWeight:tab===t.id?800:600,color:tab===t.id?T.accent:T.textSec,fontSize:FS-1,whiteSpace:"nowrap"}}>{t.label}</div>)}
    </div>

    {/* ── Tab: fabrics ── */}
    {tab === "fabrics" && <div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
        {visible.map((k, idx) => {
          const fid = form["fabric" + k]; const fb = fabObj(fid);
          const fabPieces = form["fabricPieces" + k] || [];
          const effectivePpl = (Number(form["pcsPerLayer" + k]) || 0) || ssPps;
          return <div key={k} style={{background:T.cardSolid,border:"1.5px solid "+T.brd,borderInlineStartWidth:4,borderInlineStartColor:FCOL[idx],borderRadius:12,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:8,fontSize:FS-1,fontWeight:800,background:FCOL[idx]+"15",color:FCOL[idx],border:"1px solid "+FCOL[idx]+"40"}}><span style={{width:8,height:8,borderRadius:2,background:FCOL[idx]}}/>{"خامة "+k+(k==="A"?" *":"")}</span>
              <div style={{flex:1,minWidth:140}}><SearchSel value={fid?String(fid):""} onChange={v => updF("fabric"+k, v)} options={fabOpts} placeholder={k==="A"?"ابحث عن خامة...":"ابحث (اختياري)..."} maxResults={8} showAllOnFocus sx={{padding:"5px 9px",fontSize:FS-1}}/></div>
              {upConfig && <Btn small onClick={() => setQfab({ name:"", unit:"كيلو", price:"", forKey:k })} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",padding:"3px 9px",fontWeight:700}} title="إضافة خامة للمخزن">+</Btn>}
              {idx > 0 && <Btn small onClick={() => removeFabric(k)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"3px 9px",fontWeight:700}}>✕</Btn>}
            </div>
            {fid && <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"6px 0",borderTop:"1px dashed "+T.brd,borderBottom:"1px dashed "+T.brd}}>
              <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>استهلاك/راق</span>
              <Inp type="number" step="any" value={form["cons"+k]} onChange={v => updF("cons"+k, v)} style={{width:65,padding:"4px 6px",fontSize:FS-1,textAlign:"center"}}/>
              <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}} title="القطع في الراق الواحد">قطع/راق</span>
              <Inp type="number" value={form["pcsPerLayer"+k]||""} onChange={v => updF("pcsPerLayer"+k, v)} placeholder={ssPps?String(ssPps):"0"} style={{width:60,padding:"4px 6px",fontSize:FS-1,textAlign:"center"}}/>
            </div>}
            {fid && <FCTable label={"خامة "+k} fabName={fb?fb.name:""} fabPrice={fb?(fb.price+" ج.م/"+fb.unit):""} accent={FCOL[idx]} colors={form["colors"+k]||[]} setColors={c => updF("colors"+k, c)} pcsPerSeries={effectivePpl}/>}
            {fid && (form.orderPieces || []).length > 0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{"قطع خامة "+k+":"}</span>
              {(form.orderPieces || []).map(p => { const sel = fabPieces.includes(p); return <span key={p} onClick={() => updF("fabricPieces"+k, sel?fabPieces.filter(x=>x!==p):[...fabPieces,p])} style={{padding:"4px 10px",borderRadius:8,fontSize:FS-2,fontWeight:600,cursor:"pointer",background:sel?FCOL[idx]+"20":"#F1F5F9",color:sel?FCOL[idx]:T.textMut,border:"1px solid "+(sel?FCOL[idx]+"50":T.brd)}}>{p}</span>; })}
            </div>}
          </div>;
        })}
      </div>
      {visibleFabricCount < FKEYS.length && <Btn small onClick={addFabric} style={{marginTop:12,background:T.accent+"10",color:T.accent,border:"1px dashed "+T.accent+"40",fontWeight:700}}>+ إضافة خامة</Btn>}
    </div>}

    {/* ── Tab: color / size (+ images) ── */}
    {tab === "colorsize" && <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{maxWidth:320}}>
        <label style={lbl}>المقاس *</label>
        <Sel value={form.sizeSetId} onChange={v => updF("sizeSetId", v)}>
          <option value="">-- اختر --</option>
          {(data.sizeSets || []).map(s => <option key={s.id} value={s.id}>{s.label + (s.pcsPerSeries ? " (" + s.pcsPerSeries + " قطعة/سيري)" : "")}</option>)}
        </Sel>
      </div>
      {/* color images */}
      <div>
        <div style={{fontSize:FS,fontWeight:800,color:T.text,marginBottom:8}}>🎨 صور الألوان {cols.length>0?"("+cols.length+")":""}</div>
        {cols.length === 0 ? <div style={{fontSize:FS-2,color:T.textMut,background:T.bg,borderRadius:8,padding:"8px 10px"}}>أضف ألوان في تاب القماش والخامات الأول، وبعدين ترفع صورة لكل لون هنا.</div>
          : <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>
            {cols.map(c => { const img = (form.colorImages || {})[c.name]; return <div key={c.name} style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden",background:T.cardSolid}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"3/4",background:T.bg}}>
                {img ? <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{width:28,height:28,borderRadius:"50%",background:c.hex,border:"1px solid rgba(0,0,0,0.15)"}}/></div>}
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files&&e.target.files[0]; pickAssetImg(f, url => setColorImg(c.name, url)); e.target.value=""; }} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
                {img && <span onClick={() => setColorImg(c.name, "")} style={{position:"absolute",top:4,insetInlineEnd:4,background:T.err,color:"#fff",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,cursor:"pointer"}}>✕</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",fontSize:FS-2,fontWeight:600}}><span style={{width:11,height:11,borderRadius:"50%",background:c.hex,border:"1px solid rgba(0,0,0,0.15)",flexShrink:0}}/>{c.name}</div>
            </div>; })}
          </div>}
      </div>
      {/* size images */}
      <div>
        <div style={{fontSize:FS,fontWeight:800,color:T.text,marginBottom:8}}>📏 صور المقاسات {sizes.length>0?"("+sizes.length+")":""}</div>
        {sizes.length === 0 ? <div style={{fontSize:FS-2,color:T.textMut,background:T.bg,borderRadius:8,padding:"8px 10px"}}>اختر المقاس فوق الأول.</div>
          : <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(auto-fill,minmax(100px,1fr))",gap:10}}>
            {sizes.map(sz => { const img = (form.sizeImages || {})[sz]; return <div key={sz} style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden",background:T.cardSolid}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"1",background:T.bg}}>
                {img ? <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:FS-1,fontWeight:800,color:T.textMut}}>{sz}</div>}
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files&&e.target.files[0]; pickAssetImg(f, url => setSizeImg(sz, url)); e.target.value=""; }} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
                {img && <span onClick={() => setSizeImg(sz, "")} style={{position:"absolute",top:4,insetInlineEnd:4,background:T.err,color:"#fff",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,cursor:"pointer"}}>✕</span>}
              </div>
              <div style={{textAlign:"center",padding:"4px 6px",fontSize:FS-2,fontWeight:700,color:T.textSec}}>{sz}</div>
            </div>; })}
          </div>}
      </div>
    </div>}

    {/* ── Tab: accessories ── */}
    {tab === "acc" && <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:FS,fontWeight:800,color:T.text}}>🔘 الاكسسوار {(form.accItems||[]).length>0?"("+(form.accItems||[]).length+")":""}</span>
        {(data.accessories || []).length > (form.accItems || []).length && <Btn ghost small onClick={() => updF("accItems", (data.accessories || []).map(a => ({ accId:a.id, name:a.name, price:a.price })))} style={{color:T.ok}}>+ اضافة الكل</Btn>}
      </div>
      <AccPicker accItems={form.accItems || []} dbAcc={data.accessories} onChange={items => updF("accItems", items)}/>
    </div>}

    {/* ── Tab: attachments ── */}
    {tab === "attach" && <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <label style={{cursor:busyAttach?"wait":"pointer",padding:"9px 16px",borderRadius:8,background:T.accent+"12",color:T.accent,border:"1px dashed "+T.accent+"55",fontSize:FS-1,fontWeight:700}}>
          {busyAttach ? "⏳ جاري الرفع..." : "📎 إضافة مرفقات"}
          <input type="file" multiple onChange={handleAttach} disabled={busyAttach} style={{display:"none"}}/>
        </label>
        <span style={{fontSize:FS-3,color:T.textMut}}>(صور / PDF / ملفات — حد أقصى {formatFileSize(MAX_FILE_SIZE)} للملف)</span>
      </div>
      {(form.attachments || []).length === 0 ? <div style={{fontSize:FS-2,color:T.textMut,textAlign:"center",padding:24}}>مفيش مرفقات</div>
        : <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {(form.attachments || []).map((a, i) => <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid}}>
            <span style={{fontSize:20}}>{getFileIcon(a.name)}</span>
            <a href={a.downloadURL} target="_blank" rel="noreferrer" style={{flex:1,minWidth:0,color:T.text,fontWeight:600,fontSize:FS-1,textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap"}}>{a.name}</a>
            <span style={{fontSize:FS-3,color:T.textMut}}>{formatFileSize(a.size)}</span>
            <Btn small onClick={() => removeAttach(a)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🗑</Btn>
          </div>)}
        </div>}
    </div>}

    {/* footer save */}
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16,borderTop:"1px solid "+T.brd,paddingTop:14}}>
      <Btn ghost onClick={onCancel}>الغاء</Btn>
      <Btn primary onClick={save}>💾 {initial.id ? "حفظ التعديلات" : "إضافة الموديل"}</Btn>
    </div>

    {/* quick-add fabric */}
    {qfab && <div onClick={() => setQfab(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:10005,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid,borderRadius:14,padding:20,width:"min(420px,100%)",border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.text,marginBottom:12}}>+ خامة جديدة للمخزن</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><label style={lbl}>اسم الخامة</label><Inp value={qfab.name} onChange={v => setQfab({ ...qfab, name:v })}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={lbl}>الوحدة</label><Inp value={qfab.unit} onChange={v => setQfab({ ...qfab, unit:v })}/></div>
            <div><label style={lbl}>السعر</label><Inp type="number" value={qfab.price} onChange={v => setQfab({ ...qfab, price:v })}/></div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={() => setQfab(null)}>الغاء</Btn>
            <Btn primary onClick={() => { if(!qfab.name.trim() || !qfab.price) return; const newId = Date.now(); upConfig(d => { if(!d.fabrics) d.fabrics = []; d.fabrics.push({ id:newId, name:qfab.name.trim(), unit:qfab.unit, price:Number(qfab.price)||0 }); }); updF("fabric"+qfab.forKey, String(newId)); setQfab(null); showToast("✓ تم اضافة الخامة"); }}>حفظ واختيار</Btn>
          </div>
        </div>
      </div>
    </div>}
  </Card>;
}

export default ModelForm;
