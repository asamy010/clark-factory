/* ═══════════════════════════════════════════════════════════════
   CLARK — Undo Last Action (V16.2)
   
   Allows reverting critical operations within 5 minutes.
   Snapshots config state before each operation, stores in memory,
   and provides a Undo toast that rolls back the change.
   
   Usage:
     import { pushUndo, getUndo, clearUndo, consumeUndo } from "./utils/undo.js";
     
     // Before making change:
     pushUndo({
       label: "دفعة ورشة 2,000 ج",
       configSnapshot: currentConfig,
       onUndo: async () => { await setDoc(ref, savedConfig) }
     });
   
   Undo expires after 5 minutes. Only ONE undo level (latest action).
   Stored in module scope — lost on page reload (intentional).
   ═══════════════════════════════════════════════════════════════ */

const UNDO_WINDOW_MS=5*60*1000;/* 5 minutes */

let currentUndo=null;
const listeners=new Set();

function notify(){
  listeners.forEach(fn=>{try{fn(currentUndo)}catch(e){}});
}

/* Subscribe to undo state changes. Returns unsubscribe fn. */
export function subscribeUndo(fn){
  listeners.add(fn);
  fn(currentUndo);
  return()=>listeners.delete(fn);
}

/* Push a new undo. Replaces any existing undo (only 1 level). */
export function pushUndo({label,icon,category,onUndo}){
  currentUndo={
    id:"undo_"+Date.now().toString(36),
    label:label||"العملية الأخيرة",
    icon:icon||"↩️",
    category:category||"general",
    createdAt:Date.now(),
    expiresAt:Date.now()+UNDO_WINDOW_MS,
    onUndo,/* async fn to revert */
    consumed:false,
  };
  /* Auto-expire */
  setTimeout(()=>{
    if(currentUndo&&currentUndo.expiresAt<=Date.now()){
      currentUndo=null;
      notify();
    }
  },UNDO_WINDOW_MS+100);
  notify();
}

/* Execute and consume the undo */
export async function consumeUndo(){
  if(!currentUndo||currentUndo.consumed)return{success:false,error:"لا توجد عملية للتراجع"};
  if(currentUndo.expiresAt<Date.now()){
    currentUndo=null;notify();
    return{success:false,error:"انتهت صلاحية التراجع (أكثر من 5 دقائق)"};
  }
  currentUndo.consumed=true;
  try{
    await currentUndo.onUndo();
    const label=currentUndo.label;
    currentUndo=null;
    notify();
    return{success:true,label};
  }catch(err){
    currentUndo.consumed=false;/* let user retry */
    return{success:false,error:err.message||String(err)};
  }
}

/* Clear without undoing (e.g. after a new action confirmed) */
export function clearUndo(){
  currentUndo=null;
  notify();
}

/* Get current undo state */
export function getUndo(){
  if(!currentUndo)return null;
  if(currentUndo.expiresAt<Date.now()){currentUndo=null;return null}
  return currentUndo;
}

/* Seconds remaining until undo expires */
export function getUndoTimeLeft(){
  if(!currentUndo)return 0;
  return Math.max(0,Math.ceil((currentUndo.expiresAt-Date.now())/1000));
}
