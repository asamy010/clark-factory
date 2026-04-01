import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/*
  ╔══════════════════════════════════════════════════════╗
  ║  !! مهم !!                                          ║
  ║  غيّر البيانات دي ببيانات مشروعك من Firebase Console ║
  ║  اتبع الدليل (firebase-guide.md) خطوة بخطوة        ║
  ╚══════════════════════════════════════════════════════╝
*/
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
