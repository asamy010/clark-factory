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
import { signCustomerIdWithTs } from "../customer-portal.js";

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "https://clark-factory.vercel.app").replace(/\/+$/, "");

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

/* ── generate_portal_link ────────────────────────────────────────────────
   Safest "data" tool: instead of quoting a balance (risky), hand the customer
   a secure signed link to THEIR portal — which already shows the accurate
   statement / balance / orders / payments. The agent never states a number.
   Reuses the production signer (signCustomerIdWithTs). Requires a recognized
   customer (never generate someone else's link). */
const generate_portal_link = {
  schema: {
    name: "generate_portal_link",
    description: "ولّد رابط آمن وشخصي للعميل يفتح بوابته (كشف الحساب، الرصيد الحالي، الطلبات، الدفعات بالتفصيل). استخدمها لو العميل طلب كشف حسابه أو رصيده أو طلباته أو دفعاته. ⚠️ متقولش رقم رصيد من عندك أبداً — ابعتله الرابط ده. شغّالة بس لو العميل متعرّف عليه.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  async run(_input, ctx) {
    const { customer } = ctx;
    if (!customer || !customer.id) {
      return "العميل مش متعرّف عليه — مينفعش نولّد رابط شخصي (حماية للبيانات). اطلب منه اسمه/اسم الشركة، أو حوّله لموظف للتأكد من هويته.";
    }
    try {
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = signCustomerIdWithTs(customer.id, ts);
      const url = `${PUBLIC_BASE}/?p=c&i=${encodeURIComponent(customer.id)}&t=${ts}&s=${encodeURIComponent(sig)}`;
      return `رابط بوابة العميل (صالح ٩٠ يوم): ${url}\nابعت الرابط ده للعميل — هيلاقي فيه كشف حسابه ورصيده الحالي وطلباته ودفعاته بالتفصيل. متقولش الرصيد بنفسك، الرابط بيوريه كل حاجة محدّثة.`;
    } catch (e) {
      return "حصل خطأ في توليد رابط البوابة: " + (e?.message || e) + ". حوّل العميل لموظف.";
    }
  },
};

/* ── search_products ─────────────────────────────────────────────────────
   Catalog search — SAFE (reads only config.catalog, no business data). The
   system prompt only carries the first ~40 products, so this lets the agent
   answer about the rest of the range. Matches name/code/category/fabric/color
   (color name = c.color per CLAUDE.md §4). One query → up to 8 matches with
   price + sizes + colors. ctx.catalog is injected by incoming.js. */
const search_products = {
  schema: {
    name: "search_products",
    description: "دوّر في كتالوج المصنع عن موديلات بالاسم أو الكود أو النوع أو الخامة أو اللون. استخدمها لو العميل سأل عن موديل أو نوع منتج أو خامة معيّنة، أو طلب موديل بالاسم/الكود بالظبط (هترجّع تفاصيله). بترجّع لحد ٨ نتائج بالاسم والسعر والمقاسات والألوان. متخترعش منتج مش في النتائج.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "كلمة البحث: اسم/كود/نوع/خامة/لون الموديل" } },
      required: ["query"],
    },
  },
  async run(input, ctx) {
    const cat = Array.isArray(ctx && ctx.catalog) ? ctx.catalog : [];
    const q = String(input.query || "").trim().toLowerCase();
    if (!q) return "اكتب كلمة بحث (اسم موديل / كود / نوع / خامة / لون).";
    if (!cat.length) return "الكتالوج فاضي حالياً — مفيش منتجات متسجّلة. حوّل العميل لموظف لو محتاج.";
    const colorsOf = (p) => (Array.isArray(p.colors) ? p.colors : []).map((c) => (typeof c === "string" ? c : (c && c.color) || "")).filter(Boolean);
    const hay = (p) => [p.name, p.nameEn, p.code, p.category, ...(Array.isArray(p.fabrics) ? p.fabrics : []), ...colorsOf(p)]
      .filter(Boolean).join(" ").toLowerCase();
    const hits = cat.filter((p) => p && hay(p).includes(q)).slice(0, 8);
    if (!hits.length) return `مفيش نتائج لـ «${input.query}» في الكتالوج. جرّب كلمة تانية، أو اسأل العميل يوضّح الموديل، أو حوّله لموظف.`;
    const lines = hits.map((p) => {
      const bits = [String(p.name || p.code || "").trim()];
      if (p.category) bits.push(String(p.category));
      if (p.priceWholesale) bits.push(`جملة: ${p.priceWholesale} ج`);
      if (Array.isArray(p.sizes) && p.sizes.length) bits.push(`مقاسات: ${p.sizes.join("، ")}`);
      const cols = colorsOf(p);
      if (cols.length) bits.push(`ألوان: ${cols.join("، ")}`);
      if (p.minOrderQty) bits.push(`أقل طلب: ${p.minOrderQty}`);
      if (p.inStock === false) bits.push("⚠️ مش متوفر حالياً");
      return "• " + bits.filter(Boolean).join(" · ");
    });
    return `لقيت ${hits.length} نتيجة في الكتالوج:\n${lines.join("\n")}\n(اعرض اللي يهم العميل بصياغتك، ومتقولش أسعار غير دي.)`;
  },
};

const REGISTRY = {
  escalate_to_human,
  generate_portal_link,
  search_products,
  /* Customer account/order/balance reads are intentionally served by
     generate_portal_link (secure signed portal) rather than re-implemented
     here — see CLAUDE.md / handoff §5.B7 (never re-state money server-side). */
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
