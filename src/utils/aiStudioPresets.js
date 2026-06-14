/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiStudioPresets.js (V21.23.2 — استوديو الموديلات Phase 2b)
   ───────────────────────────────────────────────────────────────────────
   مكتبة خيارات التوليد + باني البرومبت. الافتراضيات هنا، والمخصّصة بتاعت
   المستخدم بتتخزّن في factory/config.aiStudioPresets وبتتدمج معاها (mergePresets).

   نوع اللقطة (shotType) — إضافة احترافية للـ e-commerce:
     • model  = موديل لابس الطقم (try-on، الافتراضي)
     • ghost  = مانيكان شبح (invisible mannequin — شكل القطعة بدون شخص)
     • flat   = فرش مسطّح (flat-lay من فوق)

   كل preset: { id, label(عربي), prompt(إنجليزي للموديل) }. النماذج بتفهم
   الإنجليزي أدق في التلبيس، فالـ prompt إنجليزي والـ label عربي.
   ═══════════════════════════════════════════════════════════════════════ */

export const AR_RATIOS = [
  { id: "3:4", label: "طولي 3:4 (أزياء)" },
  { id: "4:5", label: "طولي 4:5" },
  { id: "1:1", label: "مربّع 1:1 (شوبيفاي)" },
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

export const SHOT_TYPES = [
  { id: "model", label: "🧍 موديل لابس" },
  { id: "ghost", label: "👕 مانيكان شبح" },
  { id: "flat",  label: "🧺 فرش مسطّح" },
];

export const GENDERS = [
  { id: "girl",  label: "بنت",   prompt: "a female child" },
  { id: "boy",   label: "ولد",   prompt: "a male child" },
  { id: "woman", label: "سيدة",  prompt: "an adult female" },
  { id: "man",   label: "رجل",   prompt: "an adult male" },
  { id: "any",   label: "محايد", prompt: "a person" },
];

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
  { id: "back",    label: "من الخلف",          prompt: "standing with the back to the camera, showing the back of the outfit" },
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
  { id: "beach",        label: "شاطئ",           prompt: "bright sunny beach background, soft natural light" },
  { id: "solid",        label: "لون سادة",       prompt: "solid soft pastel-colored background" },
];

export const FRAMINGS = [
  { id: "full",  label: "جسم كامل", prompt: "full-body shot, head to toe fully visible, full outfit shown" },
  { id: "half",  label: "نصفي",     prompt: "half-body shot from the waist up" },
  { id: "three", label: "٣/٤ جسم",  prompt: "three-quarter body shot, from the knees up" },
];

const byId = (arr, id) => (arr || []).find(x => x && x.id === id) || null;

/* دمج الافتراضيات مع المخصّصة من cfg.aiStudioPresets */
export function mergePresets(data){
  const c = (data && data.aiStudioPresets) || {};
  const safe = (a) => Array.isArray(a) ? a.filter(x => x && x.id && x.label) : [];
  return {
    poses: [...POSES, ...safe(c.poses)],
    backgrounds: [...BACKGROUNDS, ...safe(c.backgrounds)],
    templates: Array.isArray(c.templates) ? c.templates : [],
  };
}

const PRESERVE = "Preserve the garment's fabric texture, colors, patterns, prints, logos and every design detail with high fidelity — do not redesign or alter the clothing.";

/* يبني البرومبت النهائي (إنجليزي) حسب نوع اللقطة + الخيارات + ملاحظات */
export function buildStudioPrompt(opts, lib){
  const o = opts || {};
  const poses = (lib && lib.poses) || POSES;
  const backgrounds = (lib && lib.backgrounds) || BACKGROUNDS;
  const shot = o.shotType || "model";
  const bg = byId(backgrounds, o.backgroundId) || backgrounds[0] || BACKGROUNDS[0];
  const notes = String(o.notes || "").trim();
  let lines;

  if(shot === "ghost"){
    lines = [
      "Generate a professional ghost-mannequin (invisible mannequin) e-commerce product photograph of the EXACT garment(s) shown in the reference image(s).",
      "The garment keeps a natural 3D worn shape as if on an invisible body — no person and no mannequin visible, hollow neckline and cuffs.",
      PRESERVE, (bg.prompt || "") + ".",
      "Garment centered and fully visible, sharp focus, clean professional product photography, high detail, no text, no watermark.",
    ];
  } else if(shot === "flat"){
    lines = [
      "Generate a professional flat-lay product photograph of the EXACT garment(s) shown in the reference image(s), neatly arranged and viewed straight from directly above (top-down).",
      PRESERVE, (bg.prompt || "") + ".",
      "Even soft lighting, full garment visible, sharp focus, clean e-commerce product photography, high detail, no text, no watermark.",
    ];
  } else {
    const gender = byId(GENDERS, o.genderId) || GENDERS[0];
    const isChild = gender.id === "girl" || gender.id === "boy";
    const age = isChild ? byId(CHILD_AGES, o.ageId) : null;
    const pose = byId(poses, o.poseId) || poses[0] || POSES[0];
    const framing = byId(FRAMINGS, o.framingId) || FRAMINGS[0];
    const subject = (age ? (age.prompt + " ") : "") + gender.prompt;
    lines = [
      "Generate a photorealistic professional fashion-catalog photograph of " + subject + " fashion model wearing the EXACT garment(s) shown in the reference image(s).",
      PRESERVE, (framing.prompt || "") + ".", (pose.prompt || "") + ".", (bg.prompt || "") + ".",
      "Photorealistic skin and natural proportions, sharp focus on the outfit, professional studio fashion photography, high detail, no text, no watermark.",
    ];
  }
  if(notes) lines.push("Additional requirements: " + notes);
  return lines.join(" ");
}

/* برومبت تعديل صورة مولّدة (refine) — بياخد الصورة كمصدر + تعليمات المستخدم */
export function buildEditPrompt(instruction){
  return "Edit the provided image as follows: " + String(instruction || "").trim() +
    ". Keep the same subject, garment identity, fabric and colors unless the instruction explicitly changes them. " +
    "Photorealistic, high detail, professional photography, no text, no watermark.";
}

/* وصف عربي مختصر للخيارات (للعرض) */
export function describeStudioOptions(opts, lib){
  const o = opts || {};
  const shot = o.shotType || "model";
  const backgrounds = (lib && lib.backgrounds) || BACKGROUNDS;
  const poses = (lib && lib.poses) || POSES;
  const bgL = (byId(backgrounds, o.backgroundId) || backgrounds[0] || BACKGROUNDS[0]).label;
  if(shot === "ghost") return "مانيكان شبح · " + bgL;
  if(shot === "flat")  return "فرش مسطّح · " + bgL;
  const gender = byId(GENDERS, o.genderId) || GENDERS[0];
  const isChild = gender.id === "girl" || gender.id === "boy";
  const age = isChild ? byId(CHILD_AGES, o.ageId) : null;
  return [
    (age ? age.label + " — " : "") + gender.label,
    (byId(FRAMINGS, o.framingId) || FRAMINGS[0]).label,
    (byId(poses, o.poseId) || poses[0] || POSES[0]).label,
    bgL,
  ].filter(Boolean).join(" · ");
}
