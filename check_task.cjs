const admin = require("firebase-admin");

// Initialize Firebase Admin (assuming default credentials or emulator, but usually it needs service account if talking to prod)
// We might not have service account here. Wait, this project might be a simple firebase project.

const projectId = "avance-1334e"; // I see this in the deploy output

admin.initializeApp({
  projectId: projectId
});

const db = admin.firestore();

async function checkTask() {
  const snapshot = await db.collection('lessons').where('topicTitle', '==', 'tentativa').get();
  console.log(`Found ${snapshot.docs.length} tasks with title 'tentativa'`);
  snapshot.docs.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

checkTask().catch(console.error);
