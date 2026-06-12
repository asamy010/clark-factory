/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal · Order tab (V21.21.74)

   تاب «🛒 اطلب» في بورتال العميل — ستور جملة:
     - يجيب كتالوج المتاح lazy من /api/customer-portal-catalog.
     - صورة الموديل + المقاسات + حجم السيري + سعر الجملة + المتاح.
     - V21.21.74: زرّ + بيضيف **سيري كامل** (= عدد المقاسات قطعة واحدة).
       والعميل بيطلب **كل لون بعدده** (صورة اللون لو متاحة، وإلا swatch).
     - «إرسال الطلب» → /api/customer-portal-order (طلب/Lead — المالك يأكّد).

   standalone، mobile-first. كل التحقق النهائي server-side (السعر/المتاح/
   محاذاة السيري من الكتالوج) — ده مجرد واجهة.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));
const AC = "#6366F1", GR = "#059669", MUT = "#94A3B8", BRD = "#E2E8F0", TXT = "#0F172A", SEC = "#475569";

export function CustomerOrderTab({ custId, sig, ts }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({});       /* { orderId: { colorName: qtyPieces } } */
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const qs = "c=" + encodeURIComponent(custId) + "&sig=" + encodeURIComponent(sig) + (ts ? "&t=" + encodeURIComponent(ts) : "");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/customer-portal-catalog?" + qs);
      const j = await r.json();
      if (!r.ok || !j.ok) setError(j.error || "خطأ في التحميل");
      else setItems(j.items || []);
    } catch (e) { setError("فشل الاتصال بالخادم"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const seriesSize = (it) => Math.max(1, Number(it.seriesSize) || 1);
  const availSeries = (it) => { const s = seriesSize(it); return Math.floor((Number(it.avail) || 0) / s) * s; };
  const modelTotal = (it) => Object.values(cart[it.id] || {}).reduce((a, b) => a + b, 0);

  /* تعيين كمية لون (بالقطع) — تقريب لمضاعف سيري + قصّ على المتبقّي المتاح */
  const setColorQty = (it, colorName, pieces) => {
    const s = seriesSize(it), cap = availSeries(it);
    setCart(c => {
      const model = { ...(c[it.id] || {}) };
      let v = Math.max(0, Math.floor(Number(pieces) || 0));
      v = Math.floor(v / s) * s;
      const others = Object.entries(model).reduce((sum, [k, q]) => k === colorName ? sum : sum + q, 0);
      if (others + v > cap) v = Math.max(0, cap - others);
      if (v > 0) model[colorName] = v; else delete model[colorName];
      const n = { ...c };
      if (Object.keys(model).length) n[it.id] = model; else delete n[it.id];
      return n;
    });
  };
  const bumpSeries = (it, colorName, dir) => {
    const cur = (cart[it.id] || {})[colorName] || 0;
    setColorQty(it, colorName, cur + dir * seriesSize(it));
  };

  const totals = useMemo(() => {
    let qty = 0, value = 0, lines = 0;
    items.forEach(it => { const t = Object.values(cart[it.id] || {}).reduce((a, b) => a + b, 0); if (t > 0) { qty += t; value += t * (Number(it.price) || 0); lines++; } });
    return { qty, value, lines };
  }, [cart, items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(i => (i.modelNo || "").toLowerCase().includes(term) || (i.modelDesc || "").toLowerCase().includes(term));
  }, [items, q]);

  const submit = async () => {
    if (submitting || totals.lines === 0) return;
    setSubmitting(true);
    try {
      const payload = {
        c: custId, sig, t: ts, note,
        items: Object.entries(cart).map(([id, colorsMap]) => ({
          id,
          colors: Object.entries(colorsMap).filter(([, qv]) => qv > 0).map(([color, qty]) => ({ color, qty })),
        })).filter(it => it.colors.length),
      };
      const r = await fetch("/api/customer-portal-order", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { alert(j.error || "فشل إرسال الطلب"); }
      else { setDone(j); setCart({}); setNote(""); }
    } catch (e) { alert("فشل الاتصال بالخادم"); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: SEC }}>⏳ جاري تحميل المتاح...</div>;
  if (error) return <div style={{ padding: 20, textAlign: "center", color: "#DC2626", background: "#FEE2E2", borderRadius: 12 }}>⛔ {error}</div>;

  if (done) return <div style={{ padding: "30px 16px", textAlign: "center" }}>
    <div style={{ fontSize: 60 }}>✅</div>
    <div style={{ fontSize: 20, fontWeight: 900, color: TXT, marginTop: 8 }}>تم استلام طلبك</div>
    <div style={{ fontSize: 14, color: SEC, marginTop: 8, lineHeight: 1.8, maxWidth: 340, marginInline: "auto" }}>{done.message || "هنتواصل معاك قريباً لتأكيد الأوردر."}</div>
    <div style={{ marginTop: 14, display: "inline-flex", gap: 18, padding: "12px 20px", borderRadius: 12, background: "#F8FAFC", border: "1px solid " + BRD }}>
      <div><div style={{ fontSize: 22, fontWeight: 900, color: AC }}>{fmt(done.totalQty)}</div><div style={{ fontSize: 11, color: MUT }}>قطعة</div></div>
      <div><div style={{ fontSize: 22, fontWeight: 900, color: GR }}>{fmt(done.totalValue)}</div><div style={{ fontSize: 11, color: MUT }}>ج.م</div></div>
    </div>
    <div><button onClick={() => setDone(null)} style={{ marginTop: 18, padding: "10px 22px", borderRadius: 10, border: "1px solid " + BRD, background: "#fff", color: AC, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>اطلب تاني</button></div>
  </div>;

  const orderable = items.some(i => i.status === "available");

  return <div style={{ paddingBottom: totals.lines ? 130 : 20 }}>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث عن موديل..."
      style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 12, border: "1px solid " + BRD, fontSize: 15, marginBottom: 12, fontFamily: "inherit" }} />

    {!orderable && <div style={{ padding: 24, textAlign: "center", color: MUT, background: "#F8FAFC", borderRadius: 12, border: "1px dashed " + BRD, marginBottom: 12 }}>مفيش أصناف متاحة للطلب حالياً</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
      {filtered.map(it => {
        const soon = it.status === "soon";
        const s = seriesSize(it);
        const cap = availSeries(it);
        const mt = modelTotal(it);
        const colors = (it.colors && it.colors.length) ? it.colors : [{ name: "", hex: "", image: "" }];
        const colorRow = (col) => {
          const key = col.name || "";
          const cur = (cart[it.id] || {})[key] || 0;
          const canAdd = mt + s <= cap;
          return <div key={key || "_"} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px dashed " + BRD }}>
            {col.image
              ? <img src={col.image} alt="" loading="lazy" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", flexShrink: 0, border: "1px solid " + BRD }} />
              : <div style={{ width: 30, height: 30, borderRadius: 7, background: col.hex || "#F1F5F9", border: "1px solid " + BRD, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.name || "الكمية"}</div>
            {!soon && <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <button onClick={() => bumpSeries(it, key, -1)} disabled={cur <= 0} style={stepBtn(cur <= 0)}>−</button>
              <div style={{ minWidth: 48, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: cur ? TXT : MUT, lineHeight: 1 }}>{cur}</div>
                {s > 1 && cur > 0 && <div style={{ fontSize: 9, color: MUT }}>{cur / s} سيري</div>}
              </div>
              <button onClick={() => bumpSeries(it, key, +1)} disabled={!canAdd} style={stepBtn(!canAdd)}>+</button>
            </div>}
          </div>;
        };
        return <div key={it.id} style={{ background: "#fff", border: "1px solid " + (mt ? AC : BRD), borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: mt ? "0 0 0 2px " + AC + "22" : "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ width: "100%", aspectRatio: "3/4", background: "#F1F5F9", position: "relative" }}>
            {it.image ? <img src={it.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: MUT }}>👕</div>}
            <div style={{ position: "absolute", top: 6, insetInlineStart: 6, background: soon ? "#D97706" : GR, color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>
              {soon ? "قريباً" : "متاح " + fmt(it.avail) + (s > 1 ? " (" + Math.floor(it.avail / s) + " سيري)" : "")}
            </div>
            {mt > 0 && <div style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 900, padding: "2px 9px", borderRadius: 20 }}>{mt}</div>}
          </div>
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.modelNo}</div>
            {it.modelDesc && <div style={{ fontSize: 11, color: SEC, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.modelDesc}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: MUT }}>
              {it.sizesLabel && <span>📏 {it.sizesLabel}</span>}
              {s > 1 && <span>🧵 سيري {s} قطعة</span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: TXT, direction: "ltr" }}>{fmt(it.price)}</span>
              <span style={{ fontSize: 10, color: MUT, fontWeight: 700 }}>ج.م / قطعة</span>
            </div>
            {!soon && <div style={{ marginTop: 4 }}>{colors.map(colorRow)}</div>}
          </div>
        </div>;
      })}
    </div>

    {/* Sticky cart footer */}
    {totals.lines > 0 && <div style={{ position: "fixed", insetInline: 0, bottom: 0, background: "#fff", borderTop: "1px solid " + BRD, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)", padding: "10px 14px", zIndex: 20 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة للطلب (اختياري)..."
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 10, border: "1px solid " + BRD, fontSize: 13, marginBottom: 8, fontFamily: "inherit" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: MUT }}>{totals.lines} موديل · {fmt(totals.qty)} قطعة</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: TXT }}>{fmt(totals.value)} <span style={{ fontSize: 12, color: MUT }}>ج.م</span></div>
          </div>
          <button onClick={submit} disabled={submitting} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: submitting ? MUT : GR, color: "#fff", fontSize: 15, fontWeight: 900, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit" }}>
            {submitting ? "...جاري الإرسال" : "🛒 إرسال الطلب"}
          </button>
        </div>
      </div>
    </div>}
  </div>;

  function stepBtn(disabled) {
    return { width: 28, height: 28, borderRadius: 8, border: "1px solid " + BRD, background: disabled ? "#F8FAFC" : "#fff", color: disabled ? MUT : AC, fontSize: 17, fontWeight: 800, cursor: disabled ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit", flexShrink: 0 };
  }
}
