/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · GeneralLedgerTab (V21.18.0 — دفتر الأستاذ)
   ───────────────────────────────────────────────────────────────────────
   كشف حساب أستاذ: اختر حساب من شجرة الحسابات → كل الحركات اللي تمت عليه
   برصيد تراكمي. لو الحساب أب بنضمّ الحسابات الفرعية. مبني من القيود مباشرة.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from "react";
import { Btn, Card, Inp } from "../ui.jsx";
import { readDayRange } from "../../utils/accounting/dayDoc.js";
import { getGeneralLedger } from "../../utils/accounting/aggregate.js";
import { fmt } from "../../utils/format.js";
import { printPage } from "../../utils/print.js";

const TYPE_LABEL = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };

export function GeneralLedgerTab({ coa, configInfo, T, FS, isMob, showToast }){
  const today = new Date().toISOString().split("T")[0];
  const yearStart = today.slice(0, 4) + "-01-01";
  const earliest = (() => { const d = new Date(today); d.setFullYear(d.getFullYear() - 5); return d.toISOString().split("T")[0]; })();

  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [fullHistory, setFullHistory] = useState(false);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);

  const accounts = useMemo(() => {
    const list = (coa || []).slice().sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }));
    if(!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(a => (a.code || "").toLowerCase().includes(q) || (a.name || "").toLowerCase().includes(q));
  }, [coa, search]);

  const selected = useMemo(() => (coa || []).find(a => a.id === accountId) || null, [coa, accountId]);

  const load = async () => {
    if(!accountId){ setDays([]); return; }
    setLoading(true);
    try { setDays(await readDayRange(fullHistory ? earliest : from, to)); }
    catch(e){ console.error("[CLARK GL] load failed:", e); showToast && showToast("⚠️ فشل تحميل البيانات"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId, from, to, fullHistory]);

  const ledger = useMemo(() => {
    if(!accountId) return null;
    return getGeneralLedger(coa, days, accountId, { from: fullHistory ? null : from, to: fullHistory ? null : to });
  }, [coa, days, accountId, from, to, fullHistory]);

  const balLabel = ledger ? (ledger.isDebitNatural ? "مدين" : "دائن") : "";

  const openEntry = (l) => {
    if(!l?.entryId) return;
    try { window.__clarkOpenJournalEntry = { date: l.date, entryId: l.entryId, refNo: l.refNo }; } catch(_){}
    window.dispatchEvent(new CustomEvent("clark-open-journal-entry", { detail: { date: l.date, entryId: l.entryId } }));
  };

  const doPrint = () => {
    if(!ledger || !selected) return;
    const rows = ledger.lines.map(l => `<tr><td style="font-family:monospace">${l.date}</td><td style="font-family:monospace;color:#0EA5E9">${l.refNo || ""}</td><td>${l.narration || ""}${l.note ? '<br><span style="font-size:10px;color:#64748b">' + l.note + "</span>" : ""}</td><td style="font-family:monospace">${l.accountCode || ""} ${l.accountName || ""}</td><td style="text-align:left">${l.debit ? fmt(l.debit.toFixed(2)) : ""}</td><td style="text-align:left">${l.credit ? fmt(l.credit.toFixed(2)) : ""}</td><td style="text-align:left;font-weight:700">${fmt(l.runningBalance.toFixed(2))}</td></tr>`).join("");
    const h = `
      <h2 style="margin:0 0 4px">📒 دفتر الأستاذ — ${selected.code} ${selected.name}</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">${TYPE_LABEL[selected.type] || ""} · الفترة: ${fullHistory ? "كل الحركات" : (from + " ← " + to)} · ${configInfo?.factoryName || "CLARK"}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#0EA5E9;color:#fff">
          <th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th><th style="padding:6px;border:1px solid #cbd5e1">المرجع</th><th style="padding:6px;border:1px solid #cbd5e1">البيان</th><th style="padding:6px;border:1px solid #cbd5e1">الحساب</th>
          <th style="padding:6px;border:1px solid #cbd5e1">مدين</th><th style="padding:6px;border:1px solid #cbd5e1">دائن</th><th style="padding:6px;border:1px solid #cbd5e1">الرصيد</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#eff6ff;font-weight:800"><td colspan="4" style="padding:6px;border:1px solid #cbd5e1;text-align:left">الإجمالي (${ledger.lines.length} حركة)</td>
          <td style="padding:6px;border:1px solid #cbd5e1;text-align:left">${fmt(ledger.totals.debit.toFixed(2))}</td><td style="padding:6px;border:1px solid #cbd5e1;text-align:left">${fmt(ledger.totals.credit.toFixed(2))}</td>
          <td style="padding:6px;border:1px solid #cbd5e1;text-align:left">${fmt(ledger.totals.balance.toFixed(2))}</td></tr></tfoot>
      </table>`;
    printPage("دفتر الأستاذ — " + selected.name, h, { factoryName: configInfo?.factoryName, logo: configInfo?.logo });
  };

  const th = { padding: "10px 12px", textAlign: "right", color: T.textSec, fontWeight: 800, fontSize: FS - 2, borderBottom: "2px solid " + T.brd };
  const thC = { ...th, textAlign: "center" };

  return <Card title="📒 دفتر الأستاذ (كشف حساب أستاذ)" style={{ marginBottom: 16 }}>
    <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 14, lineHeight: 1.7 }}>
      💡 اختر حساب من شجرة الحسابات لعرض كل الحركات اللي تمت عليه برصيد تراكمي — مبني من القيود مباشرة. الحساب الأب بيضمّ حساباته الفرعية.
    </div>

    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
      <div>
        <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>الحساب</label>
        <Inp value={search} onChange={setSearch} placeholder="🔎 ابحث بالكود أو الاسم..." />
        {search && <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 4, border: "1px solid " + T.brd, borderRadius: 6, background: T.cardSolid }}>
          {accounts.length === 0 ? <div style={{ padding: 10, color: T.textMut, fontSize: FS - 2, textAlign: "center" }}>لا توجد نتائج</div>
            : accounts.slice(0, 40).map(a => <div key={a.id} onClick={() => { setAccountId(a.id); setSearch(a.code + " — " + a.name); }} style={{ padding: "6px 10px", borderBottom: "1px solid " + T.brd, cursor: "pointer", fontSize: FS - 1, color: a.id === accountId ? T.accent : T.text, background: a.id === accountId ? T.accent + "10" : "transparent" }}>
              <span style={{ fontFamily: "monospace", color: T.accent, fontWeight: 700, marginInlineEnd: 6 }}>{a.code}</span>{a.name}
              {!a.isLeaf && <span style={{ fontSize: FS - 4, color: T.textMut, marginInlineStart: 6 }}>(أب)</span>}
            </div>)}
        </div>}
      </div>
      <div>
        <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>من</label>
        <Inp type="date" value={from} onChange={setFrom} disabled={fullHistory} />
      </div>
      <div>
        <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>إلى</label>
        <Inp type="date" value={to} onChange={setTo} disabled={fullHistory} />
      </div>
      <div>
        <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, display: "block", marginBottom: 4 }}>&nbsp;</label>
        <span onClick={() => setFullHistory(s => !s)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: fullHistory ? T.accent + "15" : T.bg, border: "1px solid " + (fullHistory ? T.accent + "40" : T.brd), fontSize: FS - 2, fontWeight: 700, color: fullHistory ? T.accent : T.textSec }}>
          {fullHistory ? "☑" : "☐"} كل الحركات
        </span>
      </div>
    </div>

    {!accountId ? <div style={{ padding: 30, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>📒</div>
      <div style={{ fontSize: FS, fontWeight: 700, color: T.text, marginBottom: 4 }}>اختر حساب لعرض دفتر الأستاذ</div>
      <div style={{ fontSize: FS - 1, color: T.textSec }}>ابحث بالكود أو الاسم أعلاه</div>
    </div> : loading ? <div style={{ padding: 30, textAlign: "center", color: T.textMut }}>⏳ جاري التحميل...</div>
      : ledger && <>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text }}>
            <span style={{ fontFamily: "monospace", color: T.accent }}>{selected?.code}</span> {selected?.name}
            <span style={{ fontSize: FS - 2, color: T.textMut, fontWeight: 600, marginInlineStart: 8 }}>({TYPE_LABEL[selected?.type] || ""}{!selected?.isLeaf ? " · أب — مع الفرعية" : ""})</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
          <div style={{ padding: 12, background: T.ok + "08", borderRadius: 8, textAlign: "center", border: "1px solid " + T.ok + "40" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 4 }}>إجمالي مدين</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.ok, direction: "ltr", fontFamily: "monospace" }}>{fmt(ledger.totals.debit.toFixed(2))}</div>
          </div>
          <div style={{ padding: 12, background: T.err + "08", borderRadius: 8, textAlign: "center", border: "1px solid " + T.err + "40" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 4 }}>إجمالي دائن</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.err, direction: "ltr", fontFamily: "monospace" }}>{fmt(ledger.totals.credit.toFixed(2))}</div>
          </div>
          <div style={{ padding: 12, background: T.accent + "08", borderRadius: 8, textAlign: "center", border: "1px solid " + T.accent + "40", gridColumn: isMob ? "1/3" : "auto" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 4 }}>الرصيد ({balLabel})</div>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.accent, direction: "ltr", fontFamily: "monospace" }}>{fmt(Math.abs(ledger.totals.balance).toFixed(2))}</div>
          </div>
          <div style={{ padding: 12, background: T.bg, borderRadius: 8, textAlign: "center", border: "1px solid " + T.brd, gridColumn: isMob ? "1/3" : "auto" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 4 }}>عدد الحركات</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text }}>{ledger.lines.length}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <Btn ghost onClick={doPrint} disabled={ledger.lines.length === 0}>🖨 طباعة / PDF</Btn>
        </div>

        {ledger.lines.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd }}>لا توجد حركات في هذه الفترة</div>
          : <div style={{ overflowX: "auto", border: "1px solid " + T.brd, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS - 1 }}>
              <thead><tr style={{ background: T.accent + "08" }}>
                <th style={th}>التاريخ</th><th style={th}>المرجع</th><th style={th}>البيان</th>
                {!isMob && !selected?.isLeaf && <th style={th}>الحساب الفرعي</th>}
                <th style={{ ...thC, width: 100 }}>مدين</th><th style={{ ...thC, width: 100 }}>دائن</th><th style={{ ...thC, width: 120 }}>الرصيد</th>
              </tr></thead>
              <tbody>{ledger.lines.map((l, i) => <tr key={i} style={{ borderTop: "1px solid " + T.brd }}>
                <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: FS - 2 }}>{l.date}</td>
                <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: FS - 2 }}>
                  <span onClick={() => openEntry(l)} title="افتح القيد" style={{ color: T.accent, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>{l.refNo || "🔍"}</span>
                </td>
                <td style={{ padding: "7px 10px" }}>
                  <div style={{ fontWeight: 600 }}>{l.narration}</div>
                  {(l.note || l.partyName) && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 1 }}>{l.partyName}{l.partyName && l.note ? " · " : ""}{l.note}</div>}
                  {(isMob && !selected?.isLeaf) && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 1 }}><span style={{ fontFamily: "monospace" }}>{l.accountCode}</span> {l.accountName}</div>}
                </td>
                {!isMob && !selected?.isLeaf && <td style={{ padding: "7px 10px", color: T.textSec, fontSize: FS - 2 }}><span style={{ fontFamily: "monospace", color: T.accent, fontWeight: 700, marginInlineEnd: 4 }}>{l.accountCode}</span>{l.accountName}</td>}
                <td style={{ padding: "7px 10px", textAlign: "center", direction: "ltr", color: l.debit > 0 ? T.ok : T.textMut, fontWeight: l.debit > 0 ? 700 : 400 }}>{l.debit > 0 ? fmt(l.debit.toFixed(2)) : "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "center", direction: "ltr", color: l.credit > 0 ? T.err : T.textMut, fontWeight: l.credit > 0 ? 700 : 400 }}>{l.credit > 0 ? fmt(l.credit.toFixed(2)) : "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "center", direction: "ltr", fontWeight: 800, color: T.accent }}>{fmt(l.runningBalance.toFixed(2))}</td>
              </tr>)}</tbody>
              <tfoot><tr style={{ background: T.accent + "15", borderTop: "2px solid " + T.accent }}>
                <td colSpan={(!isMob && !selected?.isLeaf) ? 4 : 3} style={{ padding: "10px 12px", fontWeight: 800, color: T.accent }}>الإجمالي</td>
                <td style={{ padding: "10px 12px", textAlign: "center", direction: "ltr", fontWeight: 800, color: T.ok }}>{fmt(ledger.totals.debit.toFixed(2))}</td>
                <td style={{ padding: "10px 12px", textAlign: "center", direction: "ltr", fontWeight: 800, color: T.err }}>{fmt(ledger.totals.credit.toFixed(2))}</td>
                <td style={{ padding: "10px 12px", textAlign: "center", direction: "ltr", fontWeight: 800, color: T.accent }}>{fmt(Math.abs(ledger.totals.balance).toFixed(2))}</td>
              </tr></tfoot>
            </table>
          </div>}
      </>}
  </Card>;
}
