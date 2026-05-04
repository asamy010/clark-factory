/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PermissionsInspectorModal (V19.44)
   ───────────────────────────────────────────────────────────────────────
   Quick-view tool the admin opens by clicking "🔍 فحص" next to any user.
   Shows what that user can actually do across every tab — combining the
   role's defaults with any custom overrides in factory/config.permissions.

   Useful for debugging: when a worker reports "I can't save X", the admin
   opens their inspector and immediately sees whether the issue is a missing
   permission (red ✕ "hide") vs. a different bug.
   ═══════════════════════════════════════════════════════════════════════ */

import { Btn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import {
  PERMISSION_TABS,
  ROLE_META,
  HR_SUBKEYS,
  effectivePerm,
  effectivePermWithCustoms,
  getEffectiveRoleMeta,
} from "../utils/permissions.js";

const LEVEL_META = {
  edit: { label: "تعديل", icon: "✏️", color: "#10B981", bg: "#10B98115" },
  view: { label: "عرض",   icon: "👁",  color: "#0EA5E9", bg: "#0EA5E915" },
  hide: { label: "مخفي",  icon: "✕",  color: "#94A3B8", bg: "#94A3B815" },
};

/* V19.45: Inspector now takes the full `config` so custom roles get resolved
   correctly. Old callers that pass `permissions` still work via backward-compat
   below — the wrapper synthesizes a config-shaped object. */
export function PermissionsInspectorModal({user, config, permissions, onClose, isMob}){
  /* Backward compat: callers from V19.44 passed `permissions` instead of full config.
     If only `permissions` was provided, wrap it. Custom roles won't resolve in that
     case — but we keep working for built-in roles. */
  const cfg = config || (permissions ? {permissions} : {});
  const role = user?.role || "viewer";
  const allRoleMeta = getEffectiveRoleMeta(cfg);
  const roleMeta = allRoleMeta[role] || ROLE_META.viewer;

  /* Group tabs by their `group` field for visual clustering */
  const groupedTabs = PERMISSION_TABS.reduce((acc, t) => {
    const g = t.group || "other";
    (acc[g] = acc[g] || []).push(t);
    return acc;
  }, {});

  const GROUP_LABELS = {
    core:       "🏠 الأساسيات",
    production: "🏗 الإنتاج",
    sales:      "🛒 المبيعات",
    purchase:   "🛍 المشتريات",
    warehouse:  "📦 المخازن",
    finance:    "💰 المالية",
    hr:         "👥 الموظفين",
    comms:      "📣 التواصل",
    admin:      "⚙️ الإدارة",
  };

  /* Compute summary counts */
  let editCount = 0, viewCount = 0, hideCount = 0;
  PERMISSION_TABS.forEach(t => {
    const p = effectivePermWithCustoms(role, t.key, cfg);
    if(typeof p === "object"){
      /* HR object — count its sub-perms */
      Object.values(p).forEach(v => {
        if(v === "edit") editCount++;
        else if(v === "view") viewCount++;
        else hideCount++;
      });
    } else {
      if(p === "edit") editCount++;
      else if(p === "view") viewCount++;
      else hideCount++;
    }
  });

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:10003, display:"flex", alignItems:"center", justifyContent:"center", padding:isMob?8:16}} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?14:22,
      width:"100%", maxWidth:780, maxHeight:"92vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.45)"
    }}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:14, paddingBottom:12, borderBottom:"2px solid "+T.brd, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:FS+2, fontWeight:800, color:T.text, marginBottom:4}}>
            🔍 فحص صلاحيات المستخدم
          </div>
          <div style={{fontSize:FS-1, color:T.textSec}}>
            <b>{user.name || "—"}</b> ({user.email})
          </div>
          <div style={{display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:6, background:roleMeta.color+"15", border:"1px solid "+roleMeta.color+"40", marginTop:6, fontSize:FS-1, fontWeight:700, color:roleMeta.color}}>
            <span>{roleMeta.icon}</span><span>{roleMeta.label}</span>
          </div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Role description */}
      <div style={{padding:10, background:roleMeta.color+"08", border:"1px solid "+roleMeta.color+"25", borderRadius:8, fontSize:FS-1, color:T.textSec, marginBottom:14, lineHeight:1.7}}>
        💡 {roleMeta.description}
      </div>

      {/* Summary counters */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14}}>
        <div style={{padding:10, background:LEVEL_META.edit.bg, borderRadius:8, border:"1px solid "+LEVEL_META.edit.color+"40", textAlign:"center"}}>
          <div style={{fontSize:FS-3, color:LEVEL_META.edit.color, fontWeight:700}}>تعديل</div>
          <div style={{fontSize:FS+4, fontWeight:900, color:LEVEL_META.edit.color}}>{editCount}</div>
        </div>
        <div style={{padding:10, background:LEVEL_META.view.bg, borderRadius:8, border:"1px solid "+LEVEL_META.view.color+"40", textAlign:"center"}}>
          <div style={{fontSize:FS-3, color:LEVEL_META.view.color, fontWeight:700}}>عرض فقط</div>
          <div style={{fontSize:FS+4, fontWeight:900, color:LEVEL_META.view.color}}>{viewCount}</div>
        </div>
        <div style={{padding:10, background:LEVEL_META.hide.bg, borderRadius:8, border:"1px solid "+LEVEL_META.hide.color+"40", textAlign:"center"}}>
          <div style={{fontSize:FS-3, color:LEVEL_META.hide.color, fontWeight:700}}>مخفي</div>
          <div style={{fontSize:FS+4, fontWeight:900, color:LEVEL_META.hide.color}}>{hideCount}</div>
        </div>
      </div>

      {/* Per-group breakdown */}
      <div style={{display:"flex", flexDirection:"column", gap:10}}>
        {Object.entries(groupedTabs).map(([groupKey, tabs]) => (
          <div key={groupKey} style={{border:"1px solid "+T.brd, borderRadius:8, overflow:"hidden"}}>
            <div style={{padding:"6px 10px", background:T.bg, borderBottom:"1px solid "+T.brd, fontSize:FS-2, fontWeight:700, color:T.textSec}}>
              {GROUP_LABELS[groupKey] || groupKey}
            </div>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:FS-1}}>
              <tbody>
                {tabs.map(tab => {
                  const p = effectivePermWithCustoms(role, tab.key, cfg);
                  if(typeof p === "object"){
                    /* HR — render parent + sub-rows */
                    return <PermissionRowGroup key={tab.key} tab={tab} hrPerms={p}/>;
                  }
                  const meta = LEVEL_META[p] || LEVEL_META.hide;
                  return <tr key={tab.key} style={{borderTop:"1px solid "+T.brd}}>
                    <td style={{padding:"7px 10px"}}>
                      <span style={{marginInlineEnd:6}}>{tab.icon}</span>
                      <span style={{color:T.text, fontWeight:600}}>{tab.label}</span>
                    </td>
                    <td style={{padding:"7px 10px", textAlign:"left", direction:"ltr", width:120}}>
                      <span style={{display:"inline-flex", alignItems:"center", gap:4, padding:"3px 9px", borderRadius:5, background:meta.bg, color:meta.color, fontWeight:700, fontSize:FS-2}}>
                        <span>{meta.icon}</span><span>{meta.label}</span>
                      </span>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{marginTop:12, padding:10, background:T.accent+"08", border:"1px solid "+T.accent+"25", borderRadius:8, fontSize:FS-2, color:T.textSec, lineHeight:1.7}}>
        💡 <b>تفسير الصلاحيات:</b> "تعديل" = يقدر يضيف ويعدّل ويحذف. "عرض" = يقدر يشوف بس بدون تعديل. "مخفي" = التبويب غير ظاهر له. لتغيير صلاحية، ارجع لجدول الصلاحيات تحت أو غيّر دور المستخدم.
      </div>

      <div style={{display:"flex", justifyContent:"flex-end", marginTop:14}}>
        <Btn ghost onClick={onClose}>إغلاق</Btn>
      </div>
    </div>
  </div>;
}

/* HR rendered as parent row + 4 sub-rows (matches the matrix UX) */
function PermissionRowGroup({tab, hrPerms}){
  const allHide = HR_SUBKEYS.every(s => (hrPerms[s.key] || "hide") === "hide");
  return <>
    <tr style={{borderTop:"1px solid "+T.brd, background:T.bg+"60"}}>
      <td style={{padding:"7px 10px", fontWeight:700}}>
        <span style={{marginInlineEnd:6}}>{tab.icon}</span>
        <span style={{color:T.text}}>{tab.label}</span>
        <span style={{fontSize:FS-3, color:T.textMut, marginInlineStart:6, fontWeight:500}}>(4 أقسام)</span>
      </td>
      <td style={{padding:"7px 10px", textAlign:"left", direction:"ltr", color:T.textMut, fontStyle:"italic", fontSize:FS-2}}>
        {allHide ? "✕ كل الأقسام مخفية" : "↓ تفاصيل تحت"}
      </td>
    </tr>
    {!allHide && HR_SUBKEYS.map(sub => {
      const subLevel = hrPerms[sub.key] || "hide";
      const meta = LEVEL_META[subLevel] || LEVEL_META.hide;
      return <tr key={sub.key} style={{borderTop:"1px solid "+T.brd}}>
        <td style={{padding:"6px 10px 6px 24px", fontSize:FS-2, color:T.textSec}}>
          <span style={{marginInlineEnd:6}}>{sub.icon}</span>{sub.label}
        </td>
        <td style={{padding:"6px 10px", textAlign:"left", direction:"ltr"}}>
          <span style={{display:"inline-flex", alignItems:"center", gap:4, padding:"2px 7px", borderRadius:5, background:meta.bg, color:meta.color, fontWeight:700, fontSize:FS-3}}>
            <span>{meta.icon}</span><span>{meta.label}</span>
          </span>
        </td>
      </tr>;
    })}
  </>;
}
