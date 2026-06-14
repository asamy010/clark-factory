/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiStudioPresets.js (V21.23.0 — استوديو الموديلات Phase 2a)
   ───────────────────────────────────────────────────────────────────────
   مكتبة خيارات التوليد (وقفات · أعمار · جنس · خلفية · إطار) + باني البرومبت.
   كل preset: { id, label(عربي), prompt(إنجليزي للموديل) }. نماذج الصور بتفهم
   الإنجليزي أدق في التلبيس، فالـ chips إنجليزي تحت الغطاء والـ label عربي.

   المستخدم يقدر يضيف presets خاصة في factory/config.aiStudioPresets لاحقاً
   (Phase 2b) — الافتراضيات دي بتتدمج معاها.
   ═══════════════════════════════════════════════════════════════════════ */

export const AR_RATIOS = [
  { id: "3:4", label: "طولي 3:4 (أزياء)" },
  { id: "4:5", label: "طولي 4:5" },
  { id: "1:1", label: "مربّع 1:1" },
  { id: "9:16", label: "ستوري 9:16" },
  { id: "4:3", label: "أفقي 4:3" },
  { id: "16:9", label: "أفقي 16:9" },
];

export const IMAGE_SIZES = [
  { id: "1K", label: "1K (أسرع/أرخص)" },
  { id: "2K", label: "2K (موصى به)" },
  { id: "4K", label: "4K (أعلى جودة)" },
];

export const TIERS = [
  { id: "pro", label: "Nano Banana Pro (أعلى جودة)" },
  { id: "flash", label: "Flash (أسرع/أرخص)" },
];

export const GENDERS = [
  { id: "girl",  label: "بنت",   prompt: "a female child" },
  { id: "boy",   label: "ولد",   prompt: "a male child" },
  { id: "woman", label: "سيدة",  prompt: "an adult female" },
  { id: "man",   label: "رجل",   prompt: "an adult male" },
  { id: "any",   label: "محايد", prompt: "a person" },
];

/* عمر الأطفال — يُستخدم لو الجنس طفل (girl/boy) */
export const CHILD_AGES = [
  { id: "baby",   label: "رضيع (٦-١٢ شهر)", prompt: "6 to 12 months old baby" },
  { id: "toddler",label: "دارج (١-٣ سنين)",  prompt: "1 to 3 year old toddler" },
  { id: "a4_6",   label: "طفل (٤-٦ سنين)",   prompt: "4 to 6 year old child" },
  { id: "a7_9",   label: "طفل (٧-٩ سنين)",   prompt: "7 to 9 year old child" },
  { id: "a10_12", label: "طفل (١٠-١٢ سنة)",  prompt: "10 to 12 year old child" },
  { id: "teen",   label: "مراهق (١٣-١٦)",    prompt: "13 to 16 year old teenager" },
];

export const POSES = [
  { id: "front",   label: "واقف أمامي",       prompt: "standing straight, facing the camera, front view" },
  { id: "three4",  label: "ثلاثة أرباع",       prompt: "standing in a relaxed three-quarter pose" },
  { id: "side",    label: "جانبي",            prompt: "standing in a side profile pose" },
  { id: "walking", label: "ماشي",             prompt: "walking towards the camera, natural runway motion" },
  { id: "hands",   label: "يدين على الخصر",    prompt: "standing confidently with hands on hips" },
  { id: "sitting", label: "جالس",             prompt: "sitting casually on a simple stool" },
  { id: "playful", label: "حركة لعب",          prompt: "in a cheerful playful pose, smiling" },
];

export const BACKGROUNDS = [
  { id: "studio_white", label: "استوديو أبيض",  prompt: "clean seamless white studio background, soft even lighting" },
  { id: "studio_gray",  label: "رمادي ناعم",    prompt: "soft light-gray studio background, professional softbox lighting" },
  { id: "beige",        label: "بيج دافئ",       prompt: "warm beige studio backdrop, gentle warm lighting" },
  { id: "outdoor",      label: "حديقة خارجية",   prompt: "outdoor garden setting with soft natural daylight, blurred greenery background" },
  { id: "street",       label: "شارع مدينة",     prompt: "stylish city street background, soft bokeh, natural light" },
  { id: "room",         label: "غرفة معيشة",     prompt: "cozy modern living-room interior, warm natural light" },
  { id: "solid",        label: "لون سادة",       prompt: "solid soft pastel-colored background" },
];

export const FRAMINGS = [
  { id: "full",  label: "جسم كامل", prompt: "full-body shot, head to toe fully visible, full outfit shown" },
  { id: "half",  label: "نصفي",     prompt: "half-body shot from the waist up" },
  { id: "three", label: "٣/٤ جسم",  prompt: "three-quarter body shot, from the knees up" },
];

const byId = (arr, id) => arr.find(x => x.id === id) || null;

/* يبني البرومبت النهائي (إنجليزي) من الاختيارات + ملاحظات المستخدم الحرّة */
export function buildStudioPrompt(opts){
  const o = opts || {};
  const gender = byId(GENDERS, o.genderId) || GENDERS[0];
  const isChild = gender.id === "girl" || gender.id === "boy";
  const age = isChild ? byId(CHILD_AGES, o.ageId) : null;
  const pose = byId(POSES, o.poseId) || POSES[0];
  const bg = byId(BACKGROUNDS, o.backgroundId) || BACKGROUNDS[0];
  const framing = byId(FRAMINGS, o.framingId) || FRAMINGS[0];

  const subject = (age ? (age.prompt + " ") : "") + gender.prompt;

  const lines = [
    "Generate a photorealistic professional fashion-catalog photograph of " + subject +
      " fashion model wearing the EXACT garment(s) shown in the reference image(s).",
    "Preserve the garment's fabric texture, colors, patterns, prints, logos and every design detail with high fidelity — do not redesign or alter the clothing.",
    framing.prompt + ".",
    pose.prompt + ".",
    bg.prompt + ".",
    "Photorealistic skin and natural proportions, sharp focus on the outfit, professional studio fashion photography, high detail, no text, no watermark.",
  ];
  const notes = String(o.notes || "").trim();
  if(notes) lines.push("Additional requirements: " + notes);
  return lines.join(" ");
}

/* وصف عربي مختصر للبرومبت (لعرضه للمستخدم بدل الإنجليزي الطويل) */
export function describeStudioOptions(opts){
  const o = opts || {};
  const gender = byId(GENDERS, o.genderId) || GENDERS[0];
  const isChild = gender.id === "girl" || gender.id === "boy";
  const age = isChild ? byId(CHILD_AGES, o.ageId) : null;
  const parts = [
    (age ? age.label + " — " : "") + gender.label,
    (byId(FRAMINGS, o.framingId) || FRAMINGS[0]).label,
    (byId(POSES, o.poseId) || POSES[0]).label,
    (byId(BACKGROUNDS, o.backgroundId) || BACKGROUNDS[0]).label,
  ];
  return parts.filter(Boolean).join(" · ");
}
