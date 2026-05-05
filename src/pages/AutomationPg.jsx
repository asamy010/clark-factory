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

import { useState, useMemo, useEffect } from "react";
import { Btn, Card, Sel, Inp, DelBtn } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { gid } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import { buildDailyReport, DEFAULT_AUTOMATION_CONFIG } from "../utils/automation/buildDailyReport.js";

const DEFAULT_BRIDGE_URL = "http://localhost:3001";

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
      const report = buildDailyReport(data, { config: dailyReport });
      const messages = reportRecipientsList.map(r => ({
        phone: r.phone,
        message: report.text,
      }));
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

      {/* Action buttons */}
      <div style={{display:"flex", gap:10, flexWrap:"wrap", borderTop:"1px solid "+T.brd, paddingTop:14}}>
        <Btn ghost onClick={onPreview}>👁 معاينة الرسالة</Btn>
        <Btn primary onClick={onSendTest} disabled={busy}
          style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>
          {busy ? "⏳ جاري الإرسال..." : "📤 ارسل تجربة (مباشر)"}
        </Btn>
        {/* V19.69.2: trigger the scheduler via /api/automation-tick using the
            current admin's Firebase ID token. Lets the user test the FULL flow
            (auth + endpoint + report build + bridge + history) without waiting
            for the VPS cron tick. After a successful run, marks lastSentAt so
            the cron won't send a duplicate today. */}
        <Btn onClick={() => onTriggerScheduler()} disabled={busy}
          style={{background:T.accent, color:"#fff", border:"none", fontWeight:800}}>
          {busy ? "⏳..." : "🔄 شغّل الـscheduler الآن"}
        </Btn>
        <div style={{flex:1}}/>
        <div style={{fontSize:FS-2, color:T.textMut, alignSelf:"center"}}>
          المستلمون: {reportRecipientsList.length}
        </div>
      </div>

      {/* V19.69: cron status panel */}
      <CronStatusPanel automation={automation} dailyReport={dailyReport} />
    </Card>}

    {/* ─── Recipients Tab ─── */}
    {tab === "recipients" && <Card title="👥 المستلمون">
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
        : <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", minWidth:500}}>
              <thead>
                <tr>{["الاسم", "الرقم", "تقرير يومي", "أُضيف", ""].map(h =>
                  <th key={h} style={{padding:"8px 10px", fontSize:FS-2, fontWeight:700, color:T.textSec, borderBottom:"1px solid "+T.brd, textAlign:"start"}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => {
                  const subscribed = !r.subscribedReports || r.subscribedReports.includes("dailyReport");
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

  /* Compute next run in Cairo time */
  const nextRunInfo = (() => {
    if (!dailyReport?.enabled) return { label: "متوقف", soon: false };
    const time = dailyReport.time || "08:00";
    const m = String(time).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { label: "وقت غير صالح", soon: false };
    /* Get current Cairo HH:MM */
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
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
        المنطقة الزمنية: Africa/Cairo (UTC+2)
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
