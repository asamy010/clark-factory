import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

const SK = "clark-v13";
const UK = "clark-users";
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
  "تم القص": { bg: "#DBEAFE", fg: "#1E40AF" }, "في التشغيل": { bg: "#FEF3C7", fg: "#92400E" },
  "ملغي": { bg: "#FEE2E2", fg: "#991B1B" }, "تشطيب وتعبئة": { bg: "#D1FAE5", fg: "#065F46" },
  "تم الشحن": { bg: "#F0FDF4", fg: "#15803D" }, "شحن جزئي": { bg: "#FFFBEB", fg: "#B45309" },
  "تشغيل خارجي": { bg: "#F5F3FF", fg: "#6D28D9" }, "في الغسيل": { bg: "#FDF2F8", fg: "#BE185D" },
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

const DEFAULT_USERS = [{ username: "admin", password: "admin123", name: "المدير" }];

function loadD() { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function saveD(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch (e) {} }
function loadUsers() { try { const r = localStorage.getItem(UK); return r ? JSON.parse(r) : DEFAULT_USERS; } catch (e) { return DEFAULT_USERS; } }
function saveUsers(u) { try { localStorage.setItem(UK, JSON.stringify(u)); } catch (e) {} }
function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
function r2(n) { return Math.round((n || 0) * 100) / 100; }
function sqty(a) { return (a || []).reduce((s, c) => s + (Number(c.qty) || 0), 0); }
function slay(a) { return (a || []).reduce((s, c) => s + (Number(c.layers) || 0), 0); }
function setF(obj, key, val) { const c = JSON.parse(JSON.stringify(obj)); c[key] = val; return c; }
function gf(o, k, suf) { return o["fabric" + k + (suf || "")]; }
function gc(o, k) { return o["colors" + k] || []; }
function gcons(o, k) { return parseFloat(o["cons" + k]) || 0; }
function gdate(o, k) { return o["cutDate" + k] || ""; }
function useWin() { const [w, setW] = useState(window.innerWidth); useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []); return w; }
const mob = (w) => w < 768;

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
  return { cutQty: mainCut, totalFab, fabPer: r2(fabPer), accPer, accAll: accPer * mainCut, costPer: r2(fabPer + accPer), costAll: r2(totalFab + accPer * mainCut), balance: mainCut - (o.deliveredQty || 0) };
}

function mkOrder(data) {
  return {
    id: gid(), date: new Date().toISOString().split("T")[0], modelNo: "", modelDesc: "", sizeSetId: "", sizeLabel: "",
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

/* ── Syncs accessories from DB to order ── */
function syncAcc(order, dbAcc) {
  const existing = order.accCosts || [];
  return dbAcc.map((a) => {
    const found = existing.find((e) => e.accId === a.id);
    return { accId: a.id, name: a.name, unit: a.unit, price: found ? found.price : a.price, active: found ? found.active : false };
  });
}

/* ── UI ── */
const F = 15;
const TH = { textAlign: "right", padding: "12px 14px", fontSize: F - 2, fontWeight: 600, color: "#64748B", whiteSpace: "nowrap", borderBottom: "2px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" };
const TD = { padding: "12px 14px", fontSize: F, color: "var(--color-text-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", verticalAlign: "middle" };
const TDB = { ...TD, fontWeight: 600 };
const TDL = { ...TD, color: "#64748B", width: 100 };

function Badge({ t }) { const s = STY[t] || { bg: "#F1F5F9", fg: "#475569" }; return <span style={{ padding: "5px 14px", borderRadius: 8, fontSize: F - 2, fontWeight: 600, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{t}</span>; }

function Btn({ children, on, primary, danger, ghost, onClick, small, style: sx }) {
  let bg = "var(--color-background-primary)", fg = "var(--color-text-primary)", bd = "1px solid var(--color-border-tertiary)";
  if (on || primary) { bg = "#1E40AF"; fg = "#fff"; bd = "none"; }
  if (danger) { bg = "#FEF2F2"; fg = "#991B1B"; bd = "1px solid #FECACA"; }
  if (ghost) { bg = "transparent"; bd = "none"; fg = "#64748B"; }
  return <button onClick={onClick} style={{ padding: small ? "6px 14px" : "10px 22px", borderRadius: 10, fontSize: small ? F - 2 : F, fontWeight: 600, background: bg, color: fg, border: bd, cursor: "pointer", fontFamily: "inherit", ...(sx || {}) }}>{children}</button>;
}

function Inp({ value, onChange, placeholder, type, step, style: sx, readOnly }) {
  return <input type={type || "text"} step={step || "any"} value={value == null ? "" : value} readOnly={readOnly} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--color-border-tertiary)", fontSize: F, fontFamily: "inherit", background: readOnly ? "var(--color-background-secondary)" : "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", ...(sx || {}) }} />;
}

function Sel({ value, onChange, children }) {
  return <select value={value == null ? "" : value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--color-border-tertiary)", fontSize: F, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }}>{children}</select>;
}

function Card({ children, title, extra, accent, borderColor, style: sx }) {
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: 14, border: "1px solid var(--color-border-tertiary)", overflow: "visible", borderRight: borderColor ? "4px solid " + borderColor : undefined, ...(sx || {}) }}>
      {(title || extra) && <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center", background: accent || "transparent", borderRadius: accent ? "14px 14px 0 0" : undefined }}><span style={{ fontSize: F + 1, fontWeight: 700, color: accent ? "#fff" : "var(--color-text-primary)" }}>{title}</span>{extra}</div>}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Metric({ label, value, color, sub, borderColor }) {
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: 14, padding: 20, border: "1px solid var(--color-border-tertiary)", borderRight: "4px solid " + (borderColor || "#E2E8F0") }}>
      <div style={{ fontSize: F - 2, color: "#94A3B8", marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--color-text-primary)" }}>{value}</div>
      {sub && <div style={{ fontSize: F - 2, color: "#94A3B8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PBar({ value }) { return <div style={{ height: 10, borderRadius: 5, background: "#E2E8F0", overflow: "hidden", marginTop: 8 }}><div style={{ height: "100%", width: Math.min(value, 100) + "%", borderRadius: 5, background: "#3B82F6" }} /></div>; }

function ColorPicker({ value, colorHex, onSelect }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState(value || "");
  useEffect(() => { setTxt(value || ""); }, [value]);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ width: 30, height: 30, borderRadius: 8, border: "2px solid var(--color-border-tertiary)", background: colorHex || "#fff", cursor: "pointer", flexShrink: 0 }} />
      <input value={txt} onChange={(e) => { setTxt(e.target.value); const f = COLORS_DB.find((c) => c.n === e.target.value); onSelect(e.target.value, f ? f.h : colorHex || "#ccc"); }} placeholder="اكتب اللون" style={{ width: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: F - 1, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
      {open && <div style={{ position: "fixed", zIndex: 9999, background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 14, padding: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", width: 280 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
          {COLORS_DB.map((c) => <div key={c.h} onClick={() => { onSelect(c.n, c.h); setTxt(c.n); setOpen(false); }} title={c.n} style={{ width: 38, height: 38, borderRadius: 8, background: c.h, cursor: "pointer", border: colorHex === c.h ? "3px solid #1E40AF" : c.h === "#FFFFFF" ? "1px solid #E2E8F0" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: c.h === "#FFFFFF" || c.h === "#FFF8DC" ? "#94A3B8" : "#fff", fontWeight: 600 }}>{c.n}</div>)}
        </div>
        <div onClick={() => setOpen(false)} style={{ marginTop: 10, textAlign: "center", fontSize: F, color: "#1E40AF", cursor: "pointer", fontWeight: 700, padding: 6 }}>اغلاق</div>
      </div>}
    </div>
  );
}

function FCTable({ label, fabName, colors, setColors, accent, readOnly }) {
  const tQ = sqty(colors); const tL = slay(colors);
  const addC = () => setColors([...colors, { color: "", colorHex: "", layers: 0, pcsPerLayer: 0, qty: 0 }]);
  const upC = (i, fld, val) => { const nc = colors.map((c, j) => { if (j !== i) return c; const u = { ...c }; u[fld] = (fld === "color" || fld === "colorHex") ? val : (Number(val) || 0); if (fld === "layers" || fld === "pcsPerLayer") u.qty = (Number(u.layers) || 0) * (Number(u.pcsPerLayer) || 0); return u; }); setColors(nc); };
  return (
    <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "visible", marginBottom: 12 }}>
      <div style={{ padding: "10px 16px", background: accent, display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: F, fontWeight: 700, color: "#fff" }}>{label + ": " + (fabName || "")}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: F - 2, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "4px 14px", borderRadius: 20, fontWeight: 600 }}>{"راقات: " + tL}</span>
          <span style={{ fontSize: F - 2, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "4px 14px", borderRadius: 20, fontWeight: 600 }}>{"قطع: " + tQ}</span>
        </div>
      </div>
      <div style={{ padding: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 450 }}>
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
                {readOnly ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: 6, background: c.colorHex || "#E2E8F0", border: "1px solid #E2E8F0", flexShrink: 0 }} /><span style={{ fontWeight: 500 }}>{c.color || "-"}</span></div>
                : <ColorPicker value={c.color} colorHex={c.colorHex} onSelect={(nm, hx) => { const nc = colors.map((cc, jj) => jj === i ? { ...cc, color: nm, colorHex: hx } : cc); setColors(nc); }} />}
              </td>
              <td style={{ ...TD, width: 100 }}>{readOnly ? c.layers : <Inp type="number" value={c.layers} onChange={(v) => upC(i, "layers", v)} />}</td>
              <td style={{ ...TD, width: 100 }}>{readOnly ? (c.pcsPerLayer || "-") : <Inp type="number" value={c.pcsPerLayer} onChange={(v) => upC(i, "pcsPerLayer", v)} />}</td>
              <td style={{ ...TDB, width: 80, background: "var(--color-background-secondary)", textAlign: "center", borderRadius: 6 }}>{c.qty}</td>
              {!readOnly && <td style={{ ...TD, width: 40 }}><Btn danger small onClick={() => setColors(colors.filter((_, j) => j !== i))}>x</Btn></td>}
            </tr>))}</tbody>
        </table>
        {!readOnly && <Btn ghost small onClick={addC} style={{ marginTop: 6, color: accent }}>+ لون جديد</Btn>}
      </div>
    </div>
  );
}

/* ════ LOGIN SCREEN ════ */
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [showReg, setShowReg] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", name: "" });

  const handleLogin = () => {
    const users = loadUsers();
    const found = users.find((u) => u.username === username && u.password === password);
    if (found) { onLogin(found); setErr(""); }
    else setErr("اسم المستخدم أو كلمة المرور غلط");
  };

  const handleRegister = () => {
    if (!newUser.username || !newUser.password || !newUser.name) { setErr("اكمل كل البيانات"); return; }
    const users = loadUsers();
    if (users.find((u) => u.username === newUser.username)) { setErr("اسم المستخدم موجود"); return; }
    users.push(newUser);
    saveUsers(users);
    onLogin(newUser);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F172A", direction: "rtl", fontFamily: "var(--font-sans)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 20, padding: 40, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#1E40AF", letterSpacing: 4, marginBottom: 6 }}>CLARK</div>
          <div style={{ fontSize: F, color: "#64748B" }}>نظام ادارة القص والتشغيل</div>
        </div>

        {!showReg ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: F, color: "#334155", marginBottom: 6, fontWeight: 600 }}>اسم المستخدم</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ادخل اسم المستخدم" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: F + 1, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: F, color: "#334155", marginBottom: 6, fontWeight: 600 }}>كلمة المرور</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ادخل كلمة المرور" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: F + 1, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            </div>
            {err && <div style={{ color: "#DC2626", fontSize: F, marginBottom: 12, textAlign: "center", fontWeight: 600 }}>{err}</div>}
            <button onClick={handleLogin} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "#1E40AF", color: "#fff", fontSize: F + 2, fontWeight: 700, border: "none", cursor: "pointer", marginBottom: 14 }}>تسجيل الدخول</button>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: F, color: "#64748B" }}>{"مستخدم جديد؟ "}</span>
              <span onClick={() => { setShowReg(true); setErr(""); }} style={{ fontSize: F, color: "#1E40AF", cursor: "pointer", fontWeight: 700 }}>انشاء حساب</span>
            </div>
            <div style={{ marginTop: 16, padding: 12, background: "#F8FAFC", borderRadius: 10, fontSize: F - 2, color: "#94A3B8", textAlign: "center" }}>{"الحساب الافتراضي: admin / admin123"}</div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: F, color: "#334155", marginBottom: 6, fontWeight: 600 }}>الاسم الكامل</label>
              <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="الاسم" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: F + 1, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: F, color: "#334155", marginBottom: 6, fontWeight: 600 }}>اسم المستخدم</label>
              <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder="username" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: F + 1, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: F, color: "#334155", marginBottom: 6, fontWeight: 600 }}>كلمة المرور</label>
              <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="كلمة المرور" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: F + 1, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            {err && <div style={{ color: "#DC2626", fontSize: F, marginBottom: 12, textAlign: "center", fontWeight: 600 }}>{err}</div>}
            <button onClick={handleRegister} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "#1E40AF", color: "#fff", fontSize: F + 2, fontWeight: 700, border: "none", cursor: "pointer", marginBottom: 14 }}>انشاء حساب</button>
            <div style={{ textAlign: "center" }}>
              <span onClick={() => { setShowReg(false); setErr(""); }} style={{ fontSize: F, color: "#1E40AF", cursor: "pointer", fontWeight: 700 }}>عودة لتسجيل الدخول</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════ TABS ════ */
const TABS = [
  { key: "dashboard", label: "لوحة التحكم" }, { key: "db", label: "قاعدة البيانات" },
  { key: "orders", label: "أوامر القص" }, { key: "details", label: "تفاصيل الأوردر" },
  { key: "cost", label: "تقرير التكاليف" }, { key: "report", label: "تقرير الإنتاج" },
];

/* ════ APP ════ */
export default function App() {
  const [user, setUser] = useState(() => { try { const u = localStorage.getItem("clark-user"); return u ? JSON.parse(u) : null; } catch (e) { return null; } });
  const [data, setData] = useState(() => loadD() || INIT);
  const [tab, setTab] = useState("dashboard");
  const [sel, setSel] = useState(null);
  const [sideOpen, setSideOpen] = useState(true);
  const w = useWin();
  const isMob = mob(w);

  useEffect(() => { saveD(data); }, [data]);
  useEffect(() => { if (isMob) setSideOpen(false); }, [isMob]);

  const up = useCallback((fn) => setData((p) => { const n = JSON.parse(JSON.stringify(p)); fn(n); return n; }), []);
  const goD = (id) => { setSel(id); setTab("details"); if (isMob) setSideOpen(false); };

  const handleLogin = (u) => { setUser(u); localStorage.setItem("clark-user", JSON.stringify(u)); };
  const handleLogout = () => { setUser(null); localStorage.removeItem("clark-user"); };

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const sideW = isMob ? (sideOpen ? 260 : 0) : (sideOpen ? 220 : 60);

  return (
    <div style={{ display: "flex", minHeight: "100vh", direction: "rtl", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)", fontSize: F }}>
      {/* Sidebar overlay on mobile */}
      {isMob && sideOpen && <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 998 }} />}

      <nav style={{ width: sideW, background: "#0F172A", flexShrink: 0, display: "flex", flexDirection: "column", color: "#fff", transition: "width 0.3s", overflow: "hidden", position: isMob ? "fixed" : "relative", right: 0, top: 0, bottom: 0, zIndex: 999 }}>
        <div style={{ padding: "20px 18px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {(sideOpen || !isMob) && <div><div style={{ fontWeight: 800, fontSize: 22, color: "#60A5FA", letterSpacing: 3 }}>CLARK</div>{sideOpen && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>CUTTING AND PRODUCTION</div>}</div>}
          <div onClick={() => setSideOpen(!sideOpen)} style={{ cursor: "pointer", color: "#60A5FA", fontSize: 22, padding: 4 }}>{"☰"}</div>
        </div>
        {sideOpen && <div style={{ padding: "4px 10px", flex: 1 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); if (isMob) setSideOpen(false); }} style={{ display: "block", width: "100%", textAlign: "right", padding: "14px 16px", border: "none", cursor: "pointer", borderRadius: 10, marginBottom: 2, background: tab === t.key ? "rgba(59,130,246,0.15)" : "transparent", color: tab === t.key ? "#60A5FA" : "#64748B", fontSize: F, fontWeight: tab === t.key ? 700 : 400, fontFamily: "inherit" }}>{t.label}</button>
          ))}
        </div>}
        {sideOpen && <div style={{ padding: "14px 18px", borderTop: "1px solid #1E293B" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 11, color: "#475569" }}>{"مرحبا، " + user.name}</div><div style={{ fontSize: 16, fontWeight: 700, color: "#60A5FA" }}>{data.season}</div></div>
            <button onClick={handleLogout} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(239,68,68,0.15)", color: "#F87171", border: "none", cursor: "pointer", fontSize: F - 2, fontWeight: 600 }}>خروج</button>
          </div>
        </div>}
      </nav>

      <main style={{ flex: 1, padding: isMob ? 14 : 28, overflow: "auto", minWidth: 0 }}>
        {isMob && !sideOpen && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div onClick={() => setSideOpen(true)} style={{ cursor: "pointer", fontSize: 24, color: "#1E40AF", fontWeight: 700 }}>{"☰"}</div>
          <span style={{ fontSize: F, color: "#64748B", fontWeight: 600 }}>{TABS.find((t) => t.key === tab)?.label}</span>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>{user.name}</span>
        </div>}
        {tab === "dashboard" && <Dash data={data} goD={goD} isMob={isMob} />}
        {tab === "db" && <DBPg data={data} up={up} isMob={isMob} />}
        {tab === "orders" && <OrdPg data={data} up={up} goD={goD} isMob={isMob} />}
        {tab === "details" && <DetPg data={data} up={up} sel={sel} setSel={setSel} isMob={isMob} />}
        {tab === "cost" && <CostPg data={data} isMob={isMob} />}
        {tab === "report" && <RepPg data={data} isMob={isMob} />}
      </main>
    </div>
  );
}

/* ════ DASHBOARD ════ */
function Dash({ data, goD, isMob }) {
  const orders = data.orders;
  const cutQ = orders.reduce((s, o) => s + calcOrder(o).cutQty, 0);
  const delQ = orders.reduce((s, o) => s + (o.deliveredQty || 0), 0);
  const comp = cutQ ? Math.round((delQ / cutQ) * 100) : 0;
  const inP = orders.filter((o) => o.status === "في التشغيل" || o.status === "تشغيل خارجي").length;
  const sc = {};
  orders.forEach((o) => { sc[o.status] = (sc[o.status] || 0) + 1; });
  const pieData = Object.entries(sc).map(([name, value]) => ({ name, value }));
  const costData = orders.slice(-8).map((o) => { const t = calcOrder(o); return { name: String(o.modelNo).slice(-5), fab: t.fabPer, acc: t.accPer }; });
  const recent = orders.slice().reverse().slice(0, 5);

  return (
    <div>
      <h1 style={{ fontSize: isMob ? 22 : 28, fontWeight: 800, margin: "0 0 20px" }}>{"لوحة التحكم - " + data.season}</h1>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <Metric label="الموديلات" value={orders.length} sub="موديل" borderColor="#3B82F6" />
        <Metric label="اجمالي القص" value={fmt(cutQ)} sub="قطعة" borderColor="#10B981" />
        <Metric label="تم التسليم" value={fmt(delQ)} color="#059669" sub="قطعة" borderColor="#10B981" />
        <Metric label="تحت التشغيل" value={inP} color="#D97706" sub="موديل" borderColor="#F59E0B" />
      </div>
      <div style={{ background: "var(--color-background-primary)", borderRadius: 14, padding: 20, border: "1px solid var(--color-border-tertiary)", borderRight: "4px solid #3B82F6", marginBottom: 24 }}>
        <div style={{ fontSize: F, color: "#94A3B8", marginBottom: 8, fontWeight: 600 }}>معدل الانجاز</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#1E40AF" }}>{comp + "%"}</div>
        <PBar value={comp} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card title="توزيع الحالات" borderColor="#3B82F6">
          {pieData.length > 0 ? (<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <ResponsiveContainer width={isMob ? "100%" : 150} height={150}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={36} outerRadius={60} paddingAngle={3} dataKey="value">{pieData.map((_, i) => <Cell key={i} fill={CPAL[i % CPAL.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
            <div style={{ flex: 1, minWidth: 120 }}>{pieData.map((d, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: F }}><span style={{ width: 12, height: 12, borderRadius: 4, background: CPAL[i % CPAL.length], flexShrink: 0 }} /><span style={{ color: "#64748B", flex: 1 }}>{d.name}</span><span style={{ fontWeight: 700 }}>{d.value}</span></div>)}</div>
          </div>) : <p style={{ fontSize: F, color: "#94A3B8", textAlign: "center", padding: 30 }}>لا توجد بيانات</p>}
        </Card>
        <Card title="تكلفة القطعة" borderColor="#F59E0B">
          {costData.length > 0 ? (<ResponsiveContainer width="100%" height={180}><BarChart data={costData}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="fab" name="خامات" fill="#10B981" stackId="a" barSize={20} /><Bar dataKey="acc" name="تشغيل" fill="#F59E0B" stackId="a" barSize={20} /></BarChart></ResponsiveContainer>) : <p style={{ fontSize: F, color: "#94A3B8", textAlign: "center", padding: 30 }}>لا توجد بيانات</p>}
        </Card>
      </div>
      <Card title="آخر الأوامر" borderColor="#3B82F6">
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead><tr>{["#", "موديل", "الوصف", "الكمية", "الرصيد", "الحالة", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{recent.map((o) => { const t = calcOrder(o); return (<tr key={o.id} style={{ cursor: "pointer" }} onClick={() => goD(o.id)}><td style={TD}>{orders.indexOf(o) + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TDB}>{t.cutQty}</td><td style={{ ...TD, color: t.balance > 0 ? "#D97706" : "#059669", fontWeight: 700 }}>{t.balance}</td><td style={TD}><Badge t={o.status} /></td><td style={TD}><Btn ghost small>عرض</Btn></td></tr>); })}
            {recent.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40, fontSize: F }}>لا توجد أوامر بعد</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

/* ════ DB ════ */
function DBPg({ data, up, isMob }) {
  const [sub, setSub] = useState("fab");
  const [ff, setFf] = useState({ name: "", unit: "كيلو", price: "" });
  const [af, setAf] = useState({ name: "", unit: "قطعة", price: "" });
  const [sfld, setSfld] = useState({ label: "" });
  const [wf, setWf] = useState("");
  const [eId, setEId] = useState(null);
  const [eR, setER] = useState({});
  return (
    <div>
      <h1 style={{ fontSize: isMob ? 22 : 28, fontWeight: 800, margin: "0 0 20px" }}>قاعدة البيانات</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>{[["fab", "الأقمشة"], ["acc", "الاكسسوار"], ["size", "المقاسات"], ["ws", "الورش"]].map(([k, l]) => <Btn key={k} on={sub === k} onClick={() => setSub(k)}>{l}</Btn>)}</div>
      {sub === "fab" && <Card title="جدول الأقمشة" borderColor="#3B82F6"><div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "3fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}><Inp value={ff.name} onChange={(v) => setFf({ ...ff, name: v })} placeholder="اسم القماش" /><Sel value={ff.unit} onChange={(v) => setFf({ ...ff, unit: v })}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel><Inp value={ff.price} onChange={(v) => setFf({ ...ff, price: v })} placeholder="السعر" type="number" /><Btn primary onClick={() => { if (!ff.name) return; up((d) => d.fabrics.push({ id: Date.now(), name: ff.name, unit: ff.unit, price: Number(ff.price) || 0 })); setFf({ name: "", unit: "كيلو", price: "" }); }}>+ اضافة</Btn></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}><thead><tr>{["#", "القماش", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f, i) => eId === f.id ? (<tr key={f.id}><td style={TD}>{i + 1}</td><td style={TD}><Inp value={eR.name} onChange={(v) => setER({ ...eR, name: v })} /></td><td style={TD}><Sel value={eR.unit} onChange={(v) => setER({ ...eR, unit: v })}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel></td><td style={TD}><Inp type="number" value={eR.price} onChange={(v) => setER({ ...eR, price: v })} /></td><td style={TD}><Btn primary small onClick={() => { up((d) => { const x = d.fabrics.find((z) => z.id === f.id); if (x) { x.name = eR.name; x.unit = eR.unit; x.price = Number(eR.price) || 0; } }); setEId(null); }}>حفظ</Btn></td></tr>) : (<tr key={f.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 600 }}>{f.name}</td><td style={TD}>{f.unit}</td><td style={TDB}>{f.price + " ج.م"}</td><td style={{ ...TD, whiteSpace: "nowrap" }}><Btn ghost small onClick={() => { setEId(f.id); setER({ ...f }); }}>تعديل</Btn>{" "}<Btn danger small onClick={() => up((d) => { d.fabrics = d.fabrics.filter((x) => x.id !== f.id); })}>حذف</Btn></td></tr>))}</tbody></table></div></Card>}
      {sub === "acc" && <Card title="الاكسسوار والتكاليف" borderColor="#F59E0B"><div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "3fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}><Inp value={af.name} onChange={(v) => setAf({ ...af, name: v })} placeholder="الوصف" /><Sel value={af.unit} onChange={(v) => setAf({ ...af, unit: v })}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel><Inp value={af.price} onChange={(v) => setAf({ ...af, price: v })} placeholder="السعر" type="number" /><Btn primary onClick={() => { if (!af.name) return; up((d) => d.accessories.push({ id: Date.now(), name: af.name, unit: af.unit, price: Number(af.price) || 0 })); setAf({ name: "", unit: "قطعة", price: "" }); }}>+ اضافة</Btn></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 450 }}><thead><tr>{["#", "الوصف", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a, i) => <tr key={a.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 600 }}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TDB}>{a.price + " ج.م"}</td><td style={TD}><Btn danger small onClick={() => up((d) => { d.accessories = d.accessories.filter((x) => x.id !== a.id); })}>حذف</Btn></td></tr>)}</tbody></table></div>
        <div style={{ marginTop: 14, padding: 14, background: "#F8FAFC", borderRadius: 10, fontSize: F - 1, color: "#64748B" }}>{"* البيانات هنا بتتحدث تلقائي في تكاليف كل أوردر جديد - لو عدلت السعر هنا هيتعدل في الأوامر الجديدة"}</div>
      </Card>}
      {sub === "size" && <Card title="المقاسات" borderColor="#8B5CF6"><div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr auto" : "3fr auto", gap: 10, marginBottom: 16 }}><Inp value={sfld.label} onChange={(v) => setSfld({ label: v })} placeholder="المقاسات" /><Btn primary onClick={() => { if (!sfld.label) return; up((d) => d.sizeSets.push({ id: Date.now(), label: sfld.label })); setSfld({ label: "" }); }}>+ اضافة</Btn></div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "المقاسات", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s, i) => <tr key={s.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 600 }}>{s.label}</td><td style={TD}><Btn danger small onClick={() => up((d) => { d.sizeSets = d.sizeSets.filter((x) => x.id !== s.id); })}>حذف</Btn></td></tr>)}</tbody></table></div></Card>}
      {sub === "ws" && <Card title="الورش" borderColor="#10B981"><div style={{ display: "grid", gridTemplateColumns: "3fr auto", gap: 10, marginBottom: 16 }}><Inp value={wf} onChange={setWf} placeholder="اسم الورشة" /><Btn primary onClick={() => { if (!wf.trim()) return; up((d) => d.workshops.push(wf.trim())); setWf(""); }}>+ اضافة</Btn></div><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{data.workshops.map((w, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: "1px solid var(--color-border-tertiary)", fontSize: F, fontWeight: 600 }}>{w}<span onClick={() => up((d) => { d.workshops.splice(i, 1); })} style={{ cursor: "pointer", color: "#EF4444", fontWeight: 800, fontSize: 16 }}>x</span></span>)}</div></Card>}
    </div>
  );
}

/* ════ ORDER FORM ════ */
function OrdForm({ data, initial, onSave, onCancel, isMob }) {
  const [form, setForm] = useState(() => ({ ...initial, accCosts: syncAcc(initial, data.accessories) }));
  const fabObj = (id) => data.fabrics.find((x) => x.id === Number(id));
  const handleImg = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setForm((p) => ({ ...p, image: ev.target.result })); r.readAsDataURL(f); };
  const mainQty = sqty(form.colorsA);
  const updF = (key, val) => setForm((p) => setF(p, key, val));
  const save = () => {
    if (!form.modelNo || !form.sizeSetId) return;
    const ss = data.sizeSets.find((s) => s.id === Number(form.sizeSetId));
    const o = { ...form, cutQty: mainQty, sizeLabel: ss ? ss.label : "", accCosts: syncAcc(form, data.accessories) };
    FKEYS.forEach((k) => { const fb = fabObj(o["fabric" + k]); o["fabric" + k + "Label"] = fb ? (fb.name + " - " + fb.unit) : ""; o["fabric" + k + "Price"] = fb ? fb.price : 0; o["fabric" + k + "Unit"] = fb ? fb.unit : ""; });
    onSave(o);
  };
  return (
    <Card title={initial.modelNo ? "تعديل الأوردر" : "أمر قص جديد"} accent="#1E40AF" style={{ marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "auto 1fr", gap: 16, marginBottom: 20 }}>
        <div><div style={{ width: isMob ? "100%" : 140, height: 140, borderRadius: 14, border: "2px dashed #CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#F8FAFC", cursor: "pointer", position: "relative" }}>{form.image ? <img src={form.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: F, color: "#94A3B8", textAlign: "center" }}>صورة الموديل</span>}<input type="file" accept="image/*" onChange={handleImg} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} /></div></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><tbody>
          <tr><td style={TDL}>رقم الموديل</td><td style={TD}><Inp value={form.modelNo} onChange={(v) => updF("modelNo", v)} /></td><td style={TDL}>الوصف</td><td style={TD}><Inp value={form.modelDesc} onChange={(v) => updF("modelDesc", v)} /></td></tr>
          <tr><td style={TDL}>المقاسات</td><td style={TD}><Sel value={form.sizeSetId} onChange={(v) => updF("sizeSetId", v)}><option value="">-- اختر --</option>{data.sizeSets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel></td><td style={TDL}>التاريخ</td><td style={TD}><Inp type="date" value={form.date} onChange={(v) => updF("date", v)} /></td></tr>
          <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={form.workshop} onChange={(v) => updF("workshop", v)}><option value="">-- اختر --</option>{data.workshops.map((w, i) => <option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={form.status} onChange={(v) => updF("status", v)}>{data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></td></tr>
        </tbody></table></div>
      </div>
      {FKEYS.map((k, idx) => {
        const fid = form["fabric" + k]; const fb = fabObj(fid);
        return (
          <div key={k}>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, minWidth: 500 }}><tbody><tr>
              <td style={{ ...TDL, fontWeight: 700 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: FCOL[idx], marginLeft: 6 }} />{"خامة " + k}</td>
              <td style={TD}><Sel value={fid} onChange={(v) => updF("fabric" + k, v)}><option value="">-- اختياري --</option>{data.fabrics.map((f) => <option key={f.id} value={f.id}>{f.name + " - " + f.price + " ج.م/" + f.unit}</option>)}</Sel></td>
              <td style={{ ...TDL, width: 80 }}>استهلاك/راق</td>
              <td style={{ ...TD, width: 100 }}><Inp type="number" step="any" value={form["cons" + k]} onChange={(v) => updF("cons" + k, v)} /></td>
              <td style={{ ...TDL, width: 80 }}>تاريخ القص</td>
              <td style={{ ...TD, width: 130 }}><Inp type="date" value={form["cutDate" + k] || ""} onChange={(v) => updF("cutDate" + k, v)} /></td>
            </tr></tbody></table></div>
            {fid && <FCTable label={"خامة " + k} fabName={fb ? fb.name : ""} accent={FCOL[idx]} colors={form["colors" + k] || []} setColors={(c) => updF("colors" + k, c)} />}
          </div>
        );
      })}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: F, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>تعليمات التشغيل</label>
        <textarea value={form.instructions || ""} onChange={(e) => updF("instructions", e.target.value)} placeholder="تعليمات التشغيل والملاحظات الفنية..." style={{ width: "100%", height: 100, padding: 14, borderRadius: 12, border: "1px solid var(--color-border-tertiary)", fontSize: F, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid var(--color-border-tertiary)", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{"كمية القص (A): "}<span style={{ color: "#1E40AF" }}>{mainQty}</span></div>
        <div style={{ display: "flex", gap: 10 }}><Btn ghost onClick={onCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ الأمر</Btn></div>
      </div>
    </Card>
  );
}

/* ════ ORDERS ════ */
function OrdPg({ data, up, goD, isMob }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}><h1 style={{ fontSize: isMob ? 22 : 28, fontWeight: 800, margin: 0 }}>أوامر القص</h1><Btn primary onClick={() => setShow(!show)}>{show ? "الغاء" : "+ أمر قص جديد"}</Btn></div>
      {show && <OrdForm data={data} initial={mkOrder(data)} onSave={(o) => { up((d) => d.orders.push(o)); setShow(false); }} onCancel={() => setShow(false)} isMob={isMob} />}
      <Card title={"جميع الأوامر (" + data.orders.length + ")"} borderColor="#3B82F6">
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead><tr>{["#", "التاريخ", "موديل", "الوصف", "المقاسات", "الكمية", "الحالة", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{data.orders.map((o, i) => { const t = calcOrder(o); return (<tr key={o.id}><td style={TD}>{i + 1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.sizeLabel}</td><td style={TDB}>{t.cutQty}</td><td style={TD}><Badge t={o.status} /></td><td style={{ ...TD, whiteSpace: "nowrap" }}><Btn ghost small onClick={() => goD(o.id)}>تفاصيل</Btn>{" "}<Btn danger small onClick={() => up((d) => { d.orders = d.orders.filter((x) => x.id !== o.id); })}>حذف</Btn></td></tr>); })}
            {data.orders.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد أوامر</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

/* ════ DETAILS ════ */
function DetPg({ data, up, sel, setSel, isMob }) {
  const order = data.orders.find((o) => o.id === sel);
  const [editing, setEditing] = useState(false);
  const upO = (fn) => up((d) => { const o = d.orders.find((x) => x.id === sel); if (o) fn(o); });

  if (!order) return (<div><h1 style={{ fontSize: isMob ? 22 : 28, fontWeight: 800, margin: "0 0 20px" }}>تفاصيل الأوردر</h1><Card title="اختر أوردر"><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{data.orders.map((o) => <Btn key={o.id} onClick={() => setSel(o.id)} style={{ padding: "14px 20px" }}>{o.modelNo + " - " + o.modelDesc}</Btn>)}{data.orders.length === 0 && <p style={{ fontSize: F, color: "#94A3B8", padding: 24 }}>لا توجد أوامر</p>}</div></Card></div>);
  if (editing) return <OrdForm data={data} initial={order} onSave={(o) => { up((d) => { const idx = d.orders.findIndex((x) => x.id === sel); if (idx >= 0) d.orders[idx] = o; }); setEditing(false); }} onCancel={() => setEditing(false)} isMob={isMob} />;

  const t = calcOrder(order);
  const liveAcc = syncAcc(order, data.accessories);
  const accAll = t.accPer * t.cutQty;
  const activeFabs = FKEYS.filter((k) => order["fabric" + k]);
  const costChartData = [];
  activeFabs.forEach((k) => { const cost = r2(gcons(order, k) * (gf(order, k, "Price") || 0) * slay(gc(order, k))); if (cost > 0) costChartData.push({ name: "خامة " + k, value: cost, fill: FCOL[FKEYS.indexOf(k)] }); });
  if (accAll > 0) costChartData.push({ name: "اكسسوار", value: r2(accAll), fill: "#64748B" });

  const handlePrint = () => { const el = document.getElementById("parea"); if (!el) return; const pw = window.open("", "_blank"); if (!pw) return; pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><title>" + order.modelNo + "</title><style>body{font-family:Arial;padding:24px;font-size:14px;direction:rtl}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #E2E8F0;padding:10px 12px;text-align:right}th{background:#F8FAFC;font-weight:700}img{max-width:140px;border-radius:10px}h1{font-size:22px;color:#1E40AF}</style></head><body>"); pw.document.write(el.innerHTML); pw.document.write("</body></html>"); pw.document.close(); pw.onload = () => { pw.focus(); pw.print(); }; };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: isMob ? 20 : 28, fontWeight: 800, margin: 0 }}>{"أمر تشغيل - "}<span style={{ color: "#1E40AF" }}>{order.modelNo}</span></h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn onClick={handlePrint} style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" }}>طباعة</Btn><Btn primary onClick={() => setEditing(true)}>تعديل</Btn><Btn ghost onClick={() => setSel(null)}>عودة</Btn></div>
      </div>
      <div id="parea">
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
          <Metric label="رقم الموديل" value={order.modelNo} borderColor="#3B82F6" /><Metric label="كمية القص (A)" value={t.cutQty} borderColor="#10B981" /><Metric label="تم التسليم" value={order.deliveredQty || 0} color="#059669" borderColor="#10B981" /><Metric label="الرصيد" value={t.balance} color={t.balance > 0 ? "#D97706" : "#059669"} borderColor={t.balance > 0 ? "#F59E0B" : "#10B981"} /><Metric label="تكلفة القطعة" value={t.costPer + " ج.م"} color="#1E40AF" borderColor="#3B82F6" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: order.image && !isMob ? "auto 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
          {order.image && <div style={{ width: isMob ? "100%" : 150 }}><img src={order.image} alt="" style={{ width: isMob ? "100%" : 150, height: 150, objectFit: "cover", borderRadius: 14, border: "1px solid var(--color-border-tertiary)" }} /></div>}
          <Card title="بيانات الموديل" borderColor="#3B82F6"><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><tbody>
            <tr><td style={TDL}>الوصف</td><td style={TDB}>{order.modelDesc}</td><td style={TDL}>المقاسات</td><td style={TD}>{order.sizeLabel}</td></tr>
            <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={order.workshop} onChange={(v) => upO((o) => { o.workshop = v; })}><option value="">-</option>{data.workshops.map((w, i) => <option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={order.status} onChange={(v) => upO((o) => { o.status = v; })}>{data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></td></tr>
          </tbody></table></div></Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : activeFabs.length >= 3 ? "1fr 1fr 1fr" : activeFabs.length === 2 ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 16 }}>
          {activeFabs.map((k) => { const colors = gc(order, k); if (colors.length === 0) return null; const dt = gdate(order, k); return (<div key={k}><FCTable label={"خامة " + k} fabName={gf(order, k, "Label")} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={() => {}} readOnly />{dt && <div style={{ fontSize: F - 2, color: "#94A3B8", marginTop: -8, marginBottom: 10 }}>{"تاريخ القص: " + dt}</div>}</div>); })}
        </div>
        <Card title={"تكلفة الخامات (كمية A = " + t.cutQty + ")"} borderColor="#10B981" style={{ marginBottom: 16 }}>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr>{["الخامة", "الوحدة", "سعر الوحدة", "استهلاك/راق", "الراقات", "القطع", "التكلفة الكلية", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {activeFabs.map((k) => { const cons = gcons(order, k); const price = gf(order, k, "Price") || 0; const layers = slay(gc(order, k)); const qty = sqty(gc(order, k)); const cost = cons * price * layers; const perPc = t.cutQty ? r2(cost / t.cutQty) : 0; return (<tr key={k}><td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: FCOL[FKEYS.indexOf(k)], marginLeft: 8 }} />{gf(order, k, "Label")}</td><td style={TD}>{gf(order, k, "Unit")}</td><td style={TD}>{price + " ج.م"}</td><td style={TD}><Inp type="number" step="any" value={order["cons" + k]} onChange={(v) => upO((o) => { o["cons" + k] = v; })} style={{ width: 80 }} /></td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={TDB}>{fmt(r2(cost)) + " ج.م"}</td><td style={TDB}>{perPc + " ج.م"}</td></tr>); })}
              {activeFabs.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#94A3B8" }}>لم يتم اختيار خامات</td></tr>}
              <tr style={{ background: "var(--color-background-secondary)" }}><td colSpan={6} style={{ ...TD, fontWeight: 700 }}>اجمالي تكلفة الخامات</td><td style={{ ...TD, fontWeight: 700 }}>{fmt(r2(t.totalFab)) + " ج.م"}</td><td style={{ ...TD, fontWeight: 800, color: "#1E40AF", fontSize: F + 2 }}>{t.fabPer + " ج.م"}</td></tr>
            </tbody>
          </table></div>
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card title="تكاليف الاكسسوار والتشغيل (من قاعدة البيانات)" borderColor="#F59E0B">
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}><thead><tr>{["", "الوصف", "الوحدة", "سعر الوحدة", "اجمالي"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {liveAcc.map((a, i) => <tr key={i} style={{ opacity: a.active ? 1 : 0.35 }}><td style={{ ...TD, width: 36 }}><input type="checkbox" checked={a.active} onChange={() => upO((o) => { if (!o.accCosts) o.accCosts = []; const ac = o.accCosts.find((x) => x.accId === a.accId); if (ac) ac.active = !ac.active; else o.accCosts.push({ ...a, active: true }); })} style={{ accentColor: "#1E40AF", width: 18, height: 18 }} /></td><td style={{ ...TD, fontWeight: 600 }}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}><Inp type="number" value={a.price} onChange={(v) => upO((o) => { const ac = (o.accCosts || []).find((x) => x.accId === a.accId); if (ac) ac.price = Number(v) || 0; })} style={{ width: 80 }} /></td><td style={TDB}>{a.active ? fmt(a.price * t.cutQty) + " ج.م" : "-"}</td></tr>)}
              <tr style={{ background: "var(--color-background-secondary)" }}><td colSpan={3} style={{ ...TD, fontWeight: 700 }}>اجمالي</td><td style={{ ...TD, fontWeight: 700 }}>{t.accPer + " ج.م/قطعة"}</td><td style={{ ...TD, fontWeight: 700 }}>{fmt(accAll) + " ج.م"}</td></tr>
            </tbody></table></div>
          </Card>
          <Card title="التسليمات" borderColor="#10B981" extra={<Btn primary small onClick={() => upO((o) => { if (!o.deliveries) o.deliveries = []; o.deliveries.push({ date: new Date().toISOString().split("T")[0], qty: 0, notes: "" }); })}>+ تسليم</Btn>}>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 350 }}><thead><tr>{["#", "التاريخ", "الكمية", "ملاحظات"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {(order.deliveries || []).map((d, i) => <tr key={i}><td style={TD}>{i + 1}</td><td style={TD}><Inp type="date" value={d.date} onChange={(v) => upO((o) => { o.deliveries[i].date = v; })} /></td><td style={TD}><Inp type="number" value={d.qty} onChange={(v) => upO((o) => { o.deliveries[i].qty = Number(v) || 0; o.deliveredQty = o.deliveries.reduce((s, x) => s + (Number(x.qty) || 0), 0); })} style={{ width: 80 }} /></td><td style={TD}><Inp value={d.notes} onChange={(v) => upO((o) => { o.deliveries[i].notes = v; })} /></td></tr>)}
              {(!order.deliveries || order.deliveries.length === 0) && <tr><td colSpan={4} style={{ ...TD, textAlign: "center", color: "#94A3B8" }}>لا توجد تسليمات</td></tr>}
            </tbody></table></div>
          </Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1.5fr", gap: 16, marginBottom: 16 }}>
          <Card title="توزيع التكاليف" borderColor="#8B5CF6">
            {costChartData.length > 0 ? (<ResponsiveContainer width="100%" height={200}><BarChart data={costChartData} layout="vertical" margin={{ left: 0, right: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis type="number" tick={{ fontSize: 12 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} /><Tooltip formatter={(v) => fmt(v) + " ج.م"} /><Bar dataKey="value" barSize={22} radius={[0, 6, 6, 0]}>{costChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar></BarChart></ResponsiveContainer>) : <p style={{ fontSize: F, color: "#94A3B8", textAlign: "center" }}>لا توجد تكاليف</p>}
          </Card>
          <Card title="ملخص تكلفة الموديل" accent="#1E40AF">
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: F + 1 }}><thead><tr>{["البند", "التكلفة الكلية", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              <tr><td style={TD}>تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab)) + " ج.م"}</td><td style={TDB}>{t.fabPer + " ج.م"}</td></tr>
              <tr><td style={TD}>تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll) + " ج.م"}</td><td style={TDB}>{t.accPer + " ج.م"}</td></tr>
              <tr style={{ background: "#EFF6FF" }}><td style={{ ...TD, fontWeight: 800, fontSize: F + 4, color: "#1E40AF" }}>الاجمالي</td><td style={{ ...TD, fontWeight: 800, fontSize: F + 4, color: "#1E40AF" }}>{fmt(r2(t.costAll)) + " ج.م"}</td><td style={{ ...TD, fontWeight: 800, fontSize: F + 6, color: "#1E40AF" }}>{t.costPer + " ج.م"}</td></tr>
            </tbody></table></div>
          </Card>
        </div>
        {order.instructions && <Card title="تعليمات التشغيل والملاحظات الفنية" borderColor="#8B5CF6"><div style={{ whiteSpace: "pre-wrap", fontSize: F + 1, lineHeight: 2, color: "#334155" }}>{order.instructions}</div></Card>}
      </div>
    </div>
  );
}

/* ════ COST ════ */
function CostPg({ data, isMob }) {
  return (
    <div>
      <h1 style={{ fontSize: isMob ? 22 : 28, fontWeight: 800, margin: "0 0 20px" }}>تقرير تكاليف الموديلات</h1>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}><Metric label="عدد الموديلات" value={data.orders.length} borderColor="#3B82F6" /><Metric label="اجمالي القص (A)" value={fmt(data.orders.reduce((s, o) => s + calcOrder(o).cutQty, 0))} borderColor="#10B981" /></div>
      <Card borderColor="#3B82F6"><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}><thead><tr>{["#", "موديل", "الوصف", "الكمية", "تسليم", "رصيد", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {data.orders.map((o, i) => { const c = calcOrder(o); return <tr key={o.id}><td style={TD}>{i + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TDB}>{c.cutQty}</td><td style={TD}>{o.deliveredQty || 0}</td><td style={{ ...TD, color: c.balance > 0 ? "#D97706" : "#059669", fontWeight: 700 }}>{c.balance}</td><td style={{ ...TDB, color: "#1E40AF", fontSize: F + 2 }}>{c.costPer + " ج.م"}</td></tr>; })}
        {data.orders.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد بيانات</td></tr>}
      </tbody></table></div></Card>
    </div>
  );
}

/* ════ REPORT ════ */
function RepPg({ data, isMob }) {
  const [filter, setFilter] = useState("الكل");
  const list = filter === "الكل" ? data.orders : data.orders.filter((o) => o.status === filter);
  const cutQ = list.reduce((s, o) => s + calcOrder(o).cutQty, 0);
  const delQ = list.reduce((s, o) => s + (o.deliveredQty || 0), 0);
  const comp = cutQ ? Math.round((delQ / cutQ) * 100) : 0;
  return (
    <div>
      <h1 style={{ fontSize: isMob ? 22 : 28, fontWeight: 800, margin: "0 0 20px" }}>تقرير قص وانتاج المصنع</h1>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <Metric label="كمية القص (A)" value={fmt(cutQ)} borderColor="#3B82F6" /><Metric label="تسليم مخزن" value={fmt(delQ)} borderColor="#10B981" /><Metric label="رصيد بالمصنع" value={fmt(cutQ - delQ)} borderColor="#F59E0B" />
        <div style={{ background: "var(--color-background-primary)", borderRadius: 14, padding: 20, border: "1px solid var(--color-border-tertiary)", borderRight: "4px solid #3B82F6" }}><div style={{ fontSize: F - 1, color: "#94A3B8", marginBottom: 6, fontWeight: 600 }}>معدل الانجاز</div><div style={{ fontSize: 28, fontWeight: 800, color: "#1E40AF" }}>{comp + "%"}</div><PBar value={comp} /></div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>{["الكل", ...data.statuses].map((s) => <Btn key={s} on={filter === s} small onClick={() => setFilter(s)}>{s}</Btn>)}</div>
      <Card borderColor="#3B82F6"><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}><thead><tr>{["#", "موديل", "الوصف", "الورشة", "كمية القص", "تسليم", "رصيد", "الحالة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {list.map((o, i) => { const c = calcOrder(o); return <tr key={o.id}><td style={TD}>{i + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.workshop || "-"}</td><td style={TDB}>{c.cutQty}</td><td style={TD}>{o.deliveredQty || 0}</td><td style={{ ...TD, color: c.balance > 0 ? "#D97706" : "#059669", fontWeight: 700 }}>{c.balance}</td><td style={TD}><Badge t={o.status} /></td></tr>; })}
        {list.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 40 }}>لا توجد بيانات</td></tr>}
      </tbody></table></div></Card>
    </div>
  );
}
