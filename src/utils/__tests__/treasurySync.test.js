/* ═══════════════════════════════════════════════════════════════════════
   اختبارات مزامنة دفعات الخزنة اليتيمة (treasurySync.js) — V21.21.32
   ───────────────────────────────────────────────────────────────────────
   الضمانة الذهبية: المزامنة «صفرية الأثر» على الأرصدة — المبلغ كان
   محسوباً قبلها (كيتيمة في الكشف/الملخص) وبعدها (كدفعة رسمية). أي كسر
   لده يعني تكرار دفعة = رصيد عميل غلط.
   ═══════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from "vitest";
import { findOrphanCustTreasury, syncOrphanCustTreasuryMutator } from "../treasurySync.js";
import { buildCustomerSummary } from "../accountSummary.js";
import { buildAccountStatement } from "../accounting/statement.js";
import { makeFactoryData } from "./dataFixture.js";

const withOrphan = () => {
  const data = makeFactoryData();
  data.treasury.push({ id: "t-orphan", type: "in", amount: 50, custId: "c1", desc: "تحصيل نقدي", date: "2026-06-07", by: "أحمد" });
  return data;
};

describe("findOrphanCustTreasury — اكتشاف اليتيمة", () => {
  it("يلتقط حركة الوارد غير المرتبطة فقط", () => {
    const data = withOrphan();
    const orphans = findOrphanCustTreasury(data.treasury, data.custPayments);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe("t-orphan");
  });

  it("يتجاهل: المرتبطة، حركات الشيكات، المنصرف، وبلا عميل", () => {
    const data = withOrphan();
    data.treasury.push(
      { id: "t-linked", type: "in", amount: 10, custId: "c1", date: "2026-06-07" },
      { id: "t-cc", type: "in", amount: 10, custId: "c1", sourceType: "check_collect", date: "2026-06-07" },
      { id: "t-out", type: "out", amount: 10, custId: "c1", date: "2026-06-07" },
      { id: "t-nocust", type: "in", amount: 10, date: "2026-06-07" },
    );
    data.custPayments.push({ id: "px", custId: "c1", amount: 10, treasuryTxId: "t-linked", date: "2026-06-07" });
    const orphans = findOrphanCustTreasury(data.treasury, data.custPayments);
    expect(orphans.map(t => t.id)).toEqual(["t-orphan"]);
  });
});

describe("syncOrphanCustTreasuryMutator — التجسيد", () => {
  it("ينشئ دفعة رسمية بمعرّف حتمي وحقول صحيحة", () => {
    const d = withOrphan();
    const res = syncOrphanCustTreasuryMutator(d);
    expect(res.created).toBe(1);
    expect(res.totalAmount).toBe(50);
    const p = d.custPayments.find(x => x.id === "tsync-t-orphan");
    expect(p).toBeTruthy();
    expect(p.custId).toBe("c1");
    expect(p.custName).toBe("عميل الاختبار");
    expect(p.amount).toBe(50);
    expect(p.date).toBe("2026-06-07");/* تاريخ حركة الخزنة — يحدد day-doc الصحيح */
    expect(p.method).toBe("خزنة");
    expect(p.treasuryTxId).toBe("t-orphan");
  });

  it("idempotent: التشغيل الثاني لا ينشئ شيئاً", () => {
    const d = withOrphan();
    expect(syncOrphanCustTreasuryMutator(d).created).toBe(1);
    expect(syncOrphanCustTreasuryMutator(d).created).toBe(0);
    expect(d.custPayments.filter(p => p.treasuryTxId === "t-orphan")).toHaveLength(1);
  });

  it("الضمانة الذهبية: المزامنة صفرية الأثر على رصيد الملخص والكشف", () => {
    const d = withOrphan();
    const balBefore = buildCustomerSummary("c1", d).balance;
    const stmtBefore = buildAccountStatement(d, { partyId: "c1", partyType: "customer", mode: "operational" }).totals.closing;
    expect(balBefore).toBe(320);/* 370 − 50 يتيمة محسوبة من V21.21.30 */

    syncOrphanCustTreasuryMutator(d);

    const balAfter = buildCustomerSummary("c1", d).balance;
    const stmtAfter = buildAccountStatement(d, { partyId: "c1", partyType: "customer", mode: "operational" }).totals.closing;
    expect(balAfter).toBe(balBefore);
    expect(stmtAfter).toBe(stmtBefore);
    expect(stmtAfter).toBe(balAfter);/* التطابق الكامل مستمر */
  });

  it("بعد المزامنة: الدفعة تظهر كصف رسمي بدل صف «يتيمة» في الكشف", () => {
    const d = withOrphan();
    syncOrphanCustTreasuryMutator(d);
    const stmt = buildAccountStatement(d, { partyId: "c1", partyType: "customer", mode: "operational" });
    expect(stmt.rows.filter(r => r.type === "treasury")).toHaveLength(0);/* مفيش يتيمة */
    const official = stmt.rows.find(r => r.refId === "tsync-t-orphan");
    expect(official).toBeTruthy();
    expect(official.type).toBe("payment");/* دفعة رسمية — البوابة بتقرأ دي ✓ */
    expect(official.credit).toBe(50);
  });

  it("بيانات بدون يتيمات: لا كتابة ولا تغيير", () => {
    const d = makeFactoryData();
    const before = JSON.stringify(d.custPayments);
    expect(syncOrphanCustTreasuryMutator(d).created).toBe(0);
    expect(JSON.stringify(d.custPayments)).toBe(before);
  });
});
