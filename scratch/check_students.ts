import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const studentsSnap = await getDocs(collection(db, 'students'));
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log("Students:", JSON.stringify(students.map(s => ({ 
    id: s.id, 
    name: s.name, 
    status: s.status,
    courseValue: s.courseValue,
    dueDate: s.dueDate,
    billingStartDate: s.billingStartDate
  })), null, 2));
  process.exit(0);
}

run().catch(console.error);
