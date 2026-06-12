/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Import contacts — PURE core (V21.21.61)
   ───────────────────────────────────────────────────────────────────────
   منطق نقي (بدون Firebase/xlsx) — قابل للاختبار: كشف الأعمدة، تطبيع النوع،
   تحويل مصفوفة الشيت لصفوف، وبناء كائنات العملاء/الموردين مع dedup.
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizePhone } from "../format.js";

/* خرائط أسماء الأعمدة (عربي + إنجليزي + متغيّرات شائعة) */
export const HEADER_MAP = {
  name:    ["الاسم", "اسم العميل", "اسم المورد", "اسم", "الاسم بالكامل", "العميل", "المورد", "اسم الجهة", "name", "customer", "customer name", "supplier", "full name", "client"],
  phone:   ["رقم التليفون", "التليفون", "رقم الموبايل", "الموبايل", "رقم الهاتف", "الهاتف", "تليفون", "موبايل", "واتساب", "رقم", "phone", "mobile", "tel", "telephone", "phone number", "whatsapp", "no"],
  address: ["العنوان", "عنوان", "العنوان بالكامل", "المنطقة", "المدينة", "address", "location", "area", "city"],
  type:    ["النوع", "النوع محل او مكتب", "محل او مكتب", "التصنيف", "نوع", "صنف", "type", "category", "kind"],
};

export function normHdr(h){ return String(h == null ? "" : h).trim().toLowerCase().replace(/\s+/g, " "); }

/* يكتشف فهرس كل عمود من صف العناوين (مطابقة تامة أولاً ثم احتواء) */
export function detectColumns(headerRow){
  const map = {};
  (headerRow || []).forEach((h, idx) => {
    const hn = normHdr(h);
    if(!hn) return;
    for(const [field, aliases] of Object.entries(HEADER_MAP)){
      if(map[field] != null) continue;
      if(aliases.some(a => normHdr(a) === hn)) map[field] = idx;
    }
  });
  (headerRow || []).forEach((h, idx) => {
    const hn = normHdr(h);
    if(!hn) return;
    for(const [field, aliases] of Object.entries(HEADER_MAP)){
      if(map[field] != null) continue;
      if(aliases.some(a => hn.includes(normHdr(a)))) map[field] = idx;
    }
  });
  return map;
}

/* نوع العميل: محل / مكتب / أونلاين / مخصّص (افتراضي مكتب) */
export function mapCustomerType(raw){
  const s = String(raw == null ? "" : raw).trim();
  if(!s) return "مكتب";
  if(/محل|store|shop|retail/i.test(s)) return "محل";
  if(/مكتب|office|wholesale|جمل/i.test(s)) return "مكتب";
  if(/اونلاين|أونلاين|online|اون لاين/i.test(s)) return "أونلاين";
  return s;
}

/* يحوّل مصفوفة شيت (صفوف خام) إلى { rows, columns, headerRow }.
   أول صف غير فاضي = العناوين. */
export function rowsFromMatrix(matrix){
  if(!Array.isArray(matrix) || !matrix.length) return { rows: [], columns: {}, headerRow: [], totalRows: 0 };
  let hIdx = 0;
  while(hIdx < matrix.length && (matrix[hIdx] || []).every(c => !String(c || "").trim())) hIdx++;
  const headerRow = matrix[hIdx] || [];
  const columns = detectColumns(headerRow);
  const rows = [];
  for(let i = hIdx + 1; i < matrix.length; i++){
    const r = matrix[i];
    if(!r || r.every(c => !String(c || "").trim())) continue;
    const get = (f) => columns[f] != null ? String(r[columns[f]] == null ? "" : r[columns[f]]).trim() : "";
    const name = get("name"), phone = get("phone"), address = get("address"), type = get("type");
    if(!name && !phone) continue;
    rows.push({ name, phone, address, type });
  }
  return { rows, columns, headerRow, totalRows: rows.length };
}

/* يبني كائنات العملاء/الموردين الجاهزة للكتابة، مع dedup اختياري بالتليفون.
   نقي — يُستدعى للمعاينة وللكتابة بنفس النتيجة. */
export function buildImportObjects({ rows, target, dedupe, existing, userName }){
  const isSup = target === "suppliers";
  const existingPhones = new Set();
  if(dedupe){
    (existing || []).forEach(e => { const c = normalizePhone(e && e.phone || ""); if(c) existingPhones.add(c); });
  }
  const seen = new Set();
  const objs = [];
  let skippedDup = 0, invalid = 0;
  const now = Date.now();
  const batchTag = "xlsx-" + new Date(now).toISOString().split("T")[0];

  (rows || []).forEach((row, i) => {
    const name = String(row.name || "").trim();
    if(!name){ invalid++; return; }
    const phoneCanon = row.phone ? normalizePhone(row.phone) : "";
    if(dedupe && phoneCanon){
      if(existingPhones.has(phoneCanon) || seen.has(phoneCanon)){ skippedDup++; return; }
      seen.add(phoneCanon);
    }
    const id = (isSup ? "sup_" : "cust_") + now.toString(36) + "_" + i.toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    const base = {
      id, name,
      phone: phoneCanon,
      address: String(row.address || "").trim(),
      tags: [],
      archived: false,
      createdAt: new Date(now).toISOString(),
      createdBy: userName || "",
      importBatch: batchTag,
    };
    if(isSup) objs.push({ ...base, notes: "" });
    else objs.push({ ...base, type: mapCustomerType(row.type), discount: 10 });
  });
  return { objs, skippedDup, invalid };
}
