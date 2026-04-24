import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";

// Using initializeFirestore with experimentalAutoDetectLongPolling to improve connectivity in restricted networks
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, dbId);

export const auth = getAuth(app);
