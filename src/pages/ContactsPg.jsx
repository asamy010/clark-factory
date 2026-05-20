/* ═══════════════════════════════════════════════════════════════
   CLARK V21.9.115 — Contacts page (Phase 1: read-only view + create)
   ───────────────────────────────────────────────────────────────
   Unified directory of every party CLARK transacts with. Pulls from
   data.contacts (registry) + the legacy entity tables (customers,
   suppliers, workshops, employees) and presents them as one list.

   This phase ships ONLY:
   - Merged list view + type filter + search
   - "+ جهة جديدة" form (creates contact + downstream entries)

   Deferred (future phases):
   - Editing
   - Cross-account ledger (customer balance + supplier balance + net)
   - Manual link-existing flow
   - Bulk import / phone-dedup migration
   ═══════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Btn, Inp, Sel, Card } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS, WS_TYPES } from "../constants/index.js";
import { ask, tell, showToast } from "../utils/popups.js";
import { fmt, normalizePhone } from "../utils/format.js";
import {
  CONTACT_TYPES,
  CONTACT_TYPE_KEYS,
  buildMergedContacts,
  createContact,
  findContactByPhone,
  labelForType,
} from "../utils/contacts.js";
import { TagPicker, TagChips } from "../components/TagPicker.jsx";

/* Map type key → meta from the contacts module, for chips. */
const TYPE_META = CONTACT_TYPES.reduce((acc, t) => { acc[t.key] = t; return acc; }, {});

function TypeChip({ typeKey, small }){
  const meta = TYPE_META[typeKey];
  if(!meta) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap: 4,
      padding: small ? "2px 8px" : "3px 10px",
      borderRadius: 10,
      background: meta.color + "18",
      color: meta.color,
      border: "1px solid " + meta.color + "44",
      fontSize: small ? FS-3 : FS-2,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

/* ── Create modal ──────────────────────────────────────────────── */
function ContactCreateModal({ data, onSave, onCancel, user, canEdit }){
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [types, setTypes] = useState([]);
  const [workshopSubType, setWorkshopSubType] = useState("");
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleType = (key) => {
    setTypes(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
    if(key === "workshop" && types.includes("workshop")) setWorkshopSubType("");
  };

  /* Live duplicate-phone check across the registry + existing tables. */
  const dupHint = useMemo(() => {
    const canon = normalizePhone((phone || "").trim());
    if(!canon) return null;
    const inContacts = findContactByPhone(canon, data.contacts || []);
    if(inContacts) return { kind:"contact", name: inContacts.name };
    const allLists = [
      { arr: data.customers, kind: "عميل" },
      { arr: data.suppliers, kind: "مورد" },
      { arr: data.workshops, kind: "ورشة" },
      { arr: data.employees, kind: "موظف" },
    ];
    for(const { arr, kind } of allLists){
      const hit = (Array.isArray(arr) ? arr : []).find(e => e && normalizePhone(e.phone || "") === canon);
      if(hit) return { kind, name: hit.name };
    }
    return null;
  }, [phone, data]);

  const submit = async () => {
    if(!name.trim()){ showToast("⚠️ ادخل الاسم"); return; }
    if(types.length === 0){ showToast("⚠️ اختر تصنيف واحد على الأقل"); return; }
    if(types.includes("workshop") && !workshopSubType){
      showToast("⚠️ اختر نوع الورشة");
      return;
    }
    if(dupHint){
      const yes = await ask(
        "تليفون مكرر",
        "التليفون ده موجود بالفعل لـ " + dupHint.kind + ": " + dupHint.name + ".\n\nتحب تكمل ولا تتراجع؟",
        { confirmText: "أكمل على أي حال", danger: true }
      );
      if(!yes) return;
    }
    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim(),
        types,
        workshopSubType,
        tags,
        notes: notes.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100000,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget && !submitting) onCancel(); }}>
      <div style={{
        background: T.cardSolid,
        borderRadius: 16,
        width:"100%", maxWidth: 560,
        padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd,
        maxHeight:"92vh", overflowY:"auto",
      }}>
        <div style={{fontSize: FS+3, fontWeight:800, color: T.text, marginBottom: 14}}>
          ➕ جهة اتصال جديدة
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10, marginBottom: 12}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>الاسم *</label>
            <Inp value={name} onChange={setName} placeholder="مثلاً: شركة الأمل" />
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>التليفون</label>
            <Inp value={phone} onChange={setPhone} placeholder="+201xxxxxxxxx" />
            {dupHint && (
              <div style={{fontSize: FS-3, color: T.warn, marginTop: 4, lineHeight: 1.5}}>
                ⚠️ موجود بالفعل لـ <strong>{dupHint.kind}</strong>: {dupHint.name}
              </div>
            )}
          </div>
        </div>

        <div style={{marginBottom: 12}}>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display:"block", marginBottom: 6}}>
            التصنيفات * <span style={{color: T.textMut, fontWeight: 400}}>(يمكن اختيار أكتر من واحد)</span>
          </label>
          <div style={{display:"flex", flexWrap:"wrap", gap: 8}}>
            {CONTACT_TYPES.map(t => {
              const on = types.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => toggleType(t.key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 18,
                    fontSize: FS-1, fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: on ? t.color : "transparent",
                    color: on ? "#fff" : t.color,
                    border: "1.5px solid " + t.color + (on ? "" : "55"),
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {on && <span style={{opacity: 0.85}}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {types.includes("workshop") && (
          <div style={{marginBottom: 12, padding: "10px 12px", background: "#8B5CF608", borderRadius: 10, border: "1px solid #8B5CF625"}}>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display:"block", marginBottom: 6}}>
              نوع الورشة *
            </label>
            <Sel value={workshopSubType} onChange={setWorkshopSubType}>
              <option value="">-- اختر نوع الورشة --</option>
              {WS_TYPES.map(wt => (
                <option key={wt.key} value={wt.key}>{wt.icon} {wt.key}</option>
              ))}
            </Sel>
          </div>
        )}

        <div style={{marginBottom: 12}}>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display:"block", marginBottom: 4}}>
            التاجز <span style={{color: T.textMut, fontWeight: 400}}>(VIP، جملة، …)</span>
          </label>
          <TagPicker
            entityType="customer"
            registry={data.tagRegistry || []}
            value={tags}
            onChange={setTags}
            allowCreate={canEdit}
            currentUser={user}
            placeholder="إضافة تاج..."
          />
          <div style={{fontSize: FS-3, color: T.textMut, marginTop: 4}}>
            الـ tags بـ تتـ copied على كل الـ entities المرتبطة (عميل + مورد + إلخ).
          </div>
        </div>

        <div style={{marginBottom: 14}}>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display:"block", marginBottom: 4}}>
            ملاحظات
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="ملاحظات عن الـ contact (اختياري)"
            rows={2}
            style={{
              width:"100%", padding: "8px 12px",
              borderRadius: 8, border: "1px solid "+T.brd,
              fontSize: FS-1, fontFamily: "inherit",
              background: T.inputBg || T.cardSolid, color: T.text,
              boxSizing: "border-box", resize: "vertical", minHeight: 50, outline: "none",
            }}
          />
        </div>

        <div style={{
          padding: "8px 12px", marginBottom: 14,
          background: T.accent + "08", borderRadius: 8,
          fontSize: FS-2, color: T.textSec, lineHeight: 1.6,
        }}>
          💡 لكل تصنيف اخترته، هـ يتـ created entry في الـ list المناسبة (مع نفس الاسم والتليفون والتاجز). يمكن تعديل التفاصيل الخاصة بكل entry بعد كده من صفحتها (العملاء، الموردين، إلخ).
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel} disabled={submitting}>إلغاء</Btn>
          <Btn primary onClick={submit} disabled={submitting || !name.trim() || types.length === 0}>
            {submitting ? "جاري الحفظ..." : "💾 إنشاء"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export function ContactsPg({ data, upConfig, isMob, canEdit, user }){
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");  /* "all" | type key | "multi" */
  const [showCreate, setShowCreate] = useState(false);

  const merged = useMemo(() => buildMergedContacts(data || {}), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter(c => {
      if(typeFilter === "multi"){
        if((c.types || []).length < 2) return false;
      } else if(typeFilter !== "all"){
        if(!(c.types || []).includes(typeFilter)) return false;
      }
      if(q){
        const hay = (c.name + " " + c.phone).toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }, [merged, typeFilter, search]);

  /* Counts per type for the filter chips */
  const counts = useMemo(() => {
    const c = { all: merged.length, multi: 0 };
    for(const t of CONTACT_TYPE_KEYS) c[t] = 0;
    for(const m of merged){
      if((m.types || []).length >= 2) c.multi++;
      for(const t of m.types || []) if(c[t] !== undefined) c[t]++;
    }
    return c;
  }, [merged]);

  const handleSave = async (form) => {
    try {
      const { patch } = createContact(form, data, user);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("✓ تم إنشاء جهة الاتصال");
      setShowCreate(false);
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg === "CONTACT_NAME_EMPTY") showToast("⚠️ ادخل الاسم");
      else if(msg === "CONTACT_TYPES_EMPTY") showToast("⚠️ اختر تصنيف واحد على الأقل");
      else if(msg === "CONTACT_WORKSHOP_SUBTYPE_REQUIRED") showToast("⚠️ اختر نوع الورشة");
      else { console.error("[ContactsPg] save error:", e); showToast("⛔ خطأ — راجع الـ console"); }
    }
  };

  const colHeader = { padding:"8px 10px", fontSize: FS-2, fontWeight:700, color: T.textSec, textAlign:"right", background: T.bg, borderBottom:"2px solid "+T.brd, whiteSpace:"nowrap" };
  const colCell = { padding:"8px 10px", fontSize: FS-1, color: T.text, borderBottom:"1px solid "+T.brd, verticalAlign:"middle" };

  return (
    <div>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 14, flexWrap:"wrap", gap: 10}}>
        <div>
          <div style={{fontSize: FS+5, fontWeight: 800, color: T.text}}>👥 جهات الاتصال</div>
          <div style={{fontSize: FS-2, color: T.textSec, marginTop: 2}}>
            دليل موحّد للعملاء، الموردين، الورش، والموظفين. {merged.length} جهة إجمالاً.
          </div>
        </div>
        {canEdit && (
          <Btn primary onClick={() => setShowCreate(true)}>+ جهة جديدة</Btn>
        )}
      </div>

      <Card style={{marginBottom: 14}}>
        {/* Type filter chips */}
        <div style={{display:"flex", flexWrap:"wrap", gap: 6, marginBottom: 10}}>
          {[
            { key: "all",      label: "الكل",       icon: "📋", color: T.textSec },
            ...CONTACT_TYPES,
            { key: "multi",    label: "متعدد التصنيف", icon: "🔗", color: "#DB2777" },
          ].map(t => {
            const on = typeFilter === t.key;
            const c = counts[t.key] || 0;
            return (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 14,
                  fontSize: FS-2, fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: on ? t.color : t.color + "12",
                  color: on ? "#fff" : t.color,
                  border: "1px solid " + (on ? t.color : t.color + "33"),
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                <span style={{fontSize: FS-3, opacity: 0.85}}>({c})</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{marginBottom: 10}}>
          <Inp value={search} onChange={setSearch} placeholder="🔍 ابحث بالاسم أو التليفون..." />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{padding: "30px 12px", textAlign: "center", color: T.textMut, fontSize: FS-1}}>
            {merged.length === 0
              ? "مفيش جهات اتصال لسه. اضغط '+ جهة جديدة' لإضافة أول واحد."
              : "مفيش نتائج مطابقة للفلاتر."}
          </div>
        ) : (
          <div style={{overflowX:"auto", borderRadius: 10, border: "1px solid "+T.brd}}>
            <table style={{width:"100%", borderCollapse:"collapse", minWidth: isMob ? "auto" : 700}}>
              <thead>
                <tr>
                  <th style={colHeader}>الاسم</th>
                  <th style={colHeader}>التليفون</th>
                  <th style={colHeader}>التصنيفات</th>
                  {!isMob && <th style={colHeader}>التاجز</th>}
                  {!isMob && <th style={colHeader}>المصدر</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td style={{...colCell, fontWeight: 700}}>{c.name || "—"}</td>
                    <td style={{...colCell, color: T.textSec, fontFamily: "monospace", direction: "ltr"}}>{c.phone || "—"}</td>
                    <td style={colCell}>
                      <div style={{display:"flex", flexWrap:"wrap", gap: 4}}>
                        {(c.types || []).map(t => <TypeChip key={t} typeKey={t} small />)}
                        {c.workshopSubType && (
                          <span style={{fontSize: FS-3, color: T.textMut, padding: "2px 6px"}}>
                            ({c.workshopSubType})
                          </span>
                        )}
                      </div>
                    </td>
                    {!isMob && (
                      <td style={colCell}>
                        <TagChips tagIds={c.tags || []} registry={data.tagRegistry || []} small max={3}/>
                      </td>
                    )}
                    {!isMob && (
                      <td style={{...colCell, fontSize: FS-3, color: T.textMut}}>
                        {c.linkedFrom === "contact" ? "📇 سجل موحّد" : "📂 من قائمة " + labelForType(c.linkedFrom)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{
          marginTop: 10, padding: "8px 12px",
          fontSize: FS-3, color: T.textSec, lineHeight: 1.7,
          background: T.bg, borderRadius: 8,
        }}>
          💡 الـ MVP الحالي: <strong>عرض + إنشاء فقط</strong>. التعديل + حساب مدين/دائن المدمج للجهات الـ "عميل+مورد" + ربط الجهات الموجودة قديمة هـ يكون في الـ slices الجاية.
        </div>
      </Card>

      {showCreate && (
        <ContactCreateModal
          data={data}
          onSave={handleSave}
          onCancel={() => setShowCreate(false)}
          user={user}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

export default ContactsPg;
