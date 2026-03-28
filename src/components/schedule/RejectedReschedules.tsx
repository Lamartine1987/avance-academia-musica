import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AlertCircle, Clock, Send, Plus, Loader2, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FeedbackModal from '../FeedbackModal';

interface RejectedRescheduleProps {
  // Add props if needed
}

export default function RejectedReschedules({}: RejectedRescheduleProps) {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<any | null>(null);
  
  const [tempSlot, setTempSlot] = useState({ date: format(new Date(), 'yyyy-MM-dd'), time: '08:00', maxCapacity: 1 });
  const [newSlots, setNewSlots] = useState<{ dateLabel: string, date: string, time: string, maxCapacity: number }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{isOpen: boolean, type: 'success' | 'warning' | 'error', title: string, message: string}>({ isOpen: false, type: 'success', title: '', message: '' });

  useEffect(() => {
    const q = query(
      collection(db, 'reschedule_tokens'), 
      where('status', 'in', ['rejected_slots', 'pending'])
    );
    
    const unsubscribe = onSnapshot(q, async (snap) => {
      const dataPromises = snap.docs.map(async (d) => {
        const tokenData = { id: d.id, ...d.data() } as any;
        
        // Fetch relations
        let studentName = 'Aluno';
        let teacherName = 'Professor';
        
        try {
          const studentDoc = await getDoc(doc(db, 'students', tokenData.studentId));
          if (studentDoc.exists()) studentName = studentDoc.data().name;
          
          const absenceDoc = await getDoc(doc(db, 'teacher_absences', tokenData.absenceId));
          if (absenceDoc.exists()) {
            const teacherId = absenceDoc.data().teacherId;
            const teacherDoc = await getDoc(doc(db, 'teachers', teacherId));
            if (teacherDoc.exists()) teacherName = teacherDoc.data().name;
          }
        } catch (e) {
          console.error(e);
        }

        return {
          ...tokenData,
          studentName,
          teacherName
        };
      });
      
      const resolvedData = await Promise.all(dataPromises);
      setTokens(resolvedData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addCustomSlot = () => {
    const dateObj = new Date(`${tempSlot.date}T00:00:00`);
    const dateLabel = format(dateObj, "dd/MM/yyyy (EEEE)", { locale: ptBR });
    setNewSlots([
      ...newSlots,
      { dateLabel, date: tempSlot.date, time: tempSlot.time, maxCapacity: tempSlot.maxCapacity }
    ]);
  };

  const removeSlot = (index: number) => {
    setNewSlots(newSlots.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (newSlots.length === 0) return setFeedback({ isOpen: true, type: 'warning', title: 'Adicione um Horário', message: 'Você precisa adicionar pelo menos um novo horário de reposição.' });
    setIsSubmitting(true);
    try {
      const fn = getFunctions();
      const provideNewSlots = httpsCallable(fn, 'provideNewRescheduleSlots');
      await provideNewSlots({ 
        tokenId: selectedToken.id, 
        newSlots,
        originUrl: window.location.origin
      });
      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Novos horários enviados com sucesso! O aluno já foi notificado no WhatsApp da escola.' });
      setSelectedToken(null);
      setNewSlots([]);
    } catch (err: any) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>;
  }

  if (tokens.length === 0) {
    return (
      <div className="bg-white rounded-[32px] p-8 text-center ring-1 ring-zinc-950/5 shadow-sm">
        <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-zinc-300" />
        </div>
        <p className="text-zinc-500 font-medium">Não há reposições pendentes ou rejeitadas no momento.</p>
      </div>
    );
  }

  const rejectedTokens = tokens.filter(t => t.status === 'rejected_slots');
  const pendingTokens = tokens.filter(t => t.status === 'pending');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Lista de Alunos Pendentes */}
      <div className="bg-white rounded-[32px] p-6 shadow-sm ring-1 ring-zinc-950/5">
        {rejectedTokens.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold display-font mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Rejeitaram as Opções (Necessita Ação)
            </h3>
            
            <div className="space-y-3">
              {rejectedTokens.map(token => (
                <button
                  key={token.id}
                  onClick={() => setSelectedToken(token)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    selectedToken?.id === token.id 
                    ? 'border-amber-500 bg-amber-50' 
                    : 'border-zinc-100 hover:border-amber-200 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-zinc-900">{token.studentName}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                      Falta de {token.teacherName}
                    </span>
                  </div>
                  {token.studentObservation ? (
                    <p className="text-sm text-zinc-600 bg-white/50 p-2 rounded-xl italic">"{token.studentObservation}"</p>
                  ) : (
                    <p className="text-sm text-zinc-500 italic">Nenhuma observação informada.</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Pendentes */}
        {pendingTokens.length > 0 && (
          <div>
            <h3 className="text-lg font-bold display-font mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Aguardando o Aluno Agendar
            </h3>
            
            <div className="space-y-3">
              {pendingTokens.map(token => (
                <div
                  key={token.id}
                  className="w-full text-left p-4 rounded-2xl border-2 border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2"
                >
                  <div>
                    <span className="font-bold text-zinc-900 flex items-center gap-2">
                      <User className="w-4 h-4 text-zinc-400" />
                      {token.studentName}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2 py-1 rounded-full whitespace-nowrap self-start sm:self-auto">
                    Falta de {token.teacherName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Painel de Cadastro de Novos Horários */}
      {selectedToken && (
        <div className="bg-white rounded-[32px] p-6 shadow-sm ring-1 ring-zinc-950/5 border-2 border-amber-100 place-self-start w-full">
          <h3 className="text-lg font-bold display-font mb-4">
            Novos Horários para {selectedToken.studentName}
          </h3>
          <p className="text-sm text-zinc-500 mb-6">
            Os horários adicionados abaixo serão atrelados à ausência e um novo link será enviado ao aluno no WhatsApp.
          </p>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Data</label>
              <input 
                type="date"
                value={tempSlot.date}
                onChange={(e) => setTempSlot({...tempSlot, date: e.target.value})}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Hora</label>
              <input 
                type="time"
                value={tempSlot.time}
                onChange={(e) => setTempSlot({...tempSlot, time: e.target.value})}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Vagas</label>
              <input 
                type="number"
                min="1"
                value={tempSlot.maxCapacity}
                onChange={(e) => setTempSlot({...tempSlot, maxCapacity: Number(e.target.value)})}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
          
          <button 
            type="button"
            onClick={addCustomSlot}
            className="w-full mb-6 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Adicionar Opção
          </button>

          <div className="space-y-2 mb-8">
            {newSlots.map((slot, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <div>
                  <span className="font-bold text-sm text-zinc-900 block">{slot.dateLabel}</span>
                  <span className="text-xs text-zinc-500">{slot.time} • {slot.maxCapacity} vaga(s)</span>
                </div>
                <button onClick={() => removeSlot(idx)} className="text-red-500 hover:text-red-600 text-xs font-bold p-2 hover:bg-red-50 rounded-lg">
                  Remover
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || newSlots.length === 0}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Confirmar e Enviar Link
          </button>
        </div>
      )}
      <FeedbackModal
        isOpen={feedback.isOpen}
        onClose={() => setFeedback({ ...feedback, isOpen: false })}
        title={feedback.title}
        message={feedback.message}
        type={feedback.type}
      />
    </div>
  );
}
