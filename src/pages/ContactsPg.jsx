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
  updateContact,
  findContactByPhone,
  labelForType,
} from "../utils/contacts.js";
import { TagPicker, TagChips } from "../components/TagPicker.jsx";
/* V21.9.116: cross-account ledger uses the same rollup helpers as
   the Customer/Supplier statement pages — single source of truth. */
import { computeCustomerStatement, computeSupplierStatement } from "../utils/rollups.js";
import { computeWorkshopBalance } from "../utils/accountSummary.js";

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

/* ── Contact Detail modal (V21.9.116 Phase 2) ──────────────────────
   Read-only ledger view + inline edit (name, phone, tags, notes).
   Type changes (adding/removing a classification) deferred. */
function ContactDetailModal({ contact, data, onSave, onClose, canEdit, user, isMob }){
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(contact.name || "");
  const [phone, setPhone] = useState(contact.phone || "");
  const [tags, setTags] = useState(Array.isArray(contact.tags) ? contact.tags.slice() : []);
  const [notes, setNotes] = useState(contact.notes || "");
  const [saving, setSaving] = useState(false);

  const isRegistryContact = contact.linkedFrom === "contact";
  const linkedIds = contact.entityIds || {};

  /* Compute ledger balances. Each is independent — only renders the
     row when the corresponding link exists. */
  const ledger = useMemo(() => {
    const out = {};
    if(linkedIds.customer){
      const s = computeCustomerStatement(data, linkedIds.customer);
      if(s) out.customer = s.totals;
    }
    if(linkedIds.supplier){
      const s = computeSupplierStatement(data, linkedIds.supplier);
      if(s) out.supplier = s.totals;
    }
    if(linkedIds.workshop){
      /* Workshops use name (not id) per the legacy convention. Find the
         workshop name first, then call the rollup helper. */
      const ws = (data.workshops || []).find(w => String(w.id) === String(linkedIds.workshop));
      if(ws) out.workshop = computeWorkshopBalance(ws.name, data);
    }
    return out;
  }, [data, linkedIds]);

  /* Net cross-account: customer balance (مدين when +ve) minus supplier
     balance (دائن when +ve). Positive net = customer owes us more than
     we owe supplier. */
  const netSide = useMemo(() => {
    const cust = ledger.customer ? Number(ledger.customer.balance) || 0 : 0;
    const sup  = ledger.supplier ? Number(ledger.supplier.balance) || 0 : 0;
    if(!ledger.customer && !ledger.supplier) return null;
    const net = cust - sup;
    return { value: net, abs: Math.abs(net), side: net > 0 ? "مدين" : net < 0 ? "دائن" : "صفر" };
  }, [ledger]);

  const handleSave = async () => {
    if(!isRegistryContact){
      showToast("⚠️ التعديل متاح فقط للجهات المسجّلة في الـ registry");
      return;
    }
    if(!name.trim()){ showToast("⚠️ ادخل الاسم"); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), tags, notes: notes.trim() });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

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
        padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd,
        maxHeight:"92vh", overflowY:"auto",
      }}>
        {/* Header */}
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 14, gap: 8}}>
          <div style={{flex:1, minWidth: 0}}>
            <div style={{fontSize: FS+3, fontWeight: 800, color: T.text, marginBottom: 4}}>
              {contact.name}
            </div>
            <div style={{fontSize: FS-1, color: T.textSec, fontFamily: "monospace", direction: "ltr"}}>
              {contact.phone || "—"}
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap: 4, marginTop: 6}}>
              {(contact.types || []).map(t => <TypeChip key={t} typeKey={t} small />)}
              {contact.workshopSubType && (
                <span style={{fontSize: FS-3, color: T.textMut, padding: "3px 8px"}}>
                  ({contact.workshopSubType})
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"transparent", border:"none", cursor:"pointer",
            fontSize: FS+4, color: T.textMut, padding: "4px 10px",
          }}>✕</button>
        </div>

        {/* Cross-account ledger */}
        {(ledger.customer || ledger.supplier || ledger.workshop) && (
          <div style={{
            padding: "12px 14px",
            background: T.bg,
            borderRadius: 10,
            border: "1px solid " + T.brd,
            marginBottom: 14,
          }}>
            <div style={{fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 10}}>
              📊 الحساب المالي
            </div>

            {ledger.customer && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 0", borderBottom: ledger.supplier || ledger.workshop ? "1px solid "+T.brd+"30" : "none",
              }}>
                <div style={{display:"flex", alignItems:"center", gap: 8}}>
                  <span style={{fontSize: FS}}>👥</span>
                  <span style={{fontSize: FS-1, color: T.textSec}}>رصيد العميل</span>
                </div>
                <div style={{fontSize: FS+1, fontWeight: 700, color: ledger.customer.balance > 0 ? "#0EA5E9" : T.textMut}}>
                  {fmt(ledger.customer.balance)} <span style={{fontSize: FS-2}}>EGP</span>
                  <span style={{fontSize: FS-3, color: T.textMut, marginInlineStart: 6}}>
                    {ledger.customer.balance > 0 ? "(مدين)" : ledger.customer.balance < 0 ? "(زيادة سداد)" : "(مسدد)"}
                  </span>
                </div>
              </div>
            )}

            {ledger.supplier && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 0", borderBottom: ledger.workshop ? "1px solid "+T.brd+"30" : "none",
              }}>
                <div style={{display:"flex", alignItems:"center", gap: 8}}>
                  <span style={{fontSize: FS}}>🏭</span>
                  <span style={{fontSize: FS-1, color: T.textSec}}>رصيد المورد</span>
                </div>
                <div style={{fontSize: FS+1, fontWeight: 700, color: ledger.supplier.balance > 0 ? "#F59E0B" : T.textMut}}>
                  {fmt(ledger.supplier.balance)} <span style={{fontSize: FS-2}}>EGP</span>
                  <span style={{fontSize: FS-3, color: T.textMut, marginInlineStart: 6}}>
                    {ledger.supplier.balance > 0 ? "(دائن)" : ledger.supplier.balance < 0 ? "(زيادة سداد)" : "(مسدد)"}
                  </span>
                </div>
              </div>
            )}

            {ledger.workshop && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 0",
              }}>
                <div style={{display:"flex", alignItems:"center", gap: 8}}>
                  <span style={{fontSize: FS}}>🛠️</span>
                  <span style={{fontSize: FS-1, color: T.textSec}}>رصيد الورشة</span>
                </div>
                <div style={{fontSize: FS+1, fontWeight: 700, color: "#8B5CF6"}}>
                  {fmt(ledger.workshop)} <span style={{fontSize: FS-2}}>EGP</span>
                </div>
              </div>
            )}

            {/* Net — shown only when both customer + supplier exist */}
            {ledger.customer && ledger.supplier && netSide && (
              <div style={{
                marginTop: 10, padding: "10px 12px",
                background: netSide.value > 0 ? "#0EA5E910" : netSide.value < 0 ? "#F59E0B10" : T.bg,
                borderRadius: 8,
                border: "1.5px solid " + (netSide.value > 0 ? "#0EA5E930" : netSide.value < 0 ? "#F59E0B30" : T.brd),
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{fontSize: FS, fontWeight: 800, color: T.text, display:"flex", alignItems:"center", gap: 6}}>
                  💰 <span>الصافي</span>
                </div>
                <div style={{fontSize: FS+2, fontWeight: 800, color: netSide.value > 0 ? "#0EA5E9" : netSide.value < 0 ? "#F59E0B" : T.textMut}}>
                  {fmt(netSide.abs)} <span style={{fontSize: FS-2}}>EGP</span>
                  <span style={{fontSize: FS-2, color: T.textSec, marginInlineStart: 8, fontWeight: 600}}>
                    ({netSide.side})
                  </span>
                </div>
              </div>
            )}

            {ledger.customer && ledger.supplier && (
              <div style={{fontSize: FS-3, color: T.textMut, marginTop: 8, lineHeight: 1.6}}>
                💡 الـ Net = رصيد العميل − رصيد المورد. + = العميل عليه أكتر من اللي إحنا عليه للمورد. تسوية الحساب لسه manual (treasury entry) — التحويل التلقائي feature لاحقة.
              </div>
            )}
          </div>
        )}

        {/* Linked entities — quick info */}
        <div style={{marginBottom: 14}}>
          <div style={{fontSize: FS-2, color: T.textSec, fontWeight: 700, marginBottom: 6}}>
            🔗 الجهات المرتبطة
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap: 6}}>
            {linkedIds.customer && <span style={{padding:"4px 10px",borderRadius:8,background:"#0EA5E912",color:"#0EA5E9",fontSize:FS-2,fontWeight:600}}>عميل #{String(linkedIds.customer).slice(-6)}</span>}
            {linkedIds.supplier && <span style={{padding:"4px 10px",borderRadius:8,background:"#F59E0B12",color:"#F59E0B",fontSize:FS-2,fontWeight:600}}>مورد #{String(linkedIds.supplier).slice(-6)}</span>}
            {linkedIds.workshop && <span style={{padding:"4px 10px",borderRadius:8,background:"#8B5CF612",color:"#8B5CF6",fontSize:FS-2,fontWeight:600}}>ورشة #{String(linkedIds.workshop).slice(-6)}</span>}
            {linkedIds.employee && <span style={{padding:"4px 10px",borderRadius:8,background:"#10B98112",color:"#10B981",fontSize:FS-2,fontWeight:600}}>موظف #{String(linkedIds.employee).slice(-6)}</span>}
          </div>
        </div>

        {/* Edit section — only for registry-managed contacts */}
        {isRegistryContact ? (
          <div style={{padding: "12px 14px", borderRadius: 10, border: "1px dashed " + T.brd, marginBottom: 12}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10}}>
              <div style={{fontSize: FS, fontWeight: 700, color: T.text}}>✏️ التعديل</div>
              {!editMode && canEdit && (
                <Btn small primary onClick={() => setEditMode(true)}>تعديل</Btn>
              )}
            </div>
            {editMode ? (
              <>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10, marginBottom: 10}}>
                  <div>
                    <label style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>الاسم</label>
                    <Inp value={name} onChange={setName} />
                  </div>
                  <div>
                    <label style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>التليفون</label>
                    <Inp value={phone} onChange={setPhone} />
                  </div>
                </div>
                <div style={{marginBottom: 10}}>
                  <label style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>التاجز</label>
                  <TagPicker
                    entityType="customer"
                    registry={data.tagRegistry || []}
                    value={tags}
                    onChange={setTags}
                    allowCreate={canEdit}
                    currentUser={user}
                  />
                </div>
                <div style={{marginBottom: 10}}>
                  <label style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>ملاحظات</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
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
                <div style={{fontSize: FS-3, color: T.warn, padding: "6px 10px", background: T.warn+"08", borderRadius: 6, lineHeight: 1.6, marginBottom: 10}}>
                  ⚠️ الاسم + التليفون + التاجز هـ يتـ propagated على كل الجهات المرتبطة (عميل + مورد + إلخ). الملاحظات تخص الـ contact registry فقط.
                </div>
                <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
                  <Btn ghost onClick={() => setEditMode(false)} disabled={saving}>إلغاء</Btn>
                  <Btn primary onClick={handleSave} disabled={saving || !name.trim()}>
                    {saving ? "..." : "💾 حفظ"}
                  </Btn>
                </div>
              </>
            ) : (
              <>
                {contact.notes && (
                  <div style={{padding: "8px 10px", background: T.bg, borderRadius: 6, fontSize: FS-2, color: T.text, lineHeight: 1.6}}>
                    📝 {contact.notes}
                  </div>
                )}
                {!contact.notes && !canEdit && (
                  <div style={{fontSize: FS-2, color: T.textMut, fontStyle: "italic"}}>مفيش ملاحظات</div>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 12,
            background: T.warn + "10", border: "1px solid " + T.warn + "33",
            fontSize: FS-2, color: T.warn, lineHeight: 1.7,
          }}>
            ℹ️ ده record من قائمة "{labelForType(contact.linkedFrom)}" القديمة، مش في الـ contacts registry. للتعديل، استخدم الصفحة الأصلية. الـ link-existing flow (يـ promotes هذا الـ record إلى الـ registry) هـ يجي في slice لاحقة.
          </div>
        )}

        <div style={{display:"flex", justifyContent:"flex-end"}}>
          <Btn ghost onClick={onClose}>إغلاق</Btn>
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
  /* V21.9.116: detail panel state. null = closed, otherwise a contact row from buildMergedContacts. */
  const [viewing, setViewing] = useState(null);

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

  /* V21.9.116: edit + propagate to linked entities. Only called for
     contacts that are in the registry (linkedFrom === "contact").
     The patch returned by updateContact() carries the registry update
     PLUS any propagated changes to customers/suppliers/workshops/employees. */
  const handleEditSave = async (updates) => {
    if(!viewing || viewing.linkedFrom !== "contact"){
      showToast("⚠️ التعديل متاح فقط للجهات المسجّلة");
      return;
    }
    try {
      const { patch } = updateContact(viewing.contactId, updates, data);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("✓ تم الحفظ + تحديث الجهات المرتبطة");
      /* Don't close the modal — let user keep viewing the updated state.
         The next re-render will rebuild `viewing` from the updated merged list. */
      const updatedMerged = buildMergedContacts({ ...data, ...patch });
      const refreshed = updatedMerged.find(c => c.id === viewing.id);
      if(refreshed) setViewing(refreshed);
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg === "CONTACT_NAME_EMPTY") showToast("⚠️ ادخل الاسم");
      else if(msg === "CONTACT_NOT_FOUND") showToast("⚠️ الجهة غير موجودة");
      else { console.error("[ContactsPg] edit error:", e); showToast("⛔ خطأ — راجع الـ console"); }
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
                  <tr
                    key={c.id}
                    onClick={() => setViewing(c)}
                    style={{cursor:"pointer", transition: "background 0.15s"}}
                    onMouseEnter={e => e.currentTarget.style.background = T.accent + "06"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
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
          💡 اضغط على أي صف لعرض التفاصيل + الحساب المالي المدمج (للـ "عميل+مورد"). الـ link-existing flow (ربط الجهات الموجودة بـ contact واحد) لسه قيد التطوير.
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

      {/* V21.9.116: detail modal with cross-account ledger + edit */}
      {viewing && (
        <ContactDetailModal
          contact={viewing}
          data={data}
          onSave={handleEditSave}
          onClose={() => setViewing(null)}
          canEdit={canEdit}
          user={user}
          isMob={isMob}
        />
      )}
    </div>
  );
}

export default ContactsPg;
