/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ImportContactsModal (V21.21.61) — استيراد عملاء/موردين من Excel
   خطوات: رفع الملف → كشف الأعمدة + معاينة → استيراد بدفعات مع شريط تقدّم.
   الكتابة مباشرة على customersDocs/suppliersDocs بـ writeBatch (آمن للآلاف).
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, ltrPhone } from "../../utils/format.js";
import { showToast } from "../../utils/popups.js";
import { parseContactsExcel, buildImportObjects, writeImportBatched } from "../../utils/sales/importContacts.js";

export function ImportContactsModal({ data, user, onClose, onDone }){
  const [target, setTarget] = useState("customers"); /* customers | suppliers */
  const [dedupe, setDedupe] = useState(true);
  const [parsed, setParsed] = useState(null);        /* { rows, columns, headerRow, totalRows } */
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);        /* { written, skippedDup, invalid } */
  const fileRef = useRef(null);

  const userName = (user && (user.name || user.email)) || "";
  const accent = target === "suppliers" ? "#D97706" : "#0EA5E9";
  const existing = useMemo(() => (target === "suppliers" ? data.suppliers : data.customers) || [], [target, data.suppliers, data.customers]);

  /* معاينة الكائنات الناتجة (نقي — نفس منطق الكتابة) */
  const preview = useMemo(() => {
    if(!parsed || !parsed.rows.length) return null;
    return buildImportObjects({ rows: parsed.rows, target, dedupe, existing, userName });
  }, [parsed, target, dedupe, existing, userName]);

  const onPickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    setFileName(file.name);
    setParsed(null); setResult(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await parseContactsExcel(buf);
      if(!res.rows.length){ showToast("⚠️ مفيش صفوف بيانات في الملف"); setParsing(false); return; }
      if(res.columns.name == null && res.columns.phone == null){
        showToast("⚠️ مش لاقي أعمدة الاسم/التليفون — راجع عناوين الأعمدة");
      }
      setParsed(res);
    } catch(err){
      console.error("[ImportContacts] parse failed:", err);
      showToast("⛔ " + (err?.message || "تعذّر قراءة الملف"));
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    if(!preview || !preview.objs.length){ showToast("⚠️ مفيش بيانات صالحة للاستيراد"); return; }
    setImporting(true);
    setProgress({ done: 0, total: preview.objs.length });
    try {
      const written = await writeImportBatched({
        objs: preview.objs, target,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult({ written, skippedDup: preview.skippedDup, invalid: preview.invalid });
      showToast("✓ تم استيراد " + fmt(written) + (target === "suppliers" ? " مورد" : " عميل"));
      onDone && onDone();
    } catch(err){
      console.error("[ImportContacts] write failed:", err);
      showToast("⛔ تعذّر الحفظ: " + (err?.message || "خطأ غير معروف") + " — اللي اتكتب اتسجّل، أعد المحاولة للباقي");
    } finally {
      setImporting(false);
    }
  };

  const lbl = { fontSize: FS - 2, color: T.textSec, fontWeight: 600 };
  const colTag = (field, ar) => {
    const found = parsed && parsed.columns[field] != null;
    return (
      <span style={{ fontSize: FS - 3, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
        background: found ? "#10B98115" : T.err + "12", color: found ? "#059669" : T.err,
        border: "1px solid " + (found ? "#10B98140" : T.err + "30") }}>
        {found ? "✓" : "✗"} {ar}
      </span>
    );
  };

  const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100004, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={() => { if(!importing && !parsing) onClose && onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, padding: 22, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: FS + 3, fontWeight: 800, color: accent }}>📥 استيراد جهات اتصال من Excel</div>
          <Btn ghost small onClick={() => !importing && !parsing && onClose && onClose()}>✕</Btn>
        </div>
        <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 14, lineHeight: 1.7 }}>
          الأعمدة المتوقّعة: <b>الاسم</b> · <b>العنوان</b> · <b>رقم التليفون</b> · <b>النوع</b> (محل/مكتب).
          الأداة بتكتشف الأعمدة تلقائياً من عناوينها. التخزين متفرّق (آلاف العملاء بأمان — مش في مستند واحد).
        </div>

        {!result && (<>
          {/* الهدف + dedup */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[["customers", "👥 عملاء"], ["suppliers", "🏭 موردين"]].map(([v, l]) => (
                <button key={v} onClick={() => setTarget(v)} disabled={importing} style={{
                  padding: "6px 14px", borderRadius: 10, fontFamily: "inherit", fontWeight: 700, fontSize: FS - 1, cursor: "pointer",
                  background: target === v ? accent : T.bg, color: target === v ? "#fff" : T.textSec,
                  border: "1px solid " + (target === v ? accent : T.brd) }}>{l}</button>
              ))}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS - 1, color: T.text, cursor: "pointer" }}>
              <input type="checkbox" checked={dedupe} onChange={e => setDedupe(e.target.checked)} disabled={importing} />
              تجاهل المكرر (نفس رقم التليفون)
            </label>
          </div>

          {/* اختيار الملف */}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPickFile} disabled={importing || parsing} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <Btn small onClick={() => fileRef.current && fileRef.current.click()} disabled={importing || parsing} style={{ background: accent + "15", color: accent, border: "1px solid " + accent + "40", fontWeight: 700 }}>
              {parsing ? "...جارٍ القراءة" : "📂 اختر ملف Excel"}
            </Btn>
            {fileName && <span style={{ fontSize: FS - 2, color: T.textSec }}>{fileName}</span>}
          </div>

          {/* كشف الأعمدة + المعاينة */}
          {parsed && (
            <div style={{ padding: 12, borderRadius: 12, background: T.bg, border: "1px solid " + T.brd, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {colTag("name", "الاسم")}{colTag("phone", "التليفون")}{colTag("address", "العنوان")}{colTag("type", "النوع")}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: FS - 1, marginBottom: 10 }}>
                <span style={{ fontWeight: 800, color: accent }}>📊 {fmt(parsed.totalRows)} صف</span>
                {preview && <span style={{ fontWeight: 800, color: "#059669" }}>✓ {fmt(preview.objs.length)} هيتسجّل</span>}
                {preview && preview.skippedDup > 0 && <span style={{ color: T.warn, fontWeight: 700 }}>⊘ {fmt(preview.skippedDup)} مكرر</span>}
                {preview && preview.invalid > 0 && <span style={{ color: T.err, fontWeight: 700 }}>✗ {fmt(preview.invalid)} بدون اسم</span>}
              </div>
              {/* عينة أول 4 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(preview ? preview.objs : []).slice(0, 4).map((o, i) => (
                  <div key={i} style={{ fontSize: FS - 3, color: T.textSec, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ color: T.text }}>{o.name}</b>
                    {o.phone && <span>{ltrPhone(o.phone)}</span>}
                    {o.address && <span style={{ color: T.textMut }}>· {o.address}</span>}
                    {o.type && <span style={{ color: accent }}>· {o.type}</span>}
                  </div>
                ))}
                {preview && preview.objs.length > 4 && <div style={{ fontSize: FS - 3, color: T.textMut }}>… و {fmt(preview.objs.length - 4)} غيرهم</div>}
              </div>
            </div>
          )}

          {/* شريط التقدّم أثناء الاستيراد */}
          {importing && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: FS - 1, fontWeight: 700, color: accent, marginBottom: 6 }}>⏳ جارٍ الحفظ… {fmt(progress.done)} / {fmt(progress.total)} ({pct}%)</div>
              <div style={{ height: 10, borderRadius: 20, background: T.bg, overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", background: accent, transition: "width 0.2s" }} />
              </div>
              <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 6 }}>متقفلش الصفحة — الحفظ بيتم على دفعات.</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn ghost onClick={() => !importing && !parsing && onClose && onClose()} disabled={importing}>إلغاء</Btn>
            <Btn primary onClick={doImport} disabled={importing || parsing || !preview || !preview.objs.length}
              style={{ background: (importing || !preview || !preview.objs.length) ? T.textMut : accent, color: "#fff", border: "none" }}>
              {importing ? "..." : "⬇️ استيراد " + (preview ? fmt(preview.objs.length) : "") + (target === "suppliers" ? " مورد" : " عميل")}
            </Btn>
          </div>
        </>)}

        {/* شاشة النتيجة */}
        {result && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#059669", marginBottom: 6 }}>تم استيراد {fmt(result.written)} {target === "suppliers" ? "مورد" : "عميل"}</div>
            <div style={{ fontSize: FS - 1, color: T.textSec, lineHeight: 1.8 }}>
              {result.skippedDup > 0 && <div>⊘ تم تجاهل {fmt(result.skippedDup)} مكرر</div>}
              {result.invalid > 0 && <div>✗ {fmt(result.invalid)} صف بدون اسم اتساب</div>}
              <div style={{ color: T.textMut, marginTop: 8 }}>البيانات ظهرت في القائمة فوراً وجاهزة للحملات.</div>
            </div>
            <Btn primary onClick={() => onClose && onClose()} style={{ marginTop: 16, background: accent, color: "#fff", border: "none" }}>تمام</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
