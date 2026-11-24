import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
export const storage = getStorage(app);
// Fail in ~20s (not the 10-minute default) when an upload cannot go through, e.g. Storage not enabled
storage.maxUploadRetryTime = 20_000;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
