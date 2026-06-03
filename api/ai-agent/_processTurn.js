/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Turn processor (the "brain")
   Slice 4 (V21.9.227): first reply.   Slice 5 (V21.9.228): knowledge context.
   ════════════════════════════════════════════════════════════════════════
   A single Claude call that generates the customer reply. The system message
   is built from the configured persona PLUS the business knowledge (style
   rules + FAQs + product catalog summary) so the agent answers most common
   questions accurately WITHOUT inventing facts. Still NO tools (the tool-use
   loop + live-data tools like balance/statement come in later slices).

   Reuses api/ai.js's Anthropic access (ANTHROPIC_API_KEY + Messages API).
   The big, stable knowledge block is sent as a CACHED block (prompt caching)
   so repeated turns pay the cheaper cache-read rate; the small per-customer
   block is uncached (it changes per sender). Read-only.
   ════════════════════════════════════════════════════════════════════════ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = (process.env.AI_AGENT_MODEL || "claude-sonnet-4-20250514").trim();
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.4;          /* human-ish but not unpredictable */
const CALL_TIMEOUT_MS = 25000;    /* < Vercel function kill window */

const LEN_MAP = { short: "مختصر جداً (جملة-جملتين)", medium: "متوسط (٢-٤ جمل)", long: "مفصّل لكن من غير حشو" };

/* Build the stable knowledge block: persona + style rules + FAQs + catalog. */
function buildKnowledge(agent, catalog, factoryName) {
  const p = (agent && agent.personality) || {};
  const parts = [];
  parts.push(String(p.systemPrompt || "أنت مساعد كلارك. رد بالعامية المصرية باحترام واختصار.").trim());

  parts.push(`── معلومات المصنع ──\nاسم المصنع: ${factoryName || "كلارك"}`);

  const styleLines = [
    `- طول الرد: ${LEN_MAP[p.answerLength] || "متوسط (٢-٤ جمل)"}`,
    `- استخدام الإيموجي: ${p.emojiUse || "moderate"}`,
  ];
  if (Array.isArray(p.forbidden) && p.forbidden.length) styleLines.push(`- ممنوع تماماً: ${p.forbidden.join(" · ")}`);
  if (Array.isArray(p.greetings) && p.greetings.length) styleLines.push(`- تحيات مناسبة: ${p.greetings.join(" / ")}`);
  parts.push(`── تعليمات الأسلوب ──\n${styleLines.join("\n")}`);

  const faqs = Array.isArray(agent && agent.faqs) ? agent.faqs : [];
  if (faqs.length) {
    const faqText = faqs.slice(0, 60)
      .map((f) => `س: ${String(f.title || "").trim()}\nج: ${String(f.answer || "").trim()}`)
      .filter((x) => x.replace(/^س:\s*\nج:\s*$/, "").trim().length > 6)
      .join("\n\n");
    if (faqText) parts.push(`── أسئلة شائعة (اعتمد عليها للإجابة بدقة؛ متخترعش معلومة مش موجودة فيها) ──\n${faqText}`);
  }

  const cat = Array.isArray(catalog) ? catalog : [];
  if (cat.length) {
    const lines = cat.slice(0, 40).map((c) => {
      const bits = [String(c.name || c.code || "").trim()];
      if (c.category) bits.push(String(c.category));
      if (c.priceWholesale) bits.push(`سعر الجملة: ${c.priceWholesale} ج`);
      if (Array.isArray(c.sizes) && c.sizes.length) bits.push(`مقاسات: ${c.sizes.join("، ")}`);
      if (c.minOrderQty) bits.push(`أقل طلب: ${c.minOrderQty}`);
      return "• " + bits.filter(Boolean).join(" · ");
    }).filter((x) => x.length > 4);
    if (lines.length) {
      parts.push(`── المنتجات (${cat.length} منتج${cat.length > 40 ? "، معروض أول ٤٠" : ""}) ──\n${lines.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}

/* opts: { agent, catalog, factoryName, customer:{name,type}|null, userMessage }
   Returns { reply, usage, model }. Throws on a hard API failure. */
export async function processTurn({ agent, catalog, factoryName, customer, userMessage }) {
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const knowledge = buildKnowledge(agent || {}, catalog, factoryName);
  const ctx = (customer && customer.name)
    ? `[سياق داخلي — معلومة للمساعدة فقط، متعرضهاش حرفياً] العميل المتكلّم: ${customer.name}${customer.type ? " · النوع: " + customer.type : ""}. خاطبه بـ «أ/${customer.name}».`
    : `[سياق داخلي] الراسل مش متعرّف عليه (رقمه مش في قاعدة العملاء). كن مهذّباً، ولو لزم اطلب اسمه/اسم الشركة بلُطف.`;

  const system = [
    { type: "text", text: knowledge, cache_control: { type: "ephemeral" } },
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
