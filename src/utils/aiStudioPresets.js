/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiStudioPresets.js (V21.23.3 — استوديو الموديلات Phase 2c)
   ───────────────────────────────────────────────────────────────────────
   مكتبة خيارات التوليد + باني البرومبت. الافتراضيات هنا، والمخصّصة بتاعت
   المستخدم في factory/config.aiStudioPresets وبتتدمج (mergePresets).

   نوع اللقطة (shotType):
     • model     = موديل الطقم (try-on، الافتراضي)
     • reference = موديل مرجعي: Image1 (موديل) + Image2 (قطعة) → تبديل القطعة
                   مع قفل الهوية/الوقفة/الخلفية/الإضاءة (برومبت Ahmed الاحترافي)
     • ghost     = مانيكان مفرغ (invisible mannequin)
     • flat      = تصوير مسطّح (flat-lay)
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
  { id: "model",     label: "🧍 موديل" },
  { id: "reference", label: "👯 موديل مرجعي" },
  { id: "ghost",     label: "👕 مانيكان مفرغ" },
  { id: "flat",      label: "🧺 تصوير مسطّح" },
  { id: "techpack",  label: "📐 تيك باك (رسم فني)" },
];

export const GENDERS = [
  { id: "boy",   label: "ولد",   prompt: "a male child" },
  { id: "girl",  label: "بنت",   prompt: "a female child" },
  { id: "woman", label: "سيدة",  prompt: "an adult female" },
  { id: "man",   label: "رجل",   prompt: "an adult male" },
];

/* تعبير الوجه — افتراضي «ابتسامة» (أمر Ahmed: دايماً ابتسامة أساسي). */
export const EXPRESSIONS = [
  { id: "smile",     label: "ابتسامة 😊", prompt: "a warm, genuine, natural smile with bright friendly eyes and a happy approachable expression" },
  { id: "laugh",     label: "ضحكة 😄",    prompt: "laughing joyfully with a big happy genuine expression, full of fun and delight" },
  { id: "confident", label: "واثق 😎",    prompt: "a confident charismatic expression with a subtle natural smile and lively eyes" },
  { id: "calm",      label: "هادئ 🙂",    prompt: "a soft pleasant relaxed expression with a gentle warm hint of a smile" },
  { id: "candid",    label: "عفوي ✨",    prompt: "a candid natural unposed expression caught mid-moment, authentic and alive" },
];

/* مكتبة قوالب احترافية جاهزة (إعدادات كاملة) — تتدمج مع قوالب المستخدم.
   builtin:true عشان مايتحذفش. كل قالب بيظبط نوع اللقطة + الجنس + الوقفة +
   الخلفية + الإطار + الإضاءة + الكاميرا/النمط + قوة الواقعية. */
export const DEFAULT_TEMPLATES = [
  { id: "t_white",     name: "🏬 استوديو أبيض (متجر)", builtin: true, options: { shotType: "model", genderId: "boy", poseId: "front", framingId: "full", backgroundId: "studio_white", skinToneId: "any", lightingId: "soft", camStyle: "pro", cameraId: "dslr85", realismLevel: "medium", notes: "" } },
  { id: "t_summer",    name: "☀️ صيفي خارجي",          builtin: true, options: { shotType: "model", genderId: "boy", poseId: "walking", framingId: "full", backgroundId: "outdoor", lightingId: "natural", camStyle: "life", cameraId: "dslr50", realismLevel: "strong", notes: "" } },
  { id: "t_editorial", name: "📔 غلاف مجلة موضة",       builtin: true, options: { shotType: "model", genderId: "woman", poseId: "three4", framingId: "three", backgroundId: "studio_gray", lightingId: "dramatic", camStyle: "cine", cameraId: "dslr85", realismLevel: "strong", notes: "" } },
  { id: "t_street",    name: "🏙️ لايف ستايل شارع",      builtin: true, options: { shotType: "model", genderId: "man", poseId: "walking", framingId: "full", backgroundId: "street", lightingId: "natural", camStyle: "life", cameraId: "wide35", realismLevel: "strong", notes: "" } },
  { id: "t_kids",      name: "🧸 أطفال مرح",            builtin: true, options: { shotType: "model", genderId: "boy", ageId: "a4_6", poseId: "playful", framingId: "full", backgroundId: "solid", lightingId: "soft", camStyle: "pro", cameraId: "dslr85", realismLevel: "medium", notes: "" } },
  { id: "t_beach",     name: "🏖️ شاطئ صيفي",            builtin: true, options: { shotType: "model", genderId: "girl", ageId: "a7_9", poseId: "playful", framingId: "full", backgroundId: "beach", lightingId: "natural", camStyle: "life", cameraId: "dslr50", realismLevel: "strong", notes: "" } },
  { id: "t_winter",    name: "🧣 شتوي دافئ",            builtin: true, options: { shotType: "model", genderId: "woman", poseId: "front", framingId: "three", backgroundId: "room", lightingId: "golden", camStyle: "life", cameraId: "dslr50", realismLevel: "strong", notes: "" } },
  { id: "t_minimal",   name: "◻️ مينيمال راقي",          builtin: true, options: { shotType: "model", genderId: "woman", poseId: "three4", framingId: "half", backgroundId: "solid", lightingId: "soft", camStyle: "pro", cameraId: "dslr85", realismLevel: "medium", notes: "" } },
  { id: "t_portrait",  name: "👤 بورتريه قريب",          builtin: true, options: { shotType: "model", genderId: "boy", poseId: "front", framingId: "half", backgroundId: "beige", lightingId: "soft", camStyle: "pro", cameraId: "dslr85", realismLevel: "medium", notes: "" } },
  { id: "t_ghost",     name: "👕 مانيكان مفرغ (متجر)",   builtin: true, options: { shotType: "ghost", backgroundId: "studio_white", camStyle: "pro", cameraId: "dslr85", realismLevel: "medium", notes: "" } },
  { id: "t_flat",      name: "🧺 تصوير مسطّح",            builtin: true, options: { shotType: "flat", backgroundId: "studio_white", camStyle: "pro", cameraId: "none", realismLevel: "medium", notes: "" } },
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
  { id: "front",   label: "واقف طبيعي",      prompt: "standing in a relaxed natural stance facing the camera, weight shifted onto one leg, shoulders loose, a lively confident and effortless posture" },
  { id: "three4",  label: "ثلاثة أرباع",      prompt: "a dynamic three-quarter stance, body angled, looking towards the camera with effortless natural energy" },
  { id: "side",    label: "جانبي",           prompt: "a side profile pose with a natural lean and relaxed, lively posture" },
  { id: "back",    label: "من الخلف",         prompt: "turned with the back to the camera glancing playfully over the shoulder, showing the back of the outfit naturally" },
  { id: "walking", label: "ماشي",            prompt: "walking towards the camera mid-stride with natural runway motion and lively energy" },
  { id: "hands",   label: "يدين على الخصر",   prompt: "standing confidently with hands on hips and an energetic upbeat posture" },
  { id: "sitting", label: "جالس مرتاح",      prompt: "sitting casually and relaxed, leaning slightly with a natural candid lively feel" },
  { id: "playful", label: "حركة لعب",         prompt: "in a cheerful playful action pose, mid-movement, full of fun and joyful energy" },
  { id: "jump",    label: "قفزة",            prompt: "captured mid-air in a joyful energetic jump, dynamic motion frozen, full of excitement" },
  { id: "running", label: "جري",             prompt: "running playfully towards the camera, dynamic motion with clothes and hair moving naturally" },
  { id: "twirl",   label: "لفّة",            prompt: "spinning and twirling joyfully, the outfit flowing with the movement, candid and lively" },
  { id: "lean",    label: "متّكي",           prompt: "leaning casually against a wall or prop, relaxed cool lifestyle posture" },
  { id: "shoulder",label: "نظرة خلفية",      prompt: "looking back over the shoulder towards the camera with a playful natural glance" },
  { id: "sporty",  label: "رياضي",           prompt: "an energetic sporty action pose, mid-motion, athletic and dynamic" },
  { id: "floor",   label: "قاعد ع الأرض",    prompt: "sitting casually on the floor in a relaxed playful candid pose" },
  { id: "hands_up",label: "إيدين لفوق",      prompt: "an excited expressive pose with arms raised playfully, full of energy and joy" },
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
  { id: "auto",  label: "تلقائي",          prompt: "" },
  { id: "closeup", label: "قريبة (وش/كتف)", prompt: "a close-up portrait shot, head and shoulders only, the face prominent and the upper garment detail clearly visible" },
  { id: "half",  label: "نصفي (نص الجسم)",   prompt: "a half-body shot from the waist up" },
  { id: "three", label: "٣/٤ جسم",          prompt: "a three-quarter body shot, from the knees up" },
  { id: "full",  label: "جسم كامل",          prompt: "a full-body shot, head to toe fully visible, full outfit shown" },
  { id: "wide",  label: "بعيدة (واسعة)",     prompt: "a wide full-length shot with the full body visible and more of the surrounding scene around the subject" },
];

/* ── V21.27.42: تحكّمات احترافية إضافية تتحقن في البرومبت الجاهز + اليدوي ──
   كلها أول خيار «تلقائي» (prompt فاضي = مايتحقنش) عشان مايخرّبوش برومبت
   مكتوب بعناية — الحقن يحصل بس لما المستخدم يختار قيمة فعلية. */

/* زاوية الكاميرا — أقوى تحكّم بصري */
export const CAMERA_ANGLES = [
  { id: "auto",   label: "تلقائي",        prompt: "" },
  { id: "eye",    label: "مستوى العين",   prompt: "shot straight-on at eye level" },
  { id: "high",   label: "من فوق",        prompt: "shot from a high angle looking slightly down at the subject" },
  { id: "low",    label: "من تحت",        prompt: "shot from a low angle looking slightly up at the subject, making the subject look tall and powerful" },
  { id: "top",    label: "من فوق مباشرة", prompt: "shot from directly overhead, a top-down bird's-eye view" },
  { id: "side",   label: "جانبي",         prompt: "shot from the side as a profile camera angle" },
  { id: "threeq", label: "٣/٤ زاوية",     prompt: "shot from a three-quarter front camera angle" },
  { id: "back",   label: "من الخلف",       prompt: "shot from behind the subject" },
];

/* اتجاه نظر الموديل */
export const GAZES = [
  { id: "auto",     label: "تلقائي",       prompt: "" },
  { id: "camera",   label: "على الكاميرا", prompt: "the subject is looking directly into the camera lens" },
  { id: "away",     label: "بعيد (عفوي)",  prompt: "the subject is looking away from the camera off to the side in a natural candid way" },
  { id: "shoulder", label: "نظرة خلفية",   prompt: "the subject is glancing back over the shoulder towards the camera" },
  { id: "down",     label: "لتحت",         prompt: "the subject is looking gently downward" },
];

/* درجة الألوان / المود العام للصورة */
export const COLOR_GRADES = [
  { id: "auto",    label: "تلقائي",      prompt: "" },
  { id: "warm",    label: "دافئ",        prompt: "a warm color grade with soft golden tones" },
  { id: "cool",    label: "بارد",        prompt: "a cool color grade with crisp clean blue-leaning tones" },
  { id: "neutral", label: "محايد",       prompt: "a neutral natural true-to-life color grade" },
  { id: "film",    label: "فيلم",        prompt: "a warm analog film color grade with fine natural grain" },
  { id: "highkey", label: "ساطع نضيف",   prompt: "a bright airy high-key look with light clean tones, ideal for clean e-commerce" },
  { id: "lowkey",  label: "درامي",       prompt: "a moody low-key look with deep shadows and dramatic contrast" },
  { id: "bw",      label: "أبيض/أسود",   prompt: "an elegant black-and-white monochrome look with rich tones" },
  { id: "pastel",  label: "باستيل",      prompt: "a soft pastel color palette, gentle and dreamy" },
  { id: "vivid",   label: "زاهي",        prompt: "vivid punchy yet natural and realistic saturated colors" },
];

export const SKIN_TONES = [
  { id: "any",    label: "تلقائي",  prompt: "" },
  { id: "light",  label: "فاتح",    prompt: "light fair skin tone" },
  { id: "medium", label: "قمحي",    prompt: "medium olive skin tone" },
  { id: "tan",    label: "أسمر",    prompt: "tan brown skin tone" },
  { id: "dark",   label: "داكن",    prompt: "deep dark skin tone" },
];

export const LIGHTINGS = [
  { id: "soft",     label: "استوديو ناعم", prompt: "soft even studio lighting" },
  { id: "natural",  label: "طبيعي",        prompt: "natural daylight" },
  { id: "dramatic", label: "درامي",        prompt: "dramatic directional lighting with soft shadows" },
  { id: "golden",   label: "ذهبي",         prompt: "warm golden-hour lighting" },
];

/* ── معزّز الواقعية (anti-AI look) — V21.23.6 ──
   البحث: مفتاح الواقعية = مواصفات كاميرا/عدسة + نسيج جلد حقيقي + نفي «شكل الـ
   AI». نضيف بلوك مدروس للبرومبت عشان الصورة تبان فوتوغرافيا حقيقية. */
/* العدسات — كل واحدة بشكل مختلف للخلفية/العمق + رسم توضيحي (diagram) */
export const CAMERA_PRESETS = [
  { id: "dslr85", label: "بورتريه 85mm", diagram: "bokeh",    desc: "عمق ميدان ضيق، خلفية مموّهة ناعمة (bokeh) — أفضل للموديل الواحد", prompt: "shot on a full-frame DSLR camera with an 85mm f/1.8 prime lens, shallow depth of field and creamy natural background blur (bokeh)" },
  { id: "dslr50", label: "طبيعي 50mm",   diagram: "balanced", desc: "منظور قريب من عين الإنسان، تمويه خلفية خفيف", prompt: "shot on a full-frame DSLR camera with a 50mm f/1.8 lens, natural eye-level perspective and mild background blur" },
  { id: "wide35", label: "واسع 35mm",    diagram: "wide",     desc: "يبيّن خلفية أوسع — لايف ستايل وأماكن", prompt: "shot on a 35mm wide-angle lens showing more environmental context with deep focus" },
  { id: "film",   label: "فيلم 35مم",    diagram: "film",     desc: "ألوان فيلم دافئة + حبيبات طبيعية", prompt: "shot on 35mm analog film stock with fine natural grain and warm true-to-life colors" },
  { id: "phone",  label: "موبايل",       diagram: "deep",     desc: "كل حاجة واضحة، إضاءة يومية عفوية", prompt: "shot on a modern flagship smartphone camera, everything in focus, natural everyday candid look" },
  { id: "none",   label: "تلقائي",       diagram: "auto",     desc: "النموذج يختار الأنسب", prompt: "" },
];

/* نمط التصوير — الافتراضي احترافي */
export const CAM_STYLES = [
  { id: "pro",  label: "احترافي",    prompt: "professional studio editorial fashion photography, clean and polished" },
  { id: "life", label: "لايف ستايل", prompt: "natural lifestyle photography with a candid everyday feel" },
  { id: "cine", label: "سينمائي",    prompt: "cinematic photography with moody dramatic color grading" },
];

export const REALISM_LEVELS = [
  { id: "subtle", label: "خفيف" },
  { id: "medium", label: "متوسط" },
  { id: "strong", label: "قوي" },
];

export function cameraPromptOf(id){ return (CAMERA_PRESETS.find(c => c.id === id) || {}).prompt || ""; }
export function stylePromptOf(id){ return (CAM_STYLES.find(c => c.id === id) || {}).prompt || ""; }

export function buildRealismSuffix(level, isPerson){
  const personBase = "Photorealistic editorial photograph with true-to-life colors and natural lighting. Natural realistic skin texture with visible pores and subtle imperfections, no skin smoothing, no airbrushing, no plastic or waxy skin. Realistic catchlights in the eyes, natural hair detail and soft realistic shadows.";
  const productBase = "Realistic product photograph with true-to-life fabric texture, natural fibers and threads, accurate colors and soft realistic studio lighting and shadows. Looks like a real photo taken by a professional product photographer.";
  const antiAI = " It must look like a genuine real photograph, NOT AI-generated — no CGI, no 3D render, no over-sharpening, no HDR halo, no artificial digital look.";
  let s = isPerson ? personBase : productBase;
  if(level === "strong") s += " Candid authentic feel, subtle natural asymmetry, fine photographic film grain and realistic depth of field." + antiAI;
  else if(level === "medium") s += " Subtle film grain and realistic depth of field." + antiAI;
  else s += antiAI;
  return s;
}

/* برومبت التلبيس بموديل مرجعي (Image1=موديل، Image2=قطعة) — صياغة Ahmed الاحترافية */
export const REFERENCE_TRYON_PROMPT =
`INSTRUCTIONS (Read Carefully):
You will receive two images:
Image 1: the reference model + exact pose + studio/background + camera angle + lens look + lighting style.
Image 2: the garment item to be applied.

TASK:
Apply the garment from Image 2 onto the model in Image 1 as a high-end virtual try-on.

IDENTITY & POSE LOCK (MUST NOT CHANGE):
- Preserve the model's exact identity from Image 1: facial features, skin tone, hair, age, body proportions, expression, gaze direction, and all visible anatomy.
- Preserve the exact pose and body posture from Image 1 with no re-posing.
- Preserve the exact framing and crop from Image 1.

CAMERA / LENS / ANGLE LOCK (MUST MATCH IMAGE 1):
- Keep the same camera angle, camera height, and perspective as Image 1.
- Keep the same focal length / lens character and depth-of-field look as Image 1.
- Do not change zoom, distortion, or perspective geometry.

LIGHTING & STUDIO LOCK (MUST MATCH IMAGE 1):
- Keep the same studio/background from Image 1 exactly (same color, gradients, shadows, floor contact, and backdrop continuity).
- Keep the same lighting setup from Image 1: direction, softness, highlight roll-off, and shadow density.
- Preserve realistic contact shadows and natural fabric shading consistent with Image 1.

GARMENT APPLICATION RULES (IMAGE 2):
- Use only the garment from Image 2 and fit it naturally onto the model from Image 1.
- Maintain realistic fabric behavior: correct drape, tension, folds, seam lines, thickness, and gravity.
- Ensure correct sizing and alignment to the body (shoulders/waist/hips/chest) and natural layering if needed.
- Keep edges clean with no warping, melting, double collars, duplicated sleeves, or texture stretching.

STRICT POLICY:
- Do NOT add new logos, prints, text, patterns, accessories, props, or extra garments not present in Image 2.
- Do NOT change the model's shoes, hair, or face.

REALISM & QUALITY:
- Photorealistic output, high detail, natural skin and fabric texture. Upscale and enhance overall quality.
- No cartoon/anime/illustration look. No blur, no artifacts, no AI deformation, no extra limbs, no jewelry unless already present in Image 1.

OUTPUT:
Return one final image only: the model from Image 1 wearing the garment from Image 2, with everything else identical to Image 1.`;

const byId = (arr, id) => (arr || []).find(x => x && x.id === id) || null;

export function mergePresets(data){
  const c = (data && data.aiStudioPresets) || {};
  const safe = (a) => Array.isArray(a) ? a.filter(x => x && x.id && x.label) : [];
  return {
    poses: [...POSES, ...safe(c.poses)],
    backgrounds: [...BACKGROUNDS, ...safe(c.backgrounds)],
    templates: [...DEFAULT_TEMPLATES, ...(Array.isArray(c.templates) ? c.templates : [])],
    /* برومبتس جاهزة بصور (حرّة) — كل واحد {id,name,prompt,image} للتنفيذ المباشر */
    savedPrompts: Array.isArray(c.savedPrompts) ? c.savedPrompts.filter(x => x && x.id && x.prompt) : [],
  };
}

const PRESERVE = "Preserve the garment's fabric texture, colors, patterns, prints, logos and every design detail with high fidelity — do not redesign or alter the clothing.";

/* V21.26.10: الموديل (طفل/بنت/راجل/ست) دايماً لابس شوز مناسب — مايبقاش حافي.
   افتراضي على كل التوليد والبرومبتس الجاهزة (أمر Ahmed). */
export const FOOTWEAR_CLAUSE = "Important: the model must be wearing suitable, stylish footwear (clean sneakers or appropriate shoes) that matches the outfit and fits the model's gender and age — the model must NEVER be barefoot — unless the uploaded garment item itself is footwear.";

export function buildStudioPrompt(opts, lib){
  const o = opts || {};
  const poses = (lib && lib.poses) || POSES;
  const backgrounds = (lib && lib.backgrounds) || BACKGROUNDS;
  const shot = o.shotType || "model";
  if(shot === "reference"){
    const notes = String(o.notes || "").trim();
    return REFERENCE_TRYON_PROMPT + (notes ? "\n\nAdditional requirements: " + notes : "");
  }
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
  } else if(shot === "techpack"){
    /* V21.26.14: «تيك باك» — يحوّل صورة القطعة لرسم فني خطّي بتفاصيل الخياطة. */
    lines = [
      "Convert the EXACT garment(s) shown in the reference image(s) into a clean professional technical fashion FLAT SKETCH (CAD-style apparel technical drawing / tech-pack spec drawing).",
      "Render it as precise BLACK line art on a pure WHITE background — vector-like clean uniform outlines, NO color, NO shading, NO gradients, NO fabric print or texture, NO model and NO mannequin.",
      "Show BOTH the FRONT view and the BACK view of the garment side by side, flat, symmetrical and proportionally accurate, as laid out on a production spec sheet.",
      "Clearly draw EVERY construction and sewing detail exactly as in the garment: all seams and panel lines, topstitching and stitch lines shown as dashed lines, collar, plackets and button positions, pockets and pocket stitching, cuffs, sleeve hems, bottom hems, waistband, elastic, drawstring and any trims or labels.",
      "Technical apparel flat illustration style — accurate, neat and production-ready, no text, no dimensions, no watermark, no background elements.",
    ];
  } else {
    const gender = byId(GENDERS, o.genderId) || GENDERS[0];
    const isChild = gender.id === "girl" || gender.id === "boy";
    const age = isChild ? byId(CHILD_AGES, o.ageId) : null;
    const pose = byId(poses, o.poseId) || poses[0] || POSES[0];
    const framing = byId(FRAMINGS, o.framingId) || FRAMINGS[0];
    const skin = byId(SKIN_TONES, o.skinToneId);
    const light = byId(LIGHTINGS, o.lightingId);
    const expr = byId(EXPRESSIONS, o.expressionId) || EXPRESSIONS[0];
    /* V21.27.42: تحكّمات إضافية (auto = prompt فاضي → مايتحقنش) */
    const camAngle = byId(CAMERA_ANGLES, o.camAngleId);
    const gaze = byId(GAZES, o.gazeId);
    const grade = byId(COLOR_GRADES, o.colorGradeId);
    const subject = (age ? (age.prompt + " ") : "") + gender.prompt + (skin && skin.prompt ? " with " + skin.prompt : "");
    /* روح/طاقة الصورة — الافتراضي ابتسامة + حيوية ومنع شكل المانيكان الجامد. */
    const mood = isChild
      ? "A fun, cheerful, playful and joyful kids-fashion mood, full of life and natural childlike energy and movement."
      : "A natural, lively, confident and effortless editorial mood, full of life, personality and movement.";
    lines = [
      "Generate a photorealistic professional lifestyle fashion-catalog photograph of " + subject + " fashion model wearing the EXACT garment(s) shown in the reference image(s).",
      PRESERVE,
      (framing && framing.prompt) ? (framing.prompt + ".") : "",
      (camAngle && camAngle.prompt) ? (camAngle.prompt + ".") : "",
      (pose.prompt || "") + ".",
      (gaze && gaze.prompt) ? (gaze.prompt + ".") : "",
      "The model has " + (expr.prompt || EXPRESSIONS[0].prompt) + ".",
      mood,
      FOOTWEAR_CLAUSE,
      "Use natural candid body language, authentic spontaneous movement and a genuine lively vibe — absolutely NOT a stiff, rigid, frozen or mannequin-like pose, and not an empty blank expression.",
      (bg.prompt || "") + ".",
      light && light.prompt ? (light.prompt + ".") : "",
      (grade && grade.prompt) ? (grade.prompt + ".") : "",
      "Photorealistic skin and natural proportions, sharp focus on the outfit, professional fashion photography, high detail, no text, no watermark.",
    ].filter(Boolean);
  }
  if(notes) lines.push("Additional requirements: " + notes);
  return lines.join(" ");
}

export function buildEditPrompt(instruction){
  return "Edit the provided image as follows: " + String(instruction || "").trim() +
    ". Keep the same subject, garment identity, fabric and colors unless the instruction explicitly changes them. " +
    "Photorealistic, high detail, professional photography, no text, no watermark.";
}

/* ── أغلفة المجلات / النص واللوجو على الصورة (V21.24.0) ── */
export const COVER_STYLES = [
  { id: "none",    label: "نص/لوجو فقط", prompt: "Add a small tasteful brand logo and a reference number in a corner with clean modern typography. Do NOT cover the face or the garment, keep the original photo as-is otherwise." },
  { id: "fashion", label: "مجلة موضة",   prompt: "Transform this into a high-end glossy fashion magazine cover: a bold masthead title across the top, the model centered, a few elegant cover-line headlines along the sides, issue month and a small barcode, premium editorial layout." },
  { id: "kids",    label: "أطفال",        prompt: "Transform this into a playful kids fashion magazine cover: a colorful friendly masthead, fun rounded headlines, cheerful child-friendly layout." },
  { id: "minimal", label: "مينيمال",      prompt: "Transform this into a minimalist fashion magazine cover: a clean masthead, lots of negative space, one elegant headline, modern refined typography." },
  { id: "street",  label: "ستريت",        prompt: "Transform this into an urban streetwear magazine cover: a bold graphic masthead, edgy modern headlines, street-style layout." },
  { id: "luxury",  label: "فخامة",        prompt: "Transform this into a luxury fashion magazine cover: gold-accented elegant masthead, sophisticated serif headlines, high-end premium editorial layout." },
  { id: "vogue",   label: "فوغ راقٍ",    prompt: "Transform this into a sophisticated high-fashion Vogue-style magazine cover: a bold serif masthead at the top, the model centered, refined cover-lines, elegant minimal premium editorial layout." },
  { id: "vintage", label: "فينتاج",      prompt: "Transform this into a retro vintage magazine cover: warm faded film tones, a classic serif masthead, old-school cover-lines and layout." },
  { id: "neon",    label: "نيون Y2K",    prompt: "Transform this into a bold Y2K neon magazine cover: vibrant neon colors, funky bubble typography, playful energetic layout." },
  { id: "bwcover", label: "أبيض/أسود",   prompt: "Transform this into an elegant black-and-white editorial magazine cover: monochrome tones, a clean modern masthead, refined minimal cover-lines." },
  { id: "sport",   label: "رياضي",       prompt: "Transform this into a dynamic sports/active magazine cover: a bold energetic masthead, motion-style headlines, vibrant athletic layout." },
  { id: "arabic",  label: "عربي أنيق",   prompt: "Transform this into an elegant Arabic fashion magazine cover with a tasteful Arabic-style masthead and a refined modern premium layout." },
];

/* ── أدوات التصميم (V21.26.5) — إدراج لوجو + مشاهد طبيعية + تعديلات سريعة ── */
export const LOGO_POSITIONS = [
  { id: "top-right",    label: "أعلى يمين",   prompt: "the top-right corner" },
  { id: "top-left",     label: "أعلى يسار",   prompt: "the top-left corner" },
  { id: "top-center",   label: "أعلى المنتصف", prompt: "the top-center area" },
  { id: "bottom-right", label: "أسفل يمين",   prompt: "the bottom-right corner" },
  { id: "bottom-left",  label: "أسفل يسار",   prompt: "the bottom-left corner" },
];
export const LOGO_SIZES = [
  { id: "small",  label: "صغير",  prompt: "small and subtle (about 12% of the image width)" },
  { id: "medium", label: "متوسط", prompt: "medium sized (about 20% of the image width)" },
];
export function buildLogoPrompt(positionId, sizeId){
  const pos = (LOGO_POSITIONS.find(p => p.id === positionId) || LOGO_POSITIONS[0]).prompt;
  const size = (LOGO_SIZES.find(s => s.id === sizeId) || LOGO_SIZES[0]).prompt;
  return "Image 1 is a finished photograph. Image 2 is a brand logo (treat any white or checkerboard area around it as transparent). "
    + "Composite the logo from Image 2 onto Image 1 as a clean simple watermark placed in " + pos + ", " + size + ". "
    + "Keep the logo's exact shape, proportions, colors and lettering — do NOT redraw, restyle, recolor or add any text to it. "
    + "Do NOT change anything else in Image 1: keep the person, garment, pose, background and colors 100% identical. "
    + "Output the same photo with only the logo neatly added. Photorealistic, high quality, no extra text or watermark.";
}

/* مشاهد طبيعية لتغيير الخلفية — كل عنصر تعليمة تعديل جاهزة (تتلفّ بـ buildEditPrompt) */
export const SCENERY_BACKGROUNDS = [
  { id: "garden",   label: "🌿 حديقة",  instr: "Replace the background with a beautiful sunny garden, soft blurred greenery and natural daylight." },
  { id: "beach",    label: "🏖️ شاطئ",   instr: "Replace the background with a bright sunny beach with sea and sky and soft natural light." },
  { id: "forest",   label: "🌲 غابة",   instr: "Replace the background with a serene green forest with soft sunlight through the trees." },
  { id: "mountain", label: "⛰️ جبال",   instr: "Replace the background with a scenic mountain landscape under a clear sky." },
  { id: "desert",   label: "🏜️ صحراء",  instr: "Replace the background with golden sand dunes and a warm desert sky." },
  { id: "sunset",   label: "🌅 غروب",   instr: "Replace the background with a warm golden-hour sunset sky over a soft landscape." },
  { id: "city",     label: "🏙️ مدينة",  instr: "Replace the background with a stylish modern city street with soft bokeh." },
  { id: "flowers",  label: "🌸 زهور",   instr: "Replace the background with a dreamy field of blooming flowers in soft focus." },
  { id: "snow",     label: "❄️ ثلج",    instr: "Replace the background with a soft snowy winter scene with gentle daylight." },
  { id: "whiteBg",  label: "◻️ أبيض",   instr: "Replace the background with a clean pure white seamless studio backdrop with even lighting." },
];

/* تعديلات سريعة جاهزة (ستايل كانفا) — تعليمة جاهزة تتلفّ بـ buildEditPrompt */
export const QUICK_EDITS = [
  { id: "bw",     label: "⬛ أبيض/أسود", instr: "Convert the image to an elegant black-and-white monochrome photograph with rich tones, keep all the details." },
  { id: "bright", label: "☀️ إضاءة أنصع", instr: "Brighten the image with clean even lighting and a bright airy look, keep natural skin tones." },
  { id: "warm",   label: "🔥 دافئ",     instr: "Apply a warm cozy color grade with soft golden tones." },
  { id: "vivid",  label: "🌈 زاهي",     instr: "Make the colors more vivid and punchy while keeping them natural and realistic." },
  { id: "frame",  label: "⬜ إطار أبيض", instr: "Add a clean thin white border/frame around the whole image like a polaroid-style margin." },
  { id: "smile",  label: "😊 ابتسامة",  instr: "Make the model show a warm natural genuine smile, keep the identity and everything else the same." },
  { id: "shoes",  label: "👟 كوتش أبيض", instr: "Add clean white sneakers on the model's feet matching the outfit, keep everything else the same." },
];

export function buildCoverPrompt(o){
  const opt = o || {};
  const style = COVER_STYLES.find(s => s.id === opt.styleId) || COVER_STYLES[0];
  let p = "Edit the provided image. " + style.prompt;
  const bits = [];
  if(opt.magName) bits.push("Magazine title / masthead text exactly: \"" + opt.magName + "\"");
  if(opt.withModelNo && opt.modelNo) bits.push("Include the product reference number \"" + opt.modelNo + "\" in a small tasteful spot");
  if(opt.withLogo) bits.push("Include a clean \"CLARK\" brand logo");
  if(opt.extra && String(opt.extra).trim()) bits.push("Headlines / extra text: " + String(opt.extra).trim());
  if(bits.length) p += " " + bits.join(". ") + ".";
  p += " Render ALL text crisply and correctly spelled with professional typography. Keep the model identity, garment, colors and pose unchanged. Photorealistic, high quality.";
  return p;
}

export function describeStudioOptions(opts, lib){
  const o = opts || {};
  const shot = o.shotType || "model";
  const backgrounds = (lib && lib.backgrounds) || BACKGROUNDS;
  const poses = (lib && lib.poses) || POSES;
  if(shot === "reference") return "موديل مرجعي (تبديل القطعة)";
  const bgL = (byId(backgrounds, o.backgroundId) || backgrounds[0] || BACKGROUNDS[0]).label;
  if(shot === "ghost") return "مانيكان مفرغ · " + bgL;
  if(shot === "flat")  return "تصوير مسطّح · " + bgL;
  if(shot === "techpack") return "تيك باك (رسم فني)";
  const gender = byId(GENDERS, o.genderId) || GENDERS[0];
  const isChild = gender.id === "girl" || gender.id === "boy";
  const age = isChild ? byId(CHILD_AGES, o.ageId) : null;
  const skin = byId(SKIN_TONES, o.skinToneId);
  const expr = byId(EXPRESSIONS, o.expressionId) || EXPRESSIONS[0];
  return [
    (age ? age.label + " — " : "") + gender.label,
    skin && skin.id !== "any" ? skin.label : "",
    (byId(FRAMINGS, o.framingId) || FRAMINGS[0]).label,
    (byId(poses, o.poseId) || poses[0] || POSES[0]).label,
    expr ? expr.label : "",
    bgL,
  ].filter(Boolean).join(" · ");
}
