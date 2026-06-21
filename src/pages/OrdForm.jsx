/* ═══════════════════════════════════════════════════════════════
   CLARK - OrdForm.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: OrdForm
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useMemo } from "react";
import { AccPicker, Badge, Btn, Card, FCTable, Inp, Sel, SearchSel } from "../components/ui.jsx";
/* V21.9.108: Universal Tagging — Slice 7 Order integration. TagPicker
   on the order edit form; the order list filter/chips live in DetPg. */
import { TagPicker } from "../components/TagPicker.jsx";
import { DEFAULT_STATUSES, FCOL, FKEYS, FS } from "../constants/index.js";
import { T, TD, TDL } from "../theme.js";
import { gIcon, setF, sqty, gid, fmt } from "../utils/format.js";
/* V19.36: Model images now upload to Firebase Storage at 1280px @ 85% quality
   (was: 250px @ 40% inline base64). The order doc only stores the download URL. */
import { uploadOrderImageFile, deleteOrderImage } from "../utils/orderImages.js";
/* V21.25.9: صورة الموديل الأساسية تفتح قايمة (كمبيوتر/مساحة التخزين) زي تاب اللون */
import { ImagePickButton } from "../components/DocumentImagePicker.jsx";
import { sortOrders, validateOrder, checkStockAvailability } from "../utils/orders.js";
import { askInput, showToast, tell } from "../utils/popups.js";
/* V19.37: removed compressFile import — file attachments inside OrdForm were retired */
import { getUnits } from "../utils/units.js";

export function OrdForm({data,initial,onSave,onCancel,isMob,statusCards,upConfig,modelMode=false}){
  const[form,setForm]=useState(initial);const[errs,setErrs]=useState([]);
  const[editStatusForm,setEditStatusForm]=useState(false);
  const[copyMode,setCopyMode]=useState(false);const[copyFrom,setCopyFrom]=useState("");
  const[copyFields,setCopyFields]=useState({fabrics:true,pieces:true,sizes:true,acc:true,instructions:true});
  const[qfab,setQfab]=useState(null);/* quick add fabric popup */
  /* V19.80.3: dynamic fabric slots — initially A only; "+ إضافة خامة" reveals
     the next letter (B, C, ... up to FKEYS.length). Initial value derived from
     existing form data so editing an order with 3 fabrics shows 3 slots. */
  const[visibleFabricCount,setVisibleFabricCount]=useState(()=>{
    let n=1;for(let i=FKEYS.length-1;i>=0;i--){if(initial&&initial["fabric"+FKEYS[i]]){n=i+1;break}}return n;
  });
  /* V19.36: track upload progress so the user sees feedback while Storage processes the file */
  const[uploadingImg,setUploadingImg]=useState(false);
  const fabObj=id=>data.fabrics.find(x=>x.id===Number(id));
  /* V21.27.86: لو المخزن مفعّل، نعرض بادج توافر للخامة المختارة + نمنع تسجيل
     أوردر القص لو الاستهلاك أكبر من المتاح بالمخزن (نفس منطق App.jsx). */
  const stockEnabled=!!((data.purchaseSettings||{}).stockEnabled);
  /* V19.36: handleImg now uploads to Storage instead of base64-encoding inline.
     If the user is replacing an existing Storage-backed image, the old object
     is deleted first (best-effort, fire-and-forget). */
  /* V21.25.9: ياخد File مباشرة (من ImagePickButton) — رفع لصورة الموديل الأساسية. */
  const uploadMainImage=async f=>{
    if(!f)return;
    if(!f.type.startsWith("image/")){await tell("نوع غير مدعوم","الملف لازم يكون صورة (JPEG/PNG/WebP)",{type:"warning"});return}
    setUploadingImg(true);
    try {
      const oldPath=form.imageStoragePath;
      const meta=await uploadOrderImageFile(form.id||initial?.id,f);
      setForm(p=>({...p,image:meta.url,imageStoragePath:meta.storagePath}));
      if(oldPath){
        deleteOrderImage(oldPath).catch(err=>console.warn("[V19.36] old image cleanup failed:",err));
      }
    } catch(err){
      console.error("[V19.36] model image upload failed:",err);
      await tell("فشل رفع الصورة",err?.message||String(err),{type:"error"});
    } finally {
      setUploadingImg(false);
    }
  };
  /* V21.25.9: ربط صورة جاهزة من مساحة التخزين (URL — مفيش رفع جديد). */
  const linkMainImage=(url)=>{
    if(!url)return;
    const oldPath=form.imageStoragePath;
    setForm(p=>({...p,image:url,imageStoragePath:""}));
    if(oldPath) deleteOrderImage(oldPath).catch(err=>console.warn("[V21.25.9] old image cleanup failed:",err));
  };
  /* V19.37: handleFile removed — file attachments inside OrdForm were retired (per user request) */
  const mainQty=sqty(form.colorsA);const updF=(key,val)=>setForm(p=>setF(p,key,val));
  /* V21.27.5: الأوردر اللي اتولّد من موديل (form.modelId موجود) = الخامات/القطع/
     المقاسات اتقفلت (بتتعرّف في الموديل بس). المستخدم بيدخل الراقات + يقدر يضيف
     ألوان. modelMode (الفورم نفسه كموديل) مستثنى. */
  const fromModel=!modelMode&&!!form.modelId;
  const isDirty=form.modelNo||form.modelDesc||form.fabricA||(form.colorsA||[]).some(c=>c.color||c.layers>0);
  useEffect(()=>{window.__formDirty=!!isDirty;return()=>{window.__formDirty=false}},[isDirty]);
  const[dupPopup,setDupPopup]=useState(false);const[dupModelNo,setDupModelNo]=useState("");
  const[cancelPopup,setCancelPopup]=useState(false);
  const handleCancel=()=>{if(isDirty){setCancelPopup(true)}else{onCancel()}};
  const[dupPoPopup,setDupPoPopup]=useState(false);
  /* Auto-generate PO number — sequential (V14.48).
     V21.27.5: لو في رقم موديل → النمط «#<رقم الموديل>-NNN» تسلسلي لكل موديل
     (كل موديل يبدأ من 001). غير كده → النمط العام «PO-NNN». */
  const genPO=()=>{
    const mn=((form.modelNo||initial?.modelNo)||"").trim();
    if(mn){
      const prefix="#"+mn+"-";
      const existing=data.orders.filter(o=>o.poNumber&&o.poNumber.startsWith(prefix)&&o.id!==form.id);
      const nums=existing.map(o=>{const rest=o.poNumber.substring(prefix.length);return /^\d+$/.test(rest)?(Number(rest)||0):0;});
      const next=nums.length>0?Math.max(...nums)+1:1;
      return prefix+String(next).padStart(3,"0");
    }
    const prefix=(data.poPrefix||"PO-");
    const digits=Number(data.poDigits)||3;
    /* Find max existing number across all orders with matching prefix */
    const existing=data.orders.filter(o=>o.poNumber&&o.poNumber.startsWith(prefix));
    const nums=existing.map(o=>{
      const rest=o.poNumber.substring(prefix.length);
      /* Only count pure numeric suffix (no extra dashes = new format) */
      if(/^\d+$/.test(rest))return Number(rest)||0;
      return 0;
    });
    const next=nums.length>0?Math.max(...nums)+1:1;
    return prefix+String(next).padStart(digits,"0");
  };
  /* V21.27.5: تعبئة رقم أمر التشغيل تلقائياً للأوامر المتولّدة من موديل. */
  useEffect(()=>{
    if(fromModel&&!form.poNumber&&((form.modelNo||"").trim())){
      const pn=genPO();
      setForm(p=>p.poNumber?p:{...p,poNumber:pn});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fromModel]);
  const save=()=>{
    /* V21.22.0: model mode — وصفة بس (من غير PO/حالة/كميات). تحقّق أخف. */
    if(modelMode){
      const v=[];
      if(!form.modelNo||!form.modelNo.trim())v.push("رقم/اسم الموديل مطلوب");
      if(!form.modelDesc||!form.modelDesc.trim())v.push("وصف الموديل مطلوب");
      if(!form.sizeSetId)v.push("المقاس مطلوب");
      if(!form.fabricA)v.push("لازم خامة واحدة على الأقل");
      if((form.colorsA||[]).filter(c=>(c.color||"").trim()).length===0)v.push("لازم لون واحد على الأقل في الخامة الأولى");
      if(v.length>0){setErrs(v);return}setErrs([]);
      const ss=data.sizeSets.find(s=>s.id===Number(form.sizeSetId));
      const o={...form,sizeLabel:ss?ss.label:"",_isModel:true};
      if(!o.id)o.id=gid();
      FKEYS.forEach(k=>{const fb=fabObj(o["fabric"+k]);o["fabric"+k+"Label"]=fb?(fb.name+" - "+fb.unit):"";o["fabric"+k+"Price"]=fb?fb.price:0;o["fabric"+k+"Unit"]=fb?fb.unit:""});
      delete o.poNumber;delete o.status;delete o.cutQty;delete o._docId;
      onSave(o);
      return;
    }
    const v=validateOrder(form);if(v.length>0){setErrs(v);return}setErrs([]);
    /* V21.27.86: امنع تسجيل أوردر القص لو المخزن غير كافٍ للخامة المطلوبة.
       checkStockAvailability بترجّع ok:true لو المخزن متعطّل (stockEnabled/
       autoDeductOnCut)، فالقيد ده آمن في كل الحالات — ومتسق مع بلوك App.jsx. */
    const sc=checkStockAvailability(form,data);
    if(!sc.ok){
      setErrs(["⛔ المخزن غير كافٍ — لا يمكن تسجيل الأوردر للقص:",...sc.shortages.map(s=>"• "+s.itemName+": المطلوب "+fmt(s.needed)+" "+(s.unit||"")+"، المتاح "+fmt(s.available)+"، الفرق "+fmt(s.shortage)+" "+(s.unit||""))]);
      return;
    }
    /* Auto-generate PO if empty */
    let finalForm={...form};
    if(!finalForm.poNumber)finalForm.poNumber=genPO();
    /* Check uniqueness */
    const dupPo=data.orders.find(o=>o.poNumber===finalForm.poNumber&&o.id!==finalForm.id);
    if(dupPo){setDupPoPopup(true);return}
    const ss=data.sizeSets.find(s=>s.id===Number(finalForm.sizeSetId));const o={...finalForm,cutQty:mainQty,sizeLabel:ss?ss.label:""};FKEYS.forEach(k=>{const fb=fabObj(o["fabric"+k]);o["fabric"+k+"Label"]=fb?(fb.name+" - "+fb.unit):"";o["fabric"+k+"Price"]=fb?fb.price:0;o["fabric"+k+"Unit"]=fb?fb.unit:""});delete o._docId;onSave(o)};
  const doCopy=()=>{const src=data.orders.find(o=>o.id===copyFrom);if(!src)return;setForm(p=>{const n={...p};
    if(copyFields.sizes){n.sizeSetId=src.sizeSetId;n.sizeLabel=src.sizeLabel}
    if(copyFields.fabrics)FKEYS.forEach(k=>{n["fabric"+k]=src["fabric"+k]||"";n["cons"+k]=src["cons"+k]||"";n["colors"+k]=JSON.parse(JSON.stringify(src["colors"+k]||[]));n["cutDate"+k]=src["cutDate"+k]||"";n["fabricPieces"+k]=src["fabricPieces"+k]||[]});
    if(copyFields.pieces)n.orderPieces=[...(src.orderPieces||[])];
    if(copyFields.acc)n.accItems=JSON.parse(JSON.stringify(src.accItems||[]));
    if(copyFields.instructions)n.instructions=src.instructions||"";
    return n});setCopyMode(false);setCopyFrom("")};
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const toggleCF=k=>setCopyFields(p=>({...p,[k]:!p[k]}));
  const[tplMode,setTplMode]=useState(false);
  const templates=data.orderTemplates||[];
  const saveTpl=async()=>{const name=await askInput("حفظ قالب جديد",{label:"اسم القالب:",placeholder:"مثال: قميص أطفال",validate:v=>v.trim()?null:"الاسم مطلوب"});if(!name)return;const tpl={name,sizeSetId:form.sizeSetId,orderPieces:[...(form.orderPieces||[])],accItems:JSON.parse(JSON.stringify(form.accItems||[])),instructions:form.instructions||""};FKEYS.forEach(k=>{tpl["fabric"+k]=form["fabric"+k]||"";tpl["cons"+k]=form["cons"+k]||"";tpl["fabricPieces"+k]=form["fabricPieces"+k]||[]});upConfig(d=>{if(!d.orderTemplates)d.orderTemplates=[];d.orderTemplates.push({id:Date.now(),...tpl})});showToast("✓ تم حفظ القالب")};
  const loadTpl=(tpl)=>{setForm(p=>{const n={...p};n.sizeSetId=tpl.sizeSetId||"";n.orderPieces=[...(tpl.orderPieces||[])];n.accItems=JSON.parse(JSON.stringify(tpl.accItems||[]));n.instructions=tpl.instructions||"";FKEYS.forEach(k=>{n["fabric"+k]=tpl["fabric"+k]||"";n["cons"+k]=tpl["cons"+k]||"";n["fabricPieces"+k]=tpl["fabricPieces"+k]||[];n["colors"+k]=k==="A"?[{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]:[];n["cutDate"+k]=new Date().toISOString().split("T")[0]});return n});setTplMode(false);showToast("✓ تم تحميل القالب")};

  if(copyMode)return<Card title="نسخ بيانات من أوردر" accent={"linear-gradient(135deg,"+T.purple+","+T.purple+"CC)"} style={{marginBottom:20}}>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:FS,fontWeight:600,color:T.textSec,marginBottom:6}}>اختر الأوردر المصدر</label>
      <Sel value={copyFrom} onChange={setCopyFrom}><option value="">-- اختر أوردر --</option>{sortOrders(data.orders).map(o=><option key={o.id} value={o.id}>{o.modelNo+" - "+o.modelDesc}</option>)}</Sel>
    </div>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:FS,fontWeight:600,color:T.textSec,marginBottom:8}}>البيانات المراد نسخها</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        {[["fabrics","الخامات والألوان"],["pieces","قطع الموديل"],["sizes","المقاسات"],["acc","الاكسسوار"],["instructions","تعليمات التشغيل"]].map(([k,l])=><span key={k} onClick={()=>toggleCF(k)} style={{padding:"10px 18px",borderRadius:12,fontSize:FS,fontWeight:600,cursor:"pointer",background:copyFields[k]?T.accent+"15":T.bg,color:copyFields[k]?T.accent:T.textMut,border:"1.5px solid "+(copyFields[k]?T.accent+"50":T.brd)}}>{(copyFields[k]?"✓ ":"")+ l}</span>)}
      </div>
    </div>
    <div style={{display:"flex",gap:8}}><Btn primary onClick={doCopy} disabled={!copyFrom}>نسخ البيانات</Btn><Btn ghost onClick={()=>setCopyMode(false)}>الغاء</Btn></div>
  </Card>;

  if(tplMode)return<Card title="📂 قوالب الأوردرات" accent={"linear-gradient(135deg,#F59E0B,#F59E0BCC)"} style={{marginBottom:20}}>
    {templates.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>{templates.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
      <div><span style={{fontWeight:700,fontSize:FS}}>{t.name}</span><span style={{fontSize:FS-2,color:T.textSec,marginRight:8}}>{" — "+(t.orderPieces||[]).length+" قطعة"}</span></div>
      <div style={{display:"flex",gap:6}}><Btn small primary onClick={()=>loadTpl(t)}>تحميل</Btn><Btn danger small onClick={()=>upConfig(d=>{d.orderTemplates=(d.orderTemplates||[]).filter(x=>x.id!==t.id)})}>🗑️</Btn></div>
    </div>)}</div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>لا توجد قوالب محفوظة</div>}
    <div style={{marginTop:12}}><Btn ghost onClick={()=>setTplMode(false)}>↩ رجوع</Btn></div>
  </Card>;

  const _isDup=initial._isDup;
  return<><Card title={modelMode?(initial.id?"🧩 تعديل موديل":"🧩 موديل جديد"):(initial.modelNo?"تعديل الأوردر":_isDup?"تكرار أوردر":"أمر قص جديد")} accent={"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)"} extra={<div style={{display:"flex",gap:8}}>{!modelMode&&!initial.modelNo&&!isMob&&!_isDup&&<Btn small onClick={()=>setTplMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>📂 قوالب</Btn>}{!modelMode&&!initial.modelNo&&!isMob&&!_isDup&&<Btn small onClick={()=>setCopyMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>نسخ من أوردر</Btn>}{!modelMode&&!initial.modelNo&&!isMob&&!_isDup&&data.orders.length>0&&<Btn small onClick={()=>{setDupPopup(true);setDupModelNo("")}} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}} title="تكرار الأوردر">📋 تكرار</Btn>}<Btn small onClick={save} style={{background:"#fff",color:T.accent,border:"none",fontWeight:700}}>حفظ</Btn>{!modelMode&&form.fabricA&&!_isDup&&<Btn small onClick={saveTpl} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none"}}>💾 حفظ كقالب</Btn>}<Btn small onClick={handleCancel} style={{background:"rgba(255,255,255,0.3)",color:"#fff",border:"none"}}>الغاء</Btn></div>} style={{marginBottom:20}}>
    {errs.length>0&&<div style={{background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:12,padding:14,marginBottom:16}}>{errs.map((e,i)=><div key={i} style={{color:T.err,fontSize:FS,fontWeight:600,padding:"2px 0"}}>{"* "+e}</div>)}</div>}
    {dupPoPopup&&<div style={{background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:12,padding:14,marginBottom:16}}>
      <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:6}}>⚠️ رقم أمر التشغيل متكرر</div>
      <div style={{fontSize:FS,color:T.text,marginBottom:8}}>{"الرقم "+form.poNumber+" مستخدم بالفعل في أوردر آخر. كل أمر تشغيل لازم يكون فريد."}</div>
      <div style={{display:"flex",gap:8}}><Btn small onClick={()=>{updF("poNumber",genPO());setDupPoPopup(false)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🔄 توليد رقم جديد</Btn><Btn ghost small onClick={()=>setDupPoPopup(false)}>تعديل يدوي</Btn></div>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr",gap:10,marginBottom:10}}>
      {/* V19.80.6: image upload preview — locked to 4:5 portrait (1080:1350,
           catalog-photo standard). Desktop 144×180 px, full-width × auto on
           mobile. object-fit:cover so any source size is framed cleanly. */}
      <div><ImagePickButton data={data} imagesOnly disabled={uploadingImg} onFile={uploadMainImage} onPickUrl={linkMainImage}
        triggerStyle={{width:isMob?"100%":144,aspectRatio:"4 / 5",borderRadius:12,border:"2px dashed "+(form.image?T.accent+"40":T.brd),display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative",transition:"border-color 0.15s"}}>
        {form.image
          ?<img src={form.image} alt="" loading="eager" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          :<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,color:T.textMut,padding:8,textAlign:"center"}}>
            <span style={{fontSize:32,opacity:0.4,lineHeight:1}}>📷</span>
            <span style={{fontSize:FS-2,fontWeight:600}}>اختر صورة (كمبيوتر/تخزين)</span>
            <span style={{fontSize:FS-3,opacity:0.7}}>1080×1350 (4:5 طولي)</span>
          </div>
        }
        {uploadingImg&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:FS-2,fontWeight:700}}>⏳ جاري الرفع...</div>}
      </ImagePickButton></div>
      <div>
        <div style={{display:"grid",gridTemplateColumns:modelMode?(isMob?"1fr 1fr":"1fr 2fr 1fr"):(isMob?"1fr 1fr":"1fr 1fr 2fr 1fr 1fr 1fr"),gap:6,marginBottom:6}}>
          {!modelMode&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"رقم أمر التشغيل"+(fromModel?" (تلقائي)":"")}</label><Inp value={fromModel?(form.poNumber||genPO()):(form.poNumber||"")} onChange={fromModel?undefined:(v=>updF("poNumber",v))} readOnly={fromModel} placeholder={initial.modelNo?"":(genPO()+" (تلقائي)")} sx={{fontFamily:"monospace",letterSpacing:1,fontWeight:700,color:T.accent}}/></div>}
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>رقم الموديل *</label><Inp value={form.modelNo} onChange={v=>updF("modelNo",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الوصف *</label><Inp value={form.modelDesc} onChange={v=>updF("modelDesc",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"المقاسات"+(fromModel?" (من الموديل)":" *")}</label>{fromModel
            ? <div style={{padding:"7px 10px",borderRadius:8,border:"1px solid "+T.brd,background:T.bg,fontSize:FS-1,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title="المقاسات بتتعرّف في الموديل">{((data.sizeSets.find(s=>s.id===Number(form.sizeSetId))||{}).label)||form.sizeLabel||"—"}</div>
            : <Sel value={form.sizeSetId} onChange={v=>{updF("sizeSetId",v);const ss=data.sizeSets.find(s=>s.id===Number(v));if(ss&&ss.pcsPerSeries){FKEYS.forEach(k=>{const cols=form["colors"+k]||[];if(cols.length>0){const nc=cols.map(c=>(!c.pcsPerLayer||c.pcsPerLayer===0)?{...c,pcsPerLayer:ss.pcsPerSeries,qty:(Number(c.layers)||0)*ss.pcsPerSeries}:c);updF("colors"+k,nc)}})}}}><option value="">-- اختر --</option>{data.sizeSets.map(s=><option key={s.id} value={s.id}>{s.label+(s.pcsPerSeries?" ("+s.pcsPerSeries+" قطعة/سيري)":"")}</option>)}</Sel>}</div>
          {!modelMode&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ *</label><Inp type="date" value={form.date} onChange={v=>updF("date",v)}/></div>}
          {!modelMode&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الحالة</label><div style={{display:"flex",alignItems:"center",gap:6}}>{editStatusForm?<><Sel value={form.status} onChange={v=>{updF("status",v);setEditStatusForm(false)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel><Btn ghost small onClick={()=>setEditStatusForm(false)} title="إغلاق">✕</Btn></>:<><Badge t={form.status} cards={statusCards}/><Btn ghost small onClick={()=>setEditStatusForm(true)} style={{fontSize:FS-3,padding:"2px 8px"}} title="تعديل">✏️</Btn></>}</div></div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr 2fr",gap:6}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"قطع الموديل"+(fromModel?" (من الموديل)":"")}</label>{fromModel
            ? <div style={{padding:"7px 10px",borderRadius:8,border:"1px solid "+T.brd,background:T.bg,fontSize:FS-2,fontWeight:600,color:T.textMut}} title="القطع بتتعرّف في الموديل">مقفولة — من الموديل</div>
            : <Sel value="" onChange={v=>{if(!v||(form.orderPieces||[]).length>=5)return;updF("orderPieces",[...(form.orderPieces||[]),v])}}>
            <option value="">{"-- اضف ("+(form.orderPieces||[]).length+"/5) --"}</option>
            {(data.garmentTypes||[]).filter(g=>!(form.orderPieces||[]).includes(g.name)).map(g=><option key={g.id} value={g.name}>{(g.icon||gIcon(g.name))+" "+g.name}</option>)}
          </Sel>}</div>
          <div style={{display:"flex",gap:4,alignItems:"end",flexWrap:"wrap"}}>
            {(form.orderPieces||[]).map((p,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.accent+"30",fontSize:FS-2,fontWeight:600,color:T.accent}}>{gIcon(p,data.garmentTypes)+" "+p}{!fromModel&&<span onClick={()=>updF("orderPieces",(form.orderPieces||[]).filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800,fontSize:FS-1}}>×</span>}</span>)}
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ماركر (جربر)</label><Inp value={form.marker||""} onChange={v=>updF("marker",v)} placeholder="بيانات الماركر..."/></div>
        </div>
      </div>
    </div>
    {/* ═══════════════════════════════════════════════════════════════
        V19.80.5 — Fabric area: each fabric is ONE self-contained card
        ───────────────────────────────────────────────────────────────
        Per-fabric card layout (all inside the same container):
          ┌─ search row: ●Letter + SearchSel + [+] [✕]
          ├─ inputs row (when fabric selected): استهلاك / قطع/راق / تاريخ
          ├─ FCTable (when fabric selected): colored header band + colors
          └─ pieces chips (when fabric selected + orderPieces exist)
        2 cards per row on screens ≥1280px, 1 card per row below.
        "+ إضافة خامة" button rendered AFTER the grid, not above the
        FCTables — matches the user's mental model ("add another fabric
        only after I'm done with the current one").
       ═══════════════════════════════════════════════════════════════ */}
    {(()=>{
      const ssPps=(()=>{const ss=data.sizeSets.find(s=>s.id===Number(form.sizeSetId));return ss?ss.pcsPerSeries:0})();
      const fabOpts=data.fabrics.map(f=>({value:String(f.id),label:f.name+" — "+f.price+" ج.م/"+f.unit}));
      const visible=FKEYS.slice(0,visibleFabricCount);
      const removeFabric=(k)=>{
        /* V21.9.80 (Bug #11 in cutting audit): align cons/pcsPerLayer types
           with mkOrder() — both initialize numeric fields as 0, not "". The
           old "" caused subtle issues in JSON.stringify diffs and made the
           field shape inconsistent depending on whether the slot was
           filled-then-removed vs never-touched. */
        setForm(p=>{const n={...p};n["fabric"+k]="";n["cons"+k]=0;n["pcsPerLayer"+k]=0;n["cutDate"+k]="";n["colors"+k]=[];n["fabricPieces"+k]=[];n["fabric"+k+"Label"]="";n["fabric"+k+"Price"]=0;n["fabric"+k+"Unit"]="";return n});
        const idx=FKEYS.indexOf(k);
        if(idx===visibleFabricCount-1)setVisibleFabricCount(c=>Math.max(1,c-1));
      };
      return<>
        <style>{`
          .ord-blocks-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px;align-items:start}
          @media (min-width: 1280px){.ord-blocks-grid{grid-template-columns:1fr 1fr}}
          .ord-fab-card{background:${T.cardSolid};border:1.5px solid ${T.brd};border-inline-start-width:4px;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
          .ord-fab-search-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
          .ord-fab-letter{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;font-size:${FS-1}px;font-weight:800;border:1px solid;white-space:nowrap;flex-shrink:0}
          .ord-fab-dot{display:inline-block;width:8px;height:8px;border-radius:2px;flex-shrink:0}
          .ord-fab-search{flex:1;min-width:140px}
          .ord-fab-inputs-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;border-top:1px dashed ${T.brd};border-bottom:1px dashed ${T.brd}}
          .ord-fab-mini-label{font-size:${FS-2}px;color:${T.textSec};white-space:nowrap;flex-shrink:0;font-weight:600}
          /* V21.27.86: بادج توافر المخزن للخامة المختارة */
          .ord-fab-stock-badge{font-size:${FS-2}px;font-weight:700;padding:5px 9px;border-radius:8px;line-height:1.4}
          .ofsb-err{background:${T.err}12;color:${T.err};border:1px solid ${T.err}40}
          .ofsb-ok{background:${T.textMut}10;color:${T.textMut};border:1px solid ${T.brd}}
          .ord-fab-card .fctable-wrap{margin-bottom:0 !important}
          /* V19.80.7: extras blocks (accessories + instructions) live inside the
             same grid as fabrics so they fluidly fill empty cells. When the
             fabric count is odd (1, 3, 5...) the second column has only one
             empty cell on the last row → both extras stack inside that single
             cell via .ord-extras-stack. When the fabric count is even, extras
             flow into separate cells side-by-side. */
          .ord-block-card{background:${T.cardSolid};border:1.5px solid ${T.brd};border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}
          .ord-block-header{display:flex;justify-content:space-between;align-items:center;font-size:${FS}px;font-weight:700;color:${T.accent}}
          .ord-extras-stack{display:flex;flex-direction:column;gap:12px;min-width:0}
        `}</style>
        <div className="ord-blocks-grid">
          {visible.map((k,idx)=>{
            const fid=form["fabric"+k];
            const fb=fabObj(fid);
            const fabPieces=form["fabricPieces"+k]||[];
            const fabricPpl=Number(form["pcsPerLayer"+k])||0;
            const effectivePpl=fabricPpl||ssPps;
            return<div key={k} className="ord-fab-card" style={{borderInlineStartColor:FCOL[idx]}}>
              {/* ─ Search row: letter + SearchSel + add new + remove ─ */}
              <div className="ord-fab-search-row">
                <span className="ord-fab-letter" style={{background:FCOL[idx]+"15",color:FCOL[idx],borderColor:FCOL[idx]+"40"}}>
                  <span className="ord-fab-dot" style={{background:FCOL[idx]}}/>
                  <span>{"خامة "+k+(k==="A"?" *":"")}</span>
                </span>
                <div className="ord-fab-search">
                  {fromModel
                    ? <div style={{padding:"5px 9px",borderRadius:8,border:"1px solid "+T.brd,background:T.bg,fontSize:FS-1,fontWeight:600,color:T.text,minHeight:30,display:"flex",alignItems:"center"}} title="الخامة بتتعرّف في الموديل">{fb?fb.name:"—"}</div>
                    : <SearchSel value={fid?String(fid):""} onChange={v=>updF("fabric"+k,v)} options={fabOpts} placeholder={k==="A"?"ابحث عن خامة...":"ابحث (اختياري)..."} maxResults={8} showAllOnFocus sx={{padding:"5px 9px",fontSize:FS-1}}/>}
                </div>
                {!fromModel&&upConfig&&<Btn small onClick={()=>setQfab({name:"",unit:"كيلو",price:"",forKey:k})} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",padding:"3px 9px",fontSize:FS-1,fontWeight:700}} title="إضافة خامة جديدة للمخزن">+</Btn>}
                {!fromModel&&idx>0&&<Btn small onClick={()=>removeFabric(k)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"3px 9px",fontSize:FS-1,fontWeight:700}} title="حذف الخامة">✕</Btn>}
              </div>
              {/* ─ Inputs row: shown only when a fabric is selected ─ */}
              {fid&&<div className="ord-fab-inputs-row">
                <span className="ord-fab-mini-label">استهلاك/راق</span>
                {fromModel
                  ? <span style={{display:"inline-block",minWidth:46,textAlign:"center",padding:"4px 8px",borderRadius:6,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-1,fontWeight:700,color:T.text}} title="من الموديل">{form["cons"+k]||0}</span>
                  : <Inp type="number" step="any" value={form["cons"+k]} onChange={v=>updF("cons"+k,v)} style={{width:65,padding:"4px 6px",fontSize:FS-1,textAlign:"center"}}/>}
                <span className="ord-fab-mini-label" title="القطع في الراق الواحد — يستخدم تلقائياً عند إضافة لون جديد">قطع/راق</span>
                {fromModel
                  ? <span style={{display:"inline-block",minWidth:42,textAlign:"center",padding:"4px 8px",borderRadius:6,background:T.bg,border:"1px solid "+T.brd,fontSize:FS-1,fontWeight:700,color:T.text}} title="من الموديل">{form["pcsPerLayer"+k]||effectivePpl||0}</span>
                  : <Inp type="number" value={form["pcsPerLayer"+k]||""} onChange={v=>{const newPpl=Number(v)||0;updF("pcsPerLayer"+k,v);const oldDefault=fabricPpl||ssPps;const cols=form["colors"+k]||[];const updated=cols.map(c=>(!c.pcsPerLayer||c.pcsPerLayer===oldDefault)?{...c,pcsPerLayer:newPpl,qty:(Number(c.layers)||0)*newPpl}:c);if(JSON.stringify(updated)!==JSON.stringify(cols))updF("colors"+k,updated)}} placeholder={ssPps?String(ssPps):"0"} style={{width:60,padding:"4px 6px",fontSize:FS-1,textAlign:"center"}}/>}
                <span className="ord-fab-mini-label">تاريخ القص</span>
                <Inp type="date" value={form["cutDate"+k]||""} onChange={v=>updF("cutDate"+k,v)} style={{width:135,padding:"4px 6px",fontSize:FS-1}}/>
              </div>}
              {/* ─ V21.27.86: بادج توافر المخزن — أحمر لو الرصيد صفر أو الاستهلاك
                   أكبر من المتاح (مع توضيح الفرق)، باهت لو المخزن كافٍ. ─ */}
              {stockEnabled&&fid&&fb&&(()=>{
                const avail=Number(fb.stock)||0;
                const consVal=Number(form["cons"+k])||0;
                const layers=(form["colors"+k]||[]).reduce((s,c)=>s+(Number(c.layers)||0),0);
                const needed=Math.round(consVal*layers*100)/100;
                const u=fb.unit||"";
                if(avail<=0)return<div className="ord-fab-stock-badge ofsb-err">{"⛔ الصنف غير متاح بالمخزن (الرصيد صفر)"}</div>;
                if(needed>avail)return<div className="ord-fab-stock-badge ofsb-err">{"⚠️ المطلوب "+fmt(needed)+" "+u+" أكبر من المتاح "+fmt(avail)+" "+u+" — الفرق "+fmt(Math.round((needed-avail)*100)/100)+" "+u+". لا يمكن التسجيل."}</div>;
                return<div className="ord-fab-stock-badge ofsb-ok">{"📦 المتاح بالمخزن: "+fmt(avail)+" "+u+(needed>0?" · المطلوب "+fmt(needed)+" "+u:"")}</div>;
              })()}
              {/* ─ FCTable: shown only when a fabric is selected ─ */}
              {fid&&<div className="fctable-wrap"><FCTable label={"خامة "+k} fabName={fb?fb.name:""} fabPrice={fb?(fb.price+" ج.م/"+fb.unit):""} accent={FCOL[idx]} colors={form["colors"+k]||[]} setColors={c=>updF("colors"+k,c)} pcsPerSeries={effectivePpl}/></div>}
              {/* ─ Pieces chips: shown only when a fabric is selected + pieces exist ─ */}
              {fid&&(form.orderPieces||[]).length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{"قطع خامة "+k+":"}</span>
                {(()=>{const takenByOther=new Set();FKEYS.filter(fk=>fk!==k).forEach(fk=>{(form["fabricPieces"+fk]||[]).forEach(p=>takenByOther.add(p))});
                return(form.orderPieces||[]).map(p=>{const sel=fabPieces.includes(p);const taken=takenByOther.has(p);if(taken&&!sel)return<span key={p} style={{padding:"4px 10px",borderRadius:8,fontSize:FS-2,fontWeight:600,background:"#F1F5F9",color:T.textMut+"80",border:"1px dashed "+T.brd,textDecoration:"line-through",cursor:"default"}}>{p}</span>;return<span key={p} onClick={()=>{const np=sel?fabPieces.filter(x=>x!==p):[...fabPieces,p];updF("fabricPieces"+k,np)}} style={{padding:"4px 10px",borderRadius:8,fontSize:FS-2,fontWeight:600,cursor:"pointer",background:sel?FCOL[idx]+"20":"#F1F5F9",color:sel?FCOL[idx]:T.textMut,border:"1px solid "+(sel?FCOL[idx]+"50":T.brd)}}>{p}</span>})})()}
              </div>}
            </div>;
          })}
          {/* V19.80.7: Accessories + Instructions cards live INSIDE the grid so
              they fluidly fill the cells left empty by fabrics. Even fabric
              count → side-by-side. Odd fabric count → stacked together in the
              single trailing cell so the layout never has a hole. */}
          {(()=>{
            const fabricsFillFullRow=visible.length%2===0;
            const accCard=<div className="ord-block-card" key="acc">
              <div className="ord-block-header">
                <span>📦 بنود التشغيل والاكسسوار{(form.accItems||[]).length>0?" ("+(form.accItems||[]).length+")":""}</span>
                {(data.accessories||[]).length>(form.accItems||[]).length&&<Btn ghost small onClick={()=>{const all=(data.accessories||[]).map(a=>({accId:a.id,name:a.name,unit:a.unit,qtyPerPiece:1,price:a.price}));updF("accItems",all)}} style={{color:T.ok,fontSize:FS-2,padding:"3px 9px"}}>+ اضافة الكل</Btn>}
              </div>
              <AccPicker accItems={form.accItems||[]} dbAcc={data.accessories} onChange={items=>updF("accItems",items)}/>
            </div>;
            const instCard=<div className="ord-block-card" key="inst">
              <div className="ord-block-header"><span>📝 تعليمات التشغيل</span></div>
              <textarea value={form.instructions||""} onChange={e=>updF("instructions",e.target.value)} placeholder="تعليمات تشغيل المصنع، الورش، التشطيب..." style={{width:"100%",minHeight:120,padding:12,borderRadius:10,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,boxSizing:"border-box",resize:"vertical",flex:1}}/>
            </div>;
            /* V21.9.108: Universal Tagging — Order tags card. Mounted alongside
               the accessories + instructions extras so the layout grid still
               flows naturally. allowCreate=true because order editing is gated
               at the page level (canEdit on the details tab). The picker uses
               soft-create so duplicates auto-resolve. */
            const tagsCard=<div className="ord-block-card" key="tags">
              <div className="ord-block-header"><span>🏷️ التاجز</span></div>
              <TagPicker
                entityType="order"
                registry={data.tagRegistry||[]}
                value={form.tags||[]}
                onChange={(ids)=>updF("tags",ids)}
                onRegistryChange={(newReg)=>upConfig(d=>{d.tagRegistry=newReg})}
                allowCreate
                placeholder="إضافة تاج (مثلاً: عاجل، VIP، sample)..."
              />
            </div>;
            /* V21.27.3: نسب الهالك (قماش/إكسسوار) — بنود تكلفة مستقلة لكل أوردر */
            const wasteCard=<div className="ord-block-card" key="waste">
              <div className="ord-block-header"><span>🗑️ نسب الهالك (هدر القماش/الإكسسوار)</span></div>
              <div style={{display:"flex",flexDirection:"column",gap:10,padding:"4px 2px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:FS-1,fontWeight:700,color:T.textSec,minWidth:96}}>هالك القماش %</span><Inp type="number" step="any" value={form.wasteFabricPct||""} onChange={v=>updF("wasteFabricPct",Number(v)||0)} placeholder="0" style={{width:90,textAlign:"center"}}/></div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontSize:FS-1,fontWeight:700,color:T.textSec,minWidth:96}}>هالك الإكسسوار %</span><Inp type="number" step="any" value={form.wasteAccPct||""} onChange={v=>updF("wasteAccPct",Number(v)||0)} placeholder="0" style={{width:90,textAlign:"center"}}/></div>
                <span style={{fontSize:FS-3,color:T.textMut}}>بتتزاد على التكلفة كبنود مستقلة على الكمية الفعلية للأوردر.</span>
              </div>
            </div>;
            return fabricsFillFullRow?<>{accCard}{instCard}{tagsCard}{wasteCard}</>:<div className="ord-extras-stack" key="extras">{accCard}{instCard}{tagsCard}{wasteCard}</div>;
          })()}
        </div>
        {!fromModel&&visibleFabricCount<FKEYS.length&&<div style={{marginBottom:14}}>
          <Btn small onClick={()=>setVisibleFabricCount(c=>Math.min(FKEYS.length,c+1))} style={{background:T.ok+"10",color:T.ok,border:"1.5px dashed "+T.ok+"50",padding:"7px 18px",fontWeight:700,fontSize:FS-1}}>
            {"+ إضافة خامة "+FKEYS[visibleFabricCount]}
          </Btn>
        </div>}
      </>;
    })()}
    {/* V19.80.7: Accessories + Instructions are rendered inside the .ord-blocks-grid above,
        so they auto-flow into empty cells left by fabrics. The standalone divs here are gone. */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:16,borderTop:"1px solid "+T.brd,flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:20,fontWeight:800}}>{"كمية القص (A): "}<span style={{color:T.accent}}>{mainQty}</span></div>
      <div style={{display:"flex",gap:10}}><Btn ghost onClick={handleCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ</Btn></div>
    </div>
    {qfab&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setQfab(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>{"اضافة خامة سريعة ("+qfab.forKey+")"}</div>
          <Btn ghost small onClick={()=>setQfab(null)} title="إغلاق">✕</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم الخامة</label><Inp value={qfab.name} onChange={v=>setQfab({...qfab,name:v})} placeholder="مثال: شعييرات مازيراتي"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={qfab.unit} onChange={v=>setQfab({...qfab,unit:v})}>{getUnits(data,qfab.unit).map(u=><option key={u} value={u}>{u}</option>)}</Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp type="number" value={qfab.price} onChange={v=>setQfab({...qfab,price:v})} placeholder="0"/></div>
          </div>
          <Btn primary onClick={()=>{if(!qfab.name.trim()||!qfab.price)return;const newId=Date.now();upConfig(d=>{if(!d.fabrics)d.fabrics=[];d.fabrics.push({id:newId,name:qfab.name.trim(),unit:qfab.unit,price:Number(qfab.price)||0})});updF("fabric"+qfab.forKey,String(newId));setQfab(null);showToast("✓ تم اضافة الخامة")}}>حفظ واختيار</Btn>
        </div>
      </div>
    </div>}
  </Card>
  {dupPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDupPopup(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
    <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",marginBottom:14}}>📋 تكرار من أوردر</div>
    <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec}}>اختر الأوردر</label><Sel value={dupModelNo} onChange={setDupModelNo}><option value="">-- اختر --</option>{data.orders.map(o=><option key={o.id} value={o.modelNo}>{o.modelNo+" — "+o.modelDesc}</option>)}</Sel></div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setDupPopup(false)}>الغاء</Btn><Btn primary disabled={!dupModelNo} onClick={()=>{const src=data.orders.find(o=>o.modelNo===dupModelNo);if(!src)return;setForm(p=>{const n={...p};n.sizeSetId=src.sizeSetId;n.sizeLabel=src.sizeLabel;n.orderPieces=[...(src.orderPieces||[])];n.accItems=JSON.parse(JSON.stringify(src.accItems||[]));n.instructions=src.instructions||"";FKEYS.forEach(k=>{n["fabric"+k]=src["fabric"+k]||"";n["cons"+k]=src["cons"+k]||"";n["colors"+k]=JSON.parse(JSON.stringify(src["colors"+k]||[]));n["cutDate"+k]=new Date().toISOString().split("T")[0];n["fabricPieces"+k]=src["fabricPieces"+k]||[]});return n});setDupPopup(false);showToast("✓ تم نسخ بيانات "+dupModelNo)}}>تكرار</Btn></div>
  </div></div>}
  {cancelPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"30vh",padding:"30vh 16px 16px"}} onClick={()=>setCancelPopup(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:360,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)",textAlign:"center"}}>
    <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
    <div style={{fontSize:FS+2,fontWeight:800,color:T.warn,marginBottom:8}}>هل تريد الخروج؟</div>
    <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>يوجد بيانات مدخلة لم يتم حفظها</div>
    <div style={{display:"flex",gap:10,justifyContent:"center"}}><Btn ghost onClick={()=>setCancelPopup(false)}>متابعة التسجيل</Btn><Btn danger onClick={()=>{setCancelPopup(false);window.__formDirty=false;onCancel()}}>خروج بدون حفظ</Btn></div>
  </div></div>}
</>}

/* ══ DETAILS ══ */
