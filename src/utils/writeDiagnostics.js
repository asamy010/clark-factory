/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Write Diagnostics (V19.46)
   ───────────────────────────────────────────────────────────────────────
   Helpers for diagnosing why Firestore writes fail. Used by upConfigTx,
   upSalesTx, and upTasksTx when their retries are exhausted, AND by the
   "تشخيص الحفظ" button in Settings → Maintenance.

   Why this exists:
   ────────────────
   Pre-V19.46 the write fallback was fire-and-forget — `setDoc(...).catch(...)`
   logged to console only. Users saw the optimistic UI flash, then a refresh
   would revert (because the listener pulled stale server data). They reported
   "save didn't happen" with no error visible.

   This module gives:
     - Estimated doc size (so 1MB-limit issues become diagnosable)
     - Categorized error reasons (permission-denied vs. quota vs. size)
     - Forensic log entry the user can copy-paste when reporting bugs
     - Round-trip self-test for when admin wants to verify writes work
   ═══════════════════════════════════════════════════════════════════════ */

import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";

/* Firestore document hard limit (1 MiB ~ 1,048,576 bytes).
   We warn at 80% so the user has time to act before writes start failing. */
const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;
const FIRESTORE_DOC_WARN_BYTES  = Math.floor(FIRESTORE_DOC_LIMIT_BYTES * 0.80);

/* Estimate the serialized size of an object. JSON.stringify + UTF-8 byte length.
   Not exact (Firestore's wire format ≠ JSON), but close enough for warnings. */
export function estimateDocSize(obj){
  if(obj == null) return 0;
  try {
    const json = JSON.stringify(obj);
    /* TextEncoder gives accurate UTF-8 byte count (Arabic = multi-byte). */
    if(typeof TextEncoder !== "undefined"){
      return new TextEncoder().encode(json).length;
    }
    /* Fallback for older runtimes */
    return json.length * 2;
  } catch(e){
    return -1; /* signal "couldn't measure" */
  }
}

/* Format byte count into human-readable string */
export function formatBytes(n){
  if(n == null || n < 0) return "—";
  if(n < 1024) return n + " B";
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

/* Returns one of: "ok" | "warn" | "danger" */
export function classifyDocSize(bytes){
  if(bytes < 0) return "ok";
  if(bytes >= FIRESTORE_DOC_LIMIT_BYTES) return "danger";
  if(bytes >= FIRESTORE_DOC_WARN_BYTES)  return "warn";
  return "ok";
}

/* Categorize a Firestore error into something actionable for the user.
   The Firebase SDK uses `code` like "permission-denied", "unavailable",
   "deadline-exceeded", "invalid-argument" (the size-limit error), etc. */
export function categorizeWriteError(err){
  if(!err) return { category: "unknown", arabic: "خطأ غير معروف" };
  const code = err.code || "";
  const msg = (err.message || String(err)).toLowerCase();

  if(code === "permission-denied" || msg.includes("permission")){
    return {
      category: "permission",
      arabic: "صلاحية مرفوضة من الـ database — راجع قواعد Firestore",
      severe: true,
    };
  }
  if(code === "invalid-argument" || msg.includes("too large") || msg.includes("1048")){
    return {
      category: "size",
      arabic: "حجم البيانات تخطى الحد الأقصى (1 ميجابايت). محتاج archiving.",
      severe: true,
    };
  }
  if(code === "resource-exhausted" || code === "quota-exceeded" || msg.includes("quota")){
    return {
      category: "quota",
      arabic: "تم تجاوز حصة الاستخدام في Firebase",
      severe: true,
    };
  }
  if(code === "unavailable" || code === "deadline-exceeded" || msg.includes("offline") || msg.includes("network")){
    return {
      category: "network",
      arabic: "مشكلة في الشبكة — جرب تاني بعد ثواني",
      severe: false,
    };
  }
  if(code === "aborted" || code === "already-exists" || code === "internal"){
    return {
      category: "transient",
      arabic: "تعارض مؤقت — جرب تاني",
      severe: false,
    };
  }
  return {
    category: "unknown",
    arabic: "خطأ غير معروف: " + (err.message || code || String(err)).slice(0, 100),
    severe: true,
  };
}

/* Build a forensic log line — we attach this to console.error AND offer
   the user a copy button in the failure toast. Format is intentionally
   one-liner so they can paste it into a chat without formatting issues. */
export function buildForensicLine(opts){
  const {
    docPath = "?",
    docSize = -1,
    errCode = "",
    errMsg = "",
    attempts = 0,
    operation = "write",
  } = opts || {};
  const ts = new Date().toISOString();
  const sizeStr = formatBytes(docSize);
  const sizeClass = classifyDocSize(docSize);
  return `[CLARK-write-fail ${ts}] op=${operation} path=${docPath} size=${sizeStr}(${sizeClass}) attempts=${attempts} code=${errCode} msg=${(errMsg||"").slice(0,200)}`;
}

/* Round-trip self-test:
     1) Write a tiny marker field to factory/_writeTest
     2) Read it back
     3) Delete it
   Returns { ok, durationMs, error?, errorCategory? }.
   Used by the "تشخيص الحفظ" button. */
export async function runWriteSelfTest(db, userIdentifier){
  const ref = doc(db, "factory", "_writeTest");
  const start = performance.now();
  const marker = {
    by: userIdentifier || "unknown",
    at: new Date().toISOString(),
    nonce: Math.random().toString(36).slice(2, 10),
  };
  try {
    /* 1. Write */
    await setDoc(ref, marker);
    /* 2. Read back */
    const snap = await getDoc(ref);
    if(!snap.exists() || snap.data().nonce !== marker.nonce){
      throw new Error("write-readback mismatch");
    }
    /* 3. Cleanup — best-effort, doesn't fail the test if it fails */
    try { await setDoc(ref, { nonce: deleteField(), by: deleteField(), at: deleteField() }, { merge: true }); } catch(_){ /* nbd */ }
    const durationMs = Math.round(performance.now() - start);
    return { ok: true, durationMs };
  } catch(e){
    const cat = categorizeWriteError(e);
    return {
      ok: false,
      durationMs: Math.round(performance.now() - start),
      error: e.message || String(e),
      errorCode: e.code || "",
      errorCategory: cat.category,
      arabicHint: cat.arabic,
    };
  }
}
