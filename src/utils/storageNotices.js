/* ════════════════════════════════════════════════════════════════════════
   CLARK V16.75 — Storage Notices Manager
   ════════════════════════════════════════════════════════════════════════
   
   نظام بسيط لإظهار رسائل عن نظام التخزين الجديد (Split/Partitioned) في 
   صفحة الإعدادات فقط، بدل من توستات بتقفز للمستخدم في أي صفحة.
   
   الرسائل المعنية:
   - نجاح الـmigrations (info)
   - تحذيرات تعذر الـsync لـsplit/partitioned docs (warning/error)
   
   الـnotices تتخزن في localStorage ليستمروا بعد refresh، وتظهر فقط في
   تاب "general" داخل الإعدادات.
   ════════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "clark_storage_notices_v1";
const MAX_NOTICES = 50;
const LISTENERS = new Set();

/* ── helpers ── */
function _read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function _write(arr) {
  try {
    /* احتفظ بآخر MAX_NOTICES فقط */
    const trimmed = arr.slice(0, MAX_NOTICES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) { /* تجاهل أخطاء storage */ }
}

function _notify() {
  /* خبّر كل المستمعين بالتحديث */
  for (const fn of LISTENERS) {
    try { fn(); } catch (e) { /* تجاهل */ }
  }
}

/* ── public API ── */

/**
 * يضيف notice جديد. الأنواع: "info" | "warning" | "error" | "success"
 * @param {string} level - level type
 * @param {string} title - عنوان الـnotice
 * @param {string} [details] - تفاصيل اختيارية
 */
export function addStorageNotice(level, title, details) {
  const notice = {
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    level: level || "info",
    title: title || "",
    details: details || "",
    at: new Date().toISOString(),
    seen: false,
  };
  const all = _read();
  /* لا تكرر notice بنفس العنوان لو الـ5 ثواني الأخيرة (يحدث في حالات الـretry) */
  const recent = all.find(n => 
    n.title === title && 
    (Date.now() - new Date(n.at).getTime() < 5000)
  );
  if (recent) return recent;
  
  all.unshift(notice);  /* الأحدث أولاً */
  _write(all);
  _notify();
  return notice;
}

/* تحذير */
export function noticeWarn(title, details) {
  return addStorageNotice("warning", title, details);
}

/* خطأ */
export function noticeError(title, details) {
  return addStorageNotice("error", title, details);
}

/* نجاح */
export function noticeSuccess(title, details) {
  return addStorageNotice("success", title, details);
}

/* معلومة */
export function noticeInfo(title, details) {
  return addStorageNotice("info", title, details);
}

/* قراءة كل الـnotices (الأحدث أولاً) */
export function getStorageNotices() {
  return _read();
}

/* عدد الـnotices اللي مش متشاف */
export function getUnseenCount() {
  const all = _read();
  return all.filter(n => !n.seen).length;
}

/* علّم notice واحد كـseen */
export function markNoticeSeen(id) {
  const all = _read();
  const idx = all.findIndex(n => n.id === id);
  if (idx >= 0) {
    all[idx].seen = true;
    _write(all);
    _notify();
  }
}

/* علّم الكل كـseen */
export function markAllNoticesSeen() {
  const all = _read();
  let changed = false;
  for (const n of all) {
    if (!n.seen) { n.seen = true; changed = true; }
  }
  if (changed) { _write(all); _notify(); }
}

/* احذف notice واحد */
export function removeStorageNotice(id) {
  const all = _read().filter(n => n.id !== id);
  _write(all);
  _notify();
}

/* امسح كل الـnotices */
export function clearStorageNotices() {
  _write([]);
  _notify();
}

/* امسح الـnotices اللي اتقروا فقط */
export function clearSeenNotices() {
  const all = _read().filter(n => !n.seen);
  _write(all);
  _notify();
}

/**
 * subscribe للتغييرات — يستخدم في components تعرض الـnotices
 * @returns unsubscribe function
 */
export function subscribeToNotices(callback) {
  LISTENERS.add(callback);
  return () => LISTENERS.delete(callback);
}
