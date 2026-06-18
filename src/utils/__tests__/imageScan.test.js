/* ═══ V21.27.61: رياضيات سكانر المستندات (بدون canvas) ═══ */
import { describe, it, expect } from "vitest";
import { solveHomography, applyHomography, suggestOutputSize, otsuThreshold } from "../imageScan.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

describe("solveHomography + applyHomography", () => {
  it("identity: مستطيل → نفس المستطيل", () => {
    const rect = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const h = solveHomography(rect, rect);
    const p = applyHomography(h, 40, 20);
    expect(near(p.x, 40, 1e-4)).toBe(true);
    expect(near(p.y, 20, 1e-4)).toBe(true);
  });

  it("الزوايا الأربعة بتتطابق بالظبط مع رباعي المصدر", () => {
    const dst = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
    const src = [{ x: 10, y: 12 }, { x: 190, y: 4 }, { x: 205, y: 95 }, { x: 2, y: 110 }];
    const h = solveHomography(dst, src);
    for(let i = 0; i < 4; i++){
      const p = applyHomography(h, dst[i].x, dst[i].y);
      expect(near(p.x, src[i].x, 1e-3)).toBe(true);
      expect(near(p.y, src[i].y, 1e-3)).toBe(true);
    }
  });
});

describe("suggestOutputSize", () => {
  it("بياخد أطول ضلع ويقصّ لـ maxDim", () => {
    const quad = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 400 }, { x: 0, y: 400 }];
    const s = suggestOutputSize(quad, 400);
    expect(s.w).toBe(400);   /* 800→400 (نصّ) */
    expect(s.h).toBe(200);   /* 400→200 */
  });
  it("من غير قصّ لو أصغر من maxDim", () => {
    const quad = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }];
    const s = suggestOutputSize(quad, 1600);
    expect(s).toEqual({ w: 300, h: 200 });
  });
});

describe("otsuThreshold", () => {
  it("histogram بقمتين (60 و200) → عتبة بينهما", () => {
    const hist = new Array(256).fill(0);
    hist[60] = 500; hist[200] = 500;
    const thr = otsuThreshold(hist, 1000);
    expect(thr).toBeGreaterThanOrEqual(60);
    expect(thr).toBeLessThan(200);
  });
});
