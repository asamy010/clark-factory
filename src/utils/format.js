/* ═══════════════════════════════════════════════════════════════
   CLARK - Format Utilities
   Pure formatting helpers - no state, no dependencies on T or theme
   ═══════════════════════════════════════════════════════════════ */

/* Unique short ID generator (Date-based with random suffix) */
export function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}

/* Number formatters */
export function fmt(n){return Number(n||0).toLocaleString("en-US")}
/* Format as integer with thousands separator — always rounds to whole number. Use for money. */
export function fmt0(n){return Math.round(Number(n||0)).toLocaleString("en-US")}
export function r2(n){return Math.round((n||0)*100)/100}

/* Format ISO date (YYYY-MM-DD) as Arabic-friendly (D-M-YYYY) for RTL display */
export function fmtDate(iso){if(!iso)return"";const parts=String(iso).split("-");if(parts.length!==3)return iso;return parseInt(parts[2])+"-"+parseInt(parts[1])+"-"+parts[0]}

/* Convert decimal hours (e.g., 13.95) to display format "HH:MM" (e.g., "13:57").
   - 13.95 → "13:57"  (0.95 * 60 = 57 minutes)
   - 8.5   → "8:30"
   - 7.75  → "7:45" */
export function hrsToHM(h){if(!h||h<=0)return"";const n=Number(h);if(isNaN(n))return"";const hh=Math.floor(n);const mm=Math.round((n-hh)*60);if(mm===60)return(hh+1)+":00";return hh+":"+String(mm).padStart(2,"0")}

/* Parse user input as either decimal (8.5) or HH:MM (8:30) → decimal hours.
   Accepts: "8", "8.5", "8:30", "8:5" (= 8:05), "8:", empty.
   Returns a number; 0 for empty/invalid. */
export function parseHrs(s){if(s===""||s===null||s===undefined)return 0;const str=String(s).trim();if(!str)return 0;if(str.includes(":")){const[h,m]=str.split(":");const hh=parseInt(h)||0;const mm=parseInt(m)||0;return r2(hh+mm/60)}return parseFloat(str)||0}

/* Sum by qty / layers for arrays of color rows */
export function sqty(a){return(a||[]).reduce((s,c)=>s+(Number(c.qty)||0),0)}
export function slay(a){return(a||[]).reduce((s,c)=>s+(Number(c.layers)||0),0)}

/* Immutable field setter — returns deep clone of o with key set to v */
export function setF(o,k,v){const c=JSON.parse(JSON.stringify(o));c[k]=v;return c}

/* Get keyed fabric/colors/cons/cutDate property */
export function gf(o,k,s){return o["fabric"+k+(s||"")]}
export function gc(o,k){return o["colors"+k]||[]}
export function gcons(o,k){return parseFloat(o["cons"+k])||0}
export function gdate(o,k){return o["cutDate"+k]||""}

/* Safe calculator expression evaluation — only allows digits and basic ops */
export function safeCalc(expr){try{const clean=expr.replace(/[^0-9+\-*/.() ]/g,"");if(!clean)return null;return new Function("return "+clean)()}catch(e){return null}}

/* HTML-escape string for safe innerHTML use in popups */
export function _esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

/* Smart garment icon picker — returns emoji based on name match, or custom from list */
export function gIcon(name,list){if(list){const g=list.find(x=>x.name===name);if(g&&g.icon)return g.icon}if(!name)return"👕";const n=name.toLowerCase();if(n.includes("قميص")||n.includes("شيرت")||n.includes("بلوز"))return"👔";if(n.includes("تيشيرت")||n.includes("تي شيرت")||n.includes("t-shirt")||n.includes("بولو"))return"👕";if(n.includes("بنطلون")||n.includes("بنط")||n.includes("تراوزر"))return"👖";if(n.includes("شورت"))return"🩳";if(n.includes("جاكيت")||n.includes("جاكت")||n.includes("سويت"))return"🧥";if(n.includes("فستان"))return"👗";if(n.includes("شنطة")||n.includes("حقيبة")||n.includes("شنط"))return"👜";if(n.includes("كاب")||n.includes("طاقية")||n.includes("قبعة"))return"🧢";if(n.includes("جيلي")||n.includes("سديري"))return"🦺";if(n.includes("جوارب")||n.includes("شراب"))return"🧦";if(n.includes("ملابس داخلية")||n.includes("اندر"))return"🩲";return"👕"}
