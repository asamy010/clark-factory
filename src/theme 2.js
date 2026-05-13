/* ═══════════════════════════════════════════════════════════════
   CLARK - Theme Module
   
   IMPORTANT DESIGN NOTE:
   T is a PROXY object whose properties mirror the active theme.
   Other modules import T and read its properties.
   When the user changes theme, setActiveTheme() is called which
   mutates T's properties in place (not replacing the reference).
   
   This preserves the V14.66 behavior where module-level "T" was
   reassigned and other helpers read from it. With ES modules we
   can't reassign the imported binding, so we mutate properties.
   
   Similarly TH/TD/TDB/TDL are mutable objects that get refreshed
   when the theme changes.
   ═══════════════════════════════════════════════════════════════ */

import { THEMES, FS } from "./constants/index.js";

/* T starts as a shallow copy of light theme.
   Consumers read its properties; they update when setActiveTheme() is called. */
export const T = {...THEMES.light};

/* Style objects — computed from T, also mutated in place on theme change */
export const TH = {};
export const TD = {};
export const TDB = {};
export const TDL = {};

function rebuildStyles(){
  /* TH */
  const thNew={textAlign:"right",padding:"6px 10px",fontSize:FS-2,fontWeight:600,color:T.textSec,whiteSpace:"nowrap",borderBottom:"2px solid "+T.brd,background:T.inputBg||T.cardSolid,letterSpacing:"0.03em"};
  Object.keys(TH).forEach(k=>delete TH[k]);
  Object.assign(TH,thNew);
  /* TD */
  const tdNew={padding:"6px 10px",fontSize:FS,color:T.text,borderBottom:"1px solid "+T.brd,verticalAlign:"middle"};
  Object.keys(TD).forEach(k=>delete TD[k]);
  Object.assign(TD,tdNew);
  /* TDB = TD + fontWeight 600 */
  Object.keys(TDB).forEach(k=>delete TDB[k]);
  Object.assign(TDB,{...tdNew,fontWeight:600});
  /* TDL = TD + textSec color + width 80 + nowrap */
  Object.keys(TDL).forEach(k=>delete TDL[k]);
  Object.assign(TDL,{...tdNew,color:T.textSec,width:80,whiteSpace:"nowrap"});
}

/* Call this whenever the user switches theme. Mutates T in place. */
export function setActiveTheme(themeName){
  const newTheme=THEMES[themeName]||THEMES.light;
  /* Clear all current props from T then copy new */
  Object.keys(T).forEach(k=>{if(!(k in newTheme))delete T[k]});
  Object.assign(T,newTheme);
  rebuildStyles();
}

/* Initialize styles once */
rebuildStyles();
