/* ═══════════════════════════════════════════════════════════════
   CLARK - Safe localStorage Wrapper (V15.5)
   
   Wraps localStorage with try/catch so failures in private browsing,
   quota exceeded, or disabled storage don't crash the app.
   ═══════════════════════════════════════════════════════════════ */

export const safeLocal={
  get(key,fallback){
    try{const v=localStorage.getItem(key);return v===null?(fallback===undefined?null:fallback):v}
    catch(e){return fallback===undefined?null:fallback}
  },
  set(key,value){
    try{localStorage.setItem(key,value);return true}
    catch(e){return false}
  },
  remove(key){
    try{localStorage.removeItem(key);return true}
    catch(e){return false}
  },
  /* JSON helpers — common pattern */
  getJSON(key,fallback){
    try{const v=localStorage.getItem(key);if(v===null)return fallback===undefined?null:fallback;return JSON.parse(v)}
    catch(e){return fallback===undefined?null:fallback}
  },
  setJSON(key,obj){
    try{localStorage.setItem(key,JSON.stringify(obj));return true}
    catch(e){return false}
  }
};
