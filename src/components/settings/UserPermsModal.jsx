/* ═══════════════════════════════════════════════════════════════
   CLARK — User Permissions Override Modal (V21.21.92 — Phase 2)

   تجاوز صلاحيات لمستخدمٍ بعينه فوق دوره. لكل تاب: «حسب الدور» (يرث) /
   «تعديل» / «عرض» / «إخفاء». التجاوز بيتخزّن على usersList[i].perms،
   والغياب = يرث من الدور (متوافق رجعياً). الحساب الفعلي في
   src/utils/permissions.js (effectivePermForUser).
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { showToast } from "../../utils/popups.js";
import { PERMISSION_TABS, SUB_TABS, effectivePermWithCustoms, getEffectiveRoleMeta } from "../../utils/permissions.js";

/* مستويات التجاوز (null = يرث من الدور) */
const LEVELS = [
  { key: null,   label: "حسب الدور", color: T.textMut, bg: T.bg },
  { key: "edit", label: "تعديل",    color: "#059669", bg: "#ECFDF5" },
  { key: "view", label: "عرض",      color: "#0EA5E9", bg: "#EFF6FF" },
  { key: "hide", label: "إخفاء",    color: "#DC2626", bg: "#FEF2F2" },
];

/* وصف نصّي مختصر لصلاحية الدور الأساسية (للتلميح جنب «حسب الدور») */
function roleBaselineLabel(p) {
  if (p && typeof p === "object") {
    const vals = Object.values(p);
    if (vals.every(v => v === "edit")) return "تعديل";
    if (vals.every(v => v === "hide")) return "إخفاء";
    return "مُختلط";
  }
  if (p === "edit") return "تعديل";
  if (p === "view") return "عرض";
  return "إخفاء";
}

export function UserPermsModal({ userRow, config, upConfig, onClose }) {
  const role = userRow.role;
  const roleLabel = useMemo(() => (getEffectiveRoleMeta(config)[role]?.label) || role, [config, role]);

  /* draft: { [tabKey]: "edit"|"view"|"hide" } — بس المفاتيح اللي ليها تجاوز */
  const [draft, setDraft] = useState(() => {
    const out = {};
    const src = (userRow.perms && typeof userRow.perms === "object") ? userRow.perms : {};
    const keys = [...PERMISSION_TABS.map(t => t.key), ...Object.values(SUB_TABS).flat().map(s => s.key)];
    keys.forEach(k => {
      const v = src[k];
      if (v === "edit" || v === "view" || v === "hide") out[k] = v;
    });
    return out;
  });

  /* تجميع التابات حسب القسم للعرض المنظّم */
  const groups = useMemo(() => {
    const g = {};
    PERMISSION_TABS.forEach(t => { const k = t.group || "core"; (g[k] = g[k] || []).push(t); });
    return g;
  }, []);

  const overrideCount = Object.keys(draft).length;

  const setLevel = (tabKey, level) => {
    setDraft(d => {
      const next = { ...d };
      if (level == null) delete next[tabKey]; else next[tabKey] = level;
      return next;
    });
  };

  /* صف صلاحية واحد (تاب أو تاب داخلي). inheritWord: «حسب الدور» للتاب،
     «حسب الأصل» للتاب الداخلي. baseline: نص الصلاحية الموروثة (تلميح). */
  const renderRow = (key, label, inheritWord, baseline, indent) => {
    const cur = draft[key] || null;
    return <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", paddingInlineStart: indent ? 18 : 0, borderBottom: "1px dashed " + T.brd }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FS - 1, fontWeight: indent ? 600 : 700, color: indent ? T.textSec : T.text }}>{label}</div>
      </div>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {LEVELS.map(lv => {
          const on = (lv.key || null) === cur;
          const isInherit = lv.key == null;
          return <button key={String(lv.key)} onClick={() => setLevel(key, lv.key)} title={isInherit ? ("يرث: " + baseline) : lv.label}
            style={{ padding: "4px 8px", borderRadius: 7, fontSize: FS - 3, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              border: "1px solid " + (on ? lv.color : T.brd), background: on ? lv.bg : "transparent", color: on ? lv.color : T.textMut, whiteSpace: "nowrap" }}>
            {isInherit ? (inheritWord + " (" + baseline + ")") : lv.label}
          </button>;
        })}
      </div>
    </div>;
  };

  const save = () => {
    const emailLc = String(userRow.email || "").trim().toLowerCase();
    upConfig(d => {
      const list = Array.isArray(d.usersList) ? d.usersList : [];
      const entry = list.find(u => String((u && u.email) || "").trim().toLowerCase() === emailLc);
      if (!entry) return;
      if (Object.keys(draft).length === 0) { delete entry.perms; }
      else { entry.perms = { ...draft }; }
    });
    showToast(overrideCount > 0 ? ("✓ اتحفظ " + overrideCount + " تجاوز لـ " + (userRow.name || userRow.email)) : "✓ اترجّع للدور الأساسي");
    onClose();
  };

  const clearAll = () => setDraft({});

  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, width: "min(560px,100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", border: "1px solid " + T.brd, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
      {/* header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.text }}>🔐 صلاحيات خاصة — {userRow.name || userRow.email}</div>
          <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>الدور الأساسي: <b style={{ color: T.accent }}>{roleLabel}</b> · التجاوز يكسب على الدور</div>
        </div>
        <Btn ghost small onClick={onClose}>✕</Btn>
      </div>

      {/* body */}
      <div style={{ padding: 14, overflow: "auto", flex: 1 }}>
        <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 10, background: "#FEF9C3", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px" }}>
          «حسب الدور» = يرث صلاحية الدور (مفيش تجاوز). اختار «تعديل/عرض/إخفاء» عشان تكسر الدور لهذا المستخدم بس.
        </div>
        {Object.entries(groups).map(([gk, tabs]) => (
          <div key={gk} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: FS - 2, fontWeight: 800, color: T.textMut, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{gk}</div>
            {tabs.map(t => {
              const subs = SUB_TABS[t.key] || [];
              return <div key={t.key}>
                {renderRow(t.key, (t.icon ? t.icon + " " : "") + t.label, "حسب الدور", roleBaselineLabel(effectivePermWithCustoms(role, t.key, config)), false)}
                {subs.map(s => renderRow(s.key, "↳ " + s.label, "حسب الأصل", roleBaselineLabel(effectivePermWithCustoms(role, s.inheritFrom || t.key, config)), true))}
              </div>;
            })}
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid " + T.brd, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: FS - 2, color: overrideCount > 0 ? "#D97706" : T.textMut, fontWeight: 700 }}>{overrideCount > 0 ? (overrideCount + " تجاوز") : "مفيش تجاوزات (كله بالدور)"}</span>
        {overrideCount > 0 && <button onClick={clearAll} style={{ fontSize: FS - 3, color: T.err, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>تصفير الكل</button>}
        <button onClick={save} style={{ marginInlineStart: "auto", padding: "10px 22px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: FS, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>💾 حفظ</button>
      </div>
    </div>
  </div>;
}
