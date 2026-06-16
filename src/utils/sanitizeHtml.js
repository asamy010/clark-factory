/* ═══════════════════════════════════════════════════════════════
   CLARK — sanitizeHtml (V21.27.4)

   تنظيف خفيف لمحتوى HTML داخلي موثوق (تفاصيل تشغيل / تيك-باك يكتبها
   المستخدم في محرّر منسّق). الهدف: لو اتعمل paste من مصدر خارجي، مايتنفّذش
   كود (script / event handlers / javascript: URLs). مش بديل عن sanitizer
   كامل، لكنه كافٍ لمحتوى single-user داخلي بيتعرض/بيتطبع في نفس التطبيق.
   ═══════════════════════════════════════════════════════════════ */
export function sanitizeHtml(html){
  let s = String(html || "");
  /* عناصر تنفيذية/خطرة — بالمحتوى */
  s = s.replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  /* نفس العناصر self-closing / بدون إغلاق */
  s = s.replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, "");
  /* معالجات الأحداث onClick/onError/... */
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  /* روابط javascript: */
  s = s.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '$1="#"');
  return s;
}

export default sanitizeHtml;
