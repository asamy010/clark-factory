/* ═══════════════════════════════════════════════════════════════════════
   CLARK · aiStudioSessions.js — هيستوري جلسات AI Studio (مشترك على المصنع)
   ───────────────────────────────────────────────────────────────────────
   نطاق مشترك (أمر Ahmed): كل الجلسات تتحفظ وتبان لكل المستخدمين.

   التخزين (آمن §2 — مفيش array بيكبر بلا حدود في مستند واحد):
   - فهرس خفيف: factory/aiStudioSessions = { list: [{id,ts,by,modelNo,label,
     thumb,count}] } — صغير (~60 عنصر)، يتحمّل أول ما تفتح الاستوديو.
   - تفاصيل كل جلسة في مستند مستقل: factory/aiStudioSession_<id> =
     { id, ts, by, modelNo, settings, results:[...] } — يتحمّل lazy عند فتح
     الجلسة فقط. مغطّى بقاعدة factory/{docId} الموجودة (read: isAnyUser،
     write: isManagerPlus) → مفيش rules جديدة محتاجة نشر.
   ═══════════════════════════════════════════════════════════════════════ */

import { db } from "../firebase.js";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

const CAP = 60;                                   /* أقصى عدد جلسات في الفهرس */
const idxRef = () => doc(db, "factory", "aiStudioSessions");
const sessRef = (id) => doc(db, "factory", "aiStudioSession_" + String(id).replace(/[^A-Za-z0-9_]/g, ""));

/* تحميل الفهرس (الأحدث أولاً). */
export async function loadSessionIndex(){
  try {
    const s = await getDoc(idxRef());
    const d = s.exists() ? s.data() : null;
    const list = (d && Array.isArray(d.list)) ? d.list : [];
    return list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } catch(e){ return []; }
}

/* تحميل تفاصيل جلسة واحدة (lazy). */
export async function loadSession(id){
  try {
    const s = await getDoc(sessRef(id));
    return s.exists() ? s.data() : null;
  } catch(e){ return null; }
}

/* حفظ/تحديث جلسة (upsert): يكتب مستند الجلسة + يحدّث الفهرس. */
export async function saveSession(session){
  if(!session || !session.id) return null;
  await setDoc(sessRef(session.id), session);
  const meta = {
    id: session.id,
    ts: session.ts || Date.now(),
    by: session.by || "",
    modelNo: session.modelNo || "",
    label: session.label || "",
    thumb: (session.results && session.results[0] && session.results[0].url) || "",
    count: (session.results || []).length,
  };
  let list = (await loadSessionIndex()).filter(x => x.id !== session.id);
  list = [meta, ...list].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, CAP);
  await setDoc(idxRef(), { list, ts: Date.now() }, { merge: true });
  return list;
}

/* حذف جلسة (مستندها + من الفهرس). */
export async function deleteSession(id){
  try { await deleteDoc(sessRef(id)); } catch(e){}
  const list = (await loadSessionIndex()).filter(x => x.id !== id);
  await setDoc(idxRef(), { list, ts: Date.now() }, { merge: true });
  return list;
}
