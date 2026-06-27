/* ═══════════════════════════════════════════════════════════════
   CLARK · TreasuryFinancialSettings (V21.27.148)
   ───────────────────────────────────────────────────────────────
   بنود الوارد / المنصرف / الشيكات — اتنقلت من صفحة «الإعدادات» العامة
   لتاب «⚙️ إعدادات → 💰 المالية» جوّه الخزنة (طلب Ahmed). البنود دي
   بتظهر في قائمة «نوع الحركة» وفورم الشيكات، فمكانها الطبيعي جوّه الخزنة.

   الإضافة/الحذف بيتحفظ فورًا في data.treasurySettings عبر upConfig (نفس
   باترن persistCats القديم — المستخدم بيضيف بند واحد في المرة وبيتوقّع
   إنه يفضل من غير زر «حفظ»). treasurySettings حقل cfg إعدادات (تعديل
   نادر من جهاز واحد) → التخزين في cfg مناسب (CLAUDE.md §10 decision rule).

   البنود الموصولة (دفعة مورد/عميل، تشغيل خارجي، مرتبات، تحويل داخلي)
   مقفولة 🔒 — ليها سلوك hard-wired في الخزنة (party pickers / transfers)،
   فحذفها بيكسّر الربط (نفس منطق SettingsPg القديم — V16.61).
   ═══════════════════════════════════════════════════════════════ */
import { useState } from "react";
import { Btn, Inp } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";

/* تطابق DEFAULT_OUT/IN/CHECK القديمة في SettingsPg — أول ما المستخدم يضيف/يحذف
   بند، القائمة كاملة بتتخزّن (seed من الافتراضي) عشان الـ vocabulary يتمادّى. */
const DEFAULT_OUT = ["تكلفة","مشتريات","مرتبات","قطع غيار","صيانة ماكينات","خيط","تشغيل خارجي","نقل","كهرباء","ايجار المصنع","نثريات","اكسسوار","مستلزمات تشغيل","ورق ماركر","خدمات","أصول ثابتة","تكاليف أخرى","دفعة مورد","تحويل داخلي"];
const DEFAULT_IN = ["وارد","إيرادات","دفعة عميل","رأس مال","تحويل","تحويل داخلي"];
const DEFAULT_CHECK = ["رصيد افتتاحي","دفعة عميل","دفعة مورد","تسوية مبالغ","تحويل بين الحسابات","أخرى"];
const WIRED_OUT = ["دفعة مورد","تشغيل خارجي","مرتبات","تحويل داخلي"];
const WIRED_IN = ["دفعة عميل","تحويل داخلي"];

export function TreasuryFinancialSettings({ data, upConfig, isMob }) {
  const ts = data.treasurySettings || {};
  const outCats   = Array.isArray(ts.outCategories)   && ts.outCategories.length   > 0 ? ts.outCategories   : DEFAULT_OUT;
  const inCats    = Array.isArray(ts.inCategories)    && ts.inCategories.length    > 0 ? ts.inCategories    : DEFAULT_IN;
  const checkCats = Array.isArray(ts.checkCategories) && ts.checkCategories.length > 0 ? ts.checkCategories : DEFAULT_CHECK;

  const [newOut, setNewOut]     = useState("");
  const [newIn, setNewIn]       = useState("");
  const [newCheck, setNewCheck] = useState("");

  /* persist فوري — بيكتب القائمة كاملة (seed من الافتراضي عند أول تعديل). */
  const persist = (field, list) => upConfig(d => {
    if (!d.treasurySettings) d.treasurySettings = {};
    d.treasurySettings[field] = list;
  });
  const addCat = (field, cur, val, setVal) => {
    const v = (val || "").trim();
    if (!v) return;
    if (cur.includes(v)) { showToast("⚠️ البند موجود بالفعل"); return; }
    persist(field, [...cur, v]);
    setVal("");
    showToast("✓ تم الإضافة");
  };
  const removeCat = (field, cur, c) => persist(field, cur.filter(x => x !== c));

  /* render helper (function, مش component) — يتجنّب فقدان focus في الـ Inp:
     استدعاء دالة بترجّع JSX بيخلّي العناصر تتركّب في نفس المكان بثبات. */
  const renderBlock = ({ title, color, cats, wired, field, newVal, setNewVal, addFn, placeholder }) => (
    <div>
      <div style={{ fontSize: FS - 1, fontWeight: 700, color, marginBottom: 6 }}>
        {title} ({cats.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {cats.map(c => {
          const isWired = (wired || []).includes(c);
          return <span key={c} title={isWired ? "بند مرتبط بنظام آخر — يفتح قائمة اختيار تلقائياً، لا يمكن حذفه" : ""} style={{ padding: "3px 8px", borderRadius: 6, fontSize: FS - 2, background: color + "10", color, display: "flex", alignItems: "center", gap: 4 }}>
            {c}{isWired
              ? <span style={{ fontSize: 9, opacity: 0.6 }}>🔒</span>
              : <span onClick={() => removeCat(field, cats, c)} style={{ cursor: "pointer", fontSize: 10 }}>✕</span>}
          </span>;
        })}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <Inp value={newVal} onChange={setNewVal} placeholder={placeholder || "بند جديد..."} style={{ flex: 1 }} />
        <Btn small onClick={addFn}>+</Btn>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: FS - 2, color: T.textMut, marginBottom: 14, padding: "8px 12px", background: T.accent + "08", border: "1px solid " + T.accent + "20", borderRadius: 8, lineHeight: 1.6 }}>
        💡 البنود دي بتظهر في قائمة «نوع الحركة» عند تسجيل حركة في الخزنة (وارد/منصرف)
        وفي فورم الشيكات. أي إضافة/حذف بيتحفظ تلقائيًا. البنود المعلّمة بـ🔒 مرتبطة
        بأنظمة تانية (دفعات موردين/عملاء، تحويلات) ولا يمكن حذفها.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 16 }}>
        {renderBlock({
          title: "↑ بنود المنصرف", color: T.err, cats: outCats, wired: WIRED_OUT,
          field: "outCategories", newVal: newOut, setNewVal: setNewOut,
          addFn: () => addCat("outCategories", outCats, newOut, setNewOut),
        })}
        {renderBlock({
          title: "↓ بنود الوارد", color: T.ok, cats: inCats, wired: WIRED_IN,
          field: "inCategories", newVal: newIn, setNewVal: setNewIn,
          addFn: () => addCat("inCategories", inCats, newIn, setNewIn),
        })}
      </div>

      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#8B5CF608", border: "1px solid #8B5CF620" }}>
        {renderBlock({
          title: "📝 بنود الشيكات", color: "#8B5CF6", cats: checkCats, wired: [],
          field: "checkCategories", newVal: newCheck, setNewVal: setNewCheck,
          addFn: () => addCat("checkCategories", checkCats, newCheck, setNewCheck),
          placeholder: "بند جديد (مثلاً: رصيد افتتاحي)...",
        })}
        <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 8, lineHeight: 1.6 }}>
          تُستخدم في فورم الشيكات فقط (أوراق قبض/دفع). مثلاً «رصيد افتتاحي» لفتح موسم جديد.
        </div>
      </div>
    </div>
  );
}
