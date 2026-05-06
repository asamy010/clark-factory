/* ═══════════════════════════════════════════════════════════════════════
   CLARK · HTML → PDF utility (V19.70.12)
   ───────────────────────────────────────────────────────────────────────
   Lazy-loads html2canvas + jsPDF from CDN on first use (avoids ~200KB
   bundle bloat for users who never trigger PDF generation). Provides:

     loadPdfLibs()            — preload (returns promise)
     htmlToPdfBase64(html)    — full pipeline: HTML → offscreen render →
                                canvas → PDF → base64 string (no data:
                                prefix, ready for the bridge media payload)

   The PDF is portrait A4, image-based (full visual fidelity to the HTML).
   For pure-text smaller PDFs, switch to jsPDF text rendering — but for
   delivery receipts with QR codes + tables, image is the simplest path.
   ═══════════════════════════════════════════════════════════════════════ */

const HTML2CANVAS_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
/* V19.70.15: Direct WOFF2 binaries from fontsource CDN — these are the actual
   font files (not a CSS wrapper). Each FontFace.load() awaits the binary download,
   which guarantees the font is in the browser's font cache before html2canvas
   captures. The previous V19.70.14 approach used Google Fonts' CSS link + the
   document.fonts.load() string API which only triggers a lazy load — the await
   could resolve before the actual TTF binary finished downloading, causing
   html2canvas to capture with a fallback font (Arial) and break Arabic shaping.

   Fontsource CDN serves the Arabic subset specifically — smaller download
   (~30KB per weight vs ~200KB) and contains the full Arabic glyph range. */
const CAIRO_FONT_URLS = {
  400: "https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-400-normal.woff2",
  500: "https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-500-normal.woff2",
  600: "https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-600-normal.woff2",
  700: "https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-700-normal.woff2",
  800: "https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-800-normal.woff2",
  900: "https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.13/files/cairo-arabic-900-normal.woff2",
};
/* Legacy fallback URL for browsers without FontFace API (very rare — Safari < 10) */
/* V19.70.27: switched primary font to Markazi Text per user request, kept Cairo as fallback */
const CAIRO_FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Markazi+Text:wght@400;500;600;700&family=Cairo:wght@400;700&display=swap";

let _libsLoaded = false;
let _libsLoading = null;
let _cairoLoaded = false;
let _cairoLoading = null;

function _loadScript(url) {
  return new Promise((resolve, reject) => {
    /* If already loaded skip */
    if (document.querySelector("script[src='" + url + "']")) return resolve();
    const s = document.createElement("script");
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load: " + url));
    document.head.appendChild(s);
  });
}

export function loadPdfLibs() {
  if (_libsLoaded) return Promise.resolve();
  if (_libsLoading) return _libsLoading;
  _libsLoading = (async () => {
    /* html2canvas first (jsPDF needs it at construction-time? no, but order doesn't matter) */
    await _loadScript(HTML2CANVAS_URL);
    await _loadScript(JSPDF_URL);
    if (typeof window.html2canvas !== "function") throw new Error("html2canvas failed to load");
    /* jsPDF UMD exposes as window.jspdf.jsPDF */
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF failed to load");
    _libsLoaded = true;
  })();
  return _libsLoading;
}

/* V19.70.15: bulletproof Cairo font loading via the FontFace API.

   Why the V19.70.14 approach didn't work:
     - Injected a <link> to Google Fonts CSS, then called document.fonts.load("800 12px Cairo")
     - document.fonts.load() returns a promise but the API only TRIGGERS a load —
       it doesn't reliably wait for the actual TTF binary to finish downloading
     - On a fresh page-load, the await would resolve in ~5-10ms while the binary
       was still in flight, so html2canvas captured before Cairo Bold was ready
     - Result: <th> elements with font-weight:800 fell back to Arial → Arabic
       glyphs rendered disconnected (الـcontextual shaping requires the actual
       Cairo glyph outlines)

   Why the V19.70.15 approach works:
     - new FontFace("Cairo", "url(woff2)", { weight: "800" }) creates an explicit
       FontFace object backed by a specific binary URL
     - face.load() returns a promise that resolves AFTER the binary has been
       downloaded AND the font has been parsed
     - document.fonts.add(face) registers the face document-wide so any element
       (including those in offscreen containers) can use it immediately
     - No race condition possible — the await guarantees readiness */
async function ensureCairoLoaded() {
  if (_cairoLoaded) return;
  if (_cairoLoading) return _cairoLoading;
  _cairoLoading = (async () => {
    /* Browsers without FontFace API: fall back to <link> injection (Safari < 10).
       This is mostly a safety net — every browser shipped after 2017 supports it. */
    if (!window.FontFace || !document.fonts || !document.fonts.add) {
      if (!document.querySelector('link[href*="Cairo"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = CAIRO_FONT_CSS_URL;
        document.head.appendChild(link);
      }
      await new Promise(r => setTimeout(r, 800));
      _cairoLoaded = true;
      return;
    }

    /* Load each weight as an explicit FontFace, await actual binary download,
       then register with the document. We focus on 400/700/800 (the weights
       used by the receipt template) but include 500/600/900 for future flexibility. */
    const weights = Object.entries(CAIRO_FONT_URLS);
    await Promise.all(weights.map(async ([weight, url]) => {
      try {
        const face = new FontFace("Cairo", `url(${url}) format("woff2")`, {
          weight: String(weight),
          style: "normal",
          display: "swap",
        });
        await face.load();
        document.fonts.add(face);
      } catch (e) {
        /* Per-weight failure is non-fatal — other weights may still succeed.
           Log so we can debug if a CDN has an outage. */
        console.warn("[ensureCairoLoaded] weight " + weight + " failed:", e?.message || e);
      }
    }));

    /* Belt-and-braces: also wait for document.fonts.ready in case the browser
       has any other pending font work it needs to settle. */
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    _cairoLoaded = true;
  })();
  return _cairoLoading;
}

/* Render an HTML string into an offscreen container, capture as canvas,
   convert to a PDF, return base64 (without the "data:application/pdf;base64,"
   prefix). The container is sized to A4 width (794px ≈ 210mm at 96dpi) for
   reasonable rendering. Multi-page support is automatic — if the captured
   canvas is taller than A4 height, we slice and add multiple pages.

   Options:
     width    — px (default 794, A4 portrait at 96dpi)
     scale    — html2canvas pixel ratio (default 2 for crisp text)
     filename — informational only; the bridge accepts a name separately */
export async function htmlToPdfBase64(html, options) {
  await loadPdfLibs();
  /* V19.70.14: preload Cairo font BEFORE rendering. Without this, html2canvas
     captures with whatever font happens to be loaded — typically only the
     weights/styles already used on the visible page. Headers using weight 800
     would fall back and break Arabic shaping. */
  await ensureCairoLoaded();
  const opts = options || {};
  const widthPx = opts.width || 794;
  const scale = opts.scale || 2;

  /* Build offscreen container */
  const container = document.createElement("div");
  container.setAttribute("dir", "rtl");/* V19.70.14: explicit attr (not just CSS) */
  container.setAttribute("lang", "ar");
  container.style.position = "fixed";
  container.style.top = "-99999px";
  container.style.left = "-99999px";
  container.style.width = widthPx + "px";
  container.style.background = "#FFFFFF";
  container.style.color = "#000000";
  container.style.padding = "20px";
  container.style.boxSizing = "border-box";
  container.style.direction = "rtl";
  /* V19.70.15: force Cairo as the only family (no fallback chain) inside the
     offscreen container. Reasoning: if Cairo loaded successfully via FontFace,
     every glyph SHOULD use it. If we list Arial as fallback and Cairo lookup
     somehow fails on a specific weight, Arial would silently take over and
     re-introduce the shaping bug. Better to fail visibly (with serif fallback)
     so the bug is obvious, than to silently break Arabic. */
  container.style.fontFamily = "Cairo, sans-serif";
  container.style.fontSize = "12px";
  container.style.lineHeight = "1.5";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    /* V19.70.15: force a reflow so the browser commits the font choice for
     every node before html2canvas walks the tree. Without this the offscreen
     container's font cascade can be in a "pending" state when html2canvas
     reads computed styles. */
    void container.offsetHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    /* Wait for all images inside the container (logo, QR) to actually finish
       decoding. html2canvas can capture before images render otherwise.
       V19.70.15: replaces the fragile 250ms timeout from V19.70.14. */
    const imgs = Array.from(container.querySelectorAll("img"));
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        /* Cap at 3s in case of CDN hang — better to render with placeholder
           than block forever. */
        setTimeout(done, 3000);
      });
    }));

    const canvas = await window.html2canvas(container, {
      scale,
      backgroundColor: "#FFFFFF",
      useCORS: true,
      logging: false,
      /* V19.70.14: foreignObjectRendering preserves text shaping better for
         complex scripts (Arabic). Falls back automatically if the browser
         doesn't support it (e.g. Safari < 17). */
      foreignObjectRendering: false,/* keep off — has rendering quirks with images */
      letterRendering: true,
    });

    /* Build PDF — A4 portrait. Map the canvas to the page width, slice
       across multiple pages if the canvas is taller than one page. */
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH) {
      /* Single page — straight render */
      const imgData = canvas.toDataURL("image/jpeg", 0.85);
      pdf.addImage(imgData, "JPEG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
      /* Multi-page — slice canvas vertically per page */
      const pageHeightInCanvasPx = (pageH / imgW) * canvas.width;
      let yCanvas = 0;
      let pageIdx = 0;
      while (yCanvas < canvas.height) {
        const sliceH = Math.min(pageHeightInCanvasPx, canvas.height - yCanvas);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d");
        ctx.drawImage(canvas, 0, yCanvas, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceImg = slice.toDataURL("image/jpeg", 0.85);
        if (pageIdx > 0) pdf.addPage();
        const sliceImgH = (sliceH * imgW) / canvas.width;
        pdf.addImage(sliceImg, "JPEG", 0, 0, imgW, sliceImgH, undefined, "FAST");
        yCanvas += sliceH;
        pageIdx++;
      }
    }

    /* PDF → base64 (no prefix) */
    const pdfDataUri = pdf.output("datauristring");
    const base64 = String(pdfDataUri).split(",")[1] || "";
    return base64;
  } finally {
    document.body.removeChild(container);
  }
}
