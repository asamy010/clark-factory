/* ═══════════════════════════════════════════════════════════════
   CLARK — RichTextEditor (V21.27.4)

   محرّر منسّق بسيط «على شكل وورد» (contentEditable + execCommand) — بدون
   مكتبات خارجية. بيدعم: عريض/مائل/تحته خط · عنوان · قوائم نقطية/مرقّمة ·
   إدراج جدول · مسح تنسيق. بيخزّن HTML (مع sanitize). يُستخدم لتفاصيل التشغيل
   في الموديل، وبتتطبع/بتتعرض مع أمر التشغيل.
   ═══════════════════════════════════════════════════════════════ */
import { useRef, useEffect } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { sanitizeHtml } from "../utils/sanitizeHtml.js";

export function RichTextEditor({ value, onChange, placeholder, minHeight }){
  const ref = useRef(null);
  /* ضبط المحتوى مرة واحدة عند التركيب (تجنّب قفز المؤشر مع كل تعديل). */
  useEffect(() => {
    if(ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const emit = () => { if(ref.current) onChange(sanitizeHtml(ref.current.innerHTML)); };
  const exec = (cmd, arg) => { if(ref.current) ref.current.focus(); try { document.execCommand(cmd, false, arg); } catch(_e){} emit(); };
  const insertTable = () => exec("insertHTML", "<table border='1'><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p></p>");
  const tbBtn = (label, onClick, title) => <button type="button" title={title} onMouseDown={e => { e.preventDefault(); onClick(); }} style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid " + T.brd, background: T.cardSolid, color: T.text, fontWeight: 700, fontSize: FS - 2, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>;
  return <div style={{ border: "1px solid " + T.brd, borderRadius: 10, overflow: "hidden", background: T.cardSolid }}>
    <style>{".clark-rte:empty:before{content:attr(data-ph);color:" + T.textMut + ";pointer-events:none}.clark-rte table{border-collapse:collapse;width:100%;margin:6px 0}.clark-rte td{border:1px solid " + T.brd + ";padding:4px 8px}.clark-rte h3{font-size:" + (FS + 3) + "px;margin:8px 0 4px;font-weight:800}.clark-rte ul,.clark-rte ol{padding-inline-start:22px;margin:6px 0}"}</style>
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "7px 8px", borderBottom: "1px solid " + T.brd, background: T.bg }}>
      {tbBtn("B", () => exec("bold"), "عريض")}
      {tbBtn("I", () => exec("italic"), "مائل")}
      {tbBtn("U", () => exec("underline"), "تحته خط")}
      {tbBtn("H عنوان", () => exec("formatBlock", "<h3>"), "عنوان")}
      {tbBtn("• قائمة", () => exec("insertUnorderedList"), "قائمة نقطية")}
      {tbBtn("1. ترقيم", () => exec("insertOrderedList"), "قائمة مرقّمة")}
      {tbBtn("▦ جدول", insertTable, "إدراج جدول ٢×٢")}
      {tbBtn("✕ تنسيق", () => exec("removeFormat"), "مسح التنسيق")}
    </div>
    <div ref={ref} className="clark-rte" contentEditable suppressContentEditableWarning dir="rtl" data-ph={placeholder || ""} onInput={emit} onBlur={emit}
      style={{ minHeight: minHeight || 140, padding: "10px 12px", outline: "none", fontSize: FS, lineHeight: 1.8, color: T.text, direction: "rtl" }} />
  </div>;
}

export default RichTextEditor;
