import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

console.log("Firebase initializing...");
let app, db, auth;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  auth = getAuth(app);
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Firebase initialization failed:", error);
}
export { db, auth };
