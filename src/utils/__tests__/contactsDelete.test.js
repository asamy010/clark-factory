/* ═══ V21.21.96: حذف جماعي لجهات الاتصال (planContactsDeletion) ═══ */
import { describe, it, expect } from "vitest";
import { planContactsDeletion, contactDeleteBlocker } from "../contacts.js";

/* صف registry: عميل + مورد مربوطين تحت جهة واحدة */
const dualRow = { id: "k1", name: "أحمد", linkedFrom: "contact", contactId: "k1", entityIds: { customer: "c1", supplier: "s1" } };
/* صف legacy: عميل لوحده (مش في السجل الموحّد) */
const legacyRow = { id: "customer_c2", name: "سعيد", linkedFrom: "customer", contactId: null, entityIds: { customer: "c2" } };

const baseData = () => ({
  customers: [{ id: "c1", name: "أحمد" }, { id: "c2", name: "سعيد" }],
  suppliers: [{ id: "s1", name: "أحمد" }],
  contacts:  [{ id: "k1", name: "أحمد", linkedIds: { customer: "c1", supplier: "s1" } }],
});

describe("planContactsDeletion", () => {
  it("بيشيل الجهة من كل قوائمها الأصلية + من السجل الموحّد", () => {
    const data = baseData();
    const { patch, deletable, blocked } = planContactsDeletion([dualRow], data);
    expect(blocked).toEqual([]);
    expect(deletable).toEqual(["أحمد"]);
    expect(patch.customers.map(c => c.id)).toEqual(["c2"]);  /* c1 اتشال */
    expect(patch.suppliers).toEqual([]);                      /* s1 اتشال */
    expect(patch.contacts).toEqual([]);                       /* k1 اتشال */
  });

  it("صف legacy (عميل لوحده) بيتشال من customers بس — مفيش contacts patch", () => {
    const data = baseData();
    const { patch, deletable } = planContactsDeletion([legacyRow], data);
    expect(deletable).toEqual(["سعيد"]);
    expect(patch.customers.map(c => c.id)).toEqual(["c1"]);   /* c2 اتشال */
    expect(patch.contacts).toBeUndefined();                   /* مفيش contactId */
    expect(patch.suppliers).toBeUndefined();
  });

  it("جهة مرتبطة بحركة (دفعة مورد) بتتسكِب — مفيش cascade", () => {
    const data = { ...baseData(), supplierPayments: [{ id: "p1", supplierId: "s1", amount: 100 }] };
    expect(contactDeleteBlocker(dualRow, data)).toBeTruthy();
    const { patch, deletable, blocked } = planContactsDeletion([dualRow], data);
    expect(deletable).toEqual([]);
    expect(blocked.length).toBe(1);
    expect(blocked[0].name).toBe("أحمد");
    expect(patch.customers).toBeUndefined();  /* مفيش حذف لأنها اتسكِبت كلها */
  });

  it("دفعة جزئية: القابل يتحذف والمحظور يتسكِب في نفس العملية", () => {
    const data = { ...baseData(), supplierPayments: [{ id: "p1", supplierId: "s1" }] };
    const { deletable, blocked, patch } = planContactsDeletion([dualRow, legacyRow], data);
    expect(deletable).toEqual(["سعيد"]);            /* legacy اتحذف */
    expect(blocked.map(b => b.name)).toEqual(["أحمد"]); /* dual اتسكِب */
    expect(patch.customers.map(c => c.id)).toEqual(["c1"]); /* c2 بس اتشال */
  });
});
