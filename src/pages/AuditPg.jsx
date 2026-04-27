/* ═══════════════════════════════════════════════════════════════
   CLARK - AuditPg.jsx
   
   V15.58: Professional audit trail explorer.
   Features:
   - Real-time filtering by user, category, action, severity, date range
   - Full-text search in notes/target/values
   - Stats summary (total, users, categories)
   - Paginated table with performance optimization
   - Export to Excel (XLSX) with filtered results
   - Integration with printPage for PDF export
   ═══════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { CollectionHealthBar } from "../components/CollectionHealthBar.jsx";
import { FS } from "../constants/index.js";
import { T, TD, TH } from "../theme.js";
import { fmt } from "../utils/format.js";
import { printPage } from "../utils/print.js";
import { loadXLSX } from "../utils/qr.js";
import { showToast } from "../utils/popups.js";

/* Category labels + colors for visual grouping */
const CATEGORY_META = {
  attendance:   { label: "الحضور",        color: "#0EA5E9", icon: "⏰" },
  salary:       { label: "المرتبات",       color: "#F59E0B", icon: "💰" },
  advance:      { label: "السلف",          color: "#EAB308", icon: "💸" },
  employee:     { label: "الموظفين",       color: "#8B5CF6", icon: "👤" },
  week:         { label: "الأسابيع",       color: "#EC4899", icon: "📅" },
  settings:     { label: "الإعدادات",      color: "#64748B", icon: "⚙️" },
  order:        { label: "الأوردرات",      color: "#0284C7", icon: "📋" },
  treasury:     { label: "الخزنة",         color: "#10B981", icon: "🏦" },
  customer:     { label: "العملاء",        color: "#06B6D4", icon: "🏢" },
  workshop:     { label: "الورش",          color: "#DC2626", icon: "🏭" },
  general:      { label: "عام",            color: "#94A3B8", icon: "📝" },
};

const SEVERITY_META = {
  info:    { label: "معلومة", color: "#0EA5E9", bg: "#E0F2FE" },
  warning: { label: "تحذير",  color: "#F59E0B", bg: "#FEF3C7" },
  danger:  { label: "خطير",   color: "#EF4444", bg: "#FEE2E2" },
};

const PAGE_SIZE = 50;

export function AuditPg({ data, isMob, user }) {
  const auditLog = useMemo(() => (data.auditLog || []), [data.auditLog]);

  /* Filters */
  const [fUser, setFUser] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fAction, setFAction] = useState("");
  const [fSeverity, setFSeverity] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [page, setPage] = useState(0);

  /* Build filter options from the data */
  const users = useMemo(() => {
    const s = new Set();
    auditLog.forEach(a => { if (a.user) s.add(a.user); });
    return [...s].sort();
  }, [auditLog]);

  const categories = useMemo(() => {
    const s = new Set();
    auditLog.forEach(a => { if (a.category) s.add(a.category); });
    return [...s].sort();
  }, [auditLog]);

  const actions = useMemo(() => {
    const s = new Set();
    auditLog
      .filter(a => !fCategory || a.category === fCategory)
      .forEach(a => { if (a.action) s.add(a.action); });
    return [...s].sort();
  }, [auditLog, fCategory]);

  /* Apply filters */
  const filtered = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return auditLog.filter(a => {
      if (fUser && a.user !== fUser) return false;
      if (fCategory && a.category !== fCategory) return false;
      if (fAction && a.action !== fAction) return false;
      if (fSeverity && a.severity !== fSeverity) return false;
      if (fFrom && (a.date || "") < fFrom) return false;
      if (fTo && (a.date || "") > fTo) return false;
      if (q) {
        const hay = [a.target, a.notes, a.oldValue, a.newValue, a.user, a.action].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLog, fUser, fCategory, fAction, fSeverity, fFrom, fTo, fSearch]);

  /* Reset page when filters change */
  useMemo(() => { setPage(0); }, [fUser, fCategory, fAction, fSeverity, fFrom, fTo, fSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  /* Stats per current filter */
  const stats = useMemo(() => {
    const usersSet = new Set();
    const catsMap = {};
    const sevMap = { info: 0, warning: 0, danger: 0 };
    filtered.forEach(a => {
      if (a.user) usersSet.add(a.user);
      if (a.category) catsMap[a.category] = (catsMap[a.category] || 0) + 1;
      if (a.severity) sevMap[a.severity] = (sevMap[a.severity] || 0) + 1;
    });
    return { total: filtered.length, users: usersSet.size, cats: catsMap, sev: sevMap };
  }, [filtered]);

  const clearFilters = () => {
    setFUser(""); setFCategory(""); setFAction(""); setFSeverity(""); setFFrom(""); setFTo(""); setFSearch("");
  };

  /* Export to Excel */
  const exportExcel = async () => {
    const XLSX = await loadXLSX();
    if (!XLSX) { showToast("⚠️ تعذر تحميل مكتبة Excel"); return; }
    const rows = filtered.map(a => ({
      "التاريخ": a.date || "",
      "الوقت": a.ts ? new Date(a.ts).toLocaleTimeString("ar-EG") : "",
      "المستخدم": a.user || "",
      "القسم": CATEGORY_META[a.category]?.label || a.category || "",
      "الإجراء": a.action || "",
      "الهدف": a.target || "",
      "القيمة القديمة": a.oldValue || "",
      "القيمة الجديدة": a.newValue || "",
      "ملاحظات": a.notes || "",
      "الخطورة": SEVERITY_META[a.severity]?.label || a.severity || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    const filename = "audit_log_" + new Date().toISOString().split("T")[0] + ".xlsx";
    XLSX.writeFile(wb, filename);
    showToast("✓ تم تصدير " + filtered.length + " سجل");
  };

  /* Export to PDF via printPage */
  const exportPDF = () => {
    let h = "<h2 style='text-align:center;margin-bottom:4px'>سجل التدقيق والرقابة</h2>";
    h += "<div style='text-align:center;font-size:10px;color:#64748B;margin-bottom:12px'>";
    h += "الفترة: " + (fFrom || "البداية") + " إلى " + (fTo || "اليوم");
    if (fUser) h += " • المستخدم: " + fUser;
    if (fCategory) h += " • القسم: " + (CATEGORY_META[fCategory]?.label || fCategory);
    h += "</div>";
    /* Summary stats */
    h += "<table style='margin:0 auto 16px;font-size:11px'><tr>";
    h += "<td style='padding:4px 16px;font-weight:700'>إجمالي العمليات</td><td style='padding:4px 16px;font-weight:800;color:#0284C7'>" + fmt(stats.total) + "</td>";
    h += "<td style='padding:4px 16px;font-weight:700'>المستخدمون</td><td style='padding:4px 16px;font-weight:800;color:#8B5CF6'>" + stats.users + "</td>";
    h += "<td style='padding:4px 16px;font-weight:700'>تحذيرات</td><td style='padding:4px 16px;font-weight:800;color:#F59E0B'>" + (stats.sev.warning || 0) + "</td>";
    h += "<td style='padding:4px 16px;font-weight:700'>خطيرة</td><td style='padding:4px 16px;font-weight:800;color:#EF4444'>" + (stats.sev.danger || 0) + "</td>";
    h += "</tr></table>";
    /* Main table */
    h += "<table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>القسم</th><th>الإجراء</th><th>الهدف</th><th>التغيير</th><th>ملاحظات</th></tr></thead><tbody>";
    filtered.forEach(a => {
      const catLabel = CATEGORY_META[a.category]?.label || a.category || "—";
      const change = (a.oldValue || a.newValue) ? (a.oldValue ? a.oldValue + " ← " : "") + (a.newValue || "") : "—";
      const sevColor = a.severity === "danger" ? "#EF4444" : a.severity === "warning" ? "#F59E0B" : "inherit";
      h += "<tr>";
      h += "<td style='font-size:10px;color:#64748B'>" + (a.date || "") + "</td>";
      h += "<td style='font-weight:700'>" + (a.user || "—") + "</td>";
      h += "<td style='color:" + (CATEGORY_META[a.category]?.color || "#64748B") + ";font-weight:700'>" + catLabel + "</td>";
      h += "<td style='color:" + sevColor + ";font-weight:600'>" + (a.action || "—") + "</td>";
      h += "<td style='font-size:10px'>" + (a.target || "—") + "</td>";
      h += "<td style='font-size:10px'>" + change + "</td>";
      h += "<td style='font-size:10px;color:#64748B'>" + (a.notes || "") + "</td>";
      h += "</tr>";
    });
    h += "</tbody></table>";
    printPage("سجل التدقيق — " + new Date().toISOString().split("T")[0], h, { factoryName: data.factoryName, logo: data.logo });
  };

  const hasFilter = fUser || fCategory || fAction || fSeverity || fFrom || fTo || fSearch;

  return <div>
    {/* V16.75: Collection health bar */}
    <CollectionHealthBar collection="auditDays" label="حجم سجل الأحداث" icon="📝" mode="split"/>
    <Card title={"🔍 سجل التدقيق والرقابة — " + fmt(auditLog.length) + " سجل"}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: T.accent + "08", border: "1px solid " + T.accent + "25" }}>
          <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>المعروض</div>
          <div style={{ fontSize: FS + 6, fontWeight: 900, color: T.accent, lineHeight: 1 }}>{fmt(stats.total)}</div>
          {hasFilter && <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 2 }}>من {fmt(auditLog.length)}</div>}
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#8B5CF608", border: "1px solid #8B5CF625" }}>
          <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>المستخدمون</div>
          <div style={{ fontSize: FS + 6, fontWeight: 900, color: "#8B5CF6", lineHeight: 1 }}>{stats.users}</div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F59E0B08", border: "1px solid #F59E0B25" }}>
          <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>⚠️ تحذيرات</div>
          <div style={{ fontSize: FS + 6, fontWeight: 900, color: "#F59E0B", lineHeight: 1 }}>{stats.sev.warning || 0}</div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#EF444408", border: "1px solid #EF444425" }}>
          <div style={{ fontSize: FS - 3, color: T.textSec, fontWeight: 600 }}>🚨 خطيرة</div>
          <div style={{ fontSize: FS + 6, fontWeight: 900, color: "#EF4444", lineHeight: 1 }}>{stats.sev.danger || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
        <Sel value={fUser} onChange={setFUser}>
          <option value="">👤 كل المستخدمين</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </Sel>
        <Sel value={fCategory} onChange={v => { setFCategory(v); setFAction(""); }}>
          <option value="">📂 كل الأقسام</option>
          {categories.map(c => <option key={c} value={c}>{(CATEGORY_META[c]?.icon || "") + " " + (CATEGORY_META[c]?.label || c)}</option>)}
        </Sel>
        <Sel value={fAction} onChange={setFAction}>
          <option value="">⚡ كل الإجراءات</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </Sel>
        <Sel value={fSeverity} onChange={setFSeverity}>
          <option value="">🎯 كل الدرجات</option>
          <option value="info">ℹ️ معلومة</option>
          <option value="warning">⚠️ تحذير</option>
          <option value="danger">🚨 خطير</option>
        </Sel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600, display: "block", marginBottom: 2 }}>من تاريخ</label>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.inputBg, color: T.text, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600, display: "block", marginBottom: 2 }}>إلى تاريخ</label>
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.inputBg, color: T.text, boxSizing: "border-box" }} />
        </div>
        <div style={{ gridColumn: isMob ? "span 2" : "span 2" }}>
          <label style={{ fontSize: FS - 3, color: T.textMut, fontWeight: 600, display: "block", marginBottom: 2 }}>🔍 بحث</label>
          <Inp value={fSearch} onChange={setFSearch} placeholder="ابحث في الهدف، الملاحظات، القيم..." />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {hasFilter && <Btn small ghost onClick={clearFilters} style={{ background: T.err + "10", color: T.err, border: "1px solid " + T.err + "30" }}>✕ مسح الفلاتر</Btn>}
        <Btn small onClick={exportPDF} style={{ background: "#EF444412", color: "#EF4444", border: "1px solid #EF444430", fontWeight: 700 }}>📄 تصدير PDF</Btn>
        <Btn small onClick={exportExcel} style={{ background: "#10B98112", color: "#10B981", border: "1px solid #10B98130", fontWeight: 700 }}>📊 تصدير Excel</Btn>
      </div>

      {/* Table */}
      {filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: T.textMut }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
        <div>{hasFilter ? "لا توجد نتائج تطابق الفلاتر" : "لا توجد سجلات تدقيق بعد"}</div>
      </div> : <>
        <div style={{ overflowX: "auto", border: "1px solid " + T.brd, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...TH, minWidth: 90, fontSize: FS - 2 }}>التاريخ</th>
                <th style={{ ...TH, minWidth: 100, fontSize: FS - 2 }}>المستخدم</th>
                <th style={{ ...TH, minWidth: 90, fontSize: FS - 2 }}>القسم</th>
                <th style={{ ...TH, minWidth: 120, fontSize: FS - 2 }}>الإجراء</th>
                <th style={{ ...TH, minWidth: 150, fontSize: FS - 2 }}>الهدف</th>
                <th style={{ ...TH, minWidth: 180, fontSize: FS - 2 }}>التغيير</th>
                <th style={{ ...TH, fontSize: FS - 2 }}>ملاحظات</th>
                <th style={{ ...TH, width: 40, fontSize: FS - 2 }}>🎯</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((a, i) => {
                const cat = CATEGORY_META[a.category] || { label: a.category || "—", color: "#64748B", icon: "📝" };
                const sev = SEVERITY_META[a.severity] || SEVERITY_META.info;
                return <tr key={a.id || i} style={{ background: i % 2 === 0 ? "transparent" : T.bg + "80", borderBottom: "1px solid " + T.brd }}>
                  <td style={{ ...TD, fontSize: FS - 2, color: T.textMut, whiteSpace: "nowrap" }}>
                    <div>{a.date || "—"}</div>
                    {a.ts && <div style={{ fontSize: FS - 3, color: T.textMut, opacity: 0.7 }}>{new Date(a.ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</div>}
                  </td>
                  <td style={{ ...TD, fontSize: FS - 1, fontWeight: 700 }}>{a.user || "—"}</td>
                  <td style={{ ...TD, fontSize: FS - 2 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 6, background: cat.color + "15", color: cat.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {cat.icon} {cat.label}
                    </span>
                  </td>
                  <td style={{ ...TD, fontSize: FS - 2, fontWeight: 600 }}>{a.action || "—"}</td>
                  <td style={{ ...TD, fontSize: FS - 2 }}>{a.target || "—"}</td>
                  <td style={{ ...TD, fontSize: FS - 2 }}>
                    {(a.oldValue || a.newValue) ? <>
                      {a.oldValue && <span style={{ color: T.textMut, textDecoration: "line-through" }}>{a.oldValue}</span>}
                      {a.oldValue && a.newValue && <span style={{ margin: "0 4px", color: T.accent, fontWeight: 700 }}>←</span>}
                      {a.newValue && <span style={{ color: T.accent, fontWeight: 700 }}>{a.newValue}</span>}
                    </> : "—"}
                  </td>
                  <td style={{ ...TD, fontSize: FS - 2, color: T.textSec, maxWidth: 200 }}>{a.notes || ""}</td>
                  <td style={{ ...TD, textAlign: "center" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: sev.color }} title={sev.label}></span>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Btn small disabled={page === 0} onClick={() => setPage(p => p - 1)}>⟩ السابق</Btn>
          <span style={{ fontSize: FS - 1, color: T.textSec, fontWeight: 600, padding: "0 12px" }}>
            صفحة {page + 1} من {totalPages} • عرض {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} من {fmt(filtered.length)}
          </span>
          <Btn small disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>التالي ⟨</Btn>
        </div>}
      </>}
    </Card>
  </div>;
}
