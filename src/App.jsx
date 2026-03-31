import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

const SK = "clark-v12";
const FKEYS = ["A", "B", "C", "D", "E"];
const FCOL = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];
const CPAL = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#D97706", "#F43F5E"];

const COLORS_DB = [
  { n: "ابيض", h: "#FFFFFF" }, { n: "اسود", h: "#1a1a1a" }, { n: "كحلي", h: "#1B2A4A" },
  { n: "رمادي", h: "#8B8B8B" }, { n: "بيج", h: "#D4C5A9" }, { n: "كريمي", h: "#FFF8DC" },
  { n: "احمر", h: "#C62828" }, { n: "نبيتي", h: "#6A1B29" }, { n: "برتقالي", h: "#E65100" },
  { n: "اصفر", h: "#F9A825" }, { n: "زيتي", h: "#556B2F" }, { n: "اخضر", h: "#2E7D32" },
  { n: "لبني", h: "#81D4FA" }, { n: "سماوي", h: "#00ACC1" }, { n: "ازرق", h: "#1565C0" },
  { n: "بنفسجي", h: "#6A1B9A" }, { n: "موف", h: "#9C27B0" }, { n: "روز", h: "#E91E63" },
  { n: "فوشيا", h: "#D81B60" }, { n: "بني", h: "#5D4037" }, { n: "كاكي", h: "#8D6E63" },
  { n: "منت", h: "#80CBC4" }, { n: "مشمشي", h: "#FFAB91" }, { n: "سلمون", h: "#EF9A9A" },
];

const STY = {
  "تم القص": { bg: "#EFF6FF", fg: "#1D4ED8", icon: "scissors" },
  "في التشغيل": { bg: "#FFFBEB", fg: "#B45309", icon: "cog" },
  "ملغي": { bg: "#FEF2F2", fg: "#B91C1C", icon: "x" },
  "تشطيب وتعبئة": { bg: "#ECFDF5", fg: "#047857", icon: "check" },
  "تم الشحن": { bg: "#F0FDF4", fg: "#15803D", icon: "truck" },
  "شحن جزئي": { bg: "#FFFBEB", fg: "#B45309", icon: "truck" },
  "تشغيل خارجي": { bg: "#F5F3FF", fg: "#6D28D9", icon: "ext" },
  "في الغسيل": { bg: "#FDF2F8", fg: "#BE185D", icon: "wash" },
};

const INIT = {
  fabrics: [
    { id: 1, name: "قماش شعييرات مازيراتي", unit: "كيلو", price: 170 },
    { id: 2, name: "قماش درببي مسحب ابيض", unit: "كيلو", price: 170 },
    { id: 3, name: "قماش بسكوته تيشرت", unit: "كيلو", price: 160 },
    { id: 4, name: "قماش كارس", unit: "متر", price: 0 },
    { id: 5, name: "جبردين خفيف", unit: "متر", price: 0 },
    { id: 6, name: "قماش 3D", unit: "متر", price: 0 },
    { id: 7, name: "قماش كتان", unit: "", price: 0 },
    { id: 8, name: "قماش ماجك", unit: "متر", price: 0 },
  ],
  accessories: [
    { id: 1, name: "تشغيل من القص للتعبئة", unit: "قطعة", price: 100 },
    { id: 2, name: "طباعة", unit: "قطعة", price: 0 }, { id: 3, name: "تطريز", unit: "قطعة", price: 0 },
    { id: 4, name: "بادجات", unit: "قطعة", price: 5 }, { id: 5, name: "كباسين", unit: "قطعة", price: 5 },
    { id: 6, name: "أستيك", unit: "قطعة", price: 5 }, { id: 7, name: "سوستة", unit: "قطعة", price: 0 },
    { id: 8, name: "دوبار", unit: "قطعة", price: 10 }, { id: 9, name: "شماعة", unit: "قطعة", price: 8 },
    { id: 10, name: "كفر", unit: "قطعة", price: 3 }, { id: 11, name: "كرتونة", unit: "قطعة", price: 3 },
    { id: 12, name: "تكاليف أخرى", unit: "قطعة", price: 10 }, { id: 13, name: "تسويق", unit: "قطعة", price: 10 },
  ],
  sizeSets: [
    { id: 1, label: "6-9M - 9-12M - 12-18M" }, { id: 2, label: "2-3-4-5" },
    { id: 3, label: "6-8-10-12" }, { id: 4, label: "M-L-XL-2XL" },
    { id: 5, label: "L-XL-2XL-3XL" }, { id: 6, label: "FREE SIZE" },
    { id: 7, label: "4-6-8-10-12" }, { id: 8, label: "S/L/M/XL" },
  ],
  statuses: ["تم القص", "في التشغيل", "ملغي", "في الغسيل", "تشطيب وتعبئة", "تم الشحن", "شحن جزئي", "تشغيل خارجي"],
  workshops: ["CLARK", "ورشة محمود", "ورشة عماد الدين", "ورشة حسين فايز", "ورشه محمد قدري", "المصنع", "ابو جاسم", "ورشه ماهر"],
  orders: [], season: "WS26",
};

function loadD() { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function saveD(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch (e) {} }
function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
function r2(n) { return Math.round((n || 0) * 100) / 100; }
function sqty(a) { return (a || []).reduce((s, c) => s + (Number(c.qty) || 0), 0); }
function slay(a) { return (a || []).reduce((s, c) => s + (Number(c.layers) || 0), 0); }
function sf(obj, key, val) { const c = JSON.parse(JSON.stringify(obj)); c[key] = val; return c; }
function gf(o, k, suf) { return o["fabric" + k + (suf || "")]; }
function gc(o, k) { return o["colors" + k] || []; }
function gcons(o, k) { return parseFloat(o["cons" + k]) || 0; }
function gdate(o, k) { return o["cutDate" + k] || ""; }

function calcOrder(o) {
  const mainCut = sqty(gc(o, "A")) || o.cutQty || 0;
  let totalFab = 0;
  const fabPieces = [];
  FKEYS.forEach((k) => {
    if (!gf(o, k)) return;
    const cost = gcons(o, k) * (gf(o, k, "Price") || 0) * slay(gc(o, k));
    const perPc = mainCut ? r2(cost / mainCut) : 0;
    totalFab += cost;
    fabPieces.push(perPc);
  });
  const fabPer = fabPieces.reduce((s, v) => s + v, 0);
  const accPer = (o.accCosts || []).filter((a) => a.active).reduce((s, a) => s + (a.price || 0), 0);
  return {
    cutQty: mainCut, totalFab, fabPer: r2(fabPer), accPer,
    accAll: accPer * mainCut,
    costPer: r2(fabPer + accPer),
    costAll: r2(totalFab + accPer * mainCut),
    balance: mainCut - (o.deliveredQty || 0),
  };
}

function mkOrder(data) {
  return {
    id: gid(), date: new Date().toISOString().split("T")[0],
    modelNo: "", modelDesc: "", sizeSetId: "", sizeLabel: "",
    workshop: "", status: data.statuses[0], cutQty: 0, deliveredQty: 0,
    accCosts: data.accessories.map((a) => ({ accId: a.id, name: a.name, unit: a.unit, price: a.price, active: false })),
    deliveries: [], image: "", instructions: "",
    fabricA: "", fabricB: "", fabricC: "", fabricD: "", fabricE: "",
    consA: 0, consB: 0, consC: 0, consD: 0, consE: 0,
    cutDateA: "", cutDateB: "", cutDateC: "", cutDateD: "", cutDateE: "",
    colorsA: [{ color: "", colorHex: "", layers: 0, pcsPerLayer: 0, qty: 0 }],
    colorsB: [], colorsC: [], colorsD: [], colorsE: [],
    fabricALabel: "", fabricBLabel: "", fabricCLabel: "", fabricDLabel: "", fabricELabel: "",
    fabricAPrice: 0, fabricBPrice: 0, fabricCPrice: 0, fabricDPrice: 0, fabricEPrice: 0,
    fabricAUnit: "", fabricBUnit: "", fabricCUnit: "", fabricDUnit: "", fabricEUnit: "",
  };
}

/* ─── SVG Icons ─── */
function Ico({ name, size, color }) {
  const s = size || 16;
  const c = color || "currentColor";
  const paths = {
    dashboard: "M3 3h7v7H3V3zm11 0h7v7h-7V3zm-11 11h7v7H3v-7zm11 0h7v7h-7v-7z",
    db: "M12 2C6.48 2 2 4.03 2 6.5v11C2 19.97 6.48 22 12 22s10-2.03 10-4.5v-11C22 4.03 17.52 2 12 2z",
    scissors: "M6 9a3 3 0 100-6 3 3 0 000 6zm0 8a3 3 0 100-6 3 3 0 000 6zm14-4l-8.5-5L20 3",
    details: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    cost: "M12 2v20m5-17a5 5 0 00-5-1 5 5 0 00-5 5c0 4 5 5 5 5s5 1 5 5a5 5 0 01-5 5 5 5 0 01-5-1",
    report: "M16 8v8m-4-5v5m-4-2v2m-2 4h16a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
    plus: "M12 5v14m-7-7h14",
    edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
    print: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z",
    back: "M19 12H5m7-7l-7 7 7 7",
    del: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] || paths.dashboard} />
      {name === "eye" && <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

/* ─── UI Components ─── */
const TH = { textAlign: "right", padding: "10px 12px", fontSize: 10, fontWeight: 500, color: "#64748B", whiteSpace: "nowrap", borderBottom: "2px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", letterSpacing: "0.02em", textTransform: "uppercase" };
const TD = { padding: "10px 12px", fontSize: 12, color: "var(--color-text-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", verticalAlign: "middle" };
const TDB = { padding: "10px 12px", fontSize: 12, color: "var(--color-text-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", verticalAlign: "middle", fontWeight: 600 };
const TDL = { padding: "10px 12px", fontSize: 12, color: "#64748B", borderBottom: "0.5px solid var(--color-border-tertiary)", verticalAlign: "middle", width: 90 };

function Badge({ t }) {
  const s = STY[t] || { bg: "#F1F5F9", fg: "#475569" };
  return <span style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: s.bg, color: s.fg, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>{t}</span>;
}

function Btn({ children, on, primary, danger, ghost, onClick, small, style: sx }) {
  let bg = "var(--color-background-primary)", fg = "var(--color-text-primary)", bd = "1px solid var(--color-border-tertiary)";
  if (on || primary) { bg = "#1E40AF"; fg = "#fff"; bd = "none"; }
  if (danger) { bg = "#FEF2F2"; fg: "#991B1B"; bd = "1px solid #FECACA"; }
  if (danger) { bg = "#FEF2F2"; fg = "#991B1B"; bd = "1px solid #FECACA"; }
  if (ghost) { bg = "transparent"; bd = "none"; fg = "#64748B"; }
  return <button onClick={onClick} style={{ padding: small ? "4px 12px" : "8px 18px", borderRadius: 8, fontSize: small ? 11 : 13, fontWeight: 500, background: bg, color: fg, border: bd, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", ...(sx || {}) }}>{children}</button>;
}

function Inp({ value, onChange, placeholder, type, step, style: sx, readOnly }) {
  return <input type={type || "text"} step={step || "any"} value={value == null ? "" : value} readOnly={readOnly} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: 13, fontFamily: "inherit", background: readOnly ? "var(--color-background-secondary)" : "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", transition: "border-color 0.2s", outline: "none", ...(sx || {}) }} />;
}

function Sel({ value, onChange, children }) {
  return <select value={value == null ? "" : value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: 13, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none" }}>{children}</select>;
}

function Card({ children, title, extra, accent, borderColor, style: sx }) {
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: 14, border: "1px solid var(--color-border-tertiary)", overflow: "visible", borderRight: borderColor ? ("4px solid " + borderColor) : undefined, ...(sx || {}) }}>
      {(title || extra) && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center", background: accent || "transparent", borderRadius: accent ? "14px 14px 0 0" : undefined }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: accent ? "#fff" : "var(--color-text-primary)", letterSpacing: "0.01em" }}>{title}</span>
          {extra}
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Metric({ label, value, color, sub, borderColor }) {
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: 14, padding: "20px", border: "1px solid var(--color-border-tertiary)", borderRight: "4px solid " + (borderColor || "#E2E8F0"), position: "relative" }}>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6, fontWeight: 500, letterSpacing: "0.02em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "var(--color-text-primary)", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PBar({ value, color }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: "#E2E8F0", overflow: "hidden", marginTop: 8 }}>
      <div style={{ height: "100%", width: Math.min(value, 100) + "%", borderRadius: 4, background: color || "#3B82F6", transition: "width 0.6s ease" }} />
    </div>
  );
}

function ColorPicker({ value, colorHex, onSelect }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState(value || "");
  useEffect(() => { setTxt(value || ""); }, [value]);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ width: 28, height: 28, borderRadius: 8, border: "2px solid var(--color-border-tertiary)", background: colorHex || "#fff", cursor: "pointer", flexShrink: 0, transition: "border-color 0.2s" }} />
      <input value={txt} onChange={(e) => { setTxt(e.target.value); const f = COLORS_DB.find((c) => c.n === e.target.value); onSelect(e.target.value, f ? f.h : colorHex || "#ccc"); }} placeholder="اكتب اللون" style={{ width: 90, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: 12, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }} />
      {open && <div style={{ position: "fixed", zIndex: 9999, background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 14, padding: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", width: 280 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
          {COLORS_DB.map((c) => <div key={c.h} onClick={() => { onSelect(c.n, c.h); setTxt(c.n); setOpen(false); }} title={c.n} style={{ width: 38, height: 38, borderRadius: 8, background: c.h, cursor: "pointer", border: colorHex === c.h ? "3px solid #1E40AF" : c.h === "#FFFFFF" ? "1px solid #E2E8F0" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: c.h === "#FFFFFF" || c.h === "#FFF8DC" ? "#94A3B8" : "#fff", fontWeight: 500, transition: "transform 0.15s" }}>{c.n}</div>)}
        </div>
        <div onClick={() => setOpen(false)} style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "#1E40AF", cursor: "pointer", fontWeight: 600, padding: 4 }}>اغلاق</div>
      </div>}
    </div>
  );
}

function FCTable({ label, fabName, colors, setColors, accent, readOnly }) {
  const tQ = sqty(colors);
  const tL = slay(colors);
  const addC = () => setColors([...colors, { color: "", colorHex: "", layers: 0, pcsPerLayer: 0, qty: 0 }]);
  const upC = (i, fld, val) => {
    const nc = colors.map((c, j) => {
      if (j !== i) return c;
      const u = { ...c };
      u[fld] = (fld === "color" || fld === "colorHex") ? val : (Number(val) || 0);
      if (fld === "layers" || fld === "pcsPerLayer") u.qty = (Number(u.layers) || 0) * (Number(u.pcsPerLayer) || 0);
      return u;
    });
    setColors(nc);
  };
  return (
    <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "visible", marginBottom: 12 }}>
      <div style={{ padding: "10px 16px", background: accent, display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{label + ": " + (fabName || "")}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "3px 12px", borderRadius: 20, fontWeight: 500 }}>{"راقات: " + tL}</span>
          <span style={{ fontSize: 11, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "3px 12px", borderRadius: 20, fontWeight: 500 }}>{"قطع: " + tQ}</span>
        </div>
      </div>
      <div style={{ padding: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...TH, background: "transparent" }}>اللون</th>
            <th style={{ ...TH, background: "transparent" }}>عدد الراقات</th>
            <th style={{ ...TH, background: "transparent" }}>القطع/راق</th>
            <th style={{ ...TH, background: "transparent" }}>الكمية</th>
            {!readOnly && <th style={{ ...TH, background: "transparent" }}>{" "}</th>}
          </tr></thead>
          <tbody>{colors.map((c, i) => (
            <tr key={i}>
              <td style={{ ...TD, minWidth: 160, overflow: "visible" }}>
                {readOnly ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 20, height: 20, borderRadius: 6, background: c.colorHex || "#E2E8F0", border: "1px solid #E2E8F0", flexShrink: 0 }} /><span style={{ fontWeight: 500 }}>{c.color || "-"}</span></div>
                : <ColorPicker value={c.color} colorHex={c.colorHex} onSelect={(nm, hx) => { const nc = colors.map((cc, jj) => jj === i ? { ...cc, color: nm, colorHex: hx } : cc); setColors(nc); }} />}
              </td>
              <td style={{ ...TD, width: 100 }}>{readOnly ? c.layers : <Inp type="number" value={c.layers} onChange={(v) => upC(i, "layers", v)} />}</td>
              <td style={{ ...TD, width: 100 }}>{readOnly ? (c.pcsPerLayer || "-") : <Inp type="number" value={c.pcsPerLayer} onChange={(v) => upC(i, "pcsPerLayer", v)} />}</td>
              <td style={{ ...TDB, width: 80, background: "var(--color-background-secondary)", textAlign: "center", borderRadius: 6 }}>{c.qty}</td>
              {!readOnly && <td style={{ ...TD, width: 40 }}><Btn danger small onClick={() => setColors(colors.filter((_, j) => j !== i))}>x</Btn></td>}
            </tr>
          ))}</tbody>
        </table>
        {!readOnly && <Btn ghost small onClick={addC} style={{ marginTop: 6, color: accent }}>+ لون جديد</Btn>}
      </div>
    </div>
  );
}

/* ─── TABS ─── */
const TABS = [
  { key: "dashboard", label: "لوحة التحكم", icon: "dashboard" },
  { key: "db", label: "قاعدة البيانات", icon: "db" },
  { key: "orders", label: "أوامر القص", icon: "scissors" },
  { key: "details", label: "تفاصيل الأوردر", icon: "details" },
  { key: "cost", label: "تقرير التكاليف", icon: "cost" },
  { key: "report", label: "تقرير الإنتاج", icon: "report" },
];

/* ─── APP ─── */
export default function App() {
  const [data, setData] = useState(() => loadD() || INIT);
  const [tab, setTab] = useState("dashboard");
  const [sel, setSel] = useState(null);
  useEffect(() => { saveD(data); }, [data]);
  const up = useCallback((fn) => setData((p) => { const n = JSON.parse(JSON.stringify(p)); fn(n); return n; }), []);
  const goD = (id) => { setSel(id); setTab("details"); };

  return (
    <div style={{ display: "flex", minHeight: "100vh", direction: "rtl", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)" }}>
      {/* ── Sidebar ── */}
      <nav style={{ width: 220, background: "#0F172A", flexShrink: 0, display: "flex", flexDirection: "column", color: "#fff" }}>
        <div style={{ padding: "24px 22px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: 3, color: "#60A5FA" }}>CLARK</div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 4, letterSpacing: "0.05em" }}>CUTTING AND PRODUCTION</div>
        </div>
        <div style={{ padding: "4px 10px", flex: 1 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "right",
                padding: "12px 14px", border: "none", cursor: "pointer", borderRadius: 10, marginBottom: 2,
                background: active ? "rgba(59,130,246,0.15)" : "transparent",
                color: active ? "#60A5FA" : "#64748B",
                fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: "inherit",
                transition: "all 0.2s",
              }}>
                <Ico name={t.icon} size={18} color={active ? "#60A5FA" : "#475569"} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #1E293B" }}>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>الموسم الحالي</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60A5FA", letterSpacing: 1 }}>{data.season}</div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main style={{ flex: 1, padding: 28, overflow: "auto", minWidth: 0 }}>
        {tab === "dashboard" && <Dash data={data} goD={goD} />}
        {tab === "db" && <DBPg data={data} up={up} />}
        {tab === "orders" && <OrdPg data={data} up={up} goD={goD} />}
        {tab === "details" && <DetPg data={data} up={up} sel={sel} setSel={setSel} />}
        {tab === "cost" && <CostPg data={data} />}
        {tab === "report" && <RepPg data={data} />}
      </main>
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function Dash({ data, goD }) {
  const orders = data.orders;
  const cutQ = orders.reduce((s, o) => s + calcOrder(o).cutQty, 0);
  const delQ = orders.reduce((s, o) => s + (o.deliveredQty || 0), 0);
  const comp = cutQ ? Math.round((delQ / cutQ) * 100) : 0;
  const inP = orders.filter((o) => o.status === "في التشغيل" || o.status === "تشغيل خارجي").length;
  const shipped = orders.filter((o) => o.status === "تم الشحن").length;
  const sc = {};
  orders.forEach((o) => { sc[o.status] = (sc[o.status] || 0) + 1; });
  const pieData = Object.entries(sc).map(([name, value]) => ({ name, value }));
  const wsData = {};
  orders.forEach((o) => { if (o.workshop) wsData[o.workshop] = (wsData[o.workshop] || 0) + calcOrder(o).cutQty; });
  const barData = Object.entries(wsData).map(([name, qty]) => ({ name: name.length > 10 ? name.slice(0, 10) + ".." : name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
  const costData = orders.slice(-10).map((o) => { const t = calcOrder(o); return { name: String(o.modelNo).slice(-5), fab: t.fabPer, acc: t.accPer }; });
  const recent = orders.slice().reverse().slice(0, 6);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>لوحة التحكم</h1>
        <p style={{ fontSize: 13, color: "#94A3B8", margin: "4px 0 0" }}>{"نظرة شاملة على الانتاج - الموسم " + data.season}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, marginBottom: 28 }}>
        <Metric label="عدد الموديلات" value={orders.length} sub="موديل" borderColor="#3B82F6" />
        <Metric label="اجمالي القص" value={fmt(cutQ)} sub="قطعة (خامة A)" borderColor="#10B981" />
        <Metric label="تم التسليم" value={fmt(delQ)} color="#059669" sub="قطعة" borderColor="#10B981" />
        <Metric label="تحت التشغيل" value={inP} color="#D97706" sub="موديل" borderColor="#F59E0B" />
        <Metric label="تم الشحن" value={shipped} color="#15803D" sub="موديل" borderColor="#22C55E" />
        <div style={{ background: "var(--color-background-primary)", borderRadius: 14, padding: 20, border: "1px solid var(--color-border-tertiary)", borderRight: "4px solid #3B82F6" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6, fontWeight: 500 }}>معدل الانجاز</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#1E40AF", letterSpacing: "-0.02em" }}>{comp + "%"}</div>
          <PBar value={comp} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card title="توزيع الحالات" borderColor="#3B82F6">
          {pieData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ResponsiveContainer width={140} height={140}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={36} outerRadius={60} paddingAngle={3} dataKey="value">{pieData.map((_, i) => <Cell key={i} fill={CPAL[i % CPAL.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
              <div style={{ flex: 1 }}>{pieData.map((d, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: 4, background: CPAL[i % CPAL.length], flexShrink: 0 }} /><span style={{ color: "#64748B", flex: 1 }}>{d.name}</span><span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{d.value}</span></div>)}</div>
            </div>
          ) : <p style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: 40 }}>لا توجد بيانات بعد</p>}
        </Card>
        <Card title="الكميات حسب الورشة" borderColor="#10B981">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}><BarChart data={barData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748B" }} width={75} /><Tooltip /><Bar dataKey="qty" fill="#10B981" radius={[0, 6, 6, 0]} barSize={14} /></BarChart></ResponsiveContainer>
          ) : <p style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: 40 }}>لا توجد بيانات</p>}
        </Card>
        <Card title="تكلفة القطعة (خامات vs تشغيل)" borderColor="#F59E0B">
          {costData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}><BarChart data={costData}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} /><YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="fab" name="خامات" fill="#10B981" stackId="a" barSize={18} radius={[0, 0, 0, 0]} /><Bar dataKey="acc" name="تشغيل" fill="#F59E0B" stackId="a" barSize={18} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          ) : <p style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: 40 }}>لا توجد بيانات</p>}
        </Card>
      </div>
      <Card title="آخر الأوامر" borderColor="#3B82F6">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["#", "رقم الموديل", "الوصف", "الورشة", "الكمية (A)", "الرصيد", "الحالة", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{recent.map((o) => { const t = calcOrder(o); return (<tr key={o.id} style={{ cursor: "pointer", transition: "background 0.15s" }} onClick={() => goD(o.id)}><td style={TD}>{orders.indexOf(o) + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.workshop || "-"}</td><td style={TDB}>{t.cutQty}</td><td style={{ ...TD, color: t.balance > 0 ? "#D97706" : "#059669", fontWeight: 600 }}>{t.balance}</td><td style={TD}><Badge t={o.status} /></td><td style={TD}><Btn ghost small><Ico name="eye" size={14} /></Btn></td></tr>); })}
            {recent.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد أوامر بعد</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ═══ DB ═══ */
function DBPg({ data, up }) {
  const [sub, setSub] = useState("fab");
  const [ff, setFf] = useState({ name: "", unit: "كيلو", price: "" });
  const [af, setAf] = useState({ name: "", unit: "قطعة", price: "" });
  const [sfld, setSfld] = useState({ label: "" });
  const [wf, setWf] = useState("");
  const [eId, setEId] = useState(null);
  const [eR, setER] = useState({});
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.02em" }}>قاعدة البيانات</h1>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>{[["fab", "الأقمشة"], ["acc", "الاكسسوار"], ["size", "المقاسات"], ["ws", "الورش"]].map(([k, l]) => <Btn key={k} on={sub === k} onClick={() => setSub(k)}>{l}</Btn>)}</div>
      {sub === "fab" && <Card title="جدول الأقمشة" borderColor="#3B82F6"><div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}><Inp value={ff.name} onChange={(v) => setFf({ ...ff, name: v })} placeholder="اسم القماش" /><Sel value={ff.unit} onChange={(v) => setFf({ ...ff, unit: v })}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel><Inp value={ff.price} onChange={(v) => setFf({ ...ff, price: v })} placeholder="السعر" type="number" /><Btn primary onClick={() => { if (!ff.name) return; up((d) => d.fabrics.push({ id: Date.now(), name: ff.name, unit: ff.unit, price: Number(ff.price) || 0 })); setFf({ name: "", unit: "كيلو", price: "" }); }}>+ اضافة</Btn></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "القماش", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f, i) => eId === f.id ? (<tr key={f.id}><td style={TD}>{i + 1}</td><td style={TD}><Inp value={eR.name} onChange={(v) => setER({ ...eR, name: v })} /></td><td style={TD}><Sel value={eR.unit} onChange={(v) => setER({ ...eR, unit: v })}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel></td><td style={TD}><Inp type="number" value={eR.price} onChange={(v) => setER({ ...eR, price: v })} /></td><td style={TD}><Btn primary small onClick={() => { up((d) => { const x = d.fabrics.find((z) => z.id === f.id); if (x) { x.name = eR.name; x.unit = eR.unit; x.price = Number(eR.price) || 0; } }); setEId(null); }}>حفظ</Btn></td></tr>) : (<tr key={f.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 500 }}>{f.name}</td><td style={TD}>{f.unit}</td><td style={TDB}>{f.price + " ج.م"}</td><td style={{ ...TD, whiteSpace: "nowrap" }}><Btn ghost small onClick={() => { setEId(f.id); setER({ ...f }); }}><Ico name="edit" size={13} /></Btn>{" "}<Btn danger small onClick={() => up((d) => { d.fabrics = d.fabrics.filter((x) => x.id !== f.id); })}><Ico name="del" size={13} /></Btn></td></tr>))}</tbody></table></Card>}
      {sub === "acc" && <Card title="اكسسوار + تكاليف" borderColor="#F59E0B"><div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}><Inp value={af.name} onChange={(v) => setAf({ ...af, name: v })} placeholder="الوصف" /><Sel value={af.unit} onChange={(v) => setAf({ ...af, unit: v })}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel><Inp value={af.price} onChange={(v) => setAf({ ...af, price: v })} placeholder="السعر" type="number" /><Btn primary onClick={() => { if (!af.name) return; up((d) => d.accessories.push({ id: Date.now(), name: af.name, unit: af.unit, price: Number(af.price) || 0 })); setAf({ name: "", unit: "قطعة", price: "" }); }}>+ اضافة</Btn></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "الوصف", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a, i) => <tr key={a.id}><td style={TD}>{i + 1}</td><td style={TD}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TDB}>{a.price + " ج.م"}</td><td style={TD}><Btn danger small onClick={() => up((d) => { d.accessories = d.accessories.filter((x) => x.id !== a.id); })}><Ico name="del" size={13} /></Btn></td></tr>)}</tbody></table></Card>}
      {sub === "size" && <Card title="المقاسات" borderColor="#8B5CF6"><div style={{ display: "grid", gridTemplateColumns: "3fr auto", gap: 10, marginBottom: 16 }}><Inp value={sfld.label} onChange={(v) => setSfld({ label: v })} placeholder="المقاسات" /><Btn primary onClick={() => { if (!sfld.label) return; up((d) => d.sizeSets.push({ id: Date.now(), label: sfld.label })); setSfld({ label: "" }); }}>+ اضافة</Btn></div><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "المقاسات", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s, i) => <tr key={s.id}><td style={TD}>{i + 1}</td><td style={TD}>{s.label}</td><td style={TD}><Btn danger small onClick={() => up((d) => { d.sizeSets = d.sizeSets.filter((x) => x.id !== s.id); })}>حذف</Btn></td></tr>)}</tbody></table></Card>}
      {sub === "ws" && <Card title="الورش" borderColor="#10B981"><div style={{ display: "grid", gridTemplateColumns: "3fr auto", gap: 10, marginBottom: 16 }}><Inp value={wf} onChange={setWf} placeholder="اسم الورشة" /><Btn primary onClick={() => { if (!wf.trim()) return; up((d) => d.workshops.push(wf.trim())); setWf(""); }}>+ اضافة</Btn></div><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{data.workshops.map((w, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--color-border-tertiary)", fontSize: 12, background: "var(--color-background-primary)", fontWeight: 500 }}>{w}<span onClick={() => up((d) => { d.workshops.splice(i, 1); })} style={{ cursor: "pointer", color: "#EF4444", fontWeight: 700, fontSize: 14 }}>x</span></span>)}</div></Card>}
    </div>
  );
}

/* ═══ ORDER FORM ═══ */
function OrdForm({ data, initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const fabObj = (id) => data.fabrics.find((x) => x.id === Number(id));
  const handleImg = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setForm((p) => ({ ...p, image: ev.target.result })); r.readAsDataURL(f); };
  const mainQty = sqty(form.colorsA);
  const updF = (key, val) => setForm((p) => sf(p, key, val));
  const save = () => {
    if (!form.modelNo || !form.sizeSetId) return;
    const ss = data.sizeSets.find((s) => s.id === Number(form.sizeSetId));
    const o = { ...form, cutQty: mainQty, sizeLabel: ss ? ss.label : "" };
    FKEYS.forEach((k) => { const fb = fabObj(o["fabric" + k]); o["fabric" + k + "Label"] = fb ? (fb.name + " - " + fb.unit) : ""; o["fabric" + k + "Price"] = fb ? fb.price : 0; o["fabric" + k + "Unit"] = fb ? fb.unit : ""; });
    if (!o.accCosts || o.accCosts.length === 0) o.accCosts = data.accessories.map((a) => ({ accId: a.id, name: a.name, unit: a.unit, price: a.price, active: false }));
    onSave(o);
  };
  return (
    <Card title={initial.modelNo ? "تعديل الأوردر" : "أمر قص جديد"} accent="#1E40AF" style={{ marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 20 }}>
        <div><div style={{ width: 130, height: 130, borderRadius: 14, border: "2px dashed #CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#F8FAFC", cursor: "pointer", position: "relative" }}>{form.image ? <img src={form.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 11, color: "#94A3B8", textAlign: "center" }}>صورة الموديل</span>}<input type="file" accept="image/*" onChange={handleImg} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} /></div></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
          <tr><td style={TDL}>رقم الموديل</td><td style={TD}><Inp value={form.modelNo} onChange={(v) => updF("modelNo", v)} /></td><td style={TDL}>الوصف</td><td style={TD}><Inp value={form.modelDesc} onChange={(v) => updF("modelDesc", v)} /></td></tr>
          <tr><td style={TDL}>المقاسات</td><td style={TD}><Sel value={form.sizeSetId} onChange={(v) => updF("sizeSetId", v)}><option value="">-- اختر --</option>{data.sizeSets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel></td><td style={TDL}>التاريخ</td><td style={TD}><Inp type="date" value={form.date} onChange={(v) => updF("date", v)} /></td></tr>
          <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={form.workshop} onChange={(v) => updF("workshop", v)}><option value="">-- اختر --</option>{data.workshops.map((w, i) => <option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={form.status} onChange={(v) => updF("status", v)}>{data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></td></tr>
        </tbody></table>
      </div>
      {FKEYS.map((k, idx) => {
        const fid = form["fabric" + k];
        const fb = fabObj(fid);
        return (
          <div key={k}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}><tbody><tr>
              <td style={{ ...TDL, fontWeight: 600 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: FCOL[idx], marginLeft: 6 }} />{"خامة " + k}</td>
              <td style={TD}><Sel value={fid} onChange={(v) => updF("fabric" + k, v)}><option value="">-- اختياري --</option>{data.fabrics.map((f) => <option key={f.id} value={f.id}>{f.name + " - " + f.price + " ج.م/" + f.unit}</option>)}</Sel></td>
              <td style={{ ...TDL, width: 80 }}>استهلاك/راق</td>
              <td style={{ ...TD, width: 100 }}><Inp type="number" step="any" value={form["cons" + k]} onChange={(v) => updF("cons" + k, v)} /></td>
              <td style={{ ...TDL, width: 80 }}>تاريخ القص</td>
              <td style={{ ...TD, width: 130 }}><Inp type="date" value={form["cutDate" + k] || ""} onChange={(v) => updF("cutDate" + k, v)} /></td>
            </tr></tbody></table>
            {fid && <FCTable label={"خامة " + k} fabName={fb ? fb.name : ""} accent={FCOL[idx]} colors={form["colors" + k] || []} setColors={(c) => updF("colors" + k, c)} />}
          </div>
        );
      })}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 500 }}>تعليمات التشغيل</label>
        <textarea value={form.instructions || ""} onChange={(e) => updF("instructions", e.target.value)} placeholder="تعليمات التشغيل والملاحظات الفنية..." style={{ width: "100%", height: 90, padding: 12, borderRadius: 10, border: "1px solid var(--color-border-tertiary)", fontSize: 13, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", resize: "vertical", outline: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid var(--color-border-tertiary)" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{"اجمالي كمية القص (A): "}<span style={{ color: "#1E40AF" }}>{mainQty}</span></div>
        <div style={{ display: "flex", gap: 10 }}><Btn ghost onClick={onCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ الأمر</Btn></div>
      </div>
    </Card>
  );
}

/* ═══ ORDERS ═══ */
function OrdPg({ data, up, goD }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>أوامر القص</h1><Btn primary onClick={() => setShow(!show)}>{show ? "الغاء" : "+ أمر قص جديد"}</Btn></div>
      {show && <OrdForm data={data} initial={mkOrder(data)} onSave={(o) => { up((d) => d.orders.push(o)); setShow(false); }} onCancel={() => setShow(false)} />}
      <Card title={"جميع الأوامر (" + data.orders.length + ")"} borderColor="#3B82F6">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["#", "التاريخ", "رقم الموديل", "الوصف", "المقاسات", "الورشة", "الكمية (A)", "الحالة", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{data.orders.map((o, i) => { const t = calcOrder(o); return (<tr key={o.id}><td style={TD}>{i + 1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.sizeLabel}</td><td style={TD}>{o.workshop || "-"}</td><td style={TDB}>{t.cutQty}</td><td style={TD}><Badge t={o.status} /></td><td style={{ ...TD, whiteSpace: "nowrap" }}><Btn ghost small onClick={() => goD(o.id)}><Ico name="eye" size={13} /></Btn>{" "}<Btn danger small onClick={() => up((d) => { d.orders = d.orders.filter((x) => x.id !== o.id); })}><Ico name="del" size={13} /></Btn></td></tr>); })}
            {data.orders.length === 0 && <tr><td colSpan={9} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد أوامر - ابدأ بإضافة أمر قص جديد</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ═══ DETAILS ═══ */
function DetPg({ data, up, sel, setSel }) {
  const order = data.orders.find((o) => o.id === sel);
  const [editing, setEditing] = useState(false);
  const upO = (fn) => up((d) => { const o = d.orders.find((x) => x.id === sel); if (o) fn(o); });

  if (!order) return (<div><h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 20px" }}>تفاصيل الأوردر</h1><Card title="اختر أوردر"><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{data.orders.map((o) => <Btn key={o.id} onClick={() => setSel(o.id)} style={{ padding: "12px 20px" }}>{o.modelNo + " - " + o.modelDesc}</Btn>)}{data.orders.length === 0 && <p style={{ fontSize: 13, color: "#94A3B8", padding: 24 }}>لا توجد أوامر</p>}</div></Card></div>);
  if (editing) return <OrdForm data={data} initial={order} onSave={(o) => { up((d) => { const idx = d.orders.findIndex((x) => x.id === sel); if (idx >= 0) d.orders[idx] = o; }); setEditing(false); }} onCancel={() => setEditing(false)} />;

  const t = calcOrder(order);
  const accCosts = order.accCosts || [];
  const accAll = t.accPer * t.cutQty;
  const activeFabs = FKEYS.filter((k) => order["fabric" + k]);
  const costChartData = [];
  activeFabs.forEach((k) => { const cost = r2(gcons(order, k) * (gf(order, k, "Price") || 0) * slay(gc(order, k))); if (cost > 0) costChartData.push({ name: "خامة " + k, value: cost, fill: FCOL[FKEYS.indexOf(k)] }); });
  if (accAll > 0) costChartData.push({ name: "اكسسوار وتشغيل", value: r2(accAll), fill: "#64748B" });

  const handlePrint = () => {
    const el = document.getElementById("parea");
    if (!el) return;
    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><title>" + order.modelNo + "</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px;direction:rtl;color:#1E293B}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #E2E8F0;padding:8px 10px;text-align:right}th{background:#F8FAFC;font-weight:600;font-size:11px;color:#475569}img{max-width:120px;border-radius:10px}h1{font-size:20px;color:#1E40AF;margin:0 0 12px}</style></head><body>");
    pw.document.write(el.innerHTML);
    pw.document.write("</body></html>");
    pw.document.close();
    pw.onload = () => { pw.focus(); pw.print(); };
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>{"أمر تشغيل - "}<span style={{ color: "#1E40AF" }}>{order.modelNo}</span></h1>
        <div style={{ display: "flex", gap: 10 }}><Btn onClick={handlePrint} style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" }}><Ico name="print" size={14} color="#475569" /> طباعة</Btn><Btn primary onClick={() => setEditing(true)}><Ico name="edit" size={14} color="#fff" /> تعديل</Btn><Btn ghost onClick={() => setSel(null)}><Ico name="back" size={14} /> عودة</Btn></div>
      </div>
      <div id="parea">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
          <Metric label="رقم الموديل" value={order.modelNo} borderColor="#3B82F6" /><Metric label="كمية القص (A)" value={t.cutQty} borderColor="#10B981" /><Metric label="تم التسليم" value={order.deliveredQty || 0} color="#059669" borderColor="#10B981" /><Metric label="الرصيد" value={t.balance} color={t.balance > 0 ? "#D97706" : "#059669"} borderColor={t.balance > 0 ? "#F59E0B" : "#10B981"} /><Metric label="تكلفة القطعة" value={t.costPer + " ج.م"} color="#1E40AF" borderColor="#3B82F6" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: order.image ? "auto 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
          {order.image && <div style={{ width: 150 }}><img src={order.image} alt="" style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 14, border: "1px solid var(--color-border-tertiary)" }} /></div>}
          <Card title="بيانات الموديل" borderColor="#3B82F6"><table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            <tr><td style={TDL}>الوصف</td><td style={TDB}>{order.modelDesc}</td><td style={TDL}>المقاسات</td><td style={TD}>{order.sizeLabel}</td></tr>
            <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={order.workshop} onChange={(v) => upO((o) => { o.workshop = v; })}><option value="">-</option>{data.workshops.map((w, i) => <option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={order.status} onChange={(v) => upO((o) => { o.status = v; })}>{data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></td></tr>
          </tbody></table></Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: activeFabs.length >= 3 ? "1fr 1fr 1fr" : activeFabs.length === 2 ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 16 }}>
          {activeFabs.map((k) => { const colors = gc(order, k); if (colors.length === 0) return null; const dt = gdate(order, k); return (<div key={k}><FCTable label={"خامة " + k} fabName={gf(order, k, "Label")} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={() => {}} readOnly />{dt && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: -8, marginBottom: 10, paddingRight: 6 }}>{"تاريخ القص: " + dt}</div>}</div>); })}
        </div>
        <Card title={"تكلفة الخامات (الاستهلاك للراق - كمية A = " + t.cutQty + ")"} borderColor="#10B981" style={{ marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["الخامة", "الوحدة", "سعر الوحدة", "استهلاك/راق", "عدد الراقات", "كمية القطع", "التكلفة الكلية", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {activeFabs.map((k) => { const cons = gcons(order, k); const price = gf(order, k, "Price") || 0; const layers = slay(gc(order, k)); const qty = sqty(gc(order, k)); const cost = cons * price * layers; const perPc = t.cutQty ? r2(cost / t.cutQty) : 0; return (<tr key={k}><td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: FCOL[FKEYS.indexOf(k)], marginLeft: 8 }} />{gf(order, k, "Label")}</td><td style={TD}>{gf(order, k, "Unit")}</td><td style={TD}>{price + " ج.م"}</td><td style={TD}><Inp type="number" step="any" value={order["cons" + k]} onChange={(v) => upO((o) => { o["cons" + k] = v; })} style={{ width: 80 }} /></td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={TDB}>{fmt(r2(cost)) + " ج.م"}</td><td style={TDB}>{perPc + " ج.م"}</td></tr>); })}
              {activeFabs.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#94A3B8" }}>لم يتم اختيار خامات</td></tr>}
              <tr style={{ background: "var(--color-background-secondary)" }}><td colSpan={6} style={{ ...TD, fontWeight: 600 }}>اجمالي تكلفة الخامات</td><td style={{ ...TD, fontWeight: 600 }}>{fmt(r2(t.totalFab)) + " ج.م"}</td><td style={{ ...TD, fontWeight: 700, color: "#1E40AF" }}>{t.fabPer + " ج.م"}</td></tr>
            </tbody>
          </table>
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card title="تكاليف الاكسسوار والتشغيل" borderColor="#F59E0B">
            <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["", "الوصف", "الوحدة", "سعر الوحدة", "اجمالي"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {accCosts.map((a, i) => <tr key={i} style={{ opacity: a.active ? 1 : 0.35 }}><td style={{ ...TD, width: 30 }}><input type="checkbox" checked={a.active} onChange={() => upO((o) => { o.accCosts[i].active = !o.accCosts[i].active; })} style={{ accentColor: "#1E40AF", width: 16, height: 16 }} /></td><td style={TD}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}><Inp type="number" value={a.price} onChange={(v) => upO((o) => { o.accCosts[i].price = Number(v) || 0; })} style={{ width: 80 }} /></td><td style={TDB}>{a.active ? fmt(a.price * t.cutQty) + " ج.م" : "-"}</td></tr>)}
              <tr style={{ background: "var(--color-background-secondary)" }}><td colSpan={3} style={{ ...TD, fontWeight: 600 }}>اجمالي</td><td style={{ ...TD, fontWeight: 600 }}>{t.accPer + " ج.م/قطعة"}</td><td style={{ ...TD, fontWeight: 600 }}>{fmt(accAll) + " ج.م"}</td></tr>
            </tbody></table>
          </Card>
          <Card title="التسليمات" borderColor="#10B981" extra={<Btn primary small onClick={() => upO((o) => { if (!o.deliveries) o.deliveries = []; o.deliveries.push({ date: new Date().toISOString().split("T")[0], qty: 0, notes: "" }); })}>+ تسليم</Btn>}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "التاريخ", "الكمية", "ملاحظات"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {(order.deliveries || []).map((d, i) => <tr key={i}><td style={TD}>{i + 1}</td><td style={TD}><Inp type="date" value={d.date} onChange={(v) => upO((o) => { o.deliveries[i].date = v; })} /></td><td style={TD}><Inp type="number" value={d.qty} onChange={(v) => upO((o) => { o.deliveries[i].qty = Number(v) || 0; o.deliveredQty = o.deliveries.reduce((s, x) => s + (Number(x.qty) || 0), 0); })} style={{ width: 80 }} /></td><td style={TD}><Inp value={d.notes} onChange={(v) => upO((o) => { o.deliveries[i].notes = v; })} /></td></tr>)}
              {(!order.deliveries || order.deliveries.length === 0) && <tr><td colSpan={4} style={{ ...TD, textAlign: "center", color: "#94A3B8" }}>لا توجد تسليمات</td></tr>}
            </tbody></table>
          </Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16, marginBottom: 16 }}>
          <Card title="توزيع التكاليف" borderColor="#8B5CF6">
            {costChartData.length > 0 ? (<ResponsiveContainer width="100%" height={200}><BarChart data={costChartData} layout="vertical" margin={{ left: 0, right: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748B" }} width={80} /><Tooltip formatter={(v) => fmt(v) + " ج.م"} /><Bar dataKey="value" barSize={20} radius={[0, 6, 6, 0]}>{costChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar></BarChart></ResponsiveContainer>) : <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center" }}>لا توجد تكاليف</p>}
          </Card>
          <Card title="ملخص تكلفة الموديل" accent="#1E40AF">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead><tr>{["البند", "التكلفة الكلية", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              <tr><td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#10B981", marginLeft: 8 }} />تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab)) + " ج.م"}</td><td style={TDB}>{t.fabPer + " ج.م"}</td></tr>
              <tr><td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#F59E0B", marginLeft: 8 }} />تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll) + " ج.م"}</td><td style={TDB}>{t.accPer + " ج.م"}</td></tr>
              <tr style={{ background: "#EFF6FF" }}><td style={{ ...TD, fontWeight: 700, fontSize: 16, color: "#1E40AF" }}>الاجمالي</td><td style={{ ...TD, fontWeight: 700, fontSize: 16, color: "#1E40AF" }}>{fmt(r2(t.costAll)) + " ج.م"}</td><td style={{ ...TD, fontWeight: 700, fontSize: 20, color: "#1E40AF" }}>{t.costPer + " ج.م"}</td></tr>
            </tbody></table>
          </Card>
        </div>
        {order.instructions && <Card title="تعليمات التشغيل والملاحظات الفنية" borderColor="#8B5CF6"><div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.8, color: "#334155" }}>{order.instructions}</div></Card>}
      </div>
    </div>
  );
}

/* ═══ COST ═══ */
function CostPg({ data }) {
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.02em" }}>تقرير تكاليف الموديلات</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}><Metric label="عدد الموديلات" value={data.orders.length} borderColor="#3B82F6" /><Metric label="اجمالي القص (A)" value={fmt(data.orders.reduce((s, o) => s + calcOrder(o).cutQty, 0))} borderColor="#10B981" /></div>
      <Card borderColor="#3B82F6"><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "رقم الموديل", "الوصف", "المقاسات", "الكمية (A)", "تسليم", "رصيد", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {data.orders.map((o, i) => { const c = calcOrder(o); return <tr key={o.id}><td style={TD}>{i + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.sizeLabel}</td><td style={TDB}>{c.cutQty}</td><td style={TD}>{o.deliveredQty || 0}</td><td style={{ ...TD, color: c.balance > 0 ? "#D97706" : "#059669", fontWeight: 600 }}>{c.balance}</td><td style={{ ...TDB, color: "#1E40AF" }}>{c.costPer + " ج.م"}</td></tr>; })}
        {data.orders.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد بيانات</td></tr>}
      </tbody></table></Card>
    </div>
  );
}

/* ═══ REPORT ═══ */
function RepPg({ data }) {
  const [filter, setFilter] = useState("الكل");
  const list = filter === "الكل" ? data.orders : data.orders.filter((o) => o.status === filter);
  const cutQ = list.reduce((s, o) => s + calcOrder(o).cutQty, 0);
  const delQ = list.reduce((s, o) => s + (o.deliveredQty || 0), 0);
  const comp = cutQ ? Math.round((delQ / cutQ) * 100) : 0;
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.02em" }}>تقرير قص وانتاج المصنع</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <Metric label="كمية القص (A)" value={fmt(cutQ)} borderColor="#3B82F6" /><Metric label="تسليم مخزن" value={fmt(delQ)} borderColor="#10B981" /><Metric label="رصيد بالمصنع" value={fmt(cutQ - delQ)} borderColor="#F59E0B" />
        <div style={{ background: "var(--color-background-primary)", borderRadius: 14, padding: 20, border: "1px solid var(--color-border-tertiary)", borderRight: "4px solid #3B82F6" }}><div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6, fontWeight: 500 }}>معدل الانجاز</div><div style={{ fontSize: 26, fontWeight: 700, color: "#1E40AF" }}>{comp + "%"}</div><PBar value={comp} /></div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>{["الكل", ...data.statuses].map((s) => <Btn key={s} on={filter === s} small onClick={() => setFilter(s)}>{s}</Btn>)}</div>
      <Card borderColor="#3B82F6"><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "رقم الموديل", "الوصف", "المقاسات", "الورشة", "كمية القص (A)", "تسليم", "رصيد", "الحالة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {list.map((o, i) => { const c = calcOrder(o); return <tr key={o.id}><td style={TD}>{i + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.sizeLabel}</td><td style={TD}>{o.workshop || "-"}</td><td style={TDB}>{c.cutQty}</td><td style={TD}>{o.deliveredQty || 0}</td><td style={{ ...TD, color: c.balance > 0 ? "#D97706" : "#059669", fontWeight: 600 }}>{c.balance}</td><td style={TD}><Badge t={o.status} /></td></tr>; })}
        {list.length === 0 && <tr><td colSpan={9} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد بيانات</td></tr>}
      </tbody></table></Card>
    </div>
  );
}
