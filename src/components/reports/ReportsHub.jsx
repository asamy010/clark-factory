/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ReportsHub (V21.16.2)
   قائمة تقارير قابلة للتوسّع: كروت تضغط عليها تفتح التقرير + زر رجوع.
   كل تقرير = { id, icon, title, desc, render: () => JSX }.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card } from "../ui.jsx";
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
          <Card key={r.id} onClick={() => setActive(r.id)} style={{ cursor: "pointer", transition: "transform .12s, box-shadow .12s", display: "flex", gap: 12, alignItems: "flex-start" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{r.icon || "📊"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: r.color || T.accent }}>{r.title}</div>
              {r.desc && <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4, lineHeight: 1.6 }}>{r.desc}</div>}
              <div style={{ fontSize: FS - 2, color: T.accent, fontWeight: 700, marginTop: 8 }}>افتح التقرير ←</div>
            </div>
          </Card>
        ))}
        {reports.length === 0 && <div style={{ color: T.textMut, padding: 24 }}>لا توجد تقارير متاحة</div>}
      </div>
    </div>
  );
}
