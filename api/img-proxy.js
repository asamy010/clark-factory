/* ═══════════════════════════════════════════════════════════════════════
   CLARK · api/img-proxy.js (V21.27.22)
   بروكسي صور بسيط: بيجيب صورة من Firebase/Google Storage (السيرفر = مفيش
   CORS) ويرجّعها بـ Access-Control-Allow-Origin — عشان محرّر الصور يقدر
   يصدّر canvas من غير ما يتلوّث (tainted). مقصور على هوستات التخزين فقط
   (anti-SSRF).
   ═══════════════════════════════════════════════════════════════════════ */
export const config = { maxDuration: 30 };

const ALLOWED = ["firebasestorage.googleapis.com", "storage.googleapis.com", "lh3.googleusercontent.com", "googleusercontent.com"];

export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  if(req.method === "OPTIONS") return res.status(204).end();
  const url = String((req.query && req.query.url) || "");
  if(!url) return res.status(400).end("missing url");
  let u;
  try { u = new URL(url); } catch(_){ return res.status(400).end("bad url"); }
  if(u.protocol !== "https:") return res.status(400).end("https only");
  const host = u.hostname.toLowerCase();
  if(!ALLOWED.some(h => host === h || host.endsWith("." + h))) return res.status(403).end("host not allowed");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if(!r.ok) return res.status(r.status === 404 ? 404 : 502).end("upstream " + r.status);
    const ct = (r.headers.get("content-type") || "image/png");
    if(!/^image\//i.test(ct)) return res.status(415).end("not an image");
    const ab = await r.arrayBuffer();
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).end(Buffer.from(ab));
  } catch(e){
    if(e && e.name === "AbortError") return res.status(504).end("timeout");
    return res.status(502).end("fetch failed");
  } finally { clearTimeout(timer); }
}
