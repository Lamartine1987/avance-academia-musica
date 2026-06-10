import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, SchoolAgendaEvent, Teacher, Student } from '../types';
import { CalendarDays, Plus, Trash2, X, Loader2, ChevronLeft, ChevronRight, Settings, Users, Music, Video, Mic, Star, Search } from 'lucide-react';
import { format, addDays, subDays, isSameDay, parseISO, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import FeedbackModal from './FeedbackModal';

interface SchoolAgendaProps {
  profile: UserProfile;
}

export default function SchoolAgenda({ profile }: SchoolAgendaProps) {
  const [events, setEvents] = useState<SchoolAgendaEvent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [allowedTeacherIds, setAllowedTeacherIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [feedback, setFeedback] = useState<{isOpen: boolean, type: 'success'|'error'|'warning', title: string, message: string}>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });
  
  // Modals
  const [showEventForm, setShowEventForm] = useState(false);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SchoolAgendaEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<SchoolAgendaEvent | null>(null);

  // Config States
  const [startHour, setStartHour] = useState(7);
  const [endHour, setEndHour] = useState(22);
  const [visibleDays, setVisibleDays] = useState([1, 2, 3, 4, 5, 6]);

  const HOURS = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);
  const timeSlots = HOURS.map(h => `${h.toString().padStart(2, '0')}:00`);
  
  // Form State
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('workshop');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [description, setDescription] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Event Types
  const defaultEventTypes = [
    { id: 'workshop', name: 'Workshop / Oficina', color: 'blue', icon: 'users' },
    { id: 'audition', name: 'Audição', color: 'purple', icon: 'mic' },
    { id: 'recording', name: 'Gravação', color: 'red', icon: 'video' },
    { id: 'rehearsal', name: 'Ensaio', color: 'orange', icon: 'music' },
    { id: 'other', name: 'Outro', color: 'emerald', icon: 'star' }
  ];
  const [eventTypes, setEventTypes] = useState(defaultEventTypes);
  const [showEventTypesModal, setShowEventTypesModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('blue');

  const isAdmin = profile.role === 'admin';

  useEffect(() => {
    // Fetch Events
    const q = profile.role === 'student' 
      ? query(collection(db, 'school_agenda_events'), where('studentIds', 'array-contains', profile.studentId || 'none'))
      : query(collection(db, 'school_agenda_events'));
      
    const unsubscribeEvents = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolAgendaEvent)));
      setLoading(false);
    });

    // Fetch Teachers
    const unsubscribeTeachers = onSnapshot(collection(db, 'teachers'), (snap) => {
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
    });

    // Fetch Students (only for admins and teachers)
    let unsubscribeStudents: (() => void) | undefined;
    if (profile.role !== 'student') {
      unsubscribeStudents = onSnapshot(collection(db, 'students'), (snap) => {
        setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).filter(s => s.status === 'active'));
      });
    }

    // Fetch Permissions and Types
    const fetchSettings = async () => {
      const permsSnap = await getDoc(doc(db, 'settings', 'school_agenda_permissions'));
      if (permsSnap.exists()) {
        const data = permsSnap.data();
        if (data.allowedTeacherIds) {
          setAllowedTeacherIds(data.allowedTeacherIds);
        }
        if (data.config) {
          setStartHour(data.config.startHour ?? 7);
          setEndHour(data.config.endHour ?? 22);
          setVisibleDays(data.config.visibleDays ?? [1, 2, 3, 4, 5, 6]);
        }
      }
    };
    fetchSettings();

    const unsubTypes = onSnapshot(doc(db, 'settings', 'school_agenda_types'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().types) {
        setEventTypes(docSnap.data().types);
      } else {
        setEventTypes(defaultEventTypes);
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeTeachers();
      if (unsubscribeStudents) unsubscribeStudents();
      unsubTypes();
    };
  }, []);

  const handleSaveSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'school_agenda_permissions'), {
        allowedTeacherIds,
        config: { startHour, endHour, visibleDays }
      });
      setShowSettingsForm(false);
      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Configurações salvas com sucesso!' });
    } catch (err) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar configurações.' });
    }
  };

  const handleToggleTeacherPermission = (teacherId: string) => {
    setAllowedTeacherIds(prev => 
      prev.includes(teacherId) 
        ? prev.filter(id => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const resetForm = () => {
    setSelectedEvent(null);
    setTitle('');
    setEventType(eventTypes[0]?.id || 'workshop');
    setDate(format(currentDate, 'yyyy-MM-dd'));
    setEndDate(format(currentDate, 'yyyy-MM-dd'));
    setStartTime('14:00');
    setEndTime('15:00');
    setDescription('');
    setSelectedStudentIds([]);
    setSelectedTeacherIds([]);
    setParticipantSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !startTime || !endTime) return;

    setIsSubmitting(true);
    try {
      const eventData = {
        title,
        eventType,
        date,
        endDate: endDate || date,
        startTime,
        endTime,
        description,
        studentIds: selectedStudentIds,
        teacherIds: selectedTeacherIds,
      };

      if (selectedEvent) {
        await updateDoc(doc(db, 'school_agenda_events', selectedEvent.id), eventData);
      } else {
        await addDoc(collection(db, 'school_agenda_events'), {
          ...eventData,
          createdAt: serverTimestamp()
        });
      }
      setShowEventForm(false);
      resetForm();
      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: selectedEvent ? 'Evento atualizado!' : 'Evento criado!' });
    } catch (err) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar evento.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;
    try {
      await deleteDoc(doc(db, 'school_agenda_events', eventToDelete.id));
      setEventToDelete(null);
      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Evento excluído.' });
    } catch (err) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao excluir evento.' });
    }
  };

  const openEditModal = (event: SchoolAgendaEvent) => {
    if (profile.role === 'student') return;
    if (!isAdmin && profile.role !== 'teacher') return;
    setSelectedEvent(event);
    setTitle(event.title);
    setEventType(event.eventType);
    setDate(event.date);
    setEndDate(event.endDate || event.date);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setDescription(event.description || '');
    setSelectedStudentIds(event.studentIds || []);
    setSelectedTeacherIds(event.teacherIds || []);
    setParticipantSearch('');
    setShowEventForm(true);
  };

  const saveEventTypes = async (newTypes: any[]) => {
    try {
      await setDoc(doc(db, 'settings', 'school_agenda_types'), { types: newTypes });
    } catch (err) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar tipos de evento.' });
    }
  };

  const handleAddEventType = async () => {
    if (!newTypeName) return;
    const newId = newTypeName.toLowerCase().replace(/\s+/g, '_');
    const newType = {
      id: newId,
      name: newTypeName,
      color: newTypeColor,
      icon: 'star'
    };
    const updated = [...eventTypes, newType];
    await saveEventTypes(updated);
    setNewTypeName('');
    setEventType(newId);
    setShowEventTypesModal(false);
  };

  const handleDeleteEventType = async (id: string) => {
    const updated = eventTypes.filter(t => t.id !== id);
    await saveEventTypes(updated);
    if (eventType === id) setEventType(updated[0]?.id || 'workshop');
  };

  const getEventIcon = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    if (!type) return <Star className="w-5 h-5" />;
    switch(type.icon) {
      case 'users': return <Users className="w-5 h-5" />;
      case 'mic': return <Mic className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'music': return <Music className="w-5 h-5" />;
      default: return <Star className="w-5 h-5" />;
    }
  };

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleToggleTeacher = (teacherId: string) => {
    setSelectedTeacherIds(prev => 
      prev.includes(teacherId) 
        ? prev.filter(id => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(participantSearch.toLowerCase()) ||
    s.enrollments?.some(e => e.instrument.toLowerCase().includes(participantSearch.toLowerCase()))
  );

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(participantSearch.toLowerCase()) ||
    t.instruments?.some(i => i.toLowerCase().includes(participantSearch.toLowerCase()))
  );

  const getEventColor = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    const colorName = type?.color || 'emerald';
    switch (colorName) {
      case 'blue': return 'bg-blue-100 border-blue-300 text-blue-900';
      case 'purple': return 'bg-purple-100 border-purple-300 text-purple-900';
      case 'red': return 'bg-red-100 border-red-300 text-red-900';
      case 'orange': return 'bg-orange-100 border-orange-300 text-orange-900';
      case 'fuchsia': return 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900';
      case 'cyan': return 'bg-cyan-100 border-cyan-300 text-cyan-900';
      default: return 'bg-emerald-100 border-emerald-300 text-emerald-900';
    }
  };

  const getEventTypeName = (typeId: string) => {
    const type = eventTypes.find(t => t.id === typeId);
    return type?.name || 'Outro';
  };

  const todayEvents = events.filter(e => e.date === format(currentDate, 'yyyy-MM-dd'));

  // Weekly mini calendar
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(day => visibleDays.includes(day.getDay()));

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Check access for teachers and students
  const isTeacherWithAccess = profile.role === 'teacher' && allowedTeacherIds.includes(profile.teacherId || '');
  if (!isAdmin && profile.role !== 'student' && !isTeacherWithAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CalendarDays className="w-16 h-16 text-zinc-300 mb-4" />
        <h2 className="text-xl font-bold text-zinc-900">Acesso Restrito</h2>
        <p className="text-zinc-500 mt-2">Você não tem permissão para visualizar a agenda de eventos da escola.</p>
      </div>
    );
  }

  return (
    <>
      <FeedbackModal 
        isOpen={feedback.isOpen} 
        onClose={() => setFeedback(prev => ({ ...prev, isOpen: false }))}
        title={feedback.title}
        message={feedback.message}
        type={feedback.type}
      />
      <div className="w-full h-[calc(100vh-80px)] md:h-[calc(100vh-100px)] flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl ring-1 ring-zinc-950/5 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold display-font text-zinc-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-500" /> Agenda de Eventos da Escola
          </h2>
          <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
            Organize horários para workshops, audições, gravações e ensaios gerais.
          </p>
        </div>
        
        {isAdmin && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button 
              onClick={() => setShowSettingsForm(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-zinc-100 text-zinc-700 px-6 py-3 rounded-2xl hover:bg-zinc-200 transition-all font-bold whitespace-nowrap"
            >
              <Settings className="w-5 h-5" /> Configurações
            </button>
            <button 
              onClick={() => { resetForm(); setShowEventForm(true); }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-3 rounded-2xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 font-bold whitespace-nowrap"
            >
              <Plus className="w-5 h-5" /> Novo Evento
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl ring-1 ring-zinc-950/5 shadow-sm overflow-hidden flex flex-col flex-1">
        {/* Header / Week Picker */}
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentDate(subDays(currentDate, 7))} className="p-2 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h3 className="text-xl font-bold text-zinc-900 capitalize">
                {format(weekStart, "d 'de' MMMM", { locale: ptBR })} - {format(weekEnd, "d 'de' MMMM", { locale: ptBR })}
              </h3>
              <p className="text-sm text-zinc-500">{format(currentDate, 'yyyy')}</p>
            </div>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-2 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Timeline Grid (Week View like Schedule.tsx) */}
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-white">
          <div className="min-w-[800px] h-full flex flex-col">
            {/* Header */}
            <div className="grid border-b border-zinc-100" style={{ gridTemplateColumns: `100px repeat(${timeSlots.length}, minmax(180px, 1fr))` }}>
              <div className="sticky left-0 z-20 p-4 border-r border-zinc-100 bg-zinc-50 flex flex-col items-center justify-center shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)]">
                <CalendarDays className="w-5 h-5 text-zinc-400 opacity-50" />
              </div>
              {timeSlots.map((time, idx) => (
                <div key={idx} className="p-4 text-center border-r border-zinc-100 last:border-r-0 bg-zinc-50/50 flex flex-col items-center justify-center">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Horário</p>
                  <p className="text-sm font-bold text-black">{time}</p>
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="relative">
              {weekDays.map((day, dayIdx) => (
                <div key={dayIdx} className="grid border-b border-zinc-50 last:border-b-0 group" style={{ gridTemplateColumns: `100px repeat(${timeSlots.length}, minmax(180px, 1fr))` }}>
                  <div className={cn(
                    "sticky left-0 z-20 p-4 border-r border-zinc-100 text-[10px] font-bold text-center flex flex-col items-center justify-center shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]",
                    isSameDay(day, new Date()) ? "bg-indigo-500 text-white" : "bg-white text-black"
                  )}>
                    <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">
                      {format(day, 'eee', { locale: ptBR })}
                    </p>
                    <p className="text-lg font-bold mt-0.5 mb-1">
                      {format(day, 'dd')}
                    </p>
                  </div>
                  {timeSlots.map((time, timeIdx) => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const cellHour = parseInt(time.split(':')[0], 10);
                    const dayEvents = events.filter(e => {
                      const startD = e.date;
                      const endD = e.endDate || e.date;
                      const isDateInRange = dayStr >= startD && dayStr <= endD;
                      if (!isDateInRange) return false;
                      const evStartHour = parseInt(e.startTime.split(':')[0], 10);
                      const evEndHour = parseInt(e.endTime.split(':')[0], 10);
                      
                      if (evStartHour === evEndHour) return cellHour === evStartHour;
                      return cellHour >= evStartHour && cellHour < evEndHour;
                    });

                    return (
                      <div 
                        key={timeIdx} 
                        className="p-2 border-r border-zinc-100 last:border-r-0 min-h-[110px] relative transition-colors select-none flex flex-col gap-1 group-hover:bg-zinc-50/20 hover:bg-zinc-100/50"
                      >
                        {dayEvents.map(event => {
                          return (
                            <div 
                              key={event.id}
                              onClick={() => openEditModal(event)}
                              className={cn(
                                "w-full rounded-2xl p-3 border shadow-sm transition-all overflow-hidden flex flex-col relative group/event",
                                isAdmin && "cursor-pointer hover:shadow-md hover:scale-[1.02]",
                                getEventColor(event.eventType)
                              )}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-1.5 font-bold text-sm">
                                  {getEventIcon(event.eventType)}
                                  <span className="truncate">{event.title}</span>
                                </div>
                                {isAdmin && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEventToDelete(event); }}
                                    className="p-1 rounded bg-white/50 hover:bg-white transition-colors opacity-0 group-hover/event:opacity-100 shrink-0 ml-1"
                                    title="Excluir evento"
                                  >
                                    <Trash2 className="w-3 h-3 opacity-70" />
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] font-semibold opacity-80 flex items-center gap-1">
                                <span>{event.startTime} - {event.endTime}</span>
                              </div>
                              <span className="uppercase tracking-wider text-[9px] mt-1 font-bold">{getEventTypeName(event.eventType)}</span>
                              {event.description && (
                                <p className="text-[10px] mt-1 opacity-70 italic line-clamp-2 leading-tight">
                                  {event.description}
                                </p>
                              )}
                              {((event.studentIds && event.studentIds.length > 0) || (event.teacherIds && event.teacherIds.length > 0)) && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {event.studentIds && event.studentIds.length > 0 && (
                                    <div className="flex items-center gap-1 opacity-80 bg-black/10 w-fit px-1.5 py-0.5 rounded text-[9px] font-bold">
                                      <Users className="w-3 h-3" /> {event.studentIds.length} aluno(s)
                                    </div>
                                  )}
                                  {event.teacherIds && event.teacherIds.length > 0 && (
                                    <div className="flex items-center gap-1 opacity-80 bg-black/10 w-fit px-1.5 py-0.5 rounded text-[9px] font-bold">
                                      <Music className="w-3 h-3" /> {event.teacherIds.length} prof(s)
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowSettingsForm(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <h3 className="text-2xl font-bold display-font text-zinc-900">Configurações da Agenda</h3>
                <p className="text-zinc-500 text-sm mt-1">Personalize os dias de funcionamento e as permissões de visualização.</p>
              </div>

              <div className="space-y-8 mb-8">
                {/* Display settings */}
                <div>
                  <h4 className="font-bold text-lg text-zinc-900 border-b border-zinc-100 pb-2 mb-4">Grade de Horários</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Hora de Início da Grade</label>
                      <select 
                        value={startHour} 
                        onChange={e => setStartHour(Number(e.target.value))} 
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                      >
                        {Array.from({length: 24}, (_, i) => <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Hora de Término da Grade</label>
                      <select 
                        value={endHour} 
                        onChange={e => setEndHour(Number(e.target.value))} 
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                      >
                        {Array.from({length: 24}, (_, i) => <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00`}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2 ml-1">Dias Visíveis</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[0,1,2,3,4,5,6].map(day => {
                        const dayName = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][day];
                        const isChecked = visibleDays.includes(day);
                        return (
                          <label key={day} className={cn("flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all select-none", isChecked ? "bg-indigo-50 border-indigo-200" : "bg-white border-zinc-200 hover:border-indigo-100")}>
                            <input 
                              type="checkbox" 
                              className="hidden" 
                              checked={isChecked} 
                              onChange={() => {
                                setVisibleDays(prev => isChecked ? prev.filter(d => d !== day) : [...prev, day].sort());
                              }} 
                            />
                            <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0", isChecked ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300")}>
                              {isChecked && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-sm font-bold text-zinc-700">{dayName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Permissions */}
                <div>
                  <h4 className="font-bold text-lg text-zinc-900 border-b border-zinc-100 pb-2 mb-4">Permissões de Professores</h4>
                  <p className="text-sm text-zinc-500 mb-3">Selecione quais professores têm acesso de leitura a esta agenda.</p>
                  <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                    {teachers.map(teacher => {
                      const isAllowed = allowedTeacherIds.includes(teacher.id);
                      return (
                        <div 
                          key={teacher.id}
                          onClick={() => handleToggleTeacherPermission(teacher.id)}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all",
                            isAllowed ? "bg-indigo-50 border-indigo-200" : "bg-white border-zinc-200 hover:border-indigo-200"
                          )}
                        >
                          <div>
                            <p className="font-bold text-zinc-900">{teacher.name}</p>
                            <p className="text-xs text-zinc-500">{teacher.email}</p>
                          </div>
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                            isAllowed ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300"
                          )}>
                            {isAllowed && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-100">
                <button
                  onClick={handleSaveSettings}
                  className="w-full sm:w-auto bg-indigo-500 text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
                >
                  Salvar Configurações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Form Modal */}
      <AnimatePresence>
        {showEventForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-6 sm:p-8 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowEventForm(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                  <CalendarDays className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">{selectedEvent ? 'Editar Evento' : 'Novo Evento da Escola'}</h3>
                <p className="text-zinc-500 text-sm mt-1">Reserve horários na agenda exclusiva da escola.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Título do Evento</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    placeholder="Ex: Ensaio Banda X"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-end mb-1">
                      <label className="block text-sm font-medium text-zinc-700 ml-1">Tipo de Evento</label>
                      {isAdmin && (
                        <button type="button" onClick={() => setShowEventTypesModal(true)} className="text-xs text-indigo-500 hover:text-indigo-600 font-bold">
                          Gerenciar Tipos
                        </button>
                      )}
                    </div>
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    >
                      {eventTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Data Início</label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Data Fim</label>
                      <input
                        type="date"
                        required
                        value={endDate}
                        min={date}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Horário Início</label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Horário Fim</label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Descrição (Opcional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all h-24 resize-none"
                    placeholder="Detalhes adicionais, equipamentos necessários, etc..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Participantes (Alunos e Professores)</label>
                  <p className="text-xs text-zinc-500 ml-1 mb-2">Busque e selecione quem participará ou poderá visualizar este evento.</p>
                  
                  <div className="relative mb-3">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-zinc-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar por nome ou instrumento..."
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto pr-2 space-y-4 bg-zinc-50/80 rounded-2xl border border-zinc-200 p-3">
                    {/* Lista de Alunos */}
                    <div>
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Alunos</h4>
                      {filteredStudents.length === 0 ? (
                        <p className="text-sm text-zinc-400 italic ml-1">Nenhum aluno encontrado.</p>
                      ) : (
                        <div className="space-y-1">
                          {filteredStudents.map(student => {
                            const isSelected = selectedStudentIds.includes(student.id);
                            const instruments = student.enrollments?.map(e => e.instrument).join(', ') || 'Sem instrumento';
                            return (
                              <div 
                                key={`student-${student.id}`}
                                onClick={() => handleToggleStudent(student.id)}
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all",
                                  isSelected ? "bg-indigo-100/50" : "hover:bg-white"
                                )}
                              >
                                <div className={cn(
                                  "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                                  isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300 bg-white"
                                )}>
                                  {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-zinc-700 block">{student.name}</span>
                                  <span className="text-[10px] text-zinc-500 block">{instruments}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Lista de Professores */}
                    <div>
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Professores</h4>
                      {filteredTeachers.length === 0 ? (
                        <p className="text-sm text-zinc-400 italic ml-1">Nenhum professor encontrado.</p>
                      ) : (
                        <div className="space-y-1">
                          {filteredTeachers.map(teacher => {
                            const isSelected = selectedTeacherIds.includes(teacher.id);
                            const instruments = teacher.instruments?.join(', ') || 'Sem instrumento';
                            return (
                              <div 
                                key={`teacher-${teacher.id}`}
                                onClick={() => handleToggleTeacher(teacher.id)}
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all",
                                  isSelected ? "bg-indigo-100/50" : "hover:bg-white"
                                )}
                              >
                                <div className={cn(
                                  "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                                  isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300 bg-white"
                                )}>
                                  {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-zinc-700 block">{teacher.name}</span>
                                  <span className="text-[10px] text-zinc-500 block">{instruments}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center gap-3 border-t border-zinc-100 mt-6">
                  <div>
                    {selectedEvent && isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setShowEventForm(false); setEventToDelete(selectedEvent); }}
                        className="px-6 py-3 rounded-2xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> Excluir
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEventForm(false)}
                      className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-indigo-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 flex items-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (selectedEvent ? 'Atualizar' : 'Salvar')}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Types Management Modal */}
      <AnimatePresence>
        {showEventTypesModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowEventTypesModal(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <h3 className="text-2xl font-bold display-font text-zinc-900">Tipos de Evento</h3>
                <p className="text-zinc-500 text-sm mt-1">Crie ou remova categorias para a agenda escolar.</p>
              </div>

              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto pr-2">
                {eventTypes.map(type => (
                  <div key={type.id} className="flex items-center justify-between p-3 rounded-2xl border border-zinc-200">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-3 h-3 rounded-full", `bg-${type.color}-500`)} />
                      <span className="font-bold text-sm text-zinc-700">{type.name}</span>
                    </div>
                    {eventTypes.length > 1 && (
                      <button onClick={() => handleDeleteEventType(type.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-100 pt-6">
                <h4 className="text-sm font-bold text-zinc-900 mb-3">Novo Tipo</h4>
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="Nome do Tipo (ex: Reunião)"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                  />
                  <div className="flex gap-2">
                    {['blue', 'purple', 'red', 'orange', 'emerald', 'fuchsia', 'cyan'].map(c => (
                      <button
                        key={c}
                        onClick={() => setNewTypeColor(c)}
                        className={cn("w-8 h-8 rounded-full border-2 transition-all", newTypeColor === c ? "border-zinc-900 scale-110" : "border-transparent hover:scale-110", `bg-${c}-500`)}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleAddEventType}
                    disabled={!newTypeName}
                    className="mt-2 w-full bg-zinc-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Adicionar Tipo
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!eventToDelete}
        onClose={() => setEventToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Evento"
        message={`Tem certeza que deseja excluir "${eventToDelete?.title}" da agenda?`}
        confirmText="Excluir"
      />
    </div>
    </>
  );
}
