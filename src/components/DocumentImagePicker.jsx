/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocumentImagePicker + ImagePickButton (V21.22.21)
   ───────────────────────────────────────────────────────────────────────
   الطلب (Ahmed): «لما اضغط احمل صورة لموديل/أوردر/لون يفتح المستندات كمان
   مش الكمبيوتر بس» — عشان الصور هتتخزّن في قسم «المستندات» وتترِبط بالموديلات.

   • <ImagePickButton> — trigger موحّد بيفتح قائمة مصدرين:
       📁 من الكمبيوتر → input file → onFile(file)   (المستدعي بيرفع لمجلده)
       🗂️ من المستندات → DocumentImagePicker → onPickUrl(url, fileRec)
     (صورة المستندات موجودة أصلاً على Storage — مفيش رفع جديد).

   • <DocumentImagePicker> — متصفّح صور `data.documentsTree.files` (صور بس،
     غير محذوفة) بفلتر مجلد + بحث + pagination (§15).

   ⚠️ صورة جاية من المستندات بـترجّع URL بس (من غير storagePath قابل للحذف) —
   لإن الملف بتاع المستندات بيملك دورة حياته؛ ماينفعش حذف الموديل يمسح مستند
   مشترك. المستدعي بيسيب imageStoragePath فاضي في الحالة دي.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef } from "react";
import { Btn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

const OVERLAY = {
  position: "fixed", inset: 0, zIndex: 100002,
  background: "rgba(15,23,42,0.55)", display: "flex",
  alignItems: "center", justifyContent: "center",
  padding: 16, direction: "rtl", fontFamily: "'Cairo',sans-serif",
};

/* ── متصفّح صور المستندات ── */
export function DocumentImagePicker({ data, onPick, onClose }){
  const tree = (data && data.documentsTree) || { folders: [], files: [] };
  const folders = Array.isArray(tree.folders) ? tree.folders : [];
  const allImages = useMemo(() => (Array.isArray(tree.files) ? tree.files : [])
    .filter(f => f && !f.deletedAt && (f.contentType || "").toLowerCase().startsWith("image/") && (f.downloadURL || f.url)),
    [tree.files]);

  const [folderId, setFolderId] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(60);

  const folderName = useMemo(() => {
    const m = {}; folders.forEach(f => { m[f.id] = f.name; }); return m;
  }, [folders]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return allImages.filter(f =>
      (!folderId || String(f.folderId) === String(folderId)) &&
      (!s || (f.name || "").toLowerCase().includes(s))
    );
  }, [allImages, folderId, q]);

  const shown = filtered.slice(0, limit);

  return (
    <div style={OVERLAY} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + T.brd, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: FS + 3, fontWeight: 800, color: T.text, flex: 1 }}>🗂️ اختر صورة من المستندات</div>
          <Btn small ghost onClick={onClose}>✕</Btn>
        </div>

        {/* filters */}
        {allImages.length > 0 && <div style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: "1px solid " + T.brd, flexWrap: "wrap" }}>
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }} placeholder="🔍 ابحث باسم الصورة..."
            style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", outline: "none" }} />
          <select value={folderId} onChange={e => { setFolderId(e.target.value); setLimit(60); }}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.cardSolid, color: T.text, outline: "none" }}>
            <option value="">📁 كل المجلدات</option>
            {folders.map(f => <option key={f.id} value={f.id}>{(f.icon || "📁") + " " + f.name}</option>)}
          </select>
        </div>}

        {/* grid */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {allImages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 20px", color: T.textSec }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>🗂️</div>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text, marginBottom: 6 }}>مفيش صور في المستندات لسه</div>
              <div style={{ fontSize: FS - 1, maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>ارفع الصور في قسم «📁 المستندات» الأول — وبعدين تقدر تختار منها هنا مباشرة.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 36, color: T.textMut, fontSize: FS - 1 }}>مفيش صور مطابقة للبحث</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12 }}>
                {shown.map(f => (
                  <div key={f.id} onClick={() => onPick(f)} title={f.name}
                    style={{ cursor: "pointer", border: "1px solid " + T.brd, borderRadius: 12, overflow: "hidden", background: T.bg, transition: "transform .12s, box-shadow .12s" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                    <div style={{ width: "100%", aspectRatio: "1 / 1", background: T.bg }}>
                      <img src={f.downloadURL || f.url} alt={f.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: FS - 3, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      {f.folderId != null && folderName[f.folderId] && <div style={{ fontSize: FS - 4, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📁 {folderName[f.folderId]}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {filtered.length > limit && (
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <Btn small onClick={() => setLimit(l => l + 60)} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "30" }}>عرض المزيد ({filtered.length - limit})</Btn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── chooser صغير: كمبيوتر / مستندات ── */
function SourceChooser({ onComputer, onDocuments, onClose }){
  return (
    <div style={{ ...OVERLAY, zIndex: 100003 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 360, padding: 20, border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>اختر مصدر الصورة</div>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 16 }}>من جهازك مباشرة، أو من مكتبة المستندات.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div onClick={onComputer} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, border: "1px solid " + T.brd, cursor: "pointer", background: T.bg }}>
            <span style={{ fontSize: 22 }}>📁</span>
            <div><div style={{ fontWeight: 800, color: T.text, fontSize: FS }}>من الكمبيوتر</div><div style={{ fontSize: FS - 3, color: T.textMut }}>رفع صورة جديدة من جهازك</div></div>
          </div>
          <div onClick={onDocuments} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, border: "1px solid " + T.accent + "40", cursor: "pointer", background: T.accent + "0D" }}>
            <span style={{ fontSize: 22 }}>🗂️</span>
            <div><div style={{ fontWeight: 800, color: T.accent, fontSize: FS }}>من المستندات</div><div style={{ fontSize: FS - 3, color: T.textMut }}>اختر من الصور المرفوعة في المستندات</div></div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Btn ghost small onClick={onClose}>إلغاء</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── trigger موحّد ──
   onFile(file)        — اتختار من الكمبيوتر (المستدعي بيرفع لمجلده الخاص)
   onPickUrl(url,rec)  — اتختار من المستندات (URL جاهز، مفيش رفع/حذف)        */
export function ImagePickButton({ data, onFile, onPickUrl, accept = "image/*", disabled, children, triggerStyle, title, stopPropagation = true }){
  const [menu, setMenu] = useState(false);
  const [docs, setDocs] = useState(false);
  const inputRef = useRef(null);

  const openMenu = (e) => {
    if(disabled) return;
    if(e){ e.preventDefault(); if(stopPropagation) e.stopPropagation(); }
    setMenu(true);
  };

  return (
    <>
      <span onClick={openMenu} title={title} style={{ cursor: disabled ? "default" : "pointer", ...(triggerStyle || {}) }}>{children}</span>
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }}
        onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if(f && onFile) onFile(f); }} />
      {menu && <SourceChooser
        onClose={() => setMenu(false)}
        onComputer={() => { setMenu(false); if(inputRef.current) inputRef.current.click(); }}
        onDocuments={() => { setMenu(false); setDocs(true); }} />}
      {docs && <DocumentImagePicker data={data}
        onClose={() => setDocs(false)}
        onPick={(rec) => { setDocs(false); if(onPickUrl) onPickUrl(rec.downloadURL || rec.url, rec); }} />}
    </>
  );
}

export default DocumentImagePicker;
