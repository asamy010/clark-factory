/* ═══════════════════════════════════════════════════════════════
   CLARK V21.21.34 — المطابقة المالية اليومية (Roadmap Phase 1.3)

   GET/POST /api/cron/reconcile-financials
   يعمل يومياً عبر Vercel Cron (وممكن يدوياً من التشخيصات).

   إيه اللي بيعمله:
   1. يقرأ نافذة آخر N يوم (افتراضي 45) من: treasuryDays +
      accountingDays + treasuryTransfersDays + salesInvoicesDays +
      purchaseInvoicesDays + factory/config.
   2. يشغّل فحوصات api/_reconcileChecks.js النقية (أرجل التحويلات،
      توازن القيود، تكرار حركات الخزنة، فواتير بلا قيد، فشل الترحيل
      غير المُعالج، حجم config).
   3. يكتب التقرير في reconciliationDays/{today} (سجل تاريخي).
   4. لو فيه مشاكل: يبعت واتساب لمستلمي الأتمتة (cfg.automation.
      recipients) عبر الـ bridge — مرة واحدة في اليوم (alertSentAt
      idempotency) إلا لو force=true.

   Auth: CRON_SECRET (header) أو admin Bearer token — نفس نمط باقي
   الـ crons. body/query: { windowDays?, dryRun?, force? }
   dryRun: يرجّع التقرير من غير كتابة ولا واتساب.
   ═══════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import { getDb, setCors, verifyAdminToken } from "../_firebase.js";
import { bridgeSend } from "../_eventProcessor.js";
import { runAllChecks, buildAlertMessage } from "../_reconcileChecks.js";
import { computeMissingTransferLegs, applyTransferLegRepairs } from "../_repairs.js";

/* V21.27.185 — الحد الآمن لعدد الأرجل اللي الإصلاح التلقائي بيكتبها في تشغيلة
   واحدة. لو الانحراف أكبر من كده، غالبًا فيه عطل منهجي → نبلّغ ونوقف الكتابة
   التلقائية (مراجعة بشرية عبر الـ endpoint اليدوي). */
const AUTO_REPAIR_CAP = 50;

function isAuthorizedCron(req){
  const secret = (process.env.CRON_SECRET || "").trim();
  if(!secret) return false;
  if((req.headers["x-vercel-cron-secret"] || "") === secret) return true;
  if(String(req.headers.authorization || "").trim() === "Bearer " + secret) return true;
  return false;
}

function approxBytes(v){
  try { return Buffer.byteLength(JSON.stringify(v) || "", "utf8"); }
  catch(_) { return 0; }
}

function dayId(d){ return d.toISOString().split("T")[0]; }

/* قراءة مدى من مستندات الأيام {entries:[...]} ودمجها بسطر _day لكل عنصر */
async function readDayRange(db, col, from, to){
  const snap = await db.collection(col)
    .where(admin.firestore.FieldPath.documentId(), ">=", from)
    .where(admin.firestore.FieldPath.documentId(), "<=", to)
    .get();
  const out = [];
  snap.forEach(doc => {
    const entries = (doc.data() || {}).entries;
    if(Array.isArray(entries)){
      for(const e of entries){
        if(e && typeof e === "object") out.push({ ...e, _day: doc.id });
      }
    }
  });
  return out;
}

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "GET" && req.method !== "POST"){
    return res.status(405).json({ ok:false, error: "GET/POST فقط" });
  }

  /* مصادقة مزدوجة: cron secret أو أدمن */
  let authBy = "cron";
  if(!isAuthorizedCron(req)){
    const auth = await verifyAdminToken(req.headers.authorization);
    if(!auth.ok) return res.status(auth.status || 401).json({ ok:false, error: auth.error || "unauthorized" });
    authBy = auth.email || auth.uid;
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {});
  const q = req.query || {};
  const windowDays = Math.min(120, Math.max(7, Number(body.windowDays || q.windowDays) || 45));
  const dryRun = body.dryRun === true || q.dryRun === "1";
  const force = body.force === true || q.force === "1";
  const startTs = Date.now();

  try {
    const db = getDb();
    const today = new Date();
    const to = dayId(today);
    const fromD = new Date(today.getTime() - windowDays * 86400000);
    const from = dayId(fromD);

    /* ── القراءة (بالتوازي) ── */
    const cfgSnap = await db.collection("factory").doc("config").get();
    if(!cfgSnap.exists) return res.status(404).json({ ok:false, error: "factory/config مش موجود" });
    const cfg = cfgSnap.data() || {};
    const cfgBytes = approxBytes(cfg);

    const [treasury, accountingEntries, transfers, salesInv, purchInv] = await Promise.all([
      readDayRange(db, "treasuryDays", from, to),
      readDayRange(db, "accountingDays", from, to),
      readDayRange(db, "treasuryTransfersDays", from, to),
      readDayRange(db, "salesInvoicesDays", from, to),
      readDayRange(db, "purchaseInvoicesDays", from, to),
    ]);

    const invoices = [
      ...salesInv.map(i => ({ ...i, _kind: "sales" })),
      ...purchInv.map(i => ({ ...i, _kind: "purchase" })),
    ];

    /* ── الفحوصات (نقية) ──
       هامش يومين لفحص الفواتير: قيد فاتورة على حافة النافذة مش انحراف */
    const invoiceFrom = dayId(new Date(fromD.getTime() + 2 * 86400000));
    const report = runAllChecks({
      transfers, treasury, accountingEntries, invoices,
      cfg, cfgBytes,
      fromDate: invoiceFrom, toDate: to, windowDays,
    });
    report.ranAt = new Date().toISOString();
    report.ranBy = authBy;
    report.configBytes = cfgBytes;
    report.durationMs = Date.now() - startTs;

    /* ════════════════════════════════════════════════════════════════════
       V21.27.185 — الإصلاح التلقائي لأرجل التحويلات المؤكدة الناقصة
       ────────────────────────────────────────────────────────────────────
       يقفل حلقة «الكشف → الإصلاح» اللي كانت يدوية: بدل ما حد يلاحظ التنبيه
       ويضغط زر repair، الـ cron يصلح تلقائيًا — server-side، خارج الـ hot
       path، بنفس منطق endpoint الإصلاح اليدوي (api/_repairs.js — مصدر واحد).

       حواجز الأمان (§0.1 — الكتابة المالية غير المُشرَف عليها):
       • تحفّظي: يكمّل بس الأرجل الناقصة لتحويلات **المستخدم أكّدها** (مفيش
         اختراع فلوس)، idempotent بالـ id.
       • صنف واحد مثبَّت فقط (أرجل التحويلات) — الباقي alert-only لحد ما يثبت.
       • معطّل افتراضيًا: من غير cfg.reconcile.autoRepair=true بيحسب ويبلّغ
         بس (dry-run) — تفعيل الكتابة = قلب flag واحد. ?autoRepair=1 للتشغيل
         اليدوي الفوري.
       • محدود بـ AUTO_REPAIR_CAP — انحراف ضخم = عطل منهجي = مراجعة بشرية.
       • بس لما الخزنة + التحويلات مقسّمين (المسار العام الحالي).
       النطاق = نافذة المطابقة (آخر windowDays) — الانحراف الأقدم يتصلح من
       الـ endpoint اليدوي اللي بيمسح كل الأيام. */
    /* V21.27.186: مُفعّل افتراضيًا (Ahmed فعّله صراحةً بعد شرح المخاطر). يتقفل
       بس لو cfg.reconcile.autoRepair === false. body/query للتشغيل اليدوي الفوري
       من لوحة التشخيصات. */
    const autoRepairOn = (cfg.reconcile || {}).autoRepair !== false
      || body.autoRepair === true || q.autoRepair === "1";
    const canRepairSplit = !!cfg._splitDaysV1674Done && !!cfg._splitDaysV1952Done;
    let autoRepair = { ran: false, eligible: 0 };
    try {
      const { legsToCreate, stats } = computeMissingTransferLegs(transfers, treasury, {
        activeSeason: cfg.activeSeason || "",
        actor: "cron:reconcile-" + authBy,
        reason: "auto-repair-reconcile-v21.27.185",
      });
      const eligible = legsToCreate.length;
      if(eligible === 0){
        autoRepair = { ran: false, eligible: 0 };
      } else if(!canRepairSplit){
        autoRepair = { ran: false, eligible, skipped: "treasury/transfers غير مقسّمين — استخدم endpoint اليدوي" };
      } else if(eligible > AUTO_REPAIR_CAP){
        autoRepair = { ran: false, eligible, skipped: "تجاوز الحد الآمن", cap: AUTO_REPAIR_CAP };
      } else if(dryRun || !autoRepairOn){
        autoRepair = { ran: false, mode: "dry-run", eligible, stats,
          note: autoRepairOn ? "dryRun" : "متوقّف يدويًا (cfg.reconcile.autoRepair=false)" };
      } else {
        const r = await applyTransferLegRepairs(db, legsToCreate);
        autoRepair = { ran: true, eligible, applied: r.written, daysAffected: r.daysAffected, stats };
        try {
          await db.collection("migrationLog").doc("auto-repair-transfers-" + to + "-" + Date.now()).set({
            type: "auto-repair-transfers", status: "success",
            eligible, applied: r.written, daysAffected: r.daysAffected,
            stats, by: "cron:reconcile", ranBy: authBy, at: new Date().toISOString(),
          });
        } catch(_) {}
      }
    } catch(e){
      console.error("[V21.27.185 auto-repair] failed:", e);
      autoRepair = { ran: false, error: e.message };
    }
    report.autoRepair = autoRepair;

    if(dryRun){
      return res.status(200).json({ ok: true, dryRun: true, report });
    }

    /* ── كتابة التقرير (سجل يومي + alertSentAt محفوظ من تشغيلات سابقة) ── */
    const repRef = db.collection("reconciliationDays").doc(to);
    const prevSnap = await repRef.get();
    const prev = prevSnap.exists ? (prevSnap.data() || {}) : {};
    await repRef.set({ ...prev, ...report, date: to }, { merge: false });

    /* ── تنبيه الواتساب — مرة واحدة لليوم إلا مع force ── */
    let alert = { attempted: false };
    if(report.issues.length > 0){
      if(prev.alertSentAt && !force){
        alert = { attempted: false, skipped: "already-alerted-today", alertSentAt: prev.alertSentAt };
      } else {
        const bridgeUrl = (cfg.campaignBridge || {}).url || "";
        const bridgeToken = (cfg.campaignBridge || {}).token || "";
        const recipients = ((cfg.automation || {}).recipients || [])
          .filter(r => r && typeof r.phone === "string" && r.phone.trim());
        /* dedupe بالأرقام فقط (V21.9.55 pattern) */
        const seen = new Set(); const phones = [];
        for(const r of recipients){
          const digits = r.phone.replace(/[^0-9]/g, "");
          if(!digits || seen.has(digits)) continue;
          seen.add(digits); phones.push(r.phone);
        }
        if(!bridgeUrl){
          alert = { attempted: false, skipped: "bridge-not-configured" };
        } else if(phones.length === 0){
          alert = { attempted: false, skipped: "no-recipients" };
        } else {
          let text = buildAlertMessage(report, to);
          /* V21.27.185: لو الإصلاح التلقائي اشتغل، أضِف سطر شفافية للتنبيه. */
          if(report.autoRepair?.ran){
            text += "\n🔧 *تم الإصلاح التلقائي:* " + report.autoRepair.applied + " رجل تحويل ناقصة اتكتبت.";
          } else if(report.autoRepair?.eligible > 0 && report.autoRepair?.mode === "dry-run"){
            text += "\n🛠 *قابل للإصلاح التلقائي:* " + report.autoRepair.eligible + " رجل (فعّل cfg.reconcile.autoRepair).";
          }
          /* V21.26.19: id ثابت (تاريخ التقرير + الهاتف) — يمنع تكرار تنبيه نفس
             اليوم لو الـ cron اشتغل مرتين قبل ما alertSentAt يتسجّل. */
          const messages = phones.map(phone => ({ id: "reconcile:" + to + "|" + phone, phone, message: text, role: "owner" }));
          try {
            /* bridgeSend فيه AbortController 8 ثوانٍ داخلياً (V21.9.41) */
            const r = await bridgeSend(bridgeUrl, bridgeToken, messages);
            alert = { attempted: true, sent: true, recipients: phones.length, bridgeResult: r?.ok ?? true };
            await repRef.set({ alertSentAt: new Date().toISOString(), alertRecipients: phones.length }, { merge: true });
          } catch(e){
            /* فشل الإرسال ما يفشلش المطابقة — التقرير متسجل والـ cron
               بكرة هيحاول تاني (alertSentAt مش متسجل) */
            alert = { attempted: true, sent: false, error: e.message };
          }
        }
      }
    }

    return res.status(200).json({ ok: true, report, alert });
  } catch(e){
    console.error("[V21.21.34 reconcile-financials] failed:", e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
