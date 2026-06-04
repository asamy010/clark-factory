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

/* V21.9.241 — clamp a config-supplied runtime knob into a safe range, falling
   back to the default if it's missing/non-numeric. Keeps UI-driven overrides
   from ever sending the API an invalid value. */
function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

function buildKnowledge(agent, catalog, factoryName) {
  const p = (agent && agent.personality) || {};
  const parts = [];
  parts.push(String(p.systemPrompt || "أنت مساعد كلارك. رد بالعامية المصرية باحترام واختصار.").trim());
  /* V21.9.232: قاعدة لهجة صارمة — Claude بيميل للفصحى/الخليجي أحياناً، فلازم نثبّت
     العامية المصرية بصراحة + قوائم كلمات مسموحة/ممنوعة. */
  parts.push(
    "⚠️ أهم قاعدة — اللهجة:\n" +
    "لازم ترد بالعامية المصرية **فقط** — مش فصحى، ومش خليجي، ومش أي لهجة تانية. زي ما بيتكلم أهل مصر بالظبط.\n" +
    "• كلمات تستعملها: إزيّك · عامل إيه · تمام · أيوة · ماشي · إزاي · عايز/عاوز · دلوقتي · كده · علشان/عشان · مش · ده/دي/دول · حضرتك · يا فندم · أهلاً · معلش · خلاص · بص · يعني.\n" +
    "• ممنوعة نهائياً (خليجية/غير مصرية): وش · شلون · الحين · أبغى/أبي · ايش · زين · يبا/يبي · حياك · تكفى · وايد · شنو · هسة.\n" +
    "• لو حسّيت نفسك بتميل للفصحى أو الخليجي، صحّح فوراً وارجع للمصري الطبيعي. حتى الأرقام والترحيب بالعامية المصرية."
  );
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
    const faqText = faqs.slice(0, 80)
      .map((f) => {
        const t = String(f.title || "").trim();
        const a = String(f.answer || "").trim();
        if (!t && !a) return "";
        const phr = (Array.isArray(f.phrasings) && f.phrasings.length)
          ? `\n   (صيغ تانية لنفس السؤال: ${f.phrasings.map((x) => String(x).trim()).filter(Boolean).join(" / ")})`
          : "";
        return `• السؤال: ${t}${phr}\n  الإجابة: ${a}`;
      })
      .filter((x) => x.trim().length > 6)
      .join("\n\n");
    if (faqText) {
      parts.push(
        "── الأسئلة الشائعة (مرجعك الأساسي — دوّر هنا الأول) ──\n" +
        "مهم جداً: قبل ما ترد على أي سؤال، دوّر في القائمة دي الأول. لو سؤال العميل قريب من أي سؤال هنا أو من «الصيغ التانية» بتاعته، استخدم الإجابة المكتوبة (بصياغتك المصرية الطبيعية، مش نسخ حرفي). متقولش «مش عارف» ولا تحوّل لموظف قبل ما تتأكد إن مفيش إجابة مناسبة هنا.\n\n" +
        faqText
      );
    }
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

async function callClaude({ key, system, messages, tools, model, maxTokens, temperature }) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const body = { model, max_tokens: maxTokens, temperature, system, messages };
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

  /* V21.9.241 — runtime knobs from config.aiAgent.runtime (UI-controlled),
     clamped to safe ranges with the long-standing constants as fallback. An
     empty model falls back to MODEL (env AI_AGENT_MODEL or the Sonnet default),
     so unset config = identical behavior to before. */
  const rt = (agent && agent.runtime) || {};
  const model = (rt.model && String(rt.model).trim()) || MODEL;
  const maxTokens = clampInt(rt.maxTokens, 256, 4096, MAX_TOKENS);
  const temperature = clampNum(rt.temperature, 0, 1, TEMPERATURE);
  const maxIterations = clampInt(rt.maxIterations, 1, 8, MAX_ITERATIONS);
  const maxHistoryTurns = clampInt(rt.historyTurns, 0, 12, MAX_HISTORY_TURNS);

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
  for (const h of (Array.isArray(history) ? history.slice(-maxHistoryTurns * 2) : [])) {
    if (h && (h.role === "user" || h.role === "assistant") && h.content) {
      messages.push({ role: h.role, content: String(h.content) });
    }
  }
  messages.push({ role: "user", content: String(userMessage || "").slice(0, 4000) });

  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const toolsUsed = [];
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    const data = await callClaude({ key, system, messages, tools, model, maxTokens, temperature });
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

    return { reply: textOf(data.content), usage, model, toolsUsed, iterations };
  }

  return {
    reply: "آسف، حصل تعقيد بسيط — هحوّلك لموظف يتابع معاك.",
    usage, model, toolsUsed, iterations, maxedOut: true,
  };
}
