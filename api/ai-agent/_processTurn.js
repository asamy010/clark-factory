/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Turn processor (the "brain")
   V227 first reply · V228 knowledge context · V229 tool-use loop + memory
   ════════════════════════════════════════════════════════════════════════
   Builds the system message (persona + business knowledge: style + FAQs +
   catalog) as a CACHED block, threads recent conversation history, and runs
   a tool-use loop: Claude may call tools (executed server-side via _tools.js),
   results are fed back, repeat until a final text reply (capped iterations).
   Reuses api/ai.js's Anthropic access (ANTHROPIC_API_KEY + Messages API).
   Read-only on business data.
   ════════════════════════════════════════════════════════════════════════ */
import { getToolSchemas, executeTool } from "./_tools.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = (process.env.AI_AGENT_MODEL || "claude-sonnet-4-20250514").trim();
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.4;
const CALL_TIMEOUT_MS = 25000;
const MAX_ITERATIONS = 5;           /* safety cap on the tool-use loop */
const MAX_HISTORY_TURNS = 6;

const LEN_MAP = { short: "مختصر جداً (جملة-جملتين)", medium: "متوسط (٢-٤ جمل)", long: "مفصّل لكن من غير حشو" };

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
    if (lines.length) parts.push(`── المنتجات (${cat.length} منتج${cat.length > 40 ? "، معروض أول ٤٠" : ""}) ──\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

function textOf(content) {
  return (Array.isArray(content) ? content : [])
    .filter((b) => b && b.type === "text").map((b) => b.text).join("\n").trim();
}
function accumulate(total, u) {
  if (!u) return;
  total.input_tokens += Number(u.input_tokens) || 0;
  total.output_tokens += Number(u.output_tokens) || 0;
  total.cache_creation_input_tokens += Number(u.cache_creation_input_tokens) || 0;
  total.cache_read_input_tokens += Number(u.cache_read_input_tokens) || 0;
}

async function callClaude({ key, system, messages, tools }) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const body = { model: MODEL, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, system, messages };
    if (tools && tools.length) body.tools = tools;
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || ("Anthropic HTTP " + r.status));
    return data;
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Anthropic timeout بعد " + (CALL_TIMEOUT_MS / 1000) + "s");
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

/* opts: { agent, catalog, factoryName, customer, userMessage, history, toolCtx }
   history: [{role:"user"|"assistant", content:string}] (oldest→newest)
   Returns { reply, usage, model, toolsUsed[], iterations }. */
export async function processTurn({ agent, catalog, factoryName, customer, userMessage, history, toolCtx }) {
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const knowledge = buildKnowledge(agent || {}, catalog, factoryName);
  const ctx = (customer && customer.name)
    ? `[سياق داخلي — معلومة للمساعدة فقط، متعرضهاش حرفياً] العميل المتكلّم: ${customer.name}${customer.type ? " · النوع: " + customer.type : ""}. خاطبه بـ «أ/${customer.name}». لو احتجت بياناته الحيّة (رصيد/طلبات/كشف) استخدم أداة — متخترعش رقم.`
    : `[سياق داخلي] الراسل مش متعرّف عليه (رقمه مش في قاعدة العملاء). كن مهذّباً، ولو لزم اطلب اسمه/اسم الشركة بلُطف.`;
  const system = [
    { type: "text", text: knowledge, cache_control: { type: "ephemeral" } },
    { type: "text", text: ctx },
  ];

  const tools = getToolSchemas(agent || {});
  const messages = [];
  for (const h of (Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS * 2) : [])) {
    if (h && (h.role === "user" || h.role === "assistant") && h.content) {
      messages.push({ role: h.role, content: String(h.content) });
    }
  }
  messages.push({ role: "user", content: String(userMessage || "").slice(0, 4000) });

  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const toolsUsed = [];
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const data = await callClaude({ key, system, messages, tools });
    accumulate(usage, data.usage);

    if (data.stop_reason === "tool_use" && toolCtx) {
      messages.push({ role: "assistant", content: data.content });
      const results = [];
      for (const block of (Array.isArray(data.content) ? data.content : [])) {
        if (block && block.type === "tool_use") {
          toolsUsed.push(block.name);
          let resultText;
          try { resultText = await executeTool(block.name, block.input || {}, toolCtx); }
          catch (e) { resultText = "خطأ في تنفيذ الأداة: " + (e?.message || e); }
          results.push({ type: "tool_result", tool_use_id: block.id, content: String(resultText) });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    return { reply: textOf(data.content), usage, model: MODEL, toolsUsed, iterations };
  }

  return {
    reply: "آسف، حصل تعقيد بسيط — هحوّلك لموظف يتابع معاك.",
    usage, model: MODEL, toolsUsed, iterations, maxedOut: true,
  };
}
