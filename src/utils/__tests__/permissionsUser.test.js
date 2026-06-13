/* ═══════════════════════════════════════════════════════════════
   V21.21.92 — Phase 2: per-user permission overrides
   ═══════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import {
  effectivePermForUser, canEditPermForUser, canViewPermForUser,
  getUserPermOverride, effectivePermWithCustoms,
} from "../permissions.js";

const mkConfig = (role, perms) => ({
  usersList: [{ email: "u@x.com", role, ...(perms ? { perms } : {}) }],
});
const USER = { email: "u@x.com", uid: "u1" };

describe("per-user overrides", () => {
  it("من غير تجاوز = نفس حساب الدور بالظبط (متوافق رجعياً)", () => {
    const cfg = mkConfig("viewer");
    const tab = "salesInvoices";
    expect(effectivePermForUser(cfg, USER, tab)).toBe(effectivePermWithCustoms("viewer", tab, cfg));
    expect(getUserPermOverride(cfg, USER, tab)).toBeNull();
  });

  it("تجاوز المستخدم يكسب على الدور", () => {
    /* viewer عادةً مايعدّلش salesInvoices — التجاوز بيدّيه edit */
    const cfg = mkConfig("viewer", { salesInvoices: "edit" });
    expect(effectivePermForUser(cfg, USER, "salesInvoices")).toBe("edit");
    expect(canEditPermForUser(cfg, USER, "salesInvoices")).toBe(true);
  });

  it("تجاوز بـ hide يخفي تاب كان الدور بيشوفه", () => {
    const cfg = mkConfig("manager", { treasury: "hide" });
    expect(effectivePermForUser(cfg, USER, "treasury")).toBe("hide");
    expect(canViewPermForUser(cfg, USER, "treasury")).toBe(false);
  });

  it("\"inherit\" أو غياب المفتاح = يرث من الدور", () => {
    const cfg = mkConfig("manager", { treasury: "inherit" });
    expect(getUserPermOverride(cfg, USER, "treasury")).toBeNull();
    expect(effectivePermForUser(cfg, USER, "treasury")).toBe(effectivePermWithCustoms("manager", "treasury", cfg));
  });

  it("admin دايماً كامل — التجاوز بيتجاهل (مايتقفلش)", () => {
    const cfg = mkConfig("admin", { treasury: "hide", salesInvoices: "hide" });
    expect(canViewPermForUser(cfg, USER, "treasury")).toBe(true);
    expect(canEditPermForUser(cfg, USER, "salesInvoices")).toBe(true);
  });

  it("تجاوز case-insensitive بالإيميل", () => {
    const cfg = mkConfig("viewer", { warehouse: "edit" });
    expect(canEditPermForUser(cfg, { email: "U@X.COM", uid: "u1" }, "warehouse")).toBe(true);
  });
});
