/* ═══════════════════════════════════════════════════════════════════════
   اختبارات مدير التجزئة (partitionedCollections.js) — V21.21.33
   ───────────────────────────────────────────────────────────────────────
   بتغطي الجزء النقي: stripPartitionedArrays — القاعدة الحرجة هنا (درس
   V21.9.39/V21.9.44): الحقل ما يتشالش من config إلا لو علم الهجرة بتاعه
   متسطّب. الشيل قبل الهجرة = مسح صامت للبيانات قبل ما تتنقل.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi } from "vitest";

/* الموديول بيستورد firebase — mock خفيف يكفي للجزء النقي */
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(),
  setDoc: vi.fn(), deleteDoc: vi.fn(), writeBatch: vi.fn(),
}));
vi.mock("../../firebase.js", () => ({ db: {} }));

import {
  PARTITIONED_COLLECTIONS,
  PARTITIONED_FIELDS,
  PARTITIONED_FIELDS_V212133,
  PARTITIONED_FLAG_V212133,
  stripPartitionedArrays,
} from "../partitionedCollections.js";

describe("تسجيل V21.21.33 — الوسوم وجهات الاتصال", () => {
  it("الحقلان مسجلان في الخريطة وبأسماء collections صحيحة", () => {
    expect(PARTITIONED_COLLECTIONS.tagRegistry).toBe("tagRegistryDocs");
    expect(PARTITIONED_COLLECTIONS.contacts).toBe("contactsDocs");
    expect(PARTITIONED_FIELDS).toContain("tagRegistry");
    expect(PARTITIONED_FIELDS).toContain("contacts");
    expect(PARTITIONED_FIELDS_V212133).toEqual(["tagRegistry", "contacts"]);
  });

  it("قبل الهجرة (بدون flag): الحقلان لا يُشالان من config أبداً", () => {
    const cfg = { tagRegistry: [{ id: "t1" }], contacts: [{ id: "c1" }], other: 1 };
    const stripped = stripPartitionedArrays(cfg);
    expect(stripped.tagRegistry).toEqual([{ id: "t1" }]);
    expect(stripped.contacts).toEqual([{ id: "c1" }]);
  });

  it("بعد الهجرة (flag متسطّب): الحقلان يُشالان والباقي لا يتأثر", () => {
    const cfg = {
      [PARTITIONED_FLAG_V212133]: true,
      tagRegistry: [{ id: "t1" }],
      contacts: [{ id: "c1" }],
      sizeSets: [{ id: "s1" }],
    };
    const stripped = stripPartitionedArrays(cfg);
    expect(stripped.tagRegistry).toBeUndefined();
    expect(stripped.contacts).toBeUndefined();
    expect(stripped.sizeSets).toEqual([{ id: "s1" }]);
    /* الأصل لا يتعدل (الدالة بترجع نسخة) */
    expect(cfg.tagRegistry).toEqual([{ id: "t1" }]);
  });

  it("أعلام الهجرات المختلفة مستقلة عن بعضها", () => {
    const cfg = {
      _partitionedRecurringV21944Done: true,
      recurringTreasury: [{ id: "r1" }],
      tagRegistry: [{ id: "t1" }],
    };
    const stripped = stripPartitionedArrays(cfg);
    expect(stripped.recurringTreasury).toBeUndefined();/* علمه متسطّب */
    expect(stripped.tagRegistry).toEqual([{ id: "t1" }]);/* علمه مش متسطّب */
  });
});
