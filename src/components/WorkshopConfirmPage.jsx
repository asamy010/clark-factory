/* ═══════════════════════════════════════════════════════════════
   CLARK — WorkshopConfirmPage.jsx  (V16.73)

   Public confirmation page for WORKSHOP delivery verification.
   Opened when the workshop scans the QR printed on a delivery label.
   URL format: /?wd=1&ord=<orderId>&ws=<wsId>&idx=<deliveryIdx>&sig=<hmac>

   No login required. All validation is server-side via HMAC signature.
   Mirrors components/ConfirmPage.jsx (the customer equivalent) on purpose
   so both flows look and feel the same to the people using them.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));

export function WorkshopConfirmPage({ params }) {
  const { ord: orderId, ws: wsId, idx, sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [issueMode, setIssueMode] = useState(false);
  const [issueNote, setIssueNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); /* {status, at} */

  /* ─── Load delivery details on mount ─── */
  useEffect(() => {
    const load = async () => {
      try {
        const url =
          "/api/workshop-delivery-confirm?ord=" + encodeURIComponent(orderId) +
          "&ws=" + encodeURIComponent(wsId) +
          "&idx=" + encodeURIComponent(idx) +
          "&sig=" + encodeURIComponent(sig);
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || "خطأ في التحميل");
        } else {
          setData(j);
          if (j.currentConfirm) {
            setSuccess({ status: j.currentConfirm.status, at: j.currentConfirm.at });
          }
        }
      } catch (e) {
        setError("تعذر الاتصال بالخادم — تحقق من اتصال الإنترنت");
      }
      setLoading(false);
    };
    load();
  }, [orderId, wsId, idx, sig]);

  const submit = async (action) => {
    if (action === "issue" && !issueNote.trim()) {
      alert("برجاء كتابة تفاصيل المشكلة");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/workshop-delivery-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ord: orderId,
          ws: wsId,
          idx,
          sig,
          action,
          note: action === "issue" ? issueNote.trim() : "",
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "فشل إرسال التأكيد");
      } else {
        setSuccess({ status: action, at: j.at || new Date().toISOString() });
      }
    } catch (e) {
      alert("خطأ في الاتصال");
    }
    setSubmitting(false);
  };

  /* ─── Styles (kept inline + self-contained — this page may load before any
     stylesheet is parsed if the workshop is on a slow connection) ─── */
  const S = {
    page: {
      fontFamily: "'Cairo', 'Segoe UI', sans-serif",
      /* Slightly different gradient than the customer page (purple→indigo) so
         factory staff can tell the two confirmation types apart at a glance. */
      background: "linear-gradient(135deg, #FAF5FF 0%, #EDE9FE 100%)",
      minHeight: "100vh",
      direction: "rtl",
      padding: "20px 16px",
      color: "#1E293B",
    },
    card: {
      maxWidth: 480,
      margin: "0 auto",
      background: "#fff",
      borderRadius: 16,
      boxShadow: "0 10px 40px rgba(139, 92, 246, 0.15)",
      overflow: "hidden",
    },
    headerBar: { height: 4, background: "linear-gradient(90deg, #8B5CF6, #6366F1)" },
    header: {
      padding: "20px 24px 14px",
      borderBottom: "1px solid #E2E8F0",
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    logo: { width: 44, height: 44, objectFit: "contain", borderRadius: 8 },
    logoPh: {
      width: 44, height: 44, borderRadius: 8, background: "#F1F5F9",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
    },
    factoryName: { fontSize: 17, fontWeight: 900, color: "#0F172A", lineHeight: 1.2 },
    tagline: { fontSize: 12, color: "#64748B", marginTop: 2, fontWeight: 600 },
    body: { padding: "16px 20px 24px" },
    label: { fontSize: 12, color: "#64748B", fontWeight: 700, marginBottom: 4 },
    wsBox: {
      padding: "10px 12px", background: "#FAF5FF", border: "1px solid #DDD6FE",
      borderRadius: 10, marginBottom: 14,
    },
    wsName: { fontSize: 17, fontWeight: 800, color: "#5B21B6" },
    infoGrid: {
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14,
    },
    infoCell: {
      padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0",
      borderRadius: 8,
    },
    infoLabel: { fontSize: 11, color: "#64748B", fontWeight: 700 },
    infoValue: { fontSize: 14, fontWeight: 800, color: "#0F172A", marginTop: 2 },
    bigBox: {
      padding: "14px", border: "2px solid #8B5CF6", borderRadius: 10,
      background: "#FAF5FF", textAlign: "center", marginBottom: 14,
    },
    qtyHuge: { fontSize: 36, fontWeight: 900, color: "#5B21B6", lineHeight: 1 },
    qtyLabel: { fontSize: 13, color: "#64748B", fontWeight: 700, marginTop: 4 },
    rcvList: {
      borderTop: "1px dashed #E2E8F0", marginTop: 10, paddingTop: 10,
      fontSize: 12, color: "#475569",
    },
    rcvRow: {
      display: "flex", justifyContent: "space-between", padding: "3px 0",
    },
    btnRow: { display: "flex", gap: 10, marginTop: 18 },
    btn: {
      flex: 1, padding: "14px 12px", borderRadius: 10, border: "none",
      fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer",
    },
    btnConfirm: { background: "#10B981", color: "#fff" },
    btnIssue: { background: "#F59E0B", color: "#fff" },
    issueArea: {
      width: "100%", padding: "10px 12px", borderRadius: 10,
      border: "1px solid #FCD34D", background: "#FFFBEB", color: "#78350F",
      fontFamily: "inherit", fontSize: 14, resize: "vertical", minHeight: 90,
      boxSizing: "border-box",
    },
    successBox: {
      padding: "16px", borderRadius: 12, textAlign: "center", marginBottom: 14,
    },
    successConfirm: { background: "#ECFDF5", border: "2px solid #6EE7B7", color: "#065F46" },
    successIssue: { background: "#FFFBEB", border: "2px solid #FCD34D", color: "#78350F" },
    successIcon: { fontSize: 48, marginBottom: 6 },
    successTitle: { fontSize: 18, fontWeight: 900, marginBottom: 4 },
    successDate: { fontSize: 12, fontWeight: 600, opacity: 0.8 },
    errorBox: {
      padding: "20px", textAlign: "center", color: "#991B1B", background: "#FEF2F2",
      border: "2px solid #FECACA", borderRadius: 12,
    },
    spinner: {
      width: 36, height: 36, border: "4px solid #DDD6FE", borderTopColor: "#8B5CF6",
      borderRadius: "50%", animation: "wcSpin 0.8s linear infinite",
      margin: "40px auto 12px",
    },
    footNote: {
      fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 16,
      lineHeight: 1.6,
    },
  };

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div style={S.page}>
        <style>{"@keyframes wcSpin{to{transform:rotate(360deg)}}"}</style>
        <div style={S.card}>
          <div style={S.headerBar} />
          <div style={{ ...S.body, textAlign: "center" }}>
            <div style={S.spinner} />
            <div style={{ fontSize: 14, color: "#64748B", fontWeight: 600 }}>جاري تحميل تفاصيل التسليم…</div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (error) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.headerBar} />
          <div style={S.body}>
            <div style={S.errorBox}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>تعذر فتح الصفحة</div>
              <div style={{ fontSize: 14 }}>{error}</div>
            </div>
            <div style={S.footNote}>
              لو الرابط مكسور أو منتهي، تواصل مع المصنع لإعادة طباعة الليبل.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { brand, order, workshop, delivery } = data;

  /* ─── Already-confirmed state (current OR just-confirmed in this session) ─── */
  if (success) {
    const isConfirm = success.status === "confirm";
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.headerBar} />
          <div style={S.header}>
            {brand.logo ? <img src={brand.logo} alt="" style={S.logo} /> : <div style={S.logoPh}>🏭</div>}
            <div>
              <div style={S.factoryName}>{brand.factoryName}</div>
              <div style={S.tagline}>تأكيد تسليم ورشة</div>
            </div>
          </div>
          <div style={S.body}>
            <div style={{ ...S.successBox, ...(isConfirm ? S.successConfirm : S.successIssue) }}>
              <div style={S.successIcon}>{isConfirm ? "✅" : "⚠️"}</div>
              <div style={S.successTitle}>
                {isConfirm ? "تم تأكيد الاستلام" : "تم تسجيل المشكلة"}
              </div>
              <div style={S.successDate}>
                {new Date(success.at).toLocaleString("ar-EG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
            </div>
            <div style={S.wsBox}>
              <div style={S.label}>الورشة</div>
              <div style={S.wsName}>{workshop.name || "—"}</div>
            </div>
            <div style={S.infoGrid}>
              <div style={S.infoCell}>
                <div style={S.infoLabel}>الموديل</div>
                <div style={S.infoValue}>{order.modelNo || "—"}</div>
              </div>
              <div style={S.infoCell}>
                <div style={S.infoLabel}>الكمية</div>
                <div style={S.infoValue}>{fmt(delivery.qty)} قطعة</div>
              </div>
            </div>
            <div style={S.footNote}>
              تم استلام التأكيد من المصنع. لو فيه استفسار تواصل معاهم مباشرة.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main confirm view ─── */
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.headerBar} />
        <div style={S.header}>
          {brand.logo ? <img src={brand.logo} alt="" style={S.logo} /> : <div style={S.logoPh}>🏭</div>}
          <div>
            <div style={S.factoryName}>{brand.factoryName}</div>
            <div style={S.tagline}>إذن تسليم ورشة — تأكيد الاستلام</div>
          </div>
        </div>

        <div style={S.body}>
          {/* Workshop name */}
          <div style={S.wsBox}>
            <div style={S.label}>الورشة</div>
            <div style={S.wsName}>{workshop.name || "—"}</div>
          </div>

          {/* Order info grid */}
          <div style={S.infoGrid}>
            <div style={S.infoCell}>
              <div style={S.infoLabel}>الموديل</div>
              <div style={S.infoValue}>{order.modelNo || "—"}</div>
            </div>
            <div style={S.infoCell}>
              <div style={S.infoLabel}>القطعة</div>
              <div style={S.infoValue}>{delivery.garmentType || order.modelDesc || "—"}</div>
            </div>
            {order.modelDesc && (
              <div style={{ ...S.infoCell, gridColumn: "1 / span 2" }}>
                <div style={S.infoLabel}>الوصف</div>
                <div style={{ ...S.infoValue, fontSize: 13 }}>{order.modelDesc}</div>
              </div>
            )}
            <div style={S.infoCell}>
              <div style={S.infoLabel}>تاريخ التسليم</div>
              <div style={S.infoValue}>{delivery.date || "—"}</div>
            </div>
            {order.sizeLabel && (
              <div style={S.infoCell}>
                <div style={S.infoLabel}>المقاسات</div>
                <div style={{ ...S.infoValue, fontSize: 13 }}>{order.sizeLabel}</div>
              </div>
            )}
          </div>

          {/* Big qty highlight */}
          <div style={S.bigBox}>
            <div style={S.qtyHuge}>{fmt(delivery.qty)}</div>
            <div style={S.qtyLabel}>قطعة مُسلمة لورشتك</div>
            {delivery.totalRcv > 0 && (
              <div style={S.rcvList}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>المُستلم للمصنع حتى الآن</div>
                {delivery.receives.map((r, i) => (
                  <div key={i} style={S.rcvRow}>
                    <span>{r.date}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(r.qty)} قطعة</span>
                  </div>
                ))}
                <div style={{ ...S.rcvRow, borderTop: "1px solid #E2E8F0", marginTop: 4, paddingTop: 6, fontWeight: 800 }}>
                  <span>المتبقي عند الورشة</span>
                  <span style={{ color: delivery.remaining > 0 ? "#DC2626" : "#059669" }}>
                    {fmt(delivery.remaining)} قطعة
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!issueMode && (
            <div style={S.btnRow}>
              <button
                style={{ ...S.btn, ...S.btnConfirm, opacity: submitting ? 0.6 : 1 }}
                disabled={submitting}
                onClick={() => submit("confirm")}
              >
                {submitting ? "..." : "✅ تأكيد الاستلام"}
              </button>
              <button
                style={{ ...S.btn, ...S.btnIssue, opacity: submitting ? 0.6 : 1 }}
                disabled={submitting}
                onClick={() => setIssueMode(true)}
              >
                ⚠️ مشكلة
              </button>
            </div>
          )}

          {issueMode && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>تفاصيل المشكلة</div>
              <textarea
                value={issueNote}
                onChange={(e) => setIssueNote(e.target.value)}
                placeholder="مثال: الكمية ناقصة 5 قطع، أو فيه قطع تالفة..."
                style={S.issueArea}
                maxLength={500}
              />
              <div style={S.btnRow}>
                <button
                  style={{ ...S.btn, background: "#F1F5F9", color: "#475569" }}
                  onClick={() => { setIssueMode(false); setIssueNote(""); }}
                  disabled={submitting}
                >
                  رجوع
                </button>
                <button
                  style={{ ...S.btn, ...S.btnIssue, opacity: submitting ? 0.6 : 1 }}
                  onClick={() => submit("issue")}
                  disabled={submitting || !issueNote.trim()}
                >
                  {submitting ? "..." : "📤 إرسال للمصنع"}
                </button>
              </div>
            </div>
          )}

          <div style={S.footNote}>
            بمجرد التأكيد لن يمكن تغييره — يرجى التحقق من الكمية قبل الضغط.
            <br />
            الرابط صالح لمدة 24 ساعة من أول تأكيد.
          </div>
        </div>
      </div>
    </div>
  );
}
