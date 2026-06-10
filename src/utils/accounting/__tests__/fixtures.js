/* ═══════════════════════════════════════════════════════════════════════
   Shared fixtures for the accounting test-suite (V21.21.27 — Phase 1.1)
   ───────────────────────────────────────────────────────────────────────
   TEST_COA mirrors the DEFAULT_POSTING_RULES + DEFAULT_CATEGORY_MAP codes
   from coaDefaults.js. Account ids follow the "acc-<code>" convention so
   tests can reference them deterministically.
   ═══════════════════════════════════════════════════════════════════════ */
import { expect } from "vitest";

export const acct = (code, name, type = "asset", isLeaf = true, parent = null) => ({
  id: "acc-" + code,
  code,
  name,
  type,
  parent,
  isLeaf,
  system: false,
});

export const TEST_COA = [
  acct("1000", "الأصول", "asset", false),
  acct("1110", "الخزينة الرئيسية"),
  acct("1120", "البنك"),
  acct("1130", "شيكات تحت التحصيل"),
  acct("1210", "العملاء"),
  acct("1220", "سلف موظفين"),
  acct("1310", "مخزون خامات"),
  acct("1320", "مخزون منتج تام"),
  acct("1330", "مخزون تحت التشغيل"),
  acct("2110", "موردون خامات", "liability"),
  acct("2120", "ورش خارجية", "liability"),
  acct("4100", "إيرادات المبيعات", "revenue"),
  acct("4110", "الخصم المسموح به", "revenue"),
  acct("4120", "مرتجع المبيعات", "revenue"),
  acct("4900", "إيرادات أخرى", "revenue"),
  acct("5130", "تكلفة البضاعة المباعة", "expense"),
  acct("5140", "مرتجع المشتريات", "expense"),
  acct("5210", "رواتب ثابتة", "expense"),
  acct("5220", "حوافز", "expense"),
  acct("5230", "مكافآت", "expense"),
  acct("5290", "مصروفات عمومية أخرى", "expense"),
  acct("5310", "إيجار", "expense"),
  acct("5390", "مصروفات إدارية أخرى", "expense"),
];

export const sumDr = (entry) =>
  (entry.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);

export const sumCr = (entry) =>
  (entry.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);

/* Assert an entry is balanced within the posting engine's 0.01 tolerance.
   Every builder output MUST pass this — an imbalanced entry corrupts the
   trial balance (the V21.9.56 service-discount incident class). */
export function expectBalanced(entry) {
  expect(entry, "entry should not be null").toBeTruthy();
  expect(Array.isArray(entry.lines), "entry.lines should be an array").toBe(true);
  expect(entry.lines.length, "entry needs at least 2 lines").toBeGreaterThanOrEqual(2);
  const dr = sumDr(entry);
  const cr = sumCr(entry);
  expect(
    Math.abs(dr - cr),
    `imbalanced entry: Dr ${dr} ≠ Cr ${cr} — ${JSON.stringify(entry.lines)}`
  ).toBeLessThanOrEqual(0.01);
}
