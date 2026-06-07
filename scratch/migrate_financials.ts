import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  console.log("Iniciando migração de dados financeiros...");
  try {
    const studentsSnap = await getDocs(collection(db, 'students'));
    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    let count = 0;
    for (const student of students) {
      const studentId = student.id;
      
      const financialData = {
        courseValue: student.courseValue || 0,
        dueDate: student.dueDate || 10,
        billingStartDate: student.billingStartDate || null,
        discount: student.discount || 0,
        isScholarship: student.isScholarship || false,
        studentId: studentId // Optional but good for redundancy
      };
      
      await setDoc(doc(db, 'student_financials', studentId), financialData, { merge: true });
      count++;
      console.log(`[${count}/${students.length}] Dados financeiros copiados para o aluno ${studentId}`);
    }
    
    console.log(`Migração concluída! ${count} alunos processados.`);
    process.exit(0);
  } catch (err) {
    console.error("Erro durante a migração:", err);
    process.exit(1);
  }
}

run().catch(console.error);
