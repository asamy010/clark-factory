/* ═══════════════════════════════════════════════════════════════
   CLARK V21.27.37 — مراقب المجدول (Scheduler Watchdog)

   GET/POST /api/cron/scheduler-watchdog
   بيشتغل عبر Vercel Cron (مستقل تماماً عن الـ VPS cron) — عشان لو الـ VPS
   crontab اللي بيضرب /api/automation-tick وقف، حد يكتشف ده ويبلّغ.

   المشكلة اللي بيحلّها (V21.27.37 incident):
   التقارير/التريجرات/الحملات كلها بتعتمد على VPS crontab خارجي بيضرب
   automation-tick كل 5 دقايق. لو الـ VPS وقف، كله بيقف بصمت — ومؤشّر واتساب
   يفضل أخضر لإن جلسة واتساب نفسها شغّالة. مفيش حاجة كانت بتكتشف توقّف المجدول
   إلا لوحة مدفونة في صفحة الأتمتة.

   إيه اللي بيعمله:
   1. يقرأ factory/config.automation.lastTickAt.
   2. لو آخر نبضة من أكتر من STALE_MIN دقيقة → المجدول متوقف:
      - يبعت واتساب واحد لمستلمي الأتمتة (cfg.automation.recipients) عبر الـ
        bridge (best-effort) — مرة واحدة كل ALERT_COOLDOWN_H ساعة (idempotency
        عبر automation.watchdogAlertedAt) إلا مع force.
   3. لو المجدول رجع نشط → يصفّي watchdogAlertedAt عشان أي توقّف جديد يبلّغ.

   مهم: ده Vercel cron (بنية تحتية مستقلة عن الـ VPS) فبيكتشف موت الـ VPS cron
   فعلاً. الإرسال عبر الـ bridge — بيشتغل في السيناريو الأشيع (VPS cron ميّت
   بس البريدج شغّال). لو البريدج كمان ميّت، التنبيه مش هيوصل واتساب لكن
   الحالة بتتسجّل والمؤشّر في التطبيق بيوضّحها.

   Auth: CRON_SECRET (header) أو admin Bearer token — نفس نمط باقي الـ crons.
   query/body: { force?, staleMin? }
   ═══════════════════════════════════════════════════════════════ */

import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { bridgeSend } from "../_eventProcessor.js";

const STALE_MIN = 20;          /* المجدول يُعتبر متوقف بعد كده */
const ALERT_COOLDOWN_H = 6;    /* تنبيه واحد كل كام ساعة لمنع الإزعاج */

function isAuthorizedCron(req){
  const secret = (process.env.CRON_SECRET || "").trim();
  if(!secret) return false;
  if((req.headers["x-vercel-cron-secret"] || "") === secret) return true;
  if(String(req.headers.authorization || "").trim() === "Bearer " + secret) return true;
  return false;
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "GET" && req.method !== "POST"){
    return res.status(405).json({ ok: false, error: "GET/POST فقط" });
  }

  /* مصادقة مزدوجة: cron secret أو أدمن */
  if(!isAuthorizedCron(req)){
    const auth = await verifyAdminToken(req.headers.authorization);
    if(!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: auth.error || "unauthorized" });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const q = req.query || {};
  const force = body.force === true || q.force === "1";
  const staleMin = Math.min(180, Math.max(10, Number(body.staleMin || q.staleMin) || STALE_MIN));

  try {
    const db = getDb();
    const ref = db.collection("factory").doc("config");
    const snap = await ref.get();
    if(!snap.exists) return res.status(404).json({ ok: false, error: "factory/config مش موجود" });
    const cfg = snap.data() || {};
    const auto = cfg.automation || {};

    const lastTickAt = auto.lastTickAt || null;
    const minsSince = lastTickAt ? Math.floor((Date.now() - new Date(lastTickAt).getTime()) / 60000) : null;
    const stale = (minsSince == null) || (minsSince >= staleMin);

    /* المجدول نشط → نصفّي علم التنبيه عشان أي توقّف جديد يبلّغ */
    if(!stale){
      if(auto.watchdogAlertedAt){
        await ref.set({ automation: { watchdogAlertedAt: null } }, { merge: true });
      }
      return res.status(200).json({ ok: true, healthy: true, minsSince });
    }

    /* المجدول متوقف — هل نبّهنا قريّب؟ */
    const alertedAt = auto.watchdogAlertedAt ? new Date(auto.watchdogAlertedAt).getTime() : 0;
    const cooldownMs = ALERT_COOLDOWN_H * 3600000;
    if(!force && alertedAt && (Date.now() - alertedAt) < cooldownMs){
      return res.status(200).json({ ok: true, healthy: false, minsSince, alert: { skipped: "cooldown", lastAlert: auto.watchdogAlertedAt } });
    }

    /* مستلمو الأتمتة (نفس مصدر التقارير) */
    const bridgeUrl = (cfg.campaignBridge || {}).url || "";
    const bridgeToken = (cfg.campaignBridge || {}).token || "";
    const seen = new Set(); const phones = [];
    for(const r of ((auto.recipients || []))){
      if(!r || typeof r.phone !== "string" || !r.phone.trim()) continue;
      const digits = r.phone.replace(/[^0-9]/g, "");
      if(!digits || seen.has(digits)) continue;
      seen.add(digits); phones.push(r.phone);
    }

    if(!bridgeUrl){ return res.status(200).json({ ok: true, healthy: false, minsSince, alert: { skipped: "bridge-not-configured" } }); }
    if(phones.length === 0){ return res.status(200).json({ ok: true, healthy: false, minsSince, alert: { skipped: "no-recipients" } }); }

    const sinceTxt = minsSince == null ? "مفيش نبضة مسجّلة" : ("آخر نبضة من " + minsSince + " دقيقة");
    const text =
      "⚠️ تنبيه CLARK — المجدول متوقف\n\n" +
      "المجدول التلقائي (automation-tick) " + sinceTxt + ".\n" +
      "ده معناه إن: التقارير اليومية + تنبيهات التريجر + الحملات المجدولة *مش بتشتغل* دلوقتي.\n\n" +
      "السبب الأرجح: الـ VPS cron اللي بيضرب الـ endpoint وقف. راجِع:\n" +
      "• crontab على الـ VPS (السطر اللي بيضرب /api/automation-tick)\n" +
      "• وصول الـ VPS للنت + إن AUTOMATION_TICK_SECRET متطابق";

    /* id ثابت بالساعة + الهاتف — يمنع تكرار نفس التنبيه لو الـ cron اشتغل مرتين */
    const hourKey = new Date().toISOString().slice(0, 13);
    const messages = phones.map(phone => ({ id: "watchdog:" + hourKey + "|" + phone, phone, message: text, role: "owner" }));

    let alert;
    try {
      const r = await bridgeSend(bridgeUrl, bridgeToken, messages);
      await ref.set({ automation: { watchdogAlertedAt: new Date().toISOString() } }, { merge: true });
      alert = { attempted: true, sent: true, recipients: phones.length, bridgeResult: r?.ok ?? true };
    } catch(e){
      /* فشل الإرسال (غالباً البريدج كمان ميّت) — ما نسجّلش watchdogAlertedAt
         عشان نحاول تاني في التشغيلة الجاية */
      alert = { attempted: true, sent: false, error: e.message };
    }

    return res.status(200).json({ ok: true, healthy: false, minsSince, alert });
  } catch(e){
    console.error("[V21.27.37 scheduler-watchdog] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
