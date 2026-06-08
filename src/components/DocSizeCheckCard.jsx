/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocSizeCheckCard (V21.18.3)
   أداة فحص سريعة لأحجام مستندات Firestore الرئيسية (factory/*) — تنبّه لو
   أي مستند قرب من حد الـ 1 ميجا. حكم واحد بدون تفاصيل: «فيه مشكلة / مفيش».
   read-only — getDocs على collection «factory» بس (قراءة واحدة رخيصة).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";

const LIMIT = 1048576; /* 1 MB — حد Firestore لكل مستند */

export function DocSizeCheckCard({ isMob }){
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);

  const run = async () => {
    setBusy(true); setRes(null);
    try {
      const snap = await getDocs(collection(db, "factory"));
      let worst = 0;
      snap.forEach(d => {
        const bytes = new TextEncoder().encode(JSON.stringify(d.data() || {})).length;
        const pct = (bytes / LIMIT) * 100;
        if(pct > worst) worst = pct;
      });
      const level = worst >= 95 ? "critical" : worst >= 80 ? "warn" : "ok";
      setRes({ worst: Math.round(worst * 10) / 10, level });
    } catch(e){
      setRes({ error: e?.message || String(e) });
    } finally { setBusy(false); }
  };

  const VERDICT = {
    ok:       { color: T.ok,   icon: "✅", text: "مفيش مشكلة — كل الملفات في الحدود الآمنة" },
    warn:     { color: T.warn, icon: "⚠️", text: "فيه ملف قرب من الحد — يُفضّل التقسيم قريباً" },
    critical: { color: T.err,  icon: "🚨", text: "خطر — فيه ملف قرب 1 ميجا، لازم التقسيم فوراً" },
  };

  return (
    <Card title="🩺 فحص أحجام الملفات" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12, lineHeight: 1.7 }}>
        فحص سريع يتأكد إن مفيش مستند بيانات قرب من حد الـ 1 ميجا.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn primary onClick={run} disabled={busy} style={{ background: T.accent }}>{busy ? "⏳ بيفحص..." : "🔍 افحص دلوقتي"}</Btn>
        {res && !res.error && (() => { const v = VERDICT[res.level]; return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: v.color + "12", border: "1px solid " + v.color + "44", color: v.color, fontWeight: 800, fontSize: FS }}>
            <span style={{ fontSize: FS + 4 }}>{v.icon}</span>
            <span>{v.text}</span>
            <span style={{ fontSize: FS - 2, opacity: 0.8, fontWeight: 600 }}>(أعلى استخدام: {res.worst}%)</span>
          </div>
        ); })()}
        {res && res.error && (
          <div style={{ padding: "8px 14px", borderRadius: 10, background: T.err + "12", border: "1px solid " + T.err + "44", color: T.err, fontWeight: 700, fontSize: FS - 1 }}>⛔ تعذّر الفحص: {res.error}</div>
        )}
      </div>
    </Card>
  );
}
