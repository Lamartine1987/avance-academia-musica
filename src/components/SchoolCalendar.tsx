import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, serverTimestamp, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, SchoolEvent } from '../types';
import { CalendarDays, Plus, Trash2, X, Loader2, Calendar as CalendarIcon, DownloadCloud, AlertTriangle, EyeOff, Eye, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';

interface SchoolCalendarProps {
  profile: UserProfile;
}

const BRAZILIAN_HOLIDAYS = [
  { date: '01-01', title: 'Confraternização Universal' },
  { date: '04-21', title: 'Tiradentes' },
  { date: '05-01', title: 'Dia do Trabalhador' },
  { date: '09-07', title: 'Independência do Brasil' },
  { date: '10-12', title: 'Nossa Sr.a Aparecida - Padroeira do Brasil' },
  { date: '11-02', title: 'Finados' },
  { date: '11-15', title: 'Proclamação da República' },
  { date: '11-20', title: 'Dia Nacional de Zumbi e da Consciência Negra' },
  { date: '12-25', title: 'Natal' }
];

export default function SchoolCalendar({ profile }: SchoolCalendarProps) {
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'holiday' | 'recess'>('holiday');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  
  const [eventToDelete, setEventToDelete] = useState<SchoolEvent | null>(null);

  const isAdmin = profile.role === 'admin';

  useEffect(() => {
    const q = query(collection(db, 'school_calendar'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolEvent)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    if (type === 'recess' && !endDate) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'school_calendar'), {
        title,
        type,
        date,
        endDate: endDate || null,
        isEnabled: true,
        description,
        createdAt: serverTimestamp()
      });
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar evento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setType('holiday');
    setDate('');
    setEndDate('');
    setDescription('');
  };

  const toggleEventStatus = async (event: SchoolEvent) => {
    try {
      await updateDoc(doc(db, 'school_calendar', event.id), {
        isEnabled: !event.isEnabled
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar status.');
    }
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;
    try {
      await deleteDoc(doc(db, 'school_calendar', eventToDelete.id));
      setEventToDelete(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir evento.');
    }
  };

  const handleImportHolidays = async () => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    setIsSubmitting(true);
    try {
      let importedCount = 0;
      for (const year of [currentYear, nextYear]) {
        for (const holiday of BRAZILIAN_HOLIDAYS) {
          const holidayDate = `${year}-${holiday.date}`;
          
          // Check if it already exists
          if (!events.some(e => e.date === holidayDate)) {
            await addDoc(collection(db, 'school_calendar'), {
              title: holiday.title,
              type: 'holiday',
              date: holidayDate,
              isEnabled: true,
              description: 'Feriado Nacional Importado',
              createdAt: serverTimestamp()
            });
            importedCount++;
          }
        }
      }
      alert(`Foram importados ${importedCount} feriados nacionais com sucesso!`);
    } catch (err) {
      console.error(err);
      alert('Erro ao importar feriados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group events by month/year for better visualization
  const upcomingEvents = events.filter(e => {
    const eDate = new Date(e.endDate || e.date + 'T12:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    return eDate >= today || !e.endDate && new Date(e.date + 'T12:00:00') >= today;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const pastEvents = events.filter(e => !upcomingEvents.includes(e));

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5">
        <div>
          <h2 className="text-2xl font-bold display-font text-zinc-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-orange-500" /> Calendário Escolar
          </h2>
          <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
            Acompanhe os feriados e períodos de recesso da instituição.
          </p>
        </div>
        
        {isAdmin && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button 
              onClick={handleImportHolidays}
              disabled={isSubmitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-6 py-3 rounded-2xl hover:bg-blue-100 transition-all font-bold whitespace-nowrap"
            >
              <DownloadCloud className="w-5 h-5" /> Importar Nacionais
            </button>
            <button 
              onClick={() => { resetForm(); setShowForm(true); }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg hover:shadow-orange-500/25 active:scale-95 font-bold whitespace-nowrap"
            >
              <Plus className="w-5 h-5" /> Novo Evento
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-xl w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowForm(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-6">
                  <CalendarDays className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">Novo Evento</h3>
                <p className="text-zinc-500 text-sm mt-1">Adicione um feriado ou período de recesso.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Título</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    placeholder="Ex: Feriado de Carnaval"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Tipo de Evento</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as 'holiday' | 'recess')}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                  >
                    <option value="holiday">Feriado (1 ou mais dias)</option>
                    <option value="recess">Recesso Escolar / Férias</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Data {endDate || type === 'recess' ? 'de Início' : ''}</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Data Final {type === 'holiday' && <span className="text-zinc-400 font-normal">(Opcional para feriados)</span>}</label>
                    <input
                      type="date"
                      required={type === 'recess'}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Descrição (Opcional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all h-24 resize-none"
                    placeholder="Detalhes adicionais sobre o recesso ou feriado..."
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-orange-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg hover:shadow-orange-500/25 active:scale-95 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Evento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {upcomingEvents.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 ml-2">Próximos Eventos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingEvents.map(event => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  isAdmin={isAdmin} 
                  onToggle={() => toggleEventStatus(event)} 
                  onDelete={() => setEventToDelete(event)} 
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white p-12 rounded-[32px] text-center border border-dashed border-zinc-200 flex flex-col items-center">
             <CalendarDays className="w-12 h-12 text-zinc-300 mb-4" />
             <h3 className="text-lg font-bold text-zinc-900">Nenhum evento futuro</h3>
             <p className="text-zinc-500 mt-2">O calendário escolar está livre de feriados e recessos próximos.</p>
          </div>
        )}

        {pastEvents.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 ml-2 mt-12">Eventos Passados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-75">
              {pastEvents.map(event => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  isAdmin={isAdmin} 
                  onToggle={() => toggleEventStatus(event)} 
                  onDelete={() => setEventToDelete(event)} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!eventToDelete}
        onClose={() => setEventToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Evento"
        message={`Tem certeza que deseja excluir "${eventToDelete?.title}" do calendário escolar?`}
        confirmText="Excluir"
      />
    </div>
  );
}

function EventCard({ event, isAdmin, onToggle, onDelete }: { event: SchoolEvent, isAdmin: boolean, onToggle: () => void, onDelete: () => void }) {
  const isRecess = event.type === 'recess';
  
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white p-6 rounded-[32px] ring-1 shadow-xl flex flex-col h-full relative overflow-hidden transition-all ${event.isEnabled ? 'ring-zinc-950/5 shadow-black/5' : 'ring-red-950/5 shadow-red-500/5 opacity-80'}`}
    >
      {!event.isEnabled && (
        <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest text-center py-1">
          Inativo - Ignorado pelo Sistema
        </div>
      )}

      <div className="flex justify-between items-start mb-4 mt-2 border-b border-zinc-100 pb-4">
        <div>
          <h3 className={`text-lg font-bold leading-tight flex items-center gap-2 ${event.isEnabled ? 'text-zinc-900' : 'text-zinc-500 line-through decoration-red-500/50'}`}>
             {event.title}
          </h3>
          <p className="text-xs text-orange-500 font-bold uppercase tracking-wider mt-1 bg-orange-50 w-fit px-2 py-0.5 rounded-lg">
            {isRecess ? 'Recesso Escolar' : 'Feriado'}
          </p>
        </div>
      </div>

      <div className="space-y-4 mb-6 flex-1">
        <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
           <div className="flex items-center gap-3 text-sm font-bold text-zinc-700">
             <CalendarIcon className="w-5 h-5 text-zinc-400" />
             {event.endDate ? (
               <span>{formatDate(event.date)} <span className="text-zinc-400 font-normal mx-1">até</span> {formatDate(event.endDate)}</span>
             ) : (
               <span>{formatDate(event.date)}</span>
             )}
           </div>
        </div>
        {event.description && (
          <p className="text-sm text-zinc-500 bg-zinc-50 p-4 rounded-2xl border border-zinc-100 italic">
            "{event.description}"
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="flex justify-between items-center text-xs font-semibold text-zinc-500 pt-4 border-t border-zinc-100 mt-auto">
          <button
            onClick={onToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${event.isEnabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
          >
            {event.isEnabled ? <><EyeOff className="w-3.5 h-3.5" /> Desativar</> : <><Eye className="w-3.5 h-3.5" /> Ativar</>}
          </button>
          
          <button
            onClick={onDelete}
            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Excluir evento"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
