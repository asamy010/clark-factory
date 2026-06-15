/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — minimal WhatsApp bridge sender   (Slice 4 / V21.9.227)
   ════════════════════════════════════════════════════════════════════════
   Sends ONE reply to a customer via the existing bridge `/send` endpoint.
   Kept self-contained (NOT importing the campaign event-processor) so the
   agent subsystem stays decoupled and the webhook pulls no extra deps.
   Mirrors the bridge's message shape: { messages: [{ phone, message, ... }] }.
   AbortController timeout < Vercel's function-kill window.
   ════════════════════════════════════════════════════════════════════════ */
const TIMEOUT_MS = 15000;

export async function sendViaBridge(bridgeUrl, bridgeToken, phone, message, customerName, msgId) {
  const url = String(bridgeUrl || "").replace(/\/+$/, "") + "/send";
  const headers = { "Content-Type": "application/json" };
  if (bridgeToken) headers["Authorization"] = "Bearer " + bridgeToken;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    /* V21.26.19: id ثابت من الرسالة الواردة (wid) عشان الـ bridge يعمل dedup
       حتمي — لو الـ webhook اتبعت مرتين لنفس الرسالة، الرد ما يتكررش. من غير
       id كان ممكن ردّين متطابقين («تمام») لعميلين مختلفين خلال 6 دقايق
       يتعاملوا غلط كـ duplicate. */
    const msg = { phone, message, customerName: customerName || "" };
    if (msgId) msg.id = "aireply:" + String(msgId);
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [msg] }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ("bridge HTTP " + r.status));
    return data;
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Bridge timeout بعد " + (TIMEOUT_MS / 1000) + "s");
    throw e;
  } finally {
    clearTimeout(tid);
  }
}
