/* ═══════════════════════════════════════════════════════════════════════
   CLARK Accounting · FailuresCard
   ───────────────────────────────────────────────────────────────────────
   Shows unresolved auto-post failures with per-row retry, bulk retry,
   filter by error type, and dismiss option.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card } from "../ui.jsx";
import { retryFailure, retryAllFailures, dismissFailure, purgeResolvedFailures } from "../../utils/accounting/failureRetry.js";

const TYPE_LABELS = {
  sale:                "بيع",
  saleReturn:          "مرتجع",
  customerPay:         "دفعة عميل",
  customerCheck:       "شيك مستلم",
  customerCheckCollect:"تحصيل شيك",
  workshopReceive:     "استلام من ورشة",
  workshopPay:         "دفعة لورشة",
  hr:                  "حركة موظف",
  treasury:            "حركة خزينة",
};

const ERR_LABELS = {
  "coa-empty":       {label:"شجرة الحسابات فارغة", icon:"🌳", color:"#F59E0B", hint:"ازرع الشجرة الافتراضية من تبويب 'شجرة الحسابات' أولاً"},
  "missing-mapping": {label:"حساب مفقود في الإعدادات", icon:"🔗", color:"#EF4444", hint:"راجع قواعد الترحيل في الإعدادات وتأكد إن كل الحسابات المستخدمة موجودة"},
  "non-leaf":        {label:"حساب غير فرعي", icon:"🌿", color:"#F59E0B", hint:"الحساب المُحدّد ليس فرعياً — يجب اختيار حساب فرعي يقبل الترحيل"},
  "unbalanced":      {label:"قيد غير متوازن", icon:"⚖️", color:"#EF4444", hint:"غالباً مشكلة في القيمة أو الـrules — راجع الإعدادات"},
  "firestore":       {label:"خطأ اتصال", icon:"🌐", color:"#3B82F6", hint:"إعد المحاولة بعد التأكد من الاتصال"},
  "unknown":         {label:"خطأ غير معروف", icon:"❓", color:"#64748B", hint:"اطلع على الرسالة التفصيلية"},
};

export function FailuresCard({config, upConfig, T, FS, isMob, showToast, userName}){
  const [retryingId, setRetryingId] = useState(null);
  const [bulkRetryProgress, setBulkRetryProgress] = useState(null);
  const [filterCode, setFilterCode] = useState("all");

  const allFailures = config.accountingPostFailures || [];
  const unresolved = useMemo(() => allFailures.filter(f => !f.resolvedAt), [allFailures]);
  const resolved   = useMemo(() => allFailures.filter(f => f.resolvedAt), [allFailures]);

  const filtered = useMemo(() => {
    if(filterCode === "all") return unresolved;
    return unresolved.filter(f => (f.errorCode||"unknown") === filterCode);
  }, [unresolved, filterCode]);

  /* Group counts by error code for filter badges */
  const codeCounts = useMemo(() => {
    const out = {};
    unresolved.forEach(f => {
      const k = f.errorCode || "unknown";
      out[k] = (out[k]||0) + 1;
    });
    return out;
  }, [unresolved]);

  const handleRetry = async (failure) => {
    setRetryingId(failure.id);
    try {
      const r = await retryFailure(config, failure, userName);
      if(r.ok) showToast("✓ تم الترحيل بنجاح");
      else if(!r.sourceFound) alert("⚠️ لا يمكن إعادة المحاولة — العملية الأصلية غير موجودة (ربما تم حذفها). اضغط 'تجاهل' لإزالتها من القائمة.");
      else alert("⚠️ فشلت المحاولة:\n"+r.error);
    } catch(e){
      alert("⚠️ خطأ: "+e.message);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAll = async () => {
    if(filtered.length === 0) return;
    if(!confirm(`إعادة المحاولة لـ${filtered.length} عملية؟`)) return;
    setBulkRetryProgress({n:0, total:filtered.length, label:"بدء..."});
    try {
      /* Iterate manually so we can show progress */
      let succeeded = 0, failed = 0;
      for(let i=0; i<filtered.length; i++){
        const f = filtered[i];
        setBulkRetryProgress({n:i, total:filtered.length, label:f.label||f.type});
        try {
          const r = await retryFailure(config, f, userName);
          if(r.ok) succeeded++; else failed++;
        } catch(e){ failed++; }
      }
      setBulkRetryProgress({n:filtered.length, total:filtered.length, label:"اكتمل"});
      showToast(`✓ نجح ${succeeded} · فشل ${failed}`);
      setTimeout(() => setBulkRetryProgress(null), 1500);
    } catch(e){
      alert("فشل: "+e.message);
      setBulkRetryProgress(null);
    }
  };

  const handleDismiss = (failure) => {
    if(!confirm(`تجاهل هذا الخطأ؟\n\n${failure.errorMessage}\n\nسيُزال من القائمة لكن العملية الأصلية لن يكون لها قيد محاسبي.`)) return;
    dismissFailure(upConfig, failure.id);
    showToast("✓ تم التجاهل");
  };

  const handlePurge = () => {
    if(!confirm("حذف كل الأخطاء المُحلولة من السجل نهائياً؟")) return;
    purgeResolvedFailures(upConfig);
    showToast("✓ تم التنظيف");
  };

  /* Don't render the card if there's nothing to show */
  if(unresolved.length === 0 && resolved.length === 0) return null;

  return <Card title={"⚠️ أخطاء الترحيل المحاسبي" + (unresolved.length > 0 ? " (" + unresolved.length + ")" : "")} style={{marginBottom:16}}>
    {unresolved.length === 0 ? <div style={{padding:14, background:T.ok+"08", borderRadius:8, border:"1px solid "+T.ok+"40", color:T.ok, fontWeight:700, textAlign:"center"}}>
      ✅ لا توجد أخطاء غير محلولة — كل العمليات بترحيلها بنجاح
    </div> : <>
      {/* Filter strip */}
      <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:12}}>
        <span onClick={() => setFilterCode("all")} style={{padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:FS-2, fontWeight:700, background: filterCode==="all"?T.accent+"15":T.bg, border:"1px solid "+(filterCode==="all"?T.accent+"40":T.brd), color:filterCode==="all"?T.accent:T.text}}>
          الكل ({unresolved.length})
        </span>
        {Object.entries(codeCounts).map(([code,count]) => {
          const meta = ERR_LABELS[code] || ERR_LABELS.unknown;
          const isActive = filterCode === code;
          return <span key={code} onClick={() => setFilterCode(code)} style={{padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:FS-2, fontWeight:700, background: isActive?meta.color+"15":T.bg, border:"1px solid "+(isActive?meta.color+"40":T.brd), color:isActive?meta.color:T.textSec, display:"inline-flex", alignItems:"center", gap:4}}>
            <span>{meta.icon}</span><span>{meta.label}</span><span style={{opacity:0.7}}>({count})</span>
          </span>;
        })}
      </div>

      {/* Bulk action bar */}
      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center"}}>
        <Btn primary onClick={handleRetryAll} disabled={!!bulkRetryProgress || filtered.length === 0} style={{background:T.ok, color:"#fff", border:"none", fontWeight:800}}>
          🔁 إعادة محاولة الكل ({filtered.length})
        </Btn>
        <div style={{flex:1}}/>
        {resolved.length > 0 && <Btn ghost small onClick={handlePurge}>🗑 تنظيف الأخطاء المحلولة ({resolved.length})</Btn>}
      </div>

      {/* Progress */}
      {bulkRetryProgress && <div style={{marginBottom:12}}>
        <div style={{fontSize:FS-2, color:T.textSec, marginBottom:4}}>{bulkRetryProgress.label} · {bulkRetryProgress.n}/{bulkRetryProgress.total}</div>
        <div style={{height:8, background:T.bg, borderRadius:4, overflow:"hidden"}}>
          <div style={{height:"100%", width:(bulkRetryProgress.n/bulkRetryProgress.total*100)+"%", background:T.accent, transition:"width 0.3s"}}/>
        </div>
      </div>}

      {/* Failure list */}
      <div style={{display:"flex", flexDirection:"column", gap:6, maxHeight:500, overflowY:"auto"}}>
        {filtered.map(f => {
          const meta = ERR_LABELS[f.errorCode||"unknown"] || ERR_LABELS.unknown;
          const typeLabel = TYPE_LABELS[f.type] || f.type;
          return <div key={f.id} style={{padding:isMob?10:12, background:T.cardSolid, borderRadius:8, border:"1px solid "+meta.color+"40", borderInlineStart:"4px solid "+meta.color}}>
            <div style={{display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:6}}>
              <span style={{fontSize:18}}>{meta.icon}</span>
              <span style={{fontSize:FS, fontWeight:800, color:T.text}}>{typeLabel}</span>
              <span style={{fontSize:FS-3, color:meta.color, padding:"2px 8px", background:meta.color+"15", borderRadius:4, fontWeight:700}}>{meta.label}</span>
              {f.attempts > 1 && <span style={{fontSize:FS-3, color:T.warn, padding:"2px 6px", background:T.warn+"15", borderRadius:4, fontWeight:700}}>محاولات: {f.attempts}</span>}
              <div style={{flex:1}}/>
              <Btn small ghost onClick={() => handleDismiss(f)} title="تجاهل (إخفاء من القائمة)">
                ✕ تجاهل
              </Btn>
              <Btn small primary onClick={() => handleRetry(f)} disabled={retryingId === f.id} style={{background:T.ok, color:"#fff", border:"none", fontWeight:700}}>
                {retryingId === f.id ? "⏳" : "🔁 إعادة المحاولة"}
              </Btn>
            </div>
            <div style={{padding:"8px 10px", background:T.bg, borderRadius:6, fontSize:FS-2, color:T.text, lineHeight:1.6}}>
              <b>الخطأ:</b> {f.errorMessage}
            </div>
            {meta.hint && <div style={{marginTop:6, fontSize:FS-3, color:meta.color, fontWeight:700, padding:"4px 8px", background:meta.color+"08", borderRadius:4}}>
              💡 {meta.hint}
            </div>}
            <div style={{marginTop:6, fontSize:FS-3, color:T.textMut, display:"flex", flexWrap:"wrap", gap:8}}>
              {f.sourceId && <span>🔑 {f.sourceId.slice(0,30)}{f.sourceId.length>30?"...":""}</span>}
              <span>📅 {(f.happenedAt||"").slice(0,10)}</span>
              {f.lastAttemptAt && f.lastAttemptAt !== f.happenedAt && <span>آخر محاولة: {f.lastAttemptAt.slice(0,10)}</span>}
            </div>
          </div>;
        })}
      </div>
    </>}
  </Card>;
}
