/* ═══════════════════════════════════════════════════════════════
   CLARK — Print Templates Editor (V16.4)
   
   Visual editor for print templates:
   - List all templates with customization status
   - Edit template HTML + CSS with syntax guidance
   - Live preview with sample data
   - Variable reference panel
   - Reset to default
   - Save to config.printTemplates[id]
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";
import { renderTemplate, validateTemplate, extractVariables } from "../utils/templateEngine.js";
import { DEFAULT_TEMPLATES, TEMPLATE_CATEGORIES, SAMPLE_DATA, getTemplate, isCustomized } from "../utils/printTemplates.js";
import { openPrintWindow } from "../utils/print.js";

export function PrintTemplatesEditor({ config, upConfig, canEdit }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  const userTemplates = config?.printTemplates || {};
  const allIds = Object.keys(DEFAULT_TEMPLATES);

  /* Group by category */
  const grouped = useMemo(() => {
    const g = {};
    allIds.forEach(id => {
      const t = DEFAULT_TEMPLATES[id];
      if (!g[t.category]) g[t.category] = [];
      g[t.category].push({ ...t, customized: isCustomized(userTemplates, id) });
    });
    return g;
  }, [userTemplates]);

  return <Card title="🎨 قوالب الطباعة" style={{ marginBottom: 14 }}>
    <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 12, lineHeight: 1.6 }}>
      قم بتخصيص شكل ومحتوى كل قالب طباعة. يمكنك تعديل الـ HTML والـ CSS لكل قالب، وإعادته للشكل الافتراضي في أي وقت.
    </div>

    {/* Info banner */}
    <div style={{ padding: 12, borderRadius: 10, background: T.accent + "08", border: "1px solid " + T.accent + "25", marginBottom: 14, fontSize: FS - 2, lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, color: T.accent, marginBottom: 4 }}>💡 نصيحة:</div>
      <div>استخدم <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", direction: "ltr", display: "inline-block" }}>{`{{variable}}`}</code> لعرض قيمة،</div>
      <div>و <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", direction: "ltr", display: "inline-block" }}>{`{{#if cond}}...{{/if}}`}</code> للشروط،</div>
      <div>و <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", direction: "ltr", display: "inline-block" }}>{`{{#each arr}}...{{/each}}`}</code> للمصفوفات.</div>
    </div>

    {/* Templates grouped by category */}
    {Object.entries(grouped).map(([catKey, templates]) => {
      const cat = TEMPLATE_CATEGORIES[catKey] || { label: catKey };
      return <div key={catKey} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: FS - 1, fontWeight: 700, color: T.textSec, marginBottom: 8 }}>{cat.label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {templates.map(t =>
            <div key={t.id} style={{
              padding: 14,
              borderRadius: 12,
              background: T.cardSolid,
              border: "2px solid " + (t.customized ? "#8B5CF6" : T.brd),
              transition: "all 0.2s",
              cursor: "pointer",
            }}
              onClick={() => { setSelectedId(t.id); setShowEditor(true); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                {t.customized && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#8B5CF615", color: "#8B5CF6", fontWeight: 700 }}>✏️ مُخصص</span>}
              </div>
              <div style={{ fontSize: FS - 1, fontWeight: 800, color: T.text, marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: FS - 3, color: T.textMut, lineHeight: 1.5 }}>{t.description}</div>
            </div>
          )}
        </div>
      </div>;
    })}

    {/* Editor popup */}
    {showEditor && selectedId && <TemplateEditorPopup
      templateId={selectedId}
      config={config}
      upConfig={upConfig}
      canEdit={canEdit}
      onClose={() => { setShowEditor(false); setSelectedId(null); }}
    />}
  </Card>;
}

/* ═══ INNER EDITOR POPUP ═══ */
function TemplateEditorPopup({ templateId, config, upConfig, canEdit, onClose }) {
  const defaultTpl = DEFAULT_TEMPLATES[templateId];
  const userTemplates = config?.printTemplates || {};
  const currentTpl = getTemplate(userTemplates, templateId);
  const customized = isCustomized(userTemplates, templateId);

  const [htmlDraft, setHtmlDraft] = useState(currentTpl.template);
  const [cssDraft, setCssDraft] = useState(currentTpl.css);
  const [activeTab, setActiveTab] = useState("edit"); /* edit | preview | variables */
  const [editingPart, setEditingPart] = useState("html"); /* html | css */
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const dirty = htmlDraft !== currentTpl.template || cssDraft !== currentTpl.css;
  const validation = useMemo(() => validateTemplate(htmlDraft), [htmlDraft]);

  const sampleData = SAMPLE_DATA[templateId] || {};
  const [previewHtml, previewError] = useMemo(() => {
    try {
      return [renderTemplate(htmlDraft, sampleData), null];
    } catch (e) {
      return ["", e.message];
    }
  }, [htmlDraft, templateId]);

  const save = () => {
    if (!canEdit) { showToast("⛔ صلاحية التعديل مطلوبة"); return; }
    if (!validation.valid) { showToast("⛔ يوجد أخطاء في القالب"); return; }
    upConfig(d => {
      if (!d.printTemplates) d.printTemplates = {};
      d.printTemplates[templateId] = {
        template: htmlDraft,
        css: cssDraft,
        updatedAt: new Date().toISOString(),
      };
    });
    showToast("✓ تم حفظ القالب");
  };

  const resetToDefault = () => {
    setHtmlDraft(defaultTpl.template);
    setCssDraft(defaultTpl.css);
    if (customized) {
      upConfig(d => {
        if (d.printTemplates && d.printTemplates[templateId]) {
          delete d.printTemplates[templateId];
        }
      });
    }
    setShowResetConfirm(false);
    showToast("✓ تم استعادة القالب الافتراضي");
  };

  const doPrint = () => {
    const pw = openPrintWindow();
    if (!pw) { showToast("⛔ المتصفح يمنع النوافذ المنبثقة"); return; }
    const fullHtml = "<!DOCTYPE html><html dir='rtl'><head><meta charset='UTF-8'><style>" + cssDraft + "</style></head><body>" + previewHtml + "</body></html>";
    pw.document.open();
    pw.document.write(fullHtml);
    pw.document.close();
    setTimeout(() => { try { pw.focus(); pw.print(); } catch (e) { } }, 500);
  };

  return <div className="pop-overlay" style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100001,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 10,
    backdropFilter: "blur(8px)",
  }} onClick={() => { if (!dirty || confirm("يوجد تعديلات غير محفوظة. هل تريد الخروج؟")) onClose(); }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.cardSolid, borderRadius: 16, width: "100%", maxWidth: 1200, height: "94vh",
      display: "flex", flexDirection: "column", boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
      border: "1px solid " + T.brd,
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid " + T.brd,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: T.accent }}>
            {defaultTpl.icon} {defaultTpl.name}
            {dirty && <span style={{ fontSize: FS - 2, color: T.warn, fontWeight: 600, marginRight: 8 }}>● غير محفوظ</span>}
          </div>
          <div style={{ fontSize: FS - 2, color: T.textMut }}>{defaultTpl.description}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small onClick={doPrint} style={{ background: T.bg, color: T.text, border: "1px solid " + T.brd }}>🖨 طباعة تجريبية</Btn>
          {customized && <Btn small onClick={() => setShowResetConfirm(true)} style={{ background: T.warn + "12", color: T.warn, border: "1px solid " + T.warn + "40" }}>⏮ استعادة الافتراضي</Btn>}
          {canEdit && <Btn primary onClick={save} disabled={!dirty || !validation.valid}>💾 حفظ</Btn>}
          <Btn ghost onClick={() => { if (!dirty || confirm("يوجد تعديلات غير محفوظة. هل تريد الخروج؟")) onClose(); }}>✕</Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid " + T.brd, padding: "0 10px" }}>
        {[
          { id: "edit", label: "✏️ تحرير" },
          { id: "preview", label: "👁 معاينة" },
          { id: "variables", label: "📋 المتغيرات" },
        ].map(t =>
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 16px", background: "transparent",
            border: "none", borderBottom: "2px solid " + (activeTab === t.id ? T.accent : "transparent"),
            color: activeTab === t.id ? T.accent : T.textSec,
            fontWeight: activeTab === t.id ? 800 : 600, fontSize: FS - 1,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {t.label}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {activeTab === "edit" && <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* HTML/CSS toggle */}
          <div style={{ display: "flex", padding: "8px 12px", gap: 6, background: T.bg, borderBottom: "1px solid " + T.brd }}>
            <Btn small onClick={() => setEditingPart("html")}
              style={{ background: editingPart === "html" ? T.accent : "transparent", color: editingPart === "html" ? "#fff" : T.textSec, border: "1px solid " + (editingPart === "html" ? T.accent : T.brd) }}>
              HTML
            </Btn>
            <Btn small onClick={() => setEditingPart("css")}
              style={{ background: editingPart === "css" ? T.accent : "transparent", color: editingPart === "css" ? "#fff" : T.textSec, border: "1px solid " + (editingPart === "css" ? T.accent : T.brd) }}>
              CSS
            </Btn>
            {!validation.valid && <span style={{ flex: 1, textAlign: "left", fontSize: FS - 2, color: T.err, fontWeight: 700 }}>
              ⚠️ {validation.errors[0]}
            </span>}
          </div>
          {/* Editor area */}
          <textarea
            value={editingPart === "html" ? htmlDraft : cssDraft}
            onChange={e => editingPart === "html" ? setHtmlDraft(e.target.value) : setCssDraft(e.target.value)}
            disabled={!canEdit}
            spellCheck={false}
            style={{
              flex: 1, padding: 14, fontFamily: "'Courier New', monospace", fontSize: 13,
              background: "#0F172A", color: "#E2E8F0", border: "none", outline: "none",
              direction: "ltr", textAlign: "left", lineHeight: 1.6, resize: "none",
              tabSize: 2,
            }}
            placeholder={editingPart === "html" ? "<!-- HTML template -->" : "/* CSS styles */"}
          />
        </div>}

        {activeTab === "preview" && <div style={{ flex: 1, overflow: "auto", background: "#F1F5F9", padding: 20 }}>
          {previewError ? <div style={{
            padding: 20, borderRadius: 10, background: T.err + "15", border: "1px solid " + T.err + "40",
            color: T.err, direction: "ltr", textAlign: "left", fontFamily: "monospace", fontSize: 13,
          }}>
            <b>خطأ في القالب:</b><br />{previewError}
          </div> : <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden", maxWidth: "100%" }}>
            <iframe
              key={templateId + (dirty ? "-dirty" : "-clean")}
              title="preview"
              srcDoc={"<!DOCTYPE html><html dir='rtl'><head><meta charset='UTF-8'><style>" + cssDraft + "</style></head><body>" + previewHtml + "</body></html>"}
              style={{ width: "100%", height: "calc(94vh - 180px)", border: "none" }}
            />
          </div>}
        </div>}

        {activeTab === "variables" && <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          <div style={{ fontSize: FS - 1, fontWeight: 700, marginBottom: 10, color: T.text }}>المتغيرات المتاحة لهذا القالب:</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginBottom: 14, lineHeight: 1.7 }}>
            اضغط على أي متغير لنسخه بصيغة <code style={{ background: T.bg, padding: "1px 5px", borderRadius: 4, direction: "ltr", display: "inline-block" }}>{`{{path}}`}</code>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
            {defaultTpl.variables.map(v =>
              <div key={v.path} onClick={() => {
                try { navigator.clipboard.writeText("{{" + v.path + "}}"); showToast("✓ تم النسخ: {{" + v.path + "}}"); } catch (e) { }
              }} style={{
                padding: 10, borderRadius: 8, background: T.bg, border: "1px solid " + T.brd,
                cursor: "pointer", transition: "all 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.accent + "08"}
                onMouseLeave={e => e.currentTarget.style.background = T.bg}>
                <div style={{ fontFamily: "monospace", fontSize: FS - 1, color: T.accent, direction: "ltr", textAlign: "right", fontWeight: 700 }}>
                  {`{{${v.path}}}`}
                </div>
                <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>{v.desc}</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 20, padding: 12, borderRadius: 10, background: T.accent + "06", border: "1px solid " + T.accent + "20", fontSize: FS - 2, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: T.accent, marginBottom: 6 }}>🛠️ Helpers متاحة:</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, direction: "ltr", textAlign: "right" }}>
              <div>{`{{fmt amount}}`} → 1,234</div>
              <div>{`{{date d}}`} → تنسيق التاريخ</div>
              <div>{`{{mult qty price}}`} → ضرب</div>
              <div>{`{{#if x > 0}}...{{else}}...{{/if}}`}</div>
              <div>{`{{#each items}}{{this.name}}{{/each}}`}</div>
            </div>
          </div>
        </div>}
      </div>
    </div>

    {/* Reset confirm */}
    {showResetConfirm && <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100002,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={() => setShowResetConfirm(false)}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.cardSolid, borderRadius: 14, padding: 20, maxWidth: 440,
        border: "2px solid " + T.warn,
      }}>
        <div style={{ fontSize: FS + 1, fontWeight: 800, color: T.warn, marginBottom: 10 }}>⏮ استعادة القالب الافتراضي</div>
        <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 16, lineHeight: 1.6 }}>
          سيتم حذف التخصيص الحالي بالكامل وإعادة القالب لحالته الأصلية. هل تريد المتابعة؟
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn ghost onClick={() => setShowResetConfirm(false)}>إلغاء</Btn>
          <Btn onClick={resetToDefault} style={{ background: T.warn, color: "#fff", border: "none", fontWeight: 700 }}>⏮ استعادة</Btn>
        </div>
      </div>
    </div>}
  </div>;
}
