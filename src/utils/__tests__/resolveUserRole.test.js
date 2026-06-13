/* ═══════════════════════════════════════════════════════════════
   V21.21.91 — resolveUserRole (إصلاح الجذر لباگ «الصلاحية مش بتشتغل»)
   ═══════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { resolveUserRole } from "../permissions.js";

describe("resolveUserRole", () => {
  it("بيلاقي الدور من usersList بالإيميل", () => {
    const config = { usersList: [{ email: "ahmed@x.com", role: "manager" }] };
    expect(resolveUserRole(config, { email: "ahmed@x.com", uid: "u1" })).toBe("manager");
  });

  it("① case-insensitive: إيميل Firebase بكابيتال يطابق المخزّن lowercase", () => {
    const config = { usersList: [{ email: "ahmed@x.com", role: "sales_accountant" }] };
    /* قبل الإصلاح: === كان يفشل → viewer */
    expect(resolveUserRole(config, { email: "Ahmed@X.com", uid: "u1" })).toBe("sales_accountant");
    expect(resolveUserRole(config, { email: "  AHMED@x.COM  ", uid: "u1" })).toBe("sales_accountant");
  });

  it("② الأسبقية: usersList يكسب على config.users[uid] القديم", () => {
    const config = {
      users: { u1: "viewer" },                                   /* entry قديم */
      usersList: [{ email: "ahmed@x.com", role: "manager" }],    /* اللي الأدمن عدّله */
    };
    expect(resolveUserRole(config, { email: "ahmed@x.com", uid: "u1" })).toBe("manager");
  });

  it("fallback لـ config.users[uid] لو مش في usersList", () => {
    expect(resolveUserRole({ users: { u9: "manager" } }, { email: "x@y.com", uid: "u9" })).toBe("manager");
    expect(resolveUserRole({ users: { u9: { role: "viewer" } } }, { email: "x@y.com", uid: "u9" })).toBe("viewer");
  });

  it("الافتراضي viewer (least-privilege) لو مش موجود في أي مكان", () => {
    expect(resolveUserRole({ usersList: [] }, { email: "ghost@x.com", uid: "u0" })).toBe("viewer");
    expect(resolveUserRole(null, { email: "x@y.com" })).toBe("viewer");
    expect(resolveUserRole({}, null)).toBe("viewer");
  });
});
