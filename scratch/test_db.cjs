const admin = require('firebase-admin');

// Initialize with default credentials (requires GOOGLE_APPLICATION_CREDENTIALS or running in a GCP environment with access, or Firebase CLI login)
// Actually, if we just use the firebase-admin, we might need a service account. Let's see if it works with application default credentials.
admin.initializeApp({
  projectId: 'avance-1334e'
});

async function run() {
  try {
    const db = admin.firestore();
    const teachersSnap = await db.collection('teachers').get();
    console.log('Teachers count:', teachersSnap.size);
    teachersSnap.forEach(doc => {
      console.log(doc.id, doc.data());
    });
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
