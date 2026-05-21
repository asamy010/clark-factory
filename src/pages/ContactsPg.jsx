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
import { Btn, Inp, Sel, SearchSel, Card } from "../components/ui.jsx";
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
  linkExistingContact,
  getUnlinkedEntities,
  findContactByPhone,
  findSimilarContacts,
  labelForType,
  settleContactCrossAccount,
  getContactSettlements,
  reverseContactSettlement,
  addTypesToContact,
  removeTypeFromContact,
} from "../utils/contacts.js";
import { TagPicker, TagChips } from "../components/TagPicker.jsx";
/* V21.9.117: cross-account ledger uses the OPERATIONAL balance helpers
   (deliveries + returns + payments with discount), NOT the rollup helpers
   from rollups.js which source from posted invoices only.

   Why the switch: V21.9.116 used computeCustomerStatement / computeSupplierStatement
   which read salesInvoices/purchaseInvoices (the accounting layer). User reported
   customer balances were wrong — discount wasn't applied AND deliveries that didn't
   yet have a posted invoice were missed. The user sees the operational view in
   CustDeliverPg/PurchasePg, so the Contact ledger must match that. */
import { buildCustomerSummary, buildSupplierSummary, computeWorkshopBalance } from "../utils/accountSummary.js";

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
function ContactCreateModal({ data, onSave, onCancel, user, canEdit, onSelectExisting }){
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [types, setTypes] = useState([]);
  const [workshopSubType, setWorkshopSubType] = useState("");
  /* V21.9.131: customer type (مكتب/محل/...) — same options as CustDeliverPg edit form.
     Default "مكتب" matches the pre-V21.9.131 hardcoded behavior in createContact(). */
  const [customerType, setCustomerType] = useState("مكتب");
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /* V21.9.122: fuzzy dup detection — recomputes when name or phone changes.
     Returns up to 5 similar contacts/entities with a confidence score. */
  const similar = useMemo(() => {
    if(!name.trim() && !phone.trim()) return [];
    return findSimilarContacts(name, phone, data);
  }, [name, phone, data]);

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
        customerType,  /* V21.9.131 */
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

        {/* V21.9.122: fuzzy similar-contacts banner. Shows up when the entered
            name/phone resembles an existing entity (exact or substring).
            Clicking "عرض" closes this modal and opens the detail view on that
            contact — admin can then use AddTypeModal to extend instead of
            creating a duplicate. */}
        {similar.length > 0 && (
          <div style={{
            padding: "10px 12px", marginBottom: 12,
            background: T.warn + "08",
            border: "1px solid " + T.warn + "33",
            borderRadius: 10,
          }}>
            <div style={{fontSize: FS-1, color: T.warn, fontWeight: 700, marginBottom: 8, display:"flex", alignItems:"center", gap: 6}}>
              ⚠️ <span>تم العثور على {similar.length} جهة قد تكون مطابقة:</span>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap: 6, maxHeight: 180, overflowY: "auto"}}>
              {similar.map(s => (
                <div key={s.id} style={{
                  padding: "8px 10px", borderRadius: 8,
                  background: T.cardSolid, border: "1px solid " + T.brd,
                  display:"flex", alignItems:"center", justifyContent:"space-between", gap: 8, flexWrap: "wrap",
                }}>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{display:"flex", alignItems:"center", gap: 6, marginBottom: 2, flexWrap: "wrap"}}>
                      <span style={{fontSize: FS-1, color: T.text, fontWeight: 700}}>{s.name}</span>
                      {s.phone && <span style={{fontSize: FS-3, color: T.textMut, fontFamily: "monospace", direction: "ltr"}}>{s.phone}</span>}
                    </div>
                    <div style={{display:"flex", alignItems:"center", gap: 4, flexWrap: "wrap"}}>
                      {(s.types || []).map(t => <TypeChip key={t} typeKey={t} small />)}
                      <span style={{fontSize: FS-3, color: T.textMut, marginInlineStart: 6}}>
                        ({s._reason})
                      </span>
                    </div>
                  </div>
                  {onSelectExisting && (
                    <button
                      onClick={() => onSelectExisting(s)}
                      title="فتح الجهة الموجودة"
                      style={{
                        padding: "4px 12px", borderRadius: 6,
                        background: T.accent + "12", color: T.accent,
                        border: "1px solid " + T.accent + "33",
                        fontSize: FS-2, fontWeight: 700,
                        fontFamily: "inherit", cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >👁️ عرض</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{fontSize: FS-3, color: T.textMut, marginTop: 8, lineHeight: 1.6}}>
              💡 لو فيه جهة من دول هي فعلاً نفس الـ entity، اضغط "عرض" → في الـ detail modal تقدر تضيف تصنيف بـ "+ تصنيف" بدل ما تنشئ contact مكرر.
            </div>
          </div>
        )}

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

        {/* V21.9.131: customer-type dropdown — mirrors CustDeliverPg edit form
            (مكتب / محل / أونلاين / أخرى). Optional — defaults to "مكتب". */}
        {types.includes("customer") && (
          <div style={{marginBottom: 12, padding: "10px 12px", background: "#3B82F608", borderRadius: 10, border: "1px solid #3B82F625"}}>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display:"block", marginBottom: 6}}>
              نوع العميل
            </label>
            <Sel value={customerType} onChange={setCustomerType}>
              <option value="مكتب">🏢 مكتب</option>
              <option value="محل">🏪 محل</option>
              <option value="أونلاين">🌐 أونلاين</option>
              <option value="أخرى">📦 أخرى</option>
            </Sel>
          </div>
        )}

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

/* ── Add Type modal (V21.9.121 Phase 5b) ──────────────────────────
   Extends an existing registry contact with additional types. Same
   shape as LinkContactModal but applied to a contact rather than a
   legacy entity, and pre-locks the types already linked. */
function AddTypeModal({ contact, data, onSave, onCancel }){
  const currentTypes = new Set(Array.isArray(contact.types) ? contact.types : []);
  const addable = CONTACT_TYPES.filter(t => !currentTypes.has(t.key));

  const [picks, setPicks] = useState({});  /* { type: {action, entityId?, workshopSubType?} } */
  const [submitting, setSubmitting] = useState(false);

  const optionsByType = useMemo(() => {
    const out = {};
    for(const t of addable){
      const unlinked = getUnlinkedEntities(t.key, data);
      out[t.key] = unlinked.map(e => ({
        value: String(e.id),
        label: e.name + (e.phone ? " — " + e.phone : ""),
      }));
    }
    return out;
  }, [data, addable]);

  const toggleType = (key) => {
    setPicks(prev => {
      const next = { ...prev };
      if(next[key]) delete next[key];
      else next[key] = { action: "create" };
      return next;
    });
  };

  const setLink = (key, patch) => {
    setPicks(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };

  const submit = async () => {
    const list = Object.entries(picks);
    if(list.length === 0){ showToast("⚠️ اختر تصنيف واحد على الأقل"); return; }
    setSubmitting(true);
    try {
      await onSave(list.map(([type, cfg]) => ({
        type, action: cfg.action,
        entityId: cfg.entityId,
        workshopSubType: cfg.workshopSubType,
      })));
    } finally {
      setSubmitting(false);
    }
  };

  if(addable.length === 0){
    return (
      <div style={{
        position:"fixed", inset:0, zIndex:100002,
        background:"rgba(15,23,42,0.55)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
      }} onClick={onCancel}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: T.cardSolid, borderRadius: 16,
          padding: "22px 24px", maxWidth: 400, width: "100%",
          border: "1px solid " + T.brd,
        }}>
          <div style={{fontSize: FS+2, fontWeight: 800, color: T.text, marginBottom: 8}}>الجهة مكتملة</div>
          <div style={{fontSize: FS-1, color: T.textSec, marginBottom: 14, lineHeight: 1.7}}>
            الـ contact ده مرتبط بكل التصنيفات المتاحة (عميل + مورد + ورشة + موظف).
          </div>
          <div style={{display:"flex", justifyContent:"flex-end"}}>
            <Btn ghost onClick={onCancel}>إغلاق</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100002,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget && !submitting) onCancel(); }}>
      <div style={{
        background: T.cardSolid, borderRadius: 16,
        width:"100%", maxWidth: 560, padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd, maxHeight:"92vh", overflowY:"auto",
      }}>
        <div style={{fontSize: FS+3, fontWeight: 800, color: T.text, marginBottom: 6}}>
          ➕ إضافة تصنيف لـ {contact.name}
        </div>
        <div style={{fontSize: FS-1, color: T.textSec, marginBottom: 14, lineHeight: 1.7}}>
          التصنيفات الحالية: {(contact.types || []).map(t => labelForType(t)).join("، ")}
        </div>

        <div style={{display:"flex", flexDirection:"column", gap: 8, marginBottom: 14}}>
          {addable.map(t => {
            const cfg = picks[t.key];
            const on = !!cfg;
            const opts = optionsByType[t.key] || [];
            return (
              <div key={t.key} style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: on ? t.color + "08" : "transparent",
                border: "1px solid " + (on ? t.color + "44" : T.brd),
              }}>
                <label style={{display:"flex", alignItems:"center", gap: 8, cursor: "pointer"}}>
                  <input type="checkbox" checked={on} onChange={() => toggleType(t.key)} />
                  <TypeChip typeKey={t.key} small />
                </label>

                {on && (
                  <div style={{marginTop: 10, paddingInlineStart: 26}}>
                    <div style={{display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8}}>
                      <label style={{display:"flex", alignItems:"center", gap: 4, fontSize: FS-2, cursor: "pointer"}}>
                        <input type="radio" name={"act-"+t.key} value="create" checked={cfg.action === "create"} onChange={() => setLink(t.key, { action: "create", entityId: undefined })} />
                        <span>إنشاء جديد بنفس البيانات</span>
                      </label>
                      <label style={{display:"flex", alignItems:"center", gap: 4, fontSize: FS-2, cursor: opts.length === 0 ? "not-allowed" : "pointer", opacity: opts.length === 0 ? 0.5 : 1}}>
                        <input type="radio" name={"act-"+t.key} value="use" disabled={opts.length === 0} checked={cfg.action === "use"} onChange={() => setLink(t.key, { action: "use" })} />
                        <span>ربط بـ موجود {opts.length === 0 && "(مفيش متاح)"}</span>
                      </label>
                    </div>
                    {cfg.action === "use" && opts.length > 0 && (
                      <SearchSel
                        value={cfg.entityId || ""}
                        onChange={(v) => setLink(t.key, { entityId: v })}
                        options={opts}
                        placeholder={"ابحث عن " + t.label + "..."}
                        showAllOnFocus
                        maxResults={10}
                      />
                    )}
                    {cfg.action === "create" && t.key === "workshop" && (
                      <div>
                        <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4}}>
                          نوع الورشة *
                        </label>
                        <Sel value={cfg.workshopSubType || ""} onChange={(v) => setLink(t.key, { workshopSubType: v })}>
                          <option value="">-- اختر النوع --</option>
                          {WS_TYPES.map(wt => (
                            <option key={wt.key} value={wt.key}>{wt.icon} {wt.key}</option>
                          ))}
                        </Sel>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel} disabled={submitting}>إلغاء</Btn>
          <Btn primary onClick={submit} disabled={submitting}>
            {submitting ? "..." : "💾 إضافة"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Cross-account settlement modal (V21.9.119 Phase 4) ────────────
   Lets the admin offset customer balance ↔ supplier balance for a
   dual-classified contact. Creates 2 payment entries (cust + sup)
   with method="مقاصة" — no real cash movement, just paper-trail. */
function SettleContactModal({ contact, customerBalance, supplierBalance, onSave, onCancel }){
  const maxSettle = Math.min(Number(customerBalance) || 0, Number(supplierBalance) || 0);
  const [amount, setAmount] = useState(String(maxSettle));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amtNum = Math.round((Number(amount) || 0) * 100) / 100;
  const overMax = amtNum > maxSettle;
  const invalid = amtNum <= 0 || overMax;

  const submit = async () => {
    if(invalid){
      showToast(overMax ? "⚠️ المبلغ أكبر من الحد الأقصى" : "⚠️ المبلغ يجب أن يكون موجباً");
      return;
    }
    const yes = await ask(
      "تأكيد التسوية",
      "هـ يتم إنشاء دفعتين بطريقة 'مقاصة' (مفيش حركة نقدية فعلية):\n• دفعة عميل: " + fmt(amtNum) + " EGP\n• دفعة مورد: " + fmt(amtNum) + " EGP\n\nرصيد العميل + رصيد المورد كلاهما هـ ينقص بالقيمة دي.",
      { confirmText: "تنفيذ التسوية" }
    );
    if(!yes) return;
    setSubmitting(true);
    try {
      await onSave({ amount: amtNum, date, notes: notes.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100001,
      background:"rgba(15,23,42,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, direction:"rtl", fontFamily:"'Cairo',sans-serif",
    }} onClick={(e) => { if(e.target === e.currentTarget && !submitting) onCancel(); }}>
      <div style={{
        background: T.cardSolid, borderRadius: 16,
        width:"100%", maxWidth: 480, padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd, maxHeight:"92vh", overflowY:"auto",
      }}>
        <div style={{fontSize: FS+3, fontWeight: 800, color: T.text, marginBottom: 6}}>
          💱 تسوية حساب — مقاصة
        </div>
        <div style={{fontSize: FS-1, color: T.textSec, marginBottom: 14, lineHeight: 1.7}}>
          <strong style={{color: T.text}}>{contact.name}</strong> — تسوية بين حساب العميل وحساب المورد.
        </div>

        {/* Current balances snapshot */}
        <div style={{
          padding: "10px 12px", background: T.bg, borderRadius: 10,
          border: "1px solid "+T.brd, marginBottom: 12,
        }}>
          <div style={{display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: FS-1}}>
            <span style={{color: T.textSec}}>👥 رصيد العميل (مدين)</span>
            <strong style={{color: "#0EA5E9"}}>{fmt(customerBalance)} EGP</strong>
          </div>
          <div style={{display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: FS-1}}>
            <span style={{color: T.textSec}}>🏭 رصيد المورد (دائن)</span>
            <strong style={{color: "#F59E0B"}}>{fmt(supplierBalance)} EGP</strong>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "8px 0 4px",
            borderTop: "1px dashed " + T.brd, marginTop: 4, fontSize: FS-1,
          }}>
            <span style={{color: T.text, fontWeight: 700}}>الحد الأقصى للتسوية</span>
            <strong style={{color: T.ok}}>{fmt(maxSettle)} EGP</strong>
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10}}>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>مبلغ التسوية</label>
            <Inp type="number" value={amount} onChange={setAmount} />
            {overMax && (
              <div style={{fontSize: FS-3, color: T.err, marginTop: 4}}>
                ⚠️ المبلغ تجاوز الحد الأقصى ({fmt(maxSettle)})
              </div>
            )}
          </div>
          <div>
            <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>التاريخ</label>
            <Inp value={date} onChange={setDate} />
          </div>
        </div>

        <div style={{marginBottom: 14}}>
          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>ملاحظات (اختياري)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="سبب التسوية..."
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
          padding: "10px 12px", marginBottom: 14,
          background: T.warn + "10",
          border: "1px solid " + T.warn + "33",
          borderRadius: 8,
          fontSize: FS-2, color: T.warn, lineHeight: 1.7,
        }}>
          ℹ️ التسوية تـ creates 2 entries: دفعة عميل + دفعة مورد بـ method="مقاصة". <strong>مفيش حركة نقدية</strong> — الرصيدين هـ ينقصوا بالقيمة، الـ treasury مش هـ يتأثر.
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel} disabled={submitting}>إلغاء</Btn>
          <Btn primary onClick={submit} disabled={submitting || invalid}>
            {submitting ? "..." : "💱 تنفيذ التسوية"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Link-Existing modal (V21.9.118 Phase 3) ───────────────────────
   Source = the legacy entity the admin clicked from the list. The
   modal lets the admin promote it to the contacts registry and
   optionally link additional types — either pointing to an existing
   entity (e.g., the same person already exists as a supplier) or
   creating a fresh entity of that type with the same name/phone/tags. */
function LinkContactModal({ source, data, onSave, onCancel, canEdit }){
  const [extraTypes, setExtraTypes] = useState({});  /* { type: { action, entityId?, workshopSubType? } } */
  const [submitting, setSubmitting] = useState(false);

  const sourceType = source.linkedFrom;  /* "customer" | "supplier" | "workshop" | "employee" */

  /* Available additional types = everything except the source type */
  const addableTypes = CONTACT_TYPES.filter(t => t.key !== sourceType);

  /* For each "use existing" option, precompute the unlinked entities + suggest best match. */
  const optionsByType = useMemo(() => {
    const out = {};
    for(const t of addableTypes){
      const unlinked = getUnlinkedEntities(t.key, data);
      out[t.key] = unlinked.map(e => ({
        value: String(e.id),
        label: e.name + (e.phone ? " — " + e.phone : ""),
      }));
    }
    return out;
  }, [data, addableTypes]);

  const toggleType = (key, defaultAction) => {
    setExtraTypes(prev => {
      const next = { ...prev };
      if(next[key]) delete next[key];
      else next[key] = { action: defaultAction || "create" };
      return next;
    });
  };

  const setLink = (key, patch) => {
    setExtraTypes(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const additionalLinks = Object.entries(extraTypes).map(([type, cfg]) => ({
        type,
        action: cfg.action,
        entityId: cfg.entityId,
        workshopSubType: cfg.workshopSubType,
      }));
      await onSave({
        sourceLinkedFrom: sourceType,
        sourceEntityId: source.entityIds[sourceType],
        additionalLinks,
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
        background: T.cardSolid, borderRadius: 16,
        width:"100%", maxWidth: 580, padding: "22px 24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        border:"1px solid "+T.brd, maxHeight:"92vh", overflowY:"auto",
      }}>
        <div style={{fontSize: FS+3, fontWeight: 800, color: T.text, marginBottom: 6}}>
          🔗 ربط الجهة في السجل الموحّد
        </div>
        <div style={{fontSize: FS-1, color: T.textSec, marginBottom: 14, lineHeight: 1.7}}>
          الجهة <strong style={{color: T.text}}>{source.name}</strong> (مصدرها: {labelForType(sourceType)}) هـ يتـ promote-ها لسجل الـ contacts. اختر تصنيفات إضافية لو هي عميل + مورد مثلاً.
        </div>

        {/* Source — locked, just informational */}
        <div style={{
          padding: "10px 12px", marginBottom: 12,
          background: T.bg, borderRadius: 8, border: "1px solid "+T.brd,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{fontSize: FS-2, color: T.textSec, fontWeight: 600}}>المصدر:</span>
          <TypeChip typeKey={sourceType} small />
          <span style={{fontSize: FS-3, color: T.textMut, marginInlineStart: "auto"}}>مقفل — مش هـ يتغير</span>
        </div>

        {/* Additional types */}
        <div style={{marginBottom: 14}}>
          <div style={{fontSize: FS-1, color: T.textSec, fontWeight: 700, marginBottom: 8}}>
            ➕ تصنيفات إضافية (اختياري):
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 8}}>
            {addableTypes.map(t => {
              const cfg = extraTypes[t.key];
              const on = !!cfg;
              const opts = optionsByType[t.key] || [];
              return (
                <div key={t.key} style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: on ? t.color + "08" : "transparent",
                  border: "1px solid " + (on ? t.color + "44" : T.brd),
                }}>
                  <label style={{display:"flex", alignItems:"center", gap: 8, cursor: "pointer"}}>
                    <input type="checkbox" checked={on} onChange={() => toggleType(t.key, "create")} />
                    <TypeChip typeKey={t.key} small />
                  </label>

                  {on && (
                    <div style={{marginTop: 10, paddingInlineStart: 26}}>
                      <div style={{display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8}}>
                        <label style={{display:"flex", alignItems:"center", gap: 4, fontSize: FS-2, cursor: "pointer"}}>
                          <input type="radio" name={"action-"+t.key} value="create" checked={cfg.action === "create"} onChange={() => setLink(t.key, { action: "create", entityId: undefined })} />
                          <span>إنشاء جديد بنفس البيانات</span>
                        </label>
                        <label style={{display:"flex", alignItems:"center", gap: 4, fontSize: FS-2, cursor: opts.length === 0 ? "not-allowed" : "pointer", opacity: opts.length === 0 ? 0.5 : 1}}>
                          <input type="radio" name={"action-"+t.key} value="use" disabled={opts.length === 0} checked={cfg.action === "use"} onChange={() => setLink(t.key, { action: "use" })} />
                          <span>ربط بـ موجود {opts.length === 0 && "(مفيش متاح)"}</span>
                        </label>
                      </div>

                      {cfg.action === "use" && opts.length > 0 && (
                        <SearchSel
                          value={cfg.entityId || ""}
                          onChange={(v) => setLink(t.key, { entityId: v })}
                          options={opts}
                          placeholder={"ابحث عن " + t.label + "..."}
                          showAllOnFocus
                          maxResults={10}
                        />
                      )}
                      {cfg.action === "create" && t.key === "workshop" && (
                        <div>
                          <label style={{fontSize: FS-2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4}}>
                            نوع الورشة *
                          </label>
                          <Sel value={cfg.workshopSubType || ""} onChange={(v) => setLink(t.key, { workshopSubType: v })}>
                            <option value="">-- اختر النوع --</option>
                            {WS_TYPES.map(wt => (
                              <option key={wt.key} value={wt.key}>{wt.icon} {wt.key}</option>
                            ))}
                          </Sel>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          padding: "8px 12px", marginBottom: 14,
          background: T.accent + "08", borderRadius: 8,
          fontSize: FS-2, color: T.textSec, lineHeight: 1.6,
        }}>
          💡 الـ "إنشاء جديد" بـ يـ creates entity جديد بنفس الاسم/التليفون/التاجز. الـ "ربط بـ موجود" بـ يـ stamps الـ contact ID على الـ entity الموجود (مفيش data duplication).
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap: 8}}>
          <Btn ghost onClick={onCancel} disabled={submitting}>إلغاء</Btn>
          <Btn primary onClick={submit} disabled={submitting}>
            {submitting ? "..." : "🔗 ربط"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Contact Detail modal (V21.9.116 Phase 2) ──────────────────────
   Read-only ledger view + inline edit (name, phone, tags, notes).
   Type changes (adding/removing a classification) deferred. */
function ContactDetailModal({ contact, data, onSave, onSettle, onReverseSettle, onAddType, onRemoveType, onClose, canEdit, user, isMob }){
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(contact.name || "");
  const [phone, setPhone] = useState(contact.phone || "");
  const [tags, setTags] = useState(Array.isArray(contact.tags) ? contact.tags.slice() : []);
  const [notes, setNotes] = useState(contact.notes || "");
  const [saving, setSaving] = useState(false);
  /* V21.9.119: settlement modal state — null = closed, true = open */
  const [showSettle, setShowSettle] = useState(false);
  /* V21.9.121: add-type modal state */
  const [showAddType, setShowAddType] = useState(false);
  /* V21.9.120: settlement history for this contact (sorted recent-first). */
  const settlements = useMemo(
    () => contact.linkedFrom === "contact" ? getContactSettlements(contact.contactId, data) : [],
    [contact, data]
  );

  const isRegistryContact = contact.linkedFrom === "contact";
  const linkedIds = contact.entityIds || {};

  /* V21.9.117: ledger uses operational balances (matches CustDeliverPg + PurchasePg).
     buildCustomerSummary applies the customer.discount % to sales+returns gross,
     then subtracts cash + check + other payments. buildSupplierSummary mirrors
     PurchasePg.supplierStats: receipts + standalone payments + treasury orphans. */
  const ledger = useMemo(() => {
    const out = {};
    if(linkedIds.customer){
      const s = buildCustomerSummary(linkedIds.customer, data);
      if(s) out.customer = s;
    }
    if(linkedIds.supplier){
      const s = buildSupplierSummary(linkedIds.supplier, data);
      if(s) out.supplier = s;
    }
    if(linkedIds.workshop){
      /* Workshops use name (not id) per the legacy convention. Find the
         workshop name first, then call the rollup helper. */
      const ws = (data.workshops || []).find(w => String(w.id) === String(linkedIds.workshop));
      if(ws){
        const wb = computeWorkshopBalance(ws.name, data);
        if(wb) out.workshop = wb.balance;
      }
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
    <>
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
            {/* V21.9.121: type chips with × remove + "+" add button.
                Remove only enabled when types.length > 1 (can't orphan the contact).
                Add+remove only for registry contacts with canEdit. */}
            <div style={{display:"flex", flexWrap:"wrap", gap: 6, marginTop: 6, alignItems: "center"}}>
              {(contact.types || []).map(t => {
                const meta = TYPE_META[t];
                const canRemove = canEdit && isRegistryContact && (contact.types || []).length > 1;
                return (
                  <span key={t} style={{
                    display:"inline-flex", alignItems:"center", gap: 4,
                    padding:"2px 4px 2px 8px",
                    borderRadius: 10,
                    background: meta ? meta.color + "18" : T.bg,
                    color: meta ? meta.color : T.textSec,
                    border: "1px solid " + (meta ? meta.color + "44" : T.brd),
                    fontSize: FS-3, fontWeight: 700,
                  }}>
                    {meta && <span>{meta.icon}</span>}
                    <span>{meta ? meta.label : t}</span>
                    {canRemove && (
                      <button
                        onClick={() => onRemoveType && onRemoveType(t)}
                        title={"إزالة تصنيف " + (meta ? meta.label : t)}
                        style={{
                          background: "transparent", border: "none",
                          color: meta ? meta.color : T.textSec,
                          cursor: "pointer", padding: "0 4px",
                          fontSize: FS-2, fontWeight: 700, lineHeight: 1, opacity: 0.7,
                        }}
                      >×</button>
                    )}
                  </span>
                );
              })}
              {contact.workshopSubType && (
                <span style={{fontSize: FS-3, color: T.textMut, padding: "3px 8px"}}>
                  ({contact.workshopSubType})
                </span>
              )}
              {canEdit && isRegistryContact && (contact.types || []).length < 4 && (
                <button
                  onClick={() => setShowAddType(true)}
                  title="إضافة تصنيف"
                  style={{
                    padding: "3px 10px", borderRadius: 10,
                    background: "transparent", color: T.accent,
                    border: "1px dashed " + T.accent + "55",
                    fontSize: FS-3, fontWeight: 700,
                    fontFamily: "inherit", cursor: "pointer",
                  }}
                >+ تصنيف</button>
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
              <div style={{padding: "8px 0", borderBottom: ledger.supplier || ledger.workshop ? "1px solid "+T.brd+"30" : "none"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                  <div style={{display:"flex", alignItems:"center", gap: 8}}>
                    <span style={{fontSize: FS}}>👥</span>
                    <span style={{fontSize: FS-1, color: T.textSec}}>رصيد العميل (بعد الخصم)</span>
                  </div>
                  <div style={{fontSize: FS+1, fontWeight: 700, color: ledger.customer.balance > 0 ? "#0EA5E9" : T.textMut}}>
                    {fmt(ledger.customer.balance)} <span style={{fontSize: FS-2}}>EGP</span>
                    <span style={{fontSize: FS-3, color: T.textMut, marginInlineStart: 6}}>
                      {ledger.customer.balance > 0 ? "(مدين)" : ledger.customer.balance < 0 ? "(زيادة سداد)" : "(مسدد)"}
                    </span>
                  </div>
                </div>
                {/* V21.9.117: breakdown row showing how the balance was computed —
                    crucial for trust + matching CustDeliverPg display. */}
                <div style={{fontSize: FS-3, color: T.textMut, marginTop: 4, lineHeight: 1.6, paddingInlineStart: 26}}>
                  مبيعات: {fmt(ledger.customer.salesGross)}
                  {ledger.customer.discPct > 0 && <> · خصم {ledger.customer.discPct}%: −{fmt(ledger.customer.discAmt)}</>}
                  {ledger.customer.returnsGross > 0 && <> · مرتجع: −{fmt(ledger.customer.returnsNet)}</>}
                  {(ledger.customer.payCash + ledger.customer.payCheck + ledger.customer.payOther) > 0 && (
                    <> · مدفوع: −{fmt(ledger.customer.payCash + ledger.customer.payCheck + ledger.customer.payOther)}</>
                  )}
                </div>
              </div>
            )}

            {ledger.supplier && (
              <div style={{padding: "8px 0", borderBottom: ledger.workshop ? "1px solid "+T.brd+"30" : "none"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
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
                <div style={{fontSize: FS-3, color: T.textMut, marginTop: 4, lineHeight: 1.6, paddingInlineStart: 26}}>
                  مشتريات: {fmt(ledger.supplier.totalInvoiced)} · مدفوع: −{fmt(ledger.supplier.totalPaid)}
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
                gap: 8, flexWrap: "wrap",
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

            {/* V21.9.119: Settle button — only when both balances are positive AND canEdit.
                The settle creates 2 payment entries (مقاصة) which reduces both balances. */}
            {ledger.customer && ledger.supplier && canEdit && ledger.customer.balance > 0 && ledger.supplier.balance > 0 && (
              <div style={{marginTop: 10, display: "flex", justifyContent: "flex-end"}}>
                <Btn primary onClick={() => setShowSettle(true)} style={{background: "#10B981", border: "none"}}>
                  💱 تسوية ({fmt(Math.min(ledger.customer.balance, ledger.supplier.balance))} EGP)
                </Btn>
              </div>
            )}

            {ledger.customer && ledger.supplier && (
              <div style={{fontSize: FS-3, color: T.textMut, marginTop: 8, lineHeight: 1.6}}>
                💡 الـ Net = رصيد العميل − رصيد المورد. <strong>زر التسوية</strong> يخلق دفعتين بـ method="مقاصة" (مفيش حركة نقدية فعلية) — الرصيدين هـ ينقصوا بالقيمة المختارة.
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

        {/* V21.9.120: Settlement history — only for registry contacts with past settlements */}
        {isRegistryContact && settlements.length > 0 && (
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            border: "1px solid " + T.brd, marginBottom: 12,
            background: T.bg + "AA",
          }}>
            <div style={{fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 10, display:"flex", alignItems:"center", gap: 6}}>
              📜 <span>سجل التسويات ({settlements.length})</span>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap: 6, maxHeight: 200, overflowY: "auto"}}>
              {settlements.map(s => (
                <div key={s.settlementId} style={{
                  padding: "8px 10px", borderRadius: 8,
                  background: T.cardSolid, border: "1px solid " + T.brd,
                  display:"flex", alignItems:"center", justifyContent:"space-between", gap: 8, flexWrap: "wrap",
                }}>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 2}}>
                      <span style={{fontSize: FS-1, color: T.text, fontWeight: 700}}>
                        💱 {fmt(s.amount)} <span style={{fontSize: FS-2, color: T.textSec}}>EGP</span>
                      </span>
                      <span style={{fontSize: FS-3, color: T.textMut}}>📅 {s.date || "—"}</span>
                      {s.status === "partial" && (
                        <span style={{
                          padding: "1px 6px", borderRadius: 4,
                          background: T.warn + "20", color: T.warn,
                          fontSize: FS-3, fontWeight: 700,
                        }} title="إحدى الـ legs مفقودة — قد تكون اتـ deleted يدوياً">⚠️ ناقصة</span>
                      )}
                    </div>
                    {s.note && (
                      <div style={{fontSize: FS-3, color: T.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                        {s.note}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => onReverseSettle(s)}
                      title="عكس هذه التسوية"
                      style={{
                        padding: "4px 10px", borderRadius: 6,
                        background: T.err + "12", color: T.err,
                        border: "1px solid " + T.err + "33",
                        fontSize: FS-2, fontWeight: 700,
                        fontFamily: "inherit", cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >↩️ عكس</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{fontSize: FS-3, color: T.textMut, marginTop: 6, lineHeight: 1.6}}>
              💡 الـ عكس بـ يحذف الـ 2 entries (custPayment + supplierPayment) — الرصيدين هـ يرجعوا للقيمة قبل التسوية.
            </div>
          </div>
        )}

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

    {/* V21.9.119: nested settlement modal — opens from inside the detail modal. */}
    {showSettle && ledger.customer && ledger.supplier && (
      <SettleContactModal
        contact={contact}
        customerBalance={ledger.customer.balance}
        supplierBalance={ledger.supplier.balance}
        onSave={async (form) => {
          await onSettle({ contactId: contact.contactId, ...form });
          setShowSettle(false);
        }}
        onCancel={() => setShowSettle(false)}
      />
    )}

    {/* V21.9.121: add-type modal — adds 1+ new classifications to the contact */}
    {showAddType && (
      <AddTypeModal
        contact={contact}
        data={data}
        onSave={async (additionalLinks) => {
          await onAddType(contact.contactId, additionalLinks);
          setShowAddType(false);
        }}
        onCancel={() => setShowAddType(false)}
      />
    )}
    </>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export function ContactsPg({ data, upConfig, isMob, canEdit, user }){
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");  /* "all" | type key | "multi" */
  const [showCreate, setShowCreate] = useState(false);
  /* V21.9.116: detail panel state. null = closed, otherwise a contact row from buildMergedContacts. */
  const [viewing, setViewing] = useState(null);
  /* V21.9.118: link-existing modal state. null = closed, otherwise the source row. */
  const [linking, setLinking] = useState(null);

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

  /* V21.9.121: add types to existing contact (creates new entities or links existing). */
  const handleAddType = async (contactId, additionalLinks) => {
    try {
      const { patch } = addTypesToContact(contactId, additionalLinks, data, user);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("✓ تم إضافة التصنيفات");
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg === "CONTACT_NO_TYPES_TO_ADD") showToast("⚠️ اختر تصنيف واحد على الأقل");
      else if(msg.startsWith("CONTACT_LINK_TARGET_ALREADY_LINKED")) showToast("⚠️ الهدف المختار مربوط بـ contact آخر");
      else if(msg === "CONTACT_LINK_WORKSHOP_SUBTYPE_REQUIRED") showToast("⚠️ اختر نوع الورشة");
      else if(msg === "CONTACT_NOT_FOUND") showToast("⚠️ الجهة غير موجودة");
      else { console.error("[ContactsPg] add-type error:", e); showToast("⛔ خطأ — راجع الـ console"); }
    }
  };

  /* V21.9.121: remove a type from contact — clears the back-reference on the entity
     and shrinks the contact's types[]. The underlying entity stays in its collection. */
  const handleRemoveType = async (contactId, typeKey) => {
    const yes = await ask(
      "إزالة تصنيف",
      "هـ يـ disconnects الـ " + labelForType(typeKey) + " من جهة الاتصال (الـ entity نفسه هـ يفضل في قائمته).",
      { confirmText: "إزالة", danger: true }
    );
    if(!yes) return;
    try {
      const { patch } = removeTypeFromContact(contactId, typeKey, data);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("✓ تم إزالة التصنيف");
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg === "CONTACT_CANNOT_REMOVE_LAST_TYPE") showToast("⚠️ لا يمكن إزالة آخر تصنيف — الـ contact هـ يـ orphaned");
      else if(msg === "CONTACT_TYPE_NOT_LINKED") showToast("⚠️ التصنيف غير مربوط");
      else { console.error("[ContactsPg] remove-type error:", e); showToast("⛔ خطأ — راجع الـ console"); }
    }
  };

  /* V21.9.120: reverse a settlement — removes both payment legs by settlementId.
     Requires confirmation since it's deletion of paired entries. */
  const handleReverseSettle = async (settlement) => {
    const yes = await ask(
      "عكس التسوية",
      "هـ يتم حذف الـ 2 دفعات (custPayment + supplierPayment) بقيمة " + fmt(settlement.amount) + " EGP من تاريخ " + settlement.date + ".\n\nالرصيدين هـ يرجعوا للقيمة قبل التسوية. غير قابل للتراجع التلقائي.",
      { confirmText: "عكس التسوية", danger: true }
    );
    if(!yes) return;
    try {
      const { patch, removedCust, removedSup } = reverseContactSettlement(settlement.settlementId, data);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("↩️ تم عكس التسوية (" + removedCust + " + " + removedSup + " entries)");
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg === "SETTLEMENT_NOT_FOUND") showToast("⚠️ التسوية غير موجودة");
      else { console.error("[ContactsPg] reverse settle error:", e); showToast("⛔ خطأ — راجع الـ console"); }
    }
  };

  /* V21.9.119: cross-account settlement handler. Creates 2 payment entries
     (custPayment + supplierPayment) with method="مقاصة" — no real cash. */
  const handleSettle = async (seed) => {
    try {
      const { patch } = settleContactCrossAccount(seed, data, user);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("✓ تم تنفيذ التسوية");
      /* Don't close the detail modal — let the user see the updated balances. */
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg === "CONTACT_NOT_DUAL") showToast("⚠️ الجهة ليست عميل + مورد");
      else if(msg === "SETTLE_AMOUNT_INVALID") showToast("⚠️ المبلغ غير صالح");
      else if(msg === "CONTACT_NOT_FOUND") showToast("⚠️ الجهة غير موجودة");
      else { console.error("[ContactsPg] settle error:", e); showToast("⛔ خطأ — راجع الـ console"); }
    }
  };

  /* V21.9.118: link-existing handler. The source is the legacy row + the
     selected additional links. Creates a contact registry record + stamps
     contactId on every linked entity. */
  const handleLinkSave = async (seed) => {
    try {
      const { patch } = linkExistingContact(seed, data, user);
      upConfig(d => {
        for(const k of Object.keys(patch)) d[k] = patch[k];
      });
      showToast("✓ تم الربط في السجل الموحّد");
      setLinking(null);
    } catch(e){
      const msg = (e && e.message) || "";
      if(msg.startsWith("CONTACT_LINK_SOURCE_ALREADY_LINKED")) showToast("⚠️ الجهة مربوطة بالفعل");
      else if(msg.startsWith("CONTACT_LINK_TARGET_ALREADY_LINKED")) showToast("⚠️ الهدف المختار مربوط بـ contact آخر");
      else if(msg === "CONTACT_LINK_WORKSHOP_SUBTYPE_REQUIRED") showToast("⚠️ اختر نوع الورشة");
      else if(msg.startsWith("CONTACT_LINK_TARGET_NOT_FOUND")) showToast("⚠️ الهدف المختار غير موجود");
      else { console.error("[ContactsPg] link error:", e); showToast("⛔ خطأ — راجع الـ console"); }
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
                        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8}}>
                          <span>{c.linkedFrom === "contact" ? "📇 سجل موحّد" : "📂 من قائمة " + labelForType(c.linkedFrom)}</span>
                          {/* V21.9.118: link button for legacy entries — opens the link modal.
                              stopPropagation so the row's setViewing isn't triggered. */}
                          {c.linkedFrom !== "contact" && canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setLinking(c); }}
                              title="ربط في السجل الموحّد"
                              style={{
                                padding: "3px 8px", borderRadius: 6,
                                background: T.accent + "12", color: T.accent,
                                border: "1px solid " + T.accent + "33",
                                fontSize: FS-3, fontWeight: 700,
                                fontFamily: "inherit", cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >🔗 ربط</button>
                          )}
                        </div>
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
          💡 اضغط على أي صف لعرض التفاصيل + الحساب المالي المدمج (للـ "عميل+مورد"). الـ <strong>🔗 ربط</strong> بجانب الجهات القديمة بـ يضمها للسجل الموحّد + يدمجها مع جهة أخرى (مثلاً نفس الشخص = عميل + مورد).
        </div>
      </Card>

      {showCreate && (
        <ContactCreateModal
          data={data}
          onSave={handleSave}
          onCancel={() => setShowCreate(false)}
          user={user}
          canEdit={canEdit}
          /* V21.9.122: when admin clicks "عرض" on a similar suggestion,
             close create modal + open that contact in the detail modal. */
          onSelectExisting={(s) => {
            setShowCreate(false);
            setViewing(s);
          }}
        />
      )}

      {/* V21.9.116: detail modal with cross-account ledger + edit.
          V21.9.119: + onSettle for مقاصة.
          V21.9.120: + onReverseSettle for un-doing past settlements.
          V21.9.121: + onAddType + onRemoveType for type management. */}
      {viewing && (
        <ContactDetailModal
          contact={viewing}
          data={data}
          onSave={handleEditSave}
          onSettle={handleSettle}
          onReverseSettle={handleReverseSettle}
          onAddType={handleAddType}
          onRemoveType={(typeKey) => handleRemoveType(viewing.contactId, typeKey)}
          onClose={() => setViewing(null)}
          canEdit={canEdit}
          user={user}
          isMob={isMob}
        />
      )}

      {/* V21.9.118: link-existing modal — opens from the 🔗 button on legacy rows */}
      {linking && (
        <LinkContactModal
          source={linking}
          data={data}
          onSave={handleLinkSave}
          onCancel={() => setLinking(null)}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

export default ContactsPg;
