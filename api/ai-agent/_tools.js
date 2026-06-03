/* ════════════════════════════════════════════════════════════════════════
   AI AGENT — Tool registry + executor   (Slice 6+ / V21.9.229)
   ════════════════════════════════════════════════════════════════════════
   Each tool = { schema (Anthropic tool-use format), run(input, ctx) }.
   getToolSchemas(agent) → the schemas for IMPLEMENTED tools that aren't
   explicitly disabled in config.aiAgent.tools. executeTool(name,input,ctx)
   dispatches. ctx = { db, wid, phone, customer:{id,name,type}, agent, bridge }.

   ALL tools are READ-ONLY on business data — the only writes allowed are to
   the agent's own aiAgent* collections (e.g. escalations). Data tools
   (balance/statement/search/orders) are added in later slices.
   ════════════════════════════════════════════════════════════════════════ */
import { sendViaBridge } from "./_bridge.js";

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ── escalate_to_human ───────────────────────────────────────────────── */
const escalate_to_human = {
  schema: {
    name: "escalate_to_human",
    description: "حوّل المحادثة لموظف بشري فوراً. استخدمها لو: شكوى جودة، عميل غاضب أو غير راضي، طلب كبير (أكتر من 100 ألف)، طلب تعديل فاتورة قائمة، أو أي حاجة خارج قدرتك أو تحتاج قرار بشري. بعد ما تستخدمها، طمّن العميل إن المسؤول هيتابع معاه قريباً.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "سبب التحويل باختصار (بالعربي)" },
        urgency: { type: "string", enum: ["low", "medium", "high"], description: "درجة الإلحاح" },
      },
      required: ["reason"],
    },
  },
  async run(input, ctx) {
    const { db, wid, phone, customer, agent, bridge } = ctx;
    const reason = String(input.reason || "").slice(0, 500);
    const urgency = ["low", "medium", "high"].includes(input.urgency) ? input.urgency : "medium";
    const nowISO = new Date().toISOString();
    /* 1. write the escalation (agent's own collection — allowed) */
    try {
      await db.collection("aiAgentEscalations").add({
        id: newId(), wid: wid || "", phone: phone || "",
        customerName: customer?.name || "", customerId: customer?.id || "",
        reason, urgency, status: "open", at: nowISO, createdAt: nowISO,
      });
    } catch (e) { console.error("[agent/escalate] write failed:", e?.message || e); }
    /* 2. notify the human team via the bridge (best-effort) */
    try {
      const esc = (agent && agent.escalation) || {};
      const notify = String(esc.supportPhone || esc.salesTeamPhone || "").replace(/[^0-9]/g, "");
      if (notify && bridge && bridge.url) {
        const msg = String(esc.template || "🆘 تحويل عاجل\n👤 {customerName} | 📞 {phone}\n💬 {reason}")
          .replace(/{customerName}/g, customer?.name || "عميل غير معروف")
          .replace(/{phone}/g, phone || wid || "")
          .replace(/{tier}/g, customer?.type || "")
          .replace(/{stage}/g, "")
          .replace(/{reason}/g, reason) + `\n(إلحاح: ${urgency})`;
        await sendViaBridge(bridge.url, bridge.token, notify, msg, "تحويل عاجل");
      }
    } catch (e) { console.warn("[agent/escalate] notify failed:", e?.message || e); }
    return `تم تسجيل التحويل لموظف بشري (إلحاح: ${urgency}). طمّن العميل إن المسؤول هيتابع معاه قريباً، ومتحاولش تحل الطلب ده بنفسك.`;
  },
};

const REGISTRY = {
  escalate_to_human,
  /* later slices register: get_customer_balance, get_customer_orders,
     get_order_status, generate_statement_pdf, generate_portal_link,
     search_products, notify_sales_team ... */
};

/* Schemas for implemented tools not explicitly disabled in config */
export function getToolSchemas(agent) {
  const cfg = (agent && agent.tools) || {};
  return Object.keys(REGISTRY)
    .filter((name) => cfg[name]?.enabled !== false)
    .map((name) => REGISTRY[name].schema);
}

export async function executeTool(name, input, ctx) {
  const t = REGISTRY[name];
  if (!t) return "أداة غير معروفة: " + name;
  return await t.run(input || {}, ctx);
}
