/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocNumberingSettings (V21.20.0)
   التحكم في ترقيم المستندات: عرض سعر · أمر بيع · فاتورة بيع · فاتورة شراء.
   لكل نوع: البريفكس + الصيغة + تصفير التسلسل + تعديل التسلسل الحالي + معاينة.
   التغيير بيطبّق على الجديد فقط (القديم بأرقامه). الحفظ عبر upConfig.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card, Inp, Sel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";
import { DOC_TYPES, DOC_TYPE_LABEL, getDocNumCfg, formatDocNo } from "../utils/docNumbering.js";

const RESETS = [{ v: "monthly", l: "شهري (يتصفّر كل شهر)" }, { v: "yearly", l: "سنوي (يتصفّر كل سنة)" }, { v: "never", l: "مستمر (مايتصفّرش)" }];

function periodKey(reset){
  const d = new Date();
  if(reset === "never") return "all";
  if(reset === "yearly") return String(d.getFullYear());
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function DocNumberingSettings({ data, upConfig, isMob }){
  const [edits, setEdits] = useState(() => {
    const o = {};
    DOC_TYPES.forEach(t => {
      const c = getDocNumCfg(data, t);
      o[t] = { prefix: c.prefix, format: c.format, reset: c.reset, pad: String(c.pad || 4), seq: String((c.counters || {})[periodKey(c.reset)] || 0) };
    });
    return o;
  });
  const set = (t, k, v) => setEdits(p => ({ ...p, [t]: { ...p[t], [k]: v } }));

  const preview = (t) => {
    const e = edits[t];
    return formatDocNo({ prefix: e.prefix, format: e.format, pad: Number(e.pad) || 4 }, (Number(e.seq) || 0) + 1);
  };

  const save = (t) => {
    const e = edits[t];
    upConfig(d => {
      if(!d.docNumbering) d.docNumbering = {};
      const cur = getDocNumCfg(d, t);
      const next = { ...cur, prefix: (e.prefix || "").trim(), format: (e.format || "{prefix}-{seq}-{MM}-{YYYY}").trim(), reset: e.reset, pad: Number(e.pad) || 4 };
      if(!next.counters) next.counters = {};
      const sv = Number(e.seq);
      if(!isNaN(sv) && sv >= 0) next.counters[periodKey(next.reset)] = Math.floor(sv);
      d.docNumbering[t] = next;
    });
    showToast("✅ تم حفظ ترقيم " + DOC_TYPE_LABEL[t]);
  };

  const lbl = { fontSize: FS - 3, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 3 };

  return (
    <Card title="🔢 ترقيم المستندات (عرض سعر / أمر بيع / فواتير)" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12, lineHeight: 1.7 }}>
        تحكّم في صيغة وأرقام المستندات. المتغيّرات: <code style={{ background: T.bg, padding: "1px 5px", borderRadius: 4 }}>{"{prefix} {seq} {MM} {YYYY} {YY}"}</code>.
        التغيير بيطبّق على <b>المستندات الجديدة فقط</b>.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {DOC_TYPES.map(t => {
          const e = edits[t];
          return (
            <div key={t} style={{ border: "1px solid " + T.brd, borderRadius: 10, padding: 12, background: T.bg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 800, color: T.text }}>{DOC_TYPE_LABEL[t]}</div>
                <div style={{ fontSize: FS - 2, color: T.textMut }}>الجاي: <b style={{ color: T.accent, fontFamily: "monospace" }}>{preview(t)}</b></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "1.2fr 1.6fr 1fr 0.7fr 0.8fr auto", gap: 8, alignItems: "end" }}>
                <div><label style={lbl}>الاسم (prefix)</label><Inp value={e.prefix} onChange={v => set(t, "prefix", v)} /></div>
                <div><label style={lbl}>الصيغة</label><Inp value={e.format} onChange={v => set(t, "format", v)} /></div>
                <div><label style={lbl}>التصفير</label><Sel value={e.reset} onChange={v => set(t, "reset", v)}>{RESETS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</Sel></div>
                <div><label style={lbl}>خانات</label><Inp type="number" value={e.pad} onChange={v => set(t, "pad", v)} /></div>
                <div><label style={lbl}>التسلسل الحالي</label><Inp type="number" value={e.seq} onChange={v => set(t, "seq", v)} /></div>
                <div><Btn small primary onClick={() => save(t)} style={{ background: T.accent }}>💾 حفظ</Btn></div>
              </div>
              <div style={{ fontSize: FS - 4, color: T.textMut, marginTop: 4 }}>* «التسلسل الحالي» = آخر رقم اتعمل في الفترة الحالية؛ الجاي = +1.</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
