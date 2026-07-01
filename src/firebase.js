import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

/*
  ╔══════════════════════════════════════════════════════╗
  ║  !! مهم !!                                          ║
  ║  غيّر البيانات دي ببيانات مشروعك من Firebase Console ║
  ║  اتبع الدليل (firebase-guide.md) خطوة بخطوة        ║
  ╚══════════════════════════════════════════════════════╝
*/
/* V21.27.207: الإعدادات من متغيّرات البيئة (VITE_FB_*) لو موجودة — عشان نقدر
   نوجّه التطبيق لمشروع Firebase منفصل (staging) عبر Vercel Preview env — وإلا
   الإنتاج الافتراضي بنفس القيم بالظبط. مفيش env مضبوط (زي الإنتاج الحالي على
   Vercel) → السلوك مطابق تمامًا للنسخة القديمة (fallback = نفس الـ literals). */
const _env = import.meta.env || {};
const firebaseConfig = {
  apiKey: _env.VITE_FB_API_KEY || "AIzaSyD42_SF_afFduOpaSkMNcJdy55EXV8kzKo",
  authDomain: _env.VITE_FB_AUTH_DOMAIN || "clarkfactorymanagement.firebaseapp.com",
  projectId: _env.VITE_FB_PROJECT_ID || "clarkfactorymanagement",
  storageBucket: _env.VITE_FB_STORAGE_BUCKET || "clarkfactorymanagement.firebasestorage.app",
  messagingSenderId: _env.VITE_FB_SENDER_ID || "845345484896",
  appId: _env.VITE_FB_APP_ID || "1:845345484896:web:c44e0bcfb716bc18e9d305"
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

/* V21.27.207: الاتصال بالـ Firebase Emulator محليًا (الماك) — بيئة اختبار فعلية
   بدون لمس بيانات الإنتاج. بيتفعّل فقط لما VITE_USE_EMULATOR=1 (npm run dev:emu).
   في بناء Vercel/الإنتاج العلَم مش مضبوط → الكتلة دي dead code، صفر تأثير على
   المستخدمين. try/catch لكل خدمة عشان أي فشل اتصال ما يكسرش تحميل الموديول.
   الطريقة: شغّل الـ emulator (npm run emu) ثم dev:emu — التطبيق الحقيقي هيشتغل
   على Firestore/Auth/Storage وهميين بنفس الـ security rules. شوف docs/TESTING.md. */
export const USING_EMULATOR = (_env.VITE_USE_EMULATOR === "1" || _env.VITE_USE_EMULATOR === true);
if (USING_EMULATOR) {
  const _host = _env.VITE_EMULATOR_HOST || "127.0.0.1";
  try { connectFirestoreEmulator(db, _host, Number(_env.VITE_EMULATOR_FIRESTORE_PORT) || 8080); } catch (e) { console.warn("emulator firestore:", e && e.message); }
  try { connectAuthEmulator(auth, "http://" + _host + ":" + (Number(_env.VITE_EMULATOR_AUTH_PORT) || 9099), { disableWarnings: true }); } catch (e) { console.warn("emulator auth:", e && e.message); }
  try { connectStorageEmulator(storage, _host, Number(_env.VITE_EMULATOR_STORAGE_PORT) || 9199); } catch (e) { console.warn("emulator storage:", e && e.message); }
  try { console.info("🔧 CLARK متصل بالـ Firebase Emulator (" + _host + ") — بيئة اختبار، مش الإنتاج"); } catch (_) { /* ignore */ }
}

/* Secondary auth for admin creating users without logging out */
let _secApp=null;
export function getSecondaryAuth(){
  if(!_secApp){
    _secApp=initializeApp(firebaseConfig,"secondary");
    /* V21.27.207: الـ secondary auth كمان يتوصل بالـ emulator في وضع الاختبار */
    if(USING_EMULATOR){ try { connectAuthEmulator(getAuth(_secApp), "http://"+(_env.VITE_EMULATOR_HOST||"127.0.0.1")+":"+(Number(_env.VITE_EMULATOR_AUTH_PORT)||9099), { disableWarnings:true }); } catch(_){ /* ignore */ } }
  }
  return getAuth(_secApp);
}
