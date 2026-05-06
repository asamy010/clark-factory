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
/* CORS-friendly TTF mirrors via jsdelivr's GitHub passthrough.
   Google Fonts repo serves static Cairo weights at these paths. */
const CAIRO_REGULAR_TTF_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/static/Cairo-Regular.ttf";
const CAIRO_BOLD_TTF_URL    = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/static/Cairo-Bold.ttf";

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

async function _fetchAsBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Fetch " + url + " failed: " + r.status);
  const buf = await r.arrayBuffer();
  /* Convert ArrayBuffer to base64 chunked to avoid call-stack overflow on big binaries */
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function loadArabicPdfLibs() {
  if (_state.loaded) return;
  if (_state.loading) return _state.loading;
  _state.loading = (async () => {
    /* jsPDF first; autoTable extends jsPDF's API at load time */
    await _loadScript(JSPDF_URL);
    await _loadScript(AUTOTABLE_URL);
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF failed to load");
    /* Fonts in parallel — both downloads can overlap to save wall time */
    const [reg, bold] = await Promise.all([
      _fetchAsBase64(CAIRO_REGULAR_TTF_URL),
      _fetchAsBase64(CAIRO_BOLD_TTF_URL),
    ]);
    _state.cairoRegularBase64 = reg;
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
        i++;/* skip the alef */
        continue;
      }
    }

    if (!_isArabicLetter(cp)) {
      out.push(s[i]);
      continue;
    }

    const prev = i > 0 ? s.codePointAt(i - 1) : 0;
    const next = i + 1 < s.length ? s.codePointAt(i + 1) : 0;
    /* Skip lam-alef sequences for the alef position (already handled above as ligature) */
    const prevConnectsForward = _joinsForward(prev);
    const nextConnectsBackward = _connectsFromPrev(next);

    let formIdx;
    if (prevConnectsForward && nextConnectsBackward) formIdx = 3;/* medial */
    else if (prevConnectsForward) formIdx = 1;/* final */
    else if (nextConnectsBackward) formIdx = 2;/* initial */
    else formIdx = 0;/* isolated */

    const entry = _AR_FORMS[cp];
    out.push(String.fromCodePoint(entry[formIdx]));
  }
  /* Reverse to convert from logical order to visual order (RTL).
     jsPDF's R2L mode handles direction at the line level but glyph order
     within a string still needs to be visual when we pass shaped Arabic. */
  return out.reverse().join("");
}

/* Convenience: shape and return — null/undefined safe. */
export function arSafe(text) {
  if (text === null || text === undefined) return "";
  return ar(String(text));
}

/* Create a new jsPDF instance with Cairo Regular + Bold registered + R2L mode on.
   Caller is responsible for any further config (page size, etc.). Default A4 portrait. */
export function createPdf(orientation, format) {
  if (!_state.loaded) throw new Error("call loadArabicPdfLibs() first");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF(orientation || "p", "mm", format || "a4");
  /* Register fonts. addFileToVFS expects base64 (no data: prefix). */
  pdf.addFileToVFS("Cairo-Regular.ttf", _state.cairoRegularBase64);
  pdf.addFont("Cairo-Regular.ttf", "Cairo", "normal");
  pdf.addFileToVFS("Cairo-Bold.ttf", _state.cairoBoldBase64);
  pdf.addFont("Cairo-Bold.ttf", "Cairo", "bold");
  pdf.setFont("Cairo");
  /* setR2L flips direction at line layout level. We still pass shaped (visual-order) text. */
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
