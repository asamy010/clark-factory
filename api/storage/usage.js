/* ═══════════════════════════════════════════════════════════════════════
   CLARK · api/storage/usage.js (V21.23.4)
   ───────────────────────────────────────────────────────────────────────
   بيقيس المساحة المستهلكة فعلياً من Firebase Storage (كل الـ bucket مش بس
   مساحة التخزين/المستندات) — إجمالي بايتات + عدد ملفات + تقسيم حسب أول
   مجلد (images/ · documents/ · orders/ · shopify-products/ ...).

   Admin SDK getFiles مع pagination + سقف صفحات (تفادي timeout على bucket كبير).
   auth أدمن. env: FIREBASE_STORAGE_BUCKET (افتراضي clarkfactorymanagement…).
   ═══════════════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";
import { setCors, verifyAdminToken, getAdminApp } from "../_firebase.js";

export const config = { maxDuration: 60 };

const BUCKET = (process.env.FIREBASE_STORAGE_BUCKET || "clarkfactorymanagement.firebasestorage.app").trim();
const MAX_PAGES = 40;       /* سقف أمان: 40 × 5000 = 200k ملف */
const PAGE_SIZE = 5000;

export default async function handler(req, res){
  setCors(res, req);
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST" && req.method !== "GET") return res.status(405).json({ ok: false, error: "الطريقة غير مدعومة" });

  let body = {};
  try { body = (typeof req.body === "string") ? JSON.parse(req.body || "{}") : (req.body || {}); } catch(_){}
  const auth = await verifyAdminToken(req.headers.authorization || body.idToken);
  if(!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    getAdminApp();
    const bucket = admin.storage().bucket(BUCKET);
    let pageToken;
    let totalBytes = 0, fileCount = 0, pages = 0;
    const byPrefix = {};
    do {
      const [files, nextQuery] = await bucket.getFiles({ autoPaginate: false, maxResults: PAGE_SIZE, pageToken });
      for(const f of files){
        const sz = Number(f.metadata && f.metadata.size) || 0;
        totalBytes += sz; fileCount++;
        const seg = (String(f.name || "").split("/")[0]) || "(root)";
        byPrefix[seg] = (byPrefix[seg] || 0) + sz;
      }
      pageToken = nextQuery && nextQuery.pageToken;
      pages++;
    } while(pageToken && pages < MAX_PAGES);

    return res.status(200).json({
      ok: true, bucket: BUCKET, totalBytes, fileCount,
      byPrefix, truncated: !!pageToken, scannedAt: new Date().toISOString(),
    });
  } catch(e){
    return res.status(500).json({ ok: false, error: "تعذّر قياس المساحة: " + ((e && e.message) || String(e)) });
  }
}
