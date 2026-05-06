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
    label: "💰 بيع جديد للعميل",
    description: "تسجيل customerDelivery — رسالة فورية للعميل + المالك",
    detection: "client (instant) + cron fallback (5-min retry)",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{qty}", "{modelNo}", "{value}", "{date}", "{portalLink}"],
      owner:    ["{customerName}", "{qty}", "{modelNo}", "{value}", "{date}", "{salesperson}"],
    },
  },
  paymentReceived: {
    /* V19.70.7: clearer label — distinguishes from checkPaymentReceived */
    label: "💵 دفعة كاش/تحويل من عميل",
    description: "نقدي/محفظة/انستاباي/تحويل بنكي (تسجيل custPayment) — مش شيكات",
    detection: "client (instant) + cron fallback",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{amount}", "{method}", "{balance}", "{date}", "{portalLink}"],
      owner:    ["{customerName}", "{amount}", "{method}", "{balance}", "{date}"],
    },
  },
  checkPaymentReceived: {
    label: "🏦 دفعة شيكات من عميل",
    description: "شيك واحد أو حافظة — رسالة منفصلة لكل شيك مع ترقيم (شيك X من Y)",
    detection: "client (instant) + cron fallback",
    recipientRoles: ["customer", "owner"],
    variables: {
      /* {batchInfo} = "شيك X من Y" for batches, "" for single checks */
      customer: ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{dueDate}", "{batchInfo}", "{balance}", "{date}"],
      owner:    ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{dueDate}", "{batchInfo}", "{office}", "{balance}", "{date}"],
    },
  },
  /* V19.76.5: outgoing cash/wallet/transfer payment to supplier — mirror of
     paymentReceived but for the supplier side. Fires when a treasury "out"
     entry is saved with category="دفعة مورد" and method != شيكات. */
  supplierPaymentSent: {
    label: "💸 دفعة كاش/تحويل لمورد",
    description: "نقدي/محفظة/انستاباي/تحويل بنكي (تسجيل supplierPayment) — مش شيكات",
    detection: "client (instant) + cron fallback",
    recipientRoles: ["supplier", "owner"],
    variables: {
      supplier: ["{supplierName}", "{amount}", "{method}", "{balance}", "{date}"],
      owner:    ["{supplierName}", "{amount}", "{method}", "{balance}", "{date}", "{office}"],
    },
  },
  /* V19.70.10: outgoing checks to suppliers (شيكات أوراق دفع لمورد). Same UX as
     checkPaymentReceived but the party is a supplier, balance reflects what we
     owe them (after this check, our debt to them decreases). */
  checkPaymentIssued: {
    label: "📤 دفعة شيكات لمورد",
    description: "شيك واحد أو حافظة لمورد — رسالة منفصلة لكل شيك مع ترقيم",
    detection: "client (instant) + cron fallback",
    recipientRoles: ["supplier", "owner"],
    variables: {
      supplier: ["{supplierName}", "{amount}", "{bank}", "{checkNo}", "{dueDate}", "{batchInfo}", "{balance}", "{date}"],
      owner:    ["{supplierName}", "{amount}", "{bank}", "{checkNo}", "{dueDate}", "{batchInfo}", "{office}", "{balance}", "{date}"],
    },
  },
  /* V19.70.10: receivable check status changed → "محصل" (collected). Customer
     gets thank-you notification with check details. */
  checkCollected: {
    label: "✅ تم تحصيل شيك",
    description: "شيك من عميل اتـحصّل (status=محصل) — رسالة شكر للعميل",
    detection: "client (instant on status change) + cron fallback",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{originalDate}", "{collectedDate}", "{balance}"],
      owner:    ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{originalDate}", "{collectedDate}", "{office}", "{balance}"],
    },
  },
  /* V19.70.11: check endorsed (مُظهَّر) to a supplier. Supplier gets the same
     UX as receiving a payment-issued check, BUT we include the original
     customer (drawer) name for traceability. Our debt to the supplier
     decreases by check amount. */
  checkEndorsed: {
    label: "📨 شيك مُظهَّر لمورد",
    description: "شيك من عميل اتـظهّر (status=مُظهَّر) لمورد — رسالة للمورد بتفاصيل الشيك واسم العميل الأصلي",
    detection: "client (instant on status change)",
    recipientRoles: ["supplier", "owner"],
    variables: {
      supplier: ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{dueDate}", "{customerOffice}", "{balance}"],
      owner:    ["{customerName}", "{customerOffice}", "{supplierName}", "{office}", "{amount}", "{bank}", "{checkNo}", "{dueDate}", "{balance}"],
    },
  },
  /* V19.70.11: bounced check re-presented to bank (status: مرتد → معلق).
     Customer gets notification + balance decreases again (check is now active). */
  checkRePresented: {
    label: "🔄 إعادة تقديم شيك مرتد",
    description: "شيك مرتد رجع تحت التحصيل (مرتد → معلق) — رسالة للعميل بإعادة التقديم",
    detection: "client (instant on status change)",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{originalDate}", "{rePresentedDate}", "{balance}"],
      owner:    ["{customerName}", "{office}", "{amount}", "{bank}", "{checkNo}", "{originalDate}", "{rePresentedDate}", "{balance}"],
    },
  },
  /* V19.70.10: receivable check status changed → "مرتد" (bounced). Customer
     gets warning, has to repay. */
  checkBounced: {
    label: "⚠️ شيك مرتد من عميل",
    description: "شيك من عميل ارتد (status=مرتد) — تنبيه للعميل لإعادة السداد",
    detection: "client (instant on status change) + cron fallback",
    recipientRoles: ["customer", "owner"],
    variables: {
      customer: ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{originalDate}", "{bouncedDate}", "{balance}"],
      owner:    ["{customerName}", "{amount}", "{bank}", "{checkNo}", "{originalDate}", "{bouncedDate}", "{office}", "{balance}"],
    },
  },
  lateOrder: {
    label: "⚠️ أوردر متأخر",
    description: "أوردر تجاوز الحد المسموح بدون activity",
    detection: "cron-only (daily scan, one alert per order per day)",
    recipientRoles: ["owner", "customer"],
    variables: {
      owner:    ["{modelNo}", "{customerName}", "{daysLate}", "{lastActivity}"],
      customer: ["{modelNo}", "{daysLate}"],
    },
  },
  checkDue: {
    label: "📅 شيك يستحق قريباً",
    description: "شيك مستحق خلال أيام محدودة (الموجود في المصنع فقط — مش المظهَّر). للمالك دائماً، وللعميل في الـreceivable فقط (تذكير لتغطية الشيك قبل الصرف).",
    detection: "cron-only (daily scan, one alert per check per day per role, status==معلق only)",
    /* V19.70.18: customer added — receivable-only reminder so the drawer covers
       their bank account before we present. The cron logic skips customer for
       payable checks (we're the drawer, not them). */
    recipientRoles: ["owner", "customer"],
    variables: {
      /* V19.70.1: enriched check details — type label, party kind/name/office, notes, category
         V19.70.18: drawerName added — the name on the check, may differ from partyName for 3rd-party checks */
      owner: [
        "{checkType}", "{partyKind}", "{partyName}", "{drawerName}", "{office}",
        "{bank}", "{checkNo}", "{amount}",
        "{dueDate}", "{daysToDue}",
        "{notes}", "{category}",
      ],
      /* Customer-facing template — receivable only. Tells the customer to cover
         the check at their bank before the due date. {drawerName} helps them
         identify which specific check we're talking about (especially when the
         check was drawn on a 3rd party). */
      customer: [
        "{customerName}", "{drawerName}",
        "{bank}", "{checkNo}", "{amount}",
        "{dueDate}", "{daysToDue}",
        "{notes}",
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
     recipientFilter (optional V19.70.18): array of role names ("customer", "owner",
       "supplier", "salesperson") — when provided, only messages for those roles are
       built. Used by checkDue to split customer + owner into separate processEvent
       calls so each has its own idempotencyKey and they don't dedupe each other.
   Output:
     [{ phone, message, role }] — ready for the bridge `/send` call
   Skips disabled events, disabled recipients, and missing phones. */
export function buildEventMessages(eventType, eventCfg, payload, phones, recipientFilter) {
  if (!eventCfg || !eventCfg.enabled) return [];
  const messages = [];
  const tpls = eventCfg.templates || {};
  const recps = eventCfg.recipients || {};
  /* V19.70.18: when recipientFilter is provided, only roles in the list are built.
     `null`/`undefined`/empty → no filtering (legacy behavior). */
  const allow = (Array.isArray(recipientFilter) && recipientFilter.length > 0)
    ? new Set(recipientFilter)
    : null;
  const roleAllowed = (role) => !allow || allow.has(role);

  /* Customer: single phone */
  if (roleAllowed("customer") && recps.customer && tpls.customer && phones.customer) {
    const text = substituteTemplate(tpls.customer, payload);
    if (text.trim()) {
      messages.push({ phone: phones.customer, message: text, role: "customer" });
    }
  }

  /* V19.70.10: Supplier: single phone (for checkPaymentIssued) */
  if (roleAllowed("supplier") && recps.supplier && tpls.supplier && phones.supplier) {
    const text = substituteTemplate(tpls.supplier, payload);
    if (text.trim()) {
      messages.push({ phone: phones.supplier, message: text, role: "supplier" });
    }
  }

  /* Owner: 0..N phones (multiple owners possible) */
  if (roleAllowed("owner") && recps.owner && tpls.owner && Array.isArray(phones.owner)) {
    const text = substituteTemplate(tpls.owner, payload);
    if (text.trim()) {
      for (const p of phones.owner) {
        if (p) messages.push({ phone: p, message: text, role: "owner" });
      }
    }
  }

  /* Salesperson: 0..1 phone */
  if (roleAllowed("salesperson") && recps.salesperson && tpls.salesperson && phones.salesperson) {
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
    saleCompleted:        ["customerName", "qty", "modelNo", "value"],
    paymentReceived:      ["customerName", "amount"],
    supplierPaymentSent:  ["supplierName", "amount"],
    checkPaymentReceived: ["customerName", "amount", "bank", "checkNo"],
    checkPaymentIssued:   ["supplierName", "amount", "bank", "checkNo"],
    checkCollected:       ["customerName", "amount", "bank", "checkNo"],
    checkBounced:         ["customerName", "amount", "bank", "checkNo"],
    checkEndorsed:        ["customerName", "supplierName", "amount", "bank", "checkNo"],
    checkRePresented:     ["customerName", "amount", "bank", "checkNo"],
    lateOrder:            ["modelNo", "customerName", "daysLate"],
    checkDue:             ["bank", "checkNo", "amount", "dueDate", "daysToDue"],
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
  /* V19.76.5: supplier-side mirror of paymentReceived */
  supplierPaymentSent: {
    supplier: "✅ *تم إرسال دفعة*\nالقيمة: {amount} ج.م\nالطريقة: {method}\nالرصيد المتبقي: {balance} ج.م\nالتاريخ: {date}\n\nشكراً لتعاملكم 🌟",
    owner: "💸 *دفعة لمورد*\n{supplierName}: {amount} ج.م ({method})\nالرصيد المتبقي: {balance} ج.م",
  },
  checkPaymentReceived: {
    customer: "🏦 *تم استلام شيك* {batchInfo}\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لك 🌟",
    owner: "🏦 *شيك من عميل* {batchInfo}\n\n{customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nالاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م",
  },
  checkPaymentIssued: {
    supplier: "📤 *تم إصدار شيك* {batchInfo}\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لتعاملكم 🌟",
    owner: "📤 *شيك لمورد* {batchInfo}\n\n{supplierName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nالاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م",
  },
  checkCollected: {
    customer: "✅ *تم تحصيل الشيك بنجاح*\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الشيك: {originalDate}\nتاريخ التحصيل: {collectedDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لتعاملكم 🌟",
    owner: "✅ *تم تحصيل شيك*\n\nالعميل: {customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ التحصيل: {collectedDate}\nالرصيد المتبقي للعميل: {balance} ج.م",
  },
  checkBounced: {
    customer: "⚠️ *شيك مرتد*\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الشيك: {originalDate}\nتاريخ الارتداد: {bouncedDate}\nالرصيد المستحق: {balance} ج.م\n\nيرجى التواصل معنا فوراً للسداد.",
    owner: "⚠️ *شيك مرتد من عميل*\n\nالعميل: {customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الارتداد: {bouncedDate}\nالرصيد المستحق: {balance} ج.م",
  },
  /* V19.70.11: endorsed check — supplier receives check originally drawn by a customer */
  checkEndorsed: {
    supplier: "📨 *شيك مُظهَّر إليكم*\n\nالعميل (صاحب الشيك): {customerName}\nمكتب العميل: {customerOffice}\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الاستحقاق: {dueDate}\nالرصيد المتبقي: {balance} ج.م\n\nشكراً لتعاملكم 🌟",
    owner: "📨 *تم تظهير شيك لمورد*\n\nمن العميل: {customerName} ({customerOffice})\nإلى المورد: {supplierName} ({office})\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nالاستحقاق: {dueDate}\nالرصيد المتبقي للمورد: {balance} ج.م",
  },
  /* V19.70.11: bounced check re-presented to bank */
  checkRePresented: {
    customer: "🔄 *إعادة تقديم شيك للبنك*\n\nالبنك: {bank}\nرقم الشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ الشيك الأصلي: {originalDate}\nتاريخ إعادة التقديم: {rePresentedDate}\nالرصيد المستحق: {balance} ج.م\n\nسيتم تحصيل الشيك مرة أخرى من البنك.",
    owner: "🔄 *إعادة تقديم شيك مرتد*\n\nالعميل: {customerName} — {office}\nالبنك: {bank}\nالشيك: {checkNo}\nالقيمة: {amount} ج.م\nتاريخ إعادة التقديم: {rePresentedDate}\nالرصيد المستحق: {balance} ج.م",
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
    supplierPaymentSent: {
      supplierName: "شركة النسيج", amount: 12000, method: "تحويل بنكي",
      balance: 18000, office: "شركة النسيج المصرية", date: today,
    },
    checkPaymentReceived: {
      customerName: "أحمد محمد", amount: 5000,
      bank: "بنك مصر", checkNo: "12345678", dueDate: today,
      batchInfo: "(شيك 1 من 3)",
      office: "مؤسسة الأمل للملابس",
      balance: 7500, date: today,
    },
    checkPaymentIssued: {
      supplierName: "شركة النسيج", amount: 45000,
      bank: "البنك الأهلي", checkNo: "87654321", dueDate: today,
      batchInfo: "(شيك 1 من 2)",
      office: "شركة النسيج المصرية",
      balance: 30000, date: today,
    },
    checkCollected: {
      customerName: "أحمد محمد", amount: 5000,
      bank: "بنك مصر", checkNo: "12345678",
      originalDate: "2026-04-01", collectedDate: today,
      office: "مؤسسة الأمل للملابس",
      balance: 2500,
    },
    checkBounced: {
      customerName: "أحمد محمد", amount: 5000,
      bank: "بنك مصر", checkNo: "12345678",
      originalDate: "2026-04-01", bouncedDate: today,
      office: "مؤسسة الأمل للملابس",
      balance: 7500,
    },
    checkEndorsed: {
      customerName: "أحمد محمد", supplierName: "شركة النسيج",
      amount: 5000, bank: "بنك مصر", checkNo: "12345678", dueDate: today,
      customerOffice: "مؤسسة الأمل للملابس",
      office: "شركة النسيج المصرية",
      balance: 30000,
    },
    checkRePresented: {
      customerName: "أحمد محمد", amount: 5000,
      bank: "بنك مصر", checkNo: "12345678",
      originalDate: "2026-04-01", rePresentedDate: today,
      office: "مؤسسة الأمل للملابس",
      balance: 2500,
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
