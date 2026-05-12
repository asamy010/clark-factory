/* ═══════════════════════════════════════════════════════════════════════
   CLARK · WriteSelfTestCard (V19.46)
   ───────────────────────────────────────────────────────────────────────
   Diagnostic card for Settings → Maintenance. Two functions:

   1) Show current document sizes (factory/config, factory/sales, factory/tasks)
      with color-coded warnings if approaching the 1MB Firestore hard limit.

   2) "Run write self-test" button — performs a round-trip write→read→delete
      to factory/_writeTest. Reports success/failure with categorized error
      reason (permission-denied / network / size-limit / unknown) so when a
      user says "save isn't working", we can immediately tell them what's wrong.

   Why both: size-limit issues are silent and progressive. The round-trip test
   only fails AFTER the doc is too big to write at all. The size meter warns
   BEFORE that point (at 80% of limit), giving time to act.

   Uses helpers from src/utils/writeDiagnostics.js — kept there because the
   Tx fallbacks in App.jsx use the same forensic logic for their error logs.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Btn, Card } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";
import { db } from "../firebase.js";
import {
  estimateDocSize,
  formatBytes,
  classifyDocSize,
  runWriteSelfTest,
} from "../utils/writeDiagnostics.js";

const SIZE_COLORS = {
  ok:     { fg: "#10B981", bg: "#10B98115", label: "ضمن الحدود الآمنة" },
  warn:   { fg: "#F59E0B", bg: "#F59E0B15", label: "اقترب من الحد (>80%)" },
  danger: { fg: "#EF4444", bg: "#EF444415", label: "🚨 تخطى الحد — الكتابة هتفشل!" },
};

export function WriteSelfTestCard({configDoc, salesDoc, tasksDoc, user, isMob}){
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const docs = [
    { path: "factory/config", obj: configDoc, key: "config" },
    { path: "factory/sales",  obj: salesDoc,  key: "sales" },
    { path: "factory/tasks",  obj: tasksDoc,  key: "tasks" },
  ].map(d => {
    const bytes = estimateDocSize(d.obj);
    const cls = classifyDocSize(bytes);
    return {...d, bytes, cls};
  });

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const userId = user?.email || user?.uid || "unknown";
      const r = await runWriteSelfTest(db, userId);
      setResult(r);
      if(r.ok){
        showToast(`✓ اختبار الحفظ نجح (${r.durationMs}ms)`);
      } else {
        showToast("⛔ فشل اختبار الحفظ — راجع التفاصيل تحت");
      }
    } catch(e){
      setResult({ ok: false, error: e.message || String(e), errorCategory: "unknown" });
    } finally {
      setRunning(false);
    }
  };

  /* Build a copy-paste forensic block when the test fails — user can paste
     this into a chat message to support so we have full context. */
  const buildCopyText = (r) => {
    const lines = [
      `[CLARK Write Self-Test Forensics]`,
      `User: ${user?.email || user?.uid || "—"}`,
      `Time: ${new Date().toISOString()}`,
      `Test result: ${r.ok ? "OK" : "FAILED"}`,
      `Duration: ${r.durationMs || "—"}ms`,
    ];
    if(!r.ok){
      lines.push(`Error code: ${r.errorCode || "—"}`);
      lines.push(`Error category: ${r.errorCategory || "—"}`);
      lines.push(`Error message: ${r.error || "—"}`);
    }
    lines.push(`---`);
    lines.push(`Document sizes:`);
    docs.forEach(d => {
      lines.push(`  ${d.path}: ${formatBytes(d.bytes)} (${d.cls})`);
    });
    return lines.join("\n");
  };

  const copyForensic = async (r) => {
    try {
      await navigator.clipboard.writeText(buildCopyText(r));
      showToast("✓ نسخت تفاصيل التشخيص — ابعتها لمدير النظام");
    } catch(e){
      showToast("⛔ تعذر النسخ — اعمل screenshot من الـ console بدل كده");
    }
  };

  return <Card title="🔧 اختبار حفظ البيانات (تشخيص)" style={{marginBottom:16}}>
    <div style={{padding:"10px 12px", background:T.accent+"08", borderRadius:8, fontSize:FS-2, color:T.textSec, lineHeight:1.7, marginBottom:12}}>
      💡 <b>إيمتى تستخدم ده؟</b> لو لاحظت إن البيانات بتختفي بعد الحفظ، أو اللي حصل في وضع "بيع سريع" وما اتحفظش، اضغط الزر تحت لتشخيص هل في مشكلة في الكتابة.
      <br/>📊 <b>أحجام الـ documents:</b> Firestore بيقبل حد أقصى 1 ميجابايت لكل document. لو وصلنا حد التحذير (أكثر من 80%)، الكتابة هتبدأ تفشل.
    </div>

    {/* Document size meter */}
    <div style={{display:"grid", gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)", gap:10, marginBottom:14}}>
      {docs.map(d => {
        const c = SIZE_COLORS[d.cls];
        const pct = Math.min(100, Math.round(d.bytes / 1048576 * 100));
        return <div key={d.key} style={{padding:10, borderRadius:8, background:c.bg, border:"1px solid "+c.fg+"40"}}>
          <div style={{fontSize:FS-2, color:c.fg, fontWeight:700, marginBottom:4}}>{d.path}</div>
          <div style={{fontSize:FS+2, fontWeight:800, color:c.fg, fontFamily:"monospace"}}>{formatBytes(d.bytes)}</div>
          <div style={{height:6, background:T.bg, borderRadius:3, overflow:"hidden", marginTop:6}}>
            <div style={{height:"100%", width:pct+"%", background:c.fg}}/>
          </div>
          <div style={{fontSize:FS-3, color:c.fg, marginTop:4, fontWeight:600}}>{c.label}</div>
        </div>;
      })}
    </div>

    {/* Run test button */}
    <div style={{display:"flex", justifyContent:"center", marginBottom:12}}>
      <Btn primary onClick={runTest} disabled={running} style={{minWidth:200, fontWeight:800, padding:"10px 18px"}}>
        {running ? "⏳ جاري الاختبار..." : "▶ تشغيل اختبار الحفظ"}
      </Btn>
    </div>

    {/* Result */}
    {result && (
      <div style={{
        padding:12, borderRadius:8,
        background: result.ok ? "#10B98108" : "#EF444408",
        border: "1.5px solid " + (result.ok ? "#10B98140" : "#EF444440"),
      }}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8, flexWrap:"wrap"}}>
          <div style={{fontSize:FS, fontWeight:800, color: result.ok ? "#10B981" : "#EF4444"}}>
            {result.ok ? "✓ الكتابة شغّالة تمام" : "⛔ فشل اختبار الكتابة"}
          </div>
          <div style={{fontSize:FS-2, color:T.textSec, fontFamily:"monospace"}}>
            {result.durationMs}ms
          </div>
        </div>
        {result.ok ? (
          <div style={{fontSize:FS-2, color:T.textSec, lineHeight:1.6}}>
            ✓ كتب marker إلى factory/_writeTest<br/>
            ✓ قرأ القيمة وتطابقت<br/>
            ✓ مسح الـ marker<br/>
            <b>كل العمليات اشتغلت في {result.durationMs}ms — الـ database شغال تمام.</b>
          </div>
        ) : (
          <>
            <div style={{padding:10, background:T.cardSolid, borderRadius:6, fontSize:FS-2, marginBottom:10}}>
              <div style={{color:T.textSec, fontWeight:700, marginBottom:4}}>السبب المحتمل:</div>
              <div style={{color:"#EF4444", fontWeight:700}}>{result.arabicHint || result.error}</div>
              {result.errorCode && (
                <div style={{fontFamily:"monospace", fontSize:FS-3, color:T.textMut, marginTop:6}}>
                  code: {result.errorCode}
                </div>
              )}
            </div>
            <Btn small onClick={() => copyForensic(result)} style={{background:T.accent+"15", color:T.accent, border:"1px solid "+T.accent+"40"}}>
              📋 نسخ تفاصيل التشخيص
            </Btn>
          </>
        )}
      </div>
    )}
  </Card>;
}
