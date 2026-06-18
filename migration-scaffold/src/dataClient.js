/* ════════════════════════════════════════════════════════════════════════
   CLARK — Data layer adapter (Supabase) — سكتش للمرحلة P4
   ════════════════════════════════════════════════════════════════════════
   بيحاكي نمط App.jsx الحالي:
     - upConfig(fn)  → read-modify-write على المستند المركزي + CAS + sync splits
     - subscribeConfig(cb) → بديل onSnapshot عبر Supabase Realtime
   الهدف: أقل تعديل ممكن في صفحات التطبيق — data.<field> يفضل array زي ما هو،
   والـ magic كله هنا (نفس فلسفة splitCollections.js: «الصفحات مش بتتعدّل»).

   ⚠️ ده هيكل مرجعي مش نهائي. منطق الـ diff/sync للـ splits/partitions
   بيتنقل كما هو من splitCollections.js + partitionedCollections.js مع
   استبدال طبقة Firestore بـ Supabase upsert/delete. الكتابة الذرّية للمستند
   المركزي عبر RPC app_docs_cas (راجع schema.sql + خطة §4).
   ════════════════════════════════════════════════════════════════════════ */
import { supabase } from "./supabase.js";

/* قراءة المستند المركزي مع نسخته (للـ CAS) */
async function readCentral(key) {
  const { data, error } = await supabase
    .from("app_docs").select("data, version").eq("doc_key", key).single();
  if (error) throw error;
  return { data: data?.data || {}, version: data?.version ?? 0 };
}

/* upConfig: read → mutate → CAS write مع إعادة المحاولة عند التعارض.
   بديل runTransaction(factory/config) في Firestore. */
export async function upConfig(fn, { by = null, maxRetries = 5 } = {}) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: cur, version } = await readCentral("config");
    const next = structuredClone(cur);
    fn(next);
    // TODO(P4): قبل الكتابة، اشتقّ تغييرات الـ split/partition arrays من
    //   (cur → next) وزامِنها على day_docs/entity_docs — نفس منطق
    //   syncAllSplitChanges + syncAllPartitionedChanges (مع Supabase بدل Firestore).
    const clean = JSON.parse(JSON.stringify(next)); // strip undefined
    const { data: res, error } = await supabase.rpc("app_docs_cas", {
      p_key: "config", p_expected_version: version, p_data: clean, p_by: by,
    });
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(res) ? res[0] : res;
    if (row?.ok) return { ok: true, version: row.new_version };
    // تعارض — جهاز تاني كتب؛ أعد القراءة وحاول تاني
  }
  return { ok: false, error: "conflict: too many concurrent writes" };
}

/* بديل onSnapshot(factory/config) — Realtime على app_docs */
export function subscribeConfig(onChange, onError) {
  const channel = supabase
    .channel("app_docs:config")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "app_docs", filter: "doc_key=eq.config" },
      (payload) => { try { onChange(payload.new?.data || {}); } catch (e) { onError?.(e); } })
    .subscribe((status) => { if (status === "CHANNEL_ERROR") onError?.(new Error("realtime channel error")); });
  return () => supabase.removeChannel(channel); // unsubscribe
}

/* قراءة مجموعة يومية كاملة ودمجها array واحد (بديل readSplitCollection) */
export async function readDayCollection(collection) {
  const { data, error } = await supabase
    .from("day_docs").select("data").eq("collection", collection);
  if (error) { console.error(`[dataClient] read ${collection}:`, error.message); return []; }
  return (data || []).flatMap(r => Array.isArray(r.data?.entries) ? r.data.entries : []);
}

/* قراءة مجموعة per-id كاملة ودمجها array واحد (بديل readPartitionedCollection) */
export async function readEntityCollection(collection) {
  const { data, error } = await supabase
    .from("entity_docs").select("data").eq("collection", collection);
  if (error) { console.error(`[dataClient] read ${collection}:`, error.message); return []; }
  return (data || []).map(r => r.data).sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
}
