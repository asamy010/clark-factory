/* ═══════════════════════════════════════════════════════════════
   CLARK — ConfirmPage.jsx
   
   Public confirmation page for customer delivery verification.
   Opened when QR code is scanned from delivery receipt.
   URL format: /?dc=1&s=<sessionId>&c=<custId>&sig=<hmac>
   
   No login required. All validation done server-side via HMAC signature.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { tell } from "../utils/popups.js";

const fmt = (n) => (n == null ? "0" : Math.round(Number(n)).toLocaleString("en-US"));

export function ConfirmPage({ params }) {
  const { s: sessionId, c: custId, sig } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [issueMode, setIssueMode] = useState(false);
  const [issueNote, setIssueNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); /* {status, at} */

  /* Load delivery details on mount */
  useEffect(() => {
    const load = async () => {
      try {
        const url = "/api/delivery-confirm?s=" + encodeURIComponent(sessionId) +
                    "&c=" + encodeURIComponent(custId) +
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
  }, [sessionId, custId, sig]);

  const submit = async (action) => {
    if (action === "issue" && !issueNote.trim()) {
      tell("بيانات ناقصة","برجاء كتابة تفاصيل المشكلة",{danger:true});
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/delivery-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s: sessionId,
          c: custId,
          sig,
          action,
          note: action === "issue" ? issueNote.trim() : "",
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        tell("فشل الإرسال",j.error||"فشل إرسال التأكيد",{danger:true});
      } else {
        setSuccess({ status: action, at: j.at || new Date().toISOString() });
      }
    } catch (e) {
      tell("خطأ في الاتصال","تعذر الاتصال بالخادم — حاول مرة أخرى",{danger:true});
    }
    setSubmitting(false);
  };

  /* ─── Common styles ─── */
  const S = {
    page: {
      fontFamily: "'Cairo', 'Segoe UI', sans-serif",
      background: "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)",
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
      boxShadow: "0 10px 40px rgba(14, 165, 233, 0.15)",
      overflow: "hidden",
    },
    headerBar: {
      height: 4,
      background: "linear-gradient(90deg, #0EA5E9, #8B5CF6)",
    },
    header: {
      padding: "20px 24px 14px",
      borderBottom: "1px solid #E2E8F0",
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    logo: { width: 44, height: 44, objectFit: "contain", borderRadius: 8 },
    logoPh: {
      width: 44,
      height: 44,
      borderRadius: 8,
      background: "#F1F5F9",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
    },
    factoryName: { fontSize: 17, fontWeight: 900, color: "#0F172A", lineHeight: 1.2 },
    tagline: { fontSize: 12, color: "#64748B", marginTop: 2, fontWeight: 600 },
    body: { padding: "16px 20px 24px" },
    label: { fontSize: 12, color: "#64748B", fontWeight: 700, marginBottom: 4 },
    custBox: {
      padding: "10px 12px",
      background: "#F0F9FF",
      border: "1px solid #BAE6FD",
      borderRadius: 10,
      marginBottom: 14,
    },
    custName: { fontSize: 18, fontWeight: 900, color: "#0369A1", lineHeight: 1.3 },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginBottom: 14,
      fontSize: 13,
    },
    th: {
      padding: "8px 6px",
      background: "#F8FAFC",
      color: "#334155",
      fontWeight: 800,
      fontSize: 11,
      textAlign: "right",
      borderBottom: "2px solid #CBD5E1",
    },
    td: {
      padding: "7px 6px",
      borderBottom: "1px solid #F1F5F9",
      textAlign: "right",
      verticalAlign: "top",
    },
    totalRow: {
      background: "#FEF3C7",
      fontWeight: 900,
    },
    btn: {
      display: "block",
      width: "100%",
      padding: "14px 20px",
      borderRadius: 12,
      border: "none",
      fontSize: 16,
      fontWeight: 800,
      fontFamily: "inherit",
      cursor: "pointer",
      marginBottom: 10,
      transition: "transform 0.1s, box-shadow 0.2s",
    },
    btnConfirm: {
      background: "linear-gradient(135deg, #10B981, #059669)",
      color: "#fff",
      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
    },
    btnIssue: {
      background: "#fff",
      color: "#DC2626",
      border: "2px solid #FCA5A5",
    },
    btnCancel: {
      background: "#F1F5F9",
      color: "#64748B",
    },
    successBox: {
      padding: "20px 16px",
      borderRadius: 12,
      textAlign: "center",
      marginBottom: 12,
    },
  };

  /* ─── States ─── */
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.headerBar}></div>
          <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            جاري التحميل...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.headerBar}></div>
          <div style={{ padding: 30, textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>⛔</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626", marginBottom: 8 }}>
              خطأ
            </div>
            <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>{error}</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 16 }}>
              برجاء التواصل مع المصنع
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { customer, rows, grandTotalQty, grandTotalMoney, brand, session } = data;

  /* Success state — already confirmed */
  if (success) {
    const isConfirmed = success.status === "confirm";
    const ageMs = Date.now() - new Date(success.at).getTime();
    const canStillChange = ageMs < 24 * 60 * 60 * 1000;
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.headerBar}></div>
          <div style={S.header}>
            {brand.logo ? (
              <img src={brand.logo} alt="" style={S.logo} />
            ) : (
              <div style={S.logoPh}>🏭</div>
            )}
            <div>
              <div style={S.factoryName}>{brand.factoryName}</div>
              <div style={S.tagline}>نظام تسليم العملاء</div>
            </div>
          </div>
          <div style={S.body}>
            <div
              style={{
                ...S.successBox,
                background: isConfirmed ? "#D1FAE5" : "#FEE2E2",
                border: "2px solid " + (isConfirmed ? "#10B981" : "#EF4444"),
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 8 }}>{isConfirmed ? "✅" : "⚠️"}</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: isConfirmed ? "#065F46" : "#991B1B",
                  marginBottom: 6,
                }}
              >
                {isConfirmed ? "تم التأكيد بنجاح" : "تم تسجيل المشكلة"}
              </div>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>
                شكراً {customer.name}
              </div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "monospace" }}>
                {new Date(success.at).toLocaleString("ar-EG")}
              </div>
            </div>
            <div
              style={{
                padding: 12,
                background: "#F8FAFC",
                borderRadius: 10,
                fontSize: 12,
                color: "#64748B",
                textAlign: "center",
              }}
            >
              الإجمالي: <b style={{ color: "#0F172A" }}>{fmt(grandTotalQty)} قطعة</b>
              <span style={{ margin: "0 8px" }}>•</span>
              <b style={{ color: "#0F172A" }}>{fmt(grandTotalMoney)} ج.م</b>
            </div>
            {canStillChange && (
              <div
                style={{
                  fontSize: 11,
                  color: "#94A3B8",
                  textAlign: "center",
                  marginTop: 12,
                  lineHeight: 1.5,
                }}
              >
                تقدر تغيّر الرد خلال 24 ساعة — اتصل بالمحاسب لو فيه استفسار
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* Issue mode — show note input */
  if (issueMode) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.headerBar}></div>
          <div style={S.body}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#DC2626", marginBottom: 6 }}>
              ⚠️ اكتب تفاصيل المشكلة
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>
              المحاسب هيشوف رسالتك ويتواصل معاك
            </div>
            <textarea
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              placeholder="مثلاً: نقص في موديل 3261113 بـ 3 قطع..."
              maxLength={500}
              style={{
                width: "100%",
                minHeight: 120,
                padding: 12,
                borderRadius: 10,
                border: "1.5px solid #CBD5E1",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
              autoFocus
            />
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14, textAlign: "left" }}>
              {issueNote.length}/500 حرف
            </div>
            <button
              onClick={() => submit("issue")}
              disabled={submitting || !issueNote.trim()}
              style={{
                ...S.btn,
                background: issueNote.trim() ? "#DC2626" : "#FCA5A5",
                color: "#fff",
              }}
            >
              {submitting ? "جاري الإرسال..." : "📤 إرسال المشكلة"}
            </button>
            <button
              onClick={() => setIssueMode(false)}
              disabled={submitting}
              style={{ ...S.btn, ...S.btnCancel }}
            >
              رجوع
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Main review state */
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.headerBar}></div>
        <div style={S.header}>
          {brand.logo ? (
            <img src={brand.logo} alt="" style={S.logo} />
          ) : (
            <div style={S.logoPh}>🏭</div>
          )}
          <div style={{ flex: 1 }}>
            <div style={S.factoryName}>{brand.factoryName}</div>
            <div style={S.tagline}>تأكيد استلام التوزيعة</div>
          </div>
          {session.date && (
            <div
              style={{
                fontSize: 11,
                color: "#64748B",
                fontFamily: "monospace",
                fontWeight: 700,
              }}
            >
              {session.date}
            </div>
          )}
        </div>
        <div style={S.body}>
          <div style={S.custBox}>
            <div style={S.label}>العميل</div>
            <div style={S.custName}>🏢 {customer.name}</div>
            {customer.type && (
              <div style={{ fontSize: 12, color: "#0369A1", marginTop: 2 }}>{customer.type}</div>
            )}
          </div>

          <div style={S.label}>تفاصيل التوزيعة</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>الموديل</th>
                <th style={{ ...S.th, textAlign: "center" }}>الكمية</th>
                <th style={{ ...S.th, textAlign: "center" }}>السعر</th>
                <th style={{ ...S.th, textAlign: "left" }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 800, color: "#0369A1" }}>
                      {r.modelNo}
                      {r.isDiscounted && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: "#F59E0B18",
                            color: "#B45309",
                            fontWeight: 700,
                            marginInlineStart: 4,
                          }}
                        >
                          خصم
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                      {r.modelDesc}
                    </div>
                  </td>
                  <td style={{ ...S.td, textAlign: "center", fontWeight: 800, fontSize: 14 }}>
                    {fmt(r.qty)}
                  </td>
                  <td style={{ ...S.td, textAlign: "center", color: "#64748B" }}>
                    {r.price ? fmt(r.price) : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "left", fontWeight: 800 }}>{fmt(r.total)}</td>
                </tr>
              ))}
              <tr style={S.totalRow}>
                <td style={{ ...S.td, fontWeight: 900, color: "#78350F" }}>الإجمالي</td>
                <td
                  style={{ ...S.td, textAlign: "center", fontWeight: 900, color: "#78350F", fontSize: 15 }}
                >
                  {fmt(grandTotalQty)}
                </td>
                <td style={S.td}></td>
                <td
                  style={{ ...S.td, textAlign: "left", fontWeight: 900, color: "#78350F", fontSize: 15 }}
                >
                  {fmt(grandTotalMoney)} ج.م
                </td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              fontSize: 11,
              color: "#64748B",
              textAlign: "center",
              margin: "8px 0 16px",
              lineHeight: 1.6,
            }}
          >
            راجع التفاصيل بعناية — اختيارك نهائي بعد 24 ساعة
          </div>

          <button
            onClick={() => submit("confirm")}
            disabled={submitting}
            style={{ ...S.btn, ...S.btnConfirm }}
          >
            {submitting ? "جاري الإرسال..." : "✅ تأكيد الاستلام"}
          </button>
          <button
            onClick={() => setIssueMode(true)}
            disabled={submitting}
            style={{ ...S.btn, ...S.btnIssue }}
          >
            ⚠️ فيه مشكلة — برجاء المراجعة
          </button>

          <div
            style={{
              fontSize: 10,
              color: "#CBD5E1",
              textAlign: "center",
              marginTop: 20,
              paddingTop: 12,
              borderTop: "1px dashed #E2E8F0",
            }}
          >
            Powered by CLARK ERP System
          </div>
        </div>
      </div>
    </div>
  );
}
