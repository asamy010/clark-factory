/* ═══════════════════════════════════════════════════════════════
   CLARK — Emulator smoke test (V21.27.208)
   ───────────────────────────────────────────────────────────────
   اختبار دخان يتأكد إن بيئة الاختبار (Firebase Emulator) شغّالة فعليًا:
   بيوصل بالـ auth/firestore/storage emulators بنفس طريقة src/firebase.js،
   وبيعمل round-trip حقيقي (تسجيل مستخدم + قراءة موثّقة على القواعد الحقيقية
   + رفع ملف على Storage). بيتشغّل جوّه `firebase emulators:exec`:

       npm run test:emu

   بيستخدم مشروع demo-* (أوفلاين تمامًا، مفيش أي اتصال بالإنتاج). أي فشل =
   الإعداد اتكسر (بورت/قاعدة/تهيئة) → exit code 1.
   ═══════════════════════════════════════════════════════════════ */
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc } from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadString, getDownloadURL } from "firebase/storage";

const HOST = process.env.EMU_HOST || "127.0.0.1";
const cfg = { apiKey: "demo", authDomain: "demo-clark.firebaseapp.com", projectId: "demo-clark", storageBucket: "demo-clark.appspot.com", messagingSenderId: "0", appId: "demo" };

const app = initializeApp(cfg);
const auth = getAuth(app);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
const storage = getStorage(app);

/* نفس الـ connect* calls بتاعة src/firebase.js */
connectAuthEmulator(auth, "http://" + HOST + ":9099", { disableWarnings: true });
connectFirestoreEmulator(db, HOST, 8080);
connectStorageEmulator(storage, HOST, 9199);

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✅ " + m); pass++; };
const no = (m, e) => { console.log("  ❌ " + m + " — " + ((e && e.code) || "") + " " + ((e && e.message) || e)); fail++; };

async function run() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, "emu_" + Date.now() + "@test.local", "Passw0rd!");
    ok("Auth (9099): created + signed in uid=" + cred.user.uid.slice(0, 8));
  } catch (e) { no("Auth (9099)", e); return; }

  try {
    /* factory/roleScopes: allow read if isAuthed() — قراءة موثّقة على القواعد الحقيقية */
    const snap = await getDoc(doc(db, "factory", "roleScopes"));
    ok("Firestore (8080): authed read via real rules OK (exists=" + snap.exists() + ")");
  } catch (e) { no("Firestore (8080) read", e); }

  try {
    /* temp/**: allow authed write (isWriteSafe: text/plain مسموح) */
    const r = ref(storage, "temp/emu-smoke-" + Date.now() + ".txt");
    await uploadString(r, "clark emulator smoke test", "raw", { contentType: "text/plain" });
    await getDownloadURL(r);
    ok("Storage (9199): uploaded temp file + got URL");
  } catch (e) { no("Storage (9199) upload", e); }
}

run().then(() => {
  console.log("\n=== EMU SMOKE: " + pass + " passed, " + fail + " failed ===");
  process.exit(fail > 0 ? 1 : 0);
}).catch((e) => { console.error("fatal", e); process.exit(1); });
