/* ═══════════════════════════════════════════════════════════════════════
   CLARK Automation · Event Builder (V19.70)
   ───────────────────────────────────────────────────────────────────────
   Pure functions for event-driven WhatsApp messages.

   Two responsibilities:
     1. Validate an event payload (does it have the required fields?)
     2. Build the message text by substituting template variables.

   Used by both:
     - The client (when an event happens, build the message + queue or send)
     - The api/ endpoint (when cron-detected events fire)

   Variables per event type — keep these in sync with EVENT_VARIABLES below
   if you change anything. The UI uses EVENT_VARIABLES to show the variable
   hint to the user.
   ═══════════════════════════════════════════════════════════════════════ */

const _r0 = (n) => Math.round(Number(n) || 0);
const _fmt = (n) => _r0(n).toLocaleString("en-US");
const _money = (n) => _fmt(n) + " ج.م";

/* ── Per-event metadata: what variables each event type supports ──
   The UI uses this to render the "Available variables" hint per event +
   recipient. The keys match the placeholders inside templates ({varName}). */
export const EVENT_VARIABLES = {
  saleCompleted: {
    label: "💰 Sale Completed",
    description: "بيع جديد للعميل (تسجيل customerDelivery)",
    detection: "client (instant) + cron fallback (5-min retry)",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{qty}", "{modelNo}", "{value}", "{date}", "{portalLink}"],
      owner:    ["{customerName}", "{qty}", "{modelNo}", "{value}", "{date}", "{salesperson}"],
    },
  },
  paymentReceived: {
    label: "💵 Payment Received",
    description: "دفعة جديدة من عميل (تسجيل custPayment)",
    detection: "client (instant) + cron fallback",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{amount}", "{method}", "{balance}", "{date}", "{portalLink}"],
      owner:    ["{customerName}", "{amount}", "{method}", "{balance}", "{date}"],
    },
  },
  lateOrder: {
    label: "⚠️ Late Order",
    description: "أوردر تجاوز الحد المسموح بدون activity",
    detection: "cron-only (daily scan, one alert per order per day)",
    recipientRoles: ["owner", "customer"],
    variables: {
      owner:    ["{modelNo}", "{customerName}", "{daysLate}", "{lastActivity}"],
      customer: ["{modelNo}", "{daysLate}"],
    },
  },
  checkDue: {
    label: "📅 Check Due",
    description: "شيك مستحق خلال أيام محدودة (الموجود في المصنع فقط — مش المظهَّر)",
    detection: "cron-only (daily scan, one alert per check per day, status==معلق only)",
    recipientRoles: ["owner"],
    variables: {
      /* V19.70.1: enriched check details — type label, party kind/name/office, notes, category */
      owner: [
        "{checkType}", "{partyKind}", "{partyName}", "{office}",
        "{bank}", "{checkNo}", "{amount}",
        "{dueDate}", "{daysToDue}",
        "{notes}", "{category}",
      ],
    },
  },
};

/* ── Substitute {var} placeholders with payload values ──
   Unknown placeholders are left as-is so the user can spot them in preview.
   Numeric values are formatted with thousand separators ("12,500") but NOT
   currency-suffixed — the template owner controls the currency string ("ج.م").
   This avoids the V19.70.0 bug where templates with "{amount} ج.م" rendered
   as "12,500 ج.م ج.م" (double currency). */
export function substituteTemplate(template, payload, variables) {
  if (!template || typeof template !== "string") return "";
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) return match;
    const v = payload[key];
    if (v === null || v === undefined) return "";
    /* Numeric fields → format with thousand separators (no currency suffix) */
    if (key === "value" || key === "amount" || key === "balance"
     || key === "qty"   || key === "daysLate" || key === "daysToDue") return _fmt(v);
    return String(v);
  });
}

/* ── Build messages for one event ──
   Inputs:
     eventType:  "saleCompleted" | "paymentReceived" | "lateOrder" | "checkDue"
     eventCfg:   data.automation.eventTriggers.events[eventType]
     payload:    event-specific data (customerName, qty, etc.)
     phones:     { customer?: string, owner?: string[] } — resolved phones
   Output:
     [{ phone, message, role }] — ready for the bridge `/send` call
   Skips disabled events, disabled recipients, and missing phones. */
export function buildEventMessages(eventType, eventCfg, payload, phones) {
  if (!eventCfg || !eventCfg.enabled) return [];
  const messages = [];
  const tpls = eventCfg.templates || {};
  const recps = eventCfg.recipients || {};

  /* Customer: single phone */
  if (recps.customer && tpls.customer && phones.customer) {
    const text = substituteTemplate(tpls.customer, payload);
    if (text.trim()) {
      messages.push({ phone: phones.customer, message: text, role: "customer" });
    }
  }

  /* Owner: 0..N phones (multiple owners possible) */
  if (recps.owner && tpls.owner && Array.isArray(phones.owner)) {
    const text = substituteTemplate(tpls.owner, payload);
    if (text.trim()) {
      for (const p of phones.owner) {
        if (p) messages.push({ phone: p, message: text, role: "owner" });
      }
    }
  }

  /* Salesperson: 0..1 phone */
  if (recps.salesperson && tpls.salesperson && phones.salesperson) {
    const text = substituteTemplate(tpls.salesperson, payload);
    if (text.trim()) {
      messages.push({ phone: phones.salesperson, message: text, role: "salesperson" });
    }
  }

  return messages;
}

/* ── Validate a payload has required fields for the event type ──
   Returns { ok, missing[] }. */
export function validateEventPayload(eventType, payload) {
  const required = {
    saleCompleted:    ["customerName", "qty", "modelNo", "value"],
    paymentReceived:  ["customerName", "amount"],
    lateOrder:        ["modelNo", "customerName", "daysLate"],
    checkDue:         ["bank", "checkNo", "amount", "dueDate", "daysToDue"],
  }[eventType] || [];
  const missing = required.filter(k => payload[k] === undefined || payload[k] === null || payload[k] === "");
  return { ok: missing.length === 0, missing };
}

/* ── Default templates (for seeding new configs / "reset to default" UI) ──
   Mirror of DEFAULT_AUTOMATION_CONFIG.eventTriggers.events[X].templates. */
export const DEFAULT_EVENT_TEMPLATES = {
  saleCompleted: {
    customer: "شكراً {customerName} 🌟\nتم تسليم {qty} قطعة من {modelNo} بقيمة {value} ج.م.\n\nراجع حسابك: {portalLink}",
    owner: "💰 *بيع جديد*\nالعميل: {customerName}\nالموديل: {modelNo}\nالكمية: {qty} قطعة\nالقيمة: {value} ج.م\nالتاريخ: {date}",
  },
  paymentReceived: {
    customer: "✅ *تم استلام دفعة*\nالقيمة: {amount} ج.م\nالطريقة: {method}\nالرصيد المتبقي: {balance} ج.م\nالتاريخ: {date}\n\nشكراً لك 🌟",
    owner: "💵 *دفعة من عميل*\n{customerName}: {amount} ج.م ({method})\nالرصيد المتبقي: {balance} ج.م",
  },
  lateOrder: {
    owner: "⚠️ *أوردر متأخر*\nالموديل: {modelNo}\nالعميل: {customerName}\nأيام بدون activity: {daysLate}\nآخر نشاط: {lastActivity}",
    customer: "نعتذر عن التأخير في تسليم الموديل {modelNo}، نحن نعمل على تسريع الإنتاج.",
  },
  checkDue: {
    owner: "📅 *{checkType} يستحق قريباً*\n\n👤 {partyKind}: {partyName}\n🏢 المكتب: {office}\n🏦 البنك: {bank}\n#️⃣ رقم الشيك: {checkNo}\n💰 القيمة: {amount} ج.م\n📆 تاريخ الاستحقاق: {dueDate}\n⏱ بعد {daysToDue} يوم\n📝 {notes}",
  },
};

/* ── Build a "preview" event payload for testing the templates in the UI ──
   Returns realistic-looking dummy data so the preview shows what real
   substituted output looks like. */
export function samplePayload(eventType) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    saleCompleted: {
      customerName: "أحمد محمد", qty: 50, modelNo: "S26-001", value: 12500,
      date: today, portalLink: "https://app.../portal?p=c&i=...&s=...",
      salesperson: "محمد حسام",
    },
    paymentReceived: {
      customerName: "أحمد محمد", amount: 5000, method: "تحويل بنكي",
      balance: 7500, date: today, portalLink: "https://app.../portal?p=c&i=...",
    },
    lateOrder: {
      modelNo: "S26-007", customerName: "شركة النور",
      daysLate: 12, lastActivity: "2026-04-23",
    },
    checkDue: {
      checkType: "ورقة قبض (من عميل)",
      partyKind: "العميل",
      partyName: "أحمد محمد",
      office: "مؤسسة الأمل للملابس",
      bank: "بنك مصر",
      checkNo: "12345678",
      amount: 8500,
      dueDate: today,
      daysToDue: 2,
      notes: "دفعة على الفاتورة #INV-2026-001",
      category: "دفعة عميل",
      kindLabel: "العميل",
    },
  }[eventType] || {};
}
