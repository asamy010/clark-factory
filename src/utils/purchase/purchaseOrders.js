/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Purchase Orders helpers (V21.12.2 — حالة + تقدّم الاستلام)
   ───────────────────────────────────────────────────────────────────────
   أمر الشراء توثيقي (مايأثرش على المخزن). الحالة محسوبة من الاستلامات
   المرتبطة (receipt._poId === po.id) — مفيش حقل مخزّن يدرِفت، إلا الإلغاء
   اليدوي (po.status="cancelled").
   ═══════════════════════════════════════════════════════════════════════ */

export const PO_STATUS_META = {
  open:      { label: "مفتوح",       color: "#0EA5E9", bg: "#0EA5E915" },
  partial:   { label: "مستلم جزئي",  color: "#F59E0B", bg: "#F59E0B15" },
  completed: { label: "مكتمل",       color: "#10B981", bg: "#10B98115" },
  cancelled: { label: "ملغي",        color: "#EF4444", bg: "#EF444415" },
};

export function poLinkedReceipts(po, receipts){
  if(!po) return [];
  return (receipts || []).filter(r => r && r._poId && r._poId === po.id);
}

export function poProgress(po, receipts){
  const ordered = (po?.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const linked = poLinkedReceipts(po, receipts);
  const received = linked.reduce((s, r) => s + (r.items || []).reduce((ss, it) => ss + (Number(it.qty) || 0), 0), 0);
  return { ordered, received, linked };
}

export function computePoStatus(po, receipts){
  if(!po) return "open";
  if(po.status === "cancelled" || po.cancelled) return "cancelled";
  const { ordered, received } = poProgress(po, receipts);
  if(received <= 0) return "open";
  if(received < ordered) return "partial";
  return "completed";
}
