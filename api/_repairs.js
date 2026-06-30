/* ═══════════════════════════════════════════════════════════════════════
   CLARK · منطق الإصلاح المالي المشترك (V21.27.185)
   ───────────────────────────────────────────────────────────────────────
   مصدر الحقيقة الوحيد لإصلاح «أرجل التحويلات المؤكدة الناقصة» — اتنقل هنا من
   api/maintenance/repair-confirmed-transfers.js (V21.9.45) عشان نفس المنطق
   بالظبط يشغّل:
     1. الـ endpoint اليدوي (repair-confirmed-transfers).
     2. الإصلاح التلقائي في reconcile-financials cron.
   نسختين منفصلتين = خطر drift (القسم §13 في تقرير التشخيص). نسخة واحدة نقية
   مُختبَرة = أمان.

   الفجوة اللي بيعالجها (cross-collection atomicity gap):
   لما الأدمن يوافق على تحويل خزنة، upConfig بيكتب:
     • factory/config (status="confirmed") — ناجح
     • treasuryDays/{date} (الرجلين out/in) — لو فشل → تحويل مؤكد بأرجل ناقصة.
   الإصلاح **تحفّظي بحت**: بيكمّل بس الأرجل الناقصة لتحويلات **المستخدم أكّدها
   بالفعل** — مش بيخترع فلوس، بيسجّل اللي المفروض موجود أصلاً.

   computeMissingTransferLegs نقية 100% (صفر I/O) → قابلة للاختبار بالكامل.
   ═══════════════════════════════════════════════════════════════════════ */

export function dayNameAr(dateStr){
  if(!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00Z").toLocaleDateString("ar-EG", { weekday: "long" });
  } catch(_) { return ""; }
}

function _defaultGid(){
  return "rep_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

/**
 * PURE — يحسب أرجل الخزنة الناقصة للتحويلات المؤكدة.
 * صفر I/O: بياخد المصفوفات المقروءة وبيرجّع خطة الكتابة + إحصائيات.
 *
 * @param {Array} transfers  تحويلات (treasuryTransfers / treasuryTransfersDays)
 * @param {Array} treasury   حركات الخزنة (treasury / treasuryDays)
 * @param {Object} opts
 *   - activeSeason {string}
 *   - actor {string}  مين شغّل الإصلاح (للـ by / repairedBy)
 *   - reason {string} وسم repairReason (مختلف بين الـ endpoint والـ cron)
 *   - makeId {()=>string} مولّد id (للاختبار الحتمي)
 *   - nowIso {string} طابع زمني ثابت (للاختبار)
 *   - dayNameFn {(date)=>string}
 * @returns {{legsToCreate: Array<{day,leg}>, stats: Object}}
 */
export function computeMissingTransferLegs(transfers, treasury, opts = {}){
  const {
    activeSeason = "",
    actor = "",
    reason = "v21.9.45-confirmed-transfer-legs-recovery",
    makeId = _defaultGid,
    nowIso = new Date().toISOString(),
    dayNameFn = dayNameAr,
  } = opts;

  /* فهرسة الأرجل الموجودة بالـ transferId */
  const legsByTransferId = new Map();
  for(const t of (treasury || [])){
    if(t && t.transferId){
      if(!legsByTransferId.has(t.transferId)) legsByTransferId.set(t.transferId, []);
      legsByTransferId.get(t.transferId).push(t);
    }
  }

  let scanned = 0, withMissing = 0, outCreated = 0, inCreated = 0;
  const legsToCreate = [];
  const sampleRepaired = [];
  const daysAffected = new Set();

  for(const tf of (transfers || [])){
    if(!tf || typeof tf !== "object") continue;
    if(tf.status !== "confirmed") continue;
    scanned++;

    const existingLegs = legsByTransferId.get(tf.id) || [];
    const hasOut = existingLegs.some(t => t.type === "out");
    const hasIn  = existingLegs.some(t => t.type === "in");

    const date = String(tf.date || "").slice(0, 10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;/* بدون تاريخ صالح — مش معروف الـ day-doc */

    const dayN = dayNameFn(date);
    const missing = [];

    if(!hasOut && tf.fromAccount){
      legsToCreate.push({ day: date, leg: {
        id: makeId(), type: "out", amount: Number(tf.amount) || 0,
        desc: "تحويل إلى " + tf.toAccount + (tf.note ? " — " + tf.note : ""),
        notes: "", category: "تحويل داخلي", account: tf.fromAccount,
        season: activeSeason, date, day: dayN, transferId: tf.id,
        by: tf.sentBy || tf.approvedBy || actor,
        createdAt: nowIso, repairedAt: nowIso, repairedBy: actor, repairReason: reason,
      }});
      outCreated++; missing.push("out"); daysAffected.add(date);
    }

    if(!hasIn && tf.toAccount){
      legsToCreate.push({ day: date, leg: {
        id: makeId(), type: "in", amount: Number(tf.amount) || 0,
        desc: "تحويل من " + tf.fromAccount + (tf.note ? " — " + tf.note : ""),
        notes: "", category: "تحويل داخلي", account: tf.toAccount,
        season: activeSeason, date, day: dayN, transferId: tf.id,
        by: tf.sentBy || tf.approvedBy || actor,
        createdAt: nowIso, repairedAt: nowIso, repairedBy: actor, repairReason: reason,
      }});
      inCreated++; missing.push("in"); daysAffected.add(date);
    }

    if(missing.length > 0){
      withMissing++;
      if(sampleRepaired.length < 10){
        sampleRepaired.push({
          tfId: tf.id, amount: Number(tf.amount) || 0,
          from: tf.fromAccount || "", to: tf.toAccount || "",
          date, missing: missing.join("+"),
        });
      }
    }
  }

  return {
    legsToCreate,
    stats: {
      transfers_scanned: scanned,
      transfers_with_missing_legs: withMissing,
      legs_to_create: legsToCreate.length,
      legs_out_to_create: outCreated,
      legs_in_to_create: inCreated,
      days_affected: daysAffected.size,
      days_list: Array.from(daysAffected),
      sample_repaired: sampleRepaired,
    },
  };
}

/**
 * WRITER — يكتب الأرجل في treasuryDays/{day}.
 * read-modify-write (merge مش overwrite — درس V16.75)، idempotent بالـ id.
 * بيشتغل بس على الخزنة المقسّمة (post-V16.74) — الـ caller يضمن ذلك.
 *
 * @param {FirebaseFirestore.Firestore} db  firebase-admin db
 * @param {Array<{day,leg}>} legsToCreate
 * @returns {{written:number, daysAffected:string[]}}
 */
export async function applyTransferLegRepairs(db, legsToCreate){
  const legsByDay = new Map();
  for(const { day, leg } of (legsToCreate || [])){
    if(!legsByDay.has(day)) legsByDay.set(day, []);
    legsByDay.get(day).push(leg);
  }
  let written = 0;
  const daysAffected = [];
  for(const [day, newLegs] of legsByDay){
    const dayRef = db.collection("treasuryDays").doc(day);
    const daySnap = await dayRef.get();
    let entries = [];
    if(daySnap.exists){
      const data = daySnap.data();
      entries = Array.isArray(data?.entries) ? data.entries : [];
    }
    /* idempotency: تخطّى أي رجل id-ه موجود بالفعل (إعادة تشغيل آمنة) */
    const existingIds = new Set(entries.map(e => String(e?.id || "")));
    const fresh = newLegs.filter(l => !existingIds.has(String(l.id)));
    if(fresh.length === 0) continue;
    const merged = [...fresh, ...entries];/* unshift convention — الأحدث في الأول */
    await dayRef.set({
      entries: merged,
      count: merged.length,
      updatedAt: new Date().toISOString(),
      repairTouched: true,
      repairAt: new Date().toISOString(),
    }, { merge: true });
    written += fresh.length;
    daysAffected.push(day);
  }
  return { written, daysAffected };
}
