/* ═══════════════════════════════════════════════════════════════
   CLARK — Stock Portal Page (V21.21.68)

   صفحة عامة (بدون login) لـ«المخزن الجاهز المتاح».
   URL: /?stock=1&s=<sig>

   بتعرض:
     - هيدر باسم/لوجو المصنع.
     - بطاقات KPIs (موديلات متاحة · إجمالي القطع · القيمة بالجملة).
     - شبكة كروت: صورة + اسم الموديل + الكمية المتاحة الفعلية + سعر الجملة
       + زر «اطلب على واتساب». أصناف «تحت التشغيل» بشارة «قريباً».
     - بحث بالموديل.

   standalone — مفيش اعتماد على ثيم التطبيق (inline styles, mobile-first).
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useMemo } from "react";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));

/* لوحة ألوان ثابتة للبورتال (مستقلة عن ثيم التطبيق) */
const C = {
  bg: "linear-gradient(135deg,#F8FAFC 0%,#Eef2ff 100%)",
  card: "#FFFFFF", brd: "#E2E8F0", text: "#0F172A", sec: "#475569", mut: "#94A3B8",
  accent: "#0EA5E9", accentBg: "#E0F2FE", ok: "#059669", warn: "#D97706", wa: "#25D366",
};

export function StockPortalPage({ params }) {
  const { sig, view } = params;
  /* V21.27.134: وضع «معرض الصور» — صورة كبيرة لكل موديل في صف.
     V21.27.135: «catalog» = نفس المعرض + العدد وسعر الجملة ورقم الموديل. */
  const showcase = view === "showcase" || view === "2" || view === "catalog";
  const showcasePrice = view === "catalog";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  /* V21.27.134: عارض الصورة المكبّرة (للموديل أو لصورة لون) */
  const [lightbox, setLightbox] = useState(null); /* { image, label } | null */

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/stock-portal?s=" + encodeURIComponent(sig));
        const j = await r.json();
        if (!r.ok || !j.ok) setError(j.error || "خطأ في التحميل");
        else setData(j);
      } catch (e) {
        setError("فشل الاتصال بالخادم");
      } finally { setLoading(false); }
    };
    load();
  }, [sig]);

  const items = useMemo(() => {
    const list = (data && data.items) || [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(i =>
      (i.modelNo || "").toLowerCase().includes(term) ||
      (i.modelDesc || "").toLowerCase().includes(term));
  }, [data, q]);

  const wrap = { minHeight: "100vh", background: C.bg, direction: "rtl", fontFamily: "'Cairo',sans-serif" };

  if (loading) {
    return <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 12 }}>
        <div style={{ width: 42, height: 42, border: "4px solid " + C.brd, borderTop: "4px solid " + C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize: 16, color: C.sec, fontWeight: 700 }}>جاري تحميل المخزن المتاح...</div>
      </div>
    </div>;
  }

  if (error) {
    return <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 54 }}>🔒</div>
        <div style={{ fontSize: 19, color: C.text, fontWeight: 800 }}>{error}</div>
        <div style={{ fontSize: 14, color: C.mut, maxWidth: 320, lineHeight: 1.7 }}>الرابط ممكن يكون منتهي أو اتلغى. تواصل مع المصنع للحصول على رابط جديد.</div>
      </div>
    </div>;
  }

  const factory = data.factory || {};
  const kpis = data.kpis || { models: 0, pieces: 0, value: 0, soonModels: 0 };
  const phoneDigits = String(factory.phone || "").replace(/[^0-9]/g, "");

  const orderWa = (it) => {
    if (!phoneDigits) return;
    const txt = `السلام عليكم 👋\nمهتم بالموديل: ${it.modelNo}${it.modelDesc ? " — " + it.modelDesc : ""}\n${it.status === "available" ? "المتاح: " + fmt(it.avail) + " قطعة" : "تحت التشغيل (قريباً)"}\nياريت التفاصيل والتوفّر.`;
    window.open("https://wa.me/" + phoneDigits + "?text=" + encodeURIComponent(txt), "_blank");
  };

  const Kpi = ({ label, value, sub, color }) => (
    <div style={{ flex: "1 1 150px", minWidth: 130, background: C.card, border: "1px solid " + C.brd, borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 12, color: C.mut, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || C.text, lineHeight: 1, direction: "ltr", textAlign: "right" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  /* V21.27.134: صف الألوان المتاحة لموديل — swatch (hex) أو صورة مصغّرة + الاسم.
     لو اللون له صورة → الضغط بيفتح العارض المكبّر. */
  const colorsRow = (it) => {
    const cols = Array.isArray(it.colors) ? it.colors : [];
    if (cols.length === 0) return null;
    return <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 1 }}>
      {cols.map((c, ci) => {
        const hasImg = !!c.image;
        return <div key={ci} title={c.name + (hasImg ? " — اضغط لعرض الصورة" : "")}
          onClick={hasImg ? (e) => { e.stopPropagation(); setLightbox({ image: c.image, label: (it.modelNo || "") + " — " + c.name }); } : undefined}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: hasImg ? "2px 7px 2px 2px" : "2px 8px", borderRadius: 20, border: "1px solid " + C.brd, background: "#fff", cursor: hasImg ? "zoom-in" : "default" }}>
          {hasImg
            ? <img src={c.image} alt="" loading="lazy" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", border: "1px solid " + C.brd }} />
            : <span style={{ width: 13, height: 13, borderRadius: "50%", background: c.hex || "#CBD5E1", border: "1px solid " + C.brd, display: "inline-block", flexShrink: 0 }} />}
          <span style={{ fontSize: 11, color: C.sec, fontWeight: 700 }}>{c.name}</span>
          {hasImg && <span style={{ fontSize: 9, color: C.accent }}>🔍</span>}
        </div>;
      })}
    </div>;
  };

  /* V21.27.134: العارض المكبّر — صورة كاملة على خلفية معتمة، يقفل بالضغط. */
  const Lightbox = () => !lightbox ? null : (
    <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
      <img src={lightbox.image} alt="" style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />
      {lightbox.label && <div style={{ marginTop: 14, color: "#fff", fontSize: 16, fontWeight: 800, textAlign: "center" }}>{lightbox.label}</div>}
      <div style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>اضغط في أي مكان للإغلاق ✕</div>
    </div>
  );

  /* ─────────── V21.27.134: عرض «معرض الصور» (showcase) ───────────
     صورة كبيرة لكل موديل في صف واحد + شارة «متاح N» بس (زي الكتالوج). */
  if (showcase) {
    return <div style={wrap}>
      <div style={{ background: C.card, borderBottom: "1px solid " + C.brd, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 5 }}>
        {factory.logo
          ? <img src={factory.logo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
          : <div style={{ width: 44, height: 44, borderRadius: 10, background: C.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏭</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{factory.name || "المخزن المتاح"}</div>
          <div style={{ fontSize: 12, color: C.mut, fontWeight: 600 }}>{(showcasePrice ? "معرض الأسعار · " : "المعرض · ") + fmt(kpis.models) + " موديل متاح"}</div>
        </div>
      </div>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث باسم أو رقم الموديل..."
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid " + C.brd, background: C.card, fontSize: 15, color: C.text, marginBottom: 14, fontFamily: "inherit" }} />
        {items.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: C.mut, background: C.card, borderRadius: 14, border: "1px dashed " + C.brd }}>{q ? "مفيش موديل بالاسم ده" : "مفيش أصناف متاحة حالياً"}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {items.map((it, idx) => {
                const soon = it.status === "soon";
                return <div key={(it.modelNo || "") + idx} style={{ background: C.card, borderRadius: 18, overflow: "hidden", border: "1px solid " + C.brd, boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
                  <div onClick={() => it.image && setLightbox({ image: it.image, label: it.modelNo || "" })} style={{ position: "relative", width: "100%", background: "#F1F5F9", cursor: it.image ? "zoom-in" : "default" }}>
                    {it.image
                      ? <img src={it.image} alt="" loading="lazy" style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: "82vh" }} />
                      : <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, color: C.mut }}>👕</div>}
                    {/* شارة المتاح — حبّة خضرا زي الصورة المرجعية */}
                    <div style={{ position: "absolute", top: 14, insetInlineEnd: 14, background: soon ? C.warn : C.ok, color: "#fff", fontSize: 18, fontWeight: 900, padding: "8px 18px", borderRadius: 26, boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}>
                      {soon ? "قريباً" : "متاح " + fmt(it.avail)}
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: C.text, direction: "ltr" }}>{it.modelNo}</div>
                    {showcasePrice
                      ? <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {!soon && <span style={{ fontSize: 14, fontWeight: 800, color: C.ok }}>{"متاح " + fmt(it.avail)}</span>}
                          {it.price > 0 && <span style={{ fontSize: 16, fontWeight: 900, color: C.text, direction: "ltr" }}>{fmt(it.price)}<span style={{ fontSize: 11, color: C.mut, fontWeight: 700 }}> ج.م/جملة</span></span>}
                        </div>
                      : (it.modelDesc && <div style={{ fontSize: 13, color: C.sec, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.modelDesc}</div>)}
                  </div>
                </div>;
              })}
            </div>}
        {data.capped && <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: C.mut }}>عرض أول {items.length} من {fmt(data.total)} صنف — تواصل مع المصنع للقائمة الكاملة</div>}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: C.mut, paddingBottom: 24 }}>محدّث لحظياً · CLARK</div>
      </div>
      <Lightbox />
    </div>;
  }

  return <div style={wrap}>
    {/* Header */}
    <div style={{ background: C.card, borderBottom: "1px solid " + C.brd, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 5 }}>
      {factory.logo
        ? <img src={factory.logo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
        : <div style={{ width: 44, height: 44, borderRadius: 10, background: C.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏭</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{factory.name || "المخزن المتاح"}</div>
        <div style={{ fontSize: 12, color: C.mut, fontWeight: 600 }}>المخزن الجاهز المتاح · أسعار الجملة</div>
      </div>
    </div>

    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="موديلات متاحة" value={fmt(kpis.models)} sub={kpis.soonModels ? fmt(kpis.soonModels) + " تحت التشغيل" : ""} color={C.accent} />
        <Kpi label="إجمالي القطع المتاحة" value={fmt(kpis.pieces)} sub="قطعة جاهزة للبيع" color={C.ok} />
        <Kpi label="القيمة بالجملة" value={fmt(kpis.value)} sub="ج.م" color={C.warn} />
      </div>

      {/* Search */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث باسم أو رقم الموديل..."
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid " + C.brd, background: C.card, fontSize: 15, color: C.text, marginBottom: 16, fontFamily: "inherit" }} />

      {/* Grid */}
      {items.length === 0
        ? <div style={{ padding: 40, textAlign: "center", color: C.mut, background: C.card, borderRadius: 14, border: "1px dashed " + C.brd }}>
            {q ? "مفيش موديل بالاسم ده" : "مفيش أصناف متاحة حالياً"}
          </div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
            {items.map((it, idx) => {
              const soon = it.status === "soon";
              return <div key={(it.modelNo || "") + idx} style={{ background: C.card, border: "1px solid " + C.brd, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                {/* Image (clickable → lightbox) */}
                <div onClick={() => it.image && setLightbox({ image: it.image, label: it.modelNo || "" })} style={{ width: "100%", aspectRatio: "3/4", background: "#F1F5F9", position: "relative", cursor: it.image ? "zoom-in" : "default" }}>
                  {it.image
                    ? <img src={it.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, color: C.mut }}>👕</div>}
                  <div style={{ position: "absolute", top: 8, insetInlineStart: 8, background: soon ? C.warn : C.ok, color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20 }}>
                    {soon ? "قريباً" : "متاح " + fmt(it.avail)}
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.modelNo}</div>
                  {it.modelDesc && <div style={{ fontSize: 12, color: C.sec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.modelDesc}</div>}
                  {/* V21.27.134: الألوان المتاحة — swatch/صورة + اسم (الصورة تتكبّر بالضغط) */}
                  {colorsRow(it)}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: "auto" }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: C.text, direction: "ltr" }}>{fmt(it.price)}</span>
                    <span style={{ fontSize: 11, color: C.mut, fontWeight: 700 }}>ج.م / جملة</span>
                  </div>
                  {phoneDigits && <button onClick={() => orderWa(it)} style={{ marginTop: 4, width: "100%", padding: "8px 0", borderRadius: 10, border: "none", background: C.wa, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    💬 اطلب على واتساب
                  </button>}
                </div>
              </div>;
            })}
          </div>}

      {data.capped && <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: C.mut }}>
        عرض أول {items.length} من {fmt(data.total)} صنف — تواصل مع المصنع للقائمة الكاملة
      </div>}

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: C.mut, paddingBottom: 24 }}>
        محدّث لحظياً · CLARK
      </div>
    </div>
    <Lightbox />
  </div>;
}
