/* ═══════════════════════════════════════════════════════════════
   CLARK — Documents Tree page
   V21.9.95 (Slice 2/4 MVP) → V21.9.97 (Slice 4/4)
   ───────────────────────────────────────────────────────────────
   Folder tree + drag-and-drop upload + file operations + preview.

   Data shape (cfg.documentsTree):
     folders: [{id, name, icon, color, parentId, path, orderIndex,
                createdBy, createdAt, lastModifiedAt}]
     files:   [{id, name, folderId, storagePath, downloadURL,
                contentType, size, uploadedBy, uploadedAt,
                lastModifiedAt, description?, deletedAt?}]

   Storage layout:
     documents/{folderId}/{fileId}_{name}.{ext}     — active
     documents/.trash/{fileId}_{name}.{ext}         — soft-deleted
     documents/.versions/{fileId}/v{N}_{name}.{ext} — Slice 8
     documents/.thumbnails/{fileId}.jpg             — Slice 5
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useCallback } from "react";
import { FS } from "../constants/index.js";
import { T } from "../theme.js";
import { gid } from "../utils/format.js";
import { showToast, ask, tell, askInput } from "../utils/popups.js";
import { Btn, Inp, Sel, Card, Spinner } from "../components/ui.jsx";
import { storage } from "../firebase.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* Reuse the friendlyStorageError pattern from ShopifyPushModal (V21.9.16). */
function friendlyStorageError(err) {
  const raw = err?.code || err?.message || String(err || "");
  if (/storage\/unauthorized|does not have permission/i.test(raw)) {
    return "صلاحيات الـ Storage مش مكتملة — راجع storage.rules. تفاصيل: " + raw;
  }
  if (/storage\/canceled/i.test(raw)) return "اتـ cancel الـ upload";
  if (/storage\/retry-limit-exceeded|storage\/server-file-wrong-size/i.test(raw)) {
    return "الـ upload فشل (اتصال). تفاصيل: " + raw;
  }
  return raw;
}

/* Sanitize filename: keep Arabic + ASCII alphanumerics, replace others with _.
   Max 200 chars. The Storage path adds a fileId prefix so collisions are impossible. */
function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/[^\w.\-؀-ۿ\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 200);
}

/* Format byte size as KB / MB. */
function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

/* MIME → icon emoji */
function fileIcon(contentType) {
  const m = (contentType || "").toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m === "application/pdf") return "📄";
  if (m.includes("spreadsheetml") || m.includes("ms-excel") || m.endsWith("/csv")) return "📊";
  if (m.includes("wordprocessingml") || m === "application/msword") return "📝";
  if (m.includes("presentationml") || m.includes("ms-powerpoint")) return "📑";
  if (m === "application/zip" || m === "application/x-rar-compressed") return "🗜️";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎵";
  if (m.startsWith("text/")) return "📃";
  return "📎";
}

/* Whether the file is previewable in-browser. */
function isPreviewable(contentType) {
  const m = (contentType || "").toLowerCase();
  return m.startsWith("image/") || m === "application/pdf" || m.startsWith("text/");
}

/* Recursive children fetch — returns descendant folder IDs (including self). */
function getDescendantFolderIds(folders, rootId) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    folders.forEach(f => {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        changed = true;
      }
    });
  }
  return result;
}

/* Breadcrumb path from a folderId. */
function buildBreadcrumbs(folders, folderId) {
  const crumbs = [];
  let cur = folders.find(f => f.id === folderId);
  while (cur) {
    crumbs.unshift(cur);
    cur = cur.parentId ? folders.find(f => f.id === cur.parentId) : null;
  }
  return crumbs;
}

export function DocumentsPg({ data, upConfig, isMob, canEdit, user }) {
  const tree = data.documentsTree || { folders: [], files: [] };
  const folders = Array.isArray(tree.folders) ? tree.folders : [];
  const files = Array.isArray(tree.files) ? tree.files : [];
  const userEmail = user?.email || "—";

  /* Current folder navigation. null = root. */
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid"); /* grid | list */
  const [showTrash, setShowTrash] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, done: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  /* Computed: child folders of the current folder. */
  const currentFolders = useMemo(() =>
    folders.filter(f => (f.parentId || null) === currentFolderId)
           .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) ||
                            (a.name || "").localeCompare(b.name || "", "ar")),
    [folders, currentFolderId]);

  /* Computed: files in the current folder (or trash view). */
  const currentFiles = useMemo(() => {
    let result = files;
    if (showTrash) {
      result = result.filter(f => !!f.deletedAt);
    } else {
      result = result.filter(f => !f.deletedAt && (f.folderId || null) === currentFolderId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(f =>
        (f.name || "").toLowerCase().includes(q) ||
        (f.description || "").toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) =>
      (b.uploadedAt || "").localeCompare(a.uploadedAt || "")
    );
  }, [files, currentFolderId, search, showTrash]);

  const breadcrumbs = useMemo(() =>
    currentFolderId ? buildBreadcrumbs(folders, currentFolderId) : [],
    [folders, currentFolderId]);

  /* Stats: total files + total size (active only) */
  const stats = useMemo(() => {
    const active = files.filter(f => !f.deletedAt);
    const totalSize = active.reduce((s, f) => s + (Number(f.size) || 0), 0);
    const trashCount = files.filter(f => !!f.deletedAt).length;
    return { fileCount: active.length, totalSize, trashCount };
  }, [files]);

  /* ─────────── FOLDER CRUD ─────────── */

  const createFolder = async () => {
    if (!canEdit) {
      tell("صلاحيات", "ما عندكش صلاحية إضافة مجلد", { danger: true });
      return;
    }
    const name = await askInput("مجلد جديد", {
      label: "اسم المجلد:",
      placeholder: "مثال: ملفات قانونية",
      validate: v => v.trim() ? null : "الاسم مطلوب",
    });
    if (!name) return;
    /* Prevent duplicate sibling names */
    const dup = folders.find(f =>
      (f.parentId || null) === currentFolderId &&
      (f.name || "").trim() === name.trim()
    );
    if (dup) {
      tell("اسم مكرر", "في مجلد بنفس الاسم في نفس المكان", { danger: true });
      return;
    }
    const nowIso = new Date().toISOString();
    const newFolder = {
      id: gid(),
      name: name.trim(),
      icon: "📁",
      color: "#8B5CF6",
      parentId: currentFolderId || null,
      orderIndex: (currentFolders.length || 0) + 1,
      createdBy: userEmail,
      createdAt: nowIso,
      lastModifiedAt: nowIso,
    };
    upConfig(d => {
      if (!d.documentsTree) d.documentsTree = { folders: [], files: [] };
      if (!Array.isArray(d.documentsTree.folders)) d.documentsTree.folders = [];
      d.documentsTree.folders.push(newFolder);
    });
    showToast("✓ تم إنشاء المجلد");
  };

  const renameFolder = async (folder) => {
    if (!canEdit) return;
    const name = await askInput("تعديل اسم المجلد", {
      label: "الاسم الجديد:",
      defaultValue: folder.name,
      validate: v => v.trim() ? null : "الاسم مطلوب",
    });
    if (!name || name === folder.name) return;
    const nowIso = new Date().toISOString();
    upConfig(d => {
      const i = (d.documentsTree?.folders || []).findIndex(f => f.id === folder.id);
      if (i < 0) return;
      d.documentsTree.folders[i].name = name.trim();
      d.documentsTree.folders[i].lastModifiedAt = nowIso;
    });
    showToast("✓ تم التعديل");
  };

  const deleteFolder = async (folder) => {
    if (!canEdit) return;
    /* Get all descendant folder IDs */
    const descendants = getDescendantFolderIds(folders, folder.id);
    /* Count affected files */
    const affectedFiles = files.filter(f => descendants.has(f.folderId) && !f.deletedAt);
    if (affectedFiles.length > 0) {
      const ok = await ask(
        "حذف المجلد",
        `هذا المجلد + المجلدات الفرعية تحتوي على ${affectedFiles.length} ملف. كل الملفات هتنقل لـ سلة المهملات. متأكد؟`,
        { danger: true, confirmText: "حذف" }
      );
      if (!ok) return;
    } else {
      const ok = await ask("حذف المجلد", `حذف "${folder.name}"؟`, { danger: true });
      if (!ok) return;
    }
    const nowIso = new Date().toISOString();
    upConfig(d => {
      if (!d.documentsTree) return;
      /* Soft-delete affected files */
      (d.documentsTree.files || []).forEach(f => {
        if (descendants.has(f.folderId) && !f.deletedAt) {
          f.deletedAt = nowIso;
          f.deletedBy = userEmail;
        }
      });
      /* Hard-delete folders (they have no binary attachments) */
      d.documentsTree.folders = (d.documentsTree.folders || []).filter(
        f => !descendants.has(f.id)
      );
    });
    /* If we just deleted the folder we were viewing, navigate up */
    if (descendants.has(currentFolderId)) {
      setCurrentFolderId(folder.parentId || null);
    }
    showToast("✓ تم الحذف");
  };

  /* ─────────── FILE UPLOAD (DRAG-AND-DROP) ─────────── */

  const handleFiles = useCallback(async (fileList) => {
    if (!canEdit) {
      tell("صلاحيات", "ما عندكش صلاحية رفع ملفات", { danger: true });
      return;
    }
    const arr = Array.from(fileList || []);
    if (arr.length === 0) return;
    /* Size check */
    const MAX = 100 * 1024 * 1024;
    const oversized = arr.filter(f => f.size > MAX);
    if (oversized.length) {
      tell("ملفات كبيرة",
        `${oversized.length} ملف أكبر من 100 MB — هـ يتـ skipped.\n\n${oversized.map(f => "• " + f.name).join("\n")}`,
        { danger: true });
    }
    const accepted = arr.filter(f => f.size <= MAX);
    if (accepted.length === 0) return;

    setUploading(true);
    setUploadProgress({ total: accepted.length, done: 0 });

    const uploaded = [];
    for (const file of accepted) {
      try {
        const fileId = gid();
        const sanitized = sanitizeFilename(file.name);
        const path = `documents/${currentFolderId || "root"}/${fileId}_${sanitized}`;
        const ref = storageRef(storage, path);
        const snap = await uploadBytes(ref, file, {
          contentType: file.type || "application/octet-stream",
        });
        const downloadURL = await getDownloadURL(snap.ref);
        const nowIso = new Date().toISOString();
        uploaded.push({
          id: fileId,
          name: file.name,
          folderId: currentFolderId || null,
          storagePath: path,
          downloadURL,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          uploadedBy: userEmail,
          uploadedAt: nowIso,
          lastModifiedAt: nowIso,
          description: "",
          previewable: isPreviewable(file.type),
        });
        setUploadProgress(p => ({ ...p, done: p.done + 1 }));
      } catch (e) {
        console.error("[DocumentsPg] upload failed:", file.name, e);
        showToast(`⚠️ فشل رفع ${file.name}: ${friendlyStorageError(e)}`);
      }
    }

    if (uploaded.length > 0) {
      upConfig(d => {
        if (!d.documentsTree) d.documentsTree = { folders: [], files: [] };
        if (!Array.isArray(d.documentsTree.files)) d.documentsTree.files = [];
        d.documentsTree.files.push(...uploaded);
      });
      showToast(`✅ تم رفع ${uploaded.length} ملف`);
    }

    setUploading(false);
    setUploadProgress({ total: 0, done: 0 });
  }, [canEdit, currentFolderId, upConfig, userEmail]);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  /* ─────────── FILE OPERATIONS ─────────── */

  const renameFile = async (file) => {
    if (!canEdit) return;
    const name = await askInput("تعديل اسم الملف", {
      label: "الاسم الجديد:",
      defaultValue: file.name,
      validate: v => v.trim() ? null : "الاسم مطلوب",
    });
    if (!name || name === file.name) return;
    const nowIso = new Date().toISOString();
    upConfig(d => {
      const i = (d.documentsTree?.files || []).findIndex(f => f.id === file.id);
      if (i < 0) return;
      d.documentsTree.files[i].name = name.trim();
      d.documentsTree.files[i].lastModifiedAt = nowIso;
    });
    showToast("✓ تم التعديل");
  };

  /* Move popup state (askInput doesn't support select dropdowns, so we render
     our own modal inline at the bottom of the page). */
  const [movePopup, setMovePopup] = useState(null);
  const moveFile = (file) => {
    if (!canEdit) return;
    setMovePopup({ file, targetId: file.folderId || "" });
  };
  const confirmMove = () => {
    if (!movePopup) return;
    const { file, targetId } = movePopup;
    if (targetId === (file.folderId || "")) {
      setMovePopup(null);
      return;
    }
    const nowIso = new Date().toISOString();
    upConfig(d => {
      const i = (d.documentsTree?.files || []).findIndex(f => f.id === file.id);
      if (i < 0) return;
      d.documentsTree.files[i].folderId = targetId || null;
      d.documentsTree.files[i].lastModifiedAt = nowIso;
    });
    setMovePopup(null);
    showToast("✓ تم النقل");
  };

  const softDeleteFile = async (file) => {
    if (!canEdit) return;
    const ok = await ask("حذف الملف",
      `سيتم نقل "${file.name}" لسلة المهملات. (هـ يتـ permanent delete بعد 7 أيام)`,
      { danger: true });
    if (!ok) return;
    const nowIso = new Date().toISOString();
    upConfig(d => {
      const i = (d.documentsTree?.files || []).findIndex(f => f.id === file.id);
      if (i < 0) return;
      d.documentsTree.files[i].deletedAt = nowIso;
      d.documentsTree.files[i].deletedBy = userEmail;
    });
    showToast("🗑️ تم النقل لسلة المهملات");
  };

  const restoreFile = async (file) => {
    if (!canEdit) return;
    upConfig(d => {
      const i = (d.documentsTree?.files || []).findIndex(f => f.id === file.id);
      if (i < 0) return;
      delete d.documentsTree.files[i].deletedAt;
      delete d.documentsTree.files[i].deletedBy;
    });
    showToast("↩️ تم الاسترجاع");
  };

  const hardDeleteFile = async (file) => {
    if (!canEdit) return;
    const ok = await ask("حذف نهائي",
      `هذا الإجراء permanent — هـ يتـ delete الـ binary من Storage. متأكد؟`,
      { danger: true, confirmText: "حذف نهائي" });
    if (!ok) return;
    try {
      const ref = storageRef(storage, file.storagePath);
      await deleteObject(ref);
    } catch (e) {
      if (e?.code !== "storage/object-not-found") {
        console.error("[DocumentsPg] hard delete failed:", e);
        showToast(`⚠️ ${friendlyStorageError(e)}`);
        return;
      }
    }
    upConfig(d => {
      if (!d.documentsTree) return;
      d.documentsTree.files = (d.documentsTree.files || []).filter(f => f.id !== file.id);
    });
    showToast("✓ تم الحذف النهائي");
  };

  const downloadFile = (file) => {
    if (!file.downloadURL) {
      showToast("⚠️ لا يوجد رابط للتحميل");
      return;
    }
    /* Open in new tab — browser handles download or preview based on content-type. */
    window.open(file.downloadURL, "_blank", "noopener,noreferrer");
  };

  /* ─────────── PREVIEW MODAL ─────────── */

  const PreviewModal = () => {
    if (!previewFile) return null;
    const file = previewFile;
    const m = (file.contentType || "").toLowerCase();
    return (
      <div className="pop-overlay" style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }} onClick={() => setPreviewFile(null)}>
        <div onClick={e => e.stopPropagation()} style={{
          background: T.cardSolid, borderRadius: 16, padding: 16,
          width: "100%", maxWidth: 900, maxHeight: "92vh",
          display: "flex", flexDirection: "column", gap: 12, overflow: "hidden",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fileIcon(file.contentType)} {file.name}
              </div>
              <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>
                {fmtSize(file.size)} • {file.uploadedBy} • {(file.uploadedAt || "").split("T")[0]}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small onClick={() => downloadFile(file)} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "30" }}>⬇️ تحميل</Btn>
              <Btn ghost onClick={() => setPreviewFile(null)}>✕</Btn>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", borderRadius: 10, border: "1px solid " + T.brd, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {m.startsWith("image/") && (
              <img src={file.downloadURL} alt={file.name} style={{ maxWidth: "100%", maxHeight: "75vh", display: "block" }} />
            )}
            {m === "application/pdf" && (
              <iframe src={file.downloadURL} title={file.name} style={{ width: "100%", height: "75vh", border: "none", background: "#fff" }} />
            )}
            {m.startsWith("text/") && (
              <iframe src={file.downloadURL} title={file.name} style={{ width: "100%", height: "75vh", border: "none", background: "#fff" }} />
            )}
            {!isPreviewable(file.contentType) && (
              <div style={{ padding: 40, textAlign: "center", color: "#fff" }}>
                <div style={{ fontSize: 60, marginBottom: 12 }}>{fileIcon(file.contentType)}</div>
                <div style={{ fontSize: FS + 1, fontWeight: 700 }}>preview غير متاح لهذا النوع</div>
                <div style={{ fontSize: FS - 1, opacity: 0.8, marginTop: 6 }}>اضغط تحميل لفتح الملف</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ─────────── RENDER ─────────── */

  return (
    <div>
      <PreviewModal />

      {/* Header */}
      <Card title={showTrash ? "🗑️ سلة المهملات" : "📁 المستندات"} accent={"linear-gradient(135deg,#8B5CF6,#8B5CF6CC)"}
        extra={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!showTrash && canEdit && <Btn small onClick={() => fileInputRef.current?.click()} style={{ background: "#fff", color: "#8B5CF6", border: "none", fontWeight: 700 }}>📤 رفع ملف</Btn>}
            {!showTrash && canEdit && <Btn small onClick={createFolder} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none" }}>➕ مجلد جديد</Btn>}
            <Btn small onClick={() => setShowTrash(!showTrash)} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none" }}>
              {showTrash ? "📁 المستندات" : `🗑️ المهملات (${stats.trashCount})`}
            </Btn>
          </div>
        }
        style={{ marginBottom: 16 }}>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ padding: "8px 14px", borderRadius: 8, background: T.accent + "08", border: "1px solid " + T.accent + "20" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>📁 المجلدات</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.accent }}>{folders.length}</div>
          </div>
          <div style={{ padding: "8px 14px", borderRadius: 8, background: "#10B98108", border: "1px solid #10B98120" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>📄 الملفات</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#10B981" }}>{stats.fileCount}</div>
          </div>
          <div style={{ padding: "8px 14px", borderRadius: 8, background: "#F59E0B08", border: "1px solid #F59E0B20" }}>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>💾 المساحة</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#F59E0B" }}>{fmtSize(stats.totalSize)}</div>
          </div>
        </div>

        {/* Search */}
        <Inp value={search} onChange={setSearch} placeholder="🔍 ابحث في اسم الملف أو الوصف..." style={{ marginBottom: 12 }} />

        {/* Breadcrumbs */}
        {!showTrash && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12, fontSize: FS - 1 }}>
            <span onClick={() => setCurrentFolderId(null)} style={{ cursor: "pointer", color: currentFolderId ? T.accent : T.text, fontWeight: 700 }}>🏠 الجذر</span>
            {breadcrumbs.map((c, i) => (
              <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: T.textMut }}>/</span>
                <span
                  onClick={() => setCurrentFolderId(c.id)}
                  style={{ cursor: "pointer", color: i === breadcrumbs.length - 1 ? T.text : T.accent, fontWeight: 700 }}>
                  {c.icon || "📁"} {c.name}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Folders grid (only in non-trash view) */}
        {!showTrash && currentFolders.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            {currentFolders.map(f => {
              const childFileCount = files.filter(x => x.folderId === f.id && !x.deletedAt).length;
              return (
                <div key={f.id} style={{
                  padding: 12, borderRadius: 12,
                  background: (f.color || "#8B5CF6") + "08",
                  border: "1px solid " + (f.color || "#8B5CF6") + "30",
                  cursor: "pointer", position: "relative",
                }} onClick={() => setCurrentFolderId(f.id)}>
                  <div style={{ fontSize: 32, marginBottom: 4 }}>{f.icon || "📁"}</div>
                  <div style={{ fontSize: FS, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>{childFileCount} ملف</div>
                  {canEdit && (
                    <div style={{ position: "absolute", top: 6, insetInlineEnd: 6, display: "flex", gap: 4 }}>
                      <span onClick={(e) => { e.stopPropagation(); renameFolder(f); }} style={{ cursor: "pointer", fontSize: 14, padding: 4, borderRadius: 4, background: T.cardSolid, opacity: 0.85 }} title="تعديل">✏️</span>
                      <span onClick={(e) => { e.stopPropagation(); deleteFolder(f); }} style={{ cursor: "pointer", fontSize: 14, padding: 4, borderRadius: 4, background: T.cardSolid, opacity: 0.85 }} title="حذف">🗑️</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Drop zone (only in non-trash view) */}
        {!showTrash && canEdit && (
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 20, borderRadius: 12, marginBottom: 14,
              background: dragOver ? T.accent + "15" : T.bg,
              border: "2px dashed " + (dragOver ? T.accent : T.brd),
              textAlign: "center", cursor: "pointer", transition: "all 0.15s",
            }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>📤</div>
            <div style={{ fontSize: FS, fontWeight: 700, color: T.text }}>
              {uploading ? `جاري الرفع ${uploadProgress.done}/${uploadProgress.total}...` : "اسحب الملفات هنا أو اضغط للاختيار"}
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 4 }}>
              حد أقصى 100 MB لكل ملف
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Files grid */}
        {currentFiles.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textSec }}>
            {search.trim() ? "لا توجد نتائج" :
              showTrash ? "🗑️ سلة المهملات فاضية" :
                "📁 المجلد فاضي — ارفع ملف أو أنشئ مجلد فرعي"}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {currentFiles.map(file => {
              const previewOk = isPreviewable(file.contentType);
              const isImg = (file.contentType || "").startsWith("image/");
              return (
                <div key={file.id} style={{
                  padding: 10, borderRadius: 12,
                  background: T.cardSolid,
                  border: "1px solid " + T.brd,
                  display: "flex", flexDirection: "column", gap: 6,
                  position: "relative",
                  opacity: file.deletedAt ? 0.7 : 1,
                }}>
                  {/* Thumbnail / Icon */}
                  <div
                    onClick={() => previewOk ? setPreviewFile(file) : downloadFile(file)}
                    style={{
                      height: 100, borderRadius: 8, background: isImg ? "#000" : T.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", overflow: "hidden",
                    }}>
                    {isImg && file.downloadURL ? (
                      <img src={file.downloadURL} alt={file.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ fontSize: 40 }}>{fileIcon(file.contentType)}</div>
                    )}
                  </div>
                  {/* Filename + meta */}
                  <div style={{ minHeight: 50 }}>
                    <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: FS - 3, color: T.textSec, marginTop: 2 }}>
                      {fmtSize(file.size)} • {(file.uploadedAt || "").split("T")[0]}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {previewOk && <Btn small ghost onClick={() => setPreviewFile(file)} title="عرض">👁</Btn>}
                    <Btn small ghost onClick={() => downloadFile(file)} title="تحميل">⬇️</Btn>
                    {!file.deletedAt && canEdit && (
                      <>
                        <Btn small ghost onClick={() => renameFile(file)} title="تعديل الاسم">✏️</Btn>
                        <Btn small ghost onClick={() => moveFile(file)} title="نقل">📂</Btn>
                        <Btn small ghost onClick={() => softDeleteFile(file)} title="حذف" style={{ color: T.err }}>🗑️</Btn>
                      </>
                    )}
                    {file.deletedAt && canEdit && (
                      <>
                        <Btn small ghost onClick={() => restoreFile(file)} title="استرجاع" style={{ color: T.ok }}>↩️</Btn>
                        <Btn small ghost onClick={() => hardDeleteFile(file)} title="حذف نهائي" style={{ color: T.err }}>❌</Btn>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {uploading && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: T.accent + "08", border: "1px solid " + T.accent + "20", display: "flex", alignItems: "center", gap: 10 }}>
            <Spinner size="small" />
            <div style={{ fontSize: FS, fontWeight: 700, color: T.accent, flex: 1 }}>
              جاري رفع {uploadProgress.done} من {uploadProgress.total}...
            </div>
          </div>
        )}
      </Card>

      {showTrash && stats.trashCount > 0 && (
        <Card title="⚠️ ملاحظة" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: FS - 1, color: T.textSec, padding: "4px 0" }}>
            الملفات المحذوفة بـ يتم delete نهائياً بعد 7 أيام. اضغط ↩️ لاسترجاع ملف أو ❌ لحذفه نهائياً الآن.
          </div>
        </Card>
      )}

      {/* ─────────── MOVE FILE POPUP ─────────── */}
      {movePopup && (
        <div className="pop-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }} onClick={() => setMovePopup(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.cardSolid, borderRadius: 16, padding: 20,
            width: "100%", maxWidth: 480,
            border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.accent, marginBottom: 10 }}>
              📂 نقل الملف
            </div>
            <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 10 }}>
              {fileIcon(movePopup.file.contentType)} {movePopup.file.name}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 }}>
                المجلد الجديد:
              </label>
              <Sel value={movePopup.targetId} onChange={v => setMovePopup({ ...movePopup, targetId: v })}>
                <option value="">-- الجذر --</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>
                    {buildBreadcrumbs(folders, f.id).map(c => c.name).join(" / ")}
                  </option>
                ))}
              </Sel>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn ghost onClick={() => setMovePopup(null)}>إلغاء</Btn>
              <Btn primary onClick={confirmMove}>نقل</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
