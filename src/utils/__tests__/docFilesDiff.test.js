/* ═══════════════════════════════════════════════════════════════════════
   CLARK · docFilesDiff tests (V21.27.178)
   ───────────────────────────────────────────────────────────────────────
   الدالة دي هي الجزء الأخطر في split الملفات لكل مستند — لو الـ diff غلط
   ممكن نحذف ملفات بالغلط أو نسيب آثار. فبتتغطّى باختبارات شاملة.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { diffDocFiles } from "../docFilesDiff.js";

describe("diffDocFiles", () => {
  it("returns empty ops for two empty arrays", () => {
    const { sets, dels } = diffDocFiles([], []);
    expect(sets).toEqual([]);
    expect(dels).toEqual([]);
  });

  it("treats all next files as sets when prev is empty", () => {
    const next = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const { sets, dels } = diffDocFiles([], next);
    expect(sets).toHaveLength(2);
    expect(sets.map(s => s.id).sort()).toEqual(["a", "b"]);
    expect(dels).toEqual([]);
  });

  it("marks removed files as dels", () => {
    const prev = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const next = [{ id: "a", name: "A" }];
    const { sets, dels } = diffDocFiles(prev, next);
    expect(sets).toEqual([]);
    expect(dels).toEqual(["b"]);
  });

  it("marks changed files as sets and leaves untouched ones alone", () => {
    const prev = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const next = [{ id: "a", name: "A2" }, { id: "b", name: "B" }];
    const { sets, dels } = diffDocFiles(prev, next);
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe("a");
    expect(sets[0].file.name).toBe("A2");
    expect(dels).toEqual([]);
  });

  it("handles a mix of add, change, remove, and untouched", () => {
    const prev = [
      { id: "keep", name: "Keep" },
      { id: "change", name: "Old" },
      { id: "remove", name: "Gone" },
    ];
    const next = [
      { id: "keep", name: "Keep" },
      { id: "change", name: "New" },
      { id: "add", name: "Added" },
    ];
    const { sets, dels } = diffDocFiles(prev, next);
    expect(sets.map(s => s.id).sort()).toEqual(["add", "change"]);
    expect(dels).toEqual(["remove"]);
  });

  it("ignores files without a valid id (defensive)", () => {
    const prev = [{ id: "a", name: "A" }];
    const next = [
      { id: "a", name: "A" },
      { name: "no-id" },
      { id: null, name: "null-id" },
      null,
      undefined,
    ];
    const { sets, dels } = diffDocFiles(prev, next);
    expect(sets).toEqual([]);
    expect(dels).toEqual([]);
  });

  it("coerces numeric ids to strings consistently (no false change)", () => {
    const prev = [{ id: 1, name: "One" }];
    const next = [{ id: 1, name: "One" }];
    const { sets, dels } = diffDocFiles(prev, next);
    expect(sets).toEqual([]);
    expect(dels).toEqual([]);
  });

  it("detects deep field changes via JSON comparison", () => {
    const prev = [{ id: "a", meta: { tags: ["x"] } }];
    const next = [{ id: "a", meta: { tags: ["x", "y"] } }];
    const { sets } = diffDocFiles(prev, next);
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe("a");
  });

  it("treats non-array inputs as empty (defensive)", () => {
    expect(diffDocFiles(null, null)).toEqual({ sets: [], dels: [] });
    expect(diffDocFiles(undefined, undefined)).toEqual({ sets: [], dels: [] });
    const r = diffDocFiles("nope", [{ id: "a" }]);
    expect(r.sets).toHaveLength(1);
    expect(r.dels).toEqual([]);
  });
});
