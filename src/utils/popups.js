/* ═══════════════════════════════════════════════════════════════
   CLARK - Popup System
   Replaces native alert/confirm/prompt with styled Arabic popups.
   
   All return Promises and use CLARK's visual style (Cairo font, RTL,
   consistent with app theme). Keyboard: Escape cancels, Enter confirms.
   
   - ask(title, message, opts)       → Promise<boolean>
   - tell(title, message, opts)       → Promise<void>
   - askInput(title, opts)            → Promise<string|null>
   - askForm(title, fields, opts)     → Promise<{...}|null>
   - showToast(msg)                   → void (auto-dismisses after 2s)
   - highlightRow(id)                 → void (flash a row briefly)
   ═══════════════════════════════════════════════════════════════ */

import { _esc } from "./format.js";

/* Toast notification - no hooks */
export function showToast(msg){const el=document.createElement("div");
  /* V15.41: Support multi-line messages — auto-adjust width/duration for long diagnostics */
  const isLong=typeof msg==="string"&&(msg.length>80||msg.includes("\n"));
  el.textContent=msg;
  el.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10B981;color:#fff;padding:10px 28px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2);direction:rtl;animation:toastIn 0.3s ease"+(isLong?";max-width:min(92vw,480px);white-space:pre-line;text-align:right;line-height:1.7;padding:12px 18px":"");
  document.body.appendChild(el);
  const style=document.createElement("style");style.textContent="@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";document.head.appendChild(style);
  const duration=isLong?5000:2000;
  setTimeout(()=>{el.style.opacity="0";el.style.transition="opacity 0.3s";setTimeout(()=>{el.remove();style.remove()},300)},duration);
}

export function highlightRow(id){setTimeout(()=>{const el=document.querySelector("[data-oid='"+id+"']");if(!el)return;el.style.transition="background 0.3s";el.style.background="#FEF3C7";setTimeout(()=>{el.style.background="";setTimeout(()=>el.style.transition="",500)},2000)},200)}

/* Internal helpers — not exported */
function _mountPopup(renderFn){
  const host=document.createElement("div");
  host.style.cssText="position:fixed;inset:0;z-index:100000;font-family:'Cairo',sans-serif;direction:rtl";
  document.body.appendChild(host);
  let closed=false;
  const close=(val)=>{if(closed)return;closed=true;host.style.opacity="0";host.style.transition="opacity 0.15s";setTimeout(()=>host.remove(),150);return val};
  return{host,close};
}
function _styleOverlay(){return"position:absolute;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;animation:popIn 0.15s ease"}
function _stylePanel(){return"background:#fff;border-radius:16px;padding:22px 24px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:1px solid #E2E8F0"}
function _ensurePopAnim(){if(document.getElementById("__clark_pop_css"))return;const s=document.createElement("style");s.id="__clark_pop_css";s.textContent="@keyframes popIn{from{opacity:0}to{opacity:1}}@keyframes popScale{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}";document.head.appendChild(s)}

/* Confirm replacement — returns Promise<boolean> */
export function ask(title,message,opts){
  _ensurePopAnim();
  return new Promise(resolve=>{
    const{host,close}=_mountPopup();
    const{confirmText,cancelText,danger}=opts||{};
    const confirmColor=danger?"#EF4444":"#0EA5E9";
    host.innerHTML='<div style="'+_styleOverlay()+'"><div style="'+_stylePanel()+';animation:popScale 0.2s ease"><div style="font-size:16px;font-weight:800;color:#1E293B;margin-bottom:8px;text-align:center">'+_esc(title||"تأكيد")+'</div>'+(message?'<div style="font-size:13px;color:#475569;text-align:center;margin-bottom:18px;line-height:1.6;white-space:pre-wrap">'+_esc(message)+'</div>':'<div style="height:6px"></div>')+'<div style="display:flex;gap:8px;justify-content:center"><button data-act="cancel" style="padding:9px 22px;border-radius:10px;border:1px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:90px">'+_esc(cancelText||"إلغاء")+'</button><button data-act="ok" style="padding:9px 22px;border-radius:10px;border:none;background:'+confirmColor+';color:#fff;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:90px">'+_esc(confirmText||(danger?"حذف":"تأكيد"))+'</button></div></div></div>';
    const done=(v)=>{cleanup();resolve(close(v))};
    const okBtn=host.querySelector('[data-act="ok"]');
    const cancelBtn=host.querySelector('[data-act="cancel"]');
    const overlay=host.firstElementChild;
    okBtn.addEventListener("click",()=>done(true));
    cancelBtn.addEventListener("click",()=>done(false));
    overlay.addEventListener("click",e=>{if(e.target===overlay)done(false)});
    const keyHandler=(e)=>{if(e.key==="Escape")done(false);else if(e.key==="Enter")done(true)};
    document.addEventListener("keydown",keyHandler);
    const cleanup=()=>document.removeEventListener("keydown",keyHandler);
    setTimeout(()=>okBtn.focus(),50);
  });
}

/* Alert replacement — returns Promise<void> */
export function tell(title,message,opts){
  _ensurePopAnim();
  return new Promise(resolve=>{
    const{host,close}=_mountPopup();
    const{type}=opts||{};
    const color=type==="error"?"#EF4444":type==="warning"?"#F59E0B":type==="success"?"#10B981":"#0EA5E9";
    const icon=type==="error"?"⛔":type==="warning"?"⚠️":type==="success"?"✅":"ℹ️";
    host.innerHTML='<div style="'+_styleOverlay()+'"><div style="'+_stylePanel()+';animation:popScale 0.2s ease"><div style="font-size:36px;text-align:center;margin-bottom:6px">'+icon+'</div><div style="font-size:16px;font-weight:800;color:#1E293B;margin-bottom:8px;text-align:center">'+_esc(title||"")+'</div>'+(message?'<div style="font-size:13px;color:#475569;text-align:center;margin-bottom:18px;line-height:1.6;white-space:pre-wrap">'+_esc(message)+'</div>':'<div style="height:6px"></div>')+'<div style="display:flex;justify-content:center"><button data-act="ok" style="padding:9px 28px;border-radius:10px;border:none;background:'+color+';color:#fff;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:100px">حسناً</button></div></div></div>';
    const done=()=>{cleanup();resolve(close())};
    const okBtn=host.querySelector('[data-act="ok"]');
    const overlay=host.firstElementChild;
    okBtn.addEventListener("click",done);
    overlay.addEventListener("click",e=>{if(e.target===overlay)done()});
    const keyHandler=(e)=>{if(e.key==="Escape"||e.key==="Enter")done()};
    document.addEventListener("keydown",keyHandler);
    const cleanup=()=>document.removeEventListener("keydown",keyHandler);
    setTimeout(()=>okBtn.focus(),50);
  });
}

/* Prompt replacement — returns Promise<string|null>. Returns null on cancel. */
export function askInput(title,opts){
  _ensurePopAnim();
  return new Promise(resolve=>{
    const{host,close}=_mountPopup();
    const{defaultValue,placeholder,type,label,message,validate,confirmText,cancelText}=opts||{};
    const inpType=type==="number"?"text":(type||"text");
    const inpMode=type==="number"?'inputmode="decimal"':'';
    host.innerHTML='<div style="'+_styleOverlay()+'"><div style="'+_stylePanel()+';animation:popScale 0.2s ease"><div style="font-size:16px;font-weight:800;color:#1E293B;margin-bottom:8px;text-align:center">'+_esc(title||"")+'</div>'+(message?'<div style="font-size:12px;color:#475569;text-align:center;margin-bottom:12px;line-height:1.6;white-space:pre-wrap">'+_esc(message)+'</div>':'')+(label?'<div style="font-size:12px;color:#475569;margin-bottom:6px;font-weight:600">'+_esc(label)+'</div>':'')+'<input data-act="inp" type="'+inpType+'" '+inpMode+' value="'+_esc(defaultValue==null?"":String(defaultValue))+'" placeholder="'+_esc(placeholder||"")+'" style="width:100%;padding:10px 12px;border-radius:10px;border:2px solid #E2E8F0;font-family:\'Cairo\',sans-serif;font-size:14px;box-sizing:border-box;outline:none;background:#fff;color:#1E293B"/><div data-act="err" style="font-size:11px;color:#EF4444;margin-top:4px;min-height:14px;font-weight:600"></div><div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button data-act="cancel" style="padding:9px 22px;border-radius:10px;border:1px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:90px">'+_esc(cancelText||"إلغاء")+'</button><button data-act="ok" style="padding:9px 22px;border-radius:10px;border:none;background:#0EA5E9;color:#fff;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:90px">'+_esc(confirmText||"تأكيد")+'</button></div></div></div>';
    const inp=host.querySelector('[data-act="inp"]');
    const errEl=host.querySelector('[data-act="err"]');
    const okBtn=host.querySelector('[data-act="ok"]');
    const cancelBtn=host.querySelector('[data-act="cancel"]');
    const overlay=host.firstElementChild;
    const cancel=()=>{cleanup();resolve(close(null))};
    const submit=()=>{
      const v=inp.value;
      if(validate){const err=validate(v);if(err){errEl.textContent=err;inp.style.borderColor="#EF4444";return}}
      cleanup();resolve(close(v));
    };
    okBtn.addEventListener("click",submit);
    cancelBtn.addEventListener("click",cancel);
    overlay.addEventListener("click",e=>{if(e.target===overlay)cancel()});
    inp.addEventListener("input",()=>{errEl.textContent="";inp.style.borderColor="#E2E8F0"});
    const keyHandler=(e)=>{if(e.key==="Escape")cancel();else if(e.key==="Enter"&&document.activeElement===inp)submit()};
    document.addEventListener("keydown",keyHandler);
    const cleanup=()=>document.removeEventListener("keydown",keyHandler);
    setTimeout(()=>{inp.focus();inp.select()},50);
  });
}

/* Multi-field form — returns Promise<object|null>.
   fields: [{key, label, type, defaultValue, placeholder, required, validate}] */
export function askForm(title,fields,opts){
  _ensurePopAnim();
  return new Promise(resolve=>{
    const{host,close}=_mountPopup();
    const{confirmText,cancelText,message}=opts||{};
    const rows=fields.map((f,i)=>{
      const inpType=f.type==="number"?"text":(f.type||"text");
      const inpMode=f.type==="number"?'inputmode="decimal"':'';
      return '<div style="margin-bottom:10px"><label style="font-size:12px;color:#475569;margin-bottom:4px;display:block;font-weight:600">'+_esc(f.label||f.key)+(f.required?' <span style="color:#EF4444">*</span>':'')+'</label><input data-key="'+_esc(f.key)+'" data-idx="'+i+'" type="'+inpType+'" '+inpMode+' value="'+_esc(f.defaultValue==null?"":String(f.defaultValue))+'" placeholder="'+_esc(f.placeholder||"")+'" style="width:100%;padding:9px 12px;border-radius:8px;border:2px solid #E2E8F0;font-family:\'Cairo\',sans-serif;font-size:13px;box-sizing:border-box;outline:none;background:#fff;color:#1E293B"/><div data-err="'+_esc(f.key)+'" style="font-size:10px;color:#EF4444;margin-top:2px;min-height:12px;font-weight:600"></div></div>';
    }).join("");
    host.innerHTML='<div style="'+_styleOverlay()+'"><div style="'+_stylePanel()+';animation:popScale 0.2s ease;max-width:420px"><div style="font-size:16px;font-weight:800;color:#1E293B;margin-bottom:8px;text-align:center">'+_esc(title||"")+'</div>'+(message?'<div style="font-size:12px;color:#475569;text-align:center;margin-bottom:14px;line-height:1.5">'+_esc(message)+'</div>':'<div style="height:8px"></div>')+rows+'<div style="display:flex;gap:8px;justify-content:center;margin-top:6px"><button data-act="cancel" style="padding:9px 22px;border-radius:10px;border:1px solid #E2E8F0;background:#F8FAFC;color:#475569;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:90px">'+_esc(cancelText||"إلغاء")+'</button><button data-act="ok" style="padding:9px 22px;border-radius:10px;border:none;background:#0EA5E9;color:#fff;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;min-width:90px">'+_esc(confirmText||"تأكيد")+'</button></div></div></div>';
    const inps=Array.from(host.querySelectorAll('[data-key]'));
    const okBtn=host.querySelector('[data-act="ok"]');
    const cancelBtn=host.querySelector('[data-act="cancel"]');
    const overlay=host.firstElementChild;
    const cancel=()=>{cleanup();resolve(close(null))};
    const submit=()=>{
      const data={};let hasErr=false;
      inps.forEach(inp=>{data[inp.dataset.key]=inp.value});
      for(const f of fields){
        const inp=host.querySelector('[data-key="'+f.key+'"]');
        const errEl=host.querySelector('[data-err="'+f.key+'"]');
        errEl.textContent="";inp.style.borderColor="#E2E8F0";
        if(f.required&&!String(data[f.key]||"").trim()){errEl.textContent="مطلوب";inp.style.borderColor="#EF4444";hasErr=true;continue}
        if(f.validate){const err=f.validate(data[f.key],data);if(err){errEl.textContent=err;inp.style.borderColor="#EF4444";hasErr=true}}
      }
      if(hasErr)return;
      cleanup();resolve(close(data));
    };
    okBtn.addEventListener("click",submit);
    cancelBtn.addEventListener("click",cancel);
    overlay.addEventListener("click",e=>{if(e.target===overlay)cancel()});
    inps.forEach(inp=>{
      inp.addEventListener("input",()=>{const errEl=host.querySelector('[data-err="'+inp.dataset.key+'"]');errEl.textContent="";inp.style.borderColor="#E2E8F0"});
      inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const idx=Number(inp.dataset.idx);if(idx<inps.length-1)inps[idx+1].focus();else submit()}});
    });
    const keyHandler=(e)=>{if(e.key==="Escape")cancel()};
    document.addEventListener("keydown",keyHandler);
    const cleanup=()=>document.removeEventListener("keydown",keyHandler);
    setTimeout(()=>{if(inps[0]){inps[0].focus();inps[0].select()}},50);
  });
}
