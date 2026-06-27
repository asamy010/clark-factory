/* ═══════════════════════════════════════════════════════════════════════
   CLARK · DocumentImagePicker + ImagePickButton (V21.22.22)
   ───────────────────────────────────────────────────────────────────────
   الطلب (Ahmed): «لما اضغط احمل صورة/ملف يفتح المستندات كمان مش الكمبيوتر بس»
   + «اقدر اختار اكتر من ملف في نفس الوقت» — عشان الصور/الملفات بتتخزّن في قسم
   «المستندات» وتترِبط بالموديلات/المرفقات (تمهيد لاستوديو الـ AI — Phase 2).

   • <ImagePickButton> — trigger موحّد بيفتح قائمة مصدرين:
       📁 من الكمبيوتر → input file → onFile(file) / onFiles(files[])
       🗂️ من المستندات → DocumentImagePicker → onPickUrl(url,rec) / onPickMany(recs)
     (ملف المستندات موجود أصلاً على Storage — مفيش رفع جديد).

   • <DocumentImagePicker> — متصفّح ملفات `data.documentsTree.files` (غير محذوفة)
     بفلتر مجلد + بحث + pagination (§15). يدعم:
       - imagesOnly (افتراضي true): صور بس بـ thumbnails.
       - multiple: اختيار متعدد (checkbox) + زر «اختيار المحدد (N)».

   ⚠️ الملف الجاي من المستندات بـترجّع URL/record بس من غير storagePath قابل
   للحذف — لإن مستند المكتبة بيملك دورة حياته؛ المستدعي بيسيب storagePath فاضي.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useCallback } from "react";
import { Btn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { getFileType, getFileIcon, formatFileSize } from "../utils/attachments.js";

const OVERLAY = {
  position: "fixed", inset: 0, zIndex: 100002,
  background: "rgba(15,23,42,0.55)", display: "flex",
  alignItems: "center", justifyContent: "center",
  padding: 16, direction: "rtl", fontFamily: "'Cairo',sans-serif",
};

const isImg = (f) => (f.contentType || "").toLowerCase().startsWith("image/") || getFileType(f.name || "") === "image";

/* ── متصفّح ملفات/صور المستندات ── */
export function DocumentImagePicker({ data, onPick, onPickMany, onClose, imagesOnly = true, multiple = false }){
  const tree = (data && data.documentsTree) || { folders: [], files: [] };
  const folders = Array.isArray(tree.folders) ? tree.folders : [];
  const allFiles = useMemo(() => (Array.isArray(tree.files) ? tree.files : [])
    .filter(f => f && !f.deletedAt && (f.downloadURL || f.url) && (!imagesOnly || isImg(f))),
    [tree.files, imagesOnly]);

  const [folderId, setFolderId] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(60);
  const [sel, setSel] = useState({}); /* id → fileRec (multi mode) */

  const folderName = useMemo(() => { const m = {}; folders.forEach(f => { m[String(f.id)] = f.name; }); return m; }, [folders]);

  /* V21.27.147: parentId → [أبناء] لبناء الشجرة + العدّ التراكمي. */
  const childrenMap = useMemo(() => {
    const m = {};
    folders.forEach(f => { const p = String(f.parentId || ""); (m[p] = m[p] || []).push(f); });
    return m;
  }, [folders]);

  /* كل المجلدات المتفرّعة من مجلد (شاملاً نفسه) — عشان فلتر/عدّ تراكمي. */
  const descendantSet = useCallback((rootId) => {
    const out = new Set([String(rootId)]);
    const stack = [String(rootId)];
    while (stack.length) {
      const cur = stack.pop();
      (childrenMap[cur] || []).forEach(c => { const cid = String(c.id); if (!out.has(cid)) { out.add(cid); stack.push(cid); } });
    }
    return out;
  }, [childrenMap]);

  /* مسار كل مجلد «أب / فرعي / الاسم» (lowercase) — للبحث باسم المجلد/المسار. */
  const folderPath = useMemo(() => {
    const byId = {}; folders.forEach(f => { byId[String(f.id)] = f; });
    const cache = {};
    const build = (id) => {
      const k = String(id == null ? "" : id);
      if (!k) return "";
      if (cache[k] != null) return cache[k];
      const f = byId[k]; if (!f) return "";
      cache[k] = ""; /* guard against cycles */
      const full = (build(f.parentId) ? build(f.parentId) + " / " : "") + (f.name || "");
      cache[k] = full;
      return full;
    };
    const m = {}; folders.forEach(f => { m[String(f.id)] = build(f.id).toLowerCase(); });
    return m;
  }, [folders]);

  /* عدّ تراكمي لكل مجلد: عدد المجلدات الفرعية المباشرة + عدد الملفات (هو +
     كل المتفرّعات منه) — عشان المجلد اللي جواه مجلدات ما يظهرش «صفر». */
  const folderStats = useMemo(() => {
    const filesByFolder = {};
    allFiles.forEach(f => { const k = String(f.folderId == null ? "" : f.folderId); filesByFolder[k] = (filesByFolder[k] || 0) + 1; });
    const stats = {};
    folders.forEach(f => {
      let files = 0;
      descendantSet(f.id).forEach(id => { files += filesByFolder[id] || 0; });
      stats[String(f.id)] = { sub: (childrenMap[String(f.id)] || []).length, files };
    });
    return stats;
  }, [folders, allFiles, childrenMap, descendantSet]);

  /* قائمة المجلدات مرتّبة هرمياً (للـ dropdown) مع عمق للمسافة البادئة. */
  const orderedFolders = useMemo(() => {
    const out = [];
    const walk = (parentKey, depth) => {
      (childrenMap[parentKey] || []).slice()
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || (a.name || "").localeCompare(b.name || "", "ar"))
        .forEach(f => { out.push({ folder: f, depth }); walk(String(f.id), depth + 1); });
    };
    walk("", 0);
    return out;
  }, [childrenMap]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    /* V21.27.147: فلتر المجلد تراكمي — يشمل الملفات في المجلد ومجلداته الفرعية. */
    const allowed = folderId ? descendantSet(folderId) : null;
    return allFiles.filter(f => {
      if (allowed && !allowed.has(String(f.folderId == null ? "" : f.folderId))) return false;
      if (!s) return true;
      /* بحث باسم الملف أو اسم/مسار المجلد. */
      if ((f.name || "").toLowerCase().includes(s)) return true;
      if ((folderPath[String(f.folderId)] || "").includes(s)) return true;
      return false;
    });
  }, [allFiles, folderId, q, descendantSet, folderPath]);

  const shown = filtered.slice(0, limit);
  const selCount = Object.keys(sel).length;

  const choose = (f) => {
    if(multiple){ setSel(p => { const n = { ...p }; if(n[f.id]) delete n[f.id]; else n[f.id] = f; return n; }); }
    else onPick(f);
  };
  const confirmMulti = () => {
    const recs = Object.values(sel);
    if(recs.length === 0) return;
    if(onPickMany) onPickMany(recs); else if(onPick) recs.forEach(onPick);
  };

  const title = imagesOnly ? (multiple ? "اختر صور من مساحة التخزين" : "اختر صورة من مساحة التخزين") : "اختر ملفات من مساحة التخزين";

  return (
    <div style={OVERLAY} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + T.brd, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: FS + 3, fontWeight: 800, color: T.text, flex: 1 }}>🗂️ {title}</div>
          {multiple && selCount > 0 && <span style={{ fontSize: FS - 2, fontWeight: 800, color: T.accent, background: T.accent + "14", padding: "3px 10px", borderRadius: 999 }}>{selCount} محدد</span>}
          <Btn small ghost onClick={onClose}>✕</Btn>
        </div>

        {/* filters */}
        {allFiles.length > 0 && <div style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: "1px solid " + T.brd, flexWrap: "wrap" }}>
          <input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }} placeholder="🔍 ابحث باسم الملف أو المجلد..."
            style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.bg, color: T.text, boxSizing: "border-box", outline: "none" }} />
          {/* V21.27.147: المجلدات هرمياً + عدد المجلدات الفرعية والملفات (تراكمي) */}
          <select value={folderId} onChange={e => { setFolderId(e.target.value); setLimit(60); }}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.cardSolid, color: T.text, outline: "none", maxWidth: 320 }}>
            <option value="">{"📁 كل المجلدات (" + allFiles.length + " صورة)"}</option>
            {orderedFolders.map(({ folder: f, depth }) => {
              const st = folderStats[String(f.id)] || { sub: 0, files: 0 };
              const indent = "  ".repeat(depth);
              const counts = (st.sub > 0 ? st.sub + " 📁" : "") + (st.sub > 0 && st.files > 0 ? " · " : "") + (st.files > 0 ? st.files + " 🖼️" : (st.sub > 0 ? "" : "0 🖼️"));
              return <option key={f.id} value={f.id}>{indent + (f.icon || "📁") + " " + f.name + "  — " + counts}</option>;
            })}
          </select>
        </div>}

        {/* grid */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {allFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 20px", color: T.textSec }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>🗂️</div>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text, marginBottom: 6 }}>{imagesOnly ? "مفيش صور في مساحة التخزين لسه" : "مفيش ملفات في مساحة التخزين لسه"}</div>
              <div style={{ fontSize: FS - 1, maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>ارفع الملفات في قسم «💾 مساحة التخزين» الأول — وبعدين تقدر تختار منها هنا مباشرة.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 36, color: T.textMut, fontSize: FS - 1 }}>مفيش نتائج مطابقة للبحث</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12 }}>
                {shown.map(f => {
                  const picked = !!sel[f.id];
                  const image = isImg(f);
                  return (
                    <div key={f.id} onClick={() => choose(f)} title={f.name}
                      style={{ position: "relative", cursor: "pointer", border: "2px solid " + (picked ? T.accent : T.brd), borderRadius: 12, overflow: "hidden", background: T.bg, transition: "transform .12s, box-shadow .12s" }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.transform = "translateY(-2px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                      {multiple && <div style={{ position: "absolute", top: 6, insetInlineStart: 6, zIndex: 2, width: 22, height: 22, borderRadius: 6, background: picked ? T.accent : "rgba(255,255,255,0.85)", border: "1px solid " + (picked ? T.accent : T.brd), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900 }}>{picked ? "✓" : ""}</div>}
                      <div style={{ width: "100%", aspectRatio: "1 / 1", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {image ? <img src={f.downloadURL || f.url} alt={f.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <span style={{ fontSize: 40 }}>{getFileIcon(getFileType(f.name || ""))}</span>}
                      </div>
                      <div style={{ padding: "6px 8px" }}>
                        <div style={{ fontSize: FS - 3, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                        <div style={{ fontSize: FS - 4, color: T.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.folderId != null && folderName[String(f.folderId)] ? "📁 " + folderName[String(f.folderId)] : (f.size ? formatFileSize(f.size) : "")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filtered.length > limit && (
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <Btn small onClick={() => setLimit(l => l + 60)} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "30" }}>عرض المزيد ({filtered.length - limit})</Btn>
                </div>
              )}
            </>
          )}
        </div>

        {/* footer (multi) */}
        {multiple && allFiles.length > 0 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: FS - 2, color: T.textMut }}>اضغط على الصور لتحديد أكتر من واحدة</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn ghost small onClick={onClose}>إلغاء</Btn>
              <Btn primary small onClick={confirmMulti} disabled={selCount === 0}>✓ اختيار المحدد ({selCount})</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── chooser صغير: كمبيوتر / مستندات ── */
function SourceChooser({ onComputer, onDocuments, onClose, multiple }){
  return (
    <div style={{ ...OVERLAY, zIndex: 100003 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 360, padding: 20, border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text, marginBottom: 4 }}>اختر المصدر</div>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 16 }}>{multiple ? "تقدر تختار أكتر من ملف من أي مصدر." : "من جهازك مباشرة، أو من مساحة التخزين."}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div onClick={onComputer} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, border: "1px solid " + T.brd, cursor: "pointer", background: T.bg }}>
            <span style={{ fontSize: 22 }}>📁</span>
            <div><div style={{ fontWeight: 800, color: T.text, fontSize: FS }}>من الكمبيوتر</div><div style={{ fontSize: FS - 3, color: T.textMut }}>{multiple ? "رفع ملف أو أكتر من جهازك" : "رفع ملف جديد من جهازك"}</div></div>
          </div>
          <div onClick={onDocuments} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: 12, border: "1px solid " + T.accent + "40", cursor: "pointer", background: T.accent + "0D" }}>
            <span style={{ fontSize: 22 }}>🗂️</span>
            <div><div style={{ fontWeight: 800, color: T.accent, fontSize: FS }}>من مساحة التخزين</div><div style={{ fontSize: FS - 3, color: T.textMut }}>{multiple ? "اختر ملف أو أكتر من مساحة التخزين" : "اختر من الملفات المرفوعة في مساحة التخزين"}</div></div>
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
   single: onFile(file) / onPickUrl(url, rec)
   multiple: onFiles(files[]) / onPickMany(recs[])                          */
export function ImagePickButton({ data, onFile, onFiles, onPickUrl, onPickMany, accept = "image/*", multiple = false, imagesOnly = true, disabled, children, triggerStyle, title, stopPropagation = true }){
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
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: "none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []); e.target.value = "";
          if(files.length === 0) return;
          if(multiple){ if(onFiles) onFiles(files); else if(onFile) files.forEach(onFile); }
          else if(onFile) onFile(files[0]);
        }} />
      {menu && <SourceChooser multiple={multiple}
        onClose={() => setMenu(false)}
        onComputer={() => { setMenu(false); if(inputRef.current) inputRef.current.click(); }}
        onDocuments={() => { setMenu(false); setDocs(true); }} />}
      {docs && <DocumentImagePicker data={data} multiple={multiple} imagesOnly={imagesOnly}
        onClose={() => setDocs(false)}
        onPick={(rec) => { setDocs(false); if(onPickUrl) onPickUrl(rec.downloadURL || rec.url, rec); }}
        onPickMany={(recs) => { setDocs(false); if(onPickMany) onPickMany(recs); else if(onPickUrl) recs.forEach(r => onPickUrl(r.downloadURL || r.url, r)); }} />}
    </>
  );
}

export default DocumentImagePicker;
