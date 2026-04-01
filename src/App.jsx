import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";

const FKEYS = ["A", "B", "C", "D", "E"];
const FCOL = ["#22D3EE", "#34D399", "#FBBF24", "#A78BFA", "#F87171"];
const CPAL = ["#22D3EE", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#2DD4BF", "#FB923C", "#F472B6"];
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
  "تم القص": "#22D3EE", "في التشغيل": "#FBBF24", "ملغي": "#F87171",
  "تشطيب وتعبئة": "#34D399", "تم الشحن": "#34D399", "شحن جزئي": "#FBBF24",
  "تشغيل خارجي": "#A78BFA", "في الغسيل": "#F472B6",
};
const D = {
  bg: "#0B1222", card: "#111C2E", cardL: "#162036", brd: "#1E3048",
  acc: "#22D3EE", accDim: "rgba(34,211,238,0.15)",
  txt: "#E2E8F0", dim: "#64748B", mut: "#475569",
  ok: "#34D399", warn: "#FBBF24", err: "#F87171",
};
const INIT_CONFIG = {
  fabrics: [
    { id: 1, name: "قماش شعييرات مازيراتي", unit: "كيلو", price: 170 },
    { id: 2, name: "قماش درببي مسحب ابيض", unit: "كيلو", price: 170 },
    { id: 3, name: "قماش بسكوته تيشرت", unit: "كيلو", price: 160 },
    { id: 4, name: "قماش كارس", unit: "متر", price: 0 },
    { id: 5, name: "جبردين خفيف", unit: "متر", price: 0 },
    { id: 6, name: "قماش كتان", unit: "", price: 0 },
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
  workshops: ["CLARK", "ورشة محمود", "ورشة عماد الدين", "المصنع", "ابو جاسم", "ورشه ماهر"],
  season: "WS26",
};

function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
function r2(n) { return Math.round((n || 0) * 100) / 100; }
function sqty(a) { return (a || []).reduce((s, c) => s + (Number(c.qty) || 0), 0); }
function slay(a) { return (a || []).reduce((s, c) => s + (Number(c.layers) || 0), 0); }
function setF(o, k, v) { const c = JSON.parse(JSON.stringify(o)); c[k] = v; return c; }
function gf(o, k, s) { return o["fabric" + k + (s || "")]; }
function gc(o, k) { return o["colors" + k] || []; }
function gcons(o, k) { return parseFloat(o["cons" + k]) || 0; }
function gdate(o, k) { return o["cutDate" + k] || ""; }
function useWin() { const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200); useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []); return w; }

function calcOrder(o) {
  const mainCut = sqty(gc(o, "A")) || o.cutQty || 0;
  let totalFab = 0;
  const fabPieces = [];
  FKEYS.forEach((k) => { if (!gf(o, k)) return; const cost = gcons(o, k) * (gf(o, k, "Price") || 0) * slay(gc(o, k)); totalFab += cost; fabPieces.push(mainCut ? r2(cost / mainCut) : 0); });
  const fabPer = fabPieces.reduce((s, v) => s + v, 0);
  const accPer = (o.accItems || []).reduce((s, a) => s + (a.price || 0), 0);
  return { cutQty: mainCut, totalFab, fabPer: r2(fabPer), accPer, accAll: accPer * mainCut, costPer: r2(fabPer + accPer), costAll: r2(totalFab + accPer * mainCut), balance: mainCut - (o.deliveredQty || 0) };
}

function mkOrder() {
  const o = { id: gid(), date: new Date().toISOString().split("T")[0], modelNo: "", modelDesc: "", sizeSetId: "", sizeLabel: "", workshop: "", status: "تم القص", cutQty: 0, deliveredQty: 0, accItems: [], deliveries: [], image: "", instructions: "" };
  FKEYS.forEach((k) => { o["fabric" + k] = ""; o["cons" + k] = 0; o["cutDate" + k] = ""; o["colors" + k] = k === "A" ? [{ color: "", colorHex: "", layers: 0, pcsPerLayer: 0, qty: 0 }] : []; o["fabric" + k + "Label"] = ""; o["fabric" + k + "Price"] = 0; o["fabric" + k + "Unit"] = ""; });
  return o;
}

/* ── UI Components (same dark theme) ── */
const FS = 15;
const TH = { textAlign: "right", padding: "12px 14px", fontSize: FS - 3, fontWeight: 600, color: D.dim, whiteSpace: "nowrap", borderBottom: "1px solid " + D.brd, background: D.cardL, textTransform: "uppercase", letterSpacing: "0.05em" };
const TD = { padding: "12px 14px", fontSize: FS, color: D.txt, borderBottom: "1px solid " + D.brd, verticalAlign: "middle" };
const TDB = { ...TD, fontWeight: 600 };
const TDL = { ...TD, color: D.dim, width: 100 };

function Badge({ t }) { const col = STY[t] || D.dim; return <span style={{ padding: "5px 14px", borderRadius: 8, fontSize: FS - 2, fontWeight: 600, background: col + "20", color: col, border: "1px solid " + col + "40" }}>{t}</span>; }
function Btn({ children, on, primary, danger, ghost, onClick, small, disabled, style: sx }) {
  let bg = D.card, fg = D.txt, bd = "1px solid " + D.brd;
  if (on || primary) { bg = D.acc; fg = "#0B1222"; bd = "none"; }
  if (danger) { bg = D.err + "20"; fg = D.err; bd = "1px solid " + D.err + "40"; }
  if (ghost) { bg = "transparent"; bd = "none"; fg = D.dim; }
  return <button onClick={onClick} disabled={disabled} style={{ padding: small ? "6px 14px" : "10px 22px", borderRadius: 10, fontSize: small ? FS - 2 : FS, fontWeight: 600, background: bg, color: fg, border: bd, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1, ...(sx || {}) }}>{children}</button>;
}
function Inp({ value, onChange, placeholder, type, step, style: sx, readOnly }) {
  return <input type={type || "text"} step={step || "any"} value={value == null ? "" : value} readOnly={readOnly} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid " + D.brd, fontSize: FS, fontFamily: "inherit", background: readOnly ? D.cardL : D.card, color: D.txt, boxSizing: "border-box", outline: "none", ...(sx || {}) }} />;
}
function Sel({ value, onChange, children }) {
  return <select value={value == null ? "" : value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid " + D.brd, fontSize: FS, fontFamily: "inherit", background: D.card, color: D.txt, boxSizing: "border-box" }}>{children}</select>;
}
function Card({ children, title, extra, accent, style: sx }) {
  return (<div style={{ background: D.card, borderRadius: 14, border: "1px solid " + D.brd, overflow: "visible", ...(sx || {}) }}>
    {(title || extra) && <div style={{ padding: "14px 20px", borderBottom: "1px solid " + D.brd, display: "flex", justifyContent: "space-between", alignItems: "center", background: accent || D.cardL, borderRadius: "14px 14px 0 0" }}><span style={{ fontSize: FS + 1, fontWeight: 700, color: accent ? "#fff" : D.acc }}>{title}</span>{extra}</div>}
    <div style={{ padding: 20 }}>{children}</div>
  </div>);
}
function Metric({ label, value, color, icon }) {
  return (<div style={{ background: D.card, borderRadius: 14, padding: "18px 20px", border: "1px solid " + D.brd, display: "flex", alignItems: "center", gap: 14 }}>
    {icon && <div style={{ width: 44, height: 44, borderRadius: 10, background: (color || D.acc) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>}
    <div><div style={{ fontSize: FS - 2, color: D.dim, marginBottom: 4, fontWeight: 500 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 700, color: color || D.txt }}>{value}</div></div>
  </div>);
}
function PBar({ value }) { return <div style={{ height: 8, borderRadius: 4, background: D.brd, overflow: "hidden", marginTop: 8 }}><div style={{ height: "100%", width: Math.min(value, 100) + "%", borderRadius: 4, background: D.acc }} /></div>; }

function ColorPicker({ value, colorHex, onSelect }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState(value || "");
  useEffect(() => { setTxt(value || ""); }, [value]);
  return (<div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
    <div onClick={() => setOpen(!open)} style={{ width: 30, height: 30, borderRadius: 8, border: "2px solid " + D.brd, background: colorHex || D.cardL, cursor: "pointer", flexShrink: 0 }} />
    <input value={txt} onChange={(e) => { setTxt(e.target.value); const f = COLORS_DB.find((c) => c.n === e.target.value); onSelect(e.target.value, f ? f.h : colorHex || "#ccc"); }} placeholder="اكتب اللون" style={{ width: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid " + D.brd, fontSize: FS - 1, fontFamily: "inherit", background: D.card, color: D.txt }} />
    {open && <div style={{ position: "fixed", zIndex: 9999, background: D.card, border: "1px solid " + D.brd, borderRadius: 14, padding: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", width: 280 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>{COLORS_DB.map((c) => <div key={c.h} onClick={() => { onSelect(c.n, c.h); setTxt(c.n); setOpen(false); }} title={c.n} style={{ width: 38, height: 38, borderRadius: 8, background: c.h, cursor: "pointer", border: colorHex === c.h ? "3px solid " + D.acc : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: c.h === "#FFFFFF" ? "#666" : "#fff", fontWeight: 600 }}>{c.n}</div>)}</div>
      <div onClick={() => setOpen(false)} style={{ marginTop: 10, textAlign: "center", fontSize: FS, color: D.acc, cursor: "pointer", fontWeight: 700 }}>اغلاق</div>
    </div>}
  </div>);
}

function FCTable({ label, fabName, colors, setColors, accent, readOnly }) {
  const tQ = sqty(colors); const tL = slay(colors);
  const addC = () => setColors([...colors, { color: "", colorHex: "", layers: 0, pcsPerLayer: 0, qty: 0 }]);
  const upC = (i, fld, val) => { const nc = colors.map((c, j) => { if (j !== i) return c; const u = { ...c }; u[fld] = (fld === "color" || fld === "colorHex") ? val : (Number(val) || 0); if (fld === "layers" || fld === "pcsPerLayer") u.qty = (Number(u.layers) || 0) * (Number(u.pcsPerLayer) || 0); return u; }); setColors(nc); };
  return (<div style={{ border: "1px solid " + D.brd, borderRadius: 12, overflow: "visible", marginBottom: 12 }}>
    <div style={{ padding: "10px 16px", background: accent, display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontSize: FS, fontWeight: 700, color: "#fff" }}>{label + ": " + (fabName || "")}</span>
      <div style={{ display: "flex", gap: 8 }}><span style={{ fontSize: FS - 2, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "4px 14px", borderRadius: 20, fontWeight: 600 }}>{"راقات: " + tL}</span><span style={{ fontSize: FS - 2, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "4px 14px", borderRadius: 20, fontWeight: 600 }}>{"قطع: " + tQ}</span></div>
    </div>
    <div style={{ padding: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 450 }}>
        <thead><tr><th style={{ ...TH, background: "transparent" }}>اللون</th><th style={{ ...TH, background: "transparent" }}>الراقات</th><th style={{ ...TH, background: "transparent" }}>القطع/راق</th><th style={{ ...TH, background: "transparent" }}>الكمية</th>{!readOnly && <th style={{ ...TH, background: "transparent" }}> </th>}</tr></thead>
        <tbody>{colors.map((c, i) => (<tr key={i}>
          <td style={{ ...TD, minWidth: 160, overflow: "visible" }}>{readOnly ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: 6, background: c.colorHex || D.brd, border: "1px solid " + D.brd, flexShrink: 0 }} /><span>{c.color || "-"}</span></div> : <ColorPicker value={c.color} colorHex={c.colorHex} onSelect={(nm, hx) => { const nc = colors.map((cc, jj) => jj === i ? { ...cc, color: nm, colorHex: hx } : cc); setColors(nc); }} />}</td>
          <td style={{ ...TD, width: 100 }}>{readOnly ? c.layers : <Inp type="number" value={c.layers} onChange={(v) => upC(i, "layers", v)} />}</td>
          <td style={{ ...TD, width: 100 }}>{readOnly ? (c.pcsPerLayer || "-") : <Inp type="number" value={c.pcsPerLayer} onChange={(v) => upC(i, "pcsPerLayer", v)} />}</td>
          <td style={{ ...TDB, width: 80, background: D.cardL, textAlign: "center", color: D.acc }}>{c.qty}</td>
          {!readOnly && <td style={{ ...TD, width: 40 }}><Btn danger small onClick={() => setColors(colors.filter((_, j) => j !== i))}>x</Btn></td>}
        </tr>))}</tbody>
      </table>
      {!readOnly && <Btn ghost small onClick={addC} style={{ marginTop: 6, color: accent }}>+ لون جديد</Btn>}
    </div>
  </div>);
}

function AccPicker({ accItems, dbAcc, onChange }) {
  const [selId, setSelId] = useState("");
  const available = dbAcc.filter((a) => !accItems.find((x) => x.accId === a.id));
  const addAcc = () => { if (!selId) return; const acc = dbAcc.find((a) => a.id === Number(selId)); if (!acc) return; onChange([...accItems, { accId: acc.id, name: acc.name, unit: acc.unit, price: acc.price }]); setSelId(""); };
  return (<div>
    <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}><Sel value={selId} onChange={setSelId}><option value="">-- اختر بند اكسسوار --</option>{available.map((a) => <option key={a.id} value={a.id}>{a.name + " - " + a.price + " ج.م"}</option>)}</Sel></div>
      <Btn primary onClick={addAcc}>+ اضافة</Btn>
    </div>
    {accItems.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><thead><tr>{["الوصف", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {accItems.map((a, i) => <tr key={i}><td style={{ ...TD, fontWeight: 600 }}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}><Inp type="number" value={a.price} onChange={(v) => { const n = [...accItems]; n[i] = { ...n[i], price: Number(v) || 0 }; onChange(n); }} style={{ width: 90 }} /></td><td style={TD}><Btn danger small onClick={() => onChange(accItems.filter((_, j) => j !== i))}>x</Btn></td></tr>)}
    </tbody></table></div>}
  </div>);
}

/* ════ LOGIN ════ */
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [isReg, setIsReg] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !pass) { setErr("ادخل الايميل وكلمة المرور"); return; }
    setLoading(true); setErr("");
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch (e) { setErr(e.code === "auth/invalid-credential" ? "بيانات الدخول غلط" : e.code === "auth/user-not-found" ? "المستخدم غير موجود" : "خطأ: " + e.message); }
    setLoading(false);
  };

  const handleReg = async () => {
    if (!email || !pass || !name) { setErr("اكمل كل البيانات"); return; }
    if (pass.length < 6) { setErr("كلمة المرور لازم 6 حروف على الأقل"); return; }
    setLoading(true); setErr("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
    } catch (e) { setErr(e.code === "auth/email-already-in-use" ? "الايميل مستخدم" : "خطأ: " + e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: D.bg, direction: "rtl", fontFamily: "var(--font-sans)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: D.card, borderRadius: 24, padding: 40, border: "1px solid " + D.brd }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: D.acc, letterSpacing: 8 }}>CLARK</div>
          <div style={{ fontSize: FS, color: D.dim, marginTop: 6 }}>نظام ادارة القص والتشغيل</div>
          <div style={{ fontSize: FS - 2, color: D.ok, marginTop: 4, padding: "4px 12px", background: D.ok + "15", borderRadius: 20, display: "inline-block" }}>النسخة الأونلاين - بيانات مشتركة</div>
        </div>

        {!isReg ? (<div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: FS, color: D.dim, marginBottom: 6, fontWeight: 600 }}>البريد الالكتروني</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" type="email" onKeyDown={(e) => e.key === "Enter" && handleLogin()} style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid " + D.brd, fontSize: FS + 1, fontFamily: "inherit", boxSizing: "border-box", background: D.cardL, color: D.txt, outline: "none" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: FS, color: D.dim, marginBottom: 6, fontWeight: 600 }}>كلمة المرور</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="كلمة المرور" onKeyDown={(e) => e.key === "Enter" && handleLogin()} style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid " + D.brd, fontSize: FS + 1, fontFamily: "inherit", boxSizing: "border-box", background: D.cardL, color: D.txt, outline: "none" }} />
          </div>
          {err && <div style={{ color: D.err, fontSize: FS, marginBottom: 12, textAlign: "center", fontWeight: 600 }}>{err}</div>}
          <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: 16, borderRadius: 12, background: D.acc, color: "#0B1222", fontSize: FS + 2, fontWeight: 800, border: "none", cursor: "pointer", marginBottom: 14, opacity: loading ? 0.6 : 1 }}>{loading ? "جاري الدخول..." : "تسجيل الدخول"}</button>
          <div style={{ textAlign: "center" }}><span style={{ fontSize: FS, color: D.dim }}>مستخدم جديد؟ </span><span onClick={() => { setIsReg(true); setErr(""); }} style={{ fontSize: FS, color: D.acc, cursor: "pointer", fontWeight: 700 }}>انشاء حساب</span></div>
        </div>) : (<div>
          <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: FS, color: D.dim, marginBottom: 6, fontWeight: 600 }}>الاسم</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid " + D.brd, fontSize: FS + 1, fontFamily: "inherit", boxSizing: "border-box", background: D.cardL, color: D.txt }} /></div>
          <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: FS, color: D.dim, marginBottom: 6, fontWeight: 600 }}>البريد الالكتروني</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" type="email" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid " + D.brd, fontSize: FS + 1, fontFamily: "inherit", boxSizing: "border-box", background: D.cardL, color: D.txt }} /></div>
          <div style={{ marginBottom: 20 }}><label style={{ display: "block", fontSize: FS, color: D.dim, marginBottom: 6, fontWeight: 600 }}>كلمة المرور (6 حروف على الأقل)</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="كلمة المرور" style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid " + D.brd, fontSize: FS + 1, fontFamily: "inherit", boxSizing: "border-box", background: D.cardL, color: D.txt }} /></div>
          {err && <div style={{ color: D.err, fontSize: FS, marginBottom: 12, textAlign: "center" }}>{err}</div>}
          <button onClick={handleReg} disabled={loading} style={{ width: "100%", padding: 16, borderRadius: 12, background: D.acc, color: "#0B1222", fontSize: FS + 2, fontWeight: 800, border: "none", cursor: "pointer", marginBottom: 14, opacity: loading ? 0.6 : 1 }}>{loading ? "جاري الانشاء..." : "انشاء حساب"}</button>
          <div style={{ textAlign: "center" }}><span onClick={() => { setIsReg(false); setErr(""); }} style={{ fontSize: FS, color: D.acc, cursor: "pointer", fontWeight: 700 }}>عودة لتسجيل الدخول</span></div>
        </div>)}
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

/* ════ MAIN APP ════ */
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [config, setConfig] = useState(INIT_CONFIG);
  const [orders, setOrders] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [sel, setSel] = useState(null);
  const [sideOpen, setSideOpen] = useState(true);
  const w = useWin();
  const isMob = w < 768;

  /* Firebase Auth listener */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  /* Firestore real-time listeners */
  useEffect(() => {
    if (!user) return;
    const unsub1 = onSnapshot(doc(db, "factory", "config"), (snap) => {
      if (snap.exists()) setConfig(snap.data());
      else setDoc(doc(db, "factory", "config"), INIT_CONFIG);
    });
    const unsub2 = onSnapshot(collection(db, "orders"), (snap) => {
      setOrders(snap.docs.map((d) => ({ _docId: d.id, ...d.data() })));
      setDataLoading(false);
    });
    return () => { unsub1(); unsub2(); };
  }, [user]);

  useEffect(() => { if (isMob) setSideOpen(false); }, [isMob]);

  /* Config update function (replaces the old `up` for config data) */
  const upConfig = useCallback((fn) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      setDoc(doc(db, "factory", "config"), next);
      return next;
    });
  }, []);

  /* Order functions */
  const addOrder = async (order) => { await addDoc(collection(db, "orders"), order); };
  const updOrder = async (orderId, fn) => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return;
    const updated = JSON.parse(JSON.stringify(ord));
    fn(updated);
    const docId = ord._docId;
    const clean = { ...updated };
    delete clean._docId;
    await updateDoc(doc(db, "orders", docId), clean);
  };
  const delOrder = async (orderId) => {
    const ord = orders.find((o) => o.id === orderId);
    if (ord) await deleteDoc(doc(db, "orders", ord._docId));
  };
  const replaceOrder = async (orderId, newData) => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return;
    const clean = { ...newData };
    delete clean._docId;
    await setDoc(doc(db, "orders", ord._docId), clean);
  };

  const goD = (id) => { setSel(id); setTab("details"); if (isMob) setSideOpen(false); };
  const handleLogout = () => signOut(auth);

  /* Build unified data object for components */
  const data = { ...config, orders };

  if (authLoading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: D.bg, color: D.acc, fontSize: 20, fontWeight: 700, fontFamily: "var(--font-sans)" }}>جاري التحميل...</div>;
  if (!user) return <LoginScreen />;
  if (dataLoading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: D.bg, color: D.acc, fontSize: 20, fontWeight: 700, fontFamily: "var(--font-sans)", direction: "rtl" }}>جاري تحميل البيانات...</div>;

  const userName = user.displayName || user.email.split("@")[0];

  return (
    <div style={{ display: "flex", minHeight: "100vh", direction: "rtl", fontFamily: "var(--font-sans)", background: D.bg, color: D.txt, fontSize: FS }}>
      {isMob && sideOpen && <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 998 }} />}
      <nav style={{ width: isMob ? (sideOpen ? 260 : 0) : (sideOpen ? 220 : 56), background: D.card, borderLeft: "1px solid " + D.brd, flexShrink: 0, display: "flex", flexDirection: "column", transition: "width 0.3s", overflow: "hidden", position: isMob ? "fixed" : "relative", right: 0, top: 0, bottom: 0, zIndex: 999 }}>
        <div style={{ padding: "20px 18px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid " + D.brd }}>
          {sideOpen && <div><div style={{ fontWeight: 800, fontSize: 24, color: D.acc, letterSpacing: 4 }}>CLARK</div><div style={{ fontSize: 9, color: D.mut, marginTop: 2 }}>ONLINE - بيانات مشتركة</div></div>}
          <div onClick={() => setSideOpen(!sideOpen)} style={{ cursor: "pointer", color: D.acc, fontSize: 22, padding: 4 }}>{"☰"}</div>
        </div>
        {sideOpen && <div style={{ padding: "8px 10px", flex: 1 }}>
          {TABS.map((t) => <button key={t.key} onClick={() => { setTab(t.key); if (isMob) setSideOpen(false); }} style={{ display: "block", width: "100%", textAlign: "right", padding: "14px 16px", border: "none", cursor: "pointer", borderRadius: 10, marginBottom: 2, background: tab === t.key ? D.accDim : "transparent", color: tab === t.key ? D.acc : D.dim, fontSize: FS, fontWeight: tab === t.key ? 700 : 400, fontFamily: "inherit" }}>{t.label}</button>)}
        </div>}
        {sideOpen && <div style={{ padding: "14px 18px", borderTop: "1px solid " + D.brd }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 11, color: D.mut }}>{"مرحبا، " + userName}</div><div style={{ fontSize: 16, fontWeight: 700, color: D.acc }}>{data.season}</div></div>
            <button onClick={handleLogout} style={{ padding: "6px 14px", borderRadius: 8, background: D.err + "20", color: D.err, border: "1px solid " + D.err + "40", cursor: "pointer", fontSize: FS - 2, fontWeight: 600 }}>خروج</button>
          </div>
        </div>}
      </nav>
      <main style={{ flex: 1, padding: isMob ? 14 : 24, overflow: "auto", minWidth: 0 }}>
        {isMob && !sideOpen && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div onClick={() => setSideOpen(true)} style={{ cursor: "pointer", fontSize: 24, color: D.acc }}>{"☰"}</div><span style={{ fontSize: FS, color: D.dim, fontWeight: 600 }}>{TABS.find((t) => t.key === tab)?.label}</span><span style={{ fontSize: 12, color: D.mut }}>{userName}</span></div>}

        {tab === "dashboard" && <DashPg data={data} goD={goD} isMob={isMob} />}
        {tab === "db" && <DBPg data={data} upConfig={upConfig} isMob={isMob} />}
        {tab === "orders" && <OrdPg data={data} addOrder={addOrder} delOrder={delOrder} goD={goD} isMob={isMob} />}
        {tab === "details" && <DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} sel={sel} setSel={setSel} isMob={isMob} />}
        {tab === "cost" && <CostPg data={data} isMob={isMob} />}
        {tab === "report" && <RepPg data={data} isMob={isMob} />}
      </main>
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function DashPg({ data, goD, isMob }) {
  const orders = data.orders;
  const cutQ = orders.reduce((s, o) => s + calcOrder(o).cutQty, 0);
  const delQ = orders.reduce((s, o) => s + (o.deliveredQty || 0), 0);
  const comp = cutQ ? Math.round((delQ / cutQ) * 100) : 0;
  const inP = orders.filter((o) => o.status === "في التشغيل" || o.status === "تشغيل خارجي").length;
  const sc = {}; orders.forEach((o) => { sc[o.status] = (sc[o.status] || 0) + 1; });
  const pieData = Object.entries(sc).map(([name, value]) => ({ name, value }));
  const costData = orders.slice(-8).map((o) => { const t = calcOrder(o); return { name: String(o.modelNo).slice(-5), fab: t.fabPer, acc: t.accPer }; });
  const recent = orders.slice().reverse().slice(0, 5);

  return (<div>
    <h1 style={{ fontSize: isMob ? 22 : 30, fontWeight: 800, margin: "0 0 24px" }}>{"ORDERS REPORT - " + data.season}</h1>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
      <Metric label="عدد الموديلات" value={orders.length} icon="📦" color={D.acc} />
      <Metric label="اجمالي القص" value={fmt(cutQ)} icon="✂️" color={D.ok} />
      <Metric label="تم التسليم" value={fmt(delQ)} icon="📥" color={D.ok} />
      <Metric label="تحت التشغيل" value={inP} icon="⚙️" color={D.warn} />
    </div>
    <div style={{ background: D.card, borderRadius: 14, padding: 20, border: "1px solid " + D.brd, marginBottom: 24 }}>
      <div style={{ fontSize: FS, color: D.dim, marginBottom: 8, fontWeight: 600 }}>معدل الانجاز</div>
      <div style={{ fontSize: 36, fontWeight: 800, color: D.acc }}>{comp + "%"}</div>
      <PBar value={comp} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 24 }}>
      <Card title="توزيع الحالات">{pieData.length > 0 ? (<div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <ResponsiveContainer width={isMob ? "100%" : 160} height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3} dataKey="value" stroke="none">{pieData.map((_, i) => <Cell key={i} fill={CPAL[i % CPAL.length]} />)}</Pie><Tooltip contentStyle={{ background: D.card, border: "1px solid " + D.brd, borderRadius: 8, color: D.txt }} /></PieChart></ResponsiveContainer>
        <div style={{ flex: 1, minWidth: 120 }}>{pieData.map((d, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: FS }}><span style={{ width: 12, height: 12, borderRadius: 4, background: CPAL[i % CPAL.length], flexShrink: 0 }} /><span style={{ color: D.dim, flex: 1 }}>{d.name}</span><span style={{ fontWeight: 700 }}>{d.value}</span></div>)}</div>
      </div>) : <p style={{ color: D.dim, textAlign: "center", padding: 30 }}>لا توجد بيانات</p>}</Card>
      <Card title="تكلفة القطعة">{costData.length > 0 ? (<ResponsiveContainer width="100%" height={180}><BarChart data={costData}><CartesianGrid strokeDasharray="3 3" stroke={D.brd} /><XAxis dataKey="name" tick={{ fontSize: 11, fill: D.dim }} /><YAxis tick={{ fontSize: 11, fill: D.dim }} /><Tooltip contentStyle={{ background: D.card, border: "1px solid " + D.brd, color: D.txt }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="fab" name="خامات" fill={D.ok} stackId="a" barSize={22} /><Bar dataKey="acc" name="تشغيل" fill={D.warn} stackId="a" barSize={22} /></BarChart></ResponsiveContainer>) : <p style={{ color: D.dim, textAlign: "center", padding: 30 }}>لا توجد بيانات</p>}</Card>
    </div>
    <Card title="آخر الأوامر"><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 550 }}>
      <thead><tr>{["#", "موديل", "الوصف", "الكمية", "الرصيد", "الحالة", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{recent.map((o) => { const t = calcOrder(o); return (<tr key={o.id} style={{ cursor: "pointer" }} onClick={() => goD(o.id)}><td style={TD}>{orders.indexOf(o) + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{ ...TDB, color: D.acc }}>{t.cutQty}</td><td style={{ ...TD, color: t.balance > 0 ? D.warn : D.ok, fontWeight: 700 }}>{t.balance}</td><td style={TD}><Badge t={o.status} /></td><td style={TD}><Btn ghost small>عرض</Btn></td></tr>); })}
        {recent.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: D.dim, padding: 40 }}>لا توجد أوامر بعد</td></tr>}
      </tbody>
    </table></div></Card>
  </div>);
}

/* ═══ DB ═══ */
function DBPg({ data, upConfig, isMob }) {
  const [sub, setSub] = useState("fab");
  const [ff, setFf] = useState({ name: "", unit: "كيلو", price: "" });
  const [af, setAf] = useState({ name: "", unit: "قطعة", price: "" });
  const [sfld, setSfld] = useState({ label: "" });
  const [wf, setWf] = useState("");
  return (<div>
    <h1 style={{ fontSize: isMob ? 22 : 30, fontWeight: 800, margin: "0 0 20px" }}>قاعدة البيانات</h1>
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>{[["fab", "الأقمشة"], ["acc", "الاكسسوار"], ["size", "المقاسات"], ["ws", "الورش"]].map(([k, l]) => <Btn key={k} on={sub === k} onClick={() => setSub(k)}>{l}</Btn>)}</div>
    {sub === "fab" && <Card title="جدول الأقمشة"><div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "3fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}><Inp value={ff.name} onChange={(v) => setFf({ ...ff, name: v })} placeholder="اسم القماش" /><Sel value={ff.unit} onChange={(v) => setFf({ ...ff, unit: v })}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel><Inp value={ff.price} onChange={(v) => setFf({ ...ff, price: v })} placeholder="السعر" type="number" /><Btn primary onClick={() => { if (!ff.name) return; upConfig((d) => d.fabrics.push({ id: Date.now(), name: ff.name, unit: ff.unit, price: Number(ff.price) || 0 })); setFf({ name: "", unit: "كيلو", price: "" }); }}>+ اضافة</Btn></div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 450 }}><thead><tr>{["#", "القماش", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f, i) => <tr key={f.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 600 }}>{f.name}</td><td style={TD}>{f.unit}</td><td style={{ ...TDB, color: D.acc }}>{f.price + " ج.م"}</td><td style={TD}><Btn danger small onClick={() => upConfig((d) => { d.fabrics = d.fabrics.filter((x) => x.id !== f.id); })}>حذف</Btn></td></tr>)}</tbody></table></div></Card>}
    {sub === "acc" && <Card title="الاكسسوار والتكاليف"><div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "3fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}><Inp value={af.name} onChange={(v) => setAf({ ...af, name: v })} placeholder="الوصف" /><Sel value={af.unit} onChange={(v) => setAf({ ...af, unit: v })}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel><Inp value={af.price} onChange={(v) => setAf({ ...af, price: v })} placeholder="السعر" type="number" /><Btn primary onClick={() => { if (!af.name) return; upConfig((d) => d.accessories.push({ id: Date.now(), name: af.name, unit: af.unit, price: Number(af.price) || 0 })); setAf({ name: "", unit: "قطعة", price: "" }); }}>+ اضافة</Btn></div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><thead><tr>{["#", "الوصف", "الوحدة", "السعر", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a, i) => <tr key={a.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 600 }}>{a.name}</td><td style={TD}>{a.unit}</td><td style={{ ...TDB, color: D.acc }}>{a.price + " ج.م"}</td><td style={TD}><Btn danger small onClick={() => upConfig((d) => { d.accessories = d.accessories.filter((x) => x.id !== a.id); })}>حذف</Btn></td></tr>)}</tbody></table></div></Card>}
    {sub === "size" && <Card title="المقاسات"><div style={{ display: "grid", gridTemplateColumns: "3fr auto", gap: 10, marginBottom: 16 }}><Inp value={sfld.label} onChange={(v) => setSfld({ label: v })} placeholder="المقاسات" /><Btn primary onClick={() => { if (!sfld.label) return; upConfig((d) => d.sizeSets.push({ id: Date.now(), label: sfld.label })); setSfld({ label: "" }); }}>+ اضافة</Btn></div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["#", "المقاسات", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s, i) => <tr key={s.id}><td style={TD}>{i + 1}</td><td style={{ ...TD, fontWeight: 600 }}>{s.label}</td><td style={TD}><Btn danger small onClick={() => upConfig((d) => { d.sizeSets = d.sizeSets.filter((x) => x.id !== s.id); })}>حذف</Btn></td></tr>)}</tbody></table></div></Card>}
    {sub === "ws" && <Card title="الورش"><div style={{ display: "grid", gridTemplateColumns: "3fr auto", gap: 10, marginBottom: 16 }}><Inp value={wf} onChange={setWf} placeholder="اسم الورشة" /><Btn primary onClick={() => { if (!wf.trim()) return; upConfig((d) => d.workshops.push(wf.trim())); setWf(""); }}>+ اضافة</Btn></div><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{data.workshops.map((w, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: "1px solid " + D.brd, fontSize: FS, fontWeight: 600, background: D.cardL }}>{w}<span onClick={() => upConfig((d) => { d.workshops.splice(i, 1); })} style={{ cursor: "pointer", color: D.err, fontWeight: 800 }}>x</span></span>)}</div></Card>}
  </div>);
}

/* ═══ ORDER FORM ═══ */
function OrdForm({ data, initial, onSave, onCancel, isMob }) {
  const [form, setForm] = useState(initial);
  const fabObj = (id) => data.fabrics.find((x) => x.id === Number(id));
  const handleImg = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setForm((p) => ({ ...p, image: ev.target.result })); r.readAsDataURL(f); };
  const mainQty = sqty(form.colorsA);
  const updF = (key, val) => setForm((p) => setF(p, key, val));
  const save = () => {
    if (!form.modelNo || !form.sizeSetId) return;
    const ss = data.sizeSets.find((s) => s.id === Number(form.sizeSetId));
    const o = { ...form, cutQty: mainQty, sizeLabel: ss ? ss.label : "" };
    FKEYS.forEach((k) => { const fb = fabObj(o["fabric" + k]); o["fabric" + k + "Label"] = fb ? (fb.name + " - " + fb.unit) : ""; o["fabric" + k + "Price"] = fb ? fb.price : 0; o["fabric" + k + "Unit"] = fb ? fb.unit : ""; });
    delete o._docId;
    onSave(o);
  };
  return (
    <Card title={initial.modelNo ? "تعديل الأوردر" : "أمر قص جديد"} accent="#0E7490" style={{ marginBottom: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "auto 1fr", gap: 16, marginBottom: 20 }}>
        <div><div style={{ width: isMob ? "100%" : 140, height: 140, borderRadius: 14, border: "2px dashed " + D.brd, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: D.cardL, cursor: "pointer", position: "relative" }}>{form.image ? <img src={form.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: FS, color: D.dim }}>صورة الموديل</span>}<input type="file" accept="image/*" onChange={handleImg} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} /></div></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><tbody>
          <tr><td style={TDL}>رقم الموديل</td><td style={TD}><Inp value={form.modelNo} onChange={(v) => updF("modelNo", v)} /></td><td style={TDL}>الوصف</td><td style={TD}><Inp value={form.modelDesc} onChange={(v) => updF("modelDesc", v)} /></td></tr>
          <tr><td style={TDL}>المقاسات</td><td style={TD}><Sel value={form.sizeSetId} onChange={(v) => updF("sizeSetId", v)}><option value="">-- اختر --</option>{data.sizeSets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Sel></td><td style={TDL}>التاريخ</td><td style={TD}><Inp type="date" value={form.date} onChange={(v) => updF("date", v)} /></td></tr>
          <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={form.workshop} onChange={(v) => updF("workshop", v)}><option value="">-- اختر --</option>{data.workshops.map((w, i) => <option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={form.status} onChange={(v) => updF("status", v)}>{data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></td></tr>
        </tbody></table></div>
      </div>
      {FKEYS.map((k, idx) => { const fid = form["fabric" + k]; const fb = fabObj(fid); return (<div key={k}>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, minWidth: 500 }}><tbody><tr>
          <td style={{ ...TDL, fontWeight: 700 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: FCOL[idx], marginLeft: 6 }} />{"خامة " + k}</td>
          <td style={TD}><Sel value={fid} onChange={(v) => updF("fabric" + k, v)}><option value="">-- اختياري --</option>{data.fabrics.map((f) => <option key={f.id} value={f.id}>{f.name + " - " + f.price + " ج.م/" + f.unit}</option>)}</Sel></td>
          <td style={{ ...TDL, width: 80 }}>استهلاك/راق</td><td style={{ ...TD, width: 100 }}><Inp type="number" step="any" value={form["cons" + k]} onChange={(v) => updF("cons" + k, v)} /></td>
          <td style={{ ...TDL, width: 80 }}>تاريخ القص</td><td style={{ ...TD, width: 130 }}><Inp type="date" value={form["cutDate" + k] || ""} onChange={(v) => updF("cutDate" + k, v)} /></td>
        </tr></tbody></table></div>
        {fid && <FCTable label={"خامة " + k} fabName={fb ? fb.name : ""} accent={FCOL[idx]} colors={form["colors" + k] || []} setColors={(c) => updF("colors" + k, c)} />}
      </div>); })}
      <div style={{ marginBottom: 16 }}><div style={{ fontSize: FS, fontWeight: 700, color: D.acc, marginBottom: 10 }}>بنود الاكسسوار والتشغيل</div><AccPicker accItems={form.accItems || []} dbAcc={data.accessories} onChange={(items) => updF("accItems", items)} /></div>
      <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: FS, color: D.dim, marginBottom: 6, fontWeight: 600 }}>تعليمات التشغيل</label><textarea value={form.instructions || ""} onChange={(e) => updF("instructions", e.target.value)} placeholder="تعليمات التشغيل..." style={{ width: "100%", height: 100, padding: 14, borderRadius: 12, border: "1px solid " + D.brd, fontSize: FS, fontFamily: "inherit", background: D.cardL, color: D.txt, boxSizing: "border-box", resize: "vertical" }} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid " + D.brd, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{"كمية القص (A): "}<span style={{ color: D.acc }}>{mainQty}</span></div>
        <div style={{ display: "flex", gap: 10 }}><Btn ghost onClick={onCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ</Btn></div>
      </div>
    </Card>
  );
}

/* ═══ ORDERS ═══ */
function OrdPg({ data, addOrder, delOrder, goD, isMob }) {
  const [show, setShow] = useState(false);
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}><h1 style={{ fontSize: isMob ? 22 : 30, fontWeight: 800, margin: 0 }}>أوامر القص</h1><Btn primary onClick={() => setShow(!show)}>{show ? "الغاء" : "+ أمر قص جديد"}</Btn></div>
    {show && <OrdForm data={data} initial={mkOrder()} onSave={(o) => { addOrder(o); setShow(false); }} onCancel={() => setShow(false)} isMob={isMob} />}
    <Card title={"جميع الأوامر (" + data.orders.length + ")"}>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
        <thead><tr>{["#", "التاريخ", "موديل", "الوصف", "الكمية", "الحالة", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{data.orders.map((o, i) => { const t = calcOrder(o); return (<tr key={o.id}><td style={TD}>{i + 1}</td><td style={TD}>{o.date}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{ ...TDB, color: D.acc }}>{t.cutQty}</td><td style={TD}><Badge t={o.status} /></td><td style={{ ...TD, whiteSpace: "nowrap" }}><Btn ghost small onClick={() => goD(o.id)}>تفاصيل</Btn>{" "}<Btn danger small onClick={() => delOrder(o.id)}>حذف</Btn></td></tr>); })}
          {data.orders.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: D.dim, padding: 40 }}>لا توجد أوامر</td></tr>}
        </tbody>
      </table></div>
    </Card>
  </div>);
}

/* ═══ DETAILS ═══ */
function DetPg({ data, updOrder, replaceOrder, sel, setSel, isMob }) {
  const order = data.orders.find((o) => o.id === sel);
  const [editing, setEditing] = useState(false);

  if (!order) return (<div><h1 style={{ fontSize: isMob ? 22 : 30, fontWeight: 800, margin: "0 0 20px" }}>تفاصيل الأوردر</h1><Card title="اختر أوردر"><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{data.orders.map((o) => <Btn key={o.id} onClick={() => setSel(o.id)} style={{ padding: "14px 20px" }}>{o.modelNo + " - " + o.modelDesc}</Btn>)}{data.orders.length === 0 && <p style={{ color: D.dim }}>لا توجد أوامر</p>}</div></Card></div>);
  if (editing) return <OrdForm data={data} initial={order} onSave={(o) => { replaceOrder(sel, o); setEditing(false); }} onCancel={() => setEditing(false)} isMob={isMob} />;

  const t = calcOrder(order);
  const accItems = order.accItems || [];
  const accAll = t.accPer * t.cutQty;
  const activeFabs = FKEYS.filter((k) => order["fabric" + k]);

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
      <h1 style={{ fontSize: isMob ? 20 : 28, fontWeight: 800, margin: 0 }}>{"أمر تشغيل - "}<span style={{ color: D.acc }}>{order.modelNo}</span></h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn primary onClick={() => setEditing(true)}>تعديل</Btn><Btn ghost onClick={() => setSel(null)}>عودة</Btn></div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
      <Metric label="رقم الموديل" value={order.modelNo} icon="🏷" /><Metric label="كمية القص" value={t.cutQty} icon="✂️" color={D.acc} /><Metric label="تم التسليم" value={order.deliveredQty || 0} icon="📥" color={D.ok} /><Metric label="الرصيد" value={t.balance} icon="📦" color={t.balance > 0 ? D.warn : D.ok} /><Metric label="تكلفة القطعة" value={t.costPer + " ج.م"} icon="💰" color={D.acc} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: order.image && !isMob ? "auto 1fr" : "1fr", gap: 16, marginBottom: 16 }}>
      {order.image && <div><img src={order.image} alt="" style={{ width: isMob ? "100%" : 150, height: 150, objectFit: "cover", borderRadius: 14, border: "1px solid " + D.brd }} /></div>}
      <Card title="بيانات الموديل"><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><tbody>
        <tr><td style={TDL}>الوصف</td><td style={TDB}>{order.modelDesc}</td><td style={TDL}>المقاسات</td><td style={TD}>{order.sizeLabel}</td></tr>
        <tr><td style={TDL}>الورشة</td><td style={TD}><Sel value={order.workshop} onChange={(v) => updOrder(sel, (o) => { o.workshop = v; })}><option value="">-</option>{data.workshops.map((w, i) => <option key={i} value={w}>{w}</option>)}</Sel></td><td style={TDL}>الحالة</td><td style={TD}><Sel value={order.status} onChange={(v) => updOrder(sel, (o) => { o.status = v; })}>{data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></td></tr>
      </tbody></table></div></Card>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : activeFabs.length >= 3 ? "1fr 1fr 1fr" : activeFabs.length === 2 ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 16 }}>
      {activeFabs.map((k) => { const colors = gc(order, k); if (colors.length === 0) return null; const dt = gdate(order, k); return (<div key={k}><FCTable label={"خامة " + k} fabName={gf(order, k, "Label")} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={() => {}} readOnly />{dt && <div style={{ fontSize: FS - 2, color: D.dim, marginTop: -8, marginBottom: 10 }}>{"تاريخ القص: " + dt}</div>}</div>); })}
    </div>
    <Card title={"تكلفة الخامات (كمية A = " + t.cutQty + ")"} style={{ marginBottom: 16 }}>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
        <thead><tr>{["الخامة", "السعر", "استهلاك/راق", "الراقات", "القطع", "التكلفة", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>
          {activeFabs.map((k) => { const cons = gcons(order, k); const price = gf(order, k, "Price") || 0; const layers = slay(gc(order, k)); const qty = sqty(gc(order, k)); const cost = cons * price * layers; const perPc = t.cutQty ? r2(cost / t.cutQty) : 0; return (<tr key={k}><td style={TD}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: FCOL[FKEYS.indexOf(k)], marginLeft: 8 }} />{gf(order, k, "Label")}</td><td style={TD}>{price + " ج.م"}</td><td style={TD}>{cons}</td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={{ ...TDB, color: D.acc }}>{fmt(r2(cost)) + " ج.م"}</td><td style={{ ...TDB, color: D.acc }}>{perPc + " ج.م"}</td></tr>); })}
          <tr style={{ background: D.cardL }}><td colSpan={5} style={{ ...TD, fontWeight: 700 }}>اجمالي تكلفة الخامات</td><td style={{ ...TD, fontWeight: 700, color: D.acc }}>{fmt(r2(t.totalFab)) + " ج.م"}</td><td style={{ ...TD, fontWeight: 800, color: D.acc, fontSize: FS + 2 }}>{t.fabPer + " ج.م"}</td></tr>
        </tbody>
      </table></div>
    </Card>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
      <Card title="تكاليف الاكسسوار والتشغيل">
        {accItems.length > 0 ? (<div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}><thead><tr>{["الوصف", "الوحدة", "السعر", "اجمالي"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {accItems.map((a, i) => <tr key={i}><td style={{ ...TD, fontWeight: 600 }}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}>{a.price + " ج.م"}</td><td style={{ ...TDB, color: D.acc }}>{fmt(a.price * t.cutQty) + " ج.م"}</td></tr>)}
          <tr style={{ background: D.cardL }}><td colSpan={2} style={{ ...TD, fontWeight: 700 }}>اجمالي</td><td style={{ ...TD, fontWeight: 700 }}>{t.accPer + " ج.م/قطعة"}</td><td style={{ ...TD, fontWeight: 700, color: D.acc }}>{fmt(accAll) + " ج.م"}</td></tr>
        </tbody></table></div>) : <div style={{ textAlign: "center", padding: 20, color: D.dim }}>لم يتم اضافة بنود</div>}
      </Card>
      <Card title="التسليمات" extra={<Btn primary small onClick={() => updOrder(sel, (o) => { if (!o.deliveries) o.deliveries = []; o.deliveries.push({ date: new Date().toISOString().split("T")[0], qty: 0, notes: "" }); })}>+ تسليم</Btn>}>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 350 }}><thead><tr>{["#", "التاريخ", "الكمية", "ملاحظات"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {(order.deliveries || []).map((d, i) => <tr key={i}><td style={TD}>{i + 1}</td><td style={TD}>{d.date}</td><td style={TDB}>{d.qty}</td><td style={TD}>{d.notes}</td></tr>)}
          {(!order.deliveries || order.deliveries.length === 0) && <tr><td colSpan={4} style={{ ...TD, textAlign: "center", color: D.dim }}>لا توجد تسليمات</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
    <Card title="ملخص تكلفة الموديل" accent="#0E7490">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS + 1 }}><thead><tr>{["البند", "التكلفة الكلية", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        <tr><td style={TD}>تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab)) + " ج.م"}</td><td style={TDB}>{t.fabPer + " ج.م"}</td></tr>
        <tr><td style={TD}>تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll) + " ج.م"}</td><td style={TDB}>{t.accPer + " ج.م"}</td></tr>
        <tr style={{ background: D.accDim }}><td style={{ ...TD, fontWeight: 800, fontSize: FS + 4, color: D.acc }}>الاجمالي</td><td style={{ ...TD, fontWeight: 800, fontSize: FS + 4, color: D.acc }}>{fmt(r2(t.costAll)) + " ج.م"}</td><td style={{ ...TD, fontWeight: 800, fontSize: FS + 6, color: D.acc }}>{t.costPer + " ج.م"}</td></tr>
      </tbody></table>
    </Card>
    {order.instructions && <Card title="تعليمات التشغيل" style={{ marginTop: 16 }}><div style={{ whiteSpace: "pre-wrap", fontSize: FS + 1, lineHeight: 2 }}>{order.instructions}</div></Card>}
  </div>);
}

/* ═══ COST ═══ */
function CostPg({ data, isMob }) {
  return (<div><h1 style={{ fontSize: isMob ? 22 : 30, fontWeight: 800, margin: "0 0 20px" }}>تقرير تكاليف الموديلات</h1>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}><Metric label="عدد الموديلات" value={data.orders.length} icon="📦" color={D.acc} /><Metric label="اجمالي القص" value={fmt(data.orders.reduce((s, o) => s + calcOrder(o).cutQty, 0))} icon="✂️" color={D.ok} /></div>
    <Card><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 550 }}><thead><tr>{["#", "موديل", "الوصف", "الكمية", "تسليم", "رصيد", "تكلفة القطعة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {data.orders.map((o, i) => { const c = calcOrder(o); return <tr key={o.id}><td style={TD}>{i + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={{ ...TDB, color: D.acc }}>{c.cutQty}</td><td style={TD}>{o.deliveredQty || 0}</td><td style={{ ...TD, color: c.balance > 0 ? D.warn : D.ok, fontWeight: 700 }}>{c.balance}</td><td style={{ ...TDB, color: D.acc, fontSize: FS + 2 }}>{c.costPer + " ج.م"}</td></tr>; })}
      {data.orders.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: D.dim, padding: 40 }}>لا توجد بيانات</td></tr>}
    </tbody></table></div></Card>
  </div>);
}

/* ═══ REPORT ═══ */
function RepPg({ data, isMob }) {
  const [filter, setFilter] = useState("الكل");
  const list = filter === "الكل" ? data.orders : data.orders.filter((o) => o.status === filter);
  const cutQ = list.reduce((s, o) => s + calcOrder(o).cutQty, 0);
  const delQ = list.reduce((s, o) => s + (o.deliveredQty || 0), 0);
  const comp = cutQ ? Math.round((delQ / cutQ) * 100) : 0;
  return (<div><h1 style={{ fontSize: isMob ? 22 : 30, fontWeight: 800, margin: "0 0 20px" }}>تقرير قص وانتاج المصنع</h1>
    <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
      <Metric label="كمية القص" value={fmt(cutQ)} icon="✂️" color={D.acc} /><Metric label="تسليم مخزن" value={fmt(delQ)} icon="📥" color={D.ok} /><Metric label="رصيد بالمصنع" value={fmt(cutQ - delQ)} icon="📦" color={D.warn} />
      <div style={{ background: D.card, borderRadius: 14, padding: 20, border: "1px solid " + D.brd }}><div style={{ fontSize: FS - 1, color: D.dim, marginBottom: 6, fontWeight: 600 }}>معدل الانجاز</div><div style={{ fontSize: 28, fontWeight: 800, color: D.acc }}>{comp + "%"}</div><PBar value={comp} /></div>
    </div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>{["الكل", ...data.statuses].map((s) => <Btn key={s} on={filter === s} small onClick={() => setFilter(s)}>{s}</Btn>)}</div>
    <Card><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}><thead><tr>{["#", "موديل", "الوصف", "الورشة", "كمية القص", "تسليم", "رصيد", "الحالة"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {list.map((o, i) => { const c = calcOrder(o); return <tr key={o.id}><td style={TD}>{i + 1}</td><td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}>{o.workshop || "-"}</td><td style={{ ...TDB, color: D.acc }}>{c.cutQty}</td><td style={TD}>{o.deliveredQty || 0}</td><td style={{ ...TD, color: c.balance > 0 ? D.warn : D.ok, fontWeight: 700 }}>{c.balance}</td><td style={TD}><Badge t={o.status} /></td></tr>; })}
      {list.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: "center", color: D.dim, padding: 40 }}>لا توجد بيانات</td></tr>}
    </tbody></table></div></Card>
  </div>);
}
