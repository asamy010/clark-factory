/* ═══════════════════════════════════════════════════════════════════════
   CLARK · PurchaseRfqPg (V21.12.1) — طلب عروض أسعار (قائمة + إجراءات)
   نظير QuotationsPg على جهة الموردين. مستند مستقل — صفر مساس بالمخزون/المحاسبة.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, Sel } from "../../components/ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt } from "../../utils/format.js";
import { ask, showToast } from "../../utils/popups.js";
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
  const handleDelete = async () => {
    if(!liveActive) return;
    if(!await ask("حذف الطلب", "حذف " + (liveActive.rfqNo || "") + " نهائياً؟", { danger: true, confirmText: "حذف" })) return;
    upConfig(d => deleteRfqMutator(d, liveActive.id));
    setActiveRfq(null);
    showToast("✓ اتحذف الطلب");
  };

  const chip = (key, label) => (
    <div onClick={() => setStatusF(statusF === key ? "" : key)} style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: FS - 2, fontWeight: 700,
      background: statusF === key ? (STATUS_META[key]?.color || T.accent) : (STATUS_META[key]?.bg || T.bg),
      color: statusF === key ? "#fff" : (STATUS_META[key]?.color || T.textSec), border: "1px solid " + (STATUS_META[key]?.color || T.brd) + "30" }}>
      {label} ({stats[key] || 0})
    </div>
  );

  return (
    <div style={{ padding: isMob ? 4 : 0 }}>
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
          {filtered.map(r => {
            const ds = displayStatus(r, today); const meta = STATUS_META[ds] || STATUS_META.draft;
            return (
              <div key={r.id} onClick={() => setActiveRfq(r)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: T.cardSolid, border: "1px solid " + T.brd, cursor: "pointer", flexWrap: "wrap" }}>
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
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <RfqFormModal data={data} editRfq={editRfq} userName={userName} previewNo={nextRfqNo(data)}
          onSave={handleSave} onClose={() => { setShowForm(false); setEditRfq(null); }} />
      )}
      {liveActive && !showForm && (
        <RfqDetailModal rfq={liveActive} data={data} userName={userName} canEdit={canEdit}
          onClose={() => setActiveRfq(null)}
          onEdit={() => { setEditRfq(liveActive); setShowForm(true); }}
          onStatus={handleStatus} onSend={handleSend} onConvert={handleConvert} onDelete={handleDelete} />
      )}
    </div>
  );
}
