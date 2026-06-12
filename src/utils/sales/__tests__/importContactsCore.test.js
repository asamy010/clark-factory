/* ═══════════════════════════════════════════════════════════════════════
   CLARK · importContactsCore tests (V21.21.61)
   ═══════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";
import { detectColumns, mapCustomerType, rowsFromMatrix, buildImportObjects } from "../importContactsCore.js";

describe("detectColumns", () => {
  it("يكتشف الأعمدة العربية بالاسم", () => {
    const cols = detectColumns(["اسم العميل", "العنوان", "رقم التليفون", "النوع"]);
    expect(cols.name).toBe(0);
    expect(cols.address).toBe(1);
    expect(cols.phone).toBe(2);
    expect(cols.type).toBe(3);
  });
  it("يكتشف عناوين إنجليزية ومركّبة بالاحتواء", () => {
    const cols = detectColumns(["Name", "Phone Number / WhatsApp", "Address"]);
    expect(cols.name).toBe(0);
    expect(cols.phone).toBe(1);
    expect(cols.address).toBe(2);
  });
});

describe("mapCustomerType", () => {
  it("محل/مكتب/أونلاين/مخصّص/افتراضي", () => {
    expect(mapCustomerType("محل")).toBe("محل");
    expect(mapCustomerType("مكتب")).toBe("مكتب");
    expect(mapCustomerType("store")).toBe("محل");
    expect(mapCustomerType("Online")).toBe("أونلاين");
    expect(mapCustomerType("جملة")).toBe("مكتب");
    expect(mapCustomerType("")).toBe("مكتب");
    expect(mapCustomerType("VIP")).toBe("VIP");
  });
});

describe("rowsFromMatrix", () => {
  it("يتخطّى الصفوف الفاضية ويقرأ من بعد العناوين", () => {
    const matrix = [
      ["", "", ""],                               /* فاضي قبل العناوين */
      ["الاسم", "رقم التليفون", "العنوان", "النوع"],
      ["أحمد", "01012345678", "القاهرة", "محل"],
      ["", "", "", ""],                            /* فاضي */
      ["منى", "01112345679", "الجيزة", "مكتب"],
    ];
    const out = rowsFromMatrix(matrix);
    expect(out.totalRows).toBe(2);
    expect(out.rows[0]).toMatchObject({ name: "أحمد", phone: "01012345678", address: "القاهرة", type: "محل" });
    expect(out.rows[1].name).toBe("منى");
  });
  it("مصفوفة فاضية → صفر صفوف", () => {
    expect(rowsFromMatrix([]).totalRows).toBe(0);
  });
});

describe("buildImportObjects", () => {
  const rows = [
    { name: "أحمد", phone: "01012345678", address: "القاهرة", type: "محل" },
    { name: "منى",  phone: "01112345679", address: "الجيزة", type: "مكتب" },
  ];

  it("سكيمة العميل: type + discount + address + phone مطبّع", () => {
    const { objs, invalid, skippedDup } = buildImportObjects({ rows, target: "customers", dedupe: true, existing: [], userName: "tester" });
    expect(objs.length).toBe(2);
    expect(invalid).toBe(0);
    expect(skippedDup).toBe(0);
    expect(objs[0]).toMatchObject({ name: "أحمد", address: "القاهرة", type: "محل", discount: 10, archived: false });
    expect(objs[0].phone).toBe("+201012345678");
    expect(objs[0].id.startsWith("cust_")).toBe(true);
    expect(objs[0].createdBy).toBe("tester");
  });

  it("سكيمة المورد: notes بدل type/discount + id بـ sup_", () => {
    const { objs } = buildImportObjects({ rows, target: "suppliers", dedupe: true, existing: [], userName: "" });
    expect(objs[0].id.startsWith("sup_")).toBe(true);
    expect(objs[0]).toHaveProperty("notes");
    expect(objs[0].discount).toBeUndefined();
  });

  it("dedup داخل الملف: نفس التليفون مرتين → واحد + skippedDup", () => {
    const dup = rows.concat([{ name: "أحمد مكرر", phone: "0101 234 5678", address: "", type: "" }]);
    const { objs, skippedDup } = buildImportObjects({ rows: dup, target: "customers", dedupe: true, existing: [], userName: "" });
    expect(objs.length).toBe(2);
    expect(skippedDup).toBe(1);
  });

  it("dedup ضد العملاء الموجودين", () => {
    const existing = [{ phone: "+201012345678" }];
    const { objs, skippedDup } = buildImportObjects({ rows, target: "customers", dedupe: true, existing, userName: "" });
    expect(objs.length).toBe(1);          /* أحمد موجود → اتخطّى */
    expect(skippedDup).toBe(1);
    expect(objs[0].name).toBe("منى");
  });

  it("dedupe=false: مايتخطّاش المكرر", () => {
    const existing = [{ phone: "+201012345678" }];
    const { objs, skippedDup } = buildImportObjects({ rows, target: "customers", dedupe: false, existing, userName: "" });
    expect(objs.length).toBe(2);
    expect(skippedDup).toBe(0);
  });

  it("صف بدون اسم → invalid (مايتسجّلش)", () => {
    const bad = [{ name: "", phone: "01012345678", address: "x", type: "" }, { name: "سيد", phone: "01512345670" }];
    const { objs, invalid } = buildImportObjects({ rows: bad, target: "customers", dedupe: true, existing: [], userName: "" });
    expect(objs.length).toBe(1);
    expect(invalid).toBe(1);
  });
});
