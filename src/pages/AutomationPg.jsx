/* ═══════════════════════════════════════════════════════════════════════
   CLARK · AutomationPg.jsx (V19.68)
   ───────────────────────────────────────────────────────────────────────
   Automation hub. Currently:
     • Daily Report (toggle sections + recipients + manual "Send Test Now")
     • Recipients management
     • History (last 50 sends)

   The actual scheduling lives outside the client (V19.69 — VPS cron job
   that calls /api/automation-tick on a schedule). This page is the
   configuration + manual-trigger surface.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect, useRef } from "react";
import { Btn, Card, Sel, Inp, DelBtn } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { gid } from "../utils/format.js";
import { ask, showToast } from "../utils/popups.js";
import { buildDailyReport, DEFAULT_AUTOMATION_CONFIG, DEFAULT_DAILY_TEMPLATE, DAILY_REPORT_VARIABLES } from "../utils/automation/buildDailyReport.js";
import {
  EVENT_VARIABLES,
  DEFAULT_EVENT_TEMPLATES,
  substituteTemplate,
  samplePayload,
} from "../utils/automation/eventBuilder.js";

const DEFAULT_BRIDGE_URL = "http://localhost:3001";

/* V21.9.184: timezone preset list for the quiet-hours/daily-report
   scheduling. Common IANA names for the regions CLARK is most likely to
   deploy in. Any IANA timezone is accepted via the "مخصص" free-text input
   that appears when the user picks "__custom" from the select. */
const AUTOMATION_TZ_PRESETS = [
  { value: "Africa/Cairo",     label: "🇪🇬 مصر (Africa/Cairo) — UTC+2" },
  { value: "Asia/Riyadh",      label: "🇸🇦 الرياض (Asia/Riyadh) — UTC+3" },
  { value: "Asia/Dubai",       label: "🇦🇪 دبي (Asia/Dubai) — UTC+4" },
  { value: "Asia/Kuwait",      label: "🇰🇼 الكويت (Asia/Kuwait) — UTC+3" },
  { value: "Asia/Qatar",       label: "🇶🇦 قطر (Asia/Qatar) — UTC+3" },
  { value: "Asia/Bahrain",     label: "🇧🇭 البحرين (Asia/Bahrain) — UTC+3" },
  { value: "Asia/Muscat",      label: "🇴🇲 مسقط (Asia/Muscat) — UTC+4" },
  { value: "Asia/Amman",       label: "🇯🇴 عمان (Asia/Amman) — UTC+3 (DST)" },
  { value: "Asia/Beirut",      label: "🇱🇧 بيروت (Asia/Beirut) — UTC+2 (DST)" },
  { value: "Asia/Damascus",    label: "🇸🇾 دمشق (Asia/Damascus) — UTC+3 (DST)" },
  { value: "Africa/Casablanca", label: "🇲🇦 الدار البيضاء (Africa/Casablanca) — UTC+1 (DST)" },
  { value: "Africa/Algiers",   label: "🇩🇿 الجزائر (Africa/Algiers) — UTC+1" },
  { value: "Africa/Tunis",     label: "🇹🇳 تونس (Africa/Tunis) — UTC+1" },
  { value: "Africa/Khartoum",  label: "🇸🇩 الخرطوم (Africa/Khartoum) — UTC+2" },
  { value: "Europe/Istanbul",  label: "🇹🇷 إسطنبول (Europe/Istanbul) — UTC+3" },
  { value: "UTC",              label: "🌐 UTC" },
];

/* Helper: send a single message via the WhatsApp bridge directly from the client.
   Used by the manual "Send Test Now" button. The scheduled flow (V19.69) goes
   through the VPS cron → /api/automation-tick which calls the bridge directly,
   bypassing the client entirely. */
async function bridgeSend(bridgeUrl, bridgeToken, messages){
  const url = (bridgeUrl || DEFAULT_BRIDGE_URL).replace(/\/+$/, "") + "/send";
  const headers = { "Content-Type": "application/json" };
  if (bridgeToken) headers["Authorization"] = "Bearer " + bridgeToken;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  } finally { clearTimeout(timer); }
}

async function bridgeStatus(bridgeUrl, bridgeToken){
  const url = (bridgeUrl || DEFAULT_BRIDGE_URL).replace(/\/+$/, "") + "/status";
  const headers = {};
  if (bridgeToken) headers["Authorization"] = "Bearer " + bridgeToken;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    return await r.json();
  } catch(e){ return { ok:false, error: e.message }; }
  finally { clearTimeout(timer); }
}

/* Normalize Egyptian phone — strip non-digits, prepend +20 if missing. */
function normalizePhone(p){
  const s = String(p || "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  return d ? "+2" + d : "";
}

const SECTION_LABELS = {
  sales:      { label: "المبيعات",      icon: "💰" },
  purchases:  { label: "المشتريات",     icon: "🛒" },
  treasury:   { label: "الخزنة",        icon: "💵" },
  production: { label: "التشغيل",       icon: "🏭" },
  alerts:     { label: "التحذيرات",     icon: "⚠️" },
  tasks:      { label: "المهام",        icon: "📋" },
  comparison: { label: "المقارنة (أسبوع)", icon: "📊" },
};

export function AutomationPg({ data, upConfig, isMob, user }){
  const [tab, setTab] = useState("dailyReport");/* dailyReport | recipients | history | preview */
  const [previewText, setPreviewText] = useState("");
  /* V19.80.15: live-resolved variables for the inline template preview */
  const [previewVars, setPreviewVars] = useState({});
  const [busy, setBusy] = useState(false);

  const automation = data.automation || DEFAULT_AUTOMATION_CONFIG;
  const dailyReport = automation.dailyReport || DEFAULT_AUTOMATION_CONFIG.dailyReport;
  const recipients = automation.recipients || [];
  const history = automation.history || [];

  /* Bridge config — re-uses existing campaignBridge (set up in CampaignsPg). */
  const bridgeCfg = data.campaignBridge || {};
  const bridgeUrl = bridgeCfg.url || "";
  const bridgeToken = bridgeCfg.token || "";

  const userEmail = user?.email || "";

  /* Recipients picker for daily report — list of phones who get it.
     Defaults to all stored recipients if not set explicitly. */
  const reportRecipientsList = useMemo(() => {
    const subscribed = recipients.filter(r =>
      !r.subscribedReports || r.subscribedReports.includes("dailyReport")
    );
    return subscribed.map(r => ({ name: r.name, phone: normalizePhone(r.phone) })).filter(r => r.phone);
  }, [recipients]);

  const updateAutomation = (mutator) => {
    upConfig(d => {
      if (!d.automation) d.automation = JSON.parse(JSON.stringify(DEFAULT_AUTOMATION_CONFIG));
      mutator(d.automation);
    });
  };

  const toggleSection = (key) => {
    updateAutomation(a => {
      if (!a.dailyReport) a.dailyReport = { ...DEFAULT_AUTOMATION_CONFIG.dailyReport };
      if (!a.dailyReport.sections) a.dailyReport.sections = {};
      a.dailyReport.sections[key] = !a.dailyReport.sections[key];
    });
  };

  const setReportField = (field, value) => {
    updateAutomation(a => {
      if (!a.dailyReport) a.dailyReport = { ...DEFAULT_AUTOMATION_CONFIG.dailyReport };
      a.dailyReport[field] = value;
    });
  };

  const setAlertThreshold = (key, value) => {
    updateAutomation(a => {
      if (!a.dailyReport) a.dailyReport = { ...DEFAULT_AUTOMATION_CONFIG.dailyReport };
      if (!a.dailyReport.alertThresholds) a.dailyReport.alertThresholds = {};
      a.dailyReport.alertThresholds[key] = Math.max(0, Number(value) || 0);
    });
  };
  /* V21.9.151: Quiet Hours — owner-targeted events get dropped during these hours.
     System-wide setting (applies across all event types). */
  const quietHours = automation.quietHours || { enabled: false, start: "21:00", end: "08:00" };
  const setQuietHoursField = (field, value) => updateAutomation(a => {
    if (!a.quietHours) a.quietHours = { enabled: false, start: "21:00", end: "08:00" };
    a.quietHours[field] = value;
  });
  /* V21.9.184: top-level automation timezone — applies to BOTH quiet hours
     window AND daily-report scheduled-send time. Default "Africa/Cairo"
     keeps existing behavior. Setter is at automation level (not inside
     quietHours) because the same tz drives multiple schedules. */
  const automationTz = automation.timezone || "Africa/Cairo";
  const setAutomationTz = (tz) => updateAutomation(a => { a.timezone = tz || "Africa/Cairo"; });

  /* ── V19.70: Event Triggers state + helpers ── */
  const eventTriggers = automation.eventTriggers || DEFAULT_AUTOMATION_CONFIG.eventTriggers;
  const ensureTriggers = (a) => {
    if (!a.eventTriggers) {
      a.eventTriggers = JSON.parse(JSON.stringify(DEFAULT_AUTOMATION_CONFIG.eventTriggers));
    }
    return a.eventTriggers;
  };
  const ensureEvent = (et, eventType) => {
    if (!et.events) et.events = {};
    if (!et.events[eventType]) {
      et.events[eventType] = JSON.parse(JSON.stringify(
        DEFAULT_AUTOMATION_CONFIG.eventTriggers.events[eventType] || {}));
    }
    return et.events[eventType];
  };
  const setTriggerMode = (mode) => updateAutomation(a => {
    ensureTriggers(a).mode = mode === "manual" ? "manual" : "auto";
  });
  const toggleEvent = (eventType) => updateAutomation(a => {
    const et = ensureTriggers(a); const ev = ensureEvent(et, eventType);
    ev.enabled = !ev.enabled;
    /* V19.70.2: set enabledAt every time the user toggles ON. The scan filters
       skip any entity created before this timestamp — prevents backfill of
       historical entries when first enabling (or re-enabling) a trigger. */
    if (ev.enabled) ev.enabledAt = new Date().toISOString();
  });
  const toggleEventRecipient = (eventType, role) => updateAutomation(a => {
    const et = ensureTriggers(a); const ev = ensureEvent(et, eventType);
    if (!ev.recipients) ev.recipients = {};
    ev.recipients[role] = !ev.recipients[role];
  });
  const setEventTemplate = (eventType, role, value) => updateAutomation(a => {
    const et = ensureTriggers(a); const ev = ensureEvent(et, eventType);
    if (!ev.templates) ev.templates = {};
    ev.templates[role] = String(value || "");
  });
  const setEventThreshold = (eventType, days) => updateAutomation(a => {
    const et = ensureTriggers(a); const ev = ensureEvent(et, eventType);
    ev.thresholdDays = Math.max(1, Math.min(60, Number(days) || 1));
  });
  /* V21.9.150: Min-value filter — owner only gets the event if payload value/amount
     >= this threshold. Customer/supplier always get notified (they're the party
     transacting). 0 (or missing) = no filter. */
  const setEventMinValue = (eventType, role, value) => updateAutomation(a => {
    const et = ensureTriggers(a); const ev = ensureEvent(et, eventType);
    if (!ev.minValueFilter) ev.minValueFilter = {};
    const n = Math.max(0, Number(value) || 0);
    if (n > 0) ev.minValueFilter[role] = n;
    else delete ev.minValueFilter[role];
  });
  const resetEventTemplate = (eventType, role) => updateAutomation(a => {
    const et = ensureTriggers(a); const ev = ensureEvent(et, eventType);
    if (!ev.templates) ev.templates = {};
    const def = DEFAULT_EVENT_TEMPLATES[eventType];
    if (def && def[role]) ev.templates[role] = def[role];
  });
  const addOwnerPhone = (phone) => {
    const p = normalizePhone(phone);
    if (!p) { showToast("⚠️ رقم غير صالح"); return; }
    updateAutomation(a => {
      const et = ensureTriggers(a);
      if (!Array.isArray(et.ownerPhones)) et.ownerPhones = [];
      if (et.ownerPhones.includes(p)) { showToast("⚠️ الرقم موجود"); return; }
      et.ownerPhones.push(p);
    });
  };
  const removeOwnerPhone = (idx) => updateAutomation(a => {
    const et = ensureTriggers(a);
    if (Array.isArray(et.ownerPhones)) et.ownerPhones.splice(idx, 1);
  });
  const discardPending = (id) => updateAutomation(a => {
    const et = ensureTriggers(a);
    et.pending = (et.pending || []).filter(p => p.id !== id);
  });

  /* Recipients CRUD */
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const addRecipient = () => {
    const n = newName.trim();
    const p = normalizePhone(newPhone);
    if (!n || !p) { showToast("⚠️ ادخل اسم ورقم"); return; }
    if (recipients.some(r => normalizePhone(r.phone) === p)) {
      showToast("⚠️ هذا الرقم موجود بالفعل");
      return;
    }
    updateAutomation(a => {
      if (!Array.isArray(a.recipients)) a.recipients = [];
      a.recipients.push({
        id: gid(),
        name: n,
        phone: p,
        subscribedReports: ["dailyReport"],
        addedAt: new Date().toISOString(),
        addedBy: userEmail || "system",
      });
    });
    setNewName(""); setNewPhone("");
    showToast("✓ تم إضافة المستلم");
  };
  const deleteRecipient = (id) => {
    updateAutomation(a => {
      a.recipients = (a.recipients || []).filter(r => r.id !== id);
    });
  };
  const toggleSubscription = (id, reportKey) => {
    updateAutomation(a => {
      const r = (a.recipients || []).find(x => x.id === id);
      if (!r) return;
      if (!Array.isArray(r.subscribedReports)) r.subscribedReports = [];
      const i = r.subscribedReports.indexOf(reportKey);
      if (i >= 0) r.subscribedReports.splice(i, 1);
      else r.subscribedReports.push(reportKey);
    });
  };
  /* V21.9.152: Per-recipient section filter — each recipient can opt into specific
     daily-report sections (sales/purchases/treasury/...). Missing or empty filter
     = recipient gets ALL sections enabled in dailyReport.sections (backward
     compatible). The cron applies (recipient.sectionFilter ∩ dailyReport.sections). */
  const toggleRecipientSection = (id, sectionKey) => {
    updateAutomation(a => {
      const r = (a.recipients || []).find(x => x.id === id);
      if (!r) return;
      /* On first toggle: seed sectionFilter with all sections enabled, then flip the clicked one */
      if (!r.sectionFilter || typeof r.sectionFilter !== "object") {
        r.sectionFilter = {};
        Object.keys(SECTION_LABELS).forEach(k => { r.sectionFilter[k] = true; });
      }
      r.sectionFilter[sectionKey] = !r.sectionFilter[sectionKey];
    });
  };
  /* Section-filter modal state */
  const [sectionModal, setSectionModal] = useState(null);/* recipient id or null */

  /* V21.9.153: Recipient Groups — organizational labels (مدراء، محاسبون، إلخ).
     Groups are PURE LABELS — they don't auto-route notifications. Their purpose
     is to organize the recipients table when you have 10+ subscribers, with
     filter chips at the top + a group cell per row. Bulk-apply tools (e.g.
     "apply section filter to all members of group X") can be added later. */
  const groups = automation.groups || [];
  const [groupFilter, setGroupFilter] = useState("");/* "" = all, else groupId */
  const [newGroupName, setNewGroupName] = useState("");
  const [recipientGroupsModal, setRecipientGroupsModal] = useState(null);/* recipient id or null */
  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) { showToast("⚠️ ادخل اسم المجموعة"); return; }
    if (groups.some(g => g.name === name)) { showToast("⚠️ المجموعة موجودة"); return; }
    updateAutomation(a => {
      if (!Array.isArray(a.groups)) a.groups = [];
      a.groups.push({ id: gid(), name, createdAt: new Date().toISOString() });
    });
    setNewGroupName("");
    showToast("✓ تم إنشاء المجموعة");
  };
  const deleteGroup = (id) => updateAutomation(a => {
    a.groups = (a.groups || []).filter(g => g.id !== id);
    /* Also remove this group from any recipient's groupIds */
    (a.recipients || []).forEach(r => {
      if (Array.isArray(r.groupIds)) {
        r.groupIds = r.groupIds.filter(gid => gid !== id);
      }
    });
  });
  const toggleRecipientGroup = (recipientId, groupId) => updateAutomation(a => {
    const r = (a.recipients || []).find(x => x.id === recipientId);
    if (!r) return;
    if (!Array.isArray(r.groupIds)) r.groupIds = [];
    const i = r.groupIds.indexOf(groupId);
    if (i >= 0) r.groupIds.splice(i, 1);
    else r.groupIds.push(groupId);
  });
  /* Filtered recipients view */
  const filteredRecipients = groupFilter
    ? recipients.filter(r => Array.isArray(r.groupIds) && r.groupIds.includes(groupFilter))
    : recipients;

  /* Generate preview */
  const onPreview = () => {
    try {
      const result = buildDailyReport(data, { config: dailyReport });
      setPreviewText(result.text);
      setTab("preview");
    } catch(e){
      showToast("⚠️ خطأ في بناء التقرير: " + (e.message || ""));
    }
  };

  /* V19.69.2: Manually trigger the scheduler endpoint with the current admin's
     Firebase ID token. The endpoint (`/api/automation-tick`) accepts both the
     cron secret and an admin ID token (manual-admin source). This lets the user
     test the full scheduled flow (auth + report build + bridge + history) without
     setting up the VPS cron first. */
  const onTriggerScheduler = async () => {
    if (!user || typeof user.getIdToken !== "function") {
      showToast("⛔ المستخدم غير مسجل دخول");
      return;
    }
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const r = await fetch("/api/automation-tick", {
        method: "GET",
        headers: { "Authorization": "Bearer " + idToken },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast("⛔ فشل: " + (data?.error || "HTTP " + r.status));
        setBusy(false);
        return;
      }
      const action = (data?.actions || [])[0];
      if (!action) {
        showToast("⚠️ لم يحدث شيء");
      } else if (action.due) {
        showToast("✓ تم تنفيذ الـscheduler — " + (action.sent || 0) + " مستلم");
      } else {
        const reasons = {
          "disabled": "التقرير اليومي متوقف",
          "no-recipients": "مفيش مستلمين",
          "before-scheduled": "قبل الموعد المحدد",
          "already-sent-today": "تم إرساله اليوم بالفعل",
          "invalid-time": "وقت غير صالح",
        };
        showToast("⏭ skipped: " + (reasons[action.reason] || action.reason));
      }
    } catch (e) {
      showToast("⛔ خطأ: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };

  /* V19.69.4: clear lastSentAt so the scheduler can be re-tested today.
     Without this, after the first successful scheduler run, every later attempt
     returns "skipped: already-sent-today" — which makes the scheduled-flow
     impossible to verify end-to-end without waiting until tomorrow OR editing
     Firestore manually. Admin/manager only. */
  const onResetSentToday = async () => {
    if (!dailyReport?.lastSentAt) {
      showToast("⏭ مفيش lastSentAt مسجل — الـscheduler مش متوقف");
      return;
    }
    /* V19.76.8: replaced native confirm() with custom themed popup */
    if (!await ask("اختبار الـscheduler","هتمسح علامة 'تم إرساله اليوم' عشان تختبر الـscheduler تاني. متأكد؟")) return;
    updateAutomation(a => {
      if (!a.dailyReport) a.dailyReport = { ...DEFAULT_AUTOMATION_CONFIG.dailyReport };
      a.dailyReport.lastSentAt = null;
    });
    showToast("✓ تم المسح — اضغط '🔄 شغّل الـscheduler الآن' لاختبار الإرسال");
  };

  /* ── V19.70: Pending-event actions (manual mode + retry) ── */
  const callEventTrigger = async (body) => {
    if (!user || typeof user.getIdToken !== "function") throw new Error("User not signed in");
    const idToken = await user.getIdToken();
    const r = await fetch("/api/event-trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok && !data.queued) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  };

  const sendPendingNow = async (entry) => {
    setBusy(true);
    try {
      const data = await callEventTrigger({
        eventType: entry.eventType,
        payload: entry.payload,
        customerPhone: entry.customerPhone,
        idempotencyKey: entry.idempotencyKey,
        force: true,/* bypass mode + idempotency */
      });
      if (data.sent) showToast("✓ تم الإرسال (" + data.sent + " مستلم)");
      else if (data.deduped) showToast("⏭ متبعّت قبل كده");
      else if (data.skipped) showToast("⏭ skipped: " + data.reason);
      else showToast("⚠️ " + (data.error || "نتيجة غير معروفة"));
    } catch (e) {
      showToast("⛔ " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const sendAllPending = async () => {
    const pending = (eventTriggers.pending || []).filter(p => (p.attempts || 0) < 5);
    if (pending.length === 0) { showToast("⏭ مفيش pending"); return; }
    /* V19.76.8: replaced native confirm() with themed popup */
    if (!await ask("إرسال الـpending","هتبعت "+pending.length+" رسالة pending. متأكد؟",{confirmText:"إرسال"})) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const entry of pending) {
      try {
        const data = await callEventTrigger({
          eventType: entry.eventType, payload: entry.payload,
          customerPhone: entry.customerPhone, idempotencyKey: entry.idempotencyKey,
          force: true,
        });
        if (data.sent || data.deduped) ok++; else fail++;
      } catch (_) { fail++; }
    }
    setBusy(false);
    showToast(`✓ ${ok} نجحت • ⛔ ${fail} فشلت`);
  };

  /* V21.9.149: Test-send a specific trigger event with sample data.
     Lets the admin verify a customized template by rendering it with the
     event's `samplePayload` and sending to a chosen phone number. Mirrors
     the daily-report "ارسل تجربة" button — same bridge call, same UX. */
  const onTestSendEvent = async (eventType, role, phone) => {
    if (!bridgeUrl) {
      showToast("⛔ الـbridge URL غير مضبوط — افتح Campaigns → Bridge Settings أولاً");
      return { ok:false };
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      showToast("⚠️ رقم غير صالح");
      return { ok:false };
    }
    const eventCfg = eventTriggers.events?.[eventType] || {};
    const template = eventCfg.templates?.[role]
      || (DEFAULT_EVENT_TEMPLATES[eventType] && DEFAULT_EVENT_TEMPLATES[eventType][role])
      || "";
    if (!template) {
      showToast("⚠️ مفيش template معرّف لـ " + role);
      return { ok:false };
    }
    setBusy(true);
    try {
      const payload = samplePayload(eventType);
      const message = substituteTemplate(template, payload);
      const status = await bridgeStatus(bridgeUrl, bridgeToken);
      if (!status?.ok || !status.waReady) {
        showToast("⛔ الـbridge مش جاهز (" + (status?.waState || status?.error || "unknown") + ")");
        return { ok:false };
      }
      await bridgeSend(bridgeUrl, bridgeToken, [{ phone: normalizedPhone, message }]);
      showToast("✓ تم إرسال التجربة لـ " + normalizedPhone);
      return { ok:true, message };
    } catch(e) {
      showToast("⛔ فشل: " + (e.message || ""));
      return { ok:false, error: e.message };
    } finally {
      setBusy(false);
    }
  };

  /* Manual "Send Test Now" — sends to all subscribed recipients via the bridge */
  const onSendTest = async () => {
    if (!bridgeUrl) {
      showToast("⛔ الـbridge URL غير مضبوط — افتح Campaigns → Bridge Settings أولاً");
      return;
    }
    if (reportRecipientsList.length === 0) {
      showToast("⛔ مفيش مستلمين مشتركين في التقرير اليومي");
      return;
    }
    /* Quick health check.
       V19.68 FIX: bridge /status returns {waState, waReady} not {state}.
       waReady is the canonical "ready to send" boolean. */
    setBusy(true);
    const status = await bridgeStatus(bridgeUrl, bridgeToken);
    if (!status?.ok || !status.waReady) {
      setBusy(false);
      showToast("⛔ الـbridge مش جاهز (" + (status?.waState || status?.error || "unknown") + ")");
      return;
    }
    try {
      /* V21.9.152: build per-recipient with section filter (mirror of automation-tick) */
      const baseSections = dailyReport.sections || {};
      const reportCache = {};
      /* Resolve recipients with their full data (sectionFilter etc.) */
      const fullRecipients = reportRecipientsList.map(rr => {
        const full = recipients.find(x => normalizePhone(x.phone) === rr.phone) || rr;
        return { ...rr, sectionFilter: full.sectionFilter };
      });
      const messages = fullRecipients.map(r => {
        const filter = r.sectionFilter;
        let effectiveSections = baseSections;
        if (filter && typeof filter === "object") {
          effectiveSections = {};
          for (const key of Object.keys(baseSections)) {
            effectiveSections[key] = baseSections[key] && (filter[key] !== false);
          }
        }
        const cacheKey = Object.keys(effectiveSections).sort().map(k => k + ":" + (effectiveSections[k] ? "1" : "0")).join("|");
        if (!reportCache[cacheKey]) {
          reportCache[cacheKey] = buildDailyReport(data, { config: { ...dailyReport, sections: effectiveSections } });
        }
        return { phone: r.phone, message: reportCache[cacheKey].text };
      });
      const sendResult = await bridgeSend(bridgeUrl, bridgeToken, messages);
      const accepted = (sendResult?.queued || sendResult?.accepted || messages.length);
      /* Append to history */
      updateAutomation(a => {
        if (!Array.isArray(a.history)) a.history = [];
        a.history.unshift({
          id: gid(),
          at: new Date().toISOString(),
          type: "dailyReport",
          source: "manual-test",/* V19.69.2: was "manual" */
          recipientCount: messages.length,
          accepted,
          success: true,
          by: userEmail,
        });
        a.history = a.history.slice(0, 50);
        /* V19.69.2 BUGFIX: don't touch `lastSentAt` here. The cron's
           `alreadySentToday()` check uses lastSentAt to skip duplicate scheduled
           sends. Pre-V19.69.2 a manual test in the morning blocked the scheduled
           send for the rest of the day. Now manual tests are display-only via
           `lastManualTestAt`. */
        if (!a.dailyReport) a.dailyReport = { ...DEFAULT_AUTOMATION_CONFIG.dailyReport };
        a.dailyReport.lastManualTestAt = new Date().toISOString();
      });
      showToast("✓ تم إرسال التقرير لـ" + accepted + " مستلم");
    } catch(e){
      updateAutomation(a => {
        if (!Array.isArray(a.history)) a.history = [];
        a.history.unshift({
          id: gid(),
          at: new Date().toISOString(),
          type: "dailyReport",
          source: "manual",
          recipientCount: reportRecipientsList.length,
          success: false,
          error: e.message || String(e),
          by: userEmail,
        });
        a.history = a.history.slice(0, 50);
      });
      showToast("⛔ فشل الإرسال: " + (e.message || "خطأ"));
    } finally {
      setBusy(false);
    }
  };

  /* ─── Render ─── */
  return <div>
    {/* Header */}
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8}}>
      <div>
        <h2 style={{fontSize:isMob?FS+3:FS+6, fontWeight:900, margin:0, color:T.text, letterSpacing:"-0.5px"}}>
          🤖 الأتمتة (Automation)
        </h2>
        <div style={{fontSize:FS-1, color:T.textSec, marginTop:2}}>
          إرسال تقارير ورسائل تلقائية عبر WhatsApp
        </div>
      </div>
      {/* Bridge status pill */}
      <BridgeStatusPill bridgeUrl={bridgeUrl} bridgeToken={bridgeToken}/>
    </div>

    {/* Tabs */}
    <div style={{display:"flex", gap:6, marginBottom:14, flexWrap:"wrap"}}>
      {[
        {k:"dailyReport", label:"📊 تقرير يومي"},
        {k:"triggers",    label:"🔥 Triggers الفورية"},
        {k:"recipients",  label:"👥 المستلمون"},
        {k:"history",     label:"📜 سجل الإرسال"},
        {k:"preview",     label:"👁 معاينة", hidden: !previewText},
      ].filter(x => !x.hidden).map(x =>
        <div key={x.k} onClick={() => setTab(x.k)} style={{
          padding:"8px 16px", borderRadius:10, cursor:"pointer",
          background: tab === x.k ? T.accent : T.cardSolid,
          color: tab === x.k ? "#fff" : T.text,
          border:"1px solid " + (tab === x.k ? T.accent : T.brd),
          fontSize:FS-1, fontWeight:700,
        }}>{x.label}</div>
      )}
    </div>

    {/* ─── Daily Report Tab ─── */}
    {tab === "dailyReport" && <Card title="📊 إعدادات التقرير اليومي">
      {/* Enable toggle + schedule */}
      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr", gap:12, marginBottom:14}}>
        <div>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:5}}>
            تفعيل
          </label>
          <div onClick={() => setReportField("enabled", !dailyReport.enabled)} style={{
            cursor:"pointer", padding:"10px 14px", borderRadius:10,
            background: dailyReport.enabled ? T.ok+"15" : T.bg,
            border:"1px solid " + (dailyReport.enabled ? T.ok : T.brd),
            color: dailyReport.enabled ? T.ok : T.textMut,
            fontSize:FS-1, fontWeight:800, display:"flex", alignItems:"center", gap:8,
          }}>
            <span>{dailyReport.enabled ? "🟢" : "⚪"}</span>
            <span>{dailyReport.enabled ? "مفعّل" : "متوقف"}</span>
          </div>
        </div>
        <div>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:5}}>
            موعد الإرسال (ساعة:دقيقة)
          </label>
          <input type="time" value={dailyReport.time || "08:00"}
            onChange={e => setReportField("time", e.target.value)}
            style={{padding:"10px 14px", borderRadius:10, border:"1px solid "+T.brd,
              background:T.cardSolid, fontSize:FS, fontFamily:"inherit", width:"100%",
              boxSizing:"border-box", color:T.text}}/>
        </div>
        <div>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:700, display:"block", marginBottom:5}}>
            آخر إرسال
          </label>
          <div style={{padding:"10px 14px", borderRadius:10, background:T.bg,
            border:"1px solid "+T.brd, fontSize:FS-2, color:T.textSec}}>
            {/* V19.69.2: show scheduled send + manual test separately so the user
                knows which counts toward "already sent today" idempotency. */}
            <div>
              <span style={{color:T.textMut}}>تلقائي/scheduler: </span>
              <span style={{fontFamily:"monospace", color:T.text}}>
                {dailyReport.lastSentAt
                  ? new Date(dailyReport.lastSentAt).toLocaleString("ar-EG")
                  : "—"}
              </span>
            </div>
            <div style={{marginTop:4}}>
              <span style={{color:T.textMut}}>تجربة يدوية: </span>
              <span style={{fontFamily:"monospace", color:T.text}}>
                {dailyReport.lastManualTestAt
                  ? new Date(dailyReport.lastManualTestAt).toLocaleString("ar-EG")
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sections checkboxes */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:FS-1, fontWeight:700, color:T.text, marginBottom:8}}>
          الأقسام المتضمنة
        </div>
        <div style={{display:"grid", gridTemplateColumns:isMob?"1fr 1fr":"repeat(4, 1fr)", gap:8}}>
          {Object.entries(SECTION_LABELS).map(([k, info]) => {
            const on = dailyReport.sections?.[k] !== false;
            return <div key={k} onClick={() => toggleSection(k)} style={{
              cursor:"pointer", padding:"10px 12px", borderRadius:10,
              background: on ? T.accent+"10" : T.bg,
              border: "1px solid " + (on ? T.accent+"40" : T.brd),
              display:"flex", alignItems:"center", gap:8,
            }}>
              <span style={{fontSize:18}}>{on ? "☑️" : "⬜"}</span>
              <span style={{fontSize:18}}>{info.icon}</span>
              <span style={{fontSize:FS-1, fontWeight:700, color: on ? T.text : T.textMut}}>
                {info.label}
              </span>
            </div>;
          })}
        </div>
      </div>

      {/* Alert thresholds */}
      <div style={{marginBottom:14, padding:"10px 14px", background:T.warn+"06",
        border:"1px solid "+T.warn+"25", borderRadius:10}}>
        <div style={{fontSize:FS-1, fontWeight:700, color:T.text, marginBottom:8}}>
          ⚠️ عتبات تحذيرات العملاء
        </div>
        <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 1fr", gap:10}}>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
              الحد الأدنى لرصيد العميل (ج)
            </label>
            <Inp type="number" value={dailyReport.alertThresholds?.minBalance ?? 5000}
              onChange={v => setAlertThreshold("minBalance", v)}/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
              الحد الأدنى لعدد أيام عدم الدفع
            </label>
            <Inp type="number" value={dailyReport.alertThresholds?.minDaysNoPay ?? 30}
              onChange={v => setAlertThreshold("minDaysNoPay", v)}/>
          </div>
        </div>
      </div>

      {/* V21.9.151: Quiet Hours — system-wide control over WhatsApp delivery times.
          When enabled, events targeting the OWNER role get suppressed during the
          configured time window (e.g. 21:00 → 08:00 = no owner pings overnight).
          Customer/supplier still get notified — they're transacting parties.
          Daily report uses its own scheduled time, so this only affects trigger events. */}
      <div style={{marginBottom:14, padding:"10px 14px", background:"#8B5CF610",
        border:"1px solid #8B5CF625", borderRadius:10}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:8}}>
          <div style={{fontSize:FS-1, fontWeight:700, color:T.text, display:"flex", alignItems:"center", gap:6}}>
            <span>🌙</span>
            <span>ساعات الهدوء (Quiet Hours) — للأحداث الفورية فقط</span>
          </div>
          <div onClick={() => setQuietHoursField("enabled", !quietHours.enabled)} style={{
            cursor:"pointer", padding:"4px 12px", borderRadius:8,
            background: quietHours.enabled ? "#8B5CF6" : T.bg,
            color: quietHours.enabled ? "#fff" : T.textMut,
            fontSize:FS-2, fontWeight:700,
            border:"1px solid " + (quietHours.enabled ? "#8B5CF6" : T.brd),
          }}>
            {quietHours.enabled ? "✓ مفعّل" : "متوقف"}
          </div>
        </div>
        <div style={{fontSize:FS-3, color:T.textSec, marginBottom:8, lineHeight:1.6}}>
          خلال هذه الساعات، الـ events التي تستهدف المالك تـ skip — العميل/المورد يستلموا طبيعي. مفيد لو ميعنش يصحوك ليلاً برسالة بيع/دفعة.
        </div>
        <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 1fr", gap:10}}>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
              بداية الهدوء (الساعة)
            </label>
            <input type="time" value={quietHours.start || "21:00"}
              onChange={e => setQuietHoursField("start", e.target.value)}
              disabled={!quietHours.enabled}
              style={{padding:"10px 14px", borderRadius:10, border:"1px solid "+T.brd,
                background:quietHours.enabled?T.cardSolid:T.bg,
                opacity:quietHours.enabled?1:0.5,
                fontSize:FS, fontFamily:"inherit", width:"100%",
                boxSizing:"border-box", color:T.text}}/>
          </div>
          <div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
              نهاية الهدوء (الساعة)
            </label>
            <input type="time" value={quietHours.end || "08:00"}
              onChange={e => setQuietHoursField("end", e.target.value)}
              disabled={!quietHours.enabled}
              style={{padding:"10px 14px", borderRadius:10, border:"1px solid "+T.brd,
                background:quietHours.enabled?T.cardSolid:T.bg,
                opacity:quietHours.enabled?1:0.5,
                fontSize:FS, fontFamily:"inherit", width:"100%",
                boxSizing:"border-box", color:T.text}}/>
          </div>
        </div>
        {/* V21.9.184: timezone selector — applies to quiet hours AND daily report scheduled-send time */}
        <div style={{marginTop:10}}>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
            المنطقة الزمنية (لحساب الساعات + ميعاد التقرير اليومي)
          </label>
          <select value={AUTOMATION_TZ_PRESETS.some(p=>p.value===automationTz)?automationTz:"__custom"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom") {
                /* allow free-form IANA name via the text input below */
                setAutomationTz(automationTz || "Africa/Cairo");
              } else {
                setAutomationTz(v);
              }
            }}
            style={{padding:"10px 14px", borderRadius:10, border:"1px solid "+T.brd,
              background:T.cardSolid, fontSize:FS, fontFamily:"inherit", width:"100%",
              boxSizing:"border-box", color:T.text}}>
            {AUTOMATION_TZ_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            <option value="__custom">— مخصص (IANA name) —</option>
          </select>
          {!AUTOMATION_TZ_PRESETS.some(p=>p.value===automationTz) && (
            <input type="text" value={automationTz}
              onChange={e => setAutomationTz(e.target.value)}
              placeholder="Africa/Cairo"
              style={{marginTop:6, padding:"8px 12px", borderRadius:8, border:"1px solid "+T.brd,
                background:T.cardSolid, fontSize:FS-1, fontFamily:"monospace", width:"100%",
                boxSizing:"border-box", color:T.text, direction:"ltr"}}/>
          )}
          <div style={{fontSize:FS-3, color:T.textMut, marginTop:4, lineHeight:1.6}}>
            افتراضي <code>Africa/Cairo</code>. لو غيرت لـ Asia/Riyadh أو Asia/Dubai أو غيرهم،
            الـ Quiet Hours + ميعاد التقرير اليومي بـ يتـ احتسبوا بالـ local time للـ region ده.
            <br/>الـ IANA codes الكاملة: <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank" rel="noopener" style={{color:T.accent}}>قائمة كاملة</a>
          </div>
        </div>
      </div>

      {/* V19.80.15: editable WhatsApp message template with variable insertion.
          Lets the admin customize the daily report's wording without code changes.
          The default template mirrors the previous hardcoded layout, so behavior
          stays identical until the user edits. Click any variable chip to insert
          it at the cursor position. */}
      <DailyReportTemplateEditor
        template={dailyReport.template || DEFAULT_DAILY_TEMPLATE}
        onChange={(v) => setReportField("template", v)}
        onReset={async () => {
          const ok = await ask("استرجاع القالب الافتراضي؟ القالب الحالي هيتم استبداله.");
          if (!ok) return;
          setReportField("template", DEFAULT_DAILY_TEMPLATE);
          showToast("✓ تم استرجاع القالب الافتراضي");
        }}
        previewVars={previewVars}
        onComputePreview={() => {
          try {
            const result = buildDailyReport(data, { config: dailyReport });
            setPreviewVars(result.vars || {});
            setPreviewText(result.text);
          } catch (e) {
            showToast("⚠️ خطأ في بناء المعاينة: " + (e.message || ""));
          }
        }}
        previewText={previewText}
        isMob={isMob}
      />

      {/* V19.69.5: main action row — only "preview" + "test send" visible by default.
          The scheduler-trigger and lastSentAt-reset buttons moved to a collapsible
          "أدوات تشخيص" panel below, since they're debug tools (the VPS cron handles
          the daily send autonomously). The user shouldn't see daily-action buttons
          for an autonomous flow — that creates a false mental model. */}
      <div style={{display:"flex", gap:10, flexWrap:"wrap", borderTop:"1px solid "+T.brd, paddingTop:14}}>
        <Btn ghost onClick={onPreview}>👁 معاينة الرسالة</Btn>
        <Btn primary onClick={onSendTest} disabled={busy}
          style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>
          {busy ? "⏳ جاري الإرسال..." : "📤 ارسل تجربة (مباشر)"}
        </Btn>
        <div style={{flex:1}}/>
        <div style={{fontSize:FS-2, color:T.textMut, alignSelf:"center"}}>
          المستلمون: {reportRecipientsList.length}
        </div>
      </div>

      {/* V19.69: cron status panel */}
      <CronStatusPanel automation={automation} dailyReport={dailyReport} />

      {/* V19.69.5: debug tools panel — collapsed by default. Contains the manual
          scheduler trigger and lastSentAt reset, both of which are only useful
          when the cron is broken or for testing. Cron-healthy = no need to touch. */}
      <DebugToolsPanel
        onTrigger={onTriggerScheduler}
        onReset={onResetSentToday}
        hasLastSent={!!dailyReport?.lastSentAt}
        busy={busy}
      />
    </Card>}

    {/* ─── V19.70: Triggers Tab ─── */}
    {tab === "triggers" && <Card title="🔥 Triggers الفورية">
      <TriggersTab
        eventTriggers={eventTriggers}
        isMob={isMob}
        busy={busy}
        bridgeUrl={bridgeUrl}
        userEmail={userEmail}
        setTriggerMode={setTriggerMode}
        toggleEvent={toggleEvent}
        toggleEventRecipient={toggleEventRecipient}
        setEventTemplate={setEventTemplate}
        setEventThreshold={setEventThreshold}
        setEventMinValue={setEventMinValue} /* V21.9.150 */
        resetEventTemplate={resetEventTemplate}
        addOwnerPhone={addOwnerPhone}
        removeOwnerPhone={removeOwnerPhone}
        discardPending={discardPending}
        sendPendingNow={sendPendingNow}
        sendAllPending={sendAllPending}
        onTestSendEvent={onTestSendEvent} /* V21.9.149 */
      />
    </Card>}

    {/* ─── Recipients Tab ─── */}
    {tab === "recipients" && <Card title="👥 المستلمون">
      {/* V21.9.153: Groups section — define orgs (مدراء، محاسبون، إلخ) and filter the
          recipients table by group. Groups are organizational LABELS only — they don't
          change routing logic (a recipient still gets reports based on their own
          subscribedReports + sectionFilter). */}
      <div style={{marginBottom:14, padding:"10px 14px", background:T.bg, border:"1px solid "+T.brd, borderRadius:10}}>
        <div style={{fontSize:FS-1, fontWeight:700, color:T.text, marginBottom:8, display:"flex", alignItems:"center", gap:6}}>
          <span>🏷️</span>
          <span>المجموعات (تنظيم فقط — لا يغيّر التوجيه)</span>
        </div>
        <div style={{display:"flex", gap:6, marginBottom:8, flexWrap:"wrap"}}>
          <Inp value={newGroupName} onChange={setNewGroupName} placeholder="اسم المجموعة..." style={{flex:"1 1 200px"}}/>
          <Btn primary small onClick={addGroup}>➕ مجموعة</Btn>
        </div>
        {groups.length > 0 && (
          <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:6}}>
            <span onClick={() => setGroupFilter("")} style={{
              cursor:"pointer", padding:"4px 12px", borderRadius:8,
              background: !groupFilter ? T.accent : T.bg,
              color: !groupFilter ? "#fff" : T.textSec,
              fontSize:FS-2, fontWeight:700,
              border:"1px solid " + (!groupFilter ? T.accent : T.brd),
            }}>الكل ({recipients.length})</span>
            {groups.map(g => {
              const memberCount = recipients.filter(r => Array.isArray(r.groupIds) && r.groupIds.includes(g.id)).length;
              const isActive = groupFilter === g.id;
              return (
                <span key={g.id} style={{
                  display:"inline-flex", alignItems:"center", gap:4,
                  padding:"4px 10px", borderRadius:8,
                  background: isActive ? T.accent : T.cardSolid,
                  color: isActive ? "#fff" : T.text,
                  fontSize:FS-2, fontWeight:700,
                  border:"1px solid " + (isActive ? T.accent : T.brd),
                }}>
                  <span onClick={() => setGroupFilter(isActive ? "" : g.id)} style={{cursor:"pointer"}}>
                    {g.name} ({memberCount})
                  </span>
                  <span onClick={async () => {
                    const ok = await ask("حذف المجموعة \"" + g.name + "\"؟ المستلمون يفضلوا موجودين بس بدون عضوية في المجموعة.");
                    if (ok) deleteGroup(g.id);
                  }} title="حذف المجموعة" style={{cursor:"pointer", opacity:0.6, padding:"0 2px"}}>✕</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"2fr 2fr 1fr", gap:8, marginBottom:14, alignItems:"flex-end"}}>
        <div>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
            الاسم
          </label>
          <Inp value={newName} onChange={setNewName} placeholder="مثلاً: أحمد سامي"/>
        </div>
        <div>
          <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:3}}>
            رقم الواتس
          </label>
          <Inp value={newPhone} onChange={setNewPhone} placeholder="01xxxxxxxxx أو +20..."/>
        </div>
        <Btn primary onClick={addRecipient}>➕ إضافة</Btn>
      </div>

      {recipients.length === 0
        ? <div style={{textAlign:"center", padding:30, color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
            <div style={{fontSize:36, marginBottom:6, opacity:0.5}}>👥</div>
            <div style={{fontSize:FS-1, fontWeight:600}}>لم يتم إضافة مستلمين</div>
            <div style={{fontSize:FS-3, marginTop:4}}>أضف أول مستلم من الحقول فوق</div>
          </div>
        : filteredRecipients.length === 0
        ? <div style={{textAlign:"center", padding:30, color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
            <div style={{fontSize:36, marginBottom:6, opacity:0.5}}>🔍</div>
            <div style={{fontSize:FS-1, fontWeight:600}}>مفيش مستلمين في هذه المجموعة</div>
          </div>
        : <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", minWidth:700}}>
              <thead>
                <tr>{["الاسم", "الرقم", "تقرير يومي", "الأقسام", "المجموعات", "أُضيف", ""].map(h =>
                  <th key={h} style={{padding:"8px 10px", fontSize:FS-2, fontWeight:700, color:T.textSec, borderBottom:"1px solid "+T.brd, textAlign:"start"}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRecipients.map(r => {
                  const subscribed = !r.subscribedReports || r.subscribedReports.includes("dailyReport");
                  /* V21.9.152: count active sections this recipient is subscribed to */
                  const sectionFilter = r.sectionFilter;
                  const sectionKeys = Object.keys(SECTION_LABELS);
                  const activeSectionCount = sectionFilter
                    ? sectionKeys.filter(k => sectionFilter[k] !== false).length
                    : sectionKeys.length;
                  const isCustom = !!sectionFilter;
                  return <tr key={r.id} style={{borderBottom:"1px solid "+T.brd}}>
                    <td style={{padding:"10px", fontWeight:600, color:T.text}}>{r.name}</td>
                    <td style={{padding:"10px", fontFamily:"monospace", color:T.textSec}}>{r.phone}</td>
                    <td style={{padding:"10px"}}>
                      <span onClick={() => toggleSubscription(r.id, "dailyReport")} style={{
                        cursor:"pointer", padding:"4px 12px", borderRadius:8,
                        background: subscribed ? T.ok+"15" : T.bg,
                        color: subscribed ? T.ok : T.textMut,
                        fontSize:FS-2, fontWeight:700,
                        border:"1px solid " + (subscribed ? T.ok+"40" : T.brd),
                      }}>{subscribed ? "✓ مشترك" : "—"}</span>
                    </td>
                    <td style={{padding:"10px"}}>
                      {/* V21.9.152: per-recipient section subscription */}
                      <span onClick={() => setSectionModal(r.id)} style={{
                        cursor:"pointer", padding:"4px 12px", borderRadius:8,
                        background: isCustom ? T.accent+"15" : T.bg,
                        color: isCustom ? T.accent : T.textMut,
                        fontSize:FS-2, fontWeight:700,
                        border:"1px solid " + (isCustom ? T.accent+"40" : T.brd),
                        whiteSpace:"nowrap",
                      }} title="تخصيص الأقسام التي يستلمها">
                        {isCustom
                          ? "⚙️ مخصص (" + activeSectionCount + "/" + sectionKeys.length + ")"
                          : "✓ كل الأقسام"}
                      </span>
                    </td>
                    {/* V21.9.153: groups cell — chips + click-to-edit */}
                    <td style={{padding:"10px"}}>
                      <div onClick={() => setRecipientGroupsModal(r.id)} style={{cursor:"pointer", display:"flex", flexWrap:"wrap", gap:3, minWidth:80}}>
                        {Array.isArray(r.groupIds) && r.groupIds.length > 0
                          ? r.groupIds.map(gid => {
                              const g = groups.find(x => x.id === gid);
                              if (!g) return null;
                              return <span key={gid} style={{
                                padding:"2px 8px", borderRadius:6,
                                background: T.accent+"15",
                                color: T.accent,
                                fontSize:FS-3, fontWeight:700,
                                border:"1px solid "+T.accent+"30",
                              }}>{g.name}</span>;
                            })
                          : <span style={{fontSize:FS-3, color:T.textMut, fontStyle:"italic"}}>—  اضغط للتعيين</span>}
                      </div>
                    </td>
                    <td style={{padding:"10px", fontSize:FS-2, color:T.textMut}}>
                      {r.addedAt ? new Date(r.addedAt).toLocaleDateString("ar-EG") : "—"}
                    </td>
                    <td style={{padding:"10px"}}>
                      <DelBtn onConfirm={() => deleteRecipient(r.id)}/>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}

      {/* V21.9.153: Recipient-Groups assignment modal */}
      {recipientGroupsModal && (() => {
        const r = recipients.find(x => x.id === recipientGroupsModal);
        if (!r) return null;
        return (
          <div onClick={() => setRecipientGroupsModal(null)} style={{position:"fixed", inset:0, zIndex:99999, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
            <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:20, maxWidth:480, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.3)", border:"1px solid "+T.brd}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                <div style={{fontWeight:800, fontSize:FS+1, color:T.text}}>🏷️ تعيين المجموعات</div>
                <Btn ghost small onClick={() => setRecipientGroupsModal(null)}>✕</Btn>
              </div>
              <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14}}>
                المستلم: <b style={{color:T.text}}>{r.name}</b>
              </div>
              {groups.length === 0
                ? <div style={{textAlign:"center", padding:20, color:T.textMut, fontSize:FS-2}}>
                    لم يتم إنشاء مجموعات بعد. اقفل هذا الـ modal واستخدم زر '➕ مجموعة' فوق.
                  </div>
                : <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:14}}>
                    {groups.map(g => {
                      const on = Array.isArray(r.groupIds) && r.groupIds.includes(g.id);
                      return <div key={g.id} onClick={() => toggleRecipientGroup(r.id, g.id)} style={{
                        cursor:"pointer", padding:"10px 12px", borderRadius:8,
                        background: on ? T.accent+"10" : T.bg,
                        border: "1px solid " + (on ? T.accent+"40" : T.brd),
                        display:"flex", alignItems:"center", gap:8,
                      }}>
                        <span style={{fontSize:18}}>{on ? "☑️" : "⬜"}</span>
                        <span style={{fontSize:FS-1, fontWeight:700, color: on ? T.text : T.textMut}}>
                          {g.name}
                        </span>
                      </div>;
                    })}
                  </div>}
              <div style={{display:"flex", justifyContent:"flex-end"}}>
                <Btn primary onClick={() => setRecipientGroupsModal(null)}>تم</Btn>
              </div>
            </div>
          </div>
        );
      })()}

      {/* V21.9.152: Section-filter modal — toggle sections per recipient */}
      {sectionModal && (() => {
        const r = recipients.find(x => x.id === sectionModal);
        if (!r) return null;
        const filter = r.sectionFilter || {};
        return (
          <div onClick={() => setSectionModal(null)} style={{position:"fixed", inset:0, zIndex:99999, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
            <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:20, maxWidth:480, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.3)", border:"1px solid "+T.brd}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                <div style={{fontWeight:800, fontSize:FS+1, color:T.text}}>⚙️ تخصيص الأقسام</div>
                <Btn ghost small onClick={() => setSectionModal(null)}>✕</Btn>
              </div>
              <div style={{fontSize:FS-2, color:T.textSec, marginBottom:14, lineHeight:1.6}}>
                المستلم: <b style={{color:T.text}}>{r.name}</b> ({r.phone})<br/>
                اختر الأقسام اللي بـ يستلمها في التقرير اليومي. لو الكل محدّد = يستلم نفس الـ default للتقرير.
              </div>
              <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 1fr", gap:8, marginBottom:14}}>
                {Object.entries(SECTION_LABELS).map(([k, info]) => {
                  const isDefaultFilter = !r.sectionFilter;
                  /* If recipient has no custom filter yet, treat all as ON (default behavior) */
                  const on = isDefaultFilter ? true : (filter[k] !== false);
                  return <div key={k} onClick={() => toggleRecipientSection(r.id, k)} style={{
                    cursor:"pointer", padding:"10px 12px", borderRadius:10,
                    background: on ? T.accent+"10" : T.bg,
                    border: "1px solid " + (on ? T.accent+"40" : T.brd),
                    display:"flex", alignItems:"center", gap:8,
                  }}>
                    <span style={{fontSize:18}}>{on ? "☑️" : "⬜"}</span>
                    <span style={{fontSize:18}}>{info.icon}</span>
                    <span style={{fontSize:FS-1, fontWeight:700, color: on ? T.text : T.textMut}}>
                      {info.label}
                    </span>
                  </div>;
                })}
              </div>
              <div style={{display:"flex", gap:8, justifyContent:"space-between"}}>
                {r.sectionFilter && (
                  <Btn ghost small onClick={() => {
                    updateAutomation(a => {
                      const rec = (a.recipients || []).find(x => x.id === r.id);
                      if (rec) delete rec.sectionFilter;
                    });
                    setSectionModal(null);
                  }}>↩️ استعد الافتراضي (كل الأقسام)</Btn>
                )}
                <div style={{flex:1}}/>
                <Btn primary onClick={() => setSectionModal(null)}>تم</Btn>
              </div>
            </div>
          </div>
        );
      })()}
    </Card>}

    {/* ─── History Tab ─── */}
    {tab === "history" && <Card title="📜 سجل الإرسال (آخر 50)">
      {history.length === 0
        ? <div style={{textAlign:"center", padding:30, color:T.textMut, background:T.bg, borderRadius:10, border:"1px dashed "+T.brd}}>
            <div style={{fontSize:36, marginBottom:6, opacity:0.5}}>📭</div>
            <div style={{fontSize:FS-1, fontWeight:600}}>لم يتم إرسال أي رسائل بعد</div>
          </div>
        : <div style={{display:"flex", flexDirection:"column", gap:6, maxHeight:500, overflowY:"auto"}}>
            {history.map(h => <div key={h.id} style={{
              display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
              borderRadius:8, border:"1px solid "+T.brd,
              background: h.success ? T.ok+"06" : T.err+"06",
            }}>
              <span style={{fontSize:18}}>{h.success ? "✅" : "❌"}</span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:FS-1, fontWeight:700, color:T.text}}>
                  {h.type === "dailyReport" ? "تقرير يومي" : h.type}
                  {h.source === "manual" && <span style={{fontSize:FS-3, color:T.textMut, marginInlineStart:6}}>
                    (يدوي)
                  </span>}
                </div>
                <div style={{fontSize:FS-2, color:T.textSec}}>
                  {new Date(h.at).toLocaleString("ar-EG")}
                  {h.by && " — " + h.by}
                  {" — "}
                  {h.success
                    ? `${h.accepted || h.recipientCount} مستلم`
                    : <span style={{color:T.err}}>فشل: {h.error}</span>}
                </div>
              </div>
            </div>)}
          </div>}
    </Card>}

    {/* ─── Preview Tab ─── */}
    {tab === "preview" && <Card title="👁 معاينة الرسالة">
      <div style={{
        background:"#0d1117", color:"#e6edf3", padding:"14px 18px",
        borderRadius:10, fontSize:FS-1, lineHeight:1.8, fontFamily:"inherit",
        whiteSpace:"pre-wrap", direction:"rtl", textAlign:"start",
        maxHeight:600, overflowY:"auto",
        boxShadow:"inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>{previewText}</div>
      <div style={{marginTop:10, display:"flex", gap:8}}>
        <Btn ghost onClick={() => setTab("dailyReport")}>← رجوع</Btn>
        <Btn primary onClick={onSendTest} disabled={busy}
          style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>
          {busy ? "⏳..." : "📤 ارسل دلوقتي"}
        </Btn>
      </div>
    </Card>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════
   V19.70: TriggersTab — UI for event-driven WhatsApp triggers.
   ───────────────────────────────────────────────────────────────────────
   Top-down layout:
     1. Mode toggle (auto / manual) + explanatory text
     2. Owner-phones manager (recipients for "owner"-targeted messages)
     3. Pending queue (drainable list, manual mode workspace)
     4. One card per event (sale / payment / late-order / check-due)
   Each event card: enable toggle, recipient checkboxes, per-role template
   editor with variable hints and "reset to default" + per-event "test send".
   ═══════════════════════════════════════════════════════════════════════ */
function TriggersTab(props){
  const {
    eventTriggers, isMob, busy, bridgeUrl, userEmail,
    setTriggerMode, toggleEvent, toggleEventRecipient,
    setEventTemplate, setEventThreshold, setEventMinValue, resetEventTemplate,
    addOwnerPhone, removeOwnerPhone,
    discardPending, sendPendingNow, sendAllPending,
    onTestSendEvent, /* V21.9.149 */
  } = props;

  const mode = eventTriggers.mode || "auto";
  const events = eventTriggers.events || {};
  const ownerPhones = eventTriggers.ownerPhones || [];
  const pending = eventTriggers.pending || [];
  /* V19.70.7: separate cash-payment and check-payment events for explicit user control.
     V19.70.10: + checkPaymentIssued, checkCollected, checkBounced.
     V19.70.11: + checkEndorsed (مُظهَّر to supplier), checkRePresented (مرتد re-submitted). */
  const eventTypes = [
    "saleCompleted", "paymentReceived",
    /* V19.76.5: supplier-side cash payment mirror */
    "supplierPaymentSent",
    "checkPaymentReceived", "checkPaymentIssued",
    "checkEndorsed",
    "checkCollected", "checkBounced", "checkRePresented",
    "lateOrder", "checkDue",
  ];

  return (
    <div>
      {/* ─── Mode toggle ─── */}
      <div style={{marginBottom:14, padding:"12px 16px", borderRadius:10,
        background: mode === "auto" ? T.ok+"08" : T.warn+"10",
        border: "1px solid " + (mode === "auto" ? T.ok+"40" : T.warn+"50")}}>
        <div style={{display:"flex", alignItems:"center", gap:12, flexWrap:"wrap"}}>
          <div style={{fontWeight:700, fontSize:FS, color:T.text}}>وضع التشغيل:</div>
          <div style={{display:"flex", gap:6, padding:3, background:T.bg, borderRadius:8, border:"1px solid "+T.brd}}>
            {[
              {k:"auto",   label:"🟢 تلقائي",  desc:"الإرسال فوري لما الـevent يحصل"},
              {k:"manual", label:"🟡 يدوي",   desc:"الـevents تتـqueue، انت تبعت كل واحدة بإيدك"},
            ].map(opt => (
              <div key={opt.k} onClick={() => setTriggerMode(opt.k)} title={opt.desc}
                style={{padding:"6px 14px", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:FS-1,
                  background: mode === opt.k ? (opt.k === "auto" ? T.ok : T.warn) : "transparent",
                  color: mode === opt.k ? "#fff" : T.textSec}}>
                {opt.label}
              </div>
            ))}
          </div>
          <div style={{flex:1}}/>
        </div>
        <div style={{marginTop:8, fontSize:FS-2, color:T.textSec, lineHeight:1.7}}>
          {mode === "auto"
            ? "الـsystem يبعت تلقائياً لما حدث يحصل (بيع، دفعة، شيك، إلخ). لو حصل failure مؤقت في الـbridge، الـcron يـretry تلقائياً كل 5 دقائق."
            : "الـevents تتـqueue في القائمة تحت — مش هتتبعت لحد ما تضغط 'إرسال' على كل واحدة. مفيد لو الـserver/bridge عنده مشكلة وعايز تتحكم بإيدك."}
        </div>
      </div>

      {/* ─── Owner phones ─── */}
      <OwnerPhonesPanel
        phones={ownerPhones}
        onAdd={addOwnerPhone}
        onRemove={removeOwnerPhone}
        isMob={isMob}
      />

      {/* ─── Pending queue ─── */}
      {pending.length > 0 && (
        <PendingQueueSection
          pending={pending}
          busy={busy}
          onSendOne={sendPendingNow}
          onSendAll={sendAllPending}
          onDiscard={discardPending}
        />
      )}

      {/* ─── Per-event cards ─── */}
      <div style={{marginTop:14, fontSize:FS, fontWeight:700, color:T.text, marginBottom:8}}>
        🎯 الأحداث (Events)
      </div>
      {eventTypes.map(et => (
        <EventCard key={et}
          eventType={et}
          eventCfg={events[et] || {}}
          ownerCount={ownerPhones.length}
          isMob={isMob}
          busy={busy}
          onToggle={() => toggleEvent(et)}
          onToggleRecipient={(role) => toggleEventRecipient(et, role)}
          onTemplateChange={(role, val) => setEventTemplate(et, role, val)}
          onThresholdChange={(d) => setEventThreshold(et, d)}
          onMinValueChange={(role, v) => setEventMinValue(et, role, v)} /* V21.9.150 */
          onResetTemplate={(role) => resetEventTemplate(et, role)}
          onTestSend={onTestSendEvent ? (role, phone) => onTestSendEvent(et, role, phone) : null} /* V21.9.149 */
        />
      ))}
    </div>
  );
}

/* ─── Owner phones manager ─── */
function OwnerPhonesPanel({ phones, onAdd, onRemove, isMob }){
  const [draft, setDraft] = useState("");
  return (
    <div style={{marginBottom:14, padding:"10px 14px", border:"1px solid "+T.brd, borderRadius:10, background:T.bg}}>
      <div style={{fontSize:FS-1, fontWeight:700, color:T.text, marginBottom:8}}>
        👤 أرقام المالك (للـ"owner"-targeted messages)
      </div>
      <div style={{fontSize:FS-3, color:T.textMut, marginBottom:10, lineHeight:1.6}}>
        الـevents اللي عند recipient = "owner" بتروح للأرقام دي. ممكن تحط أكتر من رقم.
      </div>
      {phones.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:10}}>
          {phones.map((p, idx) => (
            <div key={idx} style={{display:"flex", alignItems:"center", gap:6, padding:"4px 10px",
              background:T.cardSolid, border:"1px solid "+T.brd, borderRadius:6, fontSize:FS-2, fontFamily:"monospace"}}>
              {p}
              <span onClick={() => onRemove(idx)} style={{cursor:"pointer", color:T.err, fontWeight:700}}>×</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex", gap:8, alignItems:"center"}}>
        <Inp value={draft} onChange={setDraft} placeholder="01xxxxxxxxx أو +20..." style={{flex:1}}/>
        <Btn primary onClick={() => { if (draft.trim()) { onAdd(draft); setDraft(""); } }}>
          ➕ إضافة
        </Btn>
      </div>
    </div>
  );
}

/* ─── Pending queue section ─── */
function PendingQueueSection({ pending, busy, onSendOne, onSendAll, onDiscard }){
  const drainable = pending.filter(p => (p.attempts || 0) < 5);
  const giveup = pending.filter(p => (p.attempts || 0) >= 5);
  return (
    <div style={{marginBottom:14, padding:"10px 14px", border:"1px solid "+T.warn+"50", borderRadius:10, background:T.warn+"08"}}>
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
        <div style={{fontSize:FS-1, fontWeight:700, color:T.warn}}>
          📋 Pending Queue ({pending.length})
        </div>
        <div style={{flex:1}}/>
        <Btn primary disabled={busy || drainable.length === 0}
          onClick={onSendAll}
          style={{background:T.ok, color:"#fff", border:"none", fontSize:FS-2}}>
          📤 إرسال الكل ({drainable.length})
        </Btn>
      </div>
      <div style={{maxHeight:200, overflowY:"auto"}}>
        {pending.map(p => {
          const meta = EVENT_VARIABLES[p.eventType];
          return (
            <div key={p.id} style={{display:"flex", alignItems:"center", gap:10, padding:"6px 8px",
              borderBottom:"1px solid "+T.brd, fontSize:FS-2}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:600, color:T.text}}>{meta?.label || p.eventType}</div>
                <div style={{fontSize:FS-3, color:T.textMut, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                  {p.payload?.customerName || ""} • created: {new Date(p.createdAt).toLocaleTimeString("ar-EG")}
                  {p.attempts > 0 && ` • ${p.attempts} محاولة فاشلة`}
                  {p.lastError && ` • ${p.lastError}`}
                </div>
              </div>
              <Btn primary disabled={busy} onClick={() => onSendOne(p)}
                style={{background:T.ok, color:"#fff", border:"none", fontSize:FS-3, padding:"4px 10px"}}>
                📤 إرسال
              </Btn>
              <Btn ghost disabled={busy} onClick={async() => { if (await ask("حذف الـpending","حذف هذه الرسالة من الـpending؟",{danger:true,confirmText:"حذف"})) onDiscard(p.id); }}
                style={{borderColor:T.err, color:T.err, fontSize:FS-3, padding:"4px 10px"}}>
                🗑
              </Btn>
            </div>
          );
        })}
      </div>
      {giveup.length > 0 && (
        <div style={{marginTop:8, fontSize:FS-3, color:T.err}}>
          ⚠️ {giveup.length} entries فشلت 5+ محاولات — تحتاج لـmanual review
        </div>
      )}
    </div>
  );
}

/* ─── Event card (one per event type) ─── */
function EventCard({ eventType, eventCfg, ownerCount, isMob, busy, onToggle, onToggleRecipient, onTemplateChange, onThresholdChange, onMinValueChange, onResetTemplate, onTestSend }){
  const [open, setOpen] = useState(false);
  /* V21.9.149: Test-send modal state — null = closed, else { role, phone } */
  const [testModal, setTestModal] = useState(null);
  const meta = EVENT_VARIABLES[eventType] || {};
  const enabled = !!eventCfg.enabled;
  const recipients = eventCfg.recipients || {};
  const templates = eventCfg.templates || {};
  const isCronOnly = eventType === "lateOrder" || eventType === "checkDue";
  /* V21.9.150: events that carry a value/amount field — eligible for min-value filtering */
  const VALUE_EVENTS = ["saleCompleted","paymentReceived","supplierPaymentSent","checkPaymentReceived","checkPaymentIssued","checkEndorsed","checkCollected","checkBounced","checkRePresented","checkDue"];
  const hasValue = VALUE_EVENTS.includes(eventType);
  const minValueFilter = eventCfg.minValueFilter || {};

  /* V21.9.149: Roles that have a template configured + are subscribed (used by Test Send) */
  const sendableRoles = (meta.recipientRoles || []).filter(r => recipients[r] && (templates[r] || (DEFAULT_EVENT_TEMPLATES[eventType] && DEFAULT_EVENT_TEMPLATES[eventType][r])));

  return (
    <div style={{marginBottom:10, border:"1px solid " + (enabled ? T.accent+"50" : T.brd),
      borderRadius:10, background: enabled ? T.accent+"06" : T.cardSolid, overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer"}}
        onClick={() => setOpen(o => !o)}>
        <span style={{fontSize:FS-2, color:T.textMut}}>{open ? "▼" : "▶"}</span>
        <span style={{fontSize:FS, fontWeight:700, color:T.text}}>{meta.label || eventType}</span>
        <span style={{fontSize:FS-3, color:T.textMut}}>{meta.description || ""}</span>
        <div style={{flex:1}}/>
        <span onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{
          padding:"4px 12px", borderRadius:8,
          background: enabled ? T.ok+"15" : T.bg,
          border: "1px solid " + (enabled ? T.ok : T.brd),
          color: enabled ? T.ok : T.textMut,
          fontSize:FS-2, fontWeight:700, cursor:"pointer",
        }}>
          {enabled ? "✓ مفعّل" : "متوقف"}
        </span>
      </div>

      {/* Body */}
      {open && (
        <div style={{padding:"4px 14px 14px", borderTop:"1px solid "+T.brd, background:T.bg}}>
          <div style={{fontSize:FS-3, color:T.textMut, marginBottom:6, fontStyle:"italic"}}>
            ⚙️ {meta.detection}
          </div>
          {/* V19.70.2: show enabledAt timestamp so user knows the cutoff for backfill */}
          {enabled && eventCfg.enabledAt && (
            <div style={{fontSize:FS-3, color:T.ok, marginBottom:10, padding:"4px 8px",
              background:T.ok+"10", border:"1px solid "+T.ok+"30", borderRadius:6}}>
              ✓ مفعّل من: {new Date(eventCfg.enabledAt).toLocaleString("ar-EG")}
              <span style={{marginRight:6, color:T.textMut, fontWeight:500}}>
                — لن تتم معالجة أي event حصل قبل التاريخ ده
              </span>
            </div>
          )}

          {/* Threshold (only for cron-only events) */}
          {isCronOnly && (
            <div style={{marginBottom:10, display:"flex", gap:10, alignItems:"center"}}>
              <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600}}>الحد (أيام):</label>
              <Inp type="number" value={eventCfg.thresholdDays || ""}
                onChange={(v) => onThresholdChange(v)} style={{width:80}}/>
              <span style={{fontSize:FS-3, color:T.textMut}}>
                {eventType === "lateOrder" ? "أوردر بدون activity" : "شيك يستحق خلال X يوم"}
              </span>
            </div>
          )}

          {/* Recipients */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:FS-2, fontWeight:700, color:T.textSec, marginBottom:6}}>
              يبعت لـ:
            </div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              {(meta.recipientRoles || []).map(role => {
                const on = !!recipients[role];
                /* V19.70.10: supplier role added for checkPaymentIssued */
                const roleLabel = role === "customer" ? "👤 العميل"
                                : role === "supplier" ? "🏪 المورد"
                                : role === "owner"    ? `🏭 المالك (${ownerCount})`
                                : role;
                return (
                  <div key={role} onClick={() => onToggleRecipient(role)} style={{
                    cursor:"pointer", padding:"5px 12px", borderRadius:8,
                    background: on ? T.accent+"15" : T.bg,
                    border: "1px solid " + (on ? T.accent : T.brd),
                    color: on ? T.accent : T.textMut, fontSize:FS-2, fontWeight:700,
                  }}>
                    {on ? "☑" : "☐"} {roleLabel}
                  </div>
                );
              })}
            </div>
          </div>

          {/* V21.9.150: Min-value filter (only for value/amount events) — owner skips
              notifications below the threshold. Customer/supplier always get notified
              (they're the transacting party). Set 0 or empty = no filter. */}
          {hasValue && recipients.owner && onMinValueChange && (
            <div style={{marginBottom:10, padding:"8px 12px", background:T.warn+"08", border:"1px solid "+T.warn+"30", borderRadius:8}}>
              <div style={{fontSize:FS-2, fontWeight:700, color:T.text, marginBottom:6, display:"flex", alignItems:"center", gap:6}}>
                <span>💰</span>
                <span>الحد الأدنى لإبلاغ المالك (ج.م)</span>
              </div>
              <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
                <Inp type="number" value={minValueFilter.owner || ""}
                  onChange={(v) => onMinValueChange("owner", v)}
                  placeholder="0 = بدون حد"
                  style={{width:140}}/>
                <span style={{fontSize:FS-3, color:T.textMut, lineHeight:1.5, flex:1, minWidth:200}}>
                  لو القيمة في الحدث أقل من ده، المالك لا يستلم — لكن العميل/المورد يستلم طبيعي.
                </span>
              </div>
            </div>
          )}

          {/* Templates per recipient role */}
          {(meta.recipientRoles || []).filter(r => recipients[r]).map(role => (
            <TemplateEditor key={role}
              role={role}
              template={templates[role] || ""}
              variables={meta.variables?.[role] || []}
              eventType={eventType}
              onChange={(v) => onTemplateChange(role, v)}
              onReset={() => onResetTemplate(role)}
            />
          ))}

          {/* V21.9.149: Test Send button — only when at least one role has a usable template */}
          {onTestSend && sendableRoles.length > 0 && (
            <div style={{marginTop:8, paddingTop:10, borderTop:"1px dashed "+T.brd, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
              <span style={{fontSize:FS-2, color:T.textSec, fontWeight:600}}>🧪 جرّب الـ template:</span>
              {sendableRoles.map(role => {
                const roleLabel = role === "customer" ? "العميل"
                                : role === "supplier" ? "المورد"
                                : role === "owner"    ? "المالك"
                                : role === "salesperson" ? "البائع"
                                : role;
                return (
                  <Btn key={role} small ghost onClick={() => setTestModal({ role, phone: "" })}>
                    📤 إرسال تجربة ({roleLabel})
                  </Btn>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* V21.9.149: Test Send modal — phone input + send button */}
      {testModal && (
        <div onClick={() => setTestModal(null)} style={{position:"fixed", inset:0, zIndex:99999, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
          <div onClick={e => e.stopPropagation()} style={{background:T.cardSolid, borderRadius:14, padding:20, maxWidth:420, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.3)", border:"1px solid "+T.brd}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
              <div style={{fontWeight:800, fontSize:FS+1, color:T.text}}>🧪 إرسال تجربة</div>
              <Btn ghost small onClick={() => setTestModal(null)}>✕</Btn>
            </div>
            <div style={{fontSize:FS-2, color:T.textSec, marginBottom:6}}>
              الحدث: <b style={{color:T.text}}>{meta.label || eventType}</b>
            </div>
            <div style={{fontSize:FS-2, color:T.textSec, marginBottom:10}}>
              الـ role: <b style={{color:T.text}}>{testModal.role}</b> · هـ نـ render الـ template بـ بيانات تجريبية ونبعتها لرقم واتساب يدوي.
            </div>
            <label style={{fontSize:FS-2, color:T.textSec, fontWeight:600, display:"block", marginBottom:4}}>
              رقم الواتساب
            </label>
            <Inp value={testModal.phone} onChange={(v) => setTestModal(m => ({ ...m, phone: v }))}
              placeholder="01xxxxxxxxx أو +20..."/>
            <div style={{marginTop:14, display:"flex", gap:8, justifyContent:"flex-end"}}>
              <Btn ghost onClick={() => setTestModal(null)} disabled={busy}>إلغاء</Btn>
              <Btn primary disabled={busy || !testModal.phone.trim()} onClick={async () => {
                const r = await onTestSend(testModal.role, testModal.phone);
                if (r?.ok) setTestModal(null);
              }} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>
                {busy ? "⏳..." : "📤 ارسل"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Template editor (textarea + variables hint + preview) ─── */
/* V19.80.15: Daily report template editor — textarea + clickable variable
   chips that insert at the cursor position + inline preview that resolves
   the template against live data. Layout mirrors the per-event TemplateEditor
   below for visual consistency, but with daily-report-specific variable list
   and a multi-line preview area (the daily report message is much longer). */
function DailyReportTemplateEditor({ template, onChange, onReset, previewVars, onComputePreview, previewText, isMob }) {
  const [showPreview, setShowPreview] = useState(false);
  const taRef = useRef(null);

  const insertVar = (name) => {
    const tag = `{${name}}`;
    const ta = taRef.current;
    const cur = template || "";
    if (!ta) {
      onChange(cur + tag);
      return;
    }
    const start = ta.selectionStart ?? cur.length;
    const end = ta.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + tag + cur.slice(end);
    onChange(next);
    /* Restore caret position right after the inserted tag */
    setTimeout(() => {
      try {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + tag.length;
      } catch (_) { /* ignore — focus race */ }
    }, 0);
  };

  /* Variable groups for clearer organization in the chip area */
  const groups = [
    { label: "📅 الترويسة",  vars: ["date", "factoryName"] },
    { label: "💰 المبيعات",   vars: ["salesValue", "salesQty", "salesInvoices", "topCustomer", "topCustomerValue", "topCustomerQty"] },
    { label: "🛒 المشتريات",  vars: ["purchasesValue", "purchasesInvoices", "purchasesReceipts"] },
    { label: "💵 الخزنة",    vars: ["treasuryIn", "treasuryOut", "netCash"] },
    { label: "🏭 التشغيل",   vars: ["deliveredToday", "lateOrdersCount"] },
    { label: "⚠️ تحذيرات",  vars: ["dueChecksCount", "dueChecksAmount"] },
    { label: "📋 المهام",    vars: ["tasksOpen"] },
    { label: "📦 أقسام كاملة (drop-in blocks)", vars: ["salesSection", "purchasesSection", "treasurySection", "productionSection", "alertsSection", "tasksSection", "comparisonSection"] },
  ];

  return (
    <div style={{marginBottom:14, padding:"12px 14px", background:T.accent+"06",
      border:"1px solid "+T.accent+"25", borderRadius:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:FS, fontWeight:800, color:T.accent}}>
          📝 قالب رسالة الواتساب
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <span onClick={() => { setShowPreview(s => !s); if (!showPreview) onComputePreview(); }} style={{
            fontSize:FS-2, color:T.ok, cursor:"pointer", fontWeight:700,
            padding:"3px 9px", borderRadius:6, background:T.ok+"12", border:"1px solid "+T.ok+"30"}}>
            {showPreview ? "إخفاء المعاينة" : "👁 معاينة مباشرة"}
          </span>
          <span onClick={onReset} style={{
            fontSize:FS-2, color:T.warn, cursor:"pointer", fontWeight:700,
            padding:"3px 9px", borderRadius:6, background:T.warn+"12", border:"1px solid "+T.warn+"30"}}>
            ↺ القالب الافتراضي
          </span>
        </div>
      </div>

      <textarea ref={taRef} value={template || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={isMob ? 10 : 14}
        spellCheck={false}
        style={{width:"100%", padding:"10px 12px", fontSize:FS-1,
          fontFamily:"'Cairo', monospace, sans-serif",
          border:"1.5px solid "+T.brd, borderRadius:8,
          background:T.cardSolid, color:T.text, resize:"vertical", lineHeight:1.7,
          direction:"rtl", textAlign:"start", boxSizing:"border-box"}}/>

      <div style={{marginTop:10}}>
        <div style={{fontSize:FS-2, color:T.textSec, marginBottom:6, fontWeight:700}}>
          المتغيرات المتاحة (اضغط لإدراج عند مكان المؤشر):
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {groups.map(g => (
            <div key={g.label} style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}>
              <span style={{fontSize:FS-3, color:T.textMut, fontWeight:700, marginInlineEnd:4, minWidth:isMob?"auto":140}}>
                {g.label}:
              </span>
              {g.vars.map(v => (
                <span key={v} onClick={() => insertVar(v)} title={"إدراج {" + v + "}"} style={{
                  padding:"3px 8px", borderRadius:5, fontSize:FS-3, fontWeight:700,
                  background:T.accent+"15", color:T.accent, border:"1px solid "+T.accent+"30",
                  cursor:"pointer", fontFamily:"monospace", whiteSpace:"nowrap",
                  transition:"all 0.1s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = T.accent+"25"}
                onMouseLeave={(e) => e.currentTarget.style.background = T.accent+"15"}
                >{`{${v}}`}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {showPreview && (
        <div style={{marginTop:12, padding:"10px 14px", background:"#0d1117", color:"#e6edf3",
          borderRadius:8, fontSize:FS-1, lineHeight:1.7, fontFamily:"inherit",
          whiteSpace:"pre-wrap", direction:"rtl", textAlign:"start",
          maxHeight:isMob?320:480, overflowY:"auto",
          border:"1px solid "+T.ok+"40",
          boxShadow:"inset 0 1px 0 rgba(255,255,255,0.05)"}}>
          {previewText || "(اضغط 👁 معاينة لتشوف الناتج بالقيم الفعلية)"}
        </div>
      )}

      <div style={{marginTop:10, fontSize:FS-3, color:T.textMut, lineHeight:1.6}}>
        💡 <b>نصيحة:</b> الـ{" "}<code style={{background:T.bg,padding:"1px 5px",borderRadius:3,fontFamily:"monospace"}}>{"{xxxSection}"}</code>{" "}
        بـ تـ insert كتلة كاملة من الـ section (تختفي تلقائياً لو الـ section متوقّفة من فوق).
        الـ granular vars (زي{" "}<code style={{background:T.bg,padding:"1px 5px",borderRadius:3,fontFamily:"monospace"}}>{"{salesValue}"}</code>{")"} بـ تـ insert رقم/نص واحد.
      </div>
    </div>
  );
}

function TemplateEditor({ role, template, variables, eventType, onChange, onReset }){
  const [showPreview, setShowPreview] = useState(false);
  const sample = samplePayload(eventType);
  const previewText = substituteTemplate(template, sample);
  return (
    <div style={{marginBottom:12, padding:"10px 12px", background:T.cardSolid,
      border:"1px solid "+T.brd, borderRadius:8}}>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
        <span style={{fontSize:FS-2, fontWeight:700, color:T.textSec}}>
          📝 الرسالة لـ {role === "customer" ? "العميل" : role === "owner" ? "المالك" : role}:
        </span>
        <div style={{flex:1}}/>
        <span onClick={() => setShowPreview(s => !s)} style={{
          fontSize:FS-3, color:T.accent, cursor:"pointer", fontWeight:600}}>
          {showPreview ? "إخفاء المعاينة" : "👁 معاينة"}
        </span>
        <span onClick={onReset} style={{
          fontSize:FS-3, color:T.warn, cursor:"pointer", fontWeight:600}}>
          ↺ default
        </span>
      </div>
      <textarea value={template} onChange={(e) => onChange(e.target.value)}
        rows={5} style={{width:"100%", padding:"8px 10px", fontSize:FS-1,
          fontFamily:"inherit", border:"1px solid "+T.brd, borderRadius:6,
          background:T.bg, color:T.text, resize:"vertical", lineHeight:1.6}}/>
      <div style={{marginTop:6, fontSize:FS-3, color:T.textMut}}>
        Variables متاحة: {variables.map(v => (
          <code key={v} style={{padding:"1px 6px", margin:"0 2px",
            background:T.accent+"15", color:T.accent, borderRadius:4}}>{v}</code>
        ))}
      </div>
      {showPreview && (
        <div style={{marginTop:8, padding:"8px 12px", background:T.ok+"10",
          border:"1px solid "+T.ok+"40", borderRadius:6, whiteSpace:"pre-wrap",
          fontSize:FS-1, color:T.text, lineHeight:1.7}}>
          {previewText}
        </div>
      )}
    </div>
  );
}

/* ── Subcomponent: debug tools panel ──
   V19.69.5: hides the manual scheduler trigger + lastSentAt reset behind a
   collapsed expander. The whole point of the VPS cron is "the system runs
   itself" — keeping daily-action buttons in the main UI creates a false mental
   model that the user has to push something every day. The buttons are still
   here for: (1) emergency manual override if the cron breaks, (2) admin
   testing scenarios. Default-collapsed. */
function DebugToolsPanel({ onTrigger, onReset, hasLastSent, busy }){
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:12, border:"1px dashed "+T.brd, borderRadius:10, background:T.bg, overflow:"hidden"}}>
      <button onClick={() => setOpen(o => !o)}
        style={{width:"100%", padding:"10px 14px", background:"none", border:"none",
                display:"flex", alignItems:"center", gap:8, cursor:"pointer",
                fontSize:FS-1, color:T.textSec, fontWeight:600, textAlign:"start"}}>
        <span style={{fontSize:FS-2, color:T.textMut}}>{open ? "▼" : "▶"}</span>
        <span>🔧 أدوات تشخيص</span>
        <span style={{flex:1}}/>
        <span style={{fontSize:FS-3, color:T.textMut, fontWeight:500}}>
          {open ? "(الـsystem شغّال تلقائياً — مش محتاج تضغط أي حاجة)" : "(للطوارئ والاختبار فقط)"}
        </span>
      </button>
      {open && <div style={{padding:"4px 14px 14px", borderTop:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-2, color:T.textMut, marginBottom:10, lineHeight:1.7}}>
          الـVPS cron بيـping الـendpoint كل 5 دقائق — الإرسال التلقائي بيشتغل لوحده في الميعاد المحدد.
          الأزرار دي للـmanual override (لو الـcron broken) أو للـtest scenarios:
        </div>
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          <Btn onClick={() => onTrigger()} disabled={busy}
            style={{background:T.accent, color:"#fff", border:"none", fontWeight:700, fontSize:FS-1}}>
            {busy ? "⏳..." : "🔄 شغّل الـscheduler يدوياً"}
          </Btn>
          {hasLastSent && <Btn ghost onClick={onReset} disabled={busy}
            style={{borderColor:T.warn, color:T.warn, fontWeight:700, fontSize:FS-1}}
            title="مسح علامة 'تم إرساله اليوم' عشان تقدر تختبر الـscheduler تاني في نفس اليوم">
            ↺ مسح "تم إرساله اليوم"
          </Btn>}
        </div>
      </div>}
    </div>
  );
}

/* ── Subcomponent: cron status panel ──
   V19.69: shows whether the VPS cron tick is alive (last heartbeat) +
   computes the next-scheduled-run based on Cairo timezone. If the cron
   hasn't pinged in >15 minutes, surface a warning. */
function CronStatusPanel({ automation, dailyReport }){
  const lastTickAt = automation?.lastTickAt;
  const lastTickTime = lastTickAt ? new Date(lastTickAt) : null;
  const minutesSinceTick = lastTickTime
    ? Math.floor((Date.now() - lastTickTime.getTime()) / 60000)
    : null;
  const cronAlive = minutesSinceTick !== null && minutesSinceTick < 15;

  /* V21.9.184: Compute next run in the configured timezone (was hardcoded
     Africa/Cairo). Same fallback strategy as the server side. */
  const cronTz = (automation?.timezone && String(automation.timezone).trim()) || "Africa/Cairo";
  const nextRunInfo = (() => {
    if (!dailyReport?.enabled) return { label: "متوقف", soon: false };
    const time = dailyReport.time || "08:00";
    const m = String(time).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { label: "وقت غير صالح", soon: false };
    /* Get current local HH:MM in the configured tz; fall back to Cairo on bad IANA string */
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: cronTz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
    } catch (_) {
      fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
    }
    const parts = fmt.formatToParts(new Date()).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
    const cairoMin = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
    const schedMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const lastSent = dailyReport.lastSentAt;
    /* Was today's run already sent? Convert lastSent to Cairo date */
    let alreadySentToday = false;
    if (lastSent) {
      try {
        const lp = fmt.formatToParts(new Date(lastSent)).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
        alreadySentToday = (`${lp.year}-${lp.month}-${lp.day}` === `${parts.year}-${parts.month}-${parts.day}`);
      } catch(_){}
    }
    if (alreadySentToday) {
      return { label: `تم إرساله اليوم — التالي: ${time} غداً`, soon: false };
    }
    if (cairoMin < schedMin) {
      const wait = schedMin - cairoMin;
      const h = Math.floor(wait / 60), mm = wait % 60;
      return { label: `${time} اليوم (${h>0?h+" س ":""}${mm} د)`, soon: wait <= 30 };
    }
    /* Past scheduled time and not sent → due now */
    return { label: `🟢 مستحق الآن — في الـtick القادم`, soon: true };
  })();

  return <div style={{
    marginTop:12, padding:"12px 14px",
    background: cronAlive ? T.ok+"06" : T.warn+"06",
    border: "1px solid " + (cronAlive ? T.ok+"30" : T.warn+"40"),
    borderRadius:10, fontSize:FS-2, color:T.text, lineHeight:1.7,
  }}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8}}>
      <div style={{display:"flex", alignItems:"center", gap:8, fontWeight:700}}>
        <span style={{fontSize:18}}>{cronAlive ? "🟢" : "🟡"}</span>
        <span>VPS Cron: {cronAlive ? "نشط" : (lastTickAt ? `متوقف منذ ${minutesSinceTick} د` : "لم يبدأ بعد")}</span>
      </div>
      <div style={{fontSize:FS-2, color:T.textSec}}>
        آخر tick: {lastTickAt ? new Date(lastTickAt).toLocaleString("ar-EG") : "—"}
      </div>
    </div>
    <div style={{marginTop:8, paddingTop:8, borderTop:"1px solid "+T.brd, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8}}>
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <span style={{fontSize:16}}>⏰</span>
        <span style={{fontWeight:700, color: nextRunInfo.soon ? T.accent : T.text}}>
          الإرسال القادم: {nextRunInfo.label}
        </span>
      </div>
      <div style={{fontSize:FS-3, color:T.textMut}}>
        المنطقة الزمنية: <code>{cronTz}</code>
      </div>
    </div>
    {!cronAlive && <CronSetupHelper />}
  </div>;
}

/* V19.69.2: inline setup commands ready-to-copy for the VPS cron.
   Pre-V19.69.2 we just pointed users to docs/V19.69.md — too friction.
   Now the panel shows the exact crontab line with the correct domain
   pre-filled (from window.location.origin), so the user copies once. */
function CronSetupHelper(){
  const [showSetup, setShowSetup] = useState(false);
  const origin = (typeof window !== "undefined") ? window.location.origin : "https://your-app.vercel.app";
  const cronLine = `*/5 * * * * curl -fsS "${origin}/api/automation-tick" -H "Authorization: Bearer YOUR_SECRET" >> /var/log/clark-automation.log 2>&1`;
  const testLine = `curl -v "${origin}/api/automation-tick" -H "Authorization: Bearer YOUR_SECRET"`;
  const copy = (txt) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(txt).then(() => showToast("✓ تم النسخ")).catch(() => showToast("⛔ النسخ فشل"));
    }
  };
  return <div style={{marginTop:10}}>
    <div onClick={() => setShowSetup(!showSetup)} style={{
      cursor:"pointer", padding:"8px 12px", background:T.warn+"15", border:"1px solid "+T.warn+"40",
      borderRadius:8, fontSize:FS-2, color:T.warn, fontWeight:700,
      display:"flex", justifyContent:"space-between", alignItems:"center",
    }}>
      <span>⚠️ الـcron مش بيـping. اضغط لعرض خطوات الـsetup</span>
      <span>{showSetup ? "▴" : "▾"}</span>
    </div>
    {showSetup && <div style={{
      marginTop:8, padding:"12px 14px", background:T.cardSolid,
      border:"1px solid "+T.brd, borderRadius:8, fontSize:FS-2, color:T.text, lineHeight:1.7,
    }}>
      <div style={{fontWeight:800, marginBottom:6, fontSize:FS-1, color:T.accent}}>
        الإعداد على VPS الـContabo (مرة واحدة)
      </div>

      <div style={{marginTop:10, fontWeight:700, color:T.text}}>1️⃣ إضافة الـsecret في Vercel</div>
      <div style={{padding:"6px 10px", background:T.bg, borderRadius:6, fontSize:FS-3, color:T.textSec, marginTop:4}}>
        Vercel Dashboard → Project → Settings → Environment Variables
        <br/>Name: <code style={{background:T.cardSolid, padding:"1px 5px", borderRadius:3}}>AUTOMATION_TICK_SECRET</code>
        <br/>Value: random 32-char string (e.g. <code style={{background:T.cardSolid, padding:"1px 5px", borderRadius:3}}>XK7p9mQ2nL5vR8sT1wY4cE6gA3bF0hJ9</code>)
        <br/>ثم Redeploy
      </div>

      <div style={{marginTop:10, fontWeight:700, color:T.text}}>2️⃣ SSH للـVPS و إضافة crontab</div>
      <div style={{padding:"8px 10px", background:"#0d1117", color:"#e6edf3",
        borderRadius:6, fontSize:FS-3, fontFamily:"monospace", direction:"ltr",
        position:"relative", marginTop:4, wordBreak:"break-all", whiteSpace:"pre-wrap"}}>
        <span onClick={() => copy("crontab -e")} style={{position:"absolute", top:6, left:6, cursor:"pointer", padding:"2px 8px", background:"#fff2", borderRadius:4, fontSize:FS-3, color:"#fff"}}>📋</span>
        crontab -e
      </div>
      <div style={{padding:"8px 10px", background:"#0d1117", color:"#e6edf3",
        borderRadius:6, fontSize:FS-3, fontFamily:"monospace", direction:"ltr",
        position:"relative", marginTop:4, wordBreak:"break-all", whiteSpace:"pre-wrap"}}>
        <span onClick={() => copy(cronLine)} style={{position:"absolute", top:6, left:6, cursor:"pointer", padding:"2px 8px", background:"#fff2", borderRadius:4, fontSize:FS-3, color:"#fff"}}>📋</span>
        {cronLine}
      </div>
      <div style={{fontSize:FS-3, color:T.textMut, marginTop:4}}>
        ⚠️ استبدل <code>YOUR_SECRET</code> بالـsecret اللي حطيته في Vercel.
      </div>

      <div style={{marginTop:10, fontWeight:700, color:T.text}}>3️⃣ اختبار يدوي قبل الـcron</div>
      <div style={{padding:"8px 10px", background:"#0d1117", color:"#e6edf3",
        borderRadius:6, fontSize:FS-3, fontFamily:"monospace", direction:"ltr",
        position:"relative", marginTop:4, wordBreak:"break-all", whiteSpace:"pre-wrap"}}>
        <span onClick={() => copy(testLine)} style={{position:"absolute", top:6, left:6, cursor:"pointer", padding:"2px 8px", background:"#fff2", borderRadius:4, fontSize:FS-3, color:"#fff"}}>📋</span>
        {testLine}
      </div>
      <div style={{fontSize:FS-3, color:T.textMut, marginTop:4}}>
        ✅ يفترض يرجع JSON بـ<code>{"{"}ok:true,cairoTime:"..."{"}"}</code>
        <br/>❌ 401 = الـsecret غلط · 500 = الـsecret مش set في Vercel
      </div>

      <div style={{marginTop:10, padding:"6px 10px", background:T.accent+"08", borderRadius:6, fontSize:FS-3, color:T.text}}>
        💡 <b>اختبار سريع بدون cron:</b> اضغط <b>"🔄 شغّل الـscheduler الآن"</b> — يـcall نفس الـendpoint بـFirebase admin token (مش محتاج secret لو عندك صلاحية admin/manager).
      </div>
    </div>}
  </div>;
}

/* ── Subcomponent: bridge status pill ──
   V19.68 FIX: useEffect (not useMemo) for the async call. useMemo runs the fn
   for memo-value computation; React doesn't guarantee its setState commits.
   Also fixed the field — bridge /status returns `waState` + `waReady`, not `state`.
   Refresh every 30s so the pill stays fresh while the user is on the page. */
function BridgeStatusPill({ bridgeUrl, bridgeToken }){
  const [status, setStatus] = useState({ label: "...", ready: false });

  useEffect(() => {
    let dead = false;
    const refresh = async () => {
      if (!bridgeUrl) {
        if (!dead) setStatus({ label: "غير مضبوط", ready: false });
        return;
      }
      const s = await bridgeStatus(bridgeUrl, bridgeToken);
      if (dead) return;
      if (s && s.ok) {
        const ready = !!s.waReady;
        const wstate = s.waState || (ready ? "READY" : "INIT");
        setStatus({ label: ready ? "READY" : wstate, ready });
      } else {
        setStatus({ label: s?.error || "غير متصل", ready: false });
      }
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { dead = true; clearInterval(interval); };
  }, [bridgeUrl, bridgeToken]);

  return <div style={{
    padding:"8px 14px", borderRadius:10,
    background: status.ready ? T.ok+"12" : T.warn+"12",
    border:"1px solid " + (status.ready ? T.ok+"40" : T.warn+"40"),
    color: status.ready ? T.ok : T.warn,
    fontSize:FS-2, fontWeight:800, display:"flex", alignItems:"center", gap:6,
  }}>
    <span>{status.ready ? "🟢" : "🟡"}</span>
    <span>WA Bridge: {status.label}</span>
  </div>;
}
