/* ═══════════════════════════════════════════════════════════════════════
   اختبارات التفقيط (tafqit.js) — V21.21.44
   مستند مالي → الدقة حرجة. كل القواعد متغطّاة: آحاد/عشرات/مئات/آلاف/ملايين/
   مليارات + المثنى (ألفان/مئتان) + الجمع (3-10) + التمييز (11+) + القروش.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { integerToArabicWords, tafqitEGP } from "../tafqit.js";

describe("integerToArabicWords — الأعداد بالحروف", () => {
  it("الآحاد والصفر", () => {
    expect(integerToArabicWords(0)).toBe("صفر");
    expect(integerToArabicWords(1)).toBe("واحد");
    expect(integerToArabicWords(9)).toBe("تسعة");
  });
  it("العشرات والـ teens", () => {
    expect(integerToArabicWords(10)).toBe("عشرة");
    expect(integerToArabicWords(11)).toBe("أحد عشر");
    expect(integerToArabicWords(20)).toBe("عشرون");
    expect(integerToArabicWords(25)).toBe("خمسة وعشرون");
    expect(integerToArabicWords(99)).toBe("تسعة وتسعون");
  });
  it("المئات", () => {
    expect(integerToArabicWords(100)).toBe("مائة");
    expect(integerToArabicWords(200)).toBe("مائتان");
    expect(integerToArabicWords(500)).toBe("خمسمائة");
    expect(integerToArabicWords(999)).toBe("تسعمائة وتسعة وتسعون");
  });
  it("الآلاف: مفرد/مثنى/جمع/تمييز", () => {
    expect(integerToArabicWords(1000)).toBe("ألف");
    expect(integerToArabicWords(1500)).toBe("ألف وخمسمائة");
    expect(integerToArabicWords(2000)).toBe("ألفان");
    expect(integerToArabicWords(3000)).toBe("ثلاثة آلاف");
    expect(integerToArabicWords(10000)).toBe("عشرة آلاف");
    expect(integerToArabicWords(11000)).toBe("أحد عشر ألف");
    expect(integerToArabicWords(21500)).toBe("واحد وعشرون ألف وخمسمائة");
  });
  it("الملايين والمليارات", () => {
    expect(integerToArabicWords(1000000)).toBe("مليون");
    expect(integerToArabicWords(2000000)).toBe("مليونان");
    expect(integerToArabicWords(5000000)).toBe("خمسة ملايين");
    expect(integerToArabicWords(1000000000)).toBe("مليار");
    expect(integerToArabicWords(2500000)).toBe("مليونان وخمسمائة ألف");
  });
  it("رقم مركّب كبير", () => {
    /* 1,234,567 */
    expect(integerToArabicWords(1234567)).toBe("مليون ومائتان وأربعة وثلاثون ألف وخمسمائة وسبعة وستون");
  });
});

describe("tafqitEGP — الصيغة المالية الكاملة", () => {
  it("المثال المطلوب من Ahmed بالظبط", () => {
    expect(tafqitEGP(1500)).toBe("فقط ألف وخمسمائة جنيهاً مصرياً لا غير");
  });
  it("صفر", () => {
    expect(tafqitEGP(0)).toBe("فقط صفر جنيهاً مصرياً لا غير");
  });
  it("جنيهات فقط بدون قروش", () => {
    expect(tafqitEGP(250)).toBe("فقط مائتان وخمسون جنيهاً مصرياً لا غير");
  });
  it("جنيهات + قروش", () => {
    expect(tafqitEGP(1500.5)).toBe("فقط ألف وخمسمائة جنيهاً مصرياً وخمسون قرشاً لا غير");
    expect(tafqitEGP(25.75)).toBe("فقط خمسة وعشرون جنيهاً مصرياً وخمسة وسبعون قرشاً لا غير");
  });
  it("قروش فقط (أقل من جنيه)", () => {
    expect(tafqitEGP(0.25)).toBe("فقط خمسة وعشرون قرشاً لا غير");
  });
  it("تقريب القرش العائم", () => {
    /* 99.999 → 100.00 جنيه */
    expect(tafqitEGP(99.999)).toBe("فقط مائة جنيهاً مصرياً لا غير");
    /* 12.005 → 12.01 (قرش واحد) */
    expect(tafqitEGP(12.005)).toBe("فقط اثنا عشر جنيهاً مصرياً وواحد قرشاً لا غير");
  });
  it("القيمة السالبة تُعامل بالقيمة المطلقة", () => {
    expect(tafqitEGP(-300)).toBe("فقط ثلاثمائة جنيهاً مصرياً لا غير");
  });
  it("عملة مخصّصة (اختياري)", () => {
    expect(tafqitEGP(100, { currency: "دولاراً أمريكياً", fraction: "سنتاً" }))
      .toBe("فقط مائة دولاراً أمريكياً لا غير");
  });
});
