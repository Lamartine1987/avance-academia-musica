import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize the app
admin.initializeApp({
  projectId: 'avance-1334e'
});

// Get references to both databases
const oldDb = getFirestore(admin.app(), 'ai-studio-00c161e8-693c-4cc9-8d3a-3e1ddae8db8e');
const newDb = getFirestore(admin.app());

async function migrateCollection(collectionPath: string) {
  console.log(`\nMigrating collection: ${collectionPath}`);
  const snapshot = await oldDb.collection(collectionPath).get();
  
  if (snapshot.empty) {
    console.log(`Collection ${collectionPath} is empty.`);
    return;
  }

  let count = 0;
  let batch = newDb.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const docRef = newDb.collection(collectionPath).doc(doc.id);
    batch.set(docRef, doc.data());
    count++;
    batchCount++;

    // Commit batch every 400 documents to avoid Firestore limits
    if (batchCount === 400) {
      await batch.commit();
      batch = newDb.batch();
      batchCount = 0;
      console.log(`...committed 400 docs`);
    }
    
    // Migrate subcollections recursively
    const subcollections = await doc.ref.listCollections();
    for (const subcol of subcollections) {
      await migrateCollection(`${collectionPath}/${doc.id}/${subcol.id}`);
    }
  }

  // Commit remaining documents
  if (batchCount > 0) {
    await batch.commit();
  }
  
  console.log(`=> Migrated total ${count} documents in ${collectionPath}`);
}

async function migrateAll() {
  try {
    console.log('Starting migration from ai-studio DB to (default) DB...');
    const rootCollections = await oldDb.listCollections();
    console.log(`Found ${rootCollections.length} root collections.`);
    
    for (const collection of rootCollections) {
      await migrateCollection(collection.id);
    }
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateAll();
