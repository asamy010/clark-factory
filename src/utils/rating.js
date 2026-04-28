/* ═══════════════════════════════════════════════════════════════
   CLARK — Customer Rating (V18.7)
   
   Calculates a 5-star rating for customers based on retention rate
   (sold = delivered - returned) divided by total delivered.
   
   Tiers (label + color):
   - ≥95%   → ممتاز      (green)
   - 85–94% → جيد جداً    (teal)
   - 70–84% → متوسط      (blue)
   - 50–69% → ضعيف       (orange)
   - <50%   → سيء        (red)
   
   Stars use half-star precision (linear mapping pct → stars).
   Customer with no deliveries → "لم يتم التقييم بعد" (no stars).
   ═══════════════════════════════════════════════════════════════ */

import React from "react";

export function getCustRating(delivered, returned) {
  const d = Number(delivered) || 0;
  const r = Number(returned) || 0;
  if (d <= 0) {
    return { rated: false, stars: 0, label: "لم يتم التقييم بعد", color: "#94A3B8", pct: 0, sold: 0, delivered: 0, returned: 0 };
  }
  const sold = Math.max(0, d - r);
  const pct = (sold / d) * 100;
  /* Linear half-star mapping: 0% → 0, 100% → 5, rounded to nearest 0.5 */
  const stars = Math.max(0, Math.min(5, Math.round((pct / 100) * 10) / 2));
  let label, color;
  if (pct >= 95) { label = "ممتاز"; color = "#059669"; }
  else if (pct >= 85) { label = "جيد جداً"; color = "#0D9488"; }
  else if (pct >= 70) { label = "متوسط"; color = "#0EA5E9"; }
  else if (pct >= 50) { label = "ضعيف"; color = "#F59E0B"; }
  else { label = "سيء"; color = "#DC2626"; }
  return { rated: true, stars, label, color, pct: Math.round(pct * 10) / 10, sold, delivered: d, returned: r };
}

/* Stars renderer — half-star precision via overlay technique.
   Use direction:ltr to ensure left-to-right fill regardless of parent dir. */
export function Stars({ value, size = 14, gap = 1 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const fillPct = (v / 5) * 100;
  return (
    <span style={{ position: "relative", display: "inline-block", fontSize: size, lineHeight: 1, direction: "ltr", letterSpacing: gap }}>
      <span style={{ color: "#E5E7EB" }}>★★★★★</span>
      <span style={{ position: "absolute", top: 0, left: 0, overflow: "hidden", width: fillPct + "%", color: "#FBBF24", whiteSpace: "nowrap", letterSpacing: gap }}>★★★★★</span>
    </span>
  );
}
