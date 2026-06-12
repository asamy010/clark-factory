/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · SeasonClosingModal (Phase 1 — V21.21.62)
   ───────────────────────────────────────────────────────────────────────
   عرض «كشف إقفال الموسم» (read-only) + طباعة/PDF. بيبني اللقطة من الـ `data`
   الحيّة عبر buildSeasonClosingSnapshot (دالة نقية — صفر mutation). الكشف ده
   هو نفسه كشف إقفال الموسم القديم = أساس افتتاحي الموسم الجديد.

   لماذا read-only في Phase 1: المستخدم يعاين الأرقام ويطبعها بأمان تام قبل أي
   إقفال فعلي أو قفل. التخزين/القفل/الموسم الجديد = مراحل لاحقة منفصلة (staging
   حسب §0.1 — لا توجد بيئة اختبار محلية).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp } from "../ui.jsx";
import { buildSeasonClosingSnapshot, summarizeSnapshotForRecord, suggestNextSeason } from "../../utils/accounting/seasonClosing.js";
import { fmt, gid } from "../../utils/format.js";
import { cairoDateStr } from "../../utils/serverTime.js";
import { printPage } from "../../utils/print.js";
import { ask, tell } from "../../utils/popups.js";

const _amt = (n) => fmt((Number(n) || 0).toFixed(2));

export function SeasonClosingModal({ data, T, FS, isMob, onClose, upConfig, userName, showToast, onOpenAccountingClose }){
  const d = data || {};
  const [seasonId, setSeasonId] = useState(d.activeSeason || "");
  const [asOfDate, setAsOfDate] = useState(cairoDateStr());
  const [saving, setSaving] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState(() => suggestNextSeason(d.activeSeason || ""));
  const [creatingSeason, setCreatingSeason] = useState(false);

  /* سجل الإقفال المحفوظ لهذا الموسم (إن وُجد) — idempotent لكل موسم */
  const savedRecord = useMemo(
    () => (Array.isArray(d.seasonClosings) ? d.seasonClosings : []).find(r => r && r.seasonId === seasonId) || null,
    [d.seasonClosings, seasonId]
  );

  const snap = useMemo(
    () => buildSeasonClosingSnapshot(d, { seasonId, asOfDate }),
    [d, seasonId, asOfDate]
  );

  /* ─── حفظ سجل الإقفال (مُلخّص فقط — بدون مصفوفات per-party، §10 1MB safety) ───
     idempotent لكل موسم: إعادة الحفظ بتستبدل السجل القديم (لو ضفت/عدّلت حركات
     بعد الإقفال تقدر تحدّث اللقطة). صفر تأثير على أي بيانات تانية. */
  const handleSaveRecord = async () => {
    if(typeof upConfig !== "function" || saving) return;
    if(!seasonId.trim()){ await tell("الموسم مطلوب", "حدد اسم الموسم قبل الحفظ", { danger: true }); return; }
    const isUpdate = !!savedRecord;
    const ok = await ask(
      isUpdate ? "تحديث سجل الإقفال" : "حفظ سجل الإقفال",
      isUpdate
        ? `فيه سجل إقفال محفوظ للموسم «${seasonId}» بتاريخ ${savedRecord.asOfDate || "—"}. التحديث هيستبدله باللقطة الحالية (حتى ${asOfDate}). متأكد؟`
        : `هيتحفظ سجل إقفال (مُلخّص الأرقام) للموسم «${seasonId}» حتى تاريخ ${asOfDate}. ده مجرد سجل للعرض/الأرشفة — مفيش قفل محاسبي ولا تعديل على بياناتك.`,
      { confirmText: isUpdate ? "تحديث" : "حفظ" }
    );
    if(!ok) return;
    setSaving(true);
    try {
      const rec = summarizeSnapshotForRecord(snap);
      rec.id = savedRecord?.id || gid();
      rec.savedAt = new Date().toISOString();
      rec.savedBy = userName || "";
      upConfig(cfg => {
        if(!Array.isArray(cfg.seasonClosings)) cfg.seasonClosings = [];
        cfg.seasonClosings = cfg.seasonClosings.filter(r => r && r.seasonId !== rec.seasonId);
        cfg.seasonClosings.push(rec);
        cfg.seasonClosings.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
      });
      if(typeof showToast === "function") showToast(isUpdate ? "✅ تم تحديث سجل الإقفال" : "✅ تم حفظ سجل الإقفال");
    } catch(e){
      await tell("فشل الحفظ", e.message || String(e), { danger: true });
    } finally {
      setSaving(false);
    }
  };

  /* ─── فتح وتفعيل الموسم الجديد ───
     بيضيف الاسم لـ seasons[] ويعمله activeSeason (نفس آلية SettingsPg «إدارة
     المواسم»). ⚠️ التفعيل بيخلّي التطبيق يحمّل أوامر الموسم الجديد (فاضي في
     الأول — ده صح لموسم جديد). الأوامر القديمة بتفضل في موسمها (seasons/{old}).
     تأكيد صريح لأنه تغيير مهم في دورة حياة المواسم (§0.1). */
  const handleOpenNewSeason = async () => {
    if(typeof upConfig !== "function" || creatingSeason) return;
    const name = (newSeasonName || "").trim();
    if(!name){ await tell("الاسم مطلوب", "اكتب اسم الموسم الجديد", { danger: true }); return; }
    const existing = Array.isArray(d.seasons) ? d.seasons : [];
    const alreadyExists = existing.includes(name);
    const ok = await ask(
      "فتح وتفعيل الموسم الجديد",
      `هيتفعّل الموسم «${name}»${alreadyExists ? " (موجود بالفعل)" : " (جديد)"} كموسم نشط.\n\n` +
      `⚠️ التطبيق هيبدأ يعرض أوامر الموسم الجديد (فاضي في البداية). الأوامر القديمة بتفضل محفوظة في موسم «${d.activeSeason || "—"}».\n\n` +
      `يُفضّل تحفظ سجل إقفال الموسم الحالي الأول. متأكد تكمل؟`,
      { confirmText: "فعّل الموسم الجديد", danger: true }
    );
    if(!ok) return;
    setCreatingSeason(true);
    try {
      upConfig(cfg => {
        if(!Array.isArray(cfg.seasons)) cfg.seasons = [];
        if(!cfg.seasons.includes(name)) cfg.seasons.push(name);
        cfg.activeSeason = name;
      });
      if(typeof showToast === "function") showToast(`✅ تم تفعيل الموسم «${name}»`);
      onClose();
    } catch(e){
      await tell("فشل فتح الموسم", e.message || String(e), { danger: true });
    } finally {
      setCreatingSeason(false);
    }
  };

  /* ─── طباعة احترافية بنفس قالب التقارير (letterhead + Save as PDF) ─── */
  const doPrint = () => {
    const accent = "#0EA5E9";
    const tbl = (head, rows, footRow) => {
      const thRow = `<tr style="background:${accent};color:#fff">${head.map(x => `<th style="padding:6px 10px;border:1px solid #cbd5e1;text-align:${x.a || "center"}">${x.t}</th>`).join("")}</tr>`;
      const body = rows.map(r => `<tr>${r.map(c => `<td style="padding:5px 10px;border:1px solid #e2e8f0;text-align:${c.a || "center"};${c.b ? "font-weight:800;" : ""}${c.c ? `color:${c.c};` : ""}">${c.t}</td>`).join("")}</tr>`).join("");
      const foot = footRow ? `<tfoot><tr style="background:#eff6ff;font-weight:800">${footRow.map(c => `<td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:${c.a || "center"};${c.c ? `color:${c.c};` : ""}">${c.t}</td>`).join("")}</tr></tfoot>` : "";
      return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px"><thead>${thRow}</thead><tbody>${body}</tbody>${foot}</table>`;
    };

    let h = `<h2 style="color:${accent};text-align:center;margin-bottom:2px">📸 كشف إقفال الموسم — ${snap.label || snap.seasonId || "—"}</h2>`;
    h += `<div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:14px">حتى تاريخ: ${snap.asOfDate} · تم الإنشاء: ${(snap.generatedAt || "").slice(0, 10)}</div>`;

    /* المركز المجمّع */
    const p = snap.position || {};
    h += `<div style="display:flex;gap:10px;margin-bottom:16px;text-align:center">
      <div style="flex:1;padding:10px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:8px"><div style="font-size:10px;color:#0369a1">إجمالي الأصول</div><div style="font-size:15px;font-weight:800;color:#0369a1">${_amt(p.totalAssets)}</div></div>
      <div style="flex:1;padding:10px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px"><div style="font-size:10px;color:#991b1b">إجمالي الخصوم</div><div style="font-size:15px;font-weight:800;color:#991b1b">${_amt(p.totalLiabilities)}</div></div>
      <div style="flex:1;padding:10px;border:2px solid #10b981;background:#ecfdf5;border-radius:8px"><div style="font-size:10px;color:#065f46">صافي الثروة</div><div style="font-size:15px;font-weight:800;color:#065f46">${_amt(p.netWorth)}</div></div>
    </div>`;

    /* النقدية لكل خزنة */
    h += `<h3 style="color:${accent};margin:6px 0">💵 النقدية (الخزائن والبنوك)</h3>`;
    h += tbl(
      [{ t: "الحساب", a: "right" }, { t: "النوع" }, { t: "الرصيد" }],
      (snap.cash.accounts || []).map(a => [
        { t: a.name, a: "right" },
        { t: a.type === "bank" ? "بنك" : a.type === "wallet" ? "محفظة" : "نقدي" },
        { t: _amt(a.balance), b: true, c: a.balance < 0 ? "#b91c1c" : "" },
      ]),
      [{ t: "إجمالي النقدية", a: "right" }, { t: "" }, { t: _amt(snap.cash.total) }]
    );

    /* الذمم */
    h += `<h3 style="color:${accent};margin:6px 0">📒 الذمم</h3>`;
    h += tbl(
      [{ t: "البند", a: "right" }, { t: "القيمة" }],
      [
        [{ t: "ذمم العملاء (لنا)", a: "right" }, { t: _amt(snap.receivables.total), b: true, c: "#0369a1" }],
        [{ t: "ذمم الموردين (علينا)", a: "right" }, { t: _amt(snap.payables.total), b: true, c: "#991b1b" }],
      ]
    );

    /* المخزون */
    const inv = snap.inventory || {};
    h += `<h3 style="color:${accent};margin:6px 0">📦 تقييم المخزون (بالتكلفة)</h3>`;
    h += tbl(
      [{ t: "الفئة", a: "right" }, { t: "القيمة" }],
      [
        [{ t: "منتجات جاهزة", a: "right" }, { t: _amt(inv.finished) }],
        [{ t: "خامات", a: "right" }, { t: _amt(inv.fabric) }],
        [{ t: "إكسسوار", a: "right" }, { t: _amt(inv.accessory) }],
        [{ t: "أخرى", a: "right" }, { t: _amt(inv.other) }],
      ],
      [{ t: "إجمالي المخزون", a: "right" }, { t: _amt(inv.total) }]
    );

    /* النشاط والربح */
    const pr = snap.profit || {};
    h += `<h3 style="color:${accent};margin:6px 0">📊 نشاط الموسم والربح</h3>`;
    h += tbl(
      [{ t: "البند", a: "right" }, { t: "القيمة" }],
      [
        [{ t: "صافي المبيعات", a: "right" }, { t: _amt(snap.sales.net) }],
        [{ t: "صافي المشتريات", a: "right" }, { t: _amt(snap.purchases.net) }],
        [{ t: "مجمل الربح (Gross)", a: "right" }, { t: _amt(pr.grossProfit), b: true, c: (pr.grossProfit || 0) >= 0 ? "#065f46" : "#991b1b" }],
        [{ t: "صافي الربح (بعد المصروفات)", a: "right" }, { t: _amt(pr.netProfit), b: true, c: (pr.netProfit || 0) >= 0 ? "#065f46" : "#991b1b" }],
      ]
    );

    /* الأوامر المفتوحة */
    if((snap.openOrders || []).length){
      h += `<h3 style="color:${accent};margin:6px 0">🔓 الأوامر المفتوحة (${snap.openOrdersCount}) — تترحّل للموسم الجديد</h3>`;
      h += tbl(
        [{ t: "الموديل", a: "right" }, { t: "العميل", a: "right" }, { t: "الحالة" }, { t: "مقصوص" }, { t: "مؤكَّد" }, { t: "متاح" }],
        snap.openOrders.map(o => [
          { t: o.modelNo + (o.modelDesc ? " — " + o.modelDesc : ""), a: "right" },
          { t: o.customer || "—", a: "right" },
          { t: o.status === "production" ? "تحت التنفيذ" : "مخزون جاهز" },
          { t: fmt(o.ordered) },
          { t: fmt(o.confirmed) },
          { t: fmt(o.avail) },
        ])
      );
    }

    printPage("كشف إقفال الموسم", h, { factoryName: d.factoryName, logo: d.logo });
  };

  /* ─── UI helpers ─── */
  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 8, paddingBottom: 4, borderBottom: "2px solid " + T.accent + "40" }}>{title}</div>
      {children}
    </div>
  );
  const Row = ({ label, value, color, bold }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px dotted " + T.brd }}>
      <span style={{ fontSize: FS - 1, color: T.textSec, fontWeight: bold ? 800 : 600 }}>{label}</span>
      <span style={{ fontSize: FS - 1, fontWeight: 800, color: color || T.text, direction: "ltr", fontFamily: "monospace" }}>{_amt(value)}</span>
    </div>
  );

  const p = snap.position || {};
  const inv = snap.inventory || {};
  const pr = snap.profit || {};
  const seasonOptions = Array.isArray(d.seasons) ? d.seasons : (d.activeSeason ? [d.activeSeason] : []);

  return <div className="pop-overlay" style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMob ? 4 : 16,
  }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 14, width: "100%", maxWidth: 760,
      maxHeight: "96vh", display: "flex", flexDirection: "column",
      border: "1px solid " + T.brd, boxShadow: "0 25px 70px rgba(0,0,0,0.4)",
    }}>
      {/* Header */}
      <div style={{ padding: isMob ? "12px 14px" : "14px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.accent }}>📸 كشف إقفال الموسم</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>المركز المالي والتشغيلي عند الإقفال (للعرض والطباعة)</div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* Controls */}
      <div style={{ padding: isMob ? 12 : 16, background: T.bg, borderBottom: "1px solid " + T.brd, flexShrink: 0, display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>الموسم</label>
          {seasonOptions.length > 1
            ? <select value={seasonId} onChange={e => setSeasonId(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontSize: FS - 1 }}>
                {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            : <Inp value={seasonId} onChange={setSeasonId} placeholder="WS26" />}
        </div>
        <div>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>حتى تاريخ</label>
          <Inp type="date" value={asOfDate} onChange={setAsOfDate} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small onClick={doPrint} style={{ background: T.accent, color: "#fff", border: "none", fontWeight: 800, padding: "9px 16px" }}>🖨 طباعة / PDF</Btn>
          {typeof upConfig === "function" && <Btn small onClick={handleSaveRecord} disabled={saving} style={{ background: T.ok, color: "#fff", border: "none", fontWeight: 800, padding: "9px 16px" }}>
            {saving ? "⏳ حفظ..." : savedRecord ? "🔄 تحديث السجل" : "💾 حفظ السجل"}
          </Btn>}
        </div>
      </div>

      {/* Saved-record banner */}
      {savedRecord && <div style={{ padding: "8px 16px", background: T.ok + "10", borderBottom: "1px solid " + T.brd, fontSize: FS - 2, color: T.ok, fontWeight: 700, flexShrink: 0 }}>
        ✓ سجل إقفال محفوظ لـ «{savedRecord.seasonId}» حتى {savedRecord.asOfDate || "—"}
        {savedRecord.savedBy ? " · بواسطة " + savedRecord.savedBy : ""}
        {savedRecord.savedAt ? " · " + savedRecord.savedAt.slice(0, 10) : ""}
      </div>}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMob ? 12 : 16 }}>

        {/* Net worth hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
          <div style={{ padding: "12px 10px", background: T.accent + "10", borderRadius: 10, border: "1px solid " + T.accent + "30", textAlign: "center" }}>
            <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>إجمالي الأصول</div>
            <div style={{ fontSize: FS + 3, fontWeight: 900, color: T.accent, direction: "ltr", fontFamily: "monospace" }}>{_amt(p.totalAssets)}</div>
          </div>
          <div style={{ padding: "12px 10px", background: T.err + "10", borderRadius: 10, border: "1px solid " + T.err + "30", textAlign: "center" }}>
            <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>إجمالي الخصوم</div>
            <div style={{ fontSize: FS + 3, fontWeight: 900, color: T.err, direction: "ltr", fontFamily: "monospace" }}>{_amt(p.totalLiabilities)}</div>
          </div>
          <div style={{ padding: "12px 10px", background: T.ok + "15", borderRadius: 10, border: "2px solid " + T.ok, textAlign: "center" }}>
            <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>صافي الثروة</div>
            <div style={{ fontSize: FS + 3, fontWeight: 900, color: T.ok, direction: "ltr", fontFamily: "monospace" }}>{_amt(p.netWorth)}</div>
          </div>
        </div>

        {/* Cash per account */}
        <Section title={"💵 النقدية (الخزائن والبنوك) — " + _amt(snap.cash.total)}>
          {(snap.cash.accounts || []).length === 0
            ? <div style={{ padding: 12, color: T.textMut, fontSize: FS - 2, textAlign: "center" }}>لا توجد حركات خزنة</div>
            : snap.cash.accounts.map(a => (
                <div key={a.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px dotted " + T.brd }}>
                  <span style={{ fontSize: FS - 1, color: T.text, fontWeight: 600 }}>
                    {a.name} <span style={{ fontSize: FS - 3, color: T.textMut }}>({a.type === "bank" ? "بنك" : a.type === "wallet" ? "محفظة" : "نقدي"})</span>
                  </span>
                  <span style={{ fontSize: FS - 1, fontWeight: 800, color: a.balance < 0 ? T.err : T.text, direction: "ltr", fontFamily: "monospace" }}>{_amt(a.balance)}</span>
                </div>
              ))}
        </Section>

        {/* Receivables / Payables */}
        <Section title="📒 الذمم">
          <Row label="ذمم العملاء (لنا)" value={snap.receivables.total} color={T.accent} bold />
          <Row label="ذمم الموردين (علينا)" value={snap.payables.total} color={T.err} bold />
        </Section>

        {/* Inventory */}
        <Section title={"📦 تقييم المخزون (بالتكلفة) — " + _amt(inv.total)}>
          <Row label="منتجات جاهزة" value={inv.finished} />
          <Row label="خامات" value={inv.fabric} />
          <Row label="إكسسوار" value={inv.accessory} />
          {(inv.other || 0) !== 0 && <Row label="أخرى" value={inv.other} />}
        </Section>

        {/* Activity / profit */}
        <Section title="📊 نشاط الموسم والربح">
          <Row label="صافي المبيعات" value={snap.sales.net} />
          <Row label="صافي المشتريات" value={snap.purchases.net} />
          <Row label="مجمل الربح (Gross)" value={pr.grossProfit} color={(pr.grossProfit || 0) >= 0 ? T.ok : T.err} bold />
          <Row label="صافي الربح (بعد المصروفات)" value={pr.netProfit} color={(pr.netProfit || 0) >= 0 ? T.ok : T.err} bold />
          {!pr.configured && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4, lineHeight: 1.5 }}>ℹ️ المصروفات التشغيلية غير محدّدة — «صافي الربح» = مجمل الربح. حدّد فئات المصروفات من إعدادات الربح في لوحة التحكم.</div>}
        </Section>

        {/* Open orders */}
        <Section title={"🔓 الأوامر المفتوحة (" + snap.openOrdersCount + ")"}>
          <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 6, lineHeight: 1.5 }}>
            شغل تحت التنفيذ أو مخزون جاهز غير مُسلَّم — يترحّل للموسم الجديد. (الترحيل الفعلي في مرحلة لاحقة.)
          </div>
          {snap.openOrders.length === 0
            ? <div style={{ padding: 12, color: T.textMut, fontSize: FS - 2, textAlign: "center" }}>لا توجد أوامر مفتوحة — كل الأوامر مُقفلة ✓</div>
            : <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid " + T.brd, borderRadius: 8 }}>
                {snap.openOrders.map((o, i) => (
                  <div key={o.id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: i < snap.openOrders.length - 1 ? "1px solid " + T.brd : "none" }}>
                    <span style={{ fontSize: FS - 3, fontWeight: 800, color: o.status === "production" ? T.warn : T.accent, padding: "2px 7px", background: (o.status === "production" ? T.warn : T.accent) + "15", borderRadius: 5, whiteSpace: "nowrap" }}>
                      {o.status === "production" ? "تحت التنفيذ" : "مخزون"}
                    </span>
                    <span style={{ flex: 1, fontSize: FS - 1, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.modelNo}{o.modelDesc ? " — " + o.modelDesc : ""}{o.customer ? " · " + o.customer : ""}
                    </span>
                    <span style={{ fontSize: FS - 3, color: T.textSec, whiteSpace: "nowrap", fontFamily: "monospace", direction: "ltr" }}>
                      مقصوص {fmt(o.ordered)} · متاح {fmt(o.avail)}
                    </span>
                  </div>
                ))}
              </div>}
        </Section>

        {/* خطوات الإقفال — القفل المحاسبي (معالج موجود) */}
        {typeof onOpenAccountingClose === "function" && <div style={{ marginTop: 8, marginBottom: 8, padding: "12px 14px", background: T.warn + "08", borderRadius: 10, border: "1px solid " + T.warn + "40" }}>
          <div style={{ fontSize: FS, fontWeight: 800, color: T.warn, marginBottom: 6 }}>🔒 الإقفال المحاسبي والقفل</div>
          <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 10, lineHeight: 1.6 }}>
            بعد ما تحفظ سجل الكشف، شغّل <b>معالج إقفال السنة المالية</b>: بيصفّر الإيرادات/المصروفات
            ويرحّلها للأرباح المحتجزة، ويقفل الفترة (مفيش قيود جديدة فيها). الخطوة دي قابلة للعكس من «الفترات المُقفلة».
          </div>
          <Btn onClick={() => { onClose(); onOpenAccountingClose(); }} style={{ background: T.warn, color: "#fff", border: "none", fontWeight: 800, padding: "9px 18px" }}>
            🔒 افتح معالج الإقفال المحاسبي
          </Btn>
        </div>}

        {/* فتح الموسم الجديد */}
        {typeof upConfig === "function" && <div style={{ marginTop: 8, marginBottom: 8, padding: "12px 14px", background: T.ok + "08", borderRadius: 10, border: "1px solid " + T.ok + "40" }}>
          <div style={{ fontSize: FS, fontWeight: 800, color: T.ok, marginBottom: 6 }}>✨ فتح الموسم الجديد</div>
          <div style={{ fontSize: FS - 3, color: T.textMut, marginBottom: 10, lineHeight: 1.6 }}>
            بعد ما تحفظ سجل الإقفال، افتح الموسم الجديد وفعّله. التطبيق هيبدأ موسم جديد بأوامر فاضية — الأوامر القديمة بتفضل محفوظة في موسمها.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Inp value={newSeasonName} onChange={setNewSeasonName} placeholder="اسم الموسم الجديد (مثال: WS27)" style={{ flex: 1, minWidth: 160 }} />
            <Btn onClick={handleOpenNewSeason} disabled={creatingSeason} style={{ background: T.ok, color: "#fff", border: "none", fontWeight: 800, padding: "9px 18px" }}>
              {creatingSeason ? "⏳ تفعيل..." : "✨ أنشئ وفعّل"}
            </Btn>
          </div>
        </div>}

        <div style={{ marginTop: 8, padding: "10px 12px", background: T.accent + "08", borderRadius: 8, border: "1px solid " + T.accent + "30", fontSize: FS - 2, color: T.text, lineHeight: 1.7 }}>
          <b style={{ color: T.accent }}>📚 ملاحظة:</b> الكشف ده لقطة لحظية مشتقّة من البيانات الحيّة (للعرض والطباعة) — مفيش أي تعديل على بياناتك.
          هو نفسه كشف إقفال الموسم الحالي = أساس الأرصدة الافتتاحية للموسم الجديد. القفل المحاسبي وإنشاء الموسم الجديد في مراحل لاحقة من نفس الميزة.
        </div>
      </div>
    </div>
  </div>;
}
