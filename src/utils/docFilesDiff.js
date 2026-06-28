/* ═══════════════════════════════════════════════════════════════════════
   CLARK · docFilesDiff (V21.27.178)
   ───────────────────────────────────────────────────────────────────────
   مساحة التخزين: كل ملف بقى مستند Firestore مستقل (`factory/df_<id>`) بدل
   مصفوفة واحدة بتكبر بلا حدود (كانت بتتخطّى حد 1MB → الملفات تختفي).

   `upDocs` في App.jsx بيحافظ على واجهته القديمة (DocumentsPg بيعدّل
   `d.documentsTree.files` array زي ما هو — صفر تغيير فيه)، وبعد التعديل بيعمل
   **diff** بين الـ array القديم والجديد عبر الدالة دي، فيترجمه لكتابات/حذف لكل
   مستند ملف على حدة. كده مفيش array كبير في مستند واحد → سعة بلا حدود.

   pure تماماً → قابل للاختبار بسهولة (ده الجزء الأخطر فبيتغطّى باختبارات).
   ═══════════════════════════════════════════════════════════════════════ */

/* يقارن مصفوفتي ملفات (بالـ id) ويرجّع العمليات المطلوبة على مستندات الملفات:
   - sets: [{id, file}] — ملفات جديدة أو اتعدّلت (upsert للمستند).
   - dels: [id]         — ملفات اتشالت من الـ array (حذف المستند).
   ملفات بدون id صالح بتتجاهَل (defensive). */
export function diffDocFiles(prevFiles, nextFiles) {
  const prevMap = new Map();
  (Array.isArray(prevFiles) ? prevFiles : []).forEach(f => {
    if (f && f.id != null) prevMap.set(String(f.id), f);
  });
  const nextMap = new Map();
  (Array.isArray(nextFiles) ? nextFiles : []).forEach(f => {
    if (f && f.id != null) nextMap.set(String(f.id), f);
  });

  const sets = [];
  for (const [id, f] of nextMap) {
    const old = prevMap.get(id);
    /* جديد، أو اتغيّر محتواه (مقارنة JSON — كفاية لكائنات ميتاداتا بسيطة) */
    if (!old || JSON.stringify(old) !== JSON.stringify(f)) sets.push({ id, file: f });
  }
  const dels = [];
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) dels.push(id);
  }
  return { sets, dels };
}
