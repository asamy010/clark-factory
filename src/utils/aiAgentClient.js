/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiAgentClient.js (V21.9.235)
   ───────────────────────────────────────────────────────────────────────
   Browser-side wrapper for the /api/ai-agent/* admin endpoints used by the
   manual-takeover UI (LogsTab). Mirrors shopifyClient.js: a fresh Firebase
   admin ID token per call (Authorization: Bearer <token>), JSON in/out,
   normalized errors. Endpoints verify the admin/manager role server-side.

   The takeover STATE itself is read live from Firestore (aiAgentTakeovers);
   these endpoints only MUTATE it (the client never writes that collection).
   ═══════════════════════════════════════════════════════════════════════ */

const DEFAULT_TIMEOUT_MS = 30000;

async function getIdToken(user){
  if(!user || typeof user.getIdToken !== "function"){
    throw new Error("لازم تسجّل دخول كأدمن");
  }
  return await user.getIdToken();
}

async function call(method, path, body, user){
  const idToken = await getIdToken(user);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const opts = {
      method,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
      signal: ctrl.signal,
    };
    if(body && method !== "GET") opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    let data;
    try { data = await r.json(); } catch(_) { data = {}; }
    if(!r.ok){
      throw new Error(data?.error || ("HTTP " + r.status));
    }
    return data;
  } catch(e){
    if(e?.name === "AbortError") throw new Error("العملية أخدت وقت طويل — حاول تاني");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* Grab / release a conversation. active=true → agent goes silent for this wid;
   active=false → resume the agent. → { ok, takeover } */
export function aiAgentSetTakeover({ wid, active, phone, customerName, customerId }, user){
  return call("POST", "/api/ai-agent/set-takeover", { wid, active, phone, customerName, customerId }, user);
}

/* Send a hand-typed reply to the customer during takeover (auto-grabs if not
   already taken over) + logs it as a human turn. → { ok, sent, at } */
export function aiAgentAdminReply({ wid, phone, message, customerName, customerId }, user){
  return call("POST", "/api/ai-agent/admin-reply", { wid, phone, message, customerName, customerId }, user);
}
