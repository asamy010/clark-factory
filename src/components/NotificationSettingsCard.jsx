/* ═══════════════════════════════════════════════════════════════
   CLARK — Notification Settings Card (V21.9.173, Phase 22e — Slice 5/14)
   ───────────────────────────────────────────────────────────────

   Single self-contained card for the Settings page. Provides:
   - Browser support detection + permission state display
   - iOS PWA install guidance modal
   - "تفعيل الإشعارات" button (user gesture → permission + subscribe)
   - Per-category preferences toggles
   - List of own subscribed devices + revoke per-device / all
   - Admin/manager-only: broadcast form to send a manual push

   Architecture:
   - The card NEVER auto-initializes notifications — only on user click.
     This avoids the page-load permission prompt that browsers auto-deny.
   - State is local React state + Firestore reads of own subscriptions.
   - Imports notifications.js lazily on first action to keep the main
     bundle small for users who never enable.

   Note: this card stands alone — the entire push notification feature
   is encapsulated in this component + the 6 supporting files. Removing
   the card from SettingsPg would make the feature invisible without
   touching any code outside this file.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "../firebase.js";

const CATEGORIES = [
  { key: "treasury",      label: "💰 تحويلات الخزنة", desc: "إشعار عند كل حركة خزنة جديدة" },
  { key: "tasks",         label: "✅ المهام",          desc: "مهمة جديدة مخصصة لك أو متأخرة" },
  { key: "instructions",  label: "📋 التعليمات",       desc: "تعليمات إدارية أو تغييرات في السياسة" },
  { key: "warnings",      label: "⚠️ التحذيرات",        desc: "أخطاء حرجة أو مشاكل في النظام" },
  { key: "approvals",     label: "👍 الموافقات",        desc: "طلبات تنتظر موافقتك" },
  { key: "broadcast",     label: "📢 الإعلانات",        desc: "رسائل عامة من الإدارة" },
  { key: "daily_summary", label: "📊 الملخص اليومي",    desc: "ملخص نشاط اليوم — كل صباح" },
];

export function NotificationSettingsCard({
  T, FS, isMob, showToast, tell, ask,
  Btn, Card, Sel, Inp,
  userRole,
}) {
  /* Env state */
  const [supported, setSupported] = useState(true);
  const [requiresInstall, setRequiresInstall] = useState(false);
  const [permission, setPermission] = useState("default");
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  /* Subscription state */
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);

  /* Broadcast form state (admin/manager only) */
  const [bcCategory, setBcCategory] = useState("broadcast");
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcUrgency, setBcUrgency] = useState("normal");
  const [bcSending, setBcSending] = useState(false);

  const isPrivileged = userRole === "admin" || userRole === "manager";

  /* ─── Detect environment on mount ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("../utils/notifications.js");
        const env = mod.getEnvironmentInfo();
        if (cancelled) return;
        setSupported(env.supported);
        setRequiresInstall(env.requiresInstall);
        setPermission(env.permission);
        setIos(env.ios);
        setStandalone(env.standalone);
      } catch (_) { /* fallback to defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ─── Subscribe to own devices (live updates when subscribe/unsubscribe) ─── */
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "notificationSubscriptions"),
      where("userId", "==", user.uid)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      /* Sort: active first, then by lastSeenAt desc */
      list.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
      });
      setDevices(list);
    }, err => {
      console.warn("[V21.9.173] notificationSubscriptions listener error:", err?.code);
    });
    return () => unsub();
  }, []);

  /* ─── Enable notifications — user-gesture entry point ─── */
  const enableNotifications = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        tell("سجّل الدخول أولاً", "لازم تسجل دخول قبل ما تفعّل الإشعارات", { danger: true });
        return;
      }

      const mod = await import("../utils/notifications.js");

      /* iOS Safari install check first */
      const env = mod.getEnvironmentInfo();
      if (env.requiresInstall) {
        tell(
          "📱 تثبيت التطبيق مطلوب",
          "لتفعيل الإشعارات على iPhone:\n\n" +
          "1. اضغط زر المشاركة في Safari\n" +
          "2. اختار 'إضافة إلى الشاشة الرئيسية'\n" +
          "3. افتح التطبيق من الأيقونة الجديدة\n" +
          "4. ارجع لهذه الصفحة وفعّل الإشعارات"
        );
        return;
      }

      const result = await mod.requestPermissionAndSubscribe(user);

      /* Refresh permission state */
      setPermission((typeof Notification !== "undefined" && Notification.permission) || "default");

      if (!result.ok) {
        if (result.reason === "permission_denied") {
          tell(
            "تم رفض الإذن",
            "متصفحك رفض إذن الإشعارات. لتفعيلها لاحقاً، افتح إعدادات الموقع في المتصفح وغيّر الإشعارات لـ 'سماح'.",
            { danger: true }
          );
        } else if (result.reason === "vapid_key_missing") {
          tell(
            "إعدادات السيرفر ناقصة",
            "VITE_FIREBASE_VAPID_KEY غير معرّفة في إعدادات Vercel. تواصل مع الأدمن.",
            { danger: true }
          );
        } else if (result.reason === "unsupported_browser") {
          tell("المتصفح لا يدعم الإشعارات", "جرّب Chrome أو Edge أو Safari (مع PWA install على iOS)", { danger: true });
        } else {
          tell("تعذر التفعيل", "السبب: " + (result.error || result.reason || "غير معروف"), { danger: true });
        }
        return;
      }

      if (result.warning === "backend_save_failed" || result.warning === "backend_unreachable") {
        tell(
          "تم تفعيل الإذن — لكن في تنبيه",
          "السيرفر مش بـ يقدر يحفظ الاشتراك دلوقتي (" + result.warning + "). جرّب تاني بعد دقيقة.",
          { danger: true }
        );
      } else {
        showToast("✅ تم تفعيل الإشعارات على هذا الجهاز");
      }
    } catch (e) {
      tell("خطأ", String(e?.message || e), { danger: true });
    } finally {
      setLoading(false);
    }
  }, [loading, tell, showToast]);

  /* ─── Toggle category preference ─── */
  const togglePreference = useCallback(async (subscriptionId, categoryKey, currentValue) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      const newValue = !currentValue;
      /* We don't have a dedicated preferences endpoint yet — write directly
         via Firestore SDK. The rules permit own-subscription updates. */
      const { doc, updateDoc } = await import("firebase/firestore");
      const ref = doc(db, "notificationSubscriptions", subscriptionId);
      await updateDoc(ref, {
        ["preferences." + categoryKey]: newValue,
      });
      showToast(newValue ? "✓ تم تفعيل التصنيف" : "✓ تم إيقاف التصنيف");
    } catch (e) {
      tell("تعذر التحديث", String(e?.message || e), { danger: true });
    }
  }, [showToast, tell]);

  /* ─── Revoke a device ─── */
  const revokeDevice = useCallback(async (subscriptionId, deviceLabel) => {
    const ok = await ask(
      "إلغاء اشتراك الجهاز",
      "هل تريد إيقاف الإشعارات على: " + deviceLabel + "؟"
    );
    if (!ok) return;
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : null;
      const res = await fetch("/api/notifications/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": "Bearer " + idToken } : {}),
        },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        tell("فشل الإلغاء", err.error || "Status " + res.status, { danger: true });
        return;
      }
      showToast("✓ تم إلغاء اشتراك الجهاز");
    } catch (e) {
      tell("خطأ في الاتصال", String(e?.message || e), { danger: true });
    }
  }, [ask, tell, showToast]);

  /* ─── Send broadcast (admin/manager only) ─── */
  const sendBroadcast = useCallback(async () => {
    if (!isPrivileged) return;
    if (!bcTitle.trim()) {
      showToast("⚠️ العنوان مطلوب");
      return;
    }
    if (bcSending) return;
    setBcSending(true);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : null;
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": "Bearer " + idToken } : {}),
        },
        body: JSON.stringify({
          category: bcCategory,
          title: bcTitle.trim(),
          body: bcBody.trim(),
          urgency: bcUrgency,
          audience: { mode: "all" },
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) {
        tell("فشل الإرسال", result.error || "Status " + res.status, { danger: true });
        return;
      }
      tell(
        "✅ تم الإرسال",
        "تم إرسال الإشعار لـ " + result.sentTo + " جهاز.\n" +
        "نجح: " + result.successCount + "\n" +
        "فشل: " + result.failureCount +
        (result.invalidTokens > 0 ? "\n(تم إيقاف " + result.invalidTokens + " جهاز قديم)" : "")
      );
      setBcTitle("");
      setBcBody("");
    } catch (e) {
      tell("خطأ في الاتصال", String(e?.message || e), { danger: true });
    } finally {
      setBcSending(false);
    }
  }, [isPrivileged, bcCategory, bcTitle, bcBody, bcUrgency, bcSending, showToast, tell]);

  /* ─── Render ─── */
  const activeDevices = devices.filter(d => d.active);
  const hasAnySubscription = activeDevices.length > 0;
  const cur = devices.find(d => d.active);  // first active = "this device" approximation
  const curPrefs = cur?.preferences || {};

  return (
    <Card title={"🔔 إعدادات الإشعارات"} style={{ marginBottom: 16 }}>
      {/* Status section */}
      <div style={{ padding: 10, borderRadius: 10, background: T.bg, border: "1px solid " + T.brd, marginBottom: 12 }}>
        <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 6 }}>الحالة</div>
        {!supported && (
          <div style={{ color: T.err, fontSize: FS - 1, fontWeight: 700 }}>
            ⛔ المتصفح لا يدعم الإشعارات الفورية
          </div>
        )}
        {supported && requiresInstall && (
          <div style={{ color: T.warn, fontSize: FS - 1, fontWeight: 700 }}>
            📱 على iPhone — لازم تثبت التطبيق على الشاشة الرئيسية أولاً (اضغط ⬆️ في Safari → "إضافة إلى الشاشة الرئيسية")
          </div>
        )}
        {supported && !requiresInstall && (
          <div style={{ fontSize: FS - 1 }}>
            <div>الإذن: <b style={{
              color: permission === "granted" ? T.ok : permission === "denied" ? T.err : T.warn,
            }}>{permission === "granted" ? "✅ ممنوح" : permission === "denied" ? "⛔ مرفوض" : "⏳ في انتظار التفعيل"}</b></div>
            <div style={{ marginTop: 4 }}>الأجهزة المشتركة: <b>{activeDevices.length}</b></div>
          </div>
        )}
      </div>

      {/* Enable button */}
      {supported && permission !== "granted" && !requiresInstall && (
        <div style={{ marginBottom: 12 }}>
          <Btn primary onClick={enableNotifications} disabled={loading} style={{ width: "100%" }}>
            {loading ? "⏳ جاري التفعيل..." : "🔔 تفعيل الإشعارات على هذا الجهاز"}
          </Btn>
        </div>
      )}

      {permission === "denied" && (
        <div style={{ padding: 10, borderRadius: 8, background: T.err + "08", border: "1px solid " + T.err + "30", color: T.err, fontSize: FS - 1, marginBottom: 12 }}>
          ⛔ الإذن مرفوض من المتصفح. لتفعيله: افتح إعدادات الموقع في شريط العنوان → غيّر الإشعارات لـ "سماح" → اضغط F5 ثم جرّب مرة أخرى.
        </div>
      )}

      {/* Per-category preferences (only if subscribed) */}
      {hasAnySubscription && cur && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 6, fontWeight: 700 }}>التصنيفات المُفعّلة</div>
          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "repeat(2, 1fr)", gap: 6 }}>
            {CATEGORIES.map(cat => {
              const enabled = curPrefs[cat.key] !== false;
              return (
                <label key={cat.key} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 8,
                  background: enabled ? T.ok + "06" : T.bg,
                  border: "1px solid " + (enabled ? T.ok + "30" : T.brd),
                  cursor: "pointer",
                }}>
                  <input type="checkbox" checked={enabled}
                    onChange={() => togglePreference(cur.id, cat.key, enabled)}
                    style={{ accentColor: T.ok, transform: "scale(1.2)" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS - 1, fontWeight: 700 }}>{cat.label}</div>
                    <div style={{ fontSize: FS - 3, color: T.textSec }}>{cat.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Quiet Hours — V21.9.177 (Slice 11) */}
      {hasAnySubscription && cur && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: T.bg, border: "1px solid " + T.brd }}>
          <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 6, fontWeight: 700 }}>🌙 ساعات الهدوء</div>
          <div style={{ fontSize: FS - 3, color: T.textSec, marginBottom: 8 }}>
            خلال الفترة دي، الإشعارات العادية ما تظهرش — التحذيرات العاجلة فقط بـ توصل
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS - 1, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!cur.quietHours?.enabled}
              onChange={async (e) => {
                try {
                  const { doc, updateDoc } = await import("firebase/firestore");
                  const ref = doc(db, "notificationSubscriptions", cur.id);
                  await updateDoc(ref, {
                    "quietHours.enabled": e.target.checked,
                    ...(cur.quietHours?.from ? {} : { "quietHours.from": "22:00" }),
                    ...(cur.quietHours?.to   ? {} : { "quietHours.to":   "07:00" }),
                  });
                  showToast(e.target.checked ? "✓ تم تفعيل ساعات الهدوء" : "✓ تم إيقاف ساعات الهدوء");
                } catch (err) { tell("تعذر التحديث", String(err?.message || err), { danger: true }); }
              }}
              style={{ accentColor: T.accent, transform: "scale(1.2)" }}
            />
            تفعيل ساعات الهدوء
          </label>
          {cur.quietHours?.enabled && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>من</label>
                <Inp
                  type="time"
                  value={cur.quietHours?.from || "22:00"}
                  onChange={async (v) => {
                    try {
                      const { doc, updateDoc } = await import("firebase/firestore");
                      await updateDoc(doc(db, "notificationSubscriptions", cur.id), { "quietHours.from": v });
                    } catch (_) { /* ignore */ }
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>إلى</label>
                <Inp
                  type="time"
                  value={cur.quietHours?.to || "07:00"}
                  onChange={async (v) => {
                    try {
                      const { doc, updateDoc } = await import("firebase/firestore");
                      await updateDoc(doc(db, "notificationSubscriptions", cur.id), { "quietHours.to": v });
                    } catch (_) { /* ignore */ }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS - 1, color: T.textSec, marginBottom: 6, fontWeight: 700 }}>الأجهزة ({devices.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {devices.map(d => {
              const dev = d.device || {};
              const label = [
                dev.os && dev.os !== "unknown" ? dev.os : null,
                dev.browser && dev.browser !== "unknown" ? dev.browser : null,
                dev.type && dev.type !== "unknown" ? dev.type : null,
              ].filter(Boolean).join(" · ") || "جهاز";
              return (
                <div key={d.id} style={{
                  padding: "8px 10px", borderRadius: 8,
                  background: d.active ? T.ok + "06" : T.err + "06",
                  border: "1px solid " + (d.active ? T.ok + "30" : T.err + "30"),
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS - 1, fontWeight: 700 }}>
                      {d.active ? "✅" : "⏸"} {label}
                    </div>
                    <div style={{ fontSize: FS - 3, color: T.textSec }}>
                      آخر استخدام: {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("ar-EG") : "—"}
                    </div>
                  </div>
                  {d.active && (
                    <Btn small ghost onClick={() => revokeDevice(d.id, label)}>إلغاء</Btn>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin broadcast form */}
      {isPrivileged && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: T.accent + "06", border: "1px solid " + T.accent + "30" }}>
          <div style={{ fontSize: FS, fontWeight: 800, color: T.accent, marginBottom: 8 }}>📢 إرسال إشعار يدوي</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>التصنيف</label>
                <Sel value={bcCategory} onChange={setBcCategory}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Sel>
              </div>
              <div>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>الأهمية</label>
                <Sel value={bcUrgency} onChange={setBcUrgency}>
                  <option value="low">🔵 عادي (صامت)</option>
                  <option value="normal">🟢 عادي</option>
                  <option value="high">🔴 عاجل (يتطلب تفاعل)</option>
                </Sel>
              </div>
            </div>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>العنوان *</label>
              <Inp value={bcTitle} onChange={setBcTitle} placeholder="عنوان الإشعار (≤200 حرف)" maxLength={200}/>
            </div>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600 }}>النص</label>
              <Inp value={bcBody} onChange={setBcBody} placeholder="نص الإشعار (≤500 حرف)" maxLength={500}/>
            </div>
            <div style={{ fontSize: FS - 3, color: T.textSec, fontStyle: "italic" }}>
              ⚠️ تذكير الخصوصية: العنوان والنص ظاهرين على شاشة قفل الموبايل. ما تكتبش معلومات حساسة.
            </div>
            <Btn primary onClick={sendBroadcast} disabled={bcSending} style={{ width: "100%" }}>
              {bcSending ? "⏳ جاري الإرسال..." : "📤 إرسال لكل المستخدمين"}
            </Btn>
          </div>
        </div>
      )}

      {/* Footer help */}
      <div style={{ marginTop: 14, fontSize: FS - 3, color: T.textSec, fontStyle: "italic" }}>
        💡 الإشعارات بتشتغل حتى لو التطبيق مقفول. عند الضغط على الإشعار، التطبيق بـ يفتح على الصفحة المناسبة.
      </div>
    </Card>
  );
}

export default NotificationSettingsCard;
