import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, getDocs, setDoc, where, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, SchoolAgendaEvent, Teacher, Student } from '../types';
import { CalendarDays, Plus, Trash2, X, Loader2, ChevronLeft, ChevronRight, Settings, Users, Music, Video, Mic, Star, Search, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format, addDays, subDays, isSameDay, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, getDay, isSameMonth, isToday, addMonths, subMonths } from 'date-fns';
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
  const [filterDate, setFilterDate] = useState('');
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
  const [showRSVPModalForEvent, setShowRSVPModalForEvent] = useState<SchoolAgendaEvent | null>(null);

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

      let eventId = selectedEvent?.id;
      if (selectedEvent) {
        await updateDoc(doc(db, 'school_agenda_events', selectedEvent.id), eventData);
      } else {
        const newDoc = await addDoc(collection(db, 'school_agenda_events'), {
          ...eventData,
          createdAt: serverTimestamp()
        });
        eventId = newDoc.id;

        // Envio de WhatsApp para os alunos do evento
        if (selectedStudentIds.length > 0) {
          try {
            const setSnap = await getDoc(doc(db, 'settings', 'integrations'));
            if (setSnap.exists()) {
              const settings = setSnap.data() as any;
              const isApiz = settings.whatsappEngine === 'apiz';
              
              if ((isApiz && settings.apizUrl && settings.apizToken) || (!isApiz && settings.zapiInstance && settings.zapiToken)) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const tSnap = await getDocs(query(collection(db, 'templates'), where('type', '==', 'school_agenda_event')));
                if (!tSnap.empty) {
                  const templateDoc = tSnap.docs[0];
                  const templateData = templateDoc.data();
                  if (templateData.isAutomatic) {
                    const templateText = templateData.content;
                    const eventDateObj = new Date(date + 'T12:00:00');
                    const formattedDate = format(eventDateObj, 'dd/MM/yyyy', { locale: ptBR });
                    const timeRange = `${startTime} - ${endTime}`;

                    for (const sId of selectedStudentIds) {
                      const student = students.find(s => s.id === sId);
                      if (student && student.phone) {
                        let cleanedPhone = student.phone.replace(/\D/g, '');
                        // Adicionar 55 se não tiver
                        if (cleanedPhone.length === 10 || cleanedPhone.length === 11) {
                          cleanedPhone = `55${cleanedPhone}`;
                        }

                        if (cleanedPhone.length >= 12) {
                          const firstName = student.name.split(' ')[0];
                          const linkConfirmacao = `${window.location.origin}/rsvp?e=${eventId}&s=${sId}`;
                          const msg = templateText
                            .replace(/{aluno}/g, firstName)
                            .replace(/{evento}/g, title)
                            .replace(/{data}/g, formattedDate)
                            .replace(/{horario}/g, timeRange)
                            .replace(/{link_confirmacao}/g, linkConfirmacao);
                            
                          const sendToAPI = async (phoneToTry: string) => {
                             if (isApiz) {
                               const baseUrl = settings.apizUrl.replace(/\/send-text\/?$/, '').replace(/\/$/, '');
                               const endpoint = `${baseUrl}/send-text`;
                               const payload = {
                                    instanceName: settings.apizInstanceName || 'teste-crm',
                                    number: phoneToTry,
                                    text: msg
                               };
                               return fetch(endpoint, {
                                 method: 'POST',
                                 headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': settings.apizToken || ''
                                 },
                                 body: JSON.stringify(payload)
                               });
                             } else {
                               const endpoint = `https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`;
                               const headers: any = { 'Content-Type': 'application/json' };
                               if (settings.zapiSecurityToken) {
                                 headers['Client-Token'] = settings.zapiSecurityToken;
                               }
                               const payload = {
                                   phone: phoneToTry,
                                   message: msg
                               };
                               return fetch(endpoint, {
                                 method: 'POST',
                                 headers: headers,
                                 body: JSON.stringify(payload)
                               });
                             }
                          };

                          sendToAPI(cleanedPhone)
                            .then(async (res) => {
                              if (!res.ok) {
                                // Fallback: try adding/removing 9th digit se falhar
                                let altPhone = '';
                                if (cleanedPhone.length === 13) {
                                  // remove 9th digit (index 4) -> '5581' + '99694866'
                                  altPhone = cleanedPhone.substring(0, 4) + cleanedPhone.substring(5);
                                } else if (cleanedPhone.length === 12) {
                                  // add 9th digit -> '5581' + '9' + '99694866'
                                  altPhone = cleanedPhone.substring(0, 4) + '9' + cleanedPhone.substring(4);
                                }
                                if (altPhone) {
                                  console.log(`[WhatsApp Fallback] Retrying with ${altPhone} for student ${student.name}`);
                                  await sendToAPI(altPhone);
                                }
                              }
                            })
                            .catch(err => console.error("Event WS Error:", err));
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("Erro ao enviar whatsapp para alunos do evento:", err);
          }
        }
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

  // Calendar configuration
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStartDate = new Date(monthStart);
  calStartDate.setDate(calStartDate.getDate() - getDay(monthStart));
  const calEndDate = new Date(monthEnd);
  calEndDate.setDate(calEndDate.getDate() + (6 - getDay(monthEnd)));

  const calendarDays = eachDayOfInterval({
      start: calStartDate,
      end: calEndDate
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const onDateClick = (day: Date) => {
      const formatted = format(day, 'yyyy-MM-dd');
      setFilterDate(filterDate === formatted ? '' : formatted);
  };

  // Apply date filter
  const filteredEvents = events.filter(e => {
    if (!filterDate) return true;
    const fDate = new Date(filterDate + 'T12:00:00');
    const start = new Date(e.date + 'T12:00:00');
    const end = new Date((e.endDate || e.date) + 'T12:00:00');
    fDate.setHours(0,0,0,0);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    return fDate >= start && fDate <= end;
  });

  // Group events by upcoming/past
  const upcomingEvents = filteredEvents.filter(e => {
    const eDate = new Date((e.endDate || e.date) + 'T12:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    return eDate >= today;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const pastEvents = filteredEvents.filter(e => !upcomingEvents.includes(e));

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

  const handleRSVP = async (eventId: string, newStatus: 'confirmed' | 'declined') => {
    if (profile.role !== 'student' || !profile.studentId) return;
    try {
      const eventRef = doc(db, 'school_agenda_events', eventId);
      if (newStatus === 'confirmed') {
        await updateDoc(eventRef, {
          confirmedStudentIds: arrayUnion(profile.studentId),
          declinedStudentIds: arrayRemove(profile.studentId)
        });
      } else {
        await updateDoc(eventRef, {
          declinedStudentIds: arrayUnion(profile.studentId),
          confirmedStudentIds: arrayRemove(profile.studentId)
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao atualizar presença.' });
    }
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5 h-max sticky top-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-zinc-900 capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={prevMonth} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={nextMonth} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-zinc-400 py-2">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                const isSelected = filterDate === format(day, 'yyyy-MM-dd');
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isTodayDate = isToday(day);
                
                const dayHasEvent = events.some(e => {
                  const start = new Date(e.date + 'T12:00:00');
                  const end = new Date((e.endDate || e.date) + 'T12:00:00');
                  start.setHours(0,0,0,0);
                  end.setHours(0,0,0,0);
                  const checkDay = new Date(day);
                  checkDay.setHours(0,0,0,0);
                  return checkDay >= start && checkDay <= end;
                });

                return (
                  <button
                    key={idx}
                    onClick={() => onDateClick(day)}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-2xl text-sm font-semibold relative transition-all",
                      !isCurrentMonth ? 'text-zinc-300' : 'text-zinc-700 hover:bg-zinc-100',
                      isSelected ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-md shadow-indigo-500/20' : '',
                      isTodayDate && !isSelected ? 'text-indigo-600 bg-indigo-50' : ''
                    )}
                  >
                    <span>{format(day, 'd')}</span>
                    {dayHasEvent && (
                      <div className={cn("absolute bottom-1.5 w-1.5 h-1.5 rounded-full", isSelected ? 'bg-white' : 'bg-indigo-400')} />
                    )}
                  </button>
                );
              })}
            </div>
            {filterDate && (
              <button 
                onClick={() => setFilterDate('')}
                className="mt-6 w-full py-3 text-sm font-bold text-zinc-500 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                Limpar Filtro
              </button>
            )}
          </div>
        </div>

        {/* Events List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-8">
            {upcomingEvents.length > 0 ? (
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 ml-2">Próximos Eventos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {upcomingEvents.map(event => (
                    <AgendaEventCard 
                      key={event.id} 
                      event={event} 
                      isAdmin={isAdmin}
                      profile={profile}
                      onEdit={() => openEditModal(event)}
                      onDelete={() => setEventToDelete(event)}
                      onRSVP={handleRSVP}
                      onViewRSVP={() => setShowRSVPModalForEvent(event)}
                      colorClass={getEventColor(event.eventType)}
                      icon={getEventIcon(event.eventType)}
                      typeName={getEventTypeName(event.eventType)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-[32px] text-center border border-dashed border-zinc-200 flex flex-col items-center">
                 <CalendarDays className="w-12 h-12 text-zinc-300 mb-4" />
                 <h3 className="text-lg font-bold text-zinc-900">Nenhum evento encontrado</h3>
                 <p className="text-zinc-500 mt-2">A agenda está livre no período selecionado.</p>
              </div>
            )}

            {pastEvents.length > 0 && (
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 ml-2 mt-12">Eventos Passados</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-75">
                  {pastEvents.map(event => (
                    <AgendaEventCard 
                      key={event.id} 
                      event={event} 
                      isAdmin={isAdmin}
                      profile={profile}
                      onEdit={() => openEditModal(event)}
                      onDelete={() => setEventToDelete(event)}
                      onRSVP={handleRSVP}
                      onViewRSVP={() => setShowRSVPModalForEvent(event)}
                      colorClass={getEventColor(event.eventType)}
                      icon={getEventIcon(event.eventType)}
                      typeName={getEventTypeName(event.eventType)}
                    />
                  ))}
                </div>
              </div>
            )}
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
                <fieldset disabled={!isAdmin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Título do Evento</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium disabled:opacity-70"
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
                            const isConfirmed = selectedEvent?.confirmedStudentIds?.includes(student.id);
                            const isDeclined = selectedEvent?.declinedStudentIds?.includes(student.id);

                            return (
                              <div 
                                key={`student-${student.id}`}
                                onClick={() => isAdmin && handleToggleStudent(student.id)}
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-xl transition-all",
                                  isAdmin ? "cursor-pointer" : "cursor-default",
                                  isSelected ? "bg-indigo-100/50" : (isAdmin ? "hover:bg-white" : "")
                                )}
                              >
                                <div className={cn(
                                  "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                                  isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300 bg-white"
                                )}>
                                  {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div className="flex-1">
                                  <span className="text-sm font-medium text-zinc-700 block">{student.name}</span>
                                  <span className="text-[10px] text-zinc-500 block">{instruments}</span>
                                </div>
                                {isSelected && selectedEvent && (
                                  <div className="shrink-0 flex items-center">
                                    {isConfirmed ? (
                                      <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-lg" title="Presença Confirmada">
                                        <CheckCircle2 className="w-3 h-3" /> Conf
                                      </div>
                                    ) : isDeclined ? (
                                      <div className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-lg" title="Ausência Registrada">
                                        <XCircle className="w-3 h-3" /> Aus
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-lg" title="Pendente">
                                        <Clock className="w-3 h-3" /> Pen
                                      </div>
                                    )}
                                  </div>
                                )}
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
                                onClick={() => isAdmin && handleToggleTeacher(teacher.id)}
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-xl transition-all",
                                  isAdmin ? "cursor-pointer" : "cursor-default",
                                  isSelected ? "bg-indigo-100/50" : (isAdmin ? "hover:bg-white" : "")
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

                </fieldset>
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
                      {isAdmin ? 'Cancelar' : 'Fechar'}
                    </button>
                    {isAdmin && (
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-indigo-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 flex items-center gap-2"
                      >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (selectedEvent ? 'Atualizar' : 'Salvar')}
                      </button>
                    )}
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

      <AnimatePresence>
        {showRSVPModalForEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-6 max-w-md w-full shadow-2xl relative max-h-[80vh] flex flex-col"
            >
              <button
                onClick={() => setShowRSVPModalForEvent(null)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="mb-6 pr-8">
                <h3 className="text-xl font-bold text-zinc-900">Confirmações</h3>
                <p className="text-sm text-zinc-500 mt-1 truncate">{showRSVPModalForEvent.title}</p>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {showRSVPModalForEvent.studentIds?.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">Nenhum aluno convidado.</p>
                ) : (
                  showRSVPModalForEvent.studentIds?.map(sId => {
                    const student = students.find(s => s.id === sId);
                    if (!student) return null;
                    const isConfirmed = showRSVPModalForEvent.confirmedStudentIds?.includes(sId);
                    const isDeclined = showRSVPModalForEvent.declinedStudentIds?.includes(sId);
                    
                    return (
                      <div key={sId} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <span className="text-sm font-medium text-zinc-700">{student.name}</span>
                        <div className="shrink-0 ml-2">
                          {isConfirmed ? (
                            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-lg">
                              <CheckCircle2 className="w-3 h-3" /> Conf
                            </div>
                          ) : isDeclined ? (
                            <div className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-lg">
                              <XCircle className="w-3 h-3" /> Aus
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-lg">
                              <Clock className="w-3 h-3" /> Pen
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

function AgendaEventCard({ 
  event, 
  isAdmin, 
  profile,
  onEdit, 
  onDelete, 
  onRSVP,
  onViewRSVP,
  colorClass, 
  icon, 
  typeName 
}: { 
  event: SchoolAgendaEvent, 
  isAdmin: boolean, 
  profile?: UserProfile,
  onEdit: () => void, 
  onDelete: () => void, 
  onRSVP?: (eventId: string, newStatus: 'confirmed' | 'declined') => void,
  onViewRSVP?: () => void,
  colorClass: string, 
  icon: React.ReactNode, 
  typeName: string 
}) {
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const isStudentInvited = profile?.role === 'student' && profile.studentId && event.studentIds?.includes(profile.studentId);
  const studentRSVPStatus = isStudentInvited 
    ? (event.confirmedStudentIds?.includes(profile.studentId!) ? 'confirmed' : 
       event.declinedStudentIds?.includes(profile.studentId!) ? 'declined' : 'pending')
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-6 rounded-[32px] ring-1 shadow-xl flex flex-col h-full relative overflow-hidden transition-all ring-zinc-950/5 shadow-black/5 bg-white`}
    >
      <div className={`absolute top-0 left-0 w-full h-1.5 ${colorClass.split(' ')[0]}`} />
      
      <div className="flex justify-between items-start mb-4 mt-2 border-b border-zinc-100 pb-4">
        <div>
          <h3 className="text-lg font-bold leading-tight flex items-center gap-2 text-zinc-900">
             {icon} {event.title}
          </h3>
          <p className={`text-xs font-bold uppercase tracking-wider mt-2 w-fit px-2 py-0.5 rounded-lg ${colorClass}`}>
            {typeName}
          </p>
        </div>
      </div>

      <div className="space-y-4 mb-6 flex-1">
        <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
           <div className="flex flex-col gap-2">
             <div className="flex items-center gap-3 text-sm font-bold text-zinc-700">
               <CalendarDays className="w-5 h-5 text-zinc-400 shrink-0" />
               {event.endDate && event.endDate !== event.date ? (
                 <span>{formatDate(event.date)} <span className="text-zinc-400 font-normal mx-1">até</span> {formatDate(event.endDate)}</span>
               ) : (
                 <span>{formatDate(event.date)}</span>
               )}
             </div>
             <div className="flex items-center gap-3 text-sm font-bold text-zinc-700">
               <div className="w-5 h-5 flex items-center justify-center shrink-0">
                 <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
               </div>
               <span>{event.startTime} - {event.endTime}</span>
             </div>
           </div>
        </div>
        
        {event.description && (
          <p className="text-sm text-zinc-500 bg-zinc-50 p-4 rounded-2xl border border-zinc-100 italic">
            "{event.description}"
          </p>
        )}

        {((event.studentIds && event.studentIds.length > 0) || (event.teacherIds && event.teacherIds.length > 0)) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {event.studentIds && event.studentIds.length > 0 && (
              isAdmin ? (
                <div 
                  onClick={onViewRSVP} 
                  className="flex items-center gap-1.5 cursor-pointer hover:bg-zinc-200 transition-colors bg-zinc-100 px-2.5 py-1.5 rounded-xl text-xs font-bold text-zinc-700"
                  title="Clique para ver a lista de confirmações"
                >
                  <Users className="w-4 h-4 mr-1 text-zinc-400" />
                  <div className="flex items-center gap-1 text-emerald-600 bg-emerald-100/80 px-1.5 py-0.5 rounded" title="Confirmados">
                    <CheckCircle2 className="w-3 h-3" /> {event.confirmedStudentIds?.length || 0}
                  </div>
                  <div className="flex items-center gap-1 text-red-600 bg-red-100/80 px-1.5 py-0.5 rounded" title="Recusados">
                    <XCircle className="w-3 h-3" /> {event.declinedStudentIds?.length || 0}
                  </div>
                  <div className="flex items-center gap-1 text-amber-600 bg-amber-100/80 px-1.5 py-0.5 rounded" title="Pendentes">
                    <Clock className="w-3 h-3" /> {(event.studentIds.length) - (event.confirmedStudentIds?.length || 0) - (event.declinedStudentIds?.length || 0)}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 opacity-80 bg-zinc-100 px-2.5 py-1.5 rounded-xl text-xs font-bold text-zinc-700">
                  <Users className="w-4 h-4" /> {event.studentIds.length} aluno(s)
                </div>
              )
            )}
            {event.teacherIds && event.teacherIds.length > 0 && (
              <div className="flex items-center gap-1.5 opacity-80 bg-zinc-100 px-2.5 py-1.5 rounded-xl text-xs font-bold text-zinc-700">
                <Music className="w-4 h-4" /> {event.teacherIds.length} prof(s)
              </div>
            )}
          </div>
        )}

        {isStudentInvited && onRSVP && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Sua Presença</p>
            {studentRSVPStatus === 'pending' ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onRSVP(event.id, 'confirmed')}
                  className="flex-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold py-2 px-3 rounded-xl transition-colors text-sm"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => onRSVP(event.id, 'declined')}
                  className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 font-bold py-2 px-3 rounded-xl transition-colors text-sm"
                >
                  Recusar
                </button>
              </div>
            ) : studentRSVPStatus === 'confirmed' ? (
              <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <span className="text-sm font-bold text-emerald-700">Confirmado</span>
                <button onClick={() => onRSVP(event.id, 'declined')} className="text-xs text-emerald-600 hover:text-emerald-800 underline font-medium">Mudar</button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-red-50 p-3 rounded-xl border border-red-100">
                <span className="text-sm font-bold text-red-700">Ausente</span>
                <button onClick={() => onRSVP(event.id, 'confirmed')} className="text-xs text-red-600 hover:text-red-800 underline font-medium">Mudar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="flex justify-end items-center text-xs font-semibold text-zinc-500 pt-4 border-t border-zinc-100 mt-auto gap-2">
          <button
            onClick={onEdit}
            className="px-4 py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors font-bold"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
            title="Excluir evento"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
