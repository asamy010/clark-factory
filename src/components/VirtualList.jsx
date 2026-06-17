/* ═══════════════════════════════════════════════════════════════
   CLARK — VirtualList (V21.27.28)

   wrapper رفيع حوالين react-window v2 `<List>` — بيـ render الصفوف
   الظاهرة على الشاشة بس (+ overscan) بدل كل الصفوف. الفايدة: قائمة بـ
   1500+ صف تفتح فوراً والتمرير حرير، مهما كان عدد الصفوف.

   استخدام:
     <VirtualList
        items={rows}              // مصفوفة العناصر
        rowHeight={54}            // ارتفاع الصف بالبكسل (ثابت)
        height={640}              // ارتفاع منطقة التمرير
        renderRow={(item,index,style)=> <div style={style}>...</div>}
     />

   ملاحظات:
   - الـ `style` اللي بيوصل renderRow فيه position/top/height من react-window
     ولازم يتحطّ على العنصر الخارجي للصف (مايتشالش).
   - RTL: القائمة عمودية فالاتجاه الأفقي بيتبع flow الصفحة (RTL) طبيعي —
     مفيش إعداد خاص مطلوب.
   - الأداء: react-window بيعيد render الصفوف لما `items`/`renderRow` يتغيّروا
     (عبر rowProps) — يعني وقت الفلترة/تغيّر الداتا بس، مش كل scroll.
   ═══════════════════════════════════════════════════════════════ */

import React, { useRef, useState, useLayoutEffect } from "react";
import { List } from "react-window";

/* مكوّن صف ثابت (module-level) — react-window v2 بيمرّر له index/style
   تلقائياً + القيم اللي في rowProps (items + renderRow). تثبيته على مستوى
   الموديول بيمنع إعادة الـ mount غير الضرورية. */
function VRow({ index, style, items, renderRow }) {
  const item = items[index];
  if (item === undefined) return null;
  return renderRow(item, index, style);
}

export function VirtualList({
  items,
  rowHeight,
  height,
  /* V21.27.29: لو height مش متمرّر، القائمة بتملأ من مكانها لحد آخر الشاشة
     (ناقص bottomGap) — عشان متبقاش «مقطوعة في النص». بتتحسب تلقائي وبتتحدّث
     مع تغيّر حجم النافذة أو عدد العناصر. */
  fillBottomGap = 24,
  minHeight = 220,
  renderRow,
  overscanCount = 6,
  className,
  style,
}) {
  const wrapRef = useRef(null);
  const autoMode = height == null;
  const [autoH, setAutoH] = useState(480);

  useLayoutEffect(() => {
    if (!autoMode) return;
    const recompute = () => {
      const el = wrapRef.current;
      if (!el || typeof window === "undefined") return;
      const top = el.getBoundingClientRect().top;
      const avail = window.innerHeight - top - fillBottomGap;
      const contentH = items.length * rowHeight;
      /* نملأ المتاح، بس من غير ما نتعدّى ارتفاع المحتوى الفعلي (يمنع فراغ
         كبير تحت القوائم القصيرة)، ومع حد أدنى معقول. */
      setAutoH(Math.max(minHeight, Math.min(avail, contentH)));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [autoMode, fillBottomGap, minHeight, items.length, rowHeight]);

  if (!Array.isArray(items) || items.length === 0) return null;
  const H = autoMode ? autoH : height;

  return (
    <div ref={wrapRef}>
      <List
        rowComponent={VRow}
        rowProps={{ items, renderRow }}
        rowCount={items.length}
        rowHeight={rowHeight}
        overscanCount={overscanCount}
        className={className}
        style={{ height: H, width: "100%", ...style }}
      />
    </div>
  );
}

export default VirtualList;
