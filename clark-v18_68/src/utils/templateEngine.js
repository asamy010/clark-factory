/* ═══════════════════════════════════════════════════════════════
   CLARK — Template Engine (V16.4)
   
   Safe, minimal template engine for print templates. Supports:
   
   1. VARIABLES:
      {{customer.name}}       → cust.name value
      {{order.modelNo}}       → nested access
   
   2. CONDITIONALS:
      {{#if customer.discount}}...{{/if}}
      {{#if balance > 0}}...{{else}}...{{/if}}
   
   3. LOOPS:
      {{#each items}}
        {{this.name}} × {{this.qty}}
      {{/each}}
   
   4. HELPERS:
      {{fmt number}}           → 1,234
      {{date d}}               → formatted date
      {{mult qty price}}       → multiplication
      {{add a b}}              → addition
      {{sub a b}}              → subtraction
      {{if cond "yes" "no"}}   → inline conditional
   
   5. HTML-SAFE: All string values HTML-escaped by default.
      Use {{{raw}}} (triple braces) to inject raw HTML.
   
   NOTE: This is intentionally NOT a full Handlebars implementation —
   only what's needed for print templates. Bundle size stays small.
   ═══════════════════════════════════════════════════════════════ */

/* HTML escape */
function escapeHtml(s){
  if(s==null)return"";
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

/* Resolve a dotted path from context (e.g. "customer.name" from {customer:{name:"Ahmed"}}) */
function resolvePath(path,context){
  if(!path)return undefined;
  path=path.trim();
  /* Numeric literal */
  if(/^-?\d+(\.\d+)?$/.test(path))return Number(path);
  /* String literal */
  if(/^".*"$/.test(path)||/^'.*'$/.test(path))return path.slice(1,-1);
  /* Dotted path */
  const parts=path.split(".");
  let cur=context;
  for(const p of parts){
    if(cur==null)return undefined;
    if(p==="this")continue;
    cur=cur[p];
  }
  return cur;
}

/* Built-in helpers */
const HELPERS={
  fmt:(n)=>n==null?"0":Math.round(Number(n)||0).toLocaleString("en-US"),
  fmtDec:(n,d=2)=>n==null?"0":(Number(n)||0).toFixed(Number(d)||2),
  date:(d)=>{
    if(!d)return"";
    try{const dt=new Date(d);if(isNaN(dt))return d;return dt.toLocaleDateString("ar-EG",{year:"numeric",month:"2-digit",day:"2-digit"})}catch(e){return d}
  },
  mult:(a,b)=>(Number(a)||0)*(Number(b)||0),
  add:(a,b)=>(Number(a)||0)+(Number(b)||0),
  sub:(a,b)=>(Number(a)||0)-(Number(b)||0),
  div:(a,b)=>{const bn=Number(b)||0;if(bn===0)return 0;return(Number(a)||0)/bn},
  uc:(s)=>String(s||"").toUpperCase(),
  lc:(s)=>String(s||"").toLowerCase(),
  trim:(s)=>String(s||"").trim(),
  default:(v,def)=>(v==null||v==="")?def:v,
  iff:(cond,yes,no)=>isTruthy(cond)?yes:(no||""),
  eq:(a,b)=>a===b||String(a)===String(b),
  gt:(a,b)=>(Number(a)||0)>(Number(b)||0),
  lt:(a,b)=>(Number(a)||0)<(Number(b)||0),
  gte:(a,b)=>(Number(a)||0)>=(Number(b)||0),
  lte:(a,b)=>(Number(a)||0)<=(Number(b)||0),
  percent:(a,total)=>{const t=Number(total)||0;if(t===0)return"0";return Math.round((Number(a)||0)/t*100)+"%"},
};

function isTruthy(v){
  if(v==null||v===false||v===0||v==="")return false;
  if(Array.isArray(v))return v.length>0;
  if(typeof v==="object")return Object.keys(v).length>0;
  return true;
}

/* Parse and evaluate an expression like "foo.bar > 5" or "fmt price" */
function evalExpression(expr,context){
  expr=expr.trim();
  /* Comparison operators */
  const compareOps=[
    {op:">=",fn:(a,b)=>(Number(a)||0)>=(Number(b)||0)},
    {op:"<=",fn:(a,b)=>(Number(a)||0)<=(Number(b)||0)},
    {op:"==",fn:(a,b)=>a==b},
    {op:"!=",fn:(a,b)=>a!=b},
    {op:">",fn:(a,b)=>(Number(a)||0)>(Number(b)||0)},
    {op:"<",fn:(a,b)=>(Number(a)||0)<(Number(b)||0)},
  ];
  for(const {op,fn} of compareOps){
    const idx=expr.indexOf(op);
    if(idx>0){
      const left=evalExpression(expr.slice(0,idx),context);
      const right=evalExpression(expr.slice(idx+op.length),context);
      return fn(left,right);
    }
  }
  /* Helper call: "fmt amount" or "mult qty price" */
  const parts=expr.split(/\s+/).filter(Boolean);
  if(parts.length>=2&&HELPERS[parts[0]]){
    const args=parts.slice(1).map(a=>resolvePath(a,context));
    try{return HELPERS[parts[0]](...args)}catch(e){return""}
  }
  /* Simple path resolution */
  if(parts.length===1){
    if(HELPERS[parts[0]])return HELPERS[parts[0]]();
    return resolvePath(parts[0],context);
  }
  /* Fallback: treat as path */
  return resolvePath(expr,context);
}

/* Main template renderer */
export function renderTemplate(template,context){
  if(!template)return"";
  if(!context)context={};
  let output=template;
  /* 1. Handle {{#each arr}}...{{/each}} loops (nested-safe by depth-first matching) */
  const eachRegex=/\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  let prevOutput="";
  let iterations=0;
  while(prevOutput!==output&&iterations<10){
    prevOutput=output;
    output=output.replace(eachRegex,(match,pathExpr,body)=>{
      const arr=resolvePath(pathExpr.trim(),context);
      if(!Array.isArray(arr)||arr.length===0)return"";
      return arr.map((item,idx)=>{
        const itemCtx={...context,this:item,"@index":idx,"@first":idx===0,"@last":idx===arr.length-1};
        /* Also expose item properties at top level for convenience */
        if(item&&typeof item==="object")Object.assign(itemCtx,item);
        return renderTemplate(body,itemCtx);
      }).join("");
    });
    iterations++;
  }
  /* 2. Handle {{#if cond}}...{{else}}...{{/if}} (supports optional else) */
  const ifRegex=/\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  prevOutput="";iterations=0;
  while(prevOutput!==output&&iterations<10){
    prevOutput=output;
    output=output.replace(ifRegex,(match,cond,yesBody,noBody)=>{
      const val=evalExpression(cond.trim(),context);
      return isTruthy(val)?yesBody:(noBody||"");
    });
    iterations++;
  }
  /* 3. Handle {{{raw}}} (no escaping) */
  output=output.replace(/\{\{\{([^}]+)\}\}\}/g,(match,expr)=>{
    const val=evalExpression(expr.trim(),context);
    return val==null?"":String(val);
  });
  /* 4. Handle {{var}} (escaped) */
  output=output.replace(/\{\{([^}#/][^}]*?)\}\}/g,(match,expr)=>{
    const val=evalExpression(expr.trim(),context);
    return escapeHtml(val);
  });
  return output;
}

/* Validate a template — return {valid, errors[]} */
export function validateTemplate(template){
  const errors=[];
  if(!template)return{valid:true,errors:[]};
  /* Check balanced tags */
  const opens=(template.match(/\{\{#(if|each)\s/g)||[]).length;
  const closes=(template.match(/\{\{\/(if|each)\}\}/g)||[]).length;
  if(opens!==closes){
    errors.push("عدد الوسوم المفتوحة لا يساوي المغلقة ({{#if}} أو {{#each}})");
  }
  /* Check for obvious syntax issues */
  if(/\{\{[^}]*$/.test(template)){errors.push("وسم {{ بدون إغلاق")}
  return{valid:errors.length===0,errors};
}

/* List all variables referenced in a template (for docs/hints) */
export function extractVariables(template){
  if(!template)return[];
  const vars=new Set();
  const regex=/\{\{\{?[^}#/][^}]*\}?\}\}/g;
  let m;
  while((m=regex.exec(template))!==null){
    const expr=m[0].replace(/[{}]/g,"").trim();
    const firstWord=expr.split(/\s+/)[0];
    if(firstWord&&!HELPERS[firstWord]&&!firstWord.startsWith('"')&&!firstWord.startsWith("'")&&!/^-?\d/.test(firstWord)){
      vars.add(firstWord);
    }
  }
  return Array.from(vars).sort();
}

/* Convenience: render with default CSS wrapper */
export function renderPrintTemplate(template,context,options={}){
  const html=renderTemplate(template,context);
  const css=options.css||"";
  return{
    html,
    fullHtml:"<!DOCTYPE html><html dir='rtl'><head><meta charset='UTF-8'><style>"+css+"</style></head><body>"+html+"</body></html>"
  };
}
