// DEVELOPER: Replace all placeholder values with your own from Firebase Console
// Firebase Console → Project Settings → General → Your apps → Web app → SDK setup

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyDFjoStKzfUtlWyEkcCs_1TuZm8R_0MZVc",
  authDomain:        "ark-music-portal.web.app",
  projectId:         "ark-music-portal",
  storageBucket:     "ark-music-portal.firebasestorage.app",
  messagingSenderId: "704177513404",
  appId:             "1:704177513404:web:f29d1e0ce5154fff46c1b9",
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Secondary app instance — used for account creation so sysadmin is not signed out
const secondaryApp    = initializeApp(firebaseConfig, "secondary");
export const authSecondary = getAuth(secondaryApp);
