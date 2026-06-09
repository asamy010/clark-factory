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

/* V21.21.7: تقدّم الاستلام لكل بند (matching عبر receipt line._poLineId === po line.id).
   بيرجّع map: poLineId → { ordered, received, remaining }. الاستلامات القديمة
   اللي مفيهاش _poLineId مابتتحسبش هنا per-line (لكن بتتحسب في poProgress الإجمالي). */
export function poLineProgress(po, receipts){
  const linked = poLinkedReceipts(po, receipts);
  const recByLine = {};
  linked.forEach(r => (r.items || []).forEach(it => {
    const k = it && it._poLineId;
    if(k) recByLine[k] = (recByLine[k] || 0) + (Number(it.qty) || 0);
  }));
  const lines = {};
  (po?.items || []).filter(it => it && !it.isSection).forEach(it => {
    const ordered = Number(it.qty) || 0;
    const received = recByLine[it.id] || 0;
    lines[it.id] = { ordered, received, remaining: Math.max(0, ordered - received) };
  });
  return lines;
}
