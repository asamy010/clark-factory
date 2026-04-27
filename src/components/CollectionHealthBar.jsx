/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.75 — CollectionHealthBar
   ════════════════════════════════════════════════════════════════════════
   
   شريط حالة موجز يظهر في أعلى كل قسم رئيسي (Treasury, HR, Audit).
   
   المنطق المهم: بما إن البيانات موزّعة على documents منفصلة، الخطر الفعلي
   مش الإجمالي، بل **أكبر document** في الـcollection. لو document واحد
   اقترب من حد Firestore (1MB)، الخطر يبدأ.
   
   المستويات:
   - أخضر  (< 50% من 1MB):  ممتاز
   - أزرق  (< 70%):         جيد
   - أصفر  (< 85%):         انتباه
   - برتقالي (< 100%):       مرتفع
   - أحمر  (≥ 100%):         حرج
   
   ─── الاستخدام ───
   
   import { CollectionHealthBar } from "../components/CollectionHealthBar.jsx";
   
   // في أعلى الصفحة:
   <CollectionHealthBar 
     mode="split"               // أو "partitioned"
     collection="treasuryDays"   // اسم الـFirestore collection
     label="بيانات الخزنة"
     icon="💰"
   />
   ════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

const FIRESTORE_DOC_LIMIT = 1_048_576; /* 1 MB */
const FETCH_INTERVAL_MS = 60_000;       /* تحديث كل دقيقة */

/* تنسيق الحجم بشكل مختصر */
function fmtSize(b) {
  if (!b || b < 1024) return (b || 0) + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(2) + " MB";
}

/* تحديد مستوى الخطر بناءً على نسبة document من حد 1MB */
function getStatus(pct) {
  if (pct < 50)  return { color: "#10B981", label: "ممتاز",   icon: "🟢" };
  if (pct < 70)  return { color: "#0EA5E9", label: "جيد",     icon: "🔵" };
  if (pct < 85)  return { color: "#F59E0B", label: "انتباه",  icon: "🟡" };
  if (pct < 100) return { color: "#F97316", label: "مرتفع",   icon: "🟠" };
  return                { color: "#EF4444", label: "حرج",     icon: "🔴" };
}

/* جلب الإحصائيات من Firebase */
async function fetchCollectionHealth(collectionName) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    let totalSize = 0;
    let docCount = 0;
    let largestDocSize = 0;
    let largestDocId = null;
    let totalEntries = 0;

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const size = new Blob([JSON.stringify(data)]).size;
      totalSize += size;
      docCount++;

      if (size > largestDocSize) {
        largestDocSize = size;
        largestDocId = docSnap.id;
      }

      /* لو فيه entries (split mode) نعدّهم. لو مفيش (partitioned mode)، الـdoc نفسه entry */
      if (data && Array.isArray(data.entries)) {
        totalEntries += data.entries.length;
      } else {
        totalEntries++;
      }
    });

    return {
      totalSize,
      docCount,
      largestDocSize,
      largestDocId,
      totalEntries,
    };
  } catch (err) {
    console.error(`[CollectionHealthBar] Failed for ${collectionName}:`, err);
    return null;
  }
}

/* المكوّن الرئيسي */
export function CollectionHealthBar({ collection: collectionName, label, icon, mode = "split" }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    
    const load = async () => {
      const data = await fetchCollectionHealth(collectionName);
      if (cancelled) return;
      setHealth(data);
      setLoading(false);
    };
    
    load();
    /* تحديث دوري */
    const timer = setInterval(load, FETCH_INTERVAL_MS);
    
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [collectionName, refreshKey]);

  if (loading || !health) {
    return (
      <div style={{
        padding: "8px 12px",
        background: T.bg2 || T.bg,
        border: "1px solid " + T.brd,
        borderRadius: 8,
        marginBottom: 12,
        fontSize: FS - 2,
        color: T.textMut,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ opacity: 0.6 }}>⏳</span>
        <span>جاري حساب حالة التخزين…</span>
      </div>
    );
  }

  /* الخطر = نسبة أكبر document من حد 1MB */
  const dangerPct = (health.largestDocSize / FIRESTORE_DOC_LIMIT) * 100;
  const status = getStatus(dangerPct);
  const dangerPctRound = Math.round(dangerPct);

  /* العنوان: split = "أيام", partitioned = "documents/أسابيع" */
  const docLabel = mode === "partitioned" ? "ملف" : "يوم";

  return (
    <div style={{
      padding: 12,
      background: status.color + "08",
      border: "1px solid " + status.color + "30",
      borderRadius: 10,
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}>
      {/* أيقونة الحالة */}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: status.color + "15",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        flexShrink: 0,
      }}>
        {icon || status.icon}
      </div>

      {/* المعلومات الرئيسية */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{
          fontWeight: 700,
          fontSize: FS,
          color: status.color,
          marginBottom: 2,
        }}>
          {label} — <span style={{ fontSize: FS - 1 }}>{status.label}</span>
        </div>
        <div style={{
          fontSize: FS - 2,
          color: T.textSec,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span>
            الإجمالي: <b style={{ color: T.text }}>{fmtSize(health.totalSize)}</b>
          </span>
          <span>•</span>
          <span>
            <b style={{ color: T.text }}>{health.docCount}</b> {docLabel}
          </span>
          <span>•</span>
          <span>
            <b style={{ color: T.text }}>{health.totalEntries.toLocaleString("ar-EG")}</b> سجل
          </span>
        </div>
      </div>

      {/* شريط الخطر — أكبر document */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
        minWidth: 160,
      }}>
        <div style={{
          fontSize: FS - 3,
          color: T.textMut,
        }}>
          أكبر {docLabel}: <b style={{ color: status.color }}>{fmtSize(health.largestDocSize)}</b>
          <span style={{ marginInlineStart: 6 }}>({dangerPctRound}% من 1MB)</span>
        </div>
        <div style={{
          width: 160,
          height: 6,
          borderRadius: 3,
          background: T.bg,
          border: "1px solid " + T.brd,
          overflow: "hidden",
        }}>
          <div style={{
            width: Math.min(100, dangerPct) + "%",
            height: "100%",
            background: status.color,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>
    </div>
  );
}
