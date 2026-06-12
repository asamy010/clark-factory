/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Import contacts from Excel — I/O layer (V21.21.61)
   ───────────────────────────────────────────────────────────────────────
   استيراد قائمة عملاء/موردين من ملف Excel (الاسم · العنوان · التليفون · النوع).

   لماذا الكتابة المباشرة على customersDocs بدل upConfig؟
   ───────────────────────────────────────────────────────────────────────
   • customers مُجزّأ (partitioned) في customersDocs/{id} منذ V19.57 — كل عميل
     documents مستقل، فحد الـ 1MB على factory/config غير ذي صلة (البيانات متفرّقة
     على آلاف الـ docs، مش في مصفوفة واحدة).
   • syncPartitionedCollection (مسار upConfig) بيعمل Promise.all لكل التغييرات
     دفعة واحدة = 2000 setDoc متوازي → خطر rate-limit / فشل جزئي. بدلها بنكتب
     بـ writeBatch على دفعات (≤450 عملية/commit، حد Firestore = 500).
   • الـ onSnapshot الحيّ على customersDocs (App.jsx) بيلتقط الإضافات تدريجياً
     (docChanges) ويحدّث data.customers — فالواجهة + الحملات بتشوفهم فوراً.
   • buildMergedContacts بيدمج data.customers في روستر «جهات الاتصال».

   المنطق النقي (كشف الأعمدة/البناء/الـ dedup) في importContactsCore.js (مختبَر).
   ═══════════════════════════════════════════════════════════════════════ */

import { writeBatch, doc } from "firebase/firestore";
import { db } from "../../firebase.js";
import { loadXLSX } from "../qr.js";
import { rowsFromMatrix } from "./importContactsCore.js";

export { mapCustomerType, buildImportObjects } from "./importContactsCore.js";

const BATCH_SIZE = 450; /* حد Firestore = 500 عملية/batch — هامش أمان */

/* يقرأ ملف Excel/CSV (ArrayBuffer) ويرجّع الصفوف + الأعمدة المكتشفة. */
export async function parseContactsExcel(arrayBuffer){
  const XLSX = await loadXLSX();
  if(!XLSX) throw new Error("تعذّر تحميل محرّك Excel — راجع الاتصال بالإنترنت");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if(!sheetName) throw new Error("الملف لا يحتوي على أي ورقة بيانات");
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  return rowsFromMatrix(matrix);
}

/* يكتب الكائنات على customersDocs/suppliersDocs بـ writeBatch على دفعات.
   onProgress(written, total) بعد كل دفعة. */
export async function writeImportBatched({ objs, target, onProgress }){
  if(!Array.isArray(objs) || !objs.length) return 0;
  const collName = target === "suppliers" ? "suppliersDocs" : "customersDocs";
  let written = 0;
  for(let i = 0; i < objs.length; i += BATCH_SIZE){
    const chunk = objs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(o => batch.set(doc(db, collName, String(o.id)), o));
    await batch.commit();
    written += chunk.length;
    if(onProgress) onProgress(written, objs.length);
  }
  return written;
}
