/* ═══════════════════════════════════════════════════════════════════════
   CLARK · CustomRolesManager (V19.45)
   ───────────────────────────────────────────────────────────────────────
   Admin UI for managing custom roles. Lives inside Settings → Users tab.

   Custom roles are layered on top of built-in roles. The admin defines:
     - a label (Arabic display name)
     - an icon (emoji from preset suggestions or any custom emoji)
     - a color (preset palette or any hex)
     - a description (what the role is for)
     - a "based on" template (a built-in role whose default perms get
       SNAPSHOT into the new custom role at creation time)

   After creation, the role appears as a column in the permissions matrix
   where the admin can fine-tune any cell. The user dropdown also gets the
   new role automatically.

   Constraints:
     - Cannot delete a role if any existing user is assigned to it
     - Cannot delete or modify built-in roles (they're hardcoded)
     - Role keys are auto-generated and immutable (label can be edited)
     - Hardcoded "admin" role can never be a basedOn template (it's locked
       in the registry — copying its perms would create a near-admin role
       which defeats the locking)
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, DelBtn, Inp, Sel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { ask, showToast, tell } from "../utils/popups.js";
import {
  ROLES,
  ROLE_META,
  DEFAULT_PERMS,
  PERMISSION_TABS,
  generateRoleKey,
  ROLE_COLOR_PALETTE,
  ROLE_ICON_SUGGESTIONS,
} from "../utils/permissions.js";

/* Built-in roles that can serve as templates. Excludes admin (per the
   constraint above) and hides the "viewer" if the admin wants — actually
   keeping viewer is useful as the most-restrictive starting point. */
const TEMPLATE_ROLES = ROLES.filter(r => r.key !== "admin");

export function CustomRolesManager({config, upConfig, isMob, requirePass}){
  const customRoles = (config && Array.isArray(config.customRoles)) ? config.customRoles : [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); /* role being edited, or null */

  const usersByRole = (() => {
    const m = {};
    (config?.usersList || []).forEach(u => {
      m[u.role] = (m[u.role] || 0) + 1;
    });
    return m;
  })();

  const startCreate = () => {
    setEditing({
      isNew: true,
      key: "",
      label: "",
      icon: "👤",
      color: ROLE_COLOR_PALETTE[0],
      description: "",
      basedOn: "viewer",
    });
  };

  const startEdit = (role) => {
    setEditing({
      isNew: false,
      key: role.key,
      label: role.label || "",
      icon: role.icon || "👤",
      color: role.color || ROLE_COLOR_PALETTE[0],
      description: role.description || "",
      basedOn: role.basedOn || "viewer", /* read-only after creation but kept in state */
    });
  };

  const cancelEdit = () => setEditing(null);

  const saveRole = async () => {
    if(!editing) return;
    const label = (editing.label || "").trim();
    if(!label){
      await tell("اسم مطلوب", "اكتب اسم للدور (مثلاً 'مشرف مخزن')", {type:"warning"});
      return;
    }
    if(label.length > 40){
      await tell("اسم طويل جداً", "اسم الدور لازم يكون 40 حرف على الأكثر", {type:"warning"});
      return;
    }

    if(editing.isNew){
      /* Generate immutable key from label */
      const key = generateRoleKey(label);
      if(!key){
        await tell("اسم غير صالح", "اختار اسم بحروف أو أرقام", {type:"warning"});
        return;
      }
      /* Check collision with built-in OR existing custom */
      const builtInKeys = new Set(ROLES.map(r => r.key));
      if(builtInKeys.has(key)){
        await tell("تعارض في الاسم", "في دور مدمج بنفس الاسم. غيّر الاسم.", {type:"warning"});
        return;
      }
      const customKeys = new Set(customRoles.map(r => r.key));
      if(customKeys.has(key)){
        await tell("تعارض في الاسم", "في دور مخصص بنفس الاسم. غيّر الاسم.", {type:"warning"});
        return;
      }

      /* Snapshot the basedOn role's defaults — so future changes to that
         role don't retroactively affect this custom role. */
      const tmplKey = editing.basedOn || "viewer";
      const tmplDefaults = DEFAULT_PERMS[tmplKey] || DEFAULT_PERMS.viewer;
      /* Deep clone so HR object doesn't share reference */
      const snapshot = JSON.parse(JSON.stringify(tmplDefaults));

      const newRole = {
        key,
        label,
        icon: editing.icon || "👤",
        color: editing.color || ROLE_COLOR_PALETTE[0],
        description: (editing.description || "").trim(),
        basedOn: tmplKey,
        defaults: snapshot,
        createdAt: new Date().toISOString(),
        isCustom: true,
      };

      requirePass(() => upConfig(d => {
        if(!Array.isArray(d.customRoles)) d.customRoles = [];
        d.customRoles.push(newRole);
      }));
      showToast(`✓ تم إنشاء الدور "${label}"`);
    } else {
      /* Edit existing — only label/icon/color/description editable. defaults are
         tweaked via the permissions matrix, not here. */
      requirePass(() => upConfig(d => {
        if(!Array.isArray(d.customRoles)) return;
        const idx = d.customRoles.findIndex(r => r && r.key === editing.key);
        if(idx >= 0){
          d.customRoles[idx] = {
            ...d.customRoles[idx],
            label,
            icon: editing.icon || "👤",
            color: editing.color || ROLE_COLOR_PALETTE[0],
            description: (editing.description || "").trim(),
          };
        }
      }));
      showToast(`✓ تم تعديل "${label}"`);
    }
    setEditing(null);
  };

  const deleteRole = async (role) => {
    const userCount = usersByRole[role.key] || 0;
    if(userCount > 0){
      await tell(
        "لا يمكن الحذف",
        `الدور "${role.label}" مسند لـ${userCount} مستخدم. غيّر دورهم لدور آخر أولاً، ثم احذف الدور.`,
        {type:"warning"}
      );
      return;
    }
    const ok = await ask(
      "حذف الدور",
      `حذف الدور "${role.label}"؟\n\nأي تخصيصات في جدول الصلاحيات لهذا الدور هتتمسح. لو ضفته لمستخدم في المستقبل، هيحتاج تعريف من جديد.`,
      {danger:true, confirmText:"حذف"}
    );
    if(!ok) return;
    requirePass(() => upConfig(d => {
      if(Array.isArray(d.customRoles)){
        d.customRoles = d.customRoles.filter(r => r && r.key !== role.key);
      }
      /* Also clean any custom permissions overrides for this role */
      if(d.permissions && d.permissions[role.key]){
        delete d.permissions[role.key];
      }
    }));
    showToast(`✓ تم حذف الدور`);
  };

  return <Card title="🎨 الأدوار المخصصة" style={{marginBottom:16}}>
    <div style={{fontSize:FS-2, color:T.textMut, marginBottom:12, lineHeight:1.7, padding:"10px 12px", background:T.accent+"08", borderRadius:8}}>
      💡 ضِف دور جديد مخصص لمصنعك (مثلاً "مشرف خط إنتاج"، "مدير ورديّة"، إلخ). كل دور بيبدأ من قالب موجود وبتقدر تخصص صلاحياته من جدول الصلاحيات تحت.
      <br/>⚠️ <b>الأدوار المدمجة (المدير العام، أمين المخزن، إلخ) مش قابلة للتعديل من هنا</b> — هي مثبّتة في الكود.
    </div>

    {/* List of existing custom roles */}
    {customRoles.length === 0 ? (
      <div style={{padding:30, textAlign:"center", color:T.textMut, fontSize:FS-1, background:T.bg, borderRadius:8, border:"1px dashed "+T.brd}}>
        لا توجد أدوار مخصصة لسه — اضغط الزر تحت لإنشاء دور جديد
      </div>
    ) : (
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)", gap:10, marginBottom:14}}>
        {customRoles.map(r => {
          const uc = usersByRole[r.key] || 0;
          const tmpl = ROLE_META[r.basedOn];
          return <div key={r.key} style={{
            padding:12, borderRadius:10,
            background:r.color+"08", border:"1px solid "+r.color+"30",
            display:"flex", alignItems:"flex-start", gap:10
          }}>
            <div style={{fontSize:28, lineHeight:1, flexShrink:0}}>{r.icon}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:FS, fontWeight:800, color:r.color, marginBottom:3}}>{r.label}</div>
              {r.description && <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.5, marginBottom:4}}>{r.description}</div>}
              <div style={{display:"flex", gap:8, flexWrap:"wrap", fontSize:FS-3, color:T.textMut, marginBottom:8}}>
                {tmpl && <span>📋 مبني على: <b>{tmpl.label}</b></span>}
                <span>👥 {uc} مستخدم</span>
              </div>
              <div style={{display:"flex", gap:6}}>
                <Btn small ghost onClick={() => startEdit(r)} style={{fontSize:FS-3}}>✏️ تعديل</Btn>
                <DelBtn onConfirm={() => deleteRole(r)} blocked={uc > 0 ? `مسند لـ${uc} مستخدم` : null}/>
              </div>
            </div>
          </div>;
        })}
      </div>
    )}

    <div style={{textAlign:"center"}}>
      <Btn primary onClick={startCreate} style={{background:T.accent, color:"#fff", fontWeight:700}}>
        + إنشاء دور جديد
      </Btn>
    </div>

    {/* Editor modal */}
    {editing && <RoleEditorModal
      editing={editing}
      setEditing={setEditing}
      onSave={saveRole}
      onCancel={cancelEdit}
      isMob={isMob}
    />}
  </Card>;
}

function RoleEditorModal({editing, setEditing, onSave, onCancel, isMob}){
  const update = (patch) => setEditing(prev => ({...prev, ...patch}));

  return <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:10004, display:"flex", alignItems:"center", justifyContent:"center", padding:isMob?8:16}} onClick={onCancel}>
    <div onClick={e => e.stopPropagation()} style={{
      background:T.cardSolid, borderRadius:14, padding:isMob?16:22,
      width:"100%", maxWidth:560, maxHeight:"92vh", overflowY:"auto",
      border:"1px solid "+T.brd, boxShadow:"0 25px 70px rgba(0,0,0,0.45)"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"2px solid "+T.brd}}>
        <div style={{fontSize:FS+2, fontWeight:800, color:T.text}}>
          {editing.isNew ? "🎨 إنشاء دور جديد" : "✏️ تعديل الدور"}
        </div>
        <Btn ghost small onClick={onCancel}>✕</Btn>
      </div>

      {/* Live preview card */}
      <div style={{
        padding:14, borderRadius:10, marginBottom:14,
        background:editing.color+"08", border:"2px solid "+editing.color+"40",
        display:"flex", alignItems:"center", gap:12
      }}>
        <div style={{fontSize:32, lineHeight:1}}>{editing.icon || "👤"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:FS+1, fontWeight:800, color:editing.color}}>{editing.label || "اسم الدور"}</div>
          <div style={{fontSize:FS-2, color:T.textSec, marginTop:2}}>{editing.description || "وصف الدور هيظهر هنا"}</div>
        </div>
      </div>

      {/* Label */}
      <div style={{marginBottom:12}}>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>
          اسم الدور <span style={{color:T.err}}>*</span>
        </label>
        <Inp value={editing.label} onChange={v => update({label: v})} placeholder="مثل: مشرف مخزن"/>
      </div>

      {/* Icon picker */}
      <div style={{marginBottom:12}}>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>
          الأيقونة
        </label>
        <div style={{display:"flex", flexWrap:"wrap", gap:6, padding:8, background:T.bg, borderRadius:8, border:"1px solid "+T.brd, marginBottom:6}}>
          {ROLE_ICON_SUGGESTIONS.map(em => (
            <button key={em} onClick={() => update({icon: em})}
              style={{
                width:36, height:36, borderRadius:6,
                background: editing.icon === em ? T.accent+"20" : "transparent",
                border: "2px solid " + (editing.icon === em ? T.accent : "transparent"),
                fontSize:20, cursor:"pointer", padding:0,
              }}>
              {em}
            </button>
          ))}
        </div>
        <Inp value={editing.icon} onChange={v => update({icon: v})} placeholder="أو ضع أي إيموجي" style={{fontSize:FS}}/>
      </div>

      {/* Color picker */}
      <div style={{marginBottom:12}}>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>
          اللون
        </label>
        <div style={{display:"flex", flexWrap:"wrap", gap:6, padding:8, background:T.bg, borderRadius:8, border:"1px solid "+T.brd}}>
          {ROLE_COLOR_PALETTE.map(c => (
            <button key={c} onClick={() => update({color: c})}
              style={{
                width:32, height:32, borderRadius:"50%",
                background:c, cursor:"pointer", padding:0,
                border: "3px solid " + (editing.color === c ? T.text : c),
                outline: editing.color === c ? "2px solid "+T.text : "none",
                outlineOffset: 1,
              }}/>
          ))}
        </div>
      </div>

      {/* Description */}
      <div style={{marginBottom:12}}>
        <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>
          الوصف <span style={{color:T.textMut, fontWeight:400}}>(اختياري)</span>
        </label>
        <Inp value={editing.description} onChange={v => update({description: v})} placeholder="مختصر يوضح وظيفة الدور"/>
      </div>

      {/* Based-on (only on create — basedOn is immutable after) */}
      {editing.isNew && (
        <div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:4}}>
            مبني على (قالب الصلاحيات)
          </label>
          <Sel value={editing.basedOn} onChange={v => update({basedOn: v})}>
            {TEMPLATE_ROLES.map(r => (
              <option key={r.key} value={r.key}>{r.icon} {r.label} — {r.description?.slice(0,40)}</option>
            ))}
          </Sel>
          <div style={{fontSize:FS-3, color:T.textMut, marginTop:4, lineHeight:1.6}}>
            💡 الصلاحيات الافتراضية للدور الجديد هتتنسخ من القالب اللي تختاره. بعد الإنشاء تقدر تعدّل أي خانة في جدول الصلاحيات.
          </div>
        </div>
      )}

      {!editing.isNew && (
        <div style={{padding:10, background:T.bg, borderRadius:8, fontSize:FS-2, color:T.textMut, marginBottom:12, lineHeight:1.6}}>
          💡 لا يمكن تغيير القالب الأساسي بعد الإنشاء. لتعديل الصلاحيات نفسها، استخدم جدول الصلاحيات تحت.
        </div>
      )}

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", paddingTop:10, borderTop:"1px solid "+T.brd}}>
        <Btn ghost onClick={onCancel}>إلغاء</Btn>
        <Btn primary onClick={onSave}>{editing.isNew ? "إنشاء" : "حفظ التعديلات"}</Btn>
      </div>
    </div>
  </div>;
}
