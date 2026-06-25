/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseRfqPg (V21.12.1) — طلب عروض أسعار (قائمة + إجراءات)
   نظير QuotationsPg على جهة الموردين. مستند مستقل — صفر مساس بالمخزون/المحاسبة.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Inp, Sel, BlockingOverlay } from "../../components/ui.jsx";
import { openPurchaseDoc, consumePendingPurchaseDoc } from "../../utils/purchase/navDoc.js";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast, tell } from "../../utils/popups.js";
import {
  saveRfqMutator, setRfqStatusMutator, sendRfqMutator, deleteRfqMutator,
  convertRfqToPurchaseOrderMutator, displayStatus, nextRfqNo,
} from "../../utils/purchase/rfq.js";
import { RfqFormModal } from "../../components/purchase/RfqFormModal.jsx";
import { RfqDetailModal } from "../../components/purchase/RfqDetailModal.jsx";

const STATUS_META = {
  draft:     { label: "مسودة",          color: "#6B7280", bg: "#6B728015" },
  sent:      { label: "مُرسل",           color: "#0EA5E9", bg: "#0EA5E915" },
  received:  { label: "وصل العرض",        color: "#8B5CF6", bg: "#8B5CF615" },
  converted: { label: "محوّل",           color: "#10B981", bg: "#10B98115" },
  rejected:  { label: "مرفوض",          color: "#EF4444", bg: "#EF444415" },
  expired:   { label: "منتهي",          color: "#D97706", bg: "#D9770615" },
};

export function PurchaseRfqPg({ data, upConfig, isMob, user, canEdit }){
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const rfqs = data.purchaseRfqs || [];
  const today = new Date().toISOString().split("T")[0];

  const [showForm, setShowForm] = useState(false);
  const [editRfq, setEditRfq] = useState(null);
  const [activeRfq, setActiveRfq] = useState(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");

  /* V21.21.21: cross-link deep-link — افتح طلب عرض السعر من مستند تاني */
  useEffect(() => {
    const open = (id) => { const r = rfqs.find(x => x && x.id === id); if(r){ setActiveRfq(r); return true; } return false; };
    const pid = consumePendingPurchaseDoc("rfq"); if(pid) open(pid);
    const h = (e) => { const d = e?.detail; if(d && d.kind === "rfq" && d.id) open(d.id); };
    window.addEventListener("clark-open-purchase-doc", h);
    return () => window.removeEventListener("clark-open-purchase-doc", h);
  }, [rfqs]);

  const stats = useMemo(() => {
    const acc = { draft: 0, sent: 0, received: 0, converted: 0, rejected: 0, expired: 0, total: 0 };
    rfqs.forEach(r => { const ds = displayStatus(r, today); if(acc[ds] != null) acc[ds]++; acc.total++; });
    return acc;
  }, [rfqs, today]);

  const expiring = useMemo(() => {
    const limit = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    return rfqs.filter(r => { const ds = displayStatus(r, today); return (ds === "draft" || ds === "sent") && r.validUntil && r.validUntil >= today && r.validUntil <= limit; });
  }, [rfqs, today]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rfqs.filter(r => {
      if(statusF && displayStatus(r, today) !== statusF) return false;
      if(!qq) return true;
      return (r.rfqNo || "").toLowerCase().includes(qq) || (r.supplierName || r.supplierNameAdHoc || "").toLowerCase().includes(qq);
    });
  }, [rfqs, q, statusF, today]);

  /* live-refresh activeRfq from data after mutations */
  const liveActive = activeRfq ? (rfqs.find(r => r.id === activeRfq.id) || null) : null;

  const handleSave = (payload) => {
    let saved = null;
    upConfig(d => { saved = saveRfqMutator(d, payload, userName); });
    setShowForm(false); setEditRfq(null);
    showToast("✓ اتحفظ الطلب " + (saved?.rfqNo || ""));
  };
  const handleStatus = (status) => { if(!liveActive) return; upConfig(d => setRfqStatusMutator(d, liveActive.id, status, userName)); showToast("✓ اتحدّثت الحالة"); };
  const handleSend = (channel) => { if(!liveActive) return; upConfig(d => sendRfqMutator(d, liveActive.id, channel, userName)); };
  const handleConvert = async () => {
    if(!liveActive) return;
    if(!await ask("تحويل لأمر شراء", "هيتعمل أمر شراء بالأصناف والأسعار دي. متأكد؟", { confirmText: "تحويل" })) return;
    let res = { ok: true };
    upConfig(d => { res = convertRfqToPurchaseOrderMutator(d, liveActive.id, userName); });
    if(res?.ok) showToast("✓ اتعمل أمر الشراء " + (res.po?.poNo || ""));
    else showToast("⛔ " + (res?.error || "تعذّر التحويل"));
  };
  const handleDelete = async (rfq) => {
    const target = rfq || liveActive;
    if(!target) return;
    if(!await ask("حذف الطلب", "حذف " + (target.rfqNo || "") + " نهائياً؟", { danger: true, confirmText: "حذف" })) return;
    let res; upConfig(d => { res = deleteRfqMutator(d, target.id); });
    if(res && res.ok){ setActiveRfq(null); showToast("✓ اتحذف الطلب"); }
    else showToast("⛔ " + ((res && res.error) || "تعذّر الحذف"));
  };

  const chip = (key, label) => (
    <div onClick={() => setStatusF(statusF === key ? "" : key)} style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: FS - 2, fontWeight: 700,
      background: statusF === key ? (STATUS_META[key]?.color || T.accent) : (STATUS_META[key]?.bg || T.bg),
      color: statusF === key ? "#fff" : (STATUS_META[key]?.color || T.textSec), border: "1px solid " + (STATUS_META[key]?.color || T.brd) + "30" }}>
      {label} ({stats[key] || 0})
    </div>
  );

  const [showN, setShowN] = useState(50);/* V21.21.4: pagination — 50 + «عرض المزيد» */
  /* V21.21.5: تحديد متعدد + حذف مجمّع */
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const visibleIds = filtered.slice(0, showN).map(r => r.id);
  const allVisSelected = visibleIds.length > 0 && visibleIds.every(id => sel.has(id));
  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVis = () => setSel(s => { const n = new Set(s); if(allVisSelected) visibleIds.forEach(id => n.delete(id)); else visibleIds.forEach(id => n.add(id)); return n; });
  const bulkDelete = async () => {
    const ids = [...sel]; if(ids.length === 0) return;
    if(!await ask("حذف مجمّع", "متأكد تحذف " + ids.length + " طلب نهائياً؟ مش هينفع تتراجع.", { danger: true, confirmText: "حذف الكل" })) return;
    setBusy(true); let deleted = 0; const blocked = [];
    try {
      await upConfig(d => {
        for(const id of ids){
          const q = (d.purchaseRfqs || []).find(x => x && x.id === id);
          const res = deleteRfqMutator(d, id);
          if(res && res.ok) deleted++; else blocked.push((q?.rfqNo || id) + ": " + ((res && res.error) || "تعذّر"));
        }
      }, { allowEmptyFields: ["purchaseRfqs"] });/* V21.21.41 */
    } finally { setBusy(false); }
    setSel(new Set());
    if(blocked.length === 0) showToast("✓ اتحذف " + deleted + " طلب");
    else await tell("نتيجة الحذف المجمّع", "✓ اتحذف: " + deleted + "\n⛔ اتمنع: " + blocked.length + " (بسبب التسلسل المستندي)\n\n" + blocked.slice(0, 12).join("\n") + (blocked.length > 12 ? "\n…" : ""), { type: "warning" });
  };

  return (
    <div style={{ padding: isMob ? 4 : 0, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: FS + 4, color: T.text }}>💬 طلب عروض أسعار</div>
        {canEdit && <Btn primary onClick={() => { setEditRfq(null); setShowForm(true); }} style={{ background: "#D97706" }}>+ طلب جديد</Btn>}
      </div>

      {expiring.length > 0 && <div onClick={() => setStatusF("sent")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: "#F59E0B12", border: "1px solid #F59E0B35", cursor: "pointer" }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <div style={{ flex: 1, fontSize: FS - 1, color: T.text, fontWeight: 600 }}><b style={{ color: "#D97706" }}>{expiring.length}</b> طلب قربت تنتهي مهلة الرد (خلال 3 أيام)</div>
      </div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {chip("draft", "مسودة")}{chip("sent", "مُرسل")}{chip("received", "وصل العرض")}{chip("converted", "محوّل")}{chip("rejected", "مرفوض")}{chip("expired", "منتهي")}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}><Inp value={q} onChange={setQ} placeholder="🔍 ابحث برقم الطلب أو اسم المورد..." /></div>
      </div>

      {filtered.length === 0 ? (
        <Card><div style={{ textAlign: "center", padding: 30, color: T.textMut }}>لا توجد طلبات{q || statusF ? " مطابقة" : " — اضغط «+ طلب جديد»"}</div></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {canEdit && <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 4px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>
              <input type="checkbox" checked={allVisSelected} onChange={toggleAllVis} style={{ width: 16, height: 16, cursor: "pointer" }} />تحديد الكل المعروض
            </label>
            {sel.size > 0 && <>
              <button onClick={bulkDelete} style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: FS - 1 }}>🗑 حذف المحدد ({sel.size})</button>
              <button onClick={() => setSel(new Set())} style={{ background: T.bg, color: T.textSec, border: "1px solid " + T.brd, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: FS - 1 }}>إلغاء التحديد</button>
            </>}
          </div>}
          {filtered.slice(0, showN).map(r => {
            const ds = displayStatus(r, today); const meta = STATUS_META[ds] || STATUS_META.draft;
            return (
              <div key={r.id} onClick={() => setActiveRfq(r)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: sel.has(r.id) ? T.accent + "0D" : T.cardSolid, border: "1px solid " + (sel.has(r.id) ? T.accent + "66" : T.brd), cursor: "pointer", flexWrap: "wrap" }}>
                {canEdit && <input type="checkbox" checked={sel.has(r.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSel(r.id)} style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />}
                <div style={{ minWidth: 110 }}>
                  <div style={{ fontWeight: 800, color: "#D97706", fontFamily: "monospace" }}>{r.rfqNo}</div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace" }}>{r.date}</div>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: FS - 1 }}>{r.supplierName || r.supplierNameAdHoc || "—"}</div>
                  <div style={{ fontSize: FS - 3, color: T.textSec }}>{(r.items || []).length} صنف{r.convertedToPoNo ? " • " + r.convertedToPoNo : ""}</div>
                </div>
                <div style={{ textAlign: "left", direction: "ltr", minWidth: 90 }}>
                  <div style={{ fontWeight: 800, color: T.text }}>{fmt(Number(r.total || 0).toFixed(0))}</div>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FS - 2, fontWeight: 700, background: meta.bg, color: meta.color }}>{meta.label}</span>
                {canEdit && <button onClick={e => { e.stopPropagation(); handleDelete(r); }} title="حذف الطلب" style={{ background: "#EF444412", color: "#EF4444", border: "1px solid #EF444433", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: FS }}>🗑</button>}
              </div>
            );
          })}
          {filtered.length > showN && <button onClick={() => setShowN(n => n + 50)} style={{ marginTop: 4, padding: "10px", borderRadius: 10, border: "1px dashed " + T.brd, background: T.bg, color: T.accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>عرض المزيد ({filtered.length - showN} متبقي)</button>}
        </div>
      )}

      {showForm && (
        <RfqFormModal data={data} editRfq={editRfq} userName={userName} previewNo={nextRfqNo(data)} isMob={isMob}
          onSave={handleSave} onClose={() => { setShowForm(false); setEditRfq(null); }} />
      )}
      {liveActive && !showForm && (
        <RfqDetailModal rfq={liveActive} data={data} userName={userName} canEdit={canEdit}
          onClose={() => setActiveRfq(null)}
          onEdit={() => { setEditRfq(liveActive); setShowForm(true); }}
          onStatus={handleStatus} onSend={handleSend} onConvert={handleConvert} onDelete={handleDelete} />
      )}
      <BlockingOverlay show={busy} text="جاري حذف الطلبات..." sub="من فضلك انتظر — لا تغلق الصفحة" />
    </div>
  );
}
