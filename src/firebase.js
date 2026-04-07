import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

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

/* Enable offline persistence */
enableIndexedDbPersistence(db).catch(err=>{
  if(err.code==="failed-precondition")console.log("Offline: multiple tabs open");
  else if(err.code==="unimplemented")console.log("Offline: browser not supported");
});

/* Secondary auth for admin creating users without logging out */
let _secApp=null;
export function getSecondaryAuth(){
  if(!_secApp)_secApp=initializeApp(firebaseConfig,"secondary");
  return getAuth(_secApp);
}
