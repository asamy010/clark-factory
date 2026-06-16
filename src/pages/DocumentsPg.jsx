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

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { FS } from "../constants/index.js";
import { T } from "../theme.js";
import { gid } from "../utils/format.js";
import { showToast, ask, tell, askInput } from "../utils/popups.js";
import { Btn, Inp, Sel, Card, Spinner } from "../components/ui.jsx";
import { storage, auth } from "../firebase.js";
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

/* V21.9.186 — TreeNode (recursive).
   Renders one folder + its descendants. Indent grows with depth. Click on the
   row sets it as the current folder; click on the chevron toggles expand. */
function TreeNode({ folder, allFolders, depth, fileCounts, currentFolderId, expanded, onToggle, onSelect }) {
  const children = allFolders
    .filter(f => (f.parentId || null) === folder.id)
    .sort((a, b) =>
      (a.orderIndex || 0) - (b.orderIndex || 0) ||
      (a.name || "").localeCompare(b.name || "", "ar")
    );
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = folder.id === currentFolderId;
  const count = fileCounts[folder.id] || 0;
  return (
    <div>
      <div
        onClick={() => onSelect(folder.id)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 8px",
          paddingInlineStart: 8 + depth * 14,
          borderRadius: 6,
          cursor: "pointer",
          background: isActive ? (folder.color || "#8B5CF6") + "18" : "transparent",
          color: isActive ? (folder.color || "#8B5CF6") : T.text,
          fontWeight: isActive ? 700 : 500,
          fontSize: FS - 1,
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.bg; }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(folder.id); }}
            style={{
              fontSize: 10, color: T.textMut, cursor: "pointer",
              width: 14, display: "inline-flex", alignItems: "center", justifyContent: "center",
              transform: isOpen ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
            title={isOpen ? "طي" : "فتح"}
          >▶</span>
        ) : (
          <span style={{ width: 14, display: "inline-block" }} />
        )}
        <span style={{ fontSize: 14 }}>{folder.icon || "📁"}</span>
        <span style={{
          flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{folder.name}</span>
        {count > 0 && (
          <span style={{
            fontSize: FS - 4, fontWeight: 600,
            color: isActive ? (folder.color || "#8B5CF6") : T.textMut,
            background: isActive ? (folder.color || "#8B5CF6") + "20" : T.bg,
            padding: "1px 6px", borderRadius: 8, minWidth: 18, textAlign: "center",
          }}>{count}</span>
        )}
      </div>
      {hasChildren && isOpen && (
        <div>
          {children.map(c => (
            <TreeNode
              key={c.id}
              folder={c}
              allFolders={allFolders}
              depth={depth + 1}
              fileCounts={fileCounts}
              currentFolderId={currentFolderId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const [selectedIds, setSelectedIds] = useState(() => new Set()); /* V21.26.12: تحديد متعدد */
  const [waPopup, setWaPopup] = useState(null); /* {files} — إرسال واتساب يدوي للعملاء */
  const [waSearch, setWaSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, done: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  /* ── V21.9.186 — Tree sidebar state ──
     `recentView` is a virtual folder: shows files from the last 30 days
     across the entire tree. Mutually exclusive with currentFolderId/showTrash.
     `expandedFolders` is a Set<folderId> of folders that are open in the tree.
     `sidebarOpen` controls mobile drawer visibility (always-on desktop). */
  const [recentView, setRecentView] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleFolderExpand = useCallback((folderId) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);
  /* When user navigates to a deep folder, auto-expand all ancestors so the
     tree highlights the path. Doesn't collapse anything already open. */
  useEffect(() => {
    if (!currentFolderId) return;
    setExpandedFolders(prev => {
      const next = new Set(prev);
      let cur = folders.find(f => f.id === currentFolderId);
      while (cur && cur.parentId) {
        next.add(cur.parentId);
        cur = folders.find(f => f.id === cur.parentId);
      }
      return next;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [currentFolderId]);
  /* Mobile: close drawer after a selection */
  const selectFolderFromTree = useCallback((folderId) => {
    setCurrentFolderId(folderId);
    setShowTrash(false);
    setRecentView(false);
    if (isMob) setSidebarOpen(false);
  }, [isMob]);

  /* Computed: child folders of the current folder. */
  const currentFolders = useMemo(() =>
    folders.filter(f => (f.parentId || null) === currentFolderId)
           .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) ||
                            (a.name || "").localeCompare(b.name || "", "ar")),
    [folders, currentFolderId]);

  /* V21.26.23: لما فيه بحث — البحث بيشمل المجلدات عبر كل الشجرة (مش المجلد
     الحالي بس)، فالنتيجة قسمين منفصلين: المجلدات المطابقة فوق ثم الملفات. */
  const searchActive = !!search.trim() && !showTrash && !recentView;
  const matchedFolders = useMemo(() => {
    if (!searchActive) return [];
    const q = search.trim().toLowerCase();
    return folders.filter(f => (f.name || "").toLowerCase().includes(q))
                  .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  }, [folders, search, searchActive]);

  /* Computed: files in the current folder (or trash / recent view).
     V21.9.186: added recentView — files from the last 30 days across the
     entire tree, sorted newest-first. Mutually exclusive with showTrash. */
  const currentFiles = useMemo(() => {
    let result = files;
    if (showTrash) {
      result = result.filter(f => !!f.deletedAt);
    } else if (recentView) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      result = result.filter(f => !f.deletedAt && (f.uploadedAt || "") >= thirtyDaysAgo);
    } else if (search.trim()) {
      /* V21.26.23: بحث عام عبر كل المجلدات (مش المجلد الحالي بس) */
      result = result.filter(f => !f.deletedAt);
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
  }, [files, currentFolderId, search, showTrash, recentView]);

  /* V21.26.12: تنقّل بالأسهم في المعاينة بين صور المجلد الحالي. */
  const navPreview = (dir) => {
    const imgs = currentFiles.filter(f => isPreviewable(f.contentType));
    if (!previewFile || imgs.length < 2) return;
    const idx = imgs.findIndex(f => f.id === previewFile.id);
    if (idx < 0) return;
    setPreviewFile(imgs[(idx + dir + imgs.length) % imgs.length]);
  };
  useEffect(() => {
    if (!previewFile) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setPreviewFile(null); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); navPreview(1); }   /* RTL: يسار = التالي */
      else if (e.key === "ArrowRight") { e.preventDefault(); navPreview(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /* V21.26.12: تحديد متعدد — حذف + إرسال واتساب يدوي. */
  const toggleSel = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSelectedIds(new Set());
  const selectedFiles = currentFiles.filter(f => selectedIds.has(f.id));
  const bulkDeleteSelected = async () => {
    const ids = [...selectedIds]; if (ids.length === 0) return;
    const ok = await ask("حذف الملفات المحددة", "هيتنقل " + ids.length + " ملف لسلة المهملات.", { danger: true });
    if (!ok) return;
    const nowIso = new Date().toISOString();
    upConfig(d => { (d.documentsTree?.files || []).forEach(f => { if (ids.includes(f.id)) { f.deletedAt = nowIso; f.deletedBy = userEmail; } }); });
    clearSel(); showToast("🗑️ تم نقل المحدد لسلة المهملات");
  };
  /* تطبيع رقم مصري لصيغة wa.me (12 رقم تبدأ بـ20). */
  const waDigits = (p) => {
    let d = String(p || "").replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.startsWith("20")) return d;
    if (d.startsWith("0")) return "20" + d.slice(1);
    if (d.length === 10 && d.startsWith("1")) return "20" + d;
    return d;
  };
  const sendWaToPhone = (phone, name) => {
    const digits = waDigits(phone);
    if (digits.length < 11) { showToast("⚠️ رقم تليفون غير صالح"); return; }
    const files = (waPopup && waPopup.files) || [];
    const urls = files.map(f => f.downloadURL).filter(Boolean);
    if (urls.length === 0) { showToast("⚠️ مفيش روابط للصور"); return; }
    const msg = (name ? "مرحباً " + name + " 👋\n" : "") + "صور من CLARK:\n\n" + urls.join("\n\n");
    const win = window.open("about:blank", "_blank"); /* §7: pre-open للحفاظ على user-gesture */
    const url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(msg);
    if (win && !win.closed) win.location.href = url; else window.location.href = url;
    setWaPopup(null); showToast("✓ افتح واتساب — ابعت الرسالة يدوياً");
  };

  /* V21.9.186 — per-folder active file count for the tree badges.
     Computed once over the file list. Includes files DIRECTLY in the folder
     (not recursive — Odoo's tree shows direct count, descendants are seen
     by expanding). */
  const folderFileCounts = useMemo(() => {
    const counts = {};
    for (const f of files) {
      if (f.deletedAt) continue;
      const k = f.folderId || "__root__";
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [files]);

  /* Top-level folders (parentId null) for the tree's root level */
  const rootFolders = useMemo(() =>
    folders.filter(f => !f.parentId)
           .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) ||
                            (a.name || "").localeCompare(b.name || "", "ar")),
    [folders]);

  /* Counts for the 3 special sidebar entries */
  const recentCount = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return files.filter(f => !f.deletedAt && (f.uploadedAt || "") >= cutoff).length;
  }, [files]);
  const rootFileCount = folderFileCounts.__root__ || 0;

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

  /* V21.23.4: المساحة الفعلية المستهلكة من Firebase Storage كله (مش بس
     المستندات) — للحذر من تجاوز الحد المجاني (٥ جيجا) والتكلفة. */
  const FREE_TIER = 5 * 1024 * 1024 * 1024;
  const [bucketUsage, setBucketUsage] = useState(null);
  const [bucketBusy, setBucketBusy] = useState(false);
  const PREFIX_LABELS = { images: "🖼️ صور التطبيق", documents: "📁 مساحة التخزين", orders: "✂️ صور الأوامر", "shopify-products": "🛍️ صور شوبيفاي", "ai-generated": "🪄 صور الـ AI", "ai-sources": "🪄 مصادر الـ AI" };
  const loadBucketUsage = useCallback(async () => {
    setBucketBusy(true);
    try {
      const u = auth.currentUser;
      if(!u) throw new Error("مش مسجّل دخول");
      const token = await u.getIdToken();
      const res = await fetch("/api/storage/usage", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}" });
      const j = await res.json().catch(() => ({ ok: false, error: "رد غير صالح" }));
      if(!res.ok || j.ok === false) throw new Error(j.error || ("فشل (" + res.status + ")"));
      setBucketUsage(j);
    } catch(e){ showToast("⛔ " + ((e && e.message) || "فشل قياس المساحة")); }
    finally { setBucketBusy(false); }
  }, []);

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
    /* V21.24.3 — للصور: الصندوق يتقلّص على مقاس الصورة (shrink-wrap) ومنطقة
       العرض شفّافة، فمفيش letterbox أسود حوالين الصورة. للـ PDF/النص يفضل
       الصندوق العريض الثابت (900px) عشان القراءة. */
    const isImg = m.startsWith("image/");
    return (
      <div className="pop-overlay" style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }} onClick={() => setPreviewFile(null)}>
        <div onClick={e => e.stopPropagation()} style={{
          background: T.cardSolid, borderRadius: 16, padding: 16,
          width: isImg ? "auto" : "100%", maxWidth: isImg ? "96vw" : 900, maxHeight: "92vh",
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
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(() => { const imgs = currentFiles.filter(f => isPreviewable(f.contentType)); const idx = imgs.findIndex(f => f.id === file.id); return imgs.length > 1 && idx >= 0 ? (
                <>
                  <Btn ghost onClick={() => navPreview(-1)} title="السابق (→)" style={{ fontSize: FS + 4, fontWeight: 800 }}>›</Btn>
                  <span style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700, minWidth: 50, textAlign: "center" }}>{idx + 1} / {imgs.length}</span>
                  <Btn ghost onClick={() => navPreview(1)} title="التالي (←)" style={{ fontSize: FS + 4, fontWeight: 800 }}>‹</Btn>
                </>
              ) : null; })()}
              <Btn small onClick={() => downloadFile(file)} style={{ background: T.accent + "12", color: T.accent, border: "1px solid " + T.accent + "30" }}>⬇️ تحميل</Btn>
              <Btn ghost onClick={() => setPreviewFile(null)}>✕</Btn>
            </div>
          </div>
          <div style={{ flex: isImg ? "0 1 auto" : 1, minHeight: 0, overflow: "auto", borderRadius: 10, border: "1px solid " + T.brd, background: isImg ? "transparent" : "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isImg && (
              <img src={file.downloadURL} alt={file.name} style={{ maxWidth: "90vw", maxHeight: "78vh", display: "block", objectFit: "contain" }} />
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

  /* V21.9.186 — dynamic card title based on view (root/folder/recent/trash) */
  const activeFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;
  const cardTitle = showTrash
    ? "🗑️ سلة المهملات"
    : recentView
      ? "⏱ الملفات الحديثة (آخر 30 يوم)"
      : activeFolder
        ? (activeFolder.icon || "📁") + " " + activeFolder.name
        : "💾 مساحة التخزين";

  /* V21.9.186 — Tree sidebar component (inline). Right-side panel in RTL. */
  const TreeSidebar = () => (
    <aside style={{
      width: isMob ? "100%" : 260,
      flexShrink: 0,
      background: T.cardSolid,
      border: "1px solid " + T.brd,
      borderRadius: 12,
      padding: 10,
      maxHeight: isMob ? "60vh" : "calc(100vh - 90px)",
      overflowY: "auto",
      position: isMob ? "static" : "sticky",
      top: 8,
    }}>
      <div style={{
        fontSize: FS - 2, fontWeight: 700, color: T.textMut,
        padding: "4px 8px", marginBottom: 6, letterSpacing: "0.5px",
      }}>📂 شجرة الملفات</div>

      {/* Special: Root (All) */}
      <div
        onClick={() => { setCurrentFolderId(null); setShowTrash(false); setRecentView(false); if (isMob) setSidebarOpen(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
          background: (!currentFolderId && !showTrash && !recentView) ? "#8B5CF618" : "transparent",
          color: (!currentFolderId && !showTrash && !recentView) ? "#8B5CF6" : T.text,
          fontWeight: (!currentFolderId && !showTrash && !recentView) ? 800 : 600,
          fontSize: FS - 1,
        }}
        onMouseEnter={(e) => { if (currentFolderId || showTrash || recentView) e.currentTarget.style.background = T.bg; }}
        onMouseLeave={(e) => { if (currentFolderId || showTrash || recentView) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>🏠</span>
        <span style={{ flex: 1 }}>الكل</span>
        {rootFileCount > 0 && (
          <span style={{ fontSize: FS - 4, fontWeight: 600, color: T.textMut, background: T.bg, padding: "1px 6px", borderRadius: 8, minWidth: 18, textAlign: "center" }}>{rootFileCount}</span>
        )}
      </div>

      {/* Special: Recent */}
      <div
        onClick={() => { setRecentView(true); setShowTrash(false); setCurrentFolderId(null); if (isMob) setSidebarOpen(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
          background: recentView ? "#10B98118" : "transparent",
          color: recentView ? "#10B981" : T.text,
          fontWeight: recentView ? 800 : 600,
          fontSize: FS - 1,
        }}
        onMouseEnter={(e) => { if (!recentView) e.currentTarget.style.background = T.bg; }}
        onMouseLeave={(e) => { if (!recentView) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>⏱</span>
        <span style={{ flex: 1 }}>حديث</span>
        {recentCount > 0 && (
          <span style={{ fontSize: FS - 4, fontWeight: 600, color: recentView ? "#10B981" : T.textMut, background: recentView ? "#10B98120" : T.bg, padding: "1px 6px", borderRadius: 8, minWidth: 18, textAlign: "center" }}>{recentCount}</span>
        )}
      </div>

      {/* Special: Trash */}
      <div
        onClick={() => { setShowTrash(true); setRecentView(false); setCurrentFolderId(null); if (isMob) setSidebarOpen(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
          background: showTrash ? T.err + "18" : "transparent",
          color: showTrash ? T.err : T.text,
          fontWeight: showTrash ? 800 : 600,
          fontSize: FS - 1,
        }}
        onMouseEnter={(e) => { if (!showTrash) e.currentTarget.style.background = T.bg; }}
        onMouseLeave={(e) => { if (!showTrash) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>🗑️</span>
        <span style={{ flex: 1 }}>سلة المهملات</span>
        {stats.trashCount > 0 && (
          <span style={{ fontSize: FS - 4, fontWeight: 600, color: showTrash ? T.err : T.textMut, background: showTrash ? T.err + "20" : T.bg, padding: "1px 6px", borderRadius: 8, minWidth: 18, textAlign: "center" }}>{stats.trashCount}</span>
        )}
      </div>

      {/* Tree divider */}
      {rootFolders.length > 0 && (
        <div style={{ borderTop: "1px solid " + T.brd, margin: "10px 0 8px" }} />
      )}

      {/* Folder tree */}
      {rootFolders.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: T.textMut, fontSize: FS - 2, fontStyle: "italic" }}>
          لا توجد مجلدات بعد
        </div>
      ) : (
        rootFolders.map(f => (
          <TreeNode
            key={f.id}
            folder={f}
            allFolders={folders}
            depth={0}
            fileCounts={folderFileCounts}
            currentFolderId={(showTrash || recentView) ? null : currentFolderId}
            expanded={expandedFolders}
            onToggle={toggleFolderExpand}
            onSelect={selectFolderFromTree}
          />
        ))
      )}

      {canEdit && !showTrash && !recentView && (
        <div style={{ borderTop: "1px solid " + T.brd, marginTop: 10, paddingTop: 10 }}>
          <Btn small onClick={createFolder} style={{ width: "100%", background: "#8B5CF612", color: "#8B5CF6", border: "1px dashed #8B5CF640", fontWeight: 700 }}>
            ➕ مجلد جديد {currentFolderId ? "(فرعي)" : "(جذر)"}
          </Btn>
        </div>
      )}
    </aside>
  );

  return (
    <div>
      <PreviewModal />
      {/* V21.26.12: إرسال صور واتساب يدوي للعملاء (مش بريدج) */}
      {waPopup && (() => {
        const custs = (data.customers || []).filter(c => c && c.phone);
        const q = waSearch.trim().toLowerCase();
        const filtered = q ? custs.filter(c => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)) : custs;
        const fileCount = (waPopup.files || []).length;
        const isPhone = /^[0-9+\s]{8,}$/.test(waSearch.trim());
        return (
          <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, direction: "rtl" }} onClick={() => setWaPopup(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 18, width: "100%", maxWidth: 460, maxHeight: "88vh", display: "flex", flexDirection: "column", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
              <div style={{ background: "#25D36612", borderBottom: "1px solid #25D36633", padding: "14px 18px" }}>
                <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#128C7E" }}>📤 إرسال {fileCount} صورة واتساب</div>
                <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>اختر عميل أو اكتب رقم — هيفتح واتساب برسالة فيها روابط الصور، وتبعتها بنفسك.</div>
              </div>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.brd }}>
                <input value={waSearch} onChange={e => setWaSearch(e.target.value)} placeholder="🔍 ابحث باسم العميل أو رقمه... أو اكتب رقم" style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.inputBg, color: T.text, boxSizing: "border-box", outline: "none" }} />
                {isPhone && <Btn small onClick={() => sendWaToPhone(waSearch.trim(), "")} style={{ marginTop: 8, background: "#25D36612", color: "#128C7E", border: "1px solid #25D36640", fontWeight: 700 }}>📞 إرسال للرقم: {waSearch.trim()}</Btn>}
              </div>
              <div style={{ overflowY: "auto", padding: "4px 10px 10px", flex: 1 }}>
                {filtered.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: T.textMut, fontSize: FS - 2 }}>{custs.length === 0 ? "مفيش عملاء بأرقام — اكتب رقم فوق" : "لا توجد نتائج — اكتب رقم فوق"}</div> :
                  filtered.slice(0, 80).map(c => (
                    <div key={c.id} onClick={() => sendWaToPhone(c.phone, c.name)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", borderBottom: "1px solid " + T.brd }} onMouseEnter={e => e.currentTarget.style.background = "#25D3660A"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: FS - 1, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div><div style={{ fontSize: FS - 3, color: T.textSec, direction: "ltr", textAlign: "right" }}>{c.phone}</div></div>
                      <span style={{ fontSize: 18, color: "#25D366", flexShrink: 0 }}>📤</span>
                    </div>
                  ))}
              </div>
              <div style={{ padding: "10px 16px", borderTop: "1px solid " + T.brd, textAlign: "left" }}><Btn ghost onClick={() => setWaPopup(null)}>إلغاء</Btn></div>
            </div>
          </div>
        );
      })()}

      {/* V21.9.186: flex layout — sidebar (right in RTL) + main area */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: isMob ? "column" : "row" }}>

        {/* Mobile: toggle button on top */}
        {isMob && (
          <Btn small onClick={() => setSidebarOpen(!sidebarOpen)} style={{ alignSelf: "stretch", background: "#8B5CF612", color: "#8B5CF6", border: "1px solid #8B5CF640", fontWeight: 700 }}>
            {sidebarOpen ? "✕ إخفاء الشجرة" : "🗂 عرض شجرة المجلدات"}
          </Btn>
        )}

        {/* Sidebar — always visible on desktop, drawer on mobile */}
        {(!isMob || sidebarOpen) && <TreeSidebar />}

        {/* Main area */}
        <div style={{ flex: 1, minWidth: 0, width: "100%" }}>

      {/* Header */}
      <Card title={cardTitle} accent={"linear-gradient(135deg,#8B5CF6,#8B5CF6CC)"}
        extra={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!showTrash && !recentView && canEdit && <Btn small onClick={() => fileInputRef.current?.click()} style={{ background: "#fff", color: "#8B5CF6", border: "none", fontWeight: 700 }}>📤 رفع ملف</Btn>}
            {!showTrash && !recentView && canEdit && <Btn small onClick={createFolder} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none" }}>➕ مجلد جديد</Btn>}
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
            <div style={{ fontSize: FS - 2, color: T.textSec }}>📦 ملفات القسم</div>
            <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#F59E0B" }}>{fmtSize(stats.totalSize)}</div>
          </div>
          {/* V21.23.4 — الاستهلاك الفعلي لكل Firebase Storage (للحذر من التكلفة) */}
          <div style={{ padding: "8px 14px", borderRadius: 8, background: "#8B5CF608", border: "1px solid #8B5CF625", minWidth: 210 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: FS - 2, color: T.textSec }}>☁️ تخزين Firebase الكلي</span>
              <span onClick={loadBucketUsage} style={{ cursor: bucketBusy ? "wait" : "pointer", fontSize: FS - 3, fontWeight: 700, color: bucketBusy ? T.textMut : "#8B5CF6" }}>{bucketBusy ? "⏳..." : "🔄 احسب"}</span>
            </div>
            {bucketUsage ? (
              <>
                <div style={{ fontSize: FS + 1, fontWeight: 800, color: "#8B5CF6" }}>{fmtSize(bucketUsage.totalBytes)}{bucketUsage.truncated ? "+" : ""}</div>
                <div style={{ fontSize: FS - 4, color: T.textMut }}>{bucketUsage.fileCount}{bucketUsage.truncated ? "+" : ""} ملف · {((bucketUsage.totalBytes / FREE_TIER) * 100).toFixed(1)}% من 5 GB المجاني</div>
                <div style={{ height: 6, background: T.bg, borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                  <div style={{ height: "100%", borderRadius: 3, width: Math.min(100, (bucketUsage.totalBytes / FREE_TIER) * 100) + "%", background: bucketUsage.totalBytes > 0.8 * FREE_TIER ? T.err : (bucketUsage.totalBytes > 0.5 * FREE_TIER ? "#F59E0B" : "#10B981") }} />
                </div>
              </>
            ) : <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>اضغط «احسب» لقياس الاستهلاك الفعلي</div>}
          </div>
        </div>

        {/* breakdown by top-level folder */}
        {bucketUsage && bucketUsage.byPrefix && Object.keys(bucketUsage.byPrefix).length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(bucketUsage.byPrefix).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <span key={k} style={{ fontSize: FS - 3, color: T.textSec, background: T.bg, border: "1px solid " + T.brd, borderRadius: 999, padding: "3px 10px" }}>
                {(PREFIX_LABELS[k] || ("📂 " + k))}: <b style={{ color: T.text }}>{fmtSize(v)}</b>
              </span>
            ))}
          </div>
        )}

        {/* Drop zone — V21.26.23: اتنقل فوق مربع البحث */}
        {!showTrash && !recentView && canEdit && (
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 20, borderRadius: 12, marginBottom: 12,
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

        {/* Search — V21.26.23: بيشمل المجلدات + الملفات */}
        <Inp value={search} onChange={setSearch} placeholder="🔍 ابحث في اسم الملف/المجلد أو الوصف..." style={{ marginBottom: 12 }} />

        {/* Breadcrumbs — V21.9.186: also skip in recentView. تختفي وقت البحث (النتايج عامة) */}
        {!showTrash && !recentView && !searchActive && (
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

        {/* Folders grid — عند البحث: المجلدات المطابقة عبر الشجرة (قسم منفصل) */}
        {!showTrash && !recentView && (() => {
          const foldersToShow = searchActive ? matchedFolders : currentFolders;
          if (!searchActive && foldersToShow.length === 0) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              {searchActive && (
                <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.textSec, margin: "2px 0 8px" }}>📁 المجلدات المطابقة <span style={{ color: T.textMut, fontWeight: 600 }}>({foldersToShow.length})</span></div>
              )}
              {foldersToShow.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                  {foldersToShow.map(f => {
                    const childFileCount = files.filter(x => x.folderId === f.id && !x.deletedAt).length;
                    const path = searchActive ? buildBreadcrumbs(folders, f.id).slice(0, -1).map(x => x.name).join(" / ") : "";
                    return (
                      <div key={f.id} style={{
                        padding: 12, borderRadius: 12,
                        background: (f.color || "#8B5CF6") + "08",
                        border: "1px solid " + (f.color || "#8B5CF6") + "30",
                        cursor: "pointer", position: "relative",
                      }} onClick={() => { setCurrentFolderId(f.id); if (searchActive) setSearch(""); }}>
                        <div style={{ fontSize: 32, marginBottom: 4 }}>{f.icon || "📁"}</div>
                        <div style={{ fontSize: FS, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                        {searchActive && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {path || "الجذر"}</div>}
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
              ) : (
                <div style={{ fontSize: FS - 2, color: T.textMut, padding: "4px 0 8px" }}>— مفيش مجلدات بالاسم ده</div>
              )}
            </div>
          );
        })()}
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

        {/* V21.26.12: شريط التحديد المتعدد — حذف + إرسال واتساب */}
        {!showTrash && selectedIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "10px 14px", marginBottom: 12, borderRadius: 12, background: T.accent + "10", border: "1px solid " + T.accent + "40" }}>
            <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.accent }}>☑️ محدد: {selectedIds.size} ملف</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedFiles.some(f => (f.contentType || "").startsWith("image/")) && <Btn small onClick={() => setWaPopup({ files: selectedFiles.filter(f => (f.contentType || "").startsWith("image/") && f.downloadURL) })} style={{ background: "#25D36612", color: "#25D366", border: "1px solid #25D36640", fontWeight: 700 }}>📤 واتساب للعميل</Btn>}
              {canEdit && <Btn small onClick={bulkDeleteSelected} style={{ background: T.err + "12", color: T.err, border: "1px solid " + T.err + "40", fontWeight: 700 }}>🗑️ حذف المحدد</Btn>}
              <Btn small ghost onClick={clearSel}>✕ إلغاء التحديد</Btn>
            </div>
          </div>
        )}
        {/* V21.26.23: عنوان قسم الملفات وقت البحث — يفصل نتايج الملفات عن المجلدات */}
        {searchActive && (
          <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.textSec, margin: "6px 0 8px" }}>📄 الملفات المطابقة <span style={{ color: T.textMut, fontWeight: 600 }}>({currentFiles.length})</span></div>
        )}
        {/* Files grid — V21.9.186: distinct empty-state message for recent view */}
        {currentFiles.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: T.textSec }}>
            {search.trim() ? "لا توجد نتائج" :
              showTrash ? "🗑️ سلة المهملات فاضية" :
                recentView ? "⏱ مفيش ملفات اتـ رفعت في آخر 30 يوم" :
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
                  background: selectedIds.has(file.id) ? T.accent + "0C" : T.cardSolid,
                  border: "1px solid " + (selectedIds.has(file.id) ? T.accent : T.brd),
                  display: "flex", flexDirection: "column", gap: 6,
                  position: "relative",
                  opacity: file.deletedAt ? 0.7 : 1,
                }}>
                  {!file.deletedAt && <span onClick={(e) => { e.stopPropagation(); toggleSel(file.id); }} title="تحديد" style={{ position: "absolute", top: 6, insetInlineStart: 6, zIndex: 2, width: 22, height: 22, borderRadius: 6, border: "2px solid " + (selectedIds.has(file.id) ? T.accent : T.brd), background: selectedIds.has(file.id) ? T.accent : T.cardSolid, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, fontWeight: 900, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>{selectedIds.has(file.id) ? "✓" : ""}</span>}
                  {/* Thumbnail / Icon */}
                  <div
                    onClick={() => previewOk ? setPreviewFile(file) : downloadFile(file)}
                    style={{
                      /* V21.26.10: الصورة بتظهر بأبعادها الطبيعية (طولي/عرضي) من غير قص.
                         الصندوق بيلفّ الصورة (minHeight يمنع الانهيار، maxHeight يحدّ الطوال). */
                      minHeight: isImg ? 90 : 100, maxHeight: 260, borderRadius: 8, background: T.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", overflow: "hidden", padding: isImg ? 3 : 0,
                    }}>
                    {isImg && file.downloadURL ? (
                      <img src={file.downloadURL} alt={file.name}
                        style={{ maxWidth: "100%", maxHeight: 252, width: "auto", height: "auto", objectFit: "contain", display: "block", borderRadius: 6 }} />
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

        </div>{/* /main area (V21.9.186) */}
      </div>{/* /flex container (V21.9.186) */}

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
