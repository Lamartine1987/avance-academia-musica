import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, Timestamp, getDoc, doc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Lesson } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { AlertCircle, User, Music, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard({ profile }: { profile: UserProfile }) {
  const [stats, setStats] = useState({
    totalStudents: 0,
    lessonsToday: 0,
    newStudents: 0
  });
  const [upcomingLessons, setUpcomingLessons] = useState<Lesson[]>([]);
  const [studentsMap, setStudentsMap] = useState<Record<string, string>>({});
  const [teachersMap, setTeachersMap] = useState<Record<string, string>>({});
  const [isPaymentDay, setIsPaymentDay] = useState(false);

  useEffect(() => {
    const studentsUnsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStats(prev => ({ ...prev, totalStudents: snapshot.size }));
      const map: Record<string, string> = {};
      snapshot.forEach(doc => {
        map[doc.id] = doc.data().name;
      });
      setStudentsMap(map);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    const teachersUnsubscribe = onSnapshot(collection(db, 'teachers'), (snapshot) => {
      const map: Record<string, string> = {};
      snapshot.forEach(doc => {
        map[doc.id] = doc.data().name;
      });
      setTeachersMap(map);
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
      let count = 0;
      const uList: Lesson[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as Lesson;
        if (data.status !== 'cancelled' && data.status !== 'rescheduled' && !data.isStudyTask) {
          count++;
          uList.push({ id: doc.id, ...data });
        }
      });
      // Order by start time
      uList.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
      
      setStats(prev => ({ ...prev, lessonsToday: count }));
      setUpcomingLessons(uList);
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
      teachersUnsubscribe();
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
    
      {/* Aulas de Hoje Section */}
      <div className="mt-8">
        <h3 className="font-bold text-lg mb-4 text-zinc-900">Aulas de Hoje</h3>
        <div className="space-y-3">
          {upcomingLessons.length > 0 ? (
            upcomingLessons.map(lesson => {
              const start = lesson.startTime.toDate();
              const end = lesson.endTime.toDate();
              const isToday = start.toDateString() === new Date().toDateString();

              const studentName = lesson.isTrial ? (lesson.studentName || 'Prospecto') : (studentsMap[lesson.studentId] || 'Desconhecido');
              const teacherName = teachersMap[lesson.teacherId] || 'Desconhecido';

              return (
                <div 
                  key={lesson.id} 
                  className={`bg-white p-4 md:p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 transition-all duration-300 ring-1 ${isToday ? 'ring-emerald-500/50 shadow-lg shadow-emerald-500/10' : 'ring-zinc-200 shadow-sm hover:shadow-md'}`}
                >
                  <div className="flex items-center gap-4 md:gap-6 w-full">
                    <div className="w-16 h-16 bg-zinc-50 rounded-xl flex flex-col items-center justify-center border border-zinc-100 shadow-sm shrink-0">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase leading-none mb-1">{format(start, 'MMM', { locale: ptBR })}</span>
                      <span className="text-xl font-black text-zinc-800 leading-none">{format(start, 'dd')}</span>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-zinc-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Aluno</p>
                          <p className="text-sm font-bold text-zinc-900 leading-tight truncate">
                            {studentName}
                            {lesson.instrument && <span className="text-xs text-zinc-400 font-medium ml-1">({lesson.instrument})</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Music className="w-5 h-5 text-zinc-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Professor</p>
                          <p className="text-sm font-bold text-zinc-900 leading-tight truncate">{teacherName}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-zinc-400 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Horário</p>
                          <p className="text-sm font-bold text-zinc-900 leading-tight">{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end shrink-0">
                    {lesson.status === 'completed' ? (
                      <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-xs font-bold ring-1 ring-emerald-500/20 whitespace-nowrap">
                        Concluída
                      </span>
                    ) : (
                      <span className="bg-orange-50 text-orange-600 px-3 py-1 rounded-lg text-xs font-bold ring-1 ring-orange-500/20 whitespace-nowrap">
                        Agendada
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-white p-8 rounded-2xl text-center text-zinc-500 ring-1 ring-zinc-200">
              Nenhuma aula agendada para hoje.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
