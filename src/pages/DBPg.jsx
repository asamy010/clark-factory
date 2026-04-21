/* ═══════════════════════════════════════════════════════════════
   CLARK - DBPg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: DBPg, WsManager
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { collection } from "firebase/firestore";
import { Btn, Card, DelBtn, Inp, QRImg, Sel } from "../components/ui.jsx";
import { DEFAULT_STATUSES, FKEYS, FS, GARMENT_ICONS, WS_TYPES } from "../constants/index.js";
import { T, TD, TDB, TH } from "../theme.js";
import { gIcon, setF, normalizePhone } from "../utils/format.js";
import { compressImage, compressImg43 } from "../utils/image.js";
import { calcWsRating, wsTypeInfo } from "../utils/orders.js";
import { ask, askInput, showToast } from "../utils/popups.js";

export function DBPg({data,upConfig,isMob,isTab,canEdit,statusCards,initialSub,onSubUsed,renameInOrders}){
  const[sub,setSub]=useState(initialSub||"fab");
  useEffect(()=>{if(initialSub){setSub(initialSub);if(onSubUsed)onSubUsed()}},[initialSub]);
  const[ff,setFf]=useState({name:"",unit:"كيلو",price:"",_eid:null});
  const[af,setAf]=useState({name:"",unit:"قطعة",price:"",_eid:null});
  const[sfld,setSfld]=useState({label:"",pcs:0,_eid:null});
  const[stName,setStName]=useState("");const[stColor,setStColor]=useState("#0EA5E9");const[stEid,setStEid]=useState(null);const[stShow,setStShow]=useState(false);
  const[gName,setGName]=useState("");const[gEid,setGEid]=useState(null);const[gIconSel,setGIconSel]=useState("👕");const[gShow,setGShow]=useState(false);const[gPrice,setGPrice]=useState("");
  const[showRecycleBin,setShowRecycleBin]=useState(false);

  /* ── Safe Delete: moves item to recycleBin before removing ── */
  const safeDelete=(collection,id,type)=>{
    upConfig(d=>{
      if(!d.recycleBin)d.recycleBin=[];
      const arr=d[collection]||[];const item=arr.find(x=>x.id===id);
      if(item)d.recycleBin.unshift({...item,_type:type,_collection:collection,_deletedAt:new Date().toISOString()});
      d[collection]=arr.filter(x=>x.id!==id);
      /* Keep recycleBin max 100 items */
      if(d.recycleBin.length>100)d.recycleBin=d.recycleBin.slice(0,100)});
    showToast("✓ تم الحذف — يمكن الاستعادة من سلة المحذوفات")};
  const restoreItem=(binIdx)=>{
    upConfig(d=>{
      const bin=d.recycleBin||[];const item=bin[binIdx];if(!item)return;
      const col=item._collection;if(!d[col])d[col]=[];
      /* Remove recycle meta before restoring */
      const restored={...item};delete restored._type;delete restored._collection;delete restored._deletedAt;
      d[col].push(restored);
      d.recycleBin=bin.filter((_,i)=>i!==binIdx)});
    showToast("✅ تم الاستعادة بنجاح")};

  const saveFab=()=>{if(!ff.name)return;upConfig(d=>{if(ff._eid){const idx=d.fabrics.findIndex(x=>x.id===ff._eid);if(idx>=0)d.fabrics[idx]={...d.fabrics[idx],name:ff.name,unit:ff.unit,price:Number(ff.price)||0}}else{d.fabrics.push({id:Date.now(),name:ff.name,unit:ff.unit,price:Number(ff.price)||0})}});setFf({name:"",unit:"كيلو",price:"",_eid:null})};
  const saveAcc=()=>{if(!af.name)return;upConfig(d=>{if(af._eid){const idx=d.accessories.findIndex(x=>x.id===af._eid);if(idx>=0)d.accessories[idx]={...d.accessories[idx],name:af.name,unit:af.unit,price:Number(af.price)||0}}else{d.accessories.push({id:Date.now(),name:af.name,unit:af.unit,price:Number(af.price)||0})}});setAf({name:"",unit:"قطعة",price:"",_eid:null})};
  const saveSize=()=>{if(!sfld.label)return;upConfig(d=>{if(sfld._eid){const idx=d.sizeSets.findIndex(x=>x.id===sfld._eid);if(idx>=0)d.sizeSets[idx]={...d.sizeSets[idx],label:sfld.label,pcsPerSeries:Number(sfld.pcs)||0}}else{d.sizeSets.push({id:Date.now(),label:sfld.label,pcsPerSeries:Number(sfld.pcs)||0})}});setSfld({label:"",pcs:0,_eid:null})};
  const saveGarment=()=>{if(!gName.trim())return;const oldName=gEid?(data.garmentTypes||[]).find(x=>x.id===gEid)?.name:null;upConfig(d=>{if(!d.garmentTypes)d.garmentTypes=[];if(gEid){const idx=d.garmentTypes.findIndex(x=>x.id===gEid);if(idx>=0){d.garmentTypes[idx].name=gName.trim();d.garmentTypes[idx].icon=gIconSel;d.garmentTypes[idx].defaultPrice=Number(gPrice)||0}}else{d.garmentTypes.push({id:Date.now(),name:gName.trim(),icon:gIconSel,defaultPrice:Number(gPrice)||0})}});if(oldName&&oldName!==gName.trim())renameInOrders("garment",oldName,gName.trim());setGName("");setGEid(null);setGIconSel("👕");setGPrice("")};
  const saveStatus=()=>{if(!stName.trim())return;const oldName=stEid?(statusCards||[]).find(x=>x.id===stEid)?.name:null;upConfig(d=>{if(!d.statusCards)d.statusCards=[...DEFAULT_STATUSES];if(stEid){const idx=d.statusCards.findIndex(x=>x.id===stEid);if(idx>=0){d.statusCards[idx].name=stName.trim();d.statusCards[idx].color=stColor}}else{d.statusCards.push({id:Date.now(),name:stName.trim(),color:stColor})}});if(oldName&&oldName!==stName.trim())renameInOrders("status",oldName,stName.trim());setStName("");setStColor("#0EA5E9");setStEid(null)};

  const eBtn=(onClick)=><Btn small onClick={onClick} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>;
  const ords=data.orders||[];
  const fabBlock=(f)=>ords.some(o=>FKEYS.some(k=>Number(o["fabric"+k])===f.id))?"مستخدم في أوردرات":null;
  const accBlock=(a)=>ords.some(o=>(o.accItems||[]).some(x=>x.name===a.name))?"مستخدم في أوردرات":null;
  const sizeBlock=(s)=>ords.some(o=>Number(o.sizeSetId)===s.id)?"مستخدم في أوردرات":null;
  const garmentBlock=(g)=>ords.some(o=>(o.orderPieces||[]).includes(g.name))?"مستخدم في أوردرات":null;
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>{[["fab","الأقمشة"],["acc","تشغيل + اكسسوار"],["size","المقاسات"],["garment","قطع الموديل"],["ws","الورش"],["status","حالات الأوردر"]].map(([k,l])=><Btn key={k} on={sub===k} onClick={()=>setSub(k)}>{l}</Btn>)}
      {canEdit&&<Btn onClick={()=>setShowRecycleBin(true)} style={{background:T.textMut+"12",color:T.textMut,border:"1px solid "+T.textMut+"25",marginRight:"auto"}}>{"🗑️ المحذوفات"+(data.recycleBin?.length>0?" ("+data.recycleBin.length+")":"")}</Btn>}
    </div>
    {/* ── Recycle Bin Popup ── */}
    {showRecycleBin&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowRecycleBin(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:600,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.text}}>🗑️ سلة المحذوفات</div>
          <div style={{display:"flex",gap:6}}>
            {(data.recycleBin||[]).length>0&&<Btn danger small onClick={async()=>{if(await ask("تفريغ سلة المحذوفات","هل تريد تفريغ سلة المحذوفات نهائياً؟",{danger:true,confirmText:"تفريغ الكل"}))upConfig(d=>{d.recycleBin=[]})}}>تفريغ الكل</Btn>}
            <Btn ghost small onClick={()=>setShowRecycleBin(false)}>✕</Btn>
          </div>
        </div>
        {(data.recycleBin||[]).length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
          {(data.recycleBin||[]).map((item,i)=><div key={i} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-2,fontWeight:700,background:T.accent+"12",color:T.accent}}>{item._type}</span>
                <span style={{fontSize:FS,fontWeight:700,color:T.text}}>{item.name||item.label||item.party||"—"}</span>
              </div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:3}}>
                {"حُذف: "+new Date(item._deletedAt).toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                {item.price!=null&&" | السعر: "+item.price}
                {item.phone&&" | "+item.phone}
                {item.owner&&" | المالك: "+item.owner}
              </div>
            </div>
            <Btn small onClick={()=>{restoreItem(i);setShowRecycleBin(false)}} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",fontWeight:700}}>↩ استعادة</Btn>
          </div>)}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>سلة المحذوفات فارغة</div>}
        {/* ── Restore from local snapshot ── */}
        {(()=>{try{const raw=localStorage.getItem("clark-data-snapshot");if(!raw)return null;const snap=JSON.parse(raw);
          const collections=[{key:"workshops",label:"الورش",icon:"🏭"},{key:"customers",label:"العملاء",icon:"👤"},{key:"suppliers",label:"الموردين",icon:"🏪"},{key:"fabrics",label:"الأقمشة",icon:"🧵"},{key:"accessories",label:"الإكسسوارات",icon:"🪡"},{key:"sizeSets",label:"المقاسات",icon:"📏"},{key:"garmentTypes",label:"أنواع القطع",icon:"👕"},{key:"employees",label:"الموظفين",icon:"👷"}];
          const hasMissing=collections.some(c=>{const current=(data[c.key]||[]).length;const saved=(snap[c.key]||[]).length;return saved>current});
          return<div style={{marginTop:16,padding:14,borderRadius:12,background:T.warn+"06",border:"1px solid "+T.warn+"20"}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.warn,marginBottom:8}}>📸 نسخة محلية محفوظة</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginBottom:8}}>{"آخر حفظ: "+new Date(snap.savedAt).toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {collections.map(c=>{const cur=(data[c.key]||[]).length;const saved=(snap[c.key]||[]).length;const diff=saved-cur;
                return<div key={c.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:diff>0?T.err+"06":T.cardSolid,border:"1px solid "+(diff>0?T.err+"20":T.brd)}}>
                  <span style={{fontSize:FS-2}}>{c.icon+" "+c.label+": "+cur}</span>
                  {diff>0?<Btn small onClick={async()=>{if(await ask("استعادة "+c.label,"سيتم استعادة "+c.label+" من النسخة المحلية ("+saved+" عنصر).\nالبيانات الحالية ("+cur+") سيتم استبدالها.\n\nمتأكد؟",{danger:true,confirmText:"استعادة"})){upConfig(d=>{d[c.key]=snap[c.key]});showToast("✅ تم استعادة "+c.label);setShowRecycleBin(false)}}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:FS-3}}>{"↩ استعادة ("+saved+")"}</Btn>
                  :<span style={{fontSize:FS-3,color:T.ok}}>✓ متطابق</span>}
                </div>})}
            </div>
          </div>}catch(e){return null}})()}
      </div>
    </div>}
    {sub==="fab"&&<><Card title="جدول الأقمشة" extra={canEdit&&<Btn primary small onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:true})}>+ اضافة</Btn>}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","القماش","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f,i)=><tr key={f.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={{...TDB,color:T.accent}}>{f.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setFf({name:f.name,unit:f.unit,price:f.price,_eid:f.id,_show:true}))}<DelBtn onConfirm={()=>safeDelete("fabrics",f.id,"قماش")} blocked={fabBlock(f)}/></div></td>}</tr>)}</tbody></table></div></Card>
    {ff._show&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFf({...ff,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{ff._eid?"✏️ تعديل القماش":"+ قماش جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم القماش</label><Inp value={ff.name} onChange={v=>setFf({...ff,name:v})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={ff.unit} onChange={v=>setFf({...ff,unit:v})}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp value={ff.price} onChange={v=>setFf({...ff,price:v})} type="number"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveFab();setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:false})}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="acc"&&<><Card title="تشغيل + اكسسوار" extra={canEdit&&<Btn primary small onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:true})}>+ اضافة</Btn>}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["#","الوصف","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a,i)=><tr key={a.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={{...TDB,color:T.accent}}>{a.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setAf({name:a.name,unit:a.unit,price:a.price,_eid:a.id,_show:true}))}<DelBtn onConfirm={()=>safeDelete("accessories",a.id,"اكسسوار")} blocked={accBlock(a)}/></div></td>}</tr>)}</tbody></table></div></Card>
    {af._show&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAf({...af,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{af._eid?"✏️ تعديل البند":"+ بند جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الوصف</label><Inp value={af.name} onChange={v=>setAf({...af,name:v})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={af.unit} onChange={v=>setAf({...af,unit:v})}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp value={af.price} onChange={v=>setAf({...af,price:v})} type="number"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveAcc();setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:false})}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="size"&&<><Card title="المقاسات" extra={canEdit&&<Btn primary small onClick={()=>setSfld({label:"",pcs:0,_eid:null,_show:true})}>+ اضافة</Btn>}>
      <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","المقاسات","قطع/سيري",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s,i)=><tr key={s.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{s.label}</td><td style={{...TDB,color:T.accent}}>{s.pcsPerSeries||"-"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setSfld({label:s.label,pcs:s.pcsPerSeries||0,_eid:s.id,_show:true}))}<DelBtn onConfirm={()=>safeDelete("sizeSets",s.id,"مقاسات")} blocked={sizeBlock(s)}/></div></td>}</tr>)}</tbody></table></Card>
    {sfld._show&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSfld({...sfld,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:400,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{sfld._eid?"✏️ تعديل المقاس":"+ مقاس جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>المقاسات</label><Inp value={sfld.label} onChange={v=>setSfld({...sfld,label:v})} placeholder="S-M-L-XL"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>قطع/سيري</label><Inp type="number" value={sfld.pcs||""} onChange={v=>setSfld({...sfld,pcs:Number(v)||0})}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setSfld({label:"",pcs:0,_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveSize();setSfld({label:"",pcs:0,_eid:null,_show:false})}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="garment"&&<><Card title="قطع الموديل" extra={canEdit&&<Btn primary small onClick={()=>{setGName("");setGEid(null);setGIconSel("👕");setGShow(true)}}>+ اضافة</Btn>}>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>{(data.garmentTypes||[]).map(g=><span key={g.id} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:12,border:"1px solid "+T.brd,fontSize:FS,fontWeight:600,background:T.cardSolid}}>{(g.icon||gIcon(g.name,data.garmentTypes))+" "+g.name}{g.defaultPrice?<span style={{fontSize:FS-2,color:"#8B5CF6",fontWeight:700}}>{g.defaultPrice+" ج.م"}</span>:""}{canEdit&&<>{" "}{eBtn(()=>{setGName(g.name);setGEid(g.id);setGIconSel(g.icon||gIcon(g.name,data.garmentTypes));setGPrice(g.defaultPrice||"");setGShow(true)})}<DelBtn onConfirm={()=>safeDelete("garmentTypes",g.id,"نوع قطعة")} blocked={garmentBlock(g)}/></>}</span>)}</div>
      {(!data.garmentTypes||data.garmentTypes.length===0)&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة قطع بعد</div>}
    </Card>
    {gShow&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setGShow(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{gEid?"✏️ تعديل القطعة":"+ قطعة جديدة"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الأيقونة</label><Sel value={gIconSel} onChange={setGIconSel}>{GARMENT_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم القطعة</label><Inp value={gName} onChange={setGName} placeholder="قميص، شورت..."/></div>
        </div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>سعر التشغيل الافتراضي (ج.م/قطعة)</label><Inp type="number" value={gPrice} onChange={setGPrice} placeholder="0"/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setGShow(false)}>الغاء</Btn><Btn primary onClick={()=>{saveGarment();setGShow(false)}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="ws"&&<WsManager workshops={data.workshops||[]} upConfig={upConfig} canEdit={canEdit} isMob={isMob} orders={data.orders} renameInOrders={renameInOrders} wsPayments={data.wsPayments||[]} safeDelete={safeDelete}/>}
    {sub==="status"&&<><Card title="حالات الأوردر" extra={canEdit&&<Btn primary small onClick={()=>{setStName("");setStColor("#0EA5E9");setStEid(null);setStShow(true)}}>+ اضافة</Btn>}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(2,1fr)":"repeat(4,1fr)",gap:12}}>
        {statusCards.map(s=><div key={s.id} style={{padding:16,borderRadius:14,border:"2px solid "+s.color+"40",background:s.color+"08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:20,height:20,borderRadius:6,background:s.color}}/><span style={{fontWeight:700,fontSize:FS,color:T.text}}>{s.name}</span></div>
          {canEdit&&<div style={{display:"flex",gap:4}}>{eBtn(()=>{setStName(s.name);setStColor(s.color);setStEid(s.id);setStShow(true)})}<DelBtn onConfirm={()=>safeDelete("statusCards",s.id,"حالة")} blocked={ords.some(o=>o.status===s.name)?"يوجد أوردرات بهذه الحالة":null}/></div>}
        </div>)}
      </div>
    </Card>
    {stShow&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setStShow(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{stEid?"✏️ تعديل الحالة":"+ حالة جديدة"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم الحالة</label><Inp value={stName} onChange={setStName}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اللون</label><input type="color" value={stColor} onChange={e=>setStColor(e.target.value)} style={{width:"100%",height:40,borderRadius:8,border:"1px solid "+T.brd,cursor:"pointer"}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setStShow(false)}>الغاء</Btn><Btn primary onClick={()=>{saveStatus();setStShow(false)}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
  </div>
}

/* ══ WORKSHOP MANAGER ══ */


export function WsManager({workshops,upConfig,canEdit,isMob,orders,renameInOrders,wsPayments,safeDelete}){
  const[showForm,setShowForm]=useState(false);const[editId,setEditId]=useState(null);
  const[f,setF]=useState({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:0,type:"خياطة خارجي",payPercent:60});
  const startEdit=(ws)=>{setF({...ws,type:ws.type==="خارجي"?"خياطة خارجي":ws.type==="داخلي"?"خياطة داخلي":ws.type||"خياطة خارجي",payPercent:ws.payPercent||60});setEditId(ws.id);setShowForm(true)};
  const startNew=()=>{setF({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:0,type:"خياطة خارجي",payPercent:60});setEditId(null);setShowForm(true)};
  const handleIdCard=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImg43(file,300,0.5);setF(p=>({...p,idCard:compressed}))};
  const handleOwnerPhoto=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImage(file,200,0.5);setF(p=>({...p,ownerPhoto:compressed}))};
  const save=()=>{if(!f.name.trim())return;
    /* V15.17: normalize phone to +2 format */
    const normalized={...f,phone:normalizePhone(f.phone||"")};
    let oldName=null;
    if(editId){const old=workshops.find(w=>w.id===editId);if(old&&old.name!==normalized.name.trim())oldName=old.name}
    upConfig(d=>{if(!Array.isArray(d.workshops))d.workshops=[];if(editId){const idx=d.workshops.findIndex(w=>w.id===editId);if(idx>=0)d.workshops[idx]={...normalized,id:editId}}else{d.workshops.push({...normalized,id:Date.now()})}
      if(oldName){(d.wsPayments||[]).forEach(p=>{if(p.wsId===editId||p.wsName===oldName){p.wsName=normalized.name.trim();p.wsId=editId}});(d.notifications||[]).forEach(n=>{if(n.msg&&n.msg.includes(oldName))n.msg=n.msg.replace(new RegExp(oldName,"g"),normalized.name.trim())})}
    });
    if(oldName)renameInOrders("ws",oldName,normalized.name.trim(),editId);
    setShowForm(false);setEditId(null)};
  const del=(id)=>safeDelete("workshops",id,"ورشة");
  const wsBlock=(ws)=>{const hasOrders=(orders||[]).some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===ws.name));if(hasOrders)return"يوجد تسليمات مرتبطة بهذه الورشة";const hasPay=(wsPayments||[]).some(p=>p.wsName===ws.name);if(hasPay)return"يوجد دفعات مرتبطة بهذه الورشة";return null};
  const[wsSearch,setWsSearch]=useState("");
  const filteredWs=wsSearch.trim()?(workshops||[]).filter(ws=>(ws.name||"").includes(wsSearch)||(ws.address||"").includes(wsSearch)||(ws.phone||"").includes(wsSearch)||(ws.owner||"").includes(wsSearch)):(workshops||[]);

  return<div>
    {/* ── Recover missing workshops ── */}
    {(()=>{const wsNames=new Set((workshops||[]).map(w=>w.name));
      const missingWs={};
      (orders||[]).forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
        if(wd.wsName&&!wsNames.has(wd.wsName)){
          if(!missingWs[wd.wsName])missingWs[wd.wsName]={name:wd.wsName,deliveries:0,receives:0};
          missingWs[wd.wsName].deliveries+=(Number(wd.qty)||0);
          (wd.receives||[]).forEach(r=>{missingWs[wd.wsName].receives+=(Number(r.qty)||0)})}})});
      const missing=Object.values(missingWs);
      if(missing.length===0)return null;
      return<Card style={{marginBottom:14,background:T.err+"06",border:"1px solid "+T.err+"25"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:FS,fontWeight:800,color:T.err}}>{"⚠️ "+missing.length+" ورشة مفقودة لها حركات"}</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>{missing.map(w=>w.name+" ("+w.deliveries+" تسليم / "+w.receives+" استلام)").join(" — ")}</div>
          </div>
          <Btn onClick={()=>{upConfig(d=>{if(!d.workshops)d.workshops=[];missing.forEach(m=>{if(!d.workshops.some(w=>w.name===m.name))d.workshops.push({id:Date.now()+Math.random(),name:m.name,owner:"",phone:"",address:"",type:"خياطة خارجي",payPercent:60,rating:0})})});showToast("✅ تم استعادة "+missing.length+" ورشة")}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontWeight:700}}>{"↩ استعادة "+missing.length+" ورشة"}</Btn>
        </div>
      </Card>})()}
    <Card title="ادارة الورش" extra={canEdit&&<Btn primary small onClick={startNew}>+ ورشة جديدة</Btn>}>
      <div style={{marginBottom:12}}><Inp value={wsSearch} onChange={setWsSearch} placeholder="بحث باسم الورشة أو العنوان أو التليفون..."/></div>
      {/* Workshop Cards */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        {filteredWs.map(ws=>{
          /* Compute workshop stats */
          let totalDel=0,totalRcv=0,orderCount=0;
          orders.forEach(o=>{let hasWs=false;(o.workshopDeliveries||[]).filter(wd=>wd.wsName===ws.name).forEach(wd=>{hasWs=true;totalDel+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{totalRcv+=Number(r.qty)||0})});if(hasWs)orderCount++});
          const pct=totalDel>0?Math.round(totalRcv/totalDel*100):0;
          const bal=totalDel-totalRcv;
          return<div key={ws.id} onClick={()=>{if(canEdit)startEdit(ws)}} style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",cursor:canEdit?"pointer":"default",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
          {/* Header */}
          {(()=>{const wt=wsTypeInfo(ws.type);return<div style={{padding:"14px 16px",background:wt.color+"08",borderBottom:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                {ws.ownerPhoto&&<img src={ws.ownerPhoto} alt="" style={{width:44,height:58,borderRadius:8,objectFit:"cover",flexShrink:0}}/>}
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontSize:FS+2,fontWeight:800}}>{ws.name}</span><span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,fontWeight:600,background:wt.color+"15",color:wt.color}}>{wt.icon+" "+wt.key}</span>{!wt.internal&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,fontWeight:600,background:T.purple+"12",color:T.purple}}>{(ws.payPercent||60)+"%"}</span>}</div>
                  {ws.owner&&<div style={{fontSize:FS-1,color:T.textSec}}>{"👤 "+ws.owner}</div>}
                </div>
              </div>
              {!wt.internal&&<QRImg text={window.location.origin+"?act=wsacc&ws="+encodeURIComponent(ws.name)} size={94}/>}
            </div>
          </div>})()}
          {/* Stats Grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:1,background:T.brd}}>
            {[{label:"أوردرات",value:orderCount,color:T.accent},{label:"تسليم ورشة",value:totalDel,color:T.purple},{label:"استلام مصنع",value:totalRcv,color:T.ok},{label:"الرصيد",value:bal,color:bal>0?T.err:T.ok}].map(s=><div key={s.label} style={{background:T.cardSolid,padding:"8px 6px",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>{s.label}</div><div style={{fontSize:FS+2,fontWeight:800,color:s.color}}>{s.value}</div></div>)}
          </div>
          {/* Progress bar */}
          <div style={{padding:"8px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textSec,marginBottom:3}}><span>نسبة الاستلام</span><span style={{fontWeight:700,color:pct>=80?T.ok:pct>=50?T.warn:T.err}}>{pct+"%"}</span></div>
            <div style={{height:6,borderRadius:3,background:"#E2E8F0",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",borderRadius:3,background:pct>=80?T.ok:pct>=50?T.warn:T.err,transition:"width 0.5s"}}/></div>
          </div>
          {/* Info + Rating */}
          {(()=>{const autoR=calcWsRating(ws.name,orders);const rating=ws.ratingManual?(ws.rating||0):autoR!==null?autoR:0;const label=ws.ratingManual?"يدوي":autoR!==null?"تلقائي":"بدون بيانات";return<div style={{padding:"4px 16px 10px",display:"flex",gap:10,flexWrap:"wrap",fontSize:FS-2,color:T.textSec,alignItems:"center"}}>
            {ws.phone&&<span>{"📱 "+ws.phone}</span>}
            {ws.address&&<span style={{maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{"📍 "+ws.address}</span>}
            <span style={{fontWeight:700,color:rating>=7?T.ok:rating>=4?T.warn:rating>0?T.err:T.textMut}}>{"⭐ "+rating+"/10 ("+label+")"}</span>
            {canEdit&&<span onClick={async e=>{e.stopPropagation();const v=await askInput("تعديل التقييم",{label:"التقييم (من 10):",defaultValue:String(rating),type:"number",validate:val=>{const n=Number(val);if(isNaN(n)||n<0||n>10)return"قيمة بين 0 و 10";return null}});if(v!==null){const n=Math.min(10,Math.max(0,Number(v)||0));upConfig(d=>{const idx=d.workshops.findIndex(x=>x.id===ws.id);if(idx>=0){d.workshops[idx].rating=n;d.workshops[idx].ratingManual=true}})}}} style={{cursor:"pointer",fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</span>}
            {canEdit&&ws.ratingManual&&<span onClick={e=>{e.stopPropagation();upConfig(d=>{const idx=d.workshops.findIndex(x=>x.id===ws.id);if(idx>=0){d.workshops[idx].ratingManual=false}})}} style={{cursor:"pointer",fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>↩ تلقائي</span>}
          </div>})()}
          {/* Delete only */}
          <div style={{padding:"0 16px 10px",display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
            {canEdit&&<DelBtn onConfirm={()=>del(ws.id)} blocked={wsBlock(ws)}/>}
          </div>
        </div>})}
      </div>
      {(!workshops||workshops.length===0)&&<div style={{textAlign:"center",padding:30,color:T.textSec}}>لا توجد ورش مسجلة</div>}
    </Card>
    {/* Workshop Edit Popup */}
    {showForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setShowForm(false);setEditId(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{editId?"✏️ تعديل الورشة":"+ ورشة جديدة"}</div>
          <Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}} title="إغلاق">✕</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم الورشة *</label><Inp value={f.name} onChange={v=>setF({...f,name:v})}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم صاحب الورشة</label><Inp value={f.owner} onChange={v=>setF({...f,owner:v})}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع الورشة *</label><Sel value={f.type||"خياطة خارجي"} onChange={v=>setF({...f,type:v})}>{WS_TYPES.map(t=><option key={t.key} value={t.key}>{t.icon+" "+t.key}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النسبة من الدفعات</label><Sel value={f.payPercent||60} onChange={v=>setF({...f,payPercent:Number(v)})}>{[30,40,50,60,70,80,90,100].map(p=><option key={p} value={p}>{p+"%"}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رقم التليفون</label><Inp value={f.phone} onChange={v=>setF({...f,phone:v})} type="tel" placeholder="+201xxxxxxxxx" style={{direction:"ltr",textAlign:"left",fontFamily:"monospace"}}/></div>
        </div>
        <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>العنوان</label><textarea value={f.address||""} onChange={e=>setF({...f,address:e.target.value})} style={{width:"100%",height:60,padding:10,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>صورة صاحب الورشة</label>
          <div style={{width:80,height:107,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.bg,cursor:"pointer",position:"relative"}}>
            {f.ownerPhoto?<img src={f.ownerPhoto} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-2,color:T.textMut}}>صورة</span>}
            <input type="file" accept="image/*" onChange={handleOwnerPhoto} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}}>الغاء</Btn><Btn primary onClick={save} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div>}
  </div>
}

/* ══ ORDER FORM ══ */
