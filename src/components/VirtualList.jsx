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

import React from "react";
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
  renderRow,
  overscanCount = 6,
  className,
  style,
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <List
      rowComponent={VRow}
      rowProps={{ items, renderRow }}
      rowCount={items.length}
      rowHeight={rowHeight}
      overscanCount={overscanCount}
      className={className}
      style={{ height, width: "100%", ...style }}
    />
  );
}

export default VirtualList;
