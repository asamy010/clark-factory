/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.103 — Tags Manager Panel (Slice 3 of Universal Tagging)
   ───────────────────────────────────────────────────────────────
   Full CRUD UI for the Tag Registry. Lives in Settings → التاجز tab.
   Talks to Firestore exclusively via the upConfig(updater) pattern;
   never writes directly.

   Props:
     data       — full config (needed for usage counts across entities)
     upConfig   — config mutator (prev => next)
     canEdit    — boolean. Manager+Admin per data-safety decision
     user       — current user (for createdBy attribution)
     isMob      — boolean, mobile layout flag
     orders     — optional, for order-tag usage counts (Phase 1 has no
                  order tags yet — passed empty until Slice 7)

   The component is self-contained: state for filters/search/edit form
   lives in local state; only the final commits go through upConfig.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { Btn, Inp, Card } from "./ui.jsx";
import { ask, tell, showToast } from "../utils/popups.js";
import {
  TAG_COLORS,
  TAG_ENTITY_LABELS,
  TAGGABLE_ENTITY_TYPES,
  TAG_ERRORS,
  createTag,
  updateTag,
  renameTag,
  archiveTag,
  unarchiveTag,
  mergeTags,
  getAllTagsUsageCounts,
  normalizeTagName,
  sanitizeAppliesTo,
} from "../utils/tags.js";

function fmtDate(ts){
  if(!ts) return "—";
  try{
    const d = new Date(ts);
    return d.toLocaleDateString("ar-EG", { year:"numeric", month:"short", day:"numeric" });
  }catch(_){ return "—"; }
}

/* Edit modal — used for both create + edit. `seed` is null for create,
   a tag object for edit. `existingRegistry` lets the modal detect name
   collisions before submit so the user gets immediate feedback. */
function TagEditModal({ seed, existingRegistry, onSave, onCancel }){
  const isNew = !seed;
  const [name, setName] = useState(seed ? seed.name : "");
  const [color, setColor] = useState(seed ? seed.color : TAG_COLORS[0]);
  const [icon, setIcon] = useState(seed ? (seed.icon || "") : "");
  const [description, setDescription] = useState(seed ? (seed.description || "") : "");
  const [appliesTo, setAppliesTo] = useState(
    seed && Array.isArray(seed.appliesTo) && seed.appliesTo.length > 0
      ? seed.appliesTo
      : [...TAGGABLE_ENTITY_TYPES]
  );

  /* Live collision check — runs against the registry as the user types.
     Suppresses false-positives on self (when editing). */
  const nameTrimmed = String(name || "").trim().replace(/\s+/g, " ");
  const nameLC = nameTrimmed.toLowerCase();
  const collision = useMemo(() => {
    if(!nameLC) return null;
    return (existingRegistry || []).find(t =>
      t && t.nameLC === nameLC && !t.archived && (!seed || t.id !== seed.id)
    );
  }, [existingRegistry, nameLC, seed]);

  const toggleEntity = (et) => {
    setAppliesTo(prev => {
      if(prev.includes(et)) return prev.filter(x => x !== et);
      return [...prev, et];
    });
  };

  const submit = () => {
    if(!nameTrimmed){ showToast("⚠️ اكتب اسم التاج"); return; }
    if(collision){ showToast("⚠️ تاج بنفس الاسم موجود بالفعل"); return; }
    const cleaned = sanitizeAppliesTo(appliesTo);
    onSave({
      name: nameTrimmed,
      color,
      icon: icon.trim().slice(0, 4),
      description: description.trim().slice(0, 200),
      appliesTo: cleaned,
    });
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100000,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        background: T.cardSolid,
        borderRadius: 16,
        width:"100%", maxWidth: 520,
        padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd,
        maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{
          fontSize: FS+3, fontWeight:800, color: T.text,
          marginBottom: 14, display:"flex", alignItems:"center", gap:8,
        }}>
          <span style={{
            width:24, height:24, borderRadius:"50%",
            background: color, display:"inline-block",
            border:"2px solid "+T.brd,
          }} />
          <span>{isNew ? "تاج جديد" : "تعديل التاج"}</span>
        </div>

        <div style={{marginBottom: 12}}>
          <label style={{fontSize: FS-1, fontWeight:600, color: T.textSec, display:"block", marginBottom: 4}}>الاسم</label>
          <Inp value={name} onChange={setName} placeholder="مثلاً: VIP أو جملة" />
          {collision && (
            <div style={{fontSize: FS-2, color: T.err, marginTop: 4}}>
              ⚠️ موجود بالفعل تاج بنفس الاسم: "{collision.name}"
            </div>
          )}
        </div>

        <div style={{marginBottom: 12}}>
          <label style={{fontSize: FS-1, fontWeight:600, color: T.textSec, display:"block", marginBottom: 6}}>اللون</label>
          <div style={{display:"flex", flexWrap:"wrap", gap: 8}}>
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: c, cursor:"pointer",
                  border: color === c ? "3px solid "+T.text : "2px solid "+T.brd,
                  boxShadow: color === c ? "0 2px 8px "+c+"66" : "none",
                  padding: 0,
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div style={{display:"flex", gap: 12, marginBottom: 12}}>
          <div style={{flex:"0 0 100px"}}>
            <label style={{fontSize: FS-1, fontWeight:600, color: T.textSec, display:"block", marginBottom: 4}}>الإيموجي</label>
            <Inp value={icon} onChange={setIcon} placeholder="⭐" />
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize: FS-1, fontWeight:600, color: T.textSec, display:"block", marginBottom: 4}}>الوصف (اختياري)</label>
            <Inp value={description} onChange={setDescription} placeholder="ملاحظات عن استخدام هذا التاج" />
          </div>
        </div>

        <div style={{marginBottom: 16}}>
          <label style={{fontSize: FS-1, fontWeight:600, color: T.textSec, display:"block", marginBottom: 6}}>يطبق على</label>
          <div style={{display:"flex", flexWrap:"wrap", gap: 8}}>
            {TAGGABLE_ENTITY_TYPES.map(et => {
              const on = appliesTo.includes(et);
              return (
                <button
                  key={et}
                  onClick={() => toggleEntity(et)}
                  style={{
                    padding: "5px 12px", borderRadius: 14, fontSize: FS-2, fontWeight:600,
                    fontFamily:"inherit", cursor:"pointer",
                    background: on ? T.accent : "transparent",
                    color: on ? "#fff" : T.textSec,
                    border: "1px solid " + (on ? T.accent : T.brd),
                  }}
                >
                  {on ? "✓ " : ""}{TAG_ENTITY_LABELS[et] || et}
                </button>
              );
            })}
          </div>
          {appliesTo.length === 0 && (
            <div style={{fontSize: FS-2, color: T.warn, marginTop: 6}}>
              ⚠️ اختر نوع واحد على الأقل (وإلا هـ يطبق على الكل)
            </div>
          )}
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel}>إلغاء</Btn>
          <Btn primary onClick={submit} disabled={!!collision || !nameTrimmed}>
            {isNew ? "إنشاء" : "حفظ"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* Merge modal — picks the winner from the user-selected set, then commits. */
function MergeModal({ selectedTags, registry, data, onCommit, onCancel }){
  const [winnerId, setWinnerId] = useState(selectedTags[0] ? selectedTags[0].id : null);
  const tagsByLoser = useMemo(() => selectedTags.filter(t => t.id !== winnerId), [selectedTags, winnerId]);

  const usageCounts = useMemo(() => getAllTagsUsageCounts(registry, data), [registry, data]);
  const totalAffected = useMemo(() => {
    return tagsByLoser.reduce((sum, t) => sum + (usageCounts[t.id] || 0), 0);
  }, [tagsByLoser, usageCounts]);

  const submit = () => {
    if(!winnerId){ showToast("⚠️ اختر التاج الفائز"); return; }
    if(tagsByLoser.length === 0){ showToast("⚠️ محتاج تختار 2 تاج على الأقل للدمج"); return; }
    onCommit(winnerId, tagsByLoser.map(t => t.id));
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100000,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        background: T.cardSolid,
        borderRadius: 16,
        width:"100%", maxWidth: 520,
        padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd,
        maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{fontSize: FS+3, fontWeight:800, color: T.text, marginBottom: 6}}>
          🔀 دمج التاجز
        </div>
        <div style={{fontSize: FS-1, color: T.textSec, marginBottom: 14, lineHeight: 1.6}}>
          اختر التاج <strong style={{color: T.ok}}>الفائز</strong> — كل الـ entities المرتبطة بالتاجز الأخرى هـ تتحوّل لتشير للفائز، والباقي هـ يـ archived تلقائياً.
        </div>

        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: T.bg, border: "1px solid "+T.brd,
          marginBottom: 14,
        }}>
          <div style={{fontSize: FS-2, color: T.textSec, marginBottom: 8}}>اختر الفائز:</div>
          <div style={{display:"flex", flexDirection:"column", gap: 6}}>
            {selectedTags.map(t => {
              const isWinner = t.id === winnerId;
              const count = usageCounts[t.id] || 0;
              return (
                <label key={t.id} style={{
                  display:"flex", alignItems:"center", gap: 8,
                  padding: "8px 10px", borderRadius: 8,
                  cursor:"pointer",
                  background: isWinner ? T.ok + "12" : "transparent",
                  border:"1px solid " + (isWinner ? T.ok : T.brd),
                }}>
                  <input
                    type="radio"
                    checked={isWinner}
                    onChange={() => setWinnerId(t.id)}
                    style={{accentColor: T.ok}}
                  />
                  <span style={{
                    display:"inline-block", width: 12, height: 12, borderRadius:"50%",
                    background: t.color,
                  }} />
                  {t.icon && <span>{t.icon}</span>}
                  <span style={{flex:1, fontSize: FS-1, fontWeight: isWinner ? 700 : 500, color: T.text}}>
                    {t.name}
                  </span>
                  <span style={{fontSize: FS-3, color: T.textMut}}>{count} entity</span>
                  {isWinner && <span style={{fontSize: FS-2, color: T.ok, fontWeight: 800}}>← الفائز</span>}
                </label>
              );
            })}
          </div>
        </div>

        <div style={{
          fontSize: FS-2, color: T.warn,
          padding: "8px 12px", background: T.warn + "10", borderRadius: 8,
          marginBottom: 14, lineHeight: 1.6,
        }}>
          ⚠️ سيتم تحديث <strong>{totalAffected}</strong> entity ودمج <strong>{tagsByLoser.length}</strong> تاج في "{(selectedTags.find(t => t.id === winnerId) || {}).name || "—"}". العملية غير قابلة للتراجع تلقائياً (التاجز الأخرى تـ archived، لكن الـ entities المتأثرة لن تستعيد التاجز الأصلية).
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel}>إلغاء</Btn>
          <Btn primary onClick={submit}>تنفيذ الدمج</Btn>
        </div>
      </div>
    </div>
  );
}

export default function TagsManagerPanel({ data, upConfig, canEdit, user, isMob, orders }){
  const registry = Array.isArray(data && data.tagRegistry) ? data.tagRegistry : [];

  const [editing, setEditing] = useState(null);             // null | "new" | tag object
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");  // "all" | entity type
  const [showArchived, setShowArchived] = useState(false);
  const [selection, setSelection] = useState([]);            // tag IDs selected for merge
  const [merging, setMerging] = useState(false);

  /* Usage counts across all entity arrays in `data`. Recomputed when data
     or registry changes. Optionally includes the orders array passed
     separately (orders aren't in factory/config). */
  const usageCounts = useMemo(() => {
    const extras = Array.isArray(orders) ? [orders] : [];
    return getAllTagsUsageCounts(registry, data, extras);
  }, [registry, data, orders]);

  /* Apply user filters to the registry: archive toggle, entity filter, search. */
  const filteredRegistry = useMemo(() => {
    const q = normalizeTagName(search);
    return registry.filter(t => {
      if(!t) return false;
      if(!showArchived && t.archived) return false;
      if(entityFilter !== "all"){
        const a = Array.isArray(t.appliesTo) ? t.appliesTo : [];
        /* "applies to all" semantics (empty array) treated as universal. */
        if(a.length > 0 && !a.includes(entityFilter)) return false;
      }
      if(q && !(t.nameLC || "").includes(q)) return false;
      return true;
    }).sort((a, b) => {
      /* Stable sort: archived last, then by usage desc, then alphabetic asc. */
      if((a.archived ? 1 : 0) !== (b.archived ? 1 : 0)) return (a.archived ? 1 : 0) - (b.archived ? 1 : 0);
      const ua = usageCounts[a.id] || 0;
      const ub = usageCounts[b.id] || 0;
      if(ua !== ub) return ub - ua;
      return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    });
  }, [registry, search, entityFilter, showArchived, usageCounts]);

  const stats = useMemo(() => {
    let total = 0, active = 0, archived = 0;
    for(const t of registry){
      if(!t) continue;
      total++;
      if(t.archived) archived++; else active++;
    }
    return { total, active, archived };
  }, [registry]);

  /* ── Mutations (all go through upConfig) ── */

  const onCreate = (formData) => {
    try{
      const { tag, registry: newReg, isNew } = createTag(
        formData.name,
        {
          color: formData.color,
          icon: formData.icon,
          description: formData.description,
          appliesTo: formData.appliesTo,
        },
        registry,
        user
      );
      upConfig(prev => ({ ...prev, tagRegistry: newReg }));
      showToast(isNew ? "✅ التاج اتأنشأ" : "ℹ️ التاج موجود بالفعل — استخدمت الـ نسخة الموجودة");
      setEditing(null);
    }catch(e){
      const msg = (e && e.message) || "";
      if(msg.startsWith(TAG_ERRORS.EMPTY)) showToast("⚠️ اكتب اسم التاج");
      else showToast("⛔ تعذر إنشاء التاج");
    }
  };

  const onSaveEdit = (tag, formData) => {
    try{
      let next = registry;
      /* Rename only if the user changed it (preserve nameLC otherwise). */
      const newLC = formData.name.toLowerCase();
      if(newLC !== tag.nameLC){
        next = renameTag(tag.id, formData.name, next);
      }
      next = updateTag(tag.id, {
        color: formData.color,
        icon: formData.icon,
        description: formData.description,
        appliesTo: formData.appliesTo,
      }, next);
      upConfig(prev => ({ ...prev, tagRegistry: next }));
      showToast("✅ التاج اتعدّل");
      setEditing(null);
    }catch(e){
      const msg = (e && e.message) || "";
      if(msg.startsWith(TAG_ERRORS.EMPTY)) showToast("⚠️ اكتب اسم التاج");
      else if(msg.startsWith(TAG_ERRORS.EXISTS)) showToast("⚠️ تاج بنفس الاسم موجود بالفعل");
      else showToast("⛔ تعذر حفظ التعديل");
    }
  };

  const doArchive = async (tag) => {
    const count = usageCounts[tag.id] || 0;
    const message = count > 0
      ? `هل أنت متأكد؟ التاج "${tag.name}" مستخدم في ${count} entity. هـ يفضل مرتبط بيهم لكن مش هـ يظهر في الـ picker الجديد.`
      : `أرشفة التاج "${tag.name}"؟`;
    const yes = await ask("أرشفة التاج", message, { confirmText: "أرشفة" });
    if(!yes) return;
    const next = archiveTag(tag.id, registry, user);
    upConfig(prev => ({ ...prev, tagRegistry: next }));
    showToast("📦 التاج اتـ archive");
  };

  const doUnarchive = async (tag) => {
    /* If nameLC of the archived tag collides with an active one, refuse:
       un-archiving would create a duplicate. User must rename one first. */
    const collision = registry.find(t =>
      t && t.id !== tag.id && t.nameLC === tag.nameLC && !t.archived
    );
    if(collision){
      await tell("لا يمكن استرجاع التاج",
        `يوجد تاج نشط بنفس الاسم: "${collision.name}". أعد تسمية أحدهما أولاً.`,
        { type:"warning" });
      return;
    }
    const next = unarchiveTag(tag.id, registry);
    upConfig(prev => ({ ...prev, tagRegistry: next }));
    showToast("↩️ التاج اتـ استرجع");
  };

  const doHardDelete = async (tag) => {
    const count = usageCounts[tag.id] || 0;
    if(count > 0){
      await tell("لا يمكن الحذف",
        `التاج "${tag.name}" مستخدم في ${count} entity. لازم تـ archive بدلاً من الحذف للحفاظ على الـ history.`,
        { type:"warning" });
      return;
    }
    const yes = await ask("حذف نهائي",
      `حذف التاج "${tag.name}" نهائياً؟ غير قابل للاسترجاع.`,
      { confirmText: "حذف", danger: true });
    if(!yes) return;
    const next = registry.filter(t => t && t.id !== tag.id);
    upConfig(prev => ({ ...prev, tagRegistry: next }));
    showToast("🗑️ التاج اتـ delete");
  };

  const toggleSelect = (tagId) => {
    setSelection(prev => prev.includes(tagId) ? prev.filter(x => x !== tagId) : [...prev, tagId]);
  };

  const doMergeCommit = (winnerId, losersIds) => {
    const { registry: newReg, patch, changedFields } = mergeTags(winnerId, losersIds, registry, data);
    upConfig(prev => ({ ...prev, tagRegistry: newReg, ...patch }));
    setMerging(false);
    setSelection([]);
    showToast(`✅ تم دمج ${losersIds.length} تاج. الـ entities المتأثرة: ${changedFields.join(", ") || "—"}`);
  };

  if(!canEdit){
    return (
      <Card title="🏷️ إدارة التاجز" style={{marginBottom:14}}>
        <div style={{padding: "12px 4px", fontSize: FS-1, color: T.textSec, lineHeight: 1.6}}>
          إدارة التاجز متاحة للمديرين فقط. يمكنك استخدام التاجز الموجودة في الـ pages الأخرى لكن لا يمكنك إنشاء/تعديل/حذف من هنا.
        </div>
      </Card>
    );
  }

  const colHeader = { padding:"8px 10px", fontSize: FS-2, fontWeight:700, color: T.textSec, textAlign:"right", background: T.bg, borderBottom:"2px solid "+T.brd, whiteSpace:"nowrap" };
  const colCell = { padding:"8px 10px", fontSize: FS-1, color: T.text, borderBottom:"1px solid "+T.brd, verticalAlign:"middle" };

  return (
    <>
      <Card title="🏷️ إدارة التاجز" style={{marginBottom: 14}}>
        {/* Stats strip */}
        <div style={{display:"flex", gap: 10, flexWrap:"wrap", marginBottom: 12}}>
          <div style={{
            padding:"6px 14px", borderRadius:10,
            background: T.accent + "12", color: T.accent,
            fontSize: FS-1, fontWeight:700,
          }}>إجمالي: {stats.total}</div>
          <div style={{
            padding:"6px 14px", borderRadius:10,
            background: T.ok + "12", color: T.ok,
            fontSize: FS-1, fontWeight:700,
          }}>نشطة: {stats.active}</div>
          {stats.archived > 0 && (
            <div style={{
              padding:"6px 14px", borderRadius:10,
              background: T.textMut + "12", color: T.textMut,
              fontSize: FS-1, fontWeight:700,
            }}>أرشيف: {stats.archived}</div>
          )}
        </div>

        {/* Toolbar */}
        <div style={{
          display:"flex", flexWrap:"wrap", gap: 8,
          marginBottom: 12, alignItems:"center",
        }}>
          <div style={{flex:"1 1 200px", minWidth: 160}}>
            <Inp value={search} onChange={setSearch} placeholder="🔍 بحث في التاجز..." />
          </div>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            style={{
              padding:"6px 10px", borderRadius:8, border:"1px solid "+T.brd,
              fontSize: FS-1, fontFamily:"inherit", background: T.cardSolid, color: T.text,
            }}
          >
            <option value="all">كل الأنواع</option>
            {TAGGABLE_ENTITY_TYPES.map(et => (
              <option key={et} value={et}>{TAG_ENTITY_LABELS[et]}</option>
            ))}
          </select>
          <label style={{
            display:"inline-flex", alignItems:"center", gap: 6,
            fontSize: FS-1, color: T.textSec, cursor:"pointer",
          }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            عرض المؤرشفة
          </label>
          <Btn primary onClick={() => setEditing("new")}>+ تاج جديد</Btn>
          {selection.length >= 2 && (
            <Btn onClick={() => setMerging(true)}>🔀 دمج ({selection.length})</Btn>
          )}
          {selection.length > 0 && (
            <Btn ghost onClick={() => setSelection([])}>إلغاء التحديد</Btn>
          )}
        </div>

        {/* Table */}
        {filteredRegistry.length === 0 ? (
          <div style={{
            padding: "20px 12px", textAlign:"center",
            fontSize: FS-1, color: T.textMut,
            background: T.bg, borderRadius: 10,
          }}>
            {registry.length === 0
              ? "مفيش تاجز لسه. ابدأ بـ \"+ تاج جديد\" لإنشاء أول واحد."
              : "مفيش تاجز مطابقة للفلاتر الحالية."}
          </div>
        ) : (
          <div style={{overflowX:"auto", borderRadius: 10, border:"1px solid "+T.brd}}>
            <table style={{width:"100%", borderCollapse:"collapse", minWidth: isMob ? "auto" : 700}}>
              <thead>
                <tr>
                  <th style={{...colHeader, width: 30}}></th>
                  <th style={colHeader}>التاج</th>
                  {!isMob && <th style={colHeader}>الوصف</th>}
                  <th style={colHeader}>يطبق على</th>
                  <th style={{...colHeader, width: 80, textAlign:"center"}}>الاستخدام</th>
                  {!isMob && <th style={{...colHeader, width: 110}}>آخر استخدام</th>}
                  <th style={{...colHeader, width: 130, textAlign:"center"}}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistry.map(t => {
                  const count = usageCounts[t.id] || 0;
                  const isSelected = selection.includes(t.id);
                  return (
                    <tr key={t.id} style={{
                      background: isSelected ? T.accent + "08" : (t.archived ? T.bg + "AA" : "transparent"),
                      opacity: t.archived ? 0.7 : 1,
                    }}>
                      <td style={{...colCell, textAlign:"center"}}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(t.id)}
                          disabled={t.archived}
                          title={t.archived ? "لا يمكن دمج تاج مؤرشف" : "تحديد للدمج"}
                        />
                      </td>
                      <td style={colCell}>
                        <div style={{display:"flex", alignItems:"center", gap: 8}}>
                          <span style={{
                            display:"inline-block", width: 14, height: 14, borderRadius:"50%",
                            background: t.color, flexShrink: 0, border:"1px solid "+T.brd,
                          }} />
                          {t.icon && <span style={{fontSize: FS}}>{t.icon}</span>}
                          <span style={{fontWeight: 700, color: T.text}}>{t.name}</span>
                          {t.archived && (
                            <span style={{
                              fontSize: FS-3, color: T.textMut,
                              padding:"1px 6px", borderRadius: 6,
                              background: T.textMut + "18", fontWeight: 600,
                            }}>📦 أرشيف</span>
                          )}
                        </div>
                      </td>
                      {!isMob && (
                        <td style={{...colCell, color: T.textSec, fontSize: FS-2, maxWidth: 220}}>
                          <div style={{
                            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                          }} title={t.description || ""}>
                            {t.description || "—"}
                          </div>
                        </td>
                      )}
                      <td style={colCell}>
                        <div style={{display:"flex", flexWrap:"wrap", gap: 4}}>
                          {(Array.isArray(t.appliesTo) && t.appliesTo.length > 0 ? t.appliesTo : TAGGABLE_ENTITY_TYPES).map(et => (
                            <span key={et} style={{
                              padding: "2px 8px", borderRadius: 10, fontSize: FS-3,
                              fontWeight: 600, background: T.bg, color: T.textSec,
                              border:"1px solid "+T.brd,
                            }}>{TAG_ENTITY_LABELS[et] || et}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{...colCell, textAlign:"center", fontWeight: 700, color: count > 0 ? T.accent : T.textMut}}>
                        {count}
                      </td>
                      {!isMob && (
                        <td style={{...colCell, fontSize: FS-2, color: T.textSec, whiteSpace:"nowrap"}}>
                          {fmtDate(t.lastUsedAt)}
                        </td>
                      )}
                      <td style={{...colCell, textAlign:"center"}}>
                        <div style={{display:"inline-flex", gap: 4}}>
                          <button
                            onClick={() => setEditing(t)}
                            disabled={t.archived}
                            style={{
                              padding:"4px 8px", borderRadius: 6,
                              background:"transparent", color: t.archived ? T.textMut : T.accent,
                              border:"1px solid "+(t.archived ? T.brd : T.accent + "44"),
                              cursor: t.archived ? "default" : "pointer",
                              fontSize: FS-2, fontFamily:"inherit", fontWeight: 600,
                            }}
                            title={t.archived ? "ارجع التاج أولاً لتعديله" : "تعديل"}
                          >✏️</button>
                          {!t.archived ? (
                            <button
                              onClick={() => doArchive(t)}
                              style={{
                                padding:"4px 8px", borderRadius: 6,
                                background:"transparent", color: T.warn,
                                border:"1px solid "+T.warn+"44",
                                cursor:"pointer", fontSize: FS-2, fontFamily:"inherit", fontWeight: 600,
                              }}
                              title="أرشفة"
                            >📦</button>
                          ) : (
                            <button
                              onClick={() => doUnarchive(t)}
                              style={{
                                padding:"4px 8px", borderRadius: 6,
                                background:"transparent", color: T.ok,
                                border:"1px solid "+T.ok+"44",
                                cursor:"pointer", fontSize: FS-2, fontFamily:"inherit", fontWeight: 600,
                              }}
                              title="استرجاع"
                            >↩️</button>
                          )}
                          {count === 0 && (
                            <button
                              onClick={() => doHardDelete(t)}
                              style={{
                                padding:"4px 8px", borderRadius: 6,
                                background:"transparent", color: T.err,
                                border:"1px solid "+T.err+"44",
                                cursor:"pointer", fontSize: FS-2, fontFamily:"inherit", fontWeight: 600,
                              }}
                              title="حذف نهائي (متاح بس لو مفيش استخدام)"
                            >🗑️</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{
          marginTop: 12, padding:"8px 12px",
          fontSize: FS-2, color: T.textSec,
          background: T.bg, borderRadius: 8, lineHeight: 1.7,
        }}>
          💡 <strong>الاستخدام:</strong> التاجز هـ تظهر في صفحات العملاء + الموردين + الأصناف + الأوردرات لما الـ Slices الجاية تـ ship.
          <br />
          📦 <strong>أرشفة vs حذف:</strong> الأرشفة تخفي التاج من الـ picker الجديد لكن تـ keep الـ history. الحذف النهائي متاح فقط لو الاستخدام = 0.
          <br />
          🔀 <strong>دمج:</strong> اختر 2+ تاج بالـ checkbox، اضغط "دمج" لتحويل كل الـ entities للتاج الفائز.
        </div>
      </Card>

      {editing && (
        <TagEditModal
          seed={editing === "new" ? null : editing}
          existingRegistry={registry}
          onSave={(formData) => {
            if(editing === "new") onCreate(formData);
            else onSaveEdit(editing, formData);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {merging && (
        <MergeModal
          selectedTags={registry.filter(t => selection.includes(t.id))}
          registry={registry}
          data={data}
          onCommit={doMergeCommit}
          onCancel={() => setMerging(false)}
        />
      )}
    </>
  );
}
