/* ════════════════════════════════════════════════════════════════════════
   CLARK V21.21.37 — About Version Modal (lazy changelog)
   ════════════════════════════════════════════════════════════════════════

   Modal popup يعرض سجل آخر 10 إصدارات.

   V21.21.37 (مرحلة النظافة 2.4): بيانات الـ CHANGELOG اتنقلت من هنا إلى
   `public/changelog.json`. قبل كده المصفوفة كانت معرّفة inline في الملف ده
   (٥,٦٠٠+ سطر، ٤٧٠ إصدار) → الـ chunk بتاع المودال كان **أكبر ملف في
   الـ bundle كله (1.27MB)** رغم إن المعروض ١٠ عناوين بس. دلوقتي:
   - الـ chunk ده صغير، وفتح المودال فوري.
   - السجل الكامل بيتجاب بـ fetch واحدة (cached) عند أول فتح.

   ⚠️ البروتوكول (CLAUDE.md §8): إدخالات الإصدارات الجديدة بتتضاف الآن في
   أول مصفوفة `public/changelog.json` (JSON صالح — مفتاح/قيمة بعلامات
   تنصيص مزدوجة)، مش هنا. الشكل:
     { "version": "Vx.y.z", "date": "YYYY-MM-DD",
       "types": ["fix"|"feature"|...], "title": "...",
       "changes": [{ "type": "...", "text": "..." }] }
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

/* كاش على مستوى الموديول — fetch واحدة لكل جلسة مهما اتفتح المودال */
let _changelogCache = null;
let _changelogPromise = null;
function loadChangelog() {
  if (_changelogCache) return Promise.resolve(_changelogCache);
  if (_changelogPromise) return _changelogPromise;
  _changelogPromise = fetch("/changelog.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((arr) => {
      if (!Array.isArray(arr)) throw new Error("bad changelog shape");
      _changelogCache = arr;
      return arr;
    })
    .catch((e) => {
      _changelogPromise = null; /* فشل؟ المحاولة الجاية تعيد الـ fetch */
      throw e;
    });
  return _changelogPromise;
}

/* ═══ TYPE METADATA ═══ */
const TYPE_META = {
  feature:       { icon: "✨", label: "ميزة جديدة",      color: "#10B981", bg: "#10B98112" },
  fix:           { icon: "🐛", label: "إصلاح",          color: "#EF4444", bg: "#EF444412" },
  improvement:   { icon: "⚡", label: "تحسين",          color: "#3B82F6", bg: "#3B82F612" },
  maintenance:   { icon: "🔧", label: "صيانة",          color: "#8B5CF6", bg: "#8B5CF612" },
  architectural: { icon: "🏗️", label: "تغيير معماري",    color: "#F59E0B", bg: "#F59E0B12" },
};

/* ═══ MODAL COMPONENT ═══ */
export function AboutVersionModal({ open, onClose, currentVersion = "V16.79" }) {
  const [changelog, setChangelog] = useState(_changelogCache);
  const [loadError, setLoadError] = useState(null);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* V21.21.37: جلب السجل عند الفتح (مرة واحدة — كاش) */
  useEffect(() => {
    if (!open || changelog) return;
    let alive = true;
    setLoadError(null);
    loadChangelog()
      .then((arr) => { if (alive) setChangelog(arr); })
      .catch((e) => { if (alive) setLoadError(e?.message || String(e)); });
    return () => { alive = false; };
  }, [open, changelog]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.cardSolid,
          borderRadius: 16,
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          border: "1px solid " + T.brd,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid " + T.brd,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "linear-gradient(135deg, " + T.accent + "08, " + T.accent + "02)",
          }}
        >
          <div>
            <div style={{ fontSize: FS + 4, fontWeight: 800, color: T.accent, marginBottom: 2 }}>
              📋 سجل تحديثات CLARK
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec }}>
              آخر 10 إصدارات — الإصدار الحالي: <b style={{ color: T.text }}>{currentVersion}</b>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "1px solid " + T.brd,
              background: T.cardSolid,
              color: T.textSec,
              fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = T.err + "15";
              e.currentTarget.style.color = T.err;
              e.currentTarget.style.borderColor = T.err + "40";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = T.cardSolid;
              e.currentTarget.style.color = T.textSec;
              e.currentTarget.style.borderColor = T.brd;
            }}
          >
            ✕
          </button>
        </div>

        {/* Type legend */}
        <div
          style={{
            padding: "10px 24px",
            borderBottom: "1px solid " + T.brd + "40",
            background: T.cardSolid,
            display: "flex", flexWrap: "wrap", gap: 8,
            fontSize: FS - 3,
          }}
        >
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <span
              key={key}
              style={{
                padding: "2px 8px", borderRadius: 6,
                background: meta.bg, color: meta.color,
                fontWeight: 600,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </span>
          ))}
        </div>

        {/* Body — آخر 10 إصدارات (عنوان + تاريخ + شارات الأنواع فقط — V21.9.141).
            V21.21.37: البيانات بتتجاب lazy من /changelog.json مع حالات
            تحميل/خطأ — راجع الهيدر فوق. */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {!changelog && !loadError && (
            <div style={{ textAlign: "center", padding: 40, color: T.textMut, fontSize: FS - 1 }}>
              ⏳ جاري تحميل سجل التحديثات…
            </div>
          )}
          {loadError && (
            <div style={{ textAlign: "center", padding: 40, color: T.err, fontSize: FS - 1, lineHeight: 1.8 }}>
              ⛔ تعذر تحميل سجل التحديثات ({loadError})
              <br />
              <span style={{ color: T.textMut, fontSize: FS - 3 }}>تأكد من الاتصال وأعد فتح النافذة.</span>
            </div>
          )}
          {(changelog || []).slice(0, 10).map((v) => {
            const isCurrent = v.version === currentVersion;
            return (
              <div
                key={v.version}
                style={{
                  marginBottom: 10,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid " + (isCurrent ? T.accent + "40" : T.brd),
                  background: isCurrent ? T.accent + "06" : T.cardSolid,
                }}
              >
                {/* Header row: version + current badge + date */}
                <div
                  style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: FS, fontWeight: 800, color: isCurrent ? T.accent : T.text }}>
                      {v.version}
                    </span>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: FS - 3, fontWeight: 700,
                          padding: "1px 7px", borderRadius: 5,
                          background: T.accent, color: "#fff",
                        }}
                      >
                        الحالي
                      </span>
                    )}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(v.types || []).map((t) => {
                        const meta = TYPE_META[t];
                        if (!meta) return null;
                        return (
                          <span
                            key={t}
                            title={meta.label}
                            style={{
                              fontSize: FS - 3, fontWeight: 700,
                              padding: "1px 6px", borderRadius: 5,
                              background: meta.bg, color: meta.color,
                              display: "inline-flex", alignItems: "center", gap: 3,
                            }}
                          >
                            <span>{meta.icon}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ fontSize: FS - 3, color: T.textMut, fontFamily: "monospace", flexShrink: 0 }}>
                    📅 {v.date}
                  </div>
                </div>

                {/* Title — the concise summary per release */}
                <div style={{ fontSize: FS - 1, color: T.textSec, lineHeight: 1.5 }}>
                  {v.title}
                </div>
              </div>
            );
          })}

          {/* Footer note */}
          {changelog && (
            <div
              style={{
                marginTop: 20, padding: 12,
                borderRadius: 10,
                background: T.textMut + "08",
                fontSize: FS - 3, color: T.textMut,
                textAlign: "center", lineHeight: 1.6,
              }}
            >
              CLARK ERP System — © 2026
              <br />
              للمساعدة أو الإبلاغ عن مشاكل، تواصل مع المدير.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
