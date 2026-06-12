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
  const { sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");

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
                {/* Image */}
                <div style={{ width: "100%", aspectRatio: "3/4", background: "#F1F5F9", position: "relative" }}>
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
  </div>;
}
