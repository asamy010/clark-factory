/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiPromptLibrary.js — مكتبة برومبتس تجربة الملابس (Virtual Try-On)
   ───────────────────────────────────────────────────────────────────────
   مكتبة كبيرة (~180 برومبت) مقسّمة بالجروبات (BOY/GIRL/FOR HIM/FOR HER/BABY).

   ليه مخزن منفصل (مش factory/config.aiStudioPresets.savedPrompts)؟
   - نص الـ 180 برومبت لوحده ~540KB. حطّه في factory/config هيقرّب المستند من
     حد 1MB بتاع Firestore → كل عمليات الحفظ في CLARK تفشل (CLAUDE.md §2/§10).
   - فبنخزّنها في مستندات منفصلة تحت factory/ (مستند لكل جروب) — مغطّاة أصلاً
     بـ rule: match /factory/{docId} (read: isAnyUser, write: isManagerPlus،
     ماعدا config/roleScopes) — فمفيش rules جديدة محتاجة نشر.
   - بتتحمّل lazy (أول ما تفتح AI Studio بس)، مش مع data الساخنة في App.jsx.

   البذرة (seed): الافتراضي مشحون static في public/aiPromptLibrary.json
   (+ الصور في public/ai-prompts/). زر «تحميل المكتبة الجاهزة» بيقرا الـ JSON
   ويكتب مستندات الجروبات. بعد كده المكتبة قابلة للتعديل/الحذف وبتفضل.
   ═══════════════════════════════════════════════════════════════════════ */

import { db } from "../firebase.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

/* ترتيب الجروبات (= ترتيب الشيتات في الإكسيل الأصلي) + قسم «New» (Claude). */
export const LIBRARY_GROUPS = ["New", "BOY", "GIRL", "FOR HIM", "FOR HER", "BABY"];

/* معرّف مستند الجروب تحت factory/ — بدون مسافات (CEL/path-safe).
   الجروبات المدمجة (إنجليزي) بتفضل بنفس المعرّف القديم (مفيش هجرة).
   V21.27.20: الأقسام المخصّصة (ممكن عربي) بتاخد هاش قصير ثابت عشان مايحصلش
   تصادم لما الأحرف غير الـ ASCII تتشال. */
export function libGroupDocId(group){
  const g = String(group);
  const ascii = g.replace(/[^A-Za-z0-9]+/g, "_");
  if(LIBRARY_GROUPS.includes(g)) return "aiPromptLibrary_" + ascii;
  let h = 0; for(let i = 0; i < g.length; i++){ h = (h * 31 + g.charCodeAt(i)) >>> 0; }
  const base = ascii.replace(/^_+|_+$/g, "") || "g";
  return "aiPromptLibrary_" + base + "_" + h.toString(36);
}

/* تحميل كل الجروبات دفعة واحدة (lazy). بيرجّع { [group]: prompt[] }. */
export async function loadPromptLibrary(extraGroups){
  const groups = [...LIBRARY_GROUPS, ...((Array.isArray(extraGroups) ? extraGroups : []).filter(g => g && !LIBRARY_GROUPS.includes(g)))];
  const out = {};
  await Promise.all(groups.map(async g => {
    try {
      const snap = await getDoc(doc(db, "factory", libGroupDocId(g)));
      const d = snap.exists() ? snap.data() : null;
      out[g] = (d && Array.isArray(d.prompts)) ? d.prompts : [];
    } catch(e){ out[g] = []; }
  }));
  return out;
}

/* حفظ/استبدال مستند جروب واحد (بعد إضافة/تعديل/حذف). */
export async function savePromptGroup(group, prompts){
  await setDoc(doc(db, "factory", libGroupDocId(group)), {
    group,
    prompts: Array.isArray(prompts) ? prompts : [],
    ts: Date.now(),
  }, { merge: true });
}

/* البذرة من الـ JSON الثابت → مستندات الجروبات.
   idempotent: بيكتب القيم الحالية في الملف (بيستبدل، فإعادة التشغيل آمنة).
   بيرجّع { [group]: prompt[] } بعد الكتابة. */
export async function seedPromptLibrary(){
  const res = await fetch("/aiPromptLibrary.json", { cache: "no-store" });
  if(!res.ok) throw new Error("تعذّر تحميل ملف المكتبة (" + res.status + ")");
  const records = await res.json();
  if(!Array.isArray(records) || !records.length) throw new Error("ملف المكتبة فارغ");

  const byGroup = {};
  for(const r of records){
    const g = LIBRARY_GROUPS.includes(r.group) ? r.group : (r.group || "BOY");
    (byGroup[g] = byGroup[g] || []).push({
      id: r.id || ("lib_" + Math.random().toString(36).slice(2, 9)),
      name: r.name || g,
      prompt: r.prompt || "",
      image: r.image || "",
      group: g,
      builtin: true,           /* أصل المكتبة — تمييز عن المضاف يدوياً */
      ts: r.ts || Date.now(),
    });
  }
  for(const g of LIBRARY_GROUPS){
    await savePromptGroup(g, byGroup[g] || []);
  }
  return byGroup;
}
