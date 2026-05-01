import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, Timestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { AlertCircle } from 'lucide-react';

export default function Dashboard({ profile }: { profile: UserProfile }) {
  const [stats, setStats] = useState({
    totalStudents: 0,
    lessonsToday: 0,
    newStudents: 0
  });
  const [isPaymentDay, setIsPaymentDay] = useState(false);

  useEffect(() => {
    const studentsUnsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStats(prev => ({ ...prev, totalStudents: snapshot.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    // Lessons today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let lessonsQuery = query(
      collection(db, 'lessons'),
      where('startTime', '>=', Timestamp.fromDate(startOfDay)),
      where('startTime', '<=', Timestamp.fromDate(endOfDay))
    );

    if (profile.role === 'teacher' && profile.teacherId) {
      lessonsQuery = query(lessonsQuery, where('teacherId', '==', profile.teacherId));
    }

    const lessonsUnsubscribe = onSnapshot(lessonsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, lessonsToday: snapshot.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lessons');
    });

    const fetchTeacherPaymentSettings = async () => {
      if (profile.role !== 'admin') return;
      try {
        const docRef = doc(db, 'settings', 'teacher_payments');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const todayDay = new Date().getDate();
          if (data.paymentDates && Array.isArray(data.paymentDates)) {
            if (data.paymentDates.includes(todayDay)) {
              setIsPaymentDay(true);
            }
          } else if ([5, 15, 25].includes(todayDay)) {
             setIsPaymentDay(true); // Default
          }
        } else {
           const todayDay = new Date().getDate();
           if ([5, 15, 25].includes(todayDay)) {
             setIsPaymentDay(true);
           }
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchTeacherPaymentSettings();

    return () => {
      studentsUnsubscribe();
      lessonsUnsubscribe();
    };
  }, []);

  return (
    <div className="space-y-6">
      {isPaymentDay && profile.role === 'admin' && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 px-6 py-4 rounded-2xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="bg-orange-100 p-2 rounded-full shrink-0">
            <AlertCircle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Atenção Admin!</h4>
            <p className="text-sm">Hoje é dia de pagamento dos professores. Verifique a página de Pagamentos para conferir os valores devidos e lançamentos deste ciclo.</p>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-8 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-bl-[100px] -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
        <p className="text-zinc-500 text-sm font-bold mb-2 uppercase tracking-wider">Total de Alunos</p>
        <h3 className="text-5xl font-bold tracking-tight display-font text-black">{stats.totalStudents}</h3>
      </div>
      <div className="bg-white p-8 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 rounded-bl-[100px] -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
        <p className="text-zinc-500 text-sm font-bold mb-2 uppercase tracking-wider">Aulas Hoje</p>
        <h3 className="text-5xl font-bold tracking-tight display-font text-black">{stats.lessonsToday}</h3>
      </div>
      <div className="bg-white p-8 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 rounded-bl-[100px] -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
        <p className="text-zinc-500 text-sm font-bold mb-2 uppercase tracking-wider">Novas Matrículas</p>
        <h3 className="text-5xl font-bold tracking-tight display-font text-black">{stats.newStudents}</h3>
      </div>
    </div>
    </div>
  );
}
