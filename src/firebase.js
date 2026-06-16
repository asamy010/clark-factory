import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/*
  ╔══════════════════════════════════════════════════════╗
  ║  !! مهم !!                                          ║
  ║  غيّر البيانات دي ببيانات مشروعك من Firebase Console ║
  ║  اتبع الدليل (firebase-guide.md) خطوة بخطوة        ║
  ╚══════════════════════════════════════════════════════╝
*/
const firebaseConfig = {
  apiKey: "AIzaSyD42_SF_afFduOpaSkMNcJdy55EXV8kzKo",
  authDomain: "clarkfactorymanagement.firebaseapp.com",
  projectId: "clarkfactorymanagement",
  storageBucket: "clarkfactorymanagement.firebasestorage.app",
  messagingSenderId: "845345484896",
  appId: "1:845345484896:web:c44e0bcfb716bc18e9d305"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/* V21.9.51 ROOT-CAUSE FIX:
   Pre-V21.9.51 the client used getFirestore(app) with default settings
   (ignoreUndefinedProperties:false). Then ANY setDoc/update call with
   an `undefined` field value threw:
     "Function setDoc() called with invalid data. Unsupported field value:
      undefined (found in field dayOfWeek in document recurringTreasuryDocs/...)"

   This blew up the V21.9.44 recurringTreasury partitioned writes because
   monthly rules naturally have dayOfWeek=undefined (and vice-versa for
   weekly rules with dayOfMonth=undefined). The legacy cfg.recurringTreasury
   array worked because Firestore silently dropped undefined inside arrays,
   but the per-doc writes are strict.

   The Admin SDK has had this setting since V21.9.13 (see api/_firebase.js).
   The client SDK needs the same to match: any conditional field that
   evaluates to undefined is silently dropped on write, matching JSON spec
   semantics. This is defense-in-depth — we still validate user input at
   form boundaries, this only handles internal undefined leaks from
   conditional field spreads in mutators. */
/* V21.27.27 (perf/offline): النقل من enableIndexedDbPersistence(db)
   المهجور (single-tab فقط — كان بيفشل بـ "failed-precondition" لو المستخدم
   فاتح أكتر من تاب → مفيش offline cache) للـ API الحديث localCache +
   persistentMultipleTabManager. الفايدة:
   - دعم متعدد التابات: كل التابات بتشارك نفس الـ IndexedDB cache.
   - cold-start أسرع: القراءات بتتخدم من الـ cache فوراً قبل الشبكة.
   - الـ fallback لـ in-memory cache تلقائي في المتصفحات/الأوضاع اللي
     مابتدعمش IndexedDB (تصفّح خاص) — مفيش throw.
   ملاحظة: ده بيلمس تهيئة Firestore — محتاج تأكيد سريع على production
     (افتح التطبيق + تابين، اتأكد إن الداتا بتحمّل والـ offline شغّال). */
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const storage = getStorage(app);

/* Secondary auth for admin creating users without logging out */
let _secApp=null;
export function getSecondaryAuth(){
  if(!_secApp)_secApp=initializeApp(firebaseConfig,"secondary");
  return getAuth(_secApp);
}
