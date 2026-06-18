/* ═══════════════════════════════════════════════════════════════════════
   CLARK · imageScan.js (V21.27.61)
   ───────────────────────────────────────────────────────────────────────
   أدوات «سكانر المستندات» — pure (مفيش I/O، canvas in-memory فقط):
     • solveHomography(dst, src) → مصفوفة الإسقاط (8 معاملات) من مستطيل الخرج
       لرباعي المصدر (perspective).
     • dewarp(srcCanvas, quad, outW, outH) → canvas مستوٍ بعد تصحيح المنظور
       (inverse mapping + bilinear sampling — مفيش ثقوب).
     • otsuThreshold(gray) → عتبة تلقائية لتحويل المستند لأبيض/أسود حاد.
     • applyDocFilter(canvas, mode, opts) → فلاتر تحسين الوضوح (تلقائي/رمادي/
       أبيض-وأسود) + سطوع/تباين.
   كله بيشتغل على canvas 2D عادي — مفيش WebGL ولا مكتبات خارجية.
   ═══════════════════════════════════════════════════════════════════════ */

/* حل نظام خطي 8×8 بـ Gaussian elimination + partial pivoting. */
function gaussSolve(A, b){
  const n = b.length;
  /* مصفوفة موسّعة */
  const M = A.map((row, i) => [...row, b[i]]);
  for(let col = 0; col < n; col++){
    /* pivot */
    let piv = col;
    for(let r = col + 1; r < n; r++) if(Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if(Math.abs(M[piv][col]) < 1e-12) continue; /* singular-ish — تجاهل */
    [M[col], M[piv]] = [M[piv], M[col]];
    const pivVal = M[col][col];
    for(let j = col; j <= n; j++) M[col][j] /= pivVal;
    for(let r = 0; r < n; r++){
      if(r === col) continue;
      const f = M[r][col];
      if(f === 0) continue;
      for(let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map(row => row[n]);
}

/* يحسب الإسقاط H بحيث: src = H · dst (إحداثيات homogeneous).
   dst, src: مصفوفتان من 4 نقاط {x,y} بنفس الترتيب (TL,TR,BR,BL).
   بيرجّع [h0..h7] (h8=1). */
export function solveHomography(dst, src){
  const A = [], b = [];
  for(let i = 0; i < 4; i++){
    const u = dst[i].x, v = dst[i].y, x = src[i].x, y = src[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  return gaussSolve(A, b);
}

/* يطبّق الإسقاط على نقطة (u,v) → (x,y). */
export function applyHomography(h, u, v){
  const d = h[6] * u + h[7] * v + 1;
  return { x: (h[0] * u + h[1] * v + h[2]) / d, y: (h[3] * u + h[4] * v + h[5]) / d };
}

/* المسافة بين نقطتين. */
function dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }

/* أبعاد الخرج المقترحة من رباعي المصدر (متوسط أطوال الأضلاع، مقصوصة لـ maxDim). */
export function suggestOutputSize(quad, maxDim = 1600){
  const [tl, tr, br, bl] = quad;
  let w = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  let h = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  w = Math.max(1, w); h = Math.max(1, h);
  const m = Math.max(w, h);
  if(m > maxDim){ const s = maxDim / m; w = Math.round(w * s); h = Math.round(h * s); }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/* تصحيح المنظور: بيرسم رباعي المصدر (quad: TL,TR,BR,BL بإحداثيات srcCanvas)
   كمستطيل outW×outH مستوٍ. inverse mapping (لكل بكسل خرج نجيب مصدره) + bilinear. */
export function dewarp(srcCanvas, quad, outW, outH){
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const sctx = srcCanvas.getContext("2d");
  const src = sctx.getImageData(0, 0, sw, sh).data;

  const out = document.createElement("canvas");
  out.width = outW; out.height = outH;
  const octx = out.getContext("2d");
  const outImg = octx.createImageData(outW, outH);
  const o = outImg.data;

  /* مستطيل الخرج → رباعي المصدر */
  const H = solveHomography(
    [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }],
    quad
  );

  for(let y = 0; y < outH; y++){
    for(let x = 0; x < outW; x++){
      const den = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / den;
      const sy = (H[3] * x + H[4] * y + H[5]) / den;
      const oi = (y * outW + x) * 4;
      if(sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1){
        o[oi] = o[oi + 1] = o[oi + 2] = 255; o[oi + 3] = 255; /* خارج الصورة → أبيض */
        continue;
      }
      /* bilinear */
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for(let c = 0; c < 3; c++){
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        o[oi + c] = top * (1 - fy) + bot * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

/* عتبة Otsu من histogram تدرّج رمادي (مصفوفة 256). */
export function otsuThreshold(hist, total){
  let sum = 0; for(let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = -1, thr = 127;
  for(let t = 0; t < 256; t++){
    wB += hist[t]; if(wB === 0) continue;
    const wF = total - wB; if(wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if(between > maxVar){ maxVar = between; thr = t; }
  }
  return thr;
}

/* فلتر تحسين المستند على canvas (in-place). mode:
   "none" | "gray" | "auto" (تمدّد تباين) | "bw" (أبيض/أسود Otsu).
   opts: { brightness:-100..100, contrast:-100..100 }. */
export function applyDocFilter(canvas, mode, opts){
  const { brightness = 0, contrast = 0 } = opts || {};
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;

  /* سطوع/تباين أولاً (معامل التباين القياسي) */
  const c = Math.max(-100, Math.min(100, contrast));
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const br = Math.max(-100, Math.min(100, brightness)) * 2.55;
  if(br !== 0 || c !== 0){
    for(let i = 0; i < d.length; i += 4){
      for(let k = 0; k < 3; k++){
        let v = cf * (d[i + k] - 128) + 128 + br;
        d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }

  if(mode === "gray" || mode === "bw"){
    /* تدرّج رمادي */
    for(let i = 0; i < d.length; i += 4){
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    if(mode === "bw"){
      const hist = new Array(256).fill(0);
      for(let i = 0; i < d.length; i += 4) hist[d[i]]++;
      const thr = otsuThreshold(hist, n);
      for(let i = 0; i < d.length; i += 4){
        const v = d[i] > thr ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  } else if(mode === "auto"){
    /* تمدّد تباين (auto-levels) على نِسَب 2%–98% من الـ luminance */
    const hist = new Array(256).fill(0);
    for(let i = 0; i < d.length; i += 4){
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      hist[g]++;
    }
    const lo = percentile(hist, n, 0.02), hi = percentile(hist, n, 0.98);
    const range = Math.max(1, hi - lo);
    for(let i = 0; i < d.length; i += 4){
      for(let k = 0; k < 3; k++){
        let v = ((d[i + k] - lo) / range) * 255;
        d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function percentile(hist, total, p){
  const target = total * p;
  let acc = 0;
  for(let i = 0; i < 256; i++){ acc += hist[i]; if(acc >= target) return i; }
  return 255;
}
