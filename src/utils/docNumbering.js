/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Document Numbering (V21.20.0)
   ───────────────────────────────────────────────────────────────────────
   ترقيم موحّد قابل للإعداد لمستندات البيع/الشراء:
   عرض سعر · أمر بيع · فاتورة بيع · فاتورة شراء.

   الصيغة الافتراضية: «{prefix}-{seq}-{MM}-{YYYY}»  →  أمر بيع-0001-06-2026
   التسلسل افتراضياً شهري (يتصفّر كل شهر). قابل للتغيير من الإعدادات:
     data.docNumbering[docType] = { prefix, pad, reset, format, counters }
       reset: "monthly" | "yearly" | "never"
       counters: { "<periodKey>": lastSeq }   (يُدار تلقائياً)

   placeholders في format: {prefix} {seq} {MM} {YYYY} {YY}
   التغيير بيطبّق على المستندات الجديدة فقط (القديمة بأرقامها).
   ═══════════════════════════════════════════════════════════════════════ */

export const DOC_TYPES = ["quotation", "salesOrder", "salesInvoice", "purchaseInvoice"];

export const DOC_TYPE_LABEL = {
  quotation: "عرض سعر",
  salesOrder: "أمر بيع",
  salesInvoice: "فاتورة بيع",
  purchaseInvoice: "فاتورة شراء",
};

export const DEFAULT_DOC_NUMBERING = {
  quotation:       { prefix: "عرض سعر",   pad: 4, reset: "monthly", format: "{prefix}-{seq}-{MM}-{YYYY}" },
  salesOrder:      { prefix: "أمر بيع",    pad: 4, reset: "monthly", format: "{prefix}-{seq}-{MM}-{YYYY}" },
  salesInvoice:    { prefix: "فاتورة بيع", pad: 4, reset: "monthly", format: "{prefix}-{seq}-{MM}-{YYYY}" },
  purchaseInvoice: { prefix: "فاتورة شراء", pad: 4, reset: "monthly", format: "{prefix}-{seq}-{MM}-{YYYY}" },
};

/* دمج الإعداد المحفوظ مع الافتراضي لنوع مستند */
export function getDocNumCfg(dataOrD, docType){
  const def = DEFAULT_DOC_NUMBERING[docType] || { prefix: docType, pad: 4, reset: "monthly", format: "{prefix}-{seq}-{MM}-{YYYY}" };
  const saved = ((dataOrD && dataOrD.docNumbering) || {})[docType] || {};
  return { ...def, ...saved };
}

function _periodKey(cfg, d){
  if(cfg.reset === "never") return "all";
  if(cfg.reset === "yearly") return String(d.getFullYear());
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); /* monthly */
}

/* بناء نص الرقم النهائي */
export function formatDocNo(cfg, seq, dateStr){
  const d = dateStr ? new Date(String(dateStr) + "T12:00:00") : new Date();
  const dd = isNaN(d.getTime()) ? new Date() : d;
  const MM = String(dd.getMonth() + 1).padStart(2, "0");
  const YYYY = String(dd.getFullYear());
  const seqStr = String(seq).padStart(Number(cfg.pad) || 4, "0");
  return String(cfg.format || "{prefix}-{seq}-{MM}-{YYYY}")
    .replaceAll("{prefix}", cfg.prefix || "")
    .replaceAll("{seq}", seqStr)
    .replaceAll("{MM}", MM)
    .replaceAll("{YYYY}", YYYY)
    .replaceAll("{YY}", YYYY.slice(-2));
}

/* معاينة الرقم الجاي (read-only — مش بيـ increment) */
export function previewDocNo(data, docType, dateStr){
  const cfg = getDocNumCfg(data, docType);
  const d = dateStr ? new Date(String(dateStr) + "T12:00:00") : new Date();
  const dd = isNaN(d.getTime()) ? new Date() : d;
  const next = ((cfg.counters || {})[_periodKey(cfg, dd)] || 0) + 1;
  return formatDocNo(cfg, next, dateStr);
}

/* حجز الرقم الجاي — بيـ increment العدّاد atomically. يُمرّر داخل upConfig. */
export function reserveDocNo(d, docType, dateStr){
  if(!d.docNumbering) d.docNumbering = {};
  const cfg = getDocNumCfg(d, docType);
  if(!cfg.counters) cfg.counters = {};
  const dt = dateStr ? new Date(String(dateStr) + "T12:00:00") : new Date();
  const dd = isNaN(dt.getTime()) ? new Date() : dt;
  const key = _periodKey(cfg, dd);
  const next = (cfg.counters[key] || 0) + 1;
  cfg.counters[key] = next;
  d.docNumbering[docType] = cfg; /* persist (incl. merged defaults + counter) */
  return formatDocNo(cfg, next, dateStr);
}
