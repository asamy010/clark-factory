/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Arabic PDF utility (V19.70.21 — Approach A)
   ───────────────────────────────────────────────────────────────────────
   Generates PDFs WITHOUT html2canvas. Pure jsPDF text rendering with
   Cairo TTF embedded directly into the PDF. Bypasses the html2canvas
   Arabic shaping bug that V19.70.14/15/16/19 attempted to fix from
   different angles — none held. The root cause was html2canvas's
   internal canvas rendering of complex scripts; eliminating it solves
   the bug structurally.

   Pipeline:
     1. Lazy-load jsPDF + jspdf-autotable from CDN
     2. Lazy-fetch Cairo Regular + Bold TTF binaries (jsdelivr/gh CORS-safe)
     3. Convert TTF to base64 → register with jsPDF via addFileToVFS + addFont
     4. Apply Arabic letter-shaping (presentation forms) before passing
        text to jsPDF — jsPDF doesn't auto-shape Arabic, it just renders
        whatever glyphs the codepoints map to in the font's cmap. The
        shaper converts Unicode Arabic (e.g. "العميل") to its visual
        presentation forms (e.g. ﺍﻟﻌﻤﻴﻞ but with proper connections).
     5. Use jsPDF.text() and autoTable() to lay out the document

   Public API:
     loadArabicPdfLibs()                    — preload (returns promise)
     createPdf()                            — new jsPDF, Cairo registered
     ar(text)                               — shape Arabic for rendering
     buildAvailableStockPdfBase64(payload)  — for the رصيد متاح popup
     buildDeliveryReceiptPdfBase64(payload) — (future) for bulk WA send
   ═══════════════════════════════════════════════════════════════════════ */

const JSPDF_URL    = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
const AUTOTABLE_URL = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js";
/* V19.70.26: switched from Tajawal → Amiri. Tajawal's cmap was incomplete for
   Arabic Presentation Forms-B — the user reported missing letters in PDF
   output (e.g. "التليفون" rendered as "لتليفو", missing ا and ن).
   Amiri is specifically designed as a complete Arabic typeface (calligraphic
   Naskh style) with FULL Arabic Presentation Forms-B coverage (U+FE70-U+FEFC).
   Visually different from Cairo/Tajawal (more traditional, less modern), but
   the priority right now is correctness over aesthetics — until we find a
   modern Arabic sans-serif with complete PFB coverage that's also bundled-
   capable. Amiri Regular + Bold = ~840KB total. */
const ARABIC_REGULAR_URL = "/fonts/Amiri-Regular.ttf";
const ARABIC_BOLD_URL    = "/fonts/Amiri-Bold.ttf";

const _state = {
  loaded: false,
  loading: null,
  cairoRegularBase64: null,
  cairoBoldBase64: null,
};

function _loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector("script[src='" + url + "']")) return resolve();
    const s = document.createElement("script");
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load: " + url));
    document.head.appendChild(s);
  });
}

/* V19.70.24: accept array of URLs and try them in order. Falls back to next
   on any error (network failure, 403, 404, CORS rejection). Throws only if
   ALL URLs fail. Returns base64 string on success. */
async function _fetchAsBase64(urlOrUrls) {
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  let lastErr;
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) { lastErr = new Error(url + ": HTTP " + r.status); continue; }
      const buf = await r.arrayBuffer();
      /* Convert ArrayBuffer to base64 chunked to avoid call-stack overflow on big binaries */
      const bytes = new Uint8Array(buf);
      const CHUNK = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all CDN URLs failed: " + urls.join(", "));
}

export async function loadArabicPdfLibs() {
  if (_state.loaded) return;
  if (_state.loading) return _state.loading;
  _state.loading = (async () => {
    /* jsPDF first; autoTable extends jsPDF's API at load time */
    await _loadScript(JSPDF_URL);
    await _loadScript(AUTOTABLE_URL);
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF failed to load");
    /* Fonts in parallel — both downloads can overlap to save wall time.
       V19.70.25: same-origin /fonts/ paths instead of CDN — no CORS risk.
       V19.70.26: switched to Amiri (full PFB coverage). */
    const [reg, bold] = await Promise.all([
      _fetchAsBase64(ARABIC_REGULAR_URL),
      _fetchAsBase64(ARABIC_BOLD_URL),
    ]);
    _state.cairoRegularBase64 = reg;/* field name kept for back-compat with createPdf */
    _state.cairoBoldBase64 = bold;
    _state.loaded = true;
  })();
  return _state.loading;
}

/* ═══════════════════════════════════════════════════════════════════════
   Arabic letter-shaping (Unicode → Presentation Forms)
   ───────────────────────────────────────────────────────────────────────
   jsPDF doesn't do contextual shaping. We do it manually with a lookup
   table mapping (base codepoint, position) → presentation form codepoint
   in the Arabic Presentation Forms-B block (U+FE70-U+FEFC).

   Joining types per Unicode:
     - Right-joining (joins TO previous, not FROM next): ا د ذ ر ز و ء ؤ
       and a few more. These break the chain — the next character starts
       a new connection.
     - Dual-joining (joins both sides): most Arabic letters
     - Non-joining: the few non-letter Arabic chars (e.g. punctuation)

   Algorithm per char at index i:
     - prev_connects_forward = chars[i-1] is dual-joining (continues to i)
     - next_connects_backward = chars[i+1] is dual-joining or right-joining
       (i.e., can connect to i)
     - Form:
         medial   if prev_connects_forward && next_connects_backward
         final    if prev_connects_forward
         initial  if next_connects_backward
         isolated otherwise
   ═══════════════════════════════════════════════════════════════════════ */

/* Per-letter table:
     codepoint: [isolated, final, initial, medial, joinsForward]
   joinsForward = true → letter can connect to next (dual-joining)
                = false → right-joining (doesn't connect to next)
   Letters not in the table render unchanged.

   Source: Unicode Arabic Presentation Forms-B specification. */
const _AR_FORMS = {
  /* Hamza family — non-joining or right-joining */
  0x0621: [0xFE80, 0xFE80, 0xFE80, 0xFE80, false],/* ء */
  0x0622: [0xFE81, 0xFE82, 0xFE81, 0xFE82, false],/* آ */
  0x0623: [0xFE83, 0xFE84, 0xFE83, 0xFE84, false],/* أ */
  0x0624: [0xFE85, 0xFE86, 0xFE85, 0xFE86, false],/* ؤ */
  0x0625: [0xFE87, 0xFE88, 0xFE87, 0xFE88, false],/* إ */
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C, true ],/* ئ */
  /* Alif — right-joining */
  0x0627: [0xFE8D, 0xFE8E, 0xFE8D, 0xFE8E, false],/* ا */
  /* Ba family */
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92, true ],/* ب */
  0x0629: [0xFE93, 0xFE94, 0xFE93, 0xFE94, false],/* ة */
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98, true ],/* ت */
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C, true ],/* ث */
  /* Jim family */
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0, true ],/* ج */
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4, true ],/* ح */
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8, true ],/* خ */
  /* Dal family — right-joining */
  0x062F: [0xFEA9, 0xFEAA, 0xFEA9, 0xFEAA, false],/* د */
  0x0630: [0xFEAB, 0xFEAC, 0xFEAB, 0xFEAC, false],/* ذ */
  /* Ra family — right-joining */
  0x0631: [0xFEAD, 0xFEAE, 0xFEAD, 0xFEAE, false],/* ر */
  0x0632: [0xFEAF, 0xFEB0, 0xFEAF, 0xFEB0, false],/* ز */
  /* Sin family */
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4, true ],/* س */
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8, true ],/* ش */
  /* Sad family */
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC, true ],/* ص */
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0, true ],/* ض */
  /* Ta family */
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4, true ],/* ط */
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8, true ],/* ظ */
  /* Ain family */
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC, true ],/* ع */
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0, true ],/* غ */
  /* Fa family */
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4, true ],/* ف */
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8, true ],/* ق */
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC, true ],/* ك */
  /* Lam family */
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0, true ],/* ل */
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4, true ],/* م */
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8, true ],/* ن */
  /* Ha — joins both sides */
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC, true ],/* ه */
  /* Waw — right-joining */
  0x0648: [0xFEED, 0xFEEE, 0xFEED, 0xFEEE, false],/* و */
  /* Ya family */
  0x0649: [0xFEEF, 0xFEF0, 0xFEEF, 0xFEF0, false],/* ى — alef maksura, right-joining */
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4, true ],/* ي */
  /* Persian/Urdu extras (Unicode Arabic block) */
  0x067E: [0xFB56, 0xFB57, 0xFB58, 0xFB59, true ],/* پ */
  0x0686: [0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D, true ],/* چ */
  0x06A9: [0xFB8E, 0xFB8F, 0xFB90, 0xFB91, true ],/* ک */
  0x06AF: [0xFB92, 0xFB93, 0xFB94, 0xFB95, true ],/* گ */
  0x06CC: [0xFBFC, 0xFBFD, 0xFBFE, 0xFBFF, true ],/* ی */
};

/* Lam-Alef ligature: ل + ا → one combined glyph */
const _LAM_ALEF = {
  0x0627: 0xFEFB,/* ل + ا → ﻻ (isolated) / ﻼ (final) */
  0x0622: 0xFEF5,/* ل + آ → ﻵ / ﻶ */
  0x0623: 0xFEF7,/* ل + أ → ﻷ / ﻸ */
  0x0625: 0xFEF9,/* ل + إ → ﻹ / ﻺ */
};
const _LAM_ALEF_FINAL = { 0x0627: 0xFEFC, 0x0622: 0xFEF6, 0x0623: 0xFEF8, 0x0625: 0xFEFA };

function _isArabicLetter(cp) {
  return _AR_FORMS[cp] !== undefined;
}

function _joinsForward(cp) {
  const e = _AR_FORMS[cp];
  return !!(e && e[4]);
}

/* Whether a character at position i can receive a connection from the previous letter.
   This is true iff the character is an Arabic letter (any joining type — even right-joining
   letters like ا can connect FROM previous). */
function _connectsFromPrev(cp) {
  return _AR_FORMS[cp] !== undefined;
}

/* Shape one Unicode Arabic string into its presentation forms. Non-Arabic characters
   pass through unchanged. Lam-Alef ligatures are detected and combined. */
export function ar(text) {
  if (!text) return "";
  const s = String(text);
  const out = [];
  let hasArabic = false;
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    /* Skip surrogates we already consumed */
    if (cp > 0xFFFF) { out.push(s[i]); i++; continue; }

    /* Lam-Alef ligature lookahead: if current is ل (0x0644) and next is one of
       0x0627/0x0622/0x0623/0x0625, emit a single combined glyph and skip next. */
    if (cp === 0x0644 && i + 1 < s.length) {
      const next = s.codePointAt(i + 1);
      if (_LAM_ALEF[next] !== undefined) {
        const prev = i > 0 ? s.codePointAt(i - 1) : 0;
        const prevConnectsForward = _joinsForward(prev);
        const ligGlyph = prevConnectsForward ? _LAM_ALEF_FINAL[next] : _LAM_ALEF[next];
        out.push(String.fromCodePoint(ligGlyph));
        hasArabic = true;
        i++;/* skip the alef */
        continue;
      }
    }

    if (!_isArabicLetter(cp)) {
      out.push(s[i]);
      continue;
    }
    hasArabic = true;

    const prev = i > 0 ? s.codePointAt(i - 1) : 0;
    const next = i + 1 < s.length ? s.codePointAt(i + 1) : 0;
    const entry = _AR_FORMS[cp];
    /* V19.70.26: bug fix — nextConnectsBackward must also consider whether THIS letter
       can connect to its next at all. Right-joining letters (ا د ذ ر ز و ء ؤ ة ى)
       NEVER connect to next, so they can't be initial or medial regardless of next.
       Before this fix, ا between two dual-joining letters was incorrectly emitted as
       MEDIAL (formIdx 3 = 0xFE8E final-form codepoint, which is similar but uses the
       "final-shaped" variant that connects to prev only — looking weird/wrong in mid-word).
       Now: I connect to next iff (next is connectable) AND (I am dual-joining). */
    const iJoinsForward = entry[4] === true;
    const prevConnectsForward = _joinsForward(prev);
    const nextConnectsBackward = iJoinsForward && _connectsFromPrev(next);

    let formIdx;
    if (prevConnectsForward && nextConnectsBackward) formIdx = 3;/* medial */
    else if (prevConnectsForward) formIdx = 1;/* final */
    else if (nextConnectsBackward) formIdx = 2;/* initial */
    else formIdx = 0;/* isolated */

    out.push(String.fromCodePoint(entry[formIdx]));
  }
  /* V19.80.13 — BiDi fix: the previous code unconditionally reversed the
     entire shaped array (logical → visual order for RTL). That is correct
     for pure-Arabic strings, but it ALSO reversed digit runs embedded in
     mixed strings — and worse, it reversed pure-number strings too (the
     model number "3262142" was rendering as "2412623" in the auto-WhatsApp
     delivery PDF). Numbers must keep their LTR order even inside an RTL
     string per the Unicode bidirectional algorithm. Fix:
       1. If the input has no Arabic letters at all, skip reversal entirely
          (e.g. "3262142", "1,234.50", "—").
       2. Otherwise reverse the whole array, then re-reverse each contiguous
          digit-run (digits, commas, periods) in place so digit groups
          regain their original order while the surrounding Arabic stays
          in visual LTR-rendered RTL order.
     Examples:
       "3262142"        → "3262142"        (unchanged — pure digits)
       "1,234.50"       → "1,234.50"       (unchanged — digits + punct)
       "موديل"          → "ليدوم"          (reversed Arabic, as before)
       "موديل 100"      → "100 ليدوم"      (digits stay, Arabic reversed)
       "ج.م 1,234"      → "1,234 م.ج"      (digits stay, Arabic reversed)
  */
  if (!hasArabic) return out.join("");
  out.reverse();
  let i = 0;
  while (i < out.length) {
    if (/[0-9.,]/.test(out[i])) {
      let j = i + 1;
      while (j < out.length && /[0-9.,]/.test(out[j])) j++;
      /* Reverse positions [i, j) in place to restore digit-run order */
      for (let a = i, b = j - 1; a < b; a++, b--) {
        const t = out[a]; out[a] = out[b]; out[b] = t;
      }
      i = j;
    } else {
      i++;
    }
  }
  return out.join("");
}

/* Convenience: shape and return — null/undefined safe. */
export function arSafe(text) {
  if (text === null || text === undefined) return "";
  return ar(String(text));
}

/* Create a new jsPDF instance with Amiri Regular + Bold registered + R2L mode on.
   V19.70.26: family aliased as "Cairo" so all the existing buildXxxPdfBase64 callers
   still work without modification. The actual TTF is Amiri (full Arabic coverage),
   but the API contract stays the same — just call setFont("Cairo"). */
export function createPdf(orientation, format) {
  if (!_state.loaded) throw new Error("call loadArabicPdfLibs() first");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF(orientation || "p", "mm", format || "a4");
  /* Register fonts. addFileToVFS expects base64 (no data: prefix). */
  pdf.addFileToVFS("Amiri-Regular.ttf", _state.cairoRegularBase64);
  pdf.addFont("Amiri-Regular.ttf", "Cairo", "normal");
  pdf.addFileToVFS("Amiri-Bold.ttf", _state.cairoBoldBase64);
  pdf.addFont("Amiri-Bold.ttf", "Cairo", "bold");
  pdf.setFont("Cairo");
  /* setR2L flips direction at line layout level. We pass shaped (visual-order) text;
     the user reported text was directionally correct (with letters missing only) so
     R2L wasn't double-reversing. Keeping it on for correct alignment behavior. */
  if (typeof pdf.setR2L === "function") pdf.setR2L(true);
  return pdf;
}

/* ═══════════════════════════════════════════════════════════════════════
   Available stock report PDF (V19.70.20 popup)
   ───────────────────────────────────────────────────────────────────────
   payload: {
     factoryName, logoDataUrl?,
     date, time,
     totalAvail, totalSeries, totalBroken, modelCount,
     rows: [{ modelNo, modelDesc, availSeries, availBroken, avail, rackSize, seriesSets }]
   }
   Returns: base64 PDF string (no data: prefix)
   ═══════════════════════════════════════════════════════════════════════ */
export async function buildAvailableStockPdfBase64(payload) {
  await loadArabicPdfLibs();
  const pdf = createPdf("p", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;

  /* ── Header ──
     Logo on the right (RTL — visually right is leading edge), factory name center,
     report title + date stack on the left. */
  let y = 16;
  if (payload.logoDataUrl) {
    try { pdf.addImage(payload.logoDataUrl, "PNG", pageW - margin - 18, y - 6, 18, 18); }
    catch (_) { /* skip on bad image */ }
  }
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(15, 23, 42);
  pdf.text(arSafe(payload.factoryName || "CLARK Factory"), pageW / 2, y, { align: "center" });

  y += 8;
  pdf.setFontSize(13);
  pdf.setTextColor(146, 64, 14);/* amber-800 */
  pdf.text(arSafe("📦 الموديلات المتاحة"), pageW / 2, y, { align: "center" });

  y += 6;
  pdf.setFont("Cairo", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 113, 108);/* stone-500 */
  const dateLine = [payload.date, payload.time].filter(Boolean).join(" • ");
  if (dateLine) pdf.text(arSafe(dateLine), pageW / 2, y, { align: "center" });

  /* Header underline */
  y += 3;
  pdf.setDrawColor(245, 158, 11);/* amber-500 */
  pdf.setLineWidth(0.6);
  pdf.line(margin, y, pageW - margin, y);

  y += 8;

  /* ── Summary chips ──
     Four equal-width boxes laid horizontally. We draw rectangles + text manually. */
  const chipW = (pageW - 2 * margin - 9) / 4;/* 9mm total gap */
  const chipH = 18;
  const chips = [
    { label: "إجمالي المتاح", value: payload.totalAvail, color: [146, 64, 14] },
    { label: "سيري",          value: payload.totalSeries, color: [3, 105, 161] },
    { label: "كسر",           value: payload.totalBroken, color: [185, 28, 28] },
    { label: "عدد الموديلات", value: payload.modelCount, color: [21, 128, 61] },
  ];
  /* In RTL we lay chips right-to-left visually; index 0 (الإجمالي) goes rightmost */
  chips.forEach((c, i) => {
    const x = pageW - margin - chipW - i * (chipW + 3);
    pdf.setFillColor(254, 243, 199);/* amber-100 */
    pdf.setDrawColor(253, 230, 138);/* amber-300 */
    pdf.roundedRect(x, y, chipW, chipH, 2, 2, "FD");
    pdf.setFont("Cairo", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120, 53, 15);
    pdf.text(arSafe(c.label), x + chipW / 2, y + 6, { align: "center" });
    pdf.setFont("Cairo", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(c.color[0], c.color[1], c.color[2]);
    pdf.text(String(c.value), x + chipW / 2, y + 14, { align: "center" });
  });

  y += chipH + 6;

  /* ── Table via autoTable ──
     Columns (visual RTL order): الإجمالي · كسر · سيري · الوصف · الموديل · #
     Internally autoTable receives logical order (matches the array below);
     R2L flag flips visual rendering. */
  pdf.setFont("Cairo", "normal");
  const head = [
    [
      arSafe("#"),
      arSafe("الموديل"),
      arSafe("الوصف"),
      arSafe("سيري"),
      arSafe("كسر"),
      arSafe("الإجمالي"),
    ],
  ];
  const body = (payload.rows || []).map((r, i) => [
    String(i + 1),
    arSafe(r.modelNo),
    arSafe(r.modelDesc || "—"),
    /* For series: show count, plus "X×Y" subtitle on a new visual line if rackSize > 0 */
    String(r.availSeries) + (r.rackSize > 0 && r.seriesSets > 0 ? " (" + r.seriesSets + "×" + r.rackSize + ")" : ""),
    String(r.availBroken),
    String(r.avail),
  ]);
  const foot = [
    [
      "",
      "",
      arSafe("الإجمالي (" + (payload.modelCount || 0) + " موديل)"),
      String(payload.totalSeries),
      String(payload.totalBroken),
      String(payload.totalAvail),
    ],
  ];

  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head, body, foot,
    /* All cells use Cairo. autoTable picks up font from styles.font.
       Important: autoTable doesn't shape Arabic — the cell content must
       already be shaped (we did that via arSafe above). */
    styles: {
      font: "Cairo", fontStyle: "normal", fontSize: 9,
      halign: "right", valign: "middle",
      lineColor: [148, 163, 184], lineWidth: 0.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      font: "Cairo", fontStyle: "bold", fontSize: 9,
      fillColor: [253, 230, 138], textColor: [120, 53, 15],
      halign: "center",
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    alternateRowStyles: {
      fillColor: [255, 251, 235],/* amber-50 */
    },
    footStyles: {
      font: "Cairo", fontStyle: "bold", fontSize: 9,
      fillColor: [254, 243, 199], textColor: [146, 64, 14],
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },/* # */
      1: { halign: "right",  cellWidth: 30 },/* الموديل */
      2: { halign: "right" },/* الوصف */
      3: { halign: "center", cellWidth: 28 },/* سيري */
      4: { halign: "center", cellWidth: 18 },/* كسر */
      5: { halign: "center", cellWidth: 22, fontStyle: "bold" },/* الإجمالي */
    },
    /* RTL: autoTable supports it via a flag — flips column order visually.
       If unsupported by the loaded version, we already sized columns to
       accommodate RTL by writing logical order in the array. */
    didParseCell: (data) => {
      /* Force Cairo on every cell (defensive against some plugin defaults) */
      data.cell.styles.font = "Cairo";
    },
  });

  /* ── Footer line: page number + brand ── */
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFont("Cairo", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(arSafe("Powered by CLARK Factory Management"), pageW / 2, pageH - 8, { align: "center" });

  /* Output base64 (no data: prefix) */
  const dataUri = pdf.output("datauristring");
  return String(dataUri).split(",")[1] || "";
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers: number formatting + emoji stripping
   ───────────────────────────────────────────────────────────────────────
   Cairo TTF doesn't include emoji glyphs, so emojis would render as missing
   glyph boxes. We strip them from input strings before passing to ar(). The
   number formatter adds thousand separators (en-US locale, since Arabic-Indic
   digits aren't reliably supported in jsPDF's text layout for our use case).
   ═══════════════════════════════════════════════════════════════════════ */

const _emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}]/gu;

/* Strip emojis + apply Arabic shaping in one step. Convenience for the receipt builder. */
export function arNoEmoji(text) {
  if (!text) return "";
  return ar(String(text).replace(_emojiRegex, "").trim());
}

function _fmtNum(n) {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

/* ═══════════════════════════════════════════════════════════════════════
   Delivery receipt PDF (V19.70.23 — bulk WhatsApp send)
   ───────────────────────────────────────────────────────────────────────
   Replaces the html2canvas-based PDF generation for the bulk delivery WA send.
   Uses Chrome's PDF text rendering pipeline via jsPDF + embedded Cairo TTF —
   produces a VECTOR PDF (not an image-based one), which is:
     - Higher quality (crisp at any zoom)
     - Smaller file size (text + graphics, no JPEG compression)
     - Arabic text shaped via our embedded shaper (works regardless of html2canvas)

   payload: {
     factoryName, factoryLogo (data URL), factorySub,
     date, time,
     customer: { name, phone, address },
     items: [{ modelNo, modelDesc, qty, price, lineTotal }],
     totals: { qty, money, discPct, discAmt, netMoney },
     qrDataUrl,                  // optional — confirmation QR as data URL
     qrConfirmUrl,               // optional — text describing the QR's link expiry
     noPrices,                   // true → hide السعر + الإجمالي columns + discount
     receiverName,               // optional — name to display under "مسؤول التسليم"
   }
   Returns: base64 PDF string (no data: prefix)
   ═══════════════════════════════════════════════════════════════════════ */
export async function buildDeliveryReceiptPdfBase64(payload) {
  await loadArabicPdfLibs();
  const pdf = createPdf("p", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const noP = payload.noPrices === true;
  const c = payload.customer || {};

  /* ── Top header row: factory branding (right) + receipt title box (left) ──
     Mirrors the existing HTML's `.hdr` with `.hdr-brand` and `.hdr-title`. */
  let y = 14;
  /* Logo: small image on the rightmost edge if provided */
  let brandTextX = pageW - margin;
  if (payload.factoryLogo) {
    try {
      pdf.addImage(payload.factoryLogo, "PNG", pageW - margin - 18, y - 4, 18, 18);
      brandTextX = pageW - margin - 22;/* shift name leftward to clear the logo */
    } catch (_) { /* skip on bad image — defensive */ }
  }
  /* Factory name + sub-line, right-aligned */
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(15, 23, 42);
  pdf.text(arNoEmoji(payload.factoryName || "CLARK Factory"), brandTextX, y + 5, { align: "right" });
  if (payload.factorySub) {
    pdf.setFont("Cairo", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(arNoEmoji(payload.factorySub), brandTextX, y + 11, { align: "right" });
  }

  /* Title box on the left (shifted to top-left corner). */
  const boxW = 64; const boxH = 18;
  pdf.setFillColor(240, 249, 255);/* sky-50 */
  pdf.setDrawColor(186, 230, 253);/* sky-200 */
  pdf.setLineWidth(0.3);
  pdf.roundedRect(margin, y - 2, boxW, boxH, 2, 2, "FD");
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(3, 105, 161);/* sky-700 */
  pdf.text(arNoEmoji("اذن تسليم — " + (c.name || "")), margin + boxW / 2, y + 5, { align: "center" });
  pdf.setFont("Cairo", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text((payload.date || "") + " " + (payload.time || ""), margin + boxW / 2, y + 12, { align: "center" });

  y += 22;

  /* Header underline */
  pdf.setDrawColor(2, 132, 199);/* sky-600 */
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageW - margin, y);

  y += 6;

  /* ── Section heading: "اذن تسليم عميل" (drop the truck emoji) ── */
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(2, 132, 199);
  pdf.text(arNoEmoji("اذن تسليم عميل"), pageW - margin, y, { align: "right" });
  pdf.setLineWidth(0.4);
  pdf.line(margin, y + 1.5, pageW - margin, y + 1.5);
  y += 5;

  /* ── Customer info table — 2 rows × 4 columns ──
     RTL visual order: العميل / [name] / التليفون / [phone]
                       التاريخ / [date] / العنوان / [address]
     autoTable in RTL: pass the columns in their VISUAL right-to-left order
     (the rightmost cell first). Without R2L flag, columns lay left-to-right;
     since we want the rightmost (visual first) column to be "العميل", we
     put it as column index 0 in the array — autoTable lays index 0 leftmost
     by default. To get RTL layout we'd need autoTable's RTL option, but it's
     unreliable across versions. Easier: just pre-order columns visually. */
  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      /* Row 1, written left-to-right but read right-to-left in the rendered PDF */
      [arNoEmoji(c.address || "—"), arNoEmoji("العنوان"), arNoEmoji(c.phone || ""), arNoEmoji("التليفون"), arNoEmoji(c.name || ""), arNoEmoji("العميل")],
      [arNoEmoji("—"), arNoEmoji(""), arNoEmoji(""), arNoEmoji(""), arNoEmoji(payload.date || ""), arNoEmoji("التاريخ")],
    ],
    styles: { font: "Cairo", fontStyle: "normal", fontSize: 9, halign: "right", valign: "middle", cellPadding: 2, lineColor: [148, 163, 184], lineWidth: 0.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { halign: "right" },                                                /* العنوان value */
      1: { halign: "right", fontStyle: "bold", fillColor: [226, 232, 240] }, /* العنوان label */
      2: { halign: "right" },                                                /* التليفون value */
      3: { halign: "right", fontStyle: "bold", fillColor: [226, 232, 240] }, /* التليفون label */
      4: { halign: "right" },                                                /* العميل value */
      5: { halign: "right", fontStyle: "bold", fillColor: [226, 232, 240] }, /* العميل label */
    },
    didParseCell: (data) => { data.cell.styles.font = "Cairo"; },
  });
  y = pdf.lastAutoTable.finalY + 5;

  /* ── Section heading: "تفاصيل الاستلام" ── */
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(2, 132, 199);
  pdf.text(arNoEmoji("تفاصيل الاستلام"), pageW - margin, y, { align: "right" });
  pdf.setLineWidth(0.4);
  pdf.line(margin, y + 1.5, pageW - margin, y + 1.5);
  y += 5;

  /* ── Items table ──
     Visual order (right→left): الموديل · الوصف · الكمية · السعر · الإجمالي
     Array order (autoTable layout left→right): الإجمالي · السعر · الكمية · الوصف · الموديل */
  const head = noP
    ? [[arNoEmoji("الكمية"), arNoEmoji("الوصف"), arNoEmoji("الموديل")]]
    : [[arNoEmoji("الإجمالي"), arNoEmoji("السعر"), arNoEmoji("الكمية"), arNoEmoji("الوصف"), arNoEmoji("الموديل")]];

  const body = (payload.items || []).map(it => noP
    ? [String(it.qty || 0), arNoEmoji(it.modelDesc || "—"), arNoEmoji(String(it.modelNo || ""))]
    : [_fmtNum(it.lineTotal || 0), it.price ? _fmtNum(it.price) : "—", String(it.qty || 0), arNoEmoji(it.modelDesc || "—"), arNoEmoji(String(it.modelNo || ""))]);

  /* V19.80.13: aggregation row — Arabic suffix BEFORE the number in the visual
     LTR string so that an RTL reader perceives "1,234 ج.م" / "5 قطعة" naturally
     (rightmost = digits, leftmost = currency/unit). The previous order
     (number + " " + arabic) made it read as "ج.م 1,234" / "قطعة 5". */
  const aggRow = noP
    ? [arNoEmoji("قطعة") + " " + String(payload.totals.qty || 0), "", arNoEmoji("الاجمالي")]
    : [arNoEmoji("ج.م") + " " + _fmtNum(payload.totals.money || 0), "", arNoEmoji("قطعة") + " " + String(payload.totals.qty || 0), "", arNoEmoji("الاجمالي")];

  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head, body,
    foot: [aggRow],
    styles: { font: "Cairo", fontStyle: "normal", fontSize: 9, halign: "center", valign: "middle", cellPadding: 2.5, lineColor: [148, 163, 184], lineWidth: 0.2, textColor: [30, 41, 59] },
    headStyles: { font: "Cairo", fontStyle: "bold", fontSize: 9, fillColor: [203, 213, 225], textColor: [30, 41, 59], halign: "center" },
    bodyStyles: { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    footStyles: { font: "Cairo", fontStyle: "bold", fontSize: 9, fillColor: [241, 245, 249], textColor: [3, 105, 161], halign: "center" },
    columnStyles: noP ? {
      0: { halign: "center", cellWidth: 28, fontStyle: "bold", textColor: [2, 132, 199] },/* الكمية */
      1: { halign: "right" },                                                              /* الوصف */
      2: { halign: "right", fontStyle: "bold", cellWidth: 35 },                            /* الموديل */
    } : {
      0: { halign: "center", cellWidth: 26, fontStyle: "bold" },                           /* الإجمالي */
      1: { halign: "center", cellWidth: 22 },                                              /* السعر */
      2: { halign: "center", cellWidth: 20, fontStyle: "bold", textColor: [2, 132, 199] }, /* الكمية */
      3: { halign: "right" },                                                              /* الوصف */
      4: { halign: "right", fontStyle: "bold", cellWidth: 30 },                            /* الموديل */
    },
    didParseCell: (data) => { data.cell.styles.font = "Cairo"; },
  });
  y = pdf.lastAutoTable.finalY + 4;

  /* ── Discount block (only when prices are shown AND there's a discount) ── */
  if (!noP && (payload.totals.discPct || 0) > 0) {
    /* Draw a bordered box ~30mm tall */
    const boxX = margin; const boxYstart = y;
    const boxWFull = pageW - 2 * margin; const boxHFull = 28;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.rect(boxX, boxYstart, boxWFull, boxHFull);

    /* V19.80.13: discount-block value rows — Arabic ج.م comes BEFORE the number
       in the visual LTR string so an RTL reader sees "1,234 ج.م" naturally
       (digits rightmost, currency leftmost in pixel order). */
    /* Row 1: الإجمالي قبل الخصم — value LEFT, label RIGHT (RTL convention) */
    pdf.setFont("Cairo", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(30, 41, 59);
    pdf.text(arNoEmoji("الإجمالي قبل الخصم"), pageW - margin - 3, boxYstart + 6, { align: "right" });
    pdf.text(arNoEmoji("ج.م") + " " + _fmtNum(payload.totals.money), margin + 3, boxYstart + 6, { align: "left" });

    /* Row 2: خصم N% — red */
    pdf.setTextColor(239, 68, 68);
    pdf.text(arNoEmoji("خصم " + payload.totals.discPct + "%"), pageW - margin - 3, boxYstart + 13, { align: "right" });
    pdf.text(arNoEmoji("ج.م") + " " + _fmtNum(payload.totals.discAmt) + " -", margin + 3, boxYstart + 13, { align: "left" });

    /* Separator line */
    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.4);
    pdf.line(boxX + 2, boxYstart + 17, boxX + boxWFull - 2, boxYstart + 17);

    /* Row 3: الصافي المستحق — green, larger */
    pdf.setFont("Cairo", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(5, 150, 105);/* emerald-600 */
    pdf.text(arNoEmoji("الصافي المستحق"), pageW - margin - 3, boxYstart + 24, { align: "right" });
    pdf.text(arNoEmoji("ج.م") + " " + _fmtNum(payload.totals.netMoney), margin + 3, boxYstart + 24, { align: "left" });

    y = boxYstart + boxHFull + 5;
  }

  /* ── QR confirmation block ── */
  if (payload.qrDataUrl) {
    /* Page break if not enough vertical space (need ~32mm + signatures + footer ~30mm) */
    if (y + 70 > pageH - 15) { pdf.addPage(); y = 14; }
    const boxYstart = y; const boxHFull = 32;
    pdf.setDrawColor(14, 165, 233);/* sky-500 */
    pdf.setLineWidth(0.4);
    pdf.setLineDashPattern([2, 1], 0);
    pdf.roundedRect(margin, boxYstart, pageW - 2 * margin, boxHFull, 2, 2);
    pdf.setLineDashPattern([], 0);
    /* QR image on the LEFT (visual far-from-text). 26x26mm — readable but compact. */
    try { pdf.addImage(payload.qrDataUrl, "PNG", margin + 3, boxYstart + 3, 26, 26); }
    catch (_) { /* skip on bad image */ }
    /* Text on the RIGHT (RTL primary content side) */
    pdf.setFont("Cairo", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(3, 105, 161);
    pdf.text(arNoEmoji("تأكيد الاستلام"), pageW - margin - 4, boxYstart + 9, { align: "right" });
    pdf.setFont("Cairo", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(arNoEmoji("بعد مطابقة البضاعة، امسح الكود للتأكيد"), pageW - margin - 4, boxYstart + 16, { align: "right" });
    pdf.text(arNoEmoji("أو الإبلاغ عن مشكلة"), pageW - margin - 4, boxYstart + 22, { align: "right" });
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(arNoEmoji("الرابط صالح لمدة 24 ساعة من التأكيد"), pageW - margin - 4, boxYstart + 28, { align: "right" });
    y = boxYstart + boxHFull + 8;
  }

  /* ── Signature row — two signature boxes side by side ──
     RTL convention: customer signature on the right, delivery rep on the left. */
  if (y + 25 > pageH - 12) { pdf.addPage(); y = 14; }
  const sigW = 56;
  const sigGap = 18;
  const sigYline = y + 12;
  const sigCustX = pageW / 2 + sigGap / 2;/* customer block to the right */
  const sigRepX  = pageW / 2 - sigGap / 2 - sigW;/* rep block to the left */

  pdf.setDrawColor(30, 41, 59);
  pdf.setLineWidth(0.6);
  pdf.line(sigCustX, sigYline, sigCustX + sigW, sigYline);
  pdf.line(sigRepX, sigYline, sigRepX + sigW, sigYline);

  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(30, 41, 59);
  pdf.text(arNoEmoji("توقيع العميل"), sigCustX + sigW / 2, sigYline + 5, { align: "center" });
  if (c.name) {
    pdf.setFont("Cairo", "normal");
    pdf.setFontSize(8);
    pdf.text(arNoEmoji(c.name), sigCustX + sigW / 2, sigYline + 10, { align: "center" });
  }
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(9);
  pdf.text(arNoEmoji("مسؤول التسليم"), sigRepX + sigW / 2, sigYline + 5, { align: "center" });
  if (payload.receiverName) {
    pdf.setFont("Cairo", "normal");
    pdf.setFontSize(8);
    pdf.text(arNoEmoji(payload.receiverName), sigRepX + sigW / 2, sigYline + 10, { align: "center" });
  }

  /* ── Footer — at the bottom of the LAST page only ──
     We use pdf.internal.getNumberOfPages() to write to the final page. */
  const totalPages = pdf.internal.getNumberOfPages();
  pdf.setPage(totalPages);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.4);
  pdf.line(margin, pageH - 10, pageW - margin, pageH - 10);
  pdf.setFont("Cairo", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(2, 132, 199);
  pdf.text(arNoEmoji(payload.factoryName || "CLARK Factory"), pageW - margin, pageH - 5, { align: "right" });
  pdf.setFont("Cairo", "normal");
  pdf.setTextColor(148, 163, 184);
  pdf.setFontSize(7);
  pdf.text((payload.date || "") + " — Powered by CLARK Factory Management", margin, pageH - 5, { align: "left" });

  /* Output base64 */
  const dataUri = pdf.output("datauristring");
  return String(dataUri).split(",")[1] || "";
}
