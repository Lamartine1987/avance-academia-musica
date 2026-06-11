import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

import { getFunctions } from 'firebase/functions';

console.log("Firebase initializing...");
let app, db, auth, storage, functions;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  functions = getFunctions(app, 'us-central1'); // Default region
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Firebase initialization failed:", error);
}
export { db, auth, storage, functions, app };
