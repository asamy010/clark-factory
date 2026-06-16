/* ═══════════════════════════════════════════════════════════════
   CLARK — Remote Error Logger (V21.27.25)

   لماذا؟ CLARK بيـ deploy على production مباشرة بدون بيئة تجربة
   (CLAUDE.md §1). الـ ErrorBoundary القديم كان بيـ console.error محلياً
   بس → أي crash عند مستخدم كان بيختفي تماماً عن المطوّر. الـ logger ده
   بيكتب الأخطاء في Firestore عشان تبقى مرئية بدون ما نعتمد على المستخدم
   إنه يصوّر الشاشة.

   التخزين: errorLogsDays/{YYYY-MM-DD} — per-day doc بشكل { entries:[...] }
   (نفس نمط daily-split في CLAUDE.md §2 — حجم الأخطاء اليومي ضئيل فالـ
   per-day doc مايقربش من حد 1MB، ومع كده الـ split بيمنع النمو غير المحدود).

   مبادئ التصميم (الأداء أولاً):
   - best-effort تماماً: مايرميش exception أبداً ومايعطّلش أي مسار.
   - dedup: نفس الخطأ خلال نافذة قصيرة بيتكتب مرة واحدة (يمنع طوفان
     الكتابات لو الخطأ في render loop).
   - throttle: حد أقصى للكتابات في الجلسة الواحدة (حماية حصة Firestore).
   - truncation: الـ stack/message متقصوصين لأطوال آمنة.
   - الكتابة بـ arrayUnion + merge — idempotent ومايمسحش entries موجودة.
   ═══════════════════════════════════════════════════════════════ */

import { db, auth } from "../firebase.js";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import { APP_VERSION } from "../constants/index.js";

/* حدود الحماية */
const MAX_PER_SESSION = 25;          // أقصى كتابات في الجلسة الواحدة
const DEDUP_WINDOW_MS = 60 * 1000;   // نفس التوقيع خلال دقيقة = مرة واحدة
const MSG_MAX = 600;                 // أقصى طول للرسالة
const STACK_MAX = 2400;              // أقصى طول للـ stack
const CTX_MAX = 400;                 // أقصى طول لوصف السياق

let _sessionCount = 0;
const _recent = new Map();           // signature → lastTs (in-memory dedup)

function _today(){
  /* تاريخ محلي YYYY-MM-DD — متسق مع باقي daily-split collections */
  const d = new Date();
  const z = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

function _trunc(s, max){
  s = (s == null) ? "" : String(s);
  return s.length > max ? s.slice(0, max) + "…[+" + (s.length - max) + "]" : s;
}

/* توقيع مختصر للخطأ — للـ dedup (أول سطر رسالة + أول سطر stack). */
function _sig(msg, stack){
  const firstStack = String(stack || "").split("\n")[0] || "";
  return (_trunc(msg, 120) + "|" + _trunc(firstStack, 120));
}

/* تنظيف خفيف لخريطة الـ dedup عشان ماتكبرش (best-effort). */
function _gc(now){
  if(_recent.size < 50) return;
  for(const [k, t] of _recent){ if(now - t > DEDUP_WINDOW_MS) _recent.delete(k); }
}

/**
 * يسجّل خطأ في Firestore (best-effort — مايرميش أبداً).
 * @param {any} error    كائن الخطأ أو رسالته.
 * @param {object} info  سياق إضافي: { kind, ctx, componentStack, ... }.
 */
export function logClientError(error, info = {}){
  try {
    if(_sessionCount >= MAX_PER_SESSION) return;

    const now = Date.now();
    const msg = _trunc(error?.message || error || "Unknown error", MSG_MAX);
    const stack = _trunc(
      error?.stack || info.componentStack || "",
      STACK_MAX
    );

    /* dedup — نفس التوقيع خلال النافذة بيتجاهل */
    const sig = _sig(msg, stack);
    const last = _recent.get(sig);
    if(last && (now - last) < DEDUP_WINDOW_MS) return;
    _recent.set(sig, now);
    _gc(now);

    const u = auth?.currentUser || null;
    const entry = {
      ts: new Date(now).toISOString(),
      version: APP_VERSION,
      kind: _trunc(info.kind || "error", 40),     // error | unhandledrejection | boundary | window
      msg,
      stack,
      ctx: _trunc(info.ctx || "", CTX_MAX),
      url: _trunc(typeof location !== "undefined" ? location.href : "", 300),
      ua: _trunc(typeof navigator !== "undefined" ? navigator.userAgent : "", 300),
      by: u ? (u.email || u.uid || "?") : "anon",
    };

    _sessionCount++;

    /* الكتابة — merge + arrayUnion عشان ماتمسحش entries اليوم.
       لو فشلت (permission-denied قبل تسجيل الدخول، أوفلاين، إلخ) نتجاهل
       بصمت — التسجيل degraded مش breaking. */
    setDoc(
      doc(db, "errorLogsDays", _today()),
      { entries: arrayUnion(entry), updatedAt: entry.ts },
      { merge: true }
    ).catch(()=>{ /* best-effort — لا شيء */ });
  } catch(_){
    /* أي خطأ داخل الـ logger نفسه يُبتلع — مفيش حلقة أخطاء */
  }
}

/* تثبيت الـ global handlers مرة واحدة — يلتقط الأخطاء خارج شجرة React
   (event handlers، promises، async). يُستدعى من main.jsx. */
let _installed = false;
export function installGlobalErrorLogging(){
  if(_installed || typeof window === "undefined") return;
  _installed = true;

  window.addEventListener("error", (e)=>{
    /* أخطاء تحميل الموارد (img/script) بترفع error event بدون e.error —
       نتجاهلها (مش أخطاء JS فعلية، بتعمل ضجيج). */
    if(!e.error) return;
    logClientError(e.error, { kind: "window", ctx: _trunc(e.filename || "", CTX_MAX) });
  });

  window.addEventListener("unhandledrejection", (e)=>{
    const reason = e?.reason;
    logClientError(
      reason instanceof Error ? reason : new Error(String(reason)),
      { kind: "unhandledrejection" }
    );
  });
}
