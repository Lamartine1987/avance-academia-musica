import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('../../serviceAccountKey.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function check() {
  const cpf = '06508218409';
  const snap = await db.collection('students').where('cpf', '==', cpf).get();
  if (snap.empty) {
    console.log(`Student with CPF ${cpf} NOT FOUND!`);
  } else {
    console.log(`Student FOUND:`, snap.docs[0].data());
  }
}

check().catch(console.error);
