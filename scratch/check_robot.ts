import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

async function check() {
  console.log('Checking recent payments...');
  
  const recentPayments = await db.collection('payments')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
    
  console.log(`Found ${recentPayments.size} recent payments:`);
  recentPayments.docs.forEach(doc => {
    const data = doc.data();
    let created = 'Unknown';
    if (data.createdAt) {
      created = data.createdAt.toDate().toISOString();
    }
    console.log(`- Payment ID: ${doc.id}, Student: ${data.studentName}, Month: ${data.month}, Status: ${data.status}, CreatedAt: ${created}, whatsappSent: ${JSON.stringify(data.whatsappSent)}`);
  });
  
  process.exit(0);
}

check().catch(console.error);
