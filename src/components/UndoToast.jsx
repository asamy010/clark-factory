/* V16.2: Undo Toast — floating UI that appears after an undoable action.
   Shows label + countdown + undo button. Auto-dismisses after 5 minutes.
   V19.3: Raised z-index from 9998 → 10005 so it appears ABOVE confirm popups
   (z-10001). Previously, a quick click sequence (delete → instant action) could
   hide the toast behind a freshly-opened popup. Also added a one-time console
   diagnostic so we can confirm pushUndo is firing if the toast still doesn't show. */

import { useEffect, useState } from "react";
import { subscribeUndo, consumeUndo, clearUndo, getUndoTimeLeft } from "../utils/undo.js";
import { showToast } from "../utils/popups.js";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

export function UndoToast(){
  const[undo,setUndo]=useState(null);
  const[timeLeft,setTimeLeft]=useState(0);
  const[loading,setLoading]=useState(false);
  const[dismissed,setDismissed]=useState(false);

  useEffect(()=>{
    const unsub=subscribeUndo(u=>{
      /* V19.3 diagnostic: log when undo state changes to help diagnose
         "undo toast not appearing" issues. Logged once per push. */
      if(u&&!window.__clarkUndoSeen){window.__clarkUndoSeen=new Set();}
      if(u&&u.id&&!window.__clarkUndoSeen.has(u.id)){
        window.__clarkUndoSeen.add(u.id);
        console.log("[V19.3 UndoToast] received undo:",u.label,"id:",u.id);
      }
      setUndo(u);
      setDismissed(false);
      if(u)setTimeLeft(getUndoTimeLeft());
    });
    return unsub;
  },[]);

  useEffect(()=>{
    if(!undo)return;
    const timer=setInterval(()=>{
      const left=getUndoTimeLeft();
      setTimeLeft(left);
      if(left<=0){clearInterval(timer)}
    },1000);
    return()=>clearInterval(timer);
  },[undo]);

  if(!undo||dismissed||timeLeft<=0)return null;

  const handleUndo=async()=>{
    if(loading)return;
    setLoading(true);
    try{
      const result=await consumeUndo();
      if(result.success){
        showToast("⏪ تم التراجع: "+result.label);
      }else{
        showToast("⛔ "+result.error);
      }
    }catch(e){
      showToast("⛔ فشل التراجع: "+(e.message||e));
    }finally{
      setLoading(false);
    }
  };

  const handleDismiss=()=>{
    setDismissed(true);
    /* Don't clear the undo — let timer expire. User may want to undo later from elsewhere */
  };

  const min=Math.floor(timeLeft/60);
  const sec=timeLeft%60;
  const timeStr=min>0?min+":"+String(sec).padStart(2,"0"):sec+"s";

  return<div style={{
    position:"fixed",
    bottom:16,
    left:16,
    zIndex:10005,
    background:T.cardSolid,
    border:"2px solid #8B5CF6",
    borderRadius:14,
    padding:"10px 14px",
    boxShadow:"0 10px 40px rgba(139, 92, 246, 0.25)",
    display:"flex",
    alignItems:"center",
    gap:10,
    maxWidth:"calc(100vw - 32px)",
    direction:"rtl",
    animation:"slideUpFade 0.3s ease-out"
  }}>
    <style>{`
      @keyframes slideUpFade {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
    <span style={{fontSize:22}}>{undo.icon}</span>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تم تنفيذ:</div>
      <div style={{fontSize:FS-1,color:T.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240}}>{undo.label}</div>
    </div>
    <button onClick={handleUndo} disabled={loading} style={{
      padding:"8px 14px",
      background:loading?T.bg:"#8B5CF6",
      color:loading?T.textMut:"#fff",
      border:"none",
      borderRadius:10,
      fontSize:FS-1,
      fontWeight:800,
      cursor:loading?"wait":"pointer",
      display:"flex",
      alignItems:"center",
      gap:6,
      whiteSpace:"nowrap"
    }}>
      <span>⏪</span>
      <span>تراجع</span>
      <span style={{fontSize:FS-3,fontWeight:600,opacity:0.9,fontFamily:"monospace"}}>({timeStr})</span>
    </button>
    <button onClick={handleDismiss} style={{
      padding:"4px 8px",
      background:"transparent",
      color:T.textMut,
      border:"none",
      borderRadius:6,
      fontSize:FS,
      cursor:"pointer"
    }} title="إخفاء">✕</button>
  </div>;
}
