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
/* V21.9.104: Customer tags migration helpers (Slice 4 of Universal Tagging).
   Pure functions — analyze + commit two-phase pattern. */
import {
  planTagsMigration,
  commitTagsMigration,
} from "../utils/tagsMigration.js";

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
  /* V21.9.104: Migration state. `migrationPlan` is null until the admin
     clicks "تحليل"; then it holds the read-only preview. `migrationCommitting`
     blocks duplicate commits while upConfig is in flight. */
  const [migrationPlan, setMigrationPlan] = useState(null);
  const [migrationCommitting, setMigrationCommitting] = useState(false);
  /* V21.9.109: Cross-entity view state (Slice 8 of Universal Tagging).
     When set, opens a modal showing every entity referencing that tag. */
  const [viewingTagId, setViewingTagId] = useState(null);

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
      /* V21.9.110 fix: upConfig expects a MUTATOR that modifies `d` in place,
         not a transformer that returns a new object. Returning `{...prev, ...}`
         was discarded — the diff layer then saw no changes and skipped the write.
         All upConfig calls in this file follow the mutation pattern now. */
      upConfig(d => { d.tagRegistry = newReg; });
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
      upConfig(d => { d.tagRegistry = next; });
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
    upConfig(d => { d.tagRegistry = next; });
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
    upConfig(d => { d.tagRegistry = next; });
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
    upConfig(d => { d.tagRegistry = next; });
    showToast("🗑️ التاج اتـ delete");
  };

  const toggleSelect = (tagId) => {
    setSelection(prev => prev.includes(tagId) ? prev.filter(x => x !== tagId) : [...prev, tagId]);
  };

  const doMergeCommit = (winnerId, losersIds) => {
    const { registry: newReg, patch, changedFields } = mergeTags(winnerId, losersIds, registry, data);
    upConfig(d => {
      d.tagRegistry = newReg;
      /* `patch` may contain customers/suppliers/etc. with rewritten tag IDs —
         assign each field directly so the diff layer detects the partitioned writes. */
      for(const k of Object.keys(patch || {})){
        d[k] = patch[k];
      }
    });
    setMerging(false);
    setSelection([]);
    showToast(`✅ تم دمج ${losersIds.length} تاج. الـ entities المتأثرة: ${changedFields.join(", ") || "—"}`);
  };

  /* ── Migration handlers (V21.9.104) ── */

  const analyzeMigration = () => {
    /* Pure analysis — no writes. Always safe to call. */
    const plan = planTagsMigration(data);
    setMigrationPlan(plan);
  };

  const commitMigration = async () => {
    if(!migrationPlan || !migrationPlan.hasWork){
      setMigrationPlan(null);
      return;
    }
    /* Confirm one last time before the upConfig call — multi-array write is
       the most invasive operation in this panel. */
    const yes = await ask(
      "تأكيد الترحيل",
      `هـ يتم إنشاء ${migrationPlan.summary.newTagsToCreate} تاج جديد، تحديث ${migrationPlan.summary.customersToUpdate} عميل و ${migrationPlan.summary.shopifyCustomersToUpdate} عميل Shopify. غير قابل للتراجع التلقائي.`,
      { confirmText: "تنفيذ الترحيل" }
    );
    if(!yes) return;

    setMigrationCommitting(true);
    try{
      const { patch, stats } = commitTagsMigration(migrationPlan, data, user);
      upConfig(d => {
        for(const k of Object.keys(patch || {})){
          d[k] = patch[k];
        }
      });
      setMigrationPlan(null);
      await tell(
        "تم الترحيل",
        `إجمالي:\n• ${stats.newTags} تاج جديد في الـ registry\n• ${stats.customersUpdated} عميل محدّث\n• ${stats.shopifyCustomersUpdated} عميل Shopify محدّث\n\nالـ Shopify push هـ يـ resolve الـ IDs إلى أسماء تلقائياً بعد الـ deploy التالي.`,
        { type:"success" }
      );
    }catch(e){
      const msg = (e && e.message) || "خطأ غير معروف";
      await tell("فشل الترحيل", "تعذر تنفيذ الترحيل: " + msg + "\n\nالـ data لم تتغير. حاول مرة أخرى أو راجع الـ console.", { type:"error" });
    }finally{
      setMigrationCommitting(false);
    }
  };

  /* Compute migration banner state without committing. We do a quick scan
     to detect whether there's work — used to show/hide the migration card. */
  const migrationStatus = useMemo(() => {
    const quick = planTagsMigration(data);
    return {
      hasWork: quick.hasWork,
      customersToUpdate: quick.summary.customersToUpdate,
      shopifyCustomersToUpdate: quick.summary.shopifyCustomersToUpdate,
      newTagsToCreate: quick.summary.newTagsToCreate,
      lastRunAt: data && data._tagsCustomerMigrationV21_104_LastRunAt,
      everRun: !!(data && data._tagsCustomerMigrationV21_104_Done),
    };
  }, [data]);

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
      {/* V21.9.104: Customer Tags Migration card.
          Visible only when there's actual work (legacy string tags in
          c.tags or shopifyCustomer.tags). Hidden when migration is clean
          to keep the UI uncluttered. */}
      {migrationStatus.hasWork && (
        <Card style={{marginBottom: 14}}>
          <div style={{
            display:"flex", alignItems:"flex-start", gap: 12,
            padding: "6px 4px",
          }}>
            <div style={{
              fontSize: 26, lineHeight: 1, flexShrink: 0,
            }}>🚚</div>
            <div style={{flex:1}}>
              <div style={{fontSize: FS+1, fontWeight: 800, color: T.warn, marginBottom: 4}}>
                ترحيل tags العملاء — مطلوب إجراء
              </div>
              <div style={{fontSize: FS-1, color: T.textSec, lineHeight: 1.7, marginBottom: 10}}>
                تم اكتشاف <strong>{migrationStatus.customersToUpdate + migrationStatus.shopifyCustomersToUpdate}</strong> عميل
                بـ tags بـ صيغة قديمة (نص). الترحيل هـ يحوّلهم لـ ID references في الـ registry
                وينشئ <strong>{migrationStatus.newTagsToCreate}</strong> تاج جديد لـ الأسماء غير الموجودة.
                <br/>
                <strong>الـ Shopify push هـ يفضل شغّال</strong> — الـ adapter يـ resolve الـ IDs إلى أسماء قبل الإرسال.
              </div>
              <div style={{display:"flex", gap: 8, flexWrap:"wrap"}}>
                <Btn primary onClick={analyzeMigration}>
                  🔍 تحليل الترحيل (preview)
                </Btn>
                {migrationStatus.everRun && migrationStatus.lastRunAt && (
                  <div style={{
                    fontSize: FS-2, color: T.textMut,
                    padding: "6px 10px", borderRadius: 8,
                    background: T.bg, alignSelf:"center",
                  }}>
                    آخر تشغيل: {fmtDate(migrationStatus.lastRunAt)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

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
                      <td style={{...colCell, textAlign:"center", fontWeight: 700, color: count > 0 ? T.accent : T.textMut, cursor: count > 0 ? "pointer" : "default"}}
                          onClick={(e) => { if(count > 0){ e.stopPropagation(); setViewingTagId(t.id); } }}
                          title={count > 0 ? "اضغط لعرض الـ entities المرتبطة" : ""}>
                        {count > 0 ? <span style={{textDecoration:"underline", textUnderlineOffset:3}}>{count}</span> : count}
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

      {/* V21.9.104: Migration preview modal. Shows the read-only plan with
          stats + the list of new tags that will be created. Admin reviews
          before committing the write. */}
      {migrationPlan && (
        <MigrationPreviewModal
          plan={migrationPlan}
          onConfirm={commitMigration}
          onCancel={() => setMigrationPlan(null)}
          committing={migrationCommitting}
        />
      )}

      {/* V21.9.109: Cross-entity view modal. Opens on count-cell click.
          Shows every entity (customer/supplier/item/order) referencing the tag. */}
      {viewingTagId && (
        <CrossEntityViewModal
          tag={registry.find(t => t.id === viewingTagId)}
          data={data}
          orders={orders}
          onClose={() => setViewingTagId(null)}
        />
      )}
    </>
  );
}

/* ── Cross-entity view modal (V21.9.109, Slice 8 / final) ──────────────────
   Shows every entity that references the clicked tag. Read-only — no edits.
   This is the "Odoo feeling" finale: an admin clicks a tag in Settings, sees
   exactly where it's used across customers/suppliers/items/orders. */
function CrossEntityViewModal({ tag, data, orders, onClose }){
  if(!tag) return null;

  /* Collect entities by tag ID. Each entity exposes its name + a short
     subtitle for context (phone, type, status). */
  const matched = useMemo(() => {
    const tagId = tag.id;
    const out = {
      customers: [],
      shopifyCustomers: [],
      suppliers: [],
      fabrics: [],
      accessories: [],
      generalProducts: [],
      inventoryItems: [],
      orders: [],
    };
    const check = (arr) => Array.isArray(arr) ? arr.filter(e => e && Array.isArray(e.tags) && e.tags.includes(tagId)) : [];
    out.customers = check(data && data.customers);
    out.shopifyCustomers = check(data && data.shopifyCustomers);
    out.suppliers = check(data && data.suppliers);
    out.fabrics = check(data && data.fabrics);
    out.accessories = check(data && data.accessories);
    out.generalProducts = check(data && data.generalProducts);
    out.inventoryItems = check(data && data.inventoryItems);
    out.orders = check(orders);
    return out;
  }, [tag, data, orders]);

  const groups = [
    { key: "customers", icon: "👥", label: "العملاء", items: matched.customers, sub: (c) => c.phone || c.type || "" },
    { key: "shopifyCustomers", icon: "🛒", label: "عملاء Shopify", items: matched.shopifyCustomers, sub: (c) => c.phone || c.email || "" },
    { key: "suppliers", icon: "🏭", label: "الموردين", items: matched.suppliers, sub: (s) => s.phone || "" },
    { key: "fabrics", icon: "🧵", label: "الأقمشة", items: matched.fabrics, sub: (f) => f.unit || "" },
    { key: "accessories", icon: "🧷", label: "الإكسسوارات", items: matched.accessories, sub: (a) => a.unit || "" },
    { key: "generalProducts", icon: "📦", label: "منتجات عامة", items: matched.generalProducts, sub: (p) => p.category || p.unit || "" },
    { key: "inventoryItems", icon: "📋", label: "أصناف المخزن", items: matched.inventoryItems, sub: (i) => i.type || i.unit || "" },
    { key: "orders", icon: "🧾", label: "الأوردرات", items: matched.orders,
      /* Orders have modelNo as the identifying field, modelDesc as subtitle. */
      title: (o) => o.modelNo || o.id, sub: (o) => o.modelDesc || o.status || "" },
  ];

  const totalLinked = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100000,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.cardSolid,
        borderRadius: 16,
        width:"100%", maxWidth: 640,
        padding: "20px 22px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd,
        maxHeight:"90vh", overflowY:"auto",
      }}>
        {/* Header */}
        <div style={{
          display:"flex", alignItems:"center", gap: 10, marginBottom: 14,
          paddingBottom: 12, borderBottom: "2px solid "+(tag.color || T.brd) + "33",
        }}>
          <span style={{
            display:"inline-block", width: 20, height: 20, borderRadius:"50%",
            background: tag.color || T.accent, flexShrink: 0,
          }} />
          {tag.icon && <span style={{fontSize: FS+4}}>{tag.icon}</span>}
          <div style={{flex:1}}>
            <div style={{fontSize: FS+3, fontWeight: 800, color: T.text}}>{tag.name}</div>
            {tag.description && (
              <div style={{fontSize: FS-2, color: T.textSec, marginTop: 2}}>{tag.description}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background:"transparent", border:"none", cursor:"pointer",
            fontSize: FS+4, color: T.textMut, padding: "4px 10px",
          }} title="إغلاق">✕</button>
        </div>

        {/* Summary stat */}
        <div style={{
          padding:"8px 12px", marginBottom: 12,
          background: T.accent + "08",
          borderRadius: 8,
          fontSize: FS-1, color: T.text, lineHeight: 1.6,
        }}>
          إجمالي الـ entities المرتبطة: <strong style={{color: T.accent}}>{totalLinked}</strong>
        </div>

        {totalLinked === 0 ? (
          <div style={{
            padding:"24px 12px", textAlign:"center",
            color: T.textMut, fontSize: FS-1,
            background: T.bg, borderRadius: 10,
          }}>
            مفيش entities مرتبطة بهذا التاج حالياً.
          </div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap: 10}}>
            {groups.filter(g => g.items.length > 0).map(g => (
              <div key={g.key} style={{
                border:"1px solid "+T.brd,
                borderRadius: 10,
                overflow:"hidden",
              }}>
                <div style={{
                  padding: "8px 12px",
                  background: T.bg,
                  borderBottom: "1px solid "+T.brd,
                  display:"flex", alignItems:"center", gap: 8,
                  fontSize: FS-1, fontWeight: 700, color: T.text,
                }}>
                  <span style={{fontSize: FS+1}}>{g.icon}</span>
                  <span>{g.label}</span>
                  <span style={{
                    marginInlineStart:"auto",
                    padding:"2px 10px", borderRadius: 10,
                    background: T.accent + "15", color: T.accent,
                    fontSize: FS-2, fontWeight: 800,
                  }}>{g.items.length}</span>
                </div>
                <div style={{maxHeight: 200, overflowY:"auto"}}>
                  {g.items.slice(0, 100).map(item => {
                    const title = g.title ? g.title(item) : (item.name || item.id);
                    const sub = g.sub ? g.sub(item) : "";
                    return (
                      <div key={item.id} style={{
                        padding: "6px 12px",
                        borderBottom: "1px solid "+T.brd+"30",
                        display:"flex", alignItems:"center", gap: 8,
                        fontSize: FS-1,
                      }}>
                        <div style={{flex:1, minWidth: 0}}>
                          <div style={{
                            color: T.text, fontWeight: 600,
                            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                          }}>{title}</div>
                          {sub && (
                            <div style={{
                              color: T.textMut, fontSize: FS-3,
                              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                            }}>{sub}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {g.items.length > 100 && (
                    <div style={{
                      padding: "6px 12px", textAlign:"center",
                      color: T.textMut, fontSize: FS-2, fontStyle:"italic",
                    }}>
                      ... و {g.items.length - 100} entity أخرى (عرض أول 100 فقط)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{marginTop: 14, display:"flex", justifyContent:"flex-end"}}>
          <Btn ghost onClick={onClose}>إغلاق</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Migration preview modal (V21.9.104) ──────────────────────────────────
   Read-only preview of the migration plan. Admin can review every new tag
   that will be created before committing. */
function MigrationPreviewModal({ plan, onConfirm, onCancel, committing }){
  if(!plan) return null;
  const s = plan.summary;
  const totalTouched = s.customersToUpdate + s.shopifyCustomersToUpdate;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100000,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget && !committing) onCancel(); }}>
      <div style={{
        background: T.cardSolid,
        borderRadius: 16,
        width:"100%", maxWidth: 620,
        padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd,
        maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{fontSize: FS+3, fontWeight:800, color: T.text, marginBottom: 6, display:"flex", alignItems:"center", gap: 8}}>
          🚚 <span>معاينة ترحيل tags العملاء</span>
        </div>
        <div style={{fontSize: FS-1, color: T.textSec, marginBottom: 14, lineHeight: 1.7}}>
          هذه معاينة فقط — لا يتم أي تغيير حتى تضغط زر التنفيذ.
        </div>

        {!plan.hasWork ? (
          <div style={{
            padding: "16px 18px",
            background: T.ok + "10",
            color: T.ok,
            borderRadius: 10,
            fontSize: FS-1, fontWeight: 600, lineHeight: 1.7,
          }}>
            ✅ مفيش tags strings قديمة محتاجة ترحيل. كل العملاء بـ صيغة الـ IDs الجديدة بالفعل.
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div style={{
              display:"grid",
              gridTemplateColumns:"1fr 1fr",
              gap: 8, marginBottom: 14,
            }}>
              <div style={{padding:"10px 12px", borderRadius: 8, background: T.bg, border:"1px solid "+T.brd}}>
                <div style={{fontSize: FS-2, color: T.textSec, marginBottom: 2}}>عملاء عاديين</div>
                <div style={{fontSize: FS+2, fontWeight: 800, color: T.text}}>
                  {s.customersToUpdate} <span style={{fontSize: FS-2, color: T.textMut, fontWeight: 500}}>/ {s.customersAnalyzed}</span>
                </div>
                <div style={{fontSize: FS-3, color: T.textMut, marginTop: 2}}>
                  ✅ {s.customersAlreadyMigrated} في الصيغة الجديدة بالفعل
                </div>
              </div>
              <div style={{padding:"10px 12px", borderRadius: 8, background: T.bg, border:"1px solid "+T.brd}}>
                <div style={{fontSize: FS-2, color: T.textSec, marginBottom: 2}}>عملاء Shopify</div>
                <div style={{fontSize: FS+2, fontWeight: 800, color: T.text}}>
                  {s.shopifyCustomersToUpdate} <span style={{fontSize: FS-2, color: T.textMut, fontWeight: 500}}>/ {s.shopifyCustomersAnalyzed}</span>
                </div>
                <div style={{fontSize: FS-3, color: T.textMut, marginTop: 2}}>
                  ✅ {s.shopifyCustomersAlreadyMigrated} في الصيغة الجديدة بالفعل
                </div>
              </div>
            </div>

            {/* New tags preview */}
            {plan.newTagsToCreate.length > 0 && (
              <div style={{marginBottom: 14}}>
                <div style={{fontSize: FS, fontWeight:700, color: T.text, marginBottom: 6}}>
                  ➕ تاجز جديدة هـ تتـ created ({plan.newTagsToCreate.length}):
                </div>
                <div style={{
                  maxHeight: 200, overflowY:"auto",
                  padding: "8px 10px",
                  border:"1px solid "+T.brd,
                  borderRadius: 8,
                  background: T.bg,
                }}>
                  {plan.newTagsToCreate.map(t => (
                    <div key={t.nameLC} style={{
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      padding: "4px 0",
                      borderBottom:"1px solid "+T.brd+"30",
                      fontSize: FS-1,
                    }}>
                      <span style={{color: T.text, fontWeight: 600}}>{t.name}</span>
                      <span style={{color: T.textMut, fontSize: FS-2}}>
                        مستخدم في {t.count} عميل
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize: FS-3, color: T.textMut, marginTop: 4, lineHeight: 1.6}}>
                  💡 الـ tags الجديدة هـ تـ created بـ <strong>appliesTo = ["customer"] فقط</strong>.
                  لو محتاج توسعتها على Suppliers/Items/Orders، عدّل من الجدول بعد الترحيل.
                </div>
              </div>
            )}

            <div style={{
              padding: "10px 12px", marginBottom: 16,
              background: T.warn + "10",
              border: "1px solid "+T.warn+"33",
              borderRadius: 10,
              fontSize: FS-2, color: T.warn, lineHeight: 1.7,
            }}>
              ⚠️ <strong>إجمالي العملاء المتأثرين: {totalTouched}</strong>
              <br/>
              العملية تحدّث الـ tagRegistry + customers + shopifyCustomers في كتابة واحدة عبر upConfig.
              الـ Shopify push بعدها هـ يـ resolve الـ IDs لأسماء تلقائياً (backward-compatible).
            </div>
          </>
        )}

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel} disabled={committing}>إلغاء</Btn>
          {plan.hasWork && (
            <Btn primary onClick={onConfirm} disabled={committing}>
              {committing ? "جاري التنفيذ..." : "تنفيذ الترحيل"}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
