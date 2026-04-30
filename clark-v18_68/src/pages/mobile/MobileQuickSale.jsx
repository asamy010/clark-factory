/* ═══════════════════════════════════════════════════════════════
   CLARK — MobileQuickSale.jsx
   
   V15.59: Mobile-optimized quick sale flow.
   
   Steps:
   1. Pick customer (search + large buttons)
   2. Scan QR for each model (or type manually)
   3. Review items + confirm
   4. Sale registered → audit log
   
   Integrates with existing upSales/upConfig APIs — uses same data model.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { QRScanner } from "../../components/ui.jsx";
import { playBeep } from "../../utils/audio.js";
import { getConfirmedStock } from "../../utils/orders.js";
import { gid, fmt } from "../../utils/format.js";
import { hapticLight, hapticMedium, hapticError, isDuplicateScan, searchOrders } from "./_shared.jsx";

export function MobileQuickSale({ data, upConfig, upSales, updOrder, user, onDone, setDirty }) {
  const [step, setStep] = useState("session"); /* V15.67: session | customer | scan | review */
  const [selectedSession, setSelectedSession] = useState(null); /* V15.67: null = free sale */
  const [sessSearch, setSessSearch] = useState("");
  const [selectedCust, setSelectedCust] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [items, setItems] = useState([]); /* [{orderId, modelNo, modelDesc, qty, price, rackSize}] */
  const [showScanner, setShowScanner] = useState(false);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [manualSearch, setManualSearch] = useState(""); /* V15.61: manual model search fallback */
  const [showManualSearch, setShowManualSearch] = useState(false);

  /* Track dirty state — notifies shell to confirm before exit */
  useEffect(() => { if (setDirty) setDirty(items.length > 0); }, [items, setDirty]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "";
  const customers = data.customers || [];
  const orders = data.orders || [];
  const sessions = data.custDeliverySessions || [];

  /* Show toast message for 2 seconds */
  const flash = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  /* V15.67: Sort sessions newest first, optional search */
  const filteredSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const q = sessSearch.trim().toLowerCase();
    if (!q) return sorted.slice(0, 20);
    return sorted.filter((s) => {
      const custNames = (s.custIds || []).map(id => customers.find(c => c.id === id)?.name || "").join(" ").toLowerCase();
      const modelNos = (s.modelIds || []).map(id => orders.find(o => o.id === id)?.modelNo || "").join(" ").toLowerCase();
      return (s.date || "").includes(q) || custNames.includes(q) || modelNos.includes(q);
    });
  }, [sessions, customers, orders, sessSearch]);

  /* V15.67: Filtered customers — if session selected, restrict to session's customers */
  const filteredCusts = useMemo(() => {
    let pool = customers;
    if (selectedSession) {
      const allowedIds = new Set(selectedSession.custIds || []);
      pool = customers.filter((c) => allowedIds.has(c.id));
    }
    const q = custSearch.trim().toLowerCase();
    if (!q) return pool.slice(0, 30);
    return pool.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  }, [customers, custSearch, selectedSession]);

  /* Total pieces + money */
  const totals = useMemo(() => {
    const qty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const money = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    return { qty, money };
  }, [items]);

  /* Discount from customer card */
  const discPct = Number(selectedCust?.discount) || 0;
  const discAmt = Math.round(totals.money * discPct / 100);
  const netAmt = totals.money - discAmt;

  /* V15.61: Shared logic for adding an order (used by scan + manual search) */
  const addOrderToCart = (orderId, rackSize) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      playBeep("error"); hapticError();
      flash("⛔ موديل غير موجود", "error");
      return false;
    }
    /* V15.67: If a session is selected, only allow its models */
    if (selectedSession) {
      const allowedModels = new Set(selectedSession.modelIds || []);
      if (!allowedModels.has(orderId)) {
        playBeep("error"); hapticError();
        flash("⛔ الموديل ده مش في التوزيعة", "error");
        return false;
      }
    }
    const stockQty = getConfirmedStock(order);
    const soldQty = (order.customerDeliveries || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
    const returnedQty = (order.customerReturns || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const alreadyInCart = items.filter((i) => i.orderId === orderId).reduce((s, i) => s + i.qty, 0);
    const available = stockQty - (soldQty - returnedQty) - alreadyInCart;
    const addQty = rackSize > 0 ? rackSize : 1;
    if (available < addQty) {
      playBeep("error"); hapticError();
      flash("⛔ المخزن ناقص — متاح: " + available, "error");
      return false;
    }
    const existing = items.findIndex((i) => i.orderId === orderId);
    if (existing >= 0) {
      const copy = [...items];
      copy[existing] = { ...copy[existing], qty: copy[existing].qty + addQty };
      setItems(copy);
    } else {
      setItems([...items, {
        orderId,
        modelNo: order.modelNo || "",
        modelDesc: order.modelDesc || "",
        qty: addQty,
        price: Number(order.sellPrice) || 0,
        rackSize: rackSize,
        available: available,
      }]);
    }
    playBeep("ok"); hapticMedium();
    flash("✓ " + order.modelNo + " +" + addQty, "ok");
    return true;
  };

  /* Handle QR scan — add model to cart */
  const handleScan = (text) => {
    setShowScanner(false);
    /* V15.61: Prevent duplicate scans within 1.5s */
    if (isDuplicateScan(text)) {
      setTimeout(() => setShowScanner(true), 400);
      return;
    }
    try {
      const parts = (text || "").split(":");
      if (parts[0] !== "CLARK" || !parts[1]) {
        playBeep("error"); hapticError();
        flash("⛔ QR غير صحيح", "error");
        setTimeout(() => setShowScanner(true), 800);
        return;
      }
      const orderId = parts[1];
      const rackSize = parts[2] ? Number(parts[2]) : 1;
      addOrderToCart(orderId, rackSize);
      /* Re-open scanner for continuous scanning */
      setTimeout(() => setShowScanner(true), 400);
    } catch (e) {
      playBeep("error"); hapticError();
      flash("⛔ خطأ في القراءة", "error");
      setTimeout(() => setShowScanner(true), 800);
    }
  };

  /* V15.61: Manual search results */
  const manualResults = useMemo(() => {
    if (!showManualSearch) return [];
    let pool = orders.filter((o) => getConfirmedStock(o) > 0);
    /* V15.67: Restrict to session models if a session is active */
    if (selectedSession) {
      const allowed = new Set(selectedSession.modelIds || []);
      pool = pool.filter((o) => allowed.has(o.id));
    }
    return searchOrders(pool, manualSearch);
  }, [orders, manualSearch, showManualSearch, selectedSession]);

  /* Remove item from cart */
  const removeItem = (idx) => {
    const copy = [...items];
    copy.splice(idx, 1);
    setItems(copy);
  };

  /* Adjust quantity */
  const adjustQty = (idx, delta) => {
    const copy = [...items];
    const newQty = Math.max(0, copy[idx].qty + delta);
    if (newQty === 0) {
      copy.splice(idx, 1);
    } else {
      copy[idx] = { ...copy[idx], qty: newQty };
    }
    setItems(copy);
  };

  /* Save sale to Firestore */
  const saveSale = async () => {
    if (!selectedCust || items.length === 0) {
      flash("⛔ اختر عميل وأضف موديلات", "error");
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();
      /* V15.67: Use actual session id if selected, else "free" for free sale */
      const sessionId = selectedSession ? selectedSession.id : "free";
      const sessionDate = selectedSession ? selectedSession.date : today;
      /* V15.61: Parallelize writes for speed */
      await Promise.all(items.map((it) =>
        updOrder(it.orderId, (o) => {
          if (!o.customerDeliveries) o.customerDeliveries = [];
          o.customerDeliveries.push({
            id: gid(),
            custId: selectedCust.id,
            custName: selectedCust.name,
            qty: it.qty,
            date: sessionDate,
            price: it.price,
            sessionId: sessionId,
            createdBy: userName,
            createdAt: now,
          });
        })
      ));
      playBeep("done");
      flash("✅ تم تسجيل البيع: " + totals.qty + " قطعة", "ok");
      if (setDirty) setDirty(false);
      setTimeout(() => onDone && onDone(), 1000);
    } catch (e) {
      playBeep("error");
      flash("⛔ خطأ في الحفظ: " + (e.message || e), "error");
      setSaving(false);
    }
  };

  /* ─── Styles ─── */
  const S = {
    btn: {
      padding: "14px 18px",
      borderRadius: 12,
      border: "none",
      fontSize: 16,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      WebkitTapHighlightColor: "transparent",
    },
    input: {
      width: "100%",
      padding: "14px 16px",
      borderRadius: 12,
      border: "1px solid #334155",
      background: "#1E293B",
      color: "#fff",
      fontSize: 16,
      fontFamily: "inherit",
      boxSizing: "border-box",
    },
    card: {
      background: "#1E293B",
      borderRadius: 12,
      padding: "14px 16px",
      border: "1px solid #334155",
    },
  };

  /* ══ STEP 0 (V15.67): SESSION PICKER ══ */
  if (step === "session") {
    return (
      <div>
        <StepHeader title="الخطوة 1 من 4" subtitle="اختر طريقة البيع" />

        {/* V15.67: Two main options — with session or free sale */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 16 }}>
          {/* Free sale card */}
          <button
            onClick={() => { setSelectedSession(null); setStep("customer"); }}
            style={{
              ...S.card,
              padding: "18px 16px",
              textAlign: "right",
              cursor: "pointer",
              color: "#fff",
              fontFamily: "inherit",
              width: "100%",
              border: "2px solid #10B98140",
              background: "linear-gradient(135deg, #10B98108, #10B98102)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 28 }}>💰</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>بيع حر (بدون توزيعة)</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>أي عميل • أي موديل متاح في المخزن</div>
              </div>
              <div style={{ fontSize: 20, color: "#10B981" }}>←</div>
            </div>
          </button>
        </div>

        {/* Sessions list header */}
        <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, padding: "4px 4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1 }}>أو اختر توزيعة موجودة للمقارنة:</span>
          <span style={{ fontSize: 11, color: "#64748B" }}>{sessions.length} توزيعة</span>
        </div>

        {/* Session search */}
        {sessions.length > 5 && (
          <input
            style={{ ...S.input, marginBottom: 10, padding: "12px 14px", fontSize: 14 }}
            placeholder="🔍 ابحث بالتاريخ أو الموديل أو العميل..."
            value={sessSearch}
            onChange={(e) => setSessSearch(e.target.value)}
          />
        )}

        {/* Sessions list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#64748B" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
              {sessions.length === 0 ? "لا توجد توزيعات" : "لا توجد نتائج"}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const custCount = (s.custIds || []).length;
              const modelCount = (s.modelIds || []).length;
              const custNames = (s.custIds || []).slice(0, 2).map(id => customers.find(c => c.id === id)?.name || "").filter(Boolean);
              const modelNos = (s.modelIds || []).slice(0, 3).map(id => orders.find(o => o.id === id)?.modelNo || "").filter(Boolean);
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSession(s); setStep("customer"); setCustSearch(""); }}
                  style={{
                    ...S.card,
                    textAlign: "right",
                    cursor: "pointer",
                    color: "#fff",
                    fontFamily: "inherit",
                    width: "100%",
                    borderColor: "#0EA5E950",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: 22, marginTop: 2 }}>📋</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#0EA5E9" }}>📅 {s.date || "—"}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{custCount} عميل • {modelCount} موديل</div>
                      </div>
                      {custNames.length > 0 && (
                        <div style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          👥 {custNames.join("، ")}{custCount > 2 ? " +" + (custCount - 2) : ""}
                        </div>
                      )}
                      {modelNos.length > 0 && (
                        <div style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          🏷️ {modelNos.join("، ")}{modelCount > 3 ? " +" + (modelCount - 3) : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ STEP 1: CUSTOMER PICKER ══ */
  if (step === "customer") {
    return (
      <div>
        <StepHeader
          title={selectedSession ? "الخطوة 2 من 4" : "الخطوة 2 من 3"}
          subtitle={selectedSession ? "اختر العميل (من التوزيعة " + selectedSession.date + ")" : "اختر العميل"}
        />

        {/* V15.67: Session badge if selected */}
        {selectedSession && (
          <div style={{ ...S.card, marginBottom: 10, padding: "10px 12px", background: "#0EA5E915", border: "1px solid #0EA5E940", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700 }}>📋 التوزيعة النشطة</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0EA5E9", marginTop: 2 }}>{selectedSession.date}</div>
            </div>
            <button
              onClick={() => { setSelectedSession(null); setStep("session"); setCustSearch(""); }}
              style={{ padding: "6px 10px", borderRadius: 8, background: "#1E293B", border: "1px solid #334155", color: "#94A3B8", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              ✕ تغيير
            </button>
          </div>
        )}

        <input
          style={S.input}
          placeholder="🔍 ابحث بالاسم أو التليفون..."
          value={custSearch}
          onChange={(e) => setCustSearch(e.target.value)}
        />

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredCusts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#64748B" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              {selectedSession ? "التوزيعة دي مفيهاش عملاء مطابقين" : "لا توجد نتائج"}
            </div>
          ) : (
            filteredCusts.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCust(c);
                  setStep("scan");
                  setTimeout(() => setShowScanner(true), 300);
                }}
                style={{
                  ...S.card,
                  textAlign: "right",
                  cursor: "pointer",
                  color: "#fff",
                  fontFamily: "inherit",
                  width: "100%",
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {c.phone && <span>📞 {c.phone}</span>}
                  {c.type && <span>🏷️ {c.type}</span>}
                  {Number(c.discount) > 0 && (
                    <span style={{ color: "#F59E0B", fontWeight: 700 }}>💰 خصم {c.discount}%</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ STEP 2: SCAN ══ */
  if (step === "scan") {
    return (
      <div>
        <StepHeader
          title={selectedSession ? "الخطوة 3 من 4" : "الخطوة 2 من 3"}
          subtitle={"امسح QR الموديلات — " + selectedCust.name}
        />
        {/* V15.67: Session comparison badge */}
        {selectedSession && (()=>{
          const sessModels = (selectedSession.modelIds || []).map(id => {
            const o = orders.find(x => x.id === id);
            if (!o) return null;
            const planned = (selectedSession.grid || {})[id + "_" + selectedCust.id] || 0;
            const scanned = items.filter(it => it.orderId === id).reduce((s, it) => s + it.qty, 0);
            return { id, modelNo: o.modelNo, planned: Number(planned) || 0, scanned };
          }).filter(Boolean);
          const totalPlanned = sessModels.reduce((s, m) => s + m.planned, 0);
          const totalScanned = sessModels.reduce((s, m) => s + m.scanned, 0);
          return (
            <div style={{ ...S.card, marginBottom: 10, padding: "10px 12px", background: "#0EA5E908", border: "1px solid #0EA5E940" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0EA5E9" }}>📋 مقارنة بالتوزيعة</div>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700 }}>
                  {totalScanned} / {totalPlanned} قطعة
                </div>
              </div>
              {totalPlanned > 0 && (
                <div style={{ height: 4, borderRadius: 2, background: "#0F172A", overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: Math.min(100, (totalScanned / totalPlanned) * 100) + "%", background: totalScanned > totalPlanned ? "#EF4444" : "#10B981", transition: "width 0.3s" }} />
                </div>
              )}
              {sessModels.filter(m => m.planned > 0).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 120, overflowY: "auto" }}>
                  {sessModels.filter(m => m.planned > 0).map(m => {
                    const diff = m.scanned - m.planned;
                    const color = diff === 0 && m.scanned > 0 ? "#10B981" : diff > 0 ? "#EF4444" : m.scanned > 0 ? "#F59E0B" : "#64748B";
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "2px 0" }}>
                        <span style={{ color: "#CBD5E1", fontWeight: 700 }}>{m.modelNo}</span>
                        <span style={{ color, fontWeight: 800 }}>
                          {m.scanned} / {m.planned} {diff !== 0 && m.scanned > 0 ? `(${diff > 0 ? "+" : ""}${diff})` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Scanner area */}
        {showScanner ? (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 14, border: "2px solid #0EA5E9" }}>
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            <button
              onClick={() => setShowScanner(false)}
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ✕ إيقاف
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowScanner(true)}
            style={{
              ...S.btn,
              background: "#0EA5E9",
              color: "#fff",
              width: "100%",
              padding: "20px",
              fontSize: 18,
              marginBottom: 10,
            }}
          >
            📷 فتح الكاميرا للمسح
          </button>
        )}

        {/* V15.61: Manual search fallback */}
        {!showManualSearch ? (
          <button
            onClick={() => setShowManualSearch(true)}
            style={{ ...S.btn, background: "#1E293B", border: "1px solid #334155", color: "#94A3B8", width: "100%", padding: "10px", fontSize: 13, marginBottom: 14 }}
          >
            🔎 بحث يدوي (لو الـ QR مش شغال)
          </button>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                style={{ ...S.input, padding: "12px 14px" }}
                placeholder="رقم الموديل أو الوصف..."
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                autoFocus
              />
              <button
                onClick={() => { setShowManualSearch(false); setManualSearch(""); }}
                style={{ width: 44, borderRadius: 12, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", fontSize: 18, cursor: "pointer", fontFamily: "inherit" }}
              >
                ✕
              </button>
            </div>
            {manualResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {manualResults.map((o) => {
                  const stock = getConfirmedStock(o);
                  const sold = (o.customerDeliveries || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
                  const ret = (o.customerReturns || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
                  const avail = stock - (sold - ret);
                  return (
                    <button
                      key={o.id}
                      onClick={() => {
                        if (addOrderToCart(o.id, 1)) {
                          setShowManualSearch(false);
                          setManualSearch("");
                        }
                      }}
                      style={{ ...S.card, textAlign: "right", cursor: "pointer", color: "#fff", fontFamily: "inherit", width: "100%", padding: "10px 12px" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{o.modelNo}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{o.modelDesc}</div>
                        </div>
                        <div style={{ fontSize: 11, color: avail > 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                          متاح: {avail}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {manualSearch.trim() && manualResults.length === 0 && (
              <div style={{ textAlign: "center", padding: 16, color: "#64748B", fontSize: 13 }}>
                لا توجد نتائج
              </div>
            )}
          </div>
        )}

        {/* Items cart */}
        {items.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700, paddingInlineStart: 4 }}>
              السلة ({items.length} موديل • {totals.qty} قطعة)
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.modelDesc}
                  </div>
                  {it.price > 0 && (
                    <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700, marginTop: 3 }}>
                      {it.qty} × {fmt(it.price)} = {fmt(it.qty * it.price)} ج.م
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => adjustQty(i, -1)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#0F172A", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", minWidth: 32, textAlign: "center" }}>{it.qty}</span>
                  <button
                    onClick={() => adjustQty(i, 1)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #334155", background: "#0F172A", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeItem(i)}
                    style={{ marginInlineStart: 4, width: 32, height: 32, borderRadius: 8, border: "1px solid #EF444440", background: "#EF444410", color: "#EF4444", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 30, color: "#64748B", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
            <div style={{ fontSize: 14 }}>السلة فارغة — امسح QR لإضافة موديل</div>
          </div>
        )}

        {/* Actions */}
        <button
          onClick={() => setStep("review")}
          disabled={items.length === 0}
          style={{
            ...S.btn,
            background: items.length > 0 ? "#10B981" : "#1E293B",
            color: items.length > 0 ? "#fff" : "#64748B",
            width: "100%",
            padding: "18px",
            fontSize: 17,
            border: items.length > 0 ? "none" : "1px solid #334155",
          }}
        >
          {items.length > 0 ? `✓ مراجعة (${totals.qty} قطعة)` : "السلة فارغة"}
        </button>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  /* ══ STEP 3: REVIEW + CONFIRM ══ */
  return (
    <div>
      <StepHeader
        title={selectedSession ? "الخطوة 4 من 4" : "الخطوة 3 من 3"}
        subtitle="مراجعة وتأكيد"
      />

      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>العميل</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>{selectedCust.name}</div>
        {selectedCust.phone && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>📞 {selectedCust.phone}</div>}
      </div>

      {/* Items summary */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{it.modelNo}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                {it.qty} قطعة {it.price > 0 ? "× " + fmt(it.price) + " = " + fmt(it.qty * it.price) + " ج.م" : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Totals breakdown */}
      <div style={{ ...S.card, marginBottom: 14, background: "#0EA5E918", border: "1.5px solid #0EA5E940" }}>
        <Row label="إجمالي القطع" value={fmt(totals.qty) + " قطعة"} />
        {totals.money > 0 && (
          <>
            <Row label="الإجمالي قبل الخصم" value={fmt(totals.money) + " ج.م"} />
            {discPct > 0 && (
              <Row label={"خصم " + discPct + "%"} value={"-" + fmt(discAmt) + " ج.م"} color="#EF4444" />
            )}
            <div style={{ height: 1, background: "#334155", margin: "10px 0" }} />
            <Row label="الصافي المستحق" value={fmt(netAmt) + " ج.م"} big color="#10B981" />
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("scan")} style={{ ...S.btn, background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", flex: 1 }}>
          ← تعديل
        </button>
        <button
          onClick={saveSale}
          disabled={saving}
          style={{ ...S.btn, background: saving ? "#334155" : "#10B981", color: "#fff", flex: 2, padding: "16px" }}
        >
          {saving ? "⏳ جاري الحفظ..." : "✅ تأكيد البيع"}
        </button>
      </div>

      {toast && <Toast {...toast} />}
    </div>
  );
}

/* ─── Sub-components ─── */

function StepHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>{subtitle}</div>
    </div>
  );
}

function Row({ label, value, color, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: big ? 15 : 13, color: "#94A3B8", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: big ? 20 : 14, fontWeight: 900, color: color || "#fff" }}>{value}</span>
    </div>
  );
}

function Toast({ msg, type }) {
  const bg = type === "error" ? "#EF4444" : type === "ok" ? "#10B981" : "#0EA5E9";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: bg,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 12,
        fontSize: 15,
        fontWeight: 800,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        zIndex: 9999,
        maxWidth: "90vw",
        whiteSpace: "nowrap",
      }}
    >
      {msg}
    </div>
  );
}
