/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Customer recognition by phone  (Slice 2-3 / V21.9.226)
   ════════════════════════════════════════════════════════════════════════
   Maps an incoming WhatsApp phone → a CLARK customer (customersDocs).

   CLARK customers store the phone in assorted formats (whatever was typed),
   so we can't do a single indexed equality query reliably. Instead we read
   the customersDocs collection ONCE, build a normalized-phone → customer map,
   and CACHE it in module scope for 5 minutes. Serverless instances reuse
   module scope across warm invocations, so this is ~1 read per 5 min per warm
   instance — NOT one read per message. (For a wholesale factory the customer
   count is modest; if it ever grows large, switch to a maintained phone index.)

   Matches against: phone, phone_raw, and additional_phones[] (covers the
   LID→phone mappings the Suggestions tab adds). Read-only.
   ════════════════════════════════════════════════════════════════════════ */
import { getDb } from "../_firebase.js";
import { normalizePhoneCanonical } from "../shopify/_customers.js";

let _cache = { map: null, builtAt: 0 };
const TTL_MS = 5 * 60 * 1000;

async function buildMap() {
  const db = getDb();
  const map = new Map();
  const snap = await db.collection("customersDocs").get();
  snap.forEach((doc) => {
    const c = doc.data() || {};
    const cust = {
      id: c.id || doc.id,
      name: c.name || "",
      type: c.type || "",
      discount: (c.discount != null ? c.discount : null),
    };
    const phones = [c.phone, c.phone_raw, ...(Array.isArray(c.additional_phones) ? c.additional_phones : [])];
    for (const p of phones) {
      const n = normalizePhoneCanonical(p);
      if (n && !map.has(n)) map.set(n, cust);   /* first writer wins (stable) */
    }
  });
  return map;
}

/* Returns { id, name, type, discount } or null. Never throws (logs + null). */
export async function findCustomerByPhone(phone) {
  const n = normalizePhoneCanonical(phone);
  if (!n) return null;
  const now = Date.now();
  if (!_cache.map || now - _cache.builtAt > TTL_MS) {
    try {
      _cache = { map: await buildMap(), builtAt: now };
    } catch (e) {
      console.error("[ai-agent/_customerLookup] build failed:", e?.message || e);
      if (!_cache.map) return null;   /* no usable cache → give up gracefully */
    }
  }
  return _cache.map.get(n) || null;
}
