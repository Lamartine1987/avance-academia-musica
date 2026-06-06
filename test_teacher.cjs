const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function checkLogs() {
  const logsSnap = await db.collection('debug_logs').get();
  console.log("DEBUG LOGS COUNT:", logsSnap.size);
  logsSnap.forEach(doc => {
    console.log("LOG:", doc.data());
  });
}

checkLogs().then(() => process.exit(0));
