/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Turn processor (the "brain")   Slice 4 / V21.9.227
   ════════════════════════════════════════════════════════════════════════
   MVP: a single Claude call that generates the customer reply from the
   configured Egyptian-Arabic system prompt + a small customer-context block.
   NO tools yet (tool-use loop comes in the next slice). Read-only.

   Reuses the same Anthropic access as the internal AI helper (api/ai.js):
   ANTHROPIC_API_KEY env + the Messages API. Model defaults to the same Sonnet
   string api/ai.js uses, overridable via AI_AGENT_MODEL.

   Prompt caching: the (large, reused) system prompt is sent as a cached block
   so repeated turns pay the cheaper cache-read rate. Harmless if the prompt is
   below the cache threshold — it simply won't cache.
   ════════════════════════════════════════════════════════════════════════ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = (process.env.AI_AGENT_MODEL || "claude-sonnet-4-20250514").trim();
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.4;          /* human-ish but not unpredictable (per dialect calibration) */
const CALL_TIMEOUT_MS = 25000;    /* < Vercel function kill window */

/* customer: { name, type } | null. Returns { reply, usage, model }. Throws on
   a hard API failure so the caller can log the error on the turn. */
export async function processTurn({ systemPrompt, customer, userMessage }) {
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const baseSys = String(systemPrompt || "أنت مساعد كلارك. رد بالعامية المصرية باحترام واختصار.").trim();
  const ctx = (customer && customer.name)
    ? `[سياق داخلي — معلومة للمساعدة فقط، متعرضهاش حرفياً] العميل المتكلّم: ${customer.name}${customer.type ? " · النوع: " + customer.type : ""}. خاطبه بـ «أ/${customer.name}».`
    : `[سياق داخلي] الراسل مش متعرّف عليه (رقمه مش في قاعدة العملاء). كن مهذّباً، ولو لزم اطلب اسمه/اسم الشركة بلُطف.`;

  /* system as content-block array → enables prompt caching on the big block */
  const system = [
    { type: "text", text: baseSys, cache_control: { type: "ephemeral" } },
    { type: "text", text: ctx },
  ];

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let data;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages: [{ role: "user", content: String(userMessage || "").slice(0, 4000) }],
      }),
      signal: ctrl.signal,
    });
    data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || ("Anthropic HTTP " + r.status));
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Anthropic timeout بعد " + (CALL_TIMEOUT_MS / 1000) + "s");
    throw e;
  } finally {
    clearTimeout(tid);
  }

  const reply = (Array.isArray(data.content) ? data.content : [])
    .filter((b) => b && b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { reply, usage: data.usage || null, model: MODEL };
}
