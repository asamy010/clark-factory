/* ═══════════════════════════════════════════════════════════════════════
   CLARK · StageProgressModal (V19.0)
   ───────────────────────────────────────────────────────────────────────
   Shows per-piece progress for an order in its current stage.
   Triggered by clicking the interactive stage badge on order cards / detail page.

   Behavior:
   - For workshop-tracked stages (تشغيل/طباعة/تطريز/تشطيب) → show breakdown
     per piece with progress bars; highlight weakest piece in red
   - For done/partial-stock states → show simple message (no breakdown)
   - For cancelled orders → show neutral cancelled message
   ═══════════════════════════════════════════════════════════════════════ */

import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { getStageProgress } from "../utils/orders.js";

const STAGE_GRADIENTS = {
  "تم القص":               { from: "#0EA5E9", to: "#0284C7", icon: "✂️" },
  "في التشغيل":            { from: "#F59E0B", to: "#D97706", icon: "⏳" },
  "في الطباعة":            { from: "#EF4444", to: "#DC2626", icon: "🎨" },
  "في التطريز":            { from: "#F59E0B", to: "#D97706", icon: "🧵" },
  "في الغسيل":             { from: "#EC4899", to: "#DB2777", icon: "💧" },
  "تشطيب وتعبئة":          { from: "#10B981", to: "#059669", icon: "📦" },
  "تشطيب وتعبئة خارجي":    { from: "#14B8A6", to: "#0D9488", icon: "📦" },
  "تشغيل خارجي":           { from: "#8B5CF6", to: "#7C3AED", icon: "🏭" },
  "تم التسليم لمخزن الجاهز": { from: "#10B981", to: "#059669", icon: "✅" },
  "في مخزن الجاهز جزئي":   { from: "#D97706", to: "#B45309", icon: "📦" },
  "ملغي":                  { from: "#EF4444", to: "#DC2626", icon: "🚫" },
};

function pieceIcon(piece){
  const p=(piece||"").trim();
  if(p.includes("تيشيرت")||p.includes("تى شيرت"))return "👕";
  if(p.includes("قميص"))return "👔";
  if(p.includes("شورت")||p.includes("بنطلون"))return "🩳";
  if(p.includes("بدلة")||p.includes("سوت"))return "🥋";
  if(p.includes("جاكيت"))return "🧥";
  if(p.includes("فستان"))return "👗";
  return "👚";
}

export function StageProgressModal({order,onClose}){
  if(!order)return null;
  const prog=getStageProgress(order);
  const stage=prog.stageName||"—";
  const grad=STAGE_GRADIENTS[stage]||STAGE_GRADIENTS["في التشغيل"];
  const isCancelled=stage==="ملغي";
  const isDoneState=stage==="تم التسليم لمخزن الجاهز"||order.closed;
  const isPartialStock=stage==="في مخزن الجاهز جزئي";

  return <div onClick={(e)=>{if(e.target===e.currentTarget)onClose()}} className="pop-overlay" style={{
    position:"fixed",inset:0,background:"rgba(15,23,42,0.4)",zIndex:10001,
    display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",
    backdropFilter:"blur(3px)",
    overflowY:"auto",
  }}>
    <div onClick={e=>e.stopPropagation()} style={{
      /* V19.21: White card + thin colored border (variant B). Replaces the soft tinted
         look from V19.18-V19.20. White background = maximum readability; the stage
         identity is preserved through the 2px colored border + colored pill + colored %. */
      background:T.cardSolid,
      border:"2px solid "+grad.from,
      borderRadius:16,
      width:"100%",maxWidth:480,
      boxShadow:"0 20px 50px rgba(0,0,0,0.18)",
      overflow:"hidden",
      maxHeight:"calc(100vh - 48px)",
      display:"flex",flexDirection:"column",
    }}>
      {/* V19.21: Header — white background, normal text colors, separated by light border */}
      <div style={{
        padding:"16px 20px",
        background:T.cardSolid,
        borderBottom:"1px solid "+T.brd,
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:FS+2,fontWeight:900,display:"flex",alignItems:"center",gap:8,marginBottom:4,color:T.text}}>
              <span>📦</span>
              <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {order.poNumber?order.poNumber+" — ":""}{order.modelNo}
              </span>
            </div>
            {order.modelDesc&&<div style={{fontSize:FS-2,color:T.textSec}}>{order.modelDesc}</div>}
          </div>
          <span onClick={onClose} style={{
            cursor:"pointer",
            width:28,height:28,borderRadius:"50%",
            background:T.bg,color:T.textSec,
            border:"1px solid "+T.brd,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:14,fontWeight:700,flexShrink:0,
          }}>✕</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
          <span style={{
            display:"inline-flex",alignItems:"center",gap:5,
            padding:"5px 12px",borderRadius:20,
            background:grad.from+"15",
            color:grad.to,
            border:"1px solid "+grad.from+"40",
            fontSize:FS-1,fontWeight:800,
          }}>
            <span>{grad.icon}</span>
            <span>{stage}</span>
          </span>
          {prog.hasBreakdown&&prog.overall&&<span style={{
            fontSize:FS+8,fontWeight:900,marginInlineStart:"auto",lineHeight:1,
            color:grad.from,
          }}>{prog.overall.pct}%</span>}
        </div>
      </div>
      {/* V19.18: scrollable body wrapper so the modal never overflows the viewport */}
      <div style={{overflowY:"auto",flex:1}}>

      {/* Body */}
      {isCancelled?<div style={{padding:"30px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🚫</div>
        <div style={{fontSize:FS+3,fontWeight:900,color:T.err,marginBottom:6}}>الأوردر ملغي</div>
        <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.7}}>تم إلغاء هذا الأوردر — لا توجد مراحل قيد التنفيذ</div>
      </div>:isDoneState?<div style={{padding:"30px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>✅</div>
        <div style={{fontSize:FS+3,fontWeight:900,color:T.ok,marginBottom:6}}>تم تسليم الأوردر بالكامل</div>
        <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.7}}>كل الأطقم وصلت لمخزن الجاهز ومستعدة للبيع</div>
        <div style={{
          marginTop:14,display:"inline-flex",alignItems:"baseline",gap:6,
          padding:"10px 20px",borderRadius:10,
          background:T.ok+"12",border:"2px solid "+T.ok+"40",
        }}>
          <span style={{fontSize:FS+10,fontWeight:900,color:T.ok}}>{prog.deliveredQty}</span>
          <span style={{fontSize:FS-1,color:T.textMut,fontWeight:700}}>/ {prog.cutQty}</span>
          <span style={{fontSize:FS-2,color:T.textMut,marginInlineStart:4}}>طقم</span>
        </div>
      </div>:isPartialStock?<div style={{padding:"30px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>📦</div>
        <div style={{fontSize:FS+2,fontWeight:900,color:T.warn,marginBottom:6}}>تم تسليم {prog.deliveredQty} طقم لمخزن الجاهز</div>
        <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.7}}>الباقي {Math.max(0,prog.cutQty-prog.deliveredQty)} طقم لسه في مرحلة التشطيب</div>
        <div style={{
          marginTop:14,display:"inline-flex",alignItems:"baseline",gap:6,
          padding:"10px 20px",borderRadius:10,
          background:T.warn+"12",border:"2px solid "+T.warn+"40",
        }}>
          <span style={{fontSize:FS+10,fontWeight:900,color:T.warn}}>{prog.deliveredQty}</span>
          <span style={{fontSize:FS-1,color:T.textMut,fontWeight:700}}>/ {prog.cutQty}</span>
          <span style={{fontSize:FS-2,color:T.textMut,marginInlineStart:4}}>طقم</span>
        </div>
      </div>:<div style={{padding:"16px 20px"}}>
        <div style={{fontSize:FS-1,color:T.textSec,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
          <span>📊</span>
          <span>تفاصيل المرحلة لكل قطعة</span>
        </div>

        {prog.pieces.map((p,i)=>{
          const isComplete=p.pct>=100;
          const isWeakest=prog.weakest&&prog.weakest.piece===p.piece&&p.pct<100;
          const bg=isComplete?T.ok+"08":isWeakest?T.err+"08":T.warn+"06";
          const brd=isComplete?T.ok+"40":isWeakest?T.err+"50":T.warn+"30";
          const txtCol=isComplete?T.ok:isWeakest?T.err:T.warn;
          const fillCol=isComplete?T.ok:isWeakest?T.err:T.warn;
          return <div key={p.piece+"_"+i} style={{
            display:"flex",alignItems:"center",gap:10,
            padding:"10px 12px",borderRadius:10,
            background:bg,border:"1.5px solid "+brd,
            marginBottom:i<prog.pieces.length-1?8:0,
          }}>
            <span style={{fontSize:22,flexShrink:0,lineHeight:1}}>{pieceIcon(p.piece)}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:FS,fontWeight:800,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.piece}</span>
                <span style={{
                  fontSize:FS-1,fontWeight:800,color:txtCol,
                  padding:"2px 9px",borderRadius:5,
                  background:T.cardSolid,border:"1px solid "+brd,
                  flexShrink:0,
                }}>{p.pct}%</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,height:7,background:T.brd,borderRadius:4,overflow:"hidden"}}>
                  <div style={{
                    height:"100%",width:Math.min(100,p.pct)+"%",
                    background:fillCol,borderRadius:4,
                    transition:"width 0.4s",
                  }}/>
                </div>
                <span style={{fontSize:FS-2,color:T.textSec,fontWeight:700,minWidth:60,textAlign:"end",fontVariantNumeric:"tabular-nums"}}>
                  {p.current} / {p.total}
                </span>
              </div>
            </div>
          </div>;
        })}
      </div>}
      </div>{/* V19.18: end scrollable body wrapper */}

      {/* Footer */}
      {prog.hasBreakdown&&prog.weakest&&<div style={{
        padding:"12px 20px",background:T.bg,borderTop:"1px solid "+T.brd,
        fontSize:FS-1,color:T.err,fontWeight:700,
        display:"flex",alignItems:"center",gap:8,
      }}>
        <span>⚠️</span>
        <span>أضعف قطعة: <b>{prog.weakest.piece}</b> — ناقص {Math.max(0,prog.weakest.total-prog.weakest.current)} قطعة لإكمال المرحلة</span>
      </div>}
      {prog.hasBreakdown&&!prog.weakest&&prog.pieces.length>0&&<div style={{
        padding:"12px 20px",background:T.bg,borderTop:"1px solid "+T.brd,
        fontSize:FS-1,color:T.ok,fontWeight:700,
        display:"flex",alignItems:"center",gap:8,
      }}>
        <span>✅</span>
        <span>كل القطع وصلت لـ100% في هذه المرحلة</span>
      </div>}
    </div>
  </div>;
}
