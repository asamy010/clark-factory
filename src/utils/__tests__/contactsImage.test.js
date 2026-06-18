/* ═══ V21.27.58: صورة بالطول لجهات الاتصال — create/update/merge propagation ═══ */
import { describe, it, expect } from "vitest";
import { createContact, updateContact, buildMergedContacts } from "../contacts.js";

const user = { email: "test@clark" };

describe("createContact — صورة بالطول", () => {
  it("بيختم الصورة على السجل + العميل + المورد المرتبطين", () => {
    const { patch, contact } = createContact(
      { name: "شركة الأمل", phone: "01000000000", types: ["customer", "supplier"], image: "https://x/p.jpg" },
      {}, user
    );
    expect(contact.image).toBe("https://x/p.jpg");
    expect(patch.customers[0].image).toBe("https://x/p.jpg");
    expect(patch.suppliers[0].image).toBe("https://x/p.jpg");
  });

  it("بدون صورة → image سلسلة فاضية", () => {
    const { contact } = createContact({ name: "بدون", types: ["customer"] }, {}, user);
    expect(contact.image).toBe("");
  });
});

describe("updateContact — تعديل الصورة + propagation", () => {
  const base = () => ({
    contacts: [{ id: "k1", name: "أحمد", phone: "201", types: ["customer", "workshop"], image: "", linkedIds: { customer: "c1", workshop: 9 } }],
    customers: [{ id: "c1", name: "أحمد", image: "" }],
    workshops: [{ id: 9, name: "أحمد", ownerPhoto: "" }],
  });

  it("بيحدّث الصورة على السجل + يـ propagate للعميل والورشة (ownerPhoto)", () => {
    const { patch } = updateContact("k1", { image: "https://x/new.jpg" }, base());
    expect(patch.contacts[0].image).toBe("https://x/new.jpg");
    expect(patch.customers[0].image).toBe("https://x/new.jpg");
    expect(patch.workshops[0].image).toBe("https://x/new.jpg");
    expect(patch.workshops[0].ownerPhoto).toBe("https://x/new.jpg");
  });

  it("لو الصورة مش متبعتة → مفيش لمس لصور الكيانات (idempotent)", () => {
    const data = base();
    data.customers[0].image = "https://x/keep.jpg";
    const { patch } = updateContact("k1", { name: "أحمد محمد" }, data);
    /* العميل اتـ propagate له الاسم بس — الصورة زي ما هي */
    expect(patch.customers[0].image).toBe("https://x/keep.jpg");
    expect(patch.customers[0].name).toBe("أحمد محمد");
  });
});

describe("buildMergedContacts — image في الصفوف", () => {
  it("صف registry بياخد صورة الـ contact", () => {
    const merged = buildMergedContacts({ contacts: [{ id: "k1", name: "أ", image: "https://x/a.jpg", linkedIds: {} }] });
    expect(merged[0].image).toBe("https://x/a.jpg");
  });

  it("صف كيان مستقل بياخد entity.image (و workshop بياخد ownerPhoto)", () => {
    const merged = buildMergedContacts({
      customers: [{ id: "c2", name: "ب", image: "https://x/b.jpg" }],
      workshops: [{ id: 7, name: "ورشة", ownerPhoto: "https://x/w.jpg" }],
    });
    const cust = merged.find(m => m.linkedFrom === "customer");
    const ws = merged.find(m => m.linkedFrom === "workshop");
    expect(cust.image).toBe("https://x/b.jpg");
    expect(ws.image).toBe("https://x/w.jpg");
  });
});
