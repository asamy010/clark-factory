/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Portal · Order tab (V21.21.77)

   تاب «🛒 اطلب» في بورتال العميل — ستور جملة:
     - صورة الموديل الافتراضية أولاً، ولما العميل يضغط على لون → الصورة
       الرئيسية تتغيّر لصورة اللون ده (V21.21.77) عشان يشوفه كويس.
     - زرّ + بيضيف سيري كامل (= عدد المقاسات). والعميل بيطلب كل لون بعدده.
     - كاش داخل الجلسة (catalog + cart) عشان التنقّل بين التابات مايعيدش التحميل.
     - «إرسال الطلب» → /api/customer-portal-order (طلب/Lead — المالك يأكّد).

   standalone، mobile-first. كل التحقق النهائي server-side.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));
const AC = "#6366F1", GR = "#059669", MUT = "#94A3B8", BRD = "#E2E8F0", TXT = "#0F172A", SEC = "#475569";
const stepBtn = (disabled) => ({ width: 28, height: 28, borderRadius: 8, border: "1px solid " + BRD, background: disabled ? "#F8FAFC" : "#fff", color: disabled ? MUT : AC, fontSize: 17, fontWeight: 800, cursor: disabled ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit", flexShrink: 0 });

/* كاش داخل الجلسة (module-level) — التنقّل بين التابات مايعيدش التحميل/الصور. */
const catalogCache = {};  /* { [custId]: { items } } */
const cartCache = {};      /* { [custId]: cart } */
const inflight = {};       /* { [custId]: true } — منع تكرار الـ prefetch */
const imgsPreloaded = {};  /* { [custId]: true } — صور أول شاشة اتحمّلت في كاش المتصفح (V21.27.205) */

/* V21.21.86: تحميل مُسبق للكتالوج في الخلفية (يُنادى من البورتال عند الفتح)
   عشان تاب «اطلب» يفتح فوراً بدون تحميل. fire-and-forget، يكتب في الكاش. */
export function prefetchOrderCatalog(custId, sig, ts) {
  if (!custId || !sig || catalogCache[custId] || inflight[custId]) return;
  inflight[custId] = true;
  const qs = "c=" + encodeURIComponent(custId) + "&sig=" + encodeURIComponent(sig) + (ts ? "&t=" + encodeURIComponent(ts) : "");
  fetch("/api/customer-portal-catalog?" + qs)
    .then(r => r.json())
    .then(j => { if (j && j.ok) catalogCache[custId] = { items: j.items || [] }; })
    .catch(() => {})
    .finally(() => { delete inflight[custId]; });
}

/* ── كارت موديل واحد — بمعاينة لون محلية (الصورة الرئيسية تتغيّر حسب اللون) ── */
function ModelCard({ it, modelCart, onBump }) {
  const soon = it.status === "soon";
  const s = Math.max(1, Number(it.seriesSize) || 1);
  const cap = Math.floor((Number(it.avail) || 0) / s) * s;
  const mt = Object.values(modelCart || {}).reduce((a, b) => a + b, 0);
  const colors = (it.colors && it.colors.length) ? it.colors : [{ name: "", hex: "", image: "" }];
  const byName = useMemo(() => { const m = {}; (it.colors || []).forEach(c => { m[c.name] = c; }); return m; }, [it.colors]);

  /* اللون المعروض حالياً ("" = صورة الموديل الافتراضية) */
  const [pColor, setPColor] = useState("");
  const activeColor = pColor ? byName[pColor] : null;
  const mainImg = (activeColor && activeColor.image) ? activeColor.image : (it.image || "");
  const hasColorImgs = (it.colors || []).some(c => c.image);

  return <div style={{ background: "#fff", border: "1px solid " + (mt ? AC : BRD), borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: mt ? "0 0 0 2px " + AC + "22" : "0 1px 3px rgba(0,0,0,0.04)" }}>
    <div style={{ width: "100%", aspectRatio: "3/4", background: "#F1F5F9", position: "relative" }}>
      {mainImg
        ? <img key={mainImg} src={mainImg} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: MUT }}>👕</div>}
      <div style={{ position: "absolute", top: 6, insetInlineStart: 6, background: soon ? "#D97706" : GR, color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>
        {soon ? "قريباً" : "متاح " + fmt(it.avail) + (s > 1 ? " (" + Math.floor(it.avail / s) + " سيري)" : "")}
      </div>
      {mt > 0 && <div style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: AC, color: "#fff", fontSize: 11, fontWeight: 900, padding: "2px 9px", borderRadius: 20 }}>{mt}</div>}
      {activeColor && <div style={{ position: "absolute", bottom: 6, insetInlineStart: 6, background: "rgba(15,23,42,0.78)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: activeColor.hex || "#fff", display: "inline-block" }} />{activeColor.name}
      </div>}
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
      {hasColorImgs && <div style={{ fontSize: 9, color: AC, fontWeight: 700 }}>👆 اضغط على اللون لرؤيته</div>}
      {!soon && <div style={{ marginTop: 4 }}>
        {colors.map(col => {
          const key = col.name || "";
          const cur = (modelCart || {})[key] || 0;
          const canAdd = mt + s <= cap;
          const isPrev = pColor === key && !!col.name;
          const preview = () => { if (col.name) setPColor(p => p === key ? "" : key); };
          return <div key={key || "_"} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderTop: "1px dashed " + BRD, borderRadius: 8, background: isPrev ? AC + "0F" : "transparent" }}>
            <div onClick={preview} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: col.name ? "pointer" : "default" }}>
              {col.image
                ? <img src={col.image} alt="" loading="lazy" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", flexShrink: 0, border: "2px solid " + (isPrev ? AC : BRD) }} />
                : <div style={{ width: 30, height: 30, borderRadius: 7, background: col.hex || "#F1F5F9", flexShrink: 0, border: "2px solid " + (isPrev ? AC : BRD) }} />}
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: isPrev ? AC : TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.name || "الكمية"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <button onClick={() => onBump(key, -1)} disabled={cur <= 0} style={stepBtn(cur <= 0)}>−</button>
              <div style={{ minWidth: 48, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: cur ? TXT : MUT, lineHeight: 1 }}>{cur}</div>
                {s > 1 && cur > 0 && <div style={{ fontSize: 9, color: MUT }}>{cur / s} سيري</div>}
              </div>
              <button onClick={() => { onBump(key, +1); if (col.name) setPColor(key); }} disabled={!canAdd} style={stepBtn(!canAdd)}>+</button>
            </div>
          </div>;
        })}
      </div>}
    </div>
  </div>;
}

export function CustomerOrderTab({ custId, sig, ts }) {
  const cached = catalogCache[custId];
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [items, setItems] = useState(() => (cached ? cached.items : []));
  const [cart, setCart] = useState(() => cartCache[custId] || {});   /* { orderId: { colorName: qtyPieces } } */
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [showN, setShowN] = useState(25);   /* pagination — 25 موديل + عرض المزيد */
  useEffect(() => { setShowN(25); }, [q]);   /* رجوع للأول عند البحث */
  /* V21.27.205: مؤشر «جاري تحميل الموديلات المتاحة» يفضل ظاهر لحد ما صور أول
     شاشة تتحمّل فعلاً — عشان الجريد يظهر والصور جاهزة مش رمادي قدّام العميل.
     imgsPreloaded كاش على مستوى الموديول → التنقّل بين التابات مايعيدش المؤشر. */
  const [imgsReady, setImgsReady] = useState(() => !!imgsPreloaded[custId]);

  const qs = "c=" + encodeURIComponent(custId) + "&sig=" + encodeURIComponent(sig) + (ts ? "&t=" + encodeURIComponent(ts) : "");

  const load = async (force) => {
    if (!force && catalogCache[custId]) { setItems(catalogCache[custId].items); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/customer-portal-catalog?" + qs);
      const j = await r.json();
      if (!r.ok || !j.ok) setError(j.error || "خطأ في التحميل");
      else { setItems(j.items || []); catalogCache[custId] = { items: j.items || [] }; }
    } catch (e) { setError("فشل الاتصال بالخادم"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { cartCache[custId] = cart; }, [cart, custId]);

  /* V21.27.205: preload صور أول ~12 موديل (فوق الطية) بـ new Image() → تدخل كاش
     المتصفح، فلما الجريد يترسم الصور تبان فوراً بدل ما تتحمّل رمادي قدّام العميل.
     safety 6s عشان مايعلّقش لو صورة بايظة/بطيئة. الباقي بيتحمّل lazy مع السكرول. */
  useEffect(() => {
    if (loading || error || imgsReady) return;
    const urls = items.slice(0, 12).map(it => it && it.image).filter(Boolean);
    if (!urls.length) { imgsPreloaded[custId] = true; setImgsReady(true); return; }
    let done = 0, cancelled = false;
    const finish = () => { if (cancelled) return; if (++done >= urls.length) { imgsPreloaded[custId] = true; setImgsReady(true); } };
    urls.forEach(u => { const im = new Image(); im.onload = finish; im.onerror = finish; im.src = u; });
    const timer = setTimeout(() => { if (!cancelled) { imgsPreloaded[custId] = true; setImgsReady(true); } }, 6000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loading, error, imgsReady, items, custId]);

  /* تعيين كمية لون (بالقطع) — تقريب لمضاعف سيري + قصّ على المتبقّي المتاح */
  const setColorQty = (it, colorName, pieces) => {
    const s = Math.max(1, Number(it.seriesSize) || 1);
    const cap = Math.floor((Number(it.avail) || 0) / s) * s;
    setCart(c => {
      const model = { ...(c[it.id] || {}) };
      let v = Math.max(0, Math.floor(Number(pieces) || 0));
      v = Math.floor(v / s) * s;
      const others = Object.entries(model).reduce((sum, [k, qv]) => k === colorName ? sum : sum + qv, 0);
      if (others + v > cap) v = Math.max(0, cap - others);
      if (v > 0) model[colorName] = v; else delete model[colorName];
      const n = { ...c };
      if (Object.keys(model).length) n[it.id] = model; else delete n[it.id];
      return n;
    });
  };
  const bumpSeries = (it, colorName, dir) => {
    const cur = (cart[it.id] || {})[colorName] || 0;
    setColorQty(it, colorName, cur + dir * Math.max(1, Number(it.seriesSize) || 1));
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
      else { setDone(j); setCart({}); cartCache[custId] = {}; setNote(""); }
    } catch (e) { alert("فشل الاتصال بالخادم"); }
    finally { setSubmitting(false); }
  };

  if (error) return <div style={{ padding: 20, textAlign: "center", color: "#DC2626", background: "#FEE2E2", borderRadius: 12 }}>⛔ {error}</div>;
  if (loading || !imgsReady) return <div style={{ padding: 50, textAlign: "center" }}>
    <style>{"@keyframes clarkOrderSpin{to{transform:rotate(360deg)}}"}</style>
    <div style={{ width: 44, height: 44, margin: "0 auto", borderRadius: "50%", border: "4px solid " + BRD, borderTopColor: AC, animation: "clarkOrderSpin 0.8s linear infinite" }} />
    <div style={{ fontSize: 15, fontWeight: 800, color: TXT, marginTop: 16 }}>جاري تحميل الموديلات المتاحة</div>
    <div style={{ fontSize: 12, color: MUT, marginTop: 5 }}>لحظات لتجهيز الصور…</div>
  </div>;

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
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث عن موديل..."
        style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "10px 14px", borderRadius: 12, border: "1px solid " + BRD, fontSize: 15, fontFamily: "inherit" }} />
      <button onClick={() => load(true)} title="تحديث المتاح" style={{ flexShrink: 0, width: 44, borderRadius: 12, border: "1px solid " + BRD, background: "#fff", color: AC, fontSize: 17, cursor: "pointer", fontFamily: "inherit" }}>🔄</button>
    </div>

    {!orderable && <div style={{ padding: 24, textAlign: "center", color: MUT, background: "#F8FAFC", borderRadius: 12, border: "1px dashed " + BRD, marginBottom: 12 }}>مفيش أصناف متاحة للطلب حالياً</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
      {filtered.slice(0, showN).map(it => <ModelCard key={it.id} it={it} modelCart={cart[it.id]} onBump={(color, dir) => bumpSeries(it, color, dir)} />)}
    </div>

    {filtered.length > showN && <button onClick={() => setShowN(n => n + 25)} style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: "1px solid #C7D2FE", background: "#EEF2FF", color: AC, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
      ⬇️ عرض المزيد ({fmt(filtered.length - showN)} موديل متبقي)
    </button>}

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
}
