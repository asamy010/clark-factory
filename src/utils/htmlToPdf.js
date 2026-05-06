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
/* V19.70.14: Cairo font URL — needed for proper Arabic glyph shaping inside
   the offscreen html2canvas capture. Without explicit font preload, html2canvas
   may capture before Cairo Bold loads, causing letters to render disconnected
   ("لعميل" instead of "العميل"). */
const CAIRO_FONT_URL = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap";

let _libsLoaded = false;
let _libsLoading = null;
let _cairoLoaded = false;

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

/* V19.70.14: ensure Cairo font is loaded BEFORE html2canvas captures.
   Without this, headers with font-weight 800 (or other weights not yet
   in the page's font cache) fall back to a non-Arabic font and the
   text renders as disconnected glyphs (e.g. "العميل" → "لعميل"). */
async function ensureCairoLoaded() {
  if (_cairoLoaded) return;
  /* Inject the link if not already present */
  if (!document.querySelector('link[href*="Cairo"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CAIRO_FONT_URL;
    document.head.appendChild(link);
  }
  /* Wait for ALL Cairo weights to actually be available in the browser's font cache */
  if (document.fonts && document.fonts.load) {
    await Promise.all([
      document.fonts.load("400 12px Cairo"),
      document.fonts.load("700 12px Cairo"),
      document.fonts.load("800 12px Cairo"),
      document.fonts.load("900 12px Cairo"),
    ]).catch(() => {});
  }
  /* Generic ready signal as a fallback */
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  /* Small extra delay so the browser actually settles font metrics — empirically
     needed on first-load when the network fetch + font parse takes a moment. */
  await new Promise(r => setTimeout(r, 200));
  _cairoLoaded = true;
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
  container.style.fontFamily = "Cairo, 'Segoe UI', Arial, sans-serif";
  container.style.fontSize = "12px";
  container.style.lineHeight = "1.5";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    /* V19.70.14: extra wait — image loading (logo, QR) + font metrics settling.
       Empirically 250ms is enough on the slowest devices we've seen. */
    await new Promise(r => setTimeout(r, 250));

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
