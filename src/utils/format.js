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
export function parseHrs(s){if(s===""||s===null||s===undefined)return 0;
  /* V15.91: Normalize Arabic-Indic digits (٠-٩, ۰-۹) + strip invisible Unicode chars
     that biometric software often embeds (BOM, zero-width, non-breaking space). */
  let str=String(s)
    .replace(/[\u0660-\u0669]/g,d=>String.fromCharCode(d.charCodeAt(0)-0x0660+48))/* ٠-٩ → 0-9 */
    .replace(/[\u06F0-\u06F9]/g,d=>String.fromCharCode(d.charCodeAt(0)-0x06F0+48))/* ۰-۹ → 0-9 */
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0]/g," ")/* invisible chars → space */
    .replace(/[،,]/g,".")/* Arabic comma or Latin comma as decimal → dot */
    .trim();
  if(!str)return 0;
  if(str.includes(":")){const[h,m]=str.split(":");const hh=parseInt(h)||0;const mm=parseInt(m)||0;return r2(hh+mm/60)}
  return parseFloat(str)||0
}

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

/* V15.14: Parse a size label into individual size tokens.
   Handles months-format sizes like "6-9M - 9-12M - 12-18M" correctly.
   - Primary separator: " - " (dash with spaces around it) OR " / " OR "|" (pipe) OR comma
   - INSIDE a size token: "-" without spaces stays intact (like "6-9M", "9-12M")
   Examples:
     "6-9M - 9-12M - 12-18M"   → ["6-9M","9-12M","12-18M"]
     "2-3-4-5"                  → ["2","3","4","5"]   (legacy: no spaces, split on "-")
     "M-L-XL-2XL"               → ["M","L","XL","2XL"]
     "S/L/M/XL"                 → ["S","L","M","XL"]
     "FREE SIZE"                → ["FREE SIZE"]
*/
export function parseSizes(label,expectedCount){
  if(!label)return[];
  const s=String(label).trim();
  if(!s)return[];
  /* Helper: run both splitting strategies and return the best match */
  let result;
  /* Strategy A: explicit separators (" - ", "|", "/", ",") — preserves ranges like "6-9M" */
  if(/ - |\||\/|,/.test(s)){
    result=s.split(/ - |\||\/|,/).map(x=>x.trim()).filter(Boolean);
  }else{
    /* Strategy B: split on "-" with smart range detection (V15.29 algorithm).
       Merges back [pureNumber]-[numberThenLetter] pairs like "6-9M". */
    const parts=s.split("-").map(x=>x.trim()).filter(Boolean);
    const merged=[];
    const isPureNum=(t)=>/^[0-9]+$/.test(t);
    const isNumThenLetter=(t)=>/^[0-9]+[A-Za-z]/.test(t)&&/[A-Za-z]/.test(t);
    let i=0;
    while(i<parts.length){
      if(i+1<parts.length&&isPureNum(parts[i])&&isNumThenLetter(parts[i+1])){
        merged.push(parts[i]+"-"+parts[i+1]);i+=2;
      }else{
        merged.push(parts[i]);i+=1;
      }
    }
    result=merged;
  }
  /* V15.30: If expectedCount is provided, adjust to match it so UI stays consistent.
     - result too long: keep first N
     - result too short: pad with generic "مقاس N" placeholders (caller can detect mismatch by comparing lengths) */
  if(typeof expectedCount==="number"&&expectedCount>0){
    if(result.length>expectedCount)return result.slice(0,expectedCount);
    if(result.length<expectedCount){
      const padded=[...result];
      for(let k=result.length;k<expectedCount;k++)padded.push("مقاس "+(k+1));
      return padded;
    }
  }
  return result;
}

/* V15.30: Unified helper — returns sizes + expectedCount + mismatch flag for an order.
   This is the SINGLE SOURCE OF TRUTH for "how many sizes does this order have?".
   - `order`: the order object (needs sizeSetId or sizeLabel)
   - `data`: the full config object (needs data.sizeSets array)
   Returns: { sizes: string[], expectedCount: number, label: string, mismatch: boolean, sizeSet: object|null }
   `expectedCount` is ALWAYS sizeSet.pcsPerSeries when available (the single source of truth).
   `mismatch` is true when the label's parsed count differs from pcsPerSeries. */
export function getSizesFromSet(order,data){
  if(!order||!data)return{sizes:[],expectedCount:0,label:"",mismatch:false,sizeSet:null};
  const sizeSets=Array.isArray(data.sizeSets)?data.sizeSets:[];
  const ss=sizeSets.find(s=>Number(s.id)===Number(order.sizeSetId));
  const label=ss?.label||order.sizeLabel||"";
  const expectedCount=Number(ss?.pcsPerSeries)||0;
  if(expectedCount>0){
    /* pcsPerSeries is the source of truth — parseSizes will adjust to match */
    const rawParsed=parseSizes(label);/* parse without expectedCount to detect actual mismatch */
    const mismatch=rawParsed.length!==expectedCount;
    const sizes=parseSizes(label,expectedCount);/* then get the adjusted array */
    return{sizes,expectedCount,label,mismatch,sizeSet:ss||null};
  }
  /* Fallback: no pcsPerSeries set — use parseSizes result as-is, no mismatch detection */
  const sizes=parseSizes(label);
  return{sizes,expectedCount:sizes.length,label,mismatch:false,sizeSet:ss||null};
}

/* V15.17: Normalize phone to Egypt format with +2 prefix.
   - Empty → ""
   - "+2..." → keep as-is (already prefixed with any country code)
   - "01xxxxxxxxx" → "+201xxxxxxxxx"
   - "2-spaces", punctuation, etc stripped */
export function normalizePhone(p){
  const s=(p||"").toString().trim();
  if(!s)return"";
  if(s.startsWith("+"))return s;
  const d=s.replace(/\D/g,"");
  if(!d)return"";
  /* If already starts with 2 and is 12+ digits (like "201xxxxxxxxx"), prepend + only */
  if(d.startsWith("2")&&d.length>=12)return"+"+d;
  /* Otherwise assume local Egyptian number needing +2 prefix */
  return"+2"+d;
}

