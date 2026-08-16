import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { Music2, Loader2, CheckCircle2, XCircle, Calendar, Clock, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SchoolAgendaEvent, Student } from '../types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function RSVPPortal() {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<SchoolAgendaEvent | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'declined'>('pending');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('e');
        const studentId = urlParams.get('s');

        if (!eventId || !studentId) {
          setError('Link inválido. Por favor, solicite um novo link.');
          setLoading(false);
          return;
        }

        // Fetch School Settings
        const settingsSnap = await getDoc(doc(db, 'settings', 'school'));
        if (settingsSnap.exists()) {
          setSchoolSettings(settingsSnap.data());
        }

        // Fetch Event
        const eventSnap = await getDoc(doc(db, 'school_agenda_events', eventId));
        if (!eventSnap.exists()) {
          setError('Evento não encontrado. Ele pode ter sido cancelado.');
          setLoading(false);
          return;
        }

        const eventData = { id: eventSnap.id, ...eventSnap.data() } as SchoolAgendaEvent;
        
        if (!eventData.studentIds?.includes(studentId)) {
          setError('Você não está na lista de convidados para este evento.');
          setLoading(false);
          return;
        }
        
        setEvent(eventData);

        // Fetch Student
        const studentSnap = await getDoc(doc(db, 'students', studentId));
        if (studentSnap.exists()) {
          setStudent({ id: studentSnap.id, ...studentSnap.data() } as Student);
        } else {
          setError('Aluno não encontrado no sistema.');
          setLoading(false);
          return;
        }

        // Check current status
        if (eventData.confirmedStudentIds?.includes(studentId)) {
          setStatus('confirmed');
        } else if (eventData.declinedStudentIds?.includes(studentId)) {
          setStatus('declined');
        }

      } catch (err) {
        console.error(err);
        setError('Ocorreu um erro ao carregar os dados. Tente novamente mais tarde.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleRSVP = async (newStatus: 'confirmed' | 'declined') => {
    if (!event || !student) return;
    setIsUpdating(true);
    try {
      const eventRef = doc(db, 'school_agenda_events', event.id);
      
      if (newStatus === 'confirmed') {
        await updateDoc(eventRef, {
          confirmedStudentIds: arrayUnion(student.id),
          declinedStudentIds: arrayRemove(student.id)
        });
      } else {
        await updateDoc(eventRef, {
          declinedStudentIds: arrayUnion(student.id),
          confirmedStudentIds: arrayRemove(student.id)
        });
      }
      
      setStatus(newStatus);
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar presença. Tente novamente.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !event || !student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl shadow-black/5">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Ops!</h2>
          <p className="text-zinc-500">{error || 'Não foi possível carregar os dados.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tl from-emerald-500/10 to-teal-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white/70 backdrop-blur-xl rounded-[32px] p-8 md:p-12 shadow-2xl shadow-black/5 ring-1 ring-zinc-950/5 z-10"
      >
        <div className="text-center mb-8">
          {schoolSettings?.logoUrl ? (
            <img src={schoolSettings.logoUrl} alt="Logo" className="h-16 mx-auto mb-6 object-contain drop-shadow-xl" />
          ) : (
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/20">
              <Music2 className="w-8 h-8 text-orange-500" />
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-black mb-2 display-font">{schoolSettings?.tradingName?.split(' ')[0] || 'Avance'}</h1>
          <p className="text-zinc-500 leading-relaxed text-sm uppercase tracking-widest font-semibold">
            Confirmação de Presença
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 mb-8">
          <h2 className="text-xl font-bold text-zinc-900 mb-4">{event.title}</h2>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-zinc-600">
              <Calendar className="w-5 h-5 text-orange-500 shrink-0" />
              <span>{format(parseISO(event.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-600">
              <Clock className="w-5 h-5 text-orange-500 shrink-0" />
              <span>{event.startTime} às {event.endTime}</span>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-zinc-100">
            <p className="text-sm text-zinc-500 mb-2">Olá,</p>
            <p className="font-medium text-zinc-900 text-lg">{student.name.split(' ')[0]}</p>
          </div>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {status === 'pending' ? (
              <motion.div
                key="buttons"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-2 gap-3"
              >
                <button
                  onClick={() => handleRSVP('declined')}
                  disabled={isUpdating}
                  className="bg-white border-2 border-zinc-200 text-zinc-700 font-bold py-4 px-4 rounded-2xl hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      <XCircle className="w-5 h-5" />
                      <span className="truncate">Não vou</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleRSVP('confirmed')}
                  disabled={isUpdating}
                  className="bg-zinc-900 text-white font-bold py-4 px-4 rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/25 active:scale-[0.98] disabled:opacity-50"
                >
                  {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="truncate">Confirmar</span>
                    </>
                  )}
                </button>
              </motion.div>
            ) : status === 'confirmed' ? (
              <motion.div
                key="confirmed"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-emerald-900 mb-1">Presença Confirmada!</h3>
                <p className="text-sm text-emerald-700 mb-4">Que ótimo! Te esperamos lá.</p>
                <button 
                  onClick={() => handleRSVP('declined')}
                  disabled={isUpdating}
                  className="text-xs text-zinc-500 hover:text-zinc-700 underline font-medium"
                >
                  {isUpdating ? 'Atualizando...' : 'Mudar de ideia (Cancelar presença)'}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="declined"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center"
              >
                <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-red-900 mb-1">Ausência Registrada</h3>
                <p className="text-sm text-red-700 mb-4">Poxa, que pena! Fica para a próxima.</p>
                <button 
                  onClick={() => handleRSVP('confirmed')}
                  disabled={isUpdating}
                  className="text-xs text-zinc-500 hover:text-zinc-700 underline font-medium"
                >
                  {isUpdating ? 'Atualizando...' : 'Mudar de ideia (Confirmar presença)'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
