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
  apiKey: "AIzaSyD42_SF_afFduOpaSkMNcJdy55EXV8kzKo",
  authDomain: "clarkfactorymanagement.firebaseapp.com",
  projectId: "clarkfactorymanagement",
  storageBucket: "clarkfactorymanagement.firebasestorage.app",
  messagingSenderId: "845345484896",
  appId: "1:845345484896:web:c44e0bcfb716bc18e9d305"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
