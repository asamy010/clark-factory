/* ═══════════════════════════════════════════════════════════════════════
   CLARK · validateOrder — خامة A القابلة للإيقاف (V21.27.180)
   ───────────────────────────────────────────────────────────────────────
   «خامة A مطلوبة» بقت قابلة للإيقاف من الإعدادات (requireFabricOnOrder=false)
   عشان حفظ أوامر ببيانات تكاليف ناقصة وإكمالها لاحقًا. الافتراضي = صارم.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { validateOrder } from "../orders.js";

/* فورم سليم في كل حاجة ما عدا خامة A (عشان نعزل أثر فلاج الخامة) */
const baseForm = () => ({
  modelNo: "M-100",
  modelDesc: "تيشيرت",
  sizeSetId: 1,
  date: "2026-06-29",
  orderPieces: [{ id: "p1", name: "قميص" }],
  fabricA: "", /* مفيش خامة */
});

describe("validateOrder — fabric A requirement toggle", () => {
  it("requires fabric A by default (backward-compatible strict behavior)", () => {
    const errs = validateOrder(baseForm());
    expect(errs).toContain("خامة A مطلوبة");
  });

  it("requires fabric A when explicitly enabled (requireFabricA=true)", () => {
    const errs = validateOrder(baseForm(), true);
    expect(errs).toContain("خامة A مطلوبة");
  });

  it("does NOT require fabric A when disabled (requireFabricA=false)", () => {
    const errs = validateOrder(baseForm(), false);
    expect(errs).not.toContain("خامة A مطلوبة");
  });

  it("still enforces the OTHER required fields when fabric is disabled", () => {
    /* فلاج الخامة موقوف، لكن باقي الحقول الناقصة لازم تفضل تتمنع */
    const errs = validateOrder({ ...baseForm(), modelNo: "", sizeSetId: "" }, false);
    expect(errs).toContain("رقم الموديل مطلوب");
    expect(errs).toContain("المقاسات مطلوبة");
    expect(errs).not.toContain("خامة A مطلوبة");
  });

  it("passes clean when fabric present (regardless of the toggle)", () => {
    const form = { ...baseForm(), fabricA: "5" };
    expect(validateOrder(form, true)).not.toContain("خامة A مطلوبة");
    expect(validateOrder(form, false)).not.toContain("خامة A مطلوبة");
  });
});
