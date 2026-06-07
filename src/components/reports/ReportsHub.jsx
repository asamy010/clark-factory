/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ReportsHub (V21.16.2)
   قائمة تقارير قابلة للتوسّع: كروت تضغط عليها تفتح التقرير + زر رجوع.
   كل تقرير = { id, icon, title, desc, render: () => JSX }.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";

export function ReportsHub({ reports = [], isMob }){
  const [active, setActive] = useState(null);
  const cur = reports.find(r => r.id === active);

  if(cur){
    return (
      <div>
        <Btn ghost small onClick={() => setActive(null)} style={{ marginBottom: 12 }}>← رجوع للتقارير</Btn>
        {cur.render()}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 12 }}>📈 التقارير</div>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {reports.map(r => (
          <div key={r.id} role="button" tabIndex={0}
            onClick={() => setActive(r.id)}
            onKeyDown={e => { if(e.key === "Enter" || e.key === " ") setActive(r.id); }}
            style={{ cursor: "pointer", background: T.cardSolid, borderRadius: 12, border: "1px solid " + T.brd, boxShadow: T.shadow, padding: 14, display: "flex", gap: 12, alignItems: "flex-start", transition: "transform .12s, box-shadow .12s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = T.shadow; }}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{r.icon || "📊"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: r.color || T.accent }}>{r.title}</div>
              {r.desc && <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.6 }}>{r.desc}</div>}
              <div style={{ fontSize: FS - 2, color: T.accent, fontWeight: 700, marginTop: 8 }}>افتح التقرير ←</div>
            </div>
          </div>
        ))}
        {reports.length === 0 && <div style={{ color: T.textMut, padding: 24 }}>لا توجد تقارير متاحة</div>}
      </div>
    </div>
  );
}
