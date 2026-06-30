/* ═══════════════════════════════════════════════════════════════════════
   اختبارات محرّك الكتابة المقسّمة (splitCollections.js)
   ───────────────────────────────────────────────────────────────────────
   ده أخطر مسار كتابة في النظام: كل حركة خزنة/راتب/شيك بتتسجّل عبر
   syncSplitCollection → day-doc. الدالة كانت غير متغطّاة (متشابكة مع
   Firestore I/O)، فبنحقن fake Firestore in-memory (vi.mock) ونثبّت سلوكها.

   الـ harness ده هدفه المزدوج:
   1. يسدّ فجوة تغطية المحرّك المالي الحرج (Issue: صفر تغطية).
   2. يثبّت السلوك الحالي قبل أي إصلاح مستقبلي للذرّية (Issue: الكتابة عبر
      الـ collections غير ذرّية) — خصوصًا اختبار «الكتابة الجزئية» تحت
      اللي بيعيد إنتاج الفجوة بشكل تنفيذي (baseline أحمر لأي fix قادم).

   ملاحظة: الـ fake بيشغّل runTransaction مرة واحدة (مفيش contention retry
   زي الـ SDK الحقيقي) — كافٍ لاختبار منطق merge/route/propagation.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── In-memory fake Firestore ──────────────────────────────────────────
   store: Map<"collection/docId", {entries,count,updatedAt}>
   failKeys: Set<"collection/docId"> — أي مفتاح هنا tx.get/set عليه يرمي خطأ
   (لمحاكاة فشل كتابة day-doc واحد). */
let store;
let failKeys;

const keyOf = (ref) => ref.col + "/" + ref.id;

vi.mock("../../firebase.js", () => ({ db: { __fake: true } }));

vi.mock("../storageNotices.js", () => ({
  noticeWarn: vi.fn(),
  noticeError: vi.fn(),
  noticeSuccess: vi.fn(),
  noticeInfo: vi.fn(),
}));

vi.mock("firebase/firestore", () => {
  const snapOf = (ref) => {
    const v = store.get(keyOf(ref));
    return { exists: () => v !== undefined, data: () => v, id: ref.id };
  };
  return {
    collection: (_db, col) => ({ __type: "collection", col }),
    doc: (_db, col, id) => ({ __type: "doc", col, id }),
    getDoc: async (ref) => snapOf(ref),
    getDocs: async (colRef) => {
      const docs = [];
      for (const [k, v] of store) {
        const idx = k.indexOf("/");
        const c = k.slice(0, idx);
        const id = k.slice(idx + 1);
        if (c === colRef.col) docs.push({ id, data: () => v });
      }
      return { forEach: (fn) => docs.forEach(fn), size: docs.length };
    },
    setDoc: async (ref, data) => { store.set(keyOf(ref), data); },
    deleteDoc: async (ref) => { store.delete(keyOf(ref)); },
    writeBatch: () => ({ set() {}, delete() {}, commit: async () => {} }),
    runTransaction: async (_db, cb) => {
      /* fake tx: reads/writes go straight to `store`; failKeys force a throw */
      const tx = {
        get: async (ref) => {
          if (failKeys.has(keyOf(ref))) throw new Error("tx-get-fail:" + keyOf(ref));
          return snapOf(ref);
        },
        set: (ref, data) => {
          if (failKeys.has(keyOf(ref))) throw new Error("tx-set-fail:" + keyOf(ref));
          store.set(keyOf(ref), data);
        },
        delete: (ref) => { store.delete(keyOf(ref)); },
      };
      return cb(tx);
    },
  };
});

import {
  syncSplitCollection,
  syncAllSplitChanges,
  readSplitCollection,
} from "../splitCollections.js";

/* helper: زرع day-doc في الـ store */
const seed = (col, day, entries) =>
  store.set(col + "/" + day, { entries, count: entries.length, updatedAt: "seed" });

/* helper: قراءة entries يوم من الـ store (أو [] لو مش موجود) */
const dayEntries = (col, day) => (store.get(col + "/" + day)?.entries) || null;

const tx = (id, date, extra = {}) => ({ id, date, amount: 100, ...extra });

beforeEach(() => {
  store = new Map();
  failKeys = new Set();
});

/* ───── الإضافة والتوجيه باليوم ───── */
describe("syncSplitCollection — الإضافة", () => {
  it("الحركة الجديدة تتوجّه لـ day-doc بتاريخها", async () => {
    const n = await syncSplitCollection("treasuryDays", [], [tx("t1", "2026-06-07")]);
    expect(n).toBe(1);
    expect(dayEntries("treasuryDays", "2026-06-07").map(e => e.id)).toEqual(["t1"]);
  });

  it("الإضافة بـ unshift (الأحدث في الأول)", async () => {
    seed("treasuryDays", "2026-06-07", [tx("a", "2026-06-07")]);
    await syncSplitCollection("treasuryDays",
      [tx("a", "2026-06-07")],
      [tx("a", "2026-06-07"), tx("b", "2026-06-07")]);
    expect(dayEntries("treasuryDays", "2026-06-07").map(e => e.id)).toEqual(["b", "a"]);
  });

  it("تعديل حركة موجودة يستبدلها في مكانها (مش بيكرّرها)", async () => {
    seed("treasuryDays", "2026-06-07", [tx("t1", "2026-06-07", { amount: 100 })]);
    await syncSplitCollection("treasuryDays",
      [tx("t1", "2026-06-07", { amount: 100 })],
      [tx("t1", "2026-06-07", { amount: 250 })]);
    const ents = dayEntries("treasuryDays", "2026-06-07");
    expect(ents).toHaveLength(1);
    expect(ents[0].amount).toBe(250);
  });

  it("مفيش تغيير → صفر كتابات", async () => {
    seed("treasuryDays", "2026-06-07", [tx("t1", "2026-06-07")]);
    const n = await syncSplitCollection("treasuryDays",
      [tx("t1", "2026-06-07")], [tx("t1", "2026-06-07")]);
    expect(n).toBe(0);
  });
});

/* ───── الحذف ───── */
describe("syncSplitCollection — الحذف", () => {
  it("حذف آخر حركة في اليوم يمسح الـ day-doc بالكامل", async () => {
    seed("treasuryDays", "2026-06-07", [tx("t1", "2026-06-07")]);
    await syncSplitCollection("treasuryDays", [tx("t1", "2026-06-07")], []);
    expect(store.has("treasuryDays/2026-06-07")).toBe(false);
  });

  it("V21.27.154: الحذف يلحق الحركة حتى لو متخزّنة في day-doc بتاريخ مختلف (drift)", async () => {
    /* الحركة تاريخها 2026-06-07 لكنها فعليًا متخزّنة في يوم 2026-06-09 (drift) */
    seed("treasuryDays", "2026-06-09", [tx("t1", "2026-06-07")]);
    await syncSplitCollection("treasuryDays", [tx("t1", "2026-06-07")], []);
    /* الـ full-scan لاقاها في 2026-06-09 وشالها → اليوم اتمسح */
    expect(store.has("treasuryDays/2026-06-09")).toBe(false);
  });
});

/* ───── تغيير التاريخ (V16.80 FIX #2 — منع التكرار عبر يومين) ───── */
describe("syncSplitCollection — تغيير التاريخ", () => {
  it("تغيير تاريخ الحركة ينقلها لليوم الجديد ويشيلها من القديم (مش في الاتنين)", async () => {
    seed("treasuryDays", "2026-06-07", [tx("t1", "2026-06-07")]);
    await syncSplitCollection("treasuryDays",
      [tx("t1", "2026-06-07")],
      [tx("t1", "2026-06-10")]);
    /* اليوم القديم اتمسح (آخر حركة) */
    expect(store.has("treasuryDays/2026-06-07")).toBe(false);
    /* اليوم الجديد فيه الحركة — نسخة واحدة بس */
    expect(dayEntries("treasuryDays", "2026-06-10").map(e => e.id)).toEqual(["t1"]);
  });
});

/* ───── رفض الحركات بلا تاريخ صالح (V16.80 FIX #3) ───── */
describe("syncSplitCollection — حركة بلا تاريخ صالح", () => {
  it("حركة بدون تاريخ تُرفض (مش بتتكتب) ولا تكسر الباقي", async () => {
    const n = await syncSplitCollection("treasuryDays", [], [{ id: "t1", amount: 100 }]);
    /* مرفوضة → صفر كتابة، الـ store فاضي */
    expect(n).toBe(0);
    expect(store.size).toBe(0);
  });

  it("الصالحة تتكتب والمرفوضة لأ (في نفس الدفعة)", async () => {
    const n = await syncSplitCollection("treasuryDays", [],
      [tx("ok", "2026-06-07"), { id: "bad", amount: 5 }]);
    expect(n).toBe(1);
    expect(dayEntries("treasuryDays", "2026-06-07").map(e => e.id)).toEqual(["ok"]);
  });
});

/* ───── انتشار فشل كتابة day-doc (أساس Issue الذرّية) ───── */
describe("syncSplitCollection — انتشار الفشل", () => {
  it("فشل كتابة day-doc يرمي (reject) — عشان upConfig يقدر يظهره للمستخدم ويتخطّى autoPost", async () => {
    failKeys.add("treasuryDays/2026-06-07");
    await expect(
      syncSplitCollection("treasuryDays", [], [tx("t1", "2026-06-07")])
    ).rejects.toThrow(/tx-(get|set)-fail/);
  });
});

/* ───── readSplitCollection ───── */
describe("readSplitCollection", () => {
  it("بيجمع entries كل الأيام في array واحدة", async () => {
    seed("treasuryDays", "2026-06-07", [tx("a", "2026-06-07")]);
    seed("treasuryDays", "2026-06-08", [tx("b", "2026-06-08"), tx("c", "2026-06-08")]);
    const all = await readSplitCollection("treasuryDays");
    expect(all.map(e => e.id).sort()).toEqual(["a", "b", "c"]);
  });
});

/* ───── syncAllSplitChanges — التوجيه والـ skip ───── */
describe("syncAllSplitChanges — التوجيه عبر الحقول", () => {
  it("بيوجّه كل حقل لـ collection-ه، ويتخطّى الحقول غير المتغيّرة", async () => {
    const before = { treasury: [], checks: [tx("c1", "2026-06-07")] };
    const after = {
      treasury: [tx("t1", "2026-06-07")],
      checks: [tx("c1", "2026-06-07")],/* unchanged — لازم يتخطّى */
    };
    await syncAllSplitChanges(before, after);
    expect(dayEntries("treasuryDays", "2026-06-07").map(e => e.id)).toEqual(["t1"]);
    /* checks unchanged → الـ store مفيهوش checksDays (ماتكتبش) */
    expect(store.has("checksDays/2026-06-07")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   اختبار التوصيف (characterization) — الكتابة عبر الـ collections غير ذرّية
   ───────────────────────────────────────────────────────────────────────
   ده مش اختبار «نجاح» — ده توثيق تنفيذي للفجوة: لو حقل نجح وحقل تاني فشل،
   النجاح **مش بيترجع** (Firestore مفيهوش rollback عابر للـ collections).
   لو فِي المستقبل اتعملت ذرّية حقيقية، الاختبار ده لازم يتعدّل ليثبت إن
   الاتنين بيرجعوا مع بعض — فبيقف حارس على نية الإصلاح.
   ═══════════════════════════════════════════════════════════════════════ */
describe("syncAllSplitChanges — توصيف عدم الذرّية (baseline للإصلاح)", () => {
  it("لو كتابة collection نجحت والتانية فشلت: الناجحة تفضل مكتوبة (مفيش rollback)", async () => {
    /* checksDays هيفشل، treasuryDays هينجح */
    failKeys.add("checksDays/2026-06-07");
    const before = { treasury: [], checks: [] };
    const after = {
      treasury: [tx("t1", "2026-06-07")],
      checks: [tx("c1", "2026-06-07")],
    };
    await expect(syncAllSplitChanges(before, after)).rejects.toThrow();

    /* العملية رمت ككل — لكن treasury اتكتبت بالفعل (نجاح جزئي) */
    expect(dayEntries("treasuryDays", "2026-06-07")?.map(e => e.id)).toEqual(["t1"]);
    /* checks فشلت — مش موجودة. ده بالظبط سيناريو «أسبوع مقفول/تحويل مؤكد
       بس الأرجل ناقصة» اللي الـ reconcile cron بيكتشفه والـ repair بيصلحه. */
    expect(store.has("checksDays/2026-06-07")).toBe(false);
  });
});
