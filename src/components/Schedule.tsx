import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, Timestamp, query, orderBy, getDocs, where, serverTimestamp, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Lesson, Student, Teacher, BlockedTime, IntegrationsSettings } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Plus, X, Clock, User, Music, RefreshCw, CheckCircle2, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight, Settings, AlertCircle, Trash2, CalendarDays, FileText, Star } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, setHours, setMinutes, isAfter, isSameDay, startOfWeek, addDays, subWeeks, addWeeks, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import FeedbackModal from './FeedbackModal';
import RejectedReschedules from './schedule/RejectedReschedules';

export default function Schedule({ profile }: { profile: UserProfile }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  
  const [isLessonLogModalOpen, setIsLessonLogModalOpen] = useState(false);
  const [selectedLessonForLog, setSelectedLessonForLog] = useState<Lesson | null>(null);
  const [lessonLogNotes, setLessonLogNotes] = useState('');
  
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);
  const [newAbsence, setNewAbsence] = useState({
    teacherId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    customSlots: [] as { dateLabel: string, date: string, time: string, maxCapacity: number }[]
  });
  const [tempSlot, setTempSlot] = useState({ date: format(new Date(), 'yyyy-MM-dd'), time: '08:00', maxCapacity: 1 });
  const [isBlockingMode, setIsBlockingMode] = useState(false);
  const [blockingSlot, setBlockingSlot] = useState<{ date: Date, time: string, teacherId?: string } | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [blockedTimeToConfirm, setBlockedTimeToConfirm] = useState<string | null>(null);
  const [pendingRejections, setPendingRejections] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [rescheduleTemplate, setRescheduleTemplate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'week' | 'day' | 'rejections'>('week');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState({
    startHour: 7,
    endHour: 21,
    availableDays: [1, 2, 3, 4, 5], // Default Mon-Fri
    defaultMaxStudents: 1
  });
  const [integrationsSettings, setIntegrationsSettings] = useState<IntegrationsSettings | null>(null);
  const [newLesson, setNewLesson] = useState({
    studentId: '',
    teacherId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '09:00',
    duration: '60'
  });
  const [newBlockedTime, setNewBlockedTime] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    reason: '',
    teacherId: 'all'
  });
  const [feedback, setFeedback] = useState<{isOpen: boolean, type: 'success' | 'error' | 'warning', title: string, message: string}>({ isOpen: false, type: 'success', title: '', message: '' });

  useEffect(() => {
    let q = query(collection(db, 'lessons'), orderBy('startTime', 'asc'));
    
    if (profile.role === 'teacher' && profile.teacherId) {
      q = query(q, where('teacherId', '==', profile.teacherId));
    } else if (profile.role === 'student' && profile.studentId) {
      q = query(q, where('studentId', '==', profile.studentId));
    }

    const unsubscribeLessons = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
      setLessons(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lessons');
    });

    const unsubscribeStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    });

    const unsubscribeTeachers = onSnapshot(collection(db, 'teachers'), (snapshot) => {
      setTeachers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher)));
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'school'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSchoolSettings({
          startHour: data.startHour ?? 7,
          endHour: data.endHour ?? 21,
          availableDays: data.availableDays ?? [1, 2, 3, 4, 5],
          defaultMaxStudents: data.defaultMaxStudents ?? 1
        });
      }
    });

    const unsubscribeBlockedTimes = onSnapshot(collection(db, 'blocked_times'), (snapshot) => {
      setBlockedTimes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlockedTime)));
    });

    const unsubscribeIntegrations = onSnapshot(doc(db, 'settings', 'integrations'), (snapshot) => {
      if (snapshot.exists()) {
        setIntegrationsSettings(snapshot.data() as IntegrationsSettings);
      }
    });

    const unsubscribeRejections = onSnapshot(query(collection(db, 'reschedule_tokens'), where('status', '==', 'rejected_slots')), (snapshot) => {
      setPendingRejections(snapshot.size);
    });

    const unsubscribeTemplate = onSnapshot(query(collection(db, 'templates'), where('type', '==', 'reschedule')), (snapshot) => {
      if (!snapshot.empty) {
        setRescheduleTemplate(snapshot.docs[0].data().content);
      } else {
        setRescheduleTemplate(null);
      }
    });

    return () => {
      unsubscribeLessons();
      unsubscribeStudents();
      unsubscribeTeachers();
      unsubscribeSettings();
      unsubscribeBlockedTimes();
      unsubscribeRejections();
      unsubscribeTemplate();
      unsubscribeIntegrations();
    };
  }, []);

  const affectedLessonsCount = useMemo(() => {
    if (!newAbsence.teacherId || !newAbsence.startDate || !newAbsence.endDate) return 0;
    
    // Convert target dates to Date objects at start/end of day
    const [sYr, sMo, sDa] = newAbsence.startDate.split('-').map(Number);
    const startObj = new Date(sYr, sMo - 1, sDa, 0, 0, 0);

    const [eYr, eMo, eDa] = newAbsence.endDate.split('-').map(Number);
    const endObj = new Date(eYr, eMo - 1, eDa, 23, 59, 59, 999);
    
    return lessons.filter(l => 
      l.teacherId === newAbsence.teacherId &&
      l.status === 'scheduled' &&
      l.startTime?.toDate() >= startObj &&
      l.startTime?.toDate() <= endObj
    ).length;
  }, [newAbsence.teacherId, newAbsence.startDate, newAbsence.endDate, lessons]);
  
  const createdSlotsCapacity = useMemo(() => {
    return newAbsence.customSlots.reduce((acc, slot) => acc + (Number(slot.maxCapacity) || 0), 0);
  }, [newAbsence.customSlots]);
  
  const hasEnoughSlots = createdSlotsCapacity >= affectedLessonsCount;

  const checkEvaluationDue = (studentId: string, lessonStart: Date) => {
    if (!integrationsSettings?.evaluationCycleDays) return false;
    const student = students.find(s => s.id === studentId);
    if (!student || student.status !== 'active') return false;

    const baseDateStr = student.lastEvaluationDate || (student.createdAt?.toDate ? format(student.createdAt.toDate(), 'yyyy-MM-dd') : null);
    if (!baseDateStr) return true;

    const baseDate = new Date(baseDateStr + 'T12:00:00');
    // Only flag if lesson is after the base date
    if (lessonStart.getTime() < baseDate.getTime()) return false;

    const diffTime = Math.abs(lessonStart.getTime() - baseDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays >= integrationsSettings.evaluationCycleDays;
  };

  const safeFormat = (date: Date | any, formatStr: string, options?: any) => {
    try {
      if (!date || isNaN(new Date(date).getTime())) return 'N/A';
      return format(new Date(date), formatStr, options);
    } catch (e) {
      return 'N/A';
    }
  };

  const toDate = (timestamp: any) => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const d = new Date(timestamp);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const getTeacherColor = (teacherId: string) => {
    const colors = [
      { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' },
      { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700' },
      { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700' },
      { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' },
      { bg: 'bg-teal-50', border: 'border-teal-100', text: 'text-teal-700' },
      { bg: 'bg-cyan-50', border: 'border-cyan-100', text: 'text-cyan-700' },
      { bg: 'bg-sky-50', border: 'border-sky-100', text: 'text-sky-700' },
      { bg: 'bg-fuchsia-50', border: 'border-fuchsia-100', text: 'text-fuchsia-700' },
      { bg: 'bg-lime-50', border: 'border-lime-100', text: 'text-lime-700' },
      { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-700' },
    ];
    
    let hash = 0;
    for (let i = 0; i < teacherId.length; i++) {
      hash = teacherId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const [teacherId, setTeacherId] = useState<string | null>(null);

  useEffect(() => {
    if (profile.role === 'teacher' && teachers.length > 0) {
      const currentTeacher = teachers.find(t => t.email === profile.email);
      if (currentTeacher) {
        setTeacherId(currentTeacher.id);
        setFilterTeacherId(currentTeacher.id);
      }
    }
  }, [profile, teachers]);

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.role !== 'admin' && profile.role !== 'teacher') return;
    
    try {
      const start = new Date(`${newLesson.date}T${newLesson.time}`);
      const end = new Date(start.getTime() + parseInt(newLesson.duration) * 60000);

      // Check for blocked times
      const isBlocked = blockedTimes.some(bt => {
        const btStart = toDate(bt.startTime)?.getTime();
        const btEnd = toDate(bt.endTime)?.getTime();
        if (!btStart || !btEnd) return false;
        
        // Overlap condition: start < btEnd && end > btStart
        const overlaps = start.getTime() < btEnd && end.getTime() > btStart;
        if (!overlaps) return false;
        
        return !bt.teacherId || bt.teacherId === newLesson.teacherId;
      });

      if (isBlocked) {
        setFormError('Este horário está bloqueado para este professor.');
        return;
      }

      const teacherInfo = teachers.find(t => t.id === newLesson.teacherId);
      const capacity = teacherInfo?.maxStudents || schoolSettings.defaultMaxStudents || 1;
      
      const overlappingLessons = lessons.filter(l => {
        if (l.teacherId !== newLesson.teacherId || l.status === 'cancelled') return false;
        const lStart = toDate(l.startTime);
        const lEnd = toDate(l.endTime);
        if (!lStart || !lEnd) return false;
        // Only count overlaps for the same day to be safe, though timezone diffs could matter, but time overlaps cover it.
        return start.getTime() < lEnd.getTime() && end.getTime() > lStart.getTime();
      });

      if (overlappingLessons.length >= capacity) {
        setFormError(`O professor já atingiu o limite de lotação neste horário (${overlappingLessons.length}/${capacity} alunos).`);
        return;
      }

      const student = students.find(s => s.id === newLesson.studentId);
      const enrollment = student?.enrollments.find(e => e.teacherId === newLesson.teacherId);

      await addDoc(collection(db, 'lessons'), {
        studentId: newLesson.studentId,
        teacherId: newLesson.teacherId,
        instrument: enrollment?.instrument || 'Instrumento',
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        status: 'scheduled',
        createdAt: Timestamp.now()
      });
      setIsModalOpen(false);
      setFormError(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'lessons');
    }
  };

  const handleAddBlockedTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.role !== 'admin' && profile.role !== 'teacher') return;
    
    try {
      const start = new Date(`${newBlockedTime.date}T${newBlockedTime.startTime}`);
      const end = new Date(`${newBlockedTime.date}T${newBlockedTime.endTime}`);

      await addDoc(collection(db, 'blocked_times'), {
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        reason: newBlockedTime.reason,
        teacherId: profile.role === 'teacher' ? profile.teacherId : (newBlockedTime.teacherId === 'all' ? null : newBlockedTime.teacherId),
        createdAt: Timestamp.now()
      });
      setIsBlockModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'blocked_times');
    }
  };

  const handleDeleteBlockedTime = async (id: string) => {
    if (profile.role !== 'admin' && profile.role !== 'teacher') return;
    setBlockedTimeToConfirm(id);
    setIsConfirmOpen(true);
  };

  const confirmDeleteBlockedTime = async () => {
    if (!blockedTimeToConfirm) return;
    try {
      await deleteDoc(doc(db, 'blocked_times', blockedTimeToConfirm));
      setIsConfirmOpen(false);
      setBlockedTimeToConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'blocked_times');
    }
  };

  const handleSlotClick = (date: Date, time: string, teacherId?: string) => {
    if (!isBlockingMode) return;
    setBlockingSlot({ date, time, teacherId });
  };

  const handleSlotDoubleClick = (date: Date, time: string, tId?: string) => {
    if (isBlockingMode) return;
    if (profile.role !== 'admin' && profile.role !== 'teacher') return;
    
    setNewLesson(prev => ({
      ...prev,
      date: format(date, 'yyyy-MM-dd'),
      time: time,
      teacherId: tId || '',
      studentId: '' // reset student
    }));
    setFormError(null);
    setIsModalOpen(true);
  };

  const confirmBlockSlot = async () => {
    if (!blockingSlot) return;
    try {
      const startDateTime = new Date(blockingSlot.date);
      const [hours, minutes] = blockingSlot.time.split(':').map(Number);
      startDateTime.setHours(hours, minutes, 0, 0);

      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(hours + 1);

      const teacherIdToUse = profile?.role === 'teacher' 
        ? profile.teacherId 
        : (blockingSlot.teacherId || 'all');

      await addDoc(collection(db, 'blocked_times'), {
        startTime: Timestamp.fromDate(startDateTime),
        endTime: Timestamp.fromDate(endDateTime),
        reason: '',
        teacherId: teacherIdToUse === 'all' ? null : teacherIdToUse,
        createdAt: Timestamp.now()
      });
      
      setBlockingSlot(null);
      setIsBlockingMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'blocked_times');
    }
  };

  const getStudentName = (id: string) => students.find(s => s.id === id)?.name || 'Desconhecido';
  const getTeacherName = (id: string) => teachers.find(t => t.id === id)?.name || 'Desconhecido';

  const filteredLessons = lessons.filter(l => {
    if (profile.role === 'teacher') {
      return teacherId ? l.teacherId === teacherId : false;
    }
    return filterTeacherId === 'all' || l.teacherId === filterTeacherId;
  });

  const getBlockedTimesForSlot = (day: Date, time: string, tId?: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const slotStart = setMinutes(setHours(day, hours), minutes).getTime();
    
    return blockedTimes.filter(bt => {
      const btStart = toDate(bt.startTime)?.getTime();
      const btEnd = toDate(bt.endTime)?.getTime();
      if (!btStart || !btEnd) return false;
      
      const isOverlapping = slotStart >= btStart && slotStart < btEnd;
      if (!isOverlapping) return false;
      
      if (tId) {
        return !bt.teacherId || bt.teacherId === tId;
      }
      
      if (profile.role === 'teacher' && teacherId) {
        return !bt.teacherId || bt.teacherId === teacherId;
      }
      
      if (filterTeacherId !== 'all') {
         return !bt.teacherId || bt.teacherId === filterTeacherId;
      }
      
      return true;
    });
  };

  const timeSlots = Array.from({ length: schoolSettings.endHour - schoolSettings.startHour + 1 }, (_, i) => {
    const hour = i + schoolSettings.startHour;
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    return addDays(start, i);
  }).filter(day => schoolSettings.availableDays.includes(getDay(day)));

  const nextPeriod = () => {
    if (viewMode === 'day') setSelectedDate(addDays(selectedDate, 1));
    else setSelectedDate(addWeeks(selectedDate, 1));
  };
  
  const prevPeriod = () => {
    if (viewMode === 'day') setSelectedDate(addDays(selectedDate, -1));
    else setSelectedDate(subWeeks(selectedDate, 1));
  };

  const toggleDay = (dayIndex: number) => {
    setSchoolSettings(prev => {
      const days = prev.availableDays.includes(dayIndex)
        ? prev.availableDays.filter(d => d !== dayIndex)
        : [...prev.availableDays, dayIndex].sort();
      return { ...prev, availableDays: days };
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'school'), {
        ...schoolSettings,
        defaultMaxStudents: typeof schoolSettings.defaultMaxStudents === 'number' ? schoolSettings.defaultMaxStudents : 1,
        updatedAt: serverTimestamp()
      });
      setIsSettingsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/school');
    }
  };

  const handleRegisterAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAbsence.teacherId) return setFeedback({ isOpen: true, type: 'warning', title: 'Aviso', message: 'Selecione o professor.' });
    if (newAbsence.customSlots.length === 0) return setFeedback({ isOpen: true, type: 'warning', title: 'Aviso', message: 'Adicione ao menos um horário de reposição (Slots).' });
    
    setIsSubmittingAbsence(true);
    try {
      const fn = getFunctions();
      const registerAbsence = httpsCallable(fn, 'registerTeacherAbsence');
      const payload = { ...newAbsence, originUrl: window.location.origin };
      const res = await registerAbsence(payload);
      const data = res.data as any;
      
      if (data.affectedLessons === 0) {
        setFeedback({ isOpen: true, type: 'warning', title: 'Atenção', message: 'Nenhuma aula agendada foi encontrada para suspender nesse período. Nenhum aluno foi notificado.' });
      } else {
        setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: `Ausência registrada com sucesso! ${data.affectedLessons} aula(s) suspensas. ${data.affectedStudents} aluno(s) receram o WhatsApp com o link de remarcação.` });
      }
      
      setIsAbsenceModalOpen(false);
      setNewAbsence({ teacherId: '', startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), reason: '', customSlots: [] });
    } catch (err: any) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao registrar ausência: ' + err.message });
    } finally {
      setIsSubmittingAbsence(false);
    }
  };

  const handleSaveLessonLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLessonForLog) return;
    try {
      await setDoc(doc(db, 'lessons', selectedLessonForLog.id), {
        status: 'completed',
        notes: lessonLogNotes
      }, { merge: true });
      setFeedback({ isOpen: true, type: 'success', title: 'Diário Salvo!', message: 'Anotações da aula guardadas com sucesso.' });
      setIsLessonLogModalOpen(false);
      setSelectedLessonForLog(null);
      setLessonLogNotes('');
    } catch (err: any) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar: ' + err.message });
    }
  };

  const addCustomSlot = () => {
    const dateObj = new Date(`${tempSlot.date}T00:00:00`);
    const dateLabel = format(dateObj, "dd/MM/yyyy (EEEE)", { locale: ptBR });
    setNewAbsence({
      ...newAbsence,
      customSlots: [...newAbsence.customSlots, { dateLabel, date: tempSlot.date, time: tempSlot.time, maxCapacity: tempSlot.maxCapacity }]
    });
  };

  const syncMonthlyLessons = async () => {
    if (!profile || profile.role !== 'admin') return;
    setIsSyncing(true);
    setSyncStatus('Sincronizando aulas...');
    
    try {
      const activeStudents = students.filter(s => s.status === 'active');
      let createdCount = 0;

      const start = startOfMonth(new Date());
      const end = endOfMonth(addYears(new Date(), 1));
      const days = eachDayOfInterval({ start, end });
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const student of activeStudents) {
        if (!student.schedule || student.schedule.length === 0 || !student.teacherId) continue;

        // Check existing lessons for this student in this month to avoid duplicates
        const existingLessonsQuery = query(
          collection(db, 'lessons'),
          where('studentId', '==', student.id),
          where('startTime', '>=', Timestamp.fromDate(start)),
          where('startTime', '<=', Timestamp.fromDate(end))
        );
        const existingSnapshot = await getDocs(existingLessonsQuery);
        const existingDates = existingSnapshot.docs.map(doc => {
          const data = doc.data();
          return format(data.startTime.toDate(), 'yyyy-MM-dd HH:mm');
        });

        for (const day of days) {
          const dayOfWeek = getDay(day);
          const scheduleItems = student.schedule.filter(s => s.day === dayOfWeek);

          for (const item of scheduleItems) {
            const [hours, minutes] = item.time.split(':').map(Number);
            const lessonStart = setMinutes(setHours(day, hours), minutes);
            const dateStr = format(lessonStart, 'yyyy-MM-dd HH:mm');

            // Only generate if it's in the future and doesn't exist yet
            if (isAfter(lessonStart, new Date()) && !existingDates.includes(dateStr)) {
              const lessonEnd = new Date(lessonStart.getTime() + (student.duration || 60) * 60000);
              
              // Check for blocked times
              const isBlocked = blockedTimes.some(bt => {
                const btStart = toDate(bt.startTime)?.getTime();
                const btEnd = toDate(bt.endTime)?.getTime();
                if (!btStart || !btEnd) return false;
                
                // Overlap condition: start < btEnd && end > btStart
                const overlaps = lessonStart.getTime() < btEnd && lessonEnd.getTime() > btStart;
                if (!overlaps) return false;
                
                return !bt.teacherId || bt.teacherId === student.teacherId;
              });

              if (!isBlocked) {
                const newLessonRef = doc(collection(db, 'lessons'));
                batch.set(newLessonRef, {
                  studentId: student.id,
                  teacherId: student.teacherId,
                  startTime: Timestamp.fromDate(lessonStart),
                  endTime: Timestamp.fromDate(lessonEnd),
                  status: 'scheduled',
                  createdAt: serverTimestamp()
                });
                createdCount++;
                batchCount++;

                if (batchCount === 450) {
                  await batch.commit();
                  batch = writeBatch(db);
                  batchCount = 0;
                }
              }
            }
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      setSyncStatus(`Sucesso! ${createdCount} novas aulas geradas para o próximo ano.`);
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (error) {
      console.error(error);
      setSyncStatus('Erro ao sincronizar aulas.');
    } finally {
      setIsSyncing(false);
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-white p-1 rounded-2xl border border-zinc-100 flex shadow-sm">
            <button 
              onClick={() => setViewMode('day')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all",
                viewMode === 'day' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-zinc-500 hover:text-black"
              )}
            >
              Dia
            </button>
            <button 
              onClick={() => setViewMode('week')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all",
                viewMode === 'week' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-zinc-500 hover:text-black"
              )}
            >
              Semana
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all",
                viewMode === 'list' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-zinc-500 hover:text-black"
              )}
            >
              Lista
            </button>
            {profile.role === 'admin' && (
              <button 
                onClick={() => setViewMode('rejections')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all relative",
                  viewMode === 'rejections' ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" : "text-zinc-500 hover:text-black"
                )}
              >
                Exceções
                {pendingRejections > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse shadow-sm shadow-red-500/50"></span>
                )}
              </button>
            )}
          </div>

          {profile.role === 'admin' && (
            <select
              value={filterTeacherId}
              onChange={(e) => setFilterTeacherId(e.target.value)}
              className="bg-white border border-zinc-100 rounded-2xl px-4 py-2 text-xs font-medium focus:outline-none shadow-sm min-w-[150px]"
            >
              <option value="all">Todos os Professores</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          {viewMode !== 'list' && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-zinc-100 shadow-sm">
              <button onClick={prevPeriod} className="text-zinc-400 hover:text-black transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-black min-w-[120px] text-center">
                {viewMode === 'day' 
                  ? safeFormat(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                  : `${safeFormat(weekDays[0], 'dd/MM')} - ${safeFormat(weekDays[weekDays.length - 1], 'dd/MM')}`
                }
              </span>
              <button onClick={nextPeriod} className="text-zinc-400 hover:text-black transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {syncStatus && (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-medium animate-in fade-in slide-in-from-left-4">
              <CheckCircle2 className="w-4 h-4" />
              {syncStatus}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {profile.role === 'admin' && (
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="bg-white text-zinc-500 border border-zinc-100 p-3 rounded-2xl hover:bg-zinc-50 hover:text-black transition-all shadow-sm shrink-0"
              title="Configurações da Agenda"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          {profile.role === 'admin' && (
            <button 
              onClick={syncMonthlyLessons}
              disabled={isSyncing}
              className="bg-white text-black border border-zinc-100 px-4 md:px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-zinc-50 transition-all font-bold disabled:opacity-50 flex-1 md:flex-none justify-center text-sm md:text-base"
            >
              <RefreshCw className={cn("w-5 h-5", isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">Sincronizar Mês</span>
              <span className="sm:hidden">Sincronizar</span>
            </button>
          )}
          {(profile.role === 'admin' || profile.role === 'teacher') && (
            <button 
              onClick={() => {
                setIsBlockingMode(!isBlockingMode);
                if (!isBlockingMode && viewMode === 'list') {
                  setViewMode('week');
                }
              }}
              className={cn(
                "px-4 md:px-6 py-3 rounded-2xl flex items-center gap-2 transition-all font-bold flex-1 md:flex-none justify-center text-sm md:text-base border",
                isBlockingMode 
                  ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20" 
                  : "bg-white text-red-500 border-red-100 hover:bg-red-50"
              )}
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">{isBlockingMode ? 'Selecione um horário...' : 'Bloquear Horário'}</span>
              <span className="sm:hidden">{isBlockingMode ? 'Selecione...' : 'Bloquear'}</span>
            </button>
          )}
          {profile.role === 'admin' && (
            <button 
              onClick={() => setIsAbsenceModalOpen(true)}
              className="bg-red-50 text-red-600 border border-red-200 px-4 md:px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-red-100 transition-all font-bold flex-1 md:flex-none justify-center text-sm md:text-base"
              title="Registrar Falta e Gerar Links de Reposição"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Ausência Prolongada</span>
              <span className="sm:hidden">Falta</span>
            </button>
          )}
          {profile.role === 'admin' && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 md:px-6 py-3 rounded-2xl flex items-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all font-bold shadow-lg shadow-orange-500/25 active:scale-[0.98] flex-1 md:flex-none justify-center text-sm md:text-base"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Agendar Aula</span>
              <span className="sm:hidden">Agendar</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === 'rejections' ? (
        <RejectedReschedules />
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold display-font">Próximas Aulas</h3>
          </div>
          
          <div className="space-y-4">
            {filteredLessons.map(lesson => {
              const tColor = getTeacherColor(lesson.teacherId);
              const lessonStart = toDate(lesson.startTime);
              const needsEvaluation = lessonStart ? checkEvaluationDue(lesson.studentId, lessonStart) : false;
              return (
                <div 
                  key={lesson.id} 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (profile.role === 'admin' || profile.role === 'teacher' || (profile.role === 'student' && lesson.notes)) {
                      setSelectedLessonForLog(lesson);
                      setLessonLogNotes(lesson.notes || '');
                      setIsLessonLogModalOpen(true);
                    }
                  }}
                  className={cn(
                  "flex flex-col md:flex-row md:items-center gap-4 md:gap-6 p-4 md:p-6 rounded-2xl border transition-all relative overflow-hidden",
                  tColor.bg,
                  tColor.border,
                  needsEvaluation ? 'ring-2 ring-amber-400 shadow-amber-400/20' : '',
                  "cursor-pointer hover:shadow-md hover:scale-[1.01]"
                )}>
                  <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 opacity-50", tColor.text.replace('text-', 'bg-'))} />
                  
                  <div className="flex items-center justify-between w-full md:w-auto">
                    <div className="w-16 h-16 bg-white rounded-xl flex flex-col items-center justify-center border border-zinc-100 shadow-sm shrink-0">
                      <span className="text-xs text-zinc-400 uppercase font-bold">{safeFormat(toDate(lesson.startTime), 'MMM', { locale: ptBR })}</span>
                      <span className="text-xl font-bold text-black">{safeFormat(toDate(lesson.startTime), 'dd')}</span>
                    </div>
                    
                    <div className="md:hidden">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-medium text-center",
                        lesson.status === 'scheduled' ? "bg-white/50 text-orange-600 border border-orange-100" :
                        lesson.status === 'completed' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                        lesson.status === 'needs_reschedule' ? "bg-red-50 text-red-600 border border-red-100" :
                        lesson.status === 'rescheduled' ? "bg-zinc-100 text-zinc-500 border border-zinc-200" :
                        "bg-red-50 text-red-600 border border-red-100"
                      )}>
                        {lesson.status === 'scheduled' ? 'Agendada' : 
                         lesson.status === 'completed' ? 'Concluída' : 
                         lesson.status === 'needs_reschedule' ? 'Pendente Reposição' :
                         lesson.status === 'rescheduled' ? 'Reposta' : 'Cancelada'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-zinc-400" />
                      <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Aluno</p>
                        <p className="font-bold text-black flex items-center gap-1">
                          {getStudentName(lesson.studentId)}
                          {needsEvaluation && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" title="Avaliação de Nivelamento Recomendada" />}
                          <span className="ml-2 text-xs text-zinc-400 font-normal">
                            ({lesson.instrument || 'N/A'})
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Music className="w-5 h-5 text-zinc-400" />
                      <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Professor</p>
                        <p className="font-bold text-black">{getTeacherName(lesson.teacherId)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-zinc-400" />
                      <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Horário</p>
                        <p className="font-bold text-black">
                          {safeFormat(toDate(lesson.startTime), 'HH:mm')} - {safeFormat(toDate(lesson.endTime), 'HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <span className={cn(
                      "px-4 py-2 rounded-full text-xs font-medium",
                      lesson.status === 'scheduled' ? "bg-white/50 text-orange-600 border border-orange-100" :
                      lesson.status === 'completed' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                      lesson.status === 'needs_reschedule' ? "bg-red-50 text-red-600 border border-red-100" :
                      lesson.status === 'rescheduled' ? "bg-zinc-100 text-zinc-500 border border-zinc-200" :
                      "bg-red-50 text-red-600 border border-red-100"
                    )}>
                      {lesson.status === 'scheduled' ? 'Agendada' : 
                       lesson.status === 'completed' ? 'Concluída' : 
                       lesson.status === 'needs_reschedule' ? 'Pendente Reposição' :
                       lesson.status === 'rescheduled' ? 'Reposta' : 'Cancelada'}
                    </span>
                  </div>
                </div>
              );
            })}
            {filteredLessons.length === 0 && (
              <div className="py-20 text-center text-zinc-400 italic">
                Nenhuma aula agendada.
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'week' ? (
        <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header */}
              <div className="grid border-b border-zinc-100" style={{ gridTemplateColumns: `80px repeat(${weekDays.length}, 1fr)` }}>
                <div className="p-4 border-r border-zinc-100 bg-zinc-100/50"></div>
                {weekDays.map((day, idx) => (
                  <div key={idx} className={cn(
                    "p-4 text-center border-r border-zinc-100 last:border-r-0",
                    isSameDay(day, new Date()) ? "bg-orange-500 text-white" : "bg-zinc-50/50"
                  )}>
                    <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">
                      {safeFormat(day, 'eee', { locale: ptBR })}
                    </p>
                    <p className="text-lg font-bold">
                      {safeFormat(day, 'dd')}
                    </p>
                  </div>
                ))}
              </div>

              {/* Grid Body */}
              <div className="relative">
                {timeSlots.map((time, timeIdx) => (
                  <div key={timeIdx} className="grid border-b border-zinc-50 last:border-b-0 group" style={{ gridTemplateColumns: `80px repeat(${weekDays.length}, 1fr)` }}>
                    <div className="p-4 border-r border-zinc-100 text-[10px] font-bold text-black text-center bg-zinc-100/50">
                      {time}
                    </div>
                    {weekDays.map((day, dayIdx) => {
                      const dayLessons = filteredLessons.filter(l => {
                        const lessonDate = toDate(l.startTime);
                        if (!lessonDate) return false;
                        return isSameDay(lessonDate, day) && safeFormat(lessonDate, 'HH:00') === time;
                      });
                      const dayBlockedTimes = getBlockedTimesForSlot(day, time);

                      return (
                        <div 
                          key={dayIdx} 
                          onClick={() => handleSlotClick(day, time)}
                          onDoubleClick={() => handleSlotDoubleClick(day, time, profile.role === 'teacher' ? profile.teacherId : undefined)}
                          className={cn(
                            "p-1 border-r border-zinc-100 last:border-r-0 min-h-[80px] relative transition-colors select-none",
                            isBlockingMode ? "cursor-pointer hover:bg-red-50" : "cursor-pointer group-hover:bg-zinc-50/20"
                          )}
                        >
                          {dayBlockedTimes.map(bt => (
                            <div 
                              key={bt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (profile.role === 'admin' || (profile.role === 'teacher' && bt.teacherId === profile.teacherId)) {
                                  handleDeleteBlockedTime(bt.id);
                                }
                              }}
                              className={cn(
                                "p-2 rounded-xl text-[10px] mb-1 shadow-sm border border-red-100 bg-red-50 text-red-700 transition-all cursor-not-allowed",
                                (profile.role === 'admin' || (profile.role === 'teacher' && bt.teacherId === profile.teacherId)) && "hover:bg-red-100 cursor-pointer"
                              )}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <p className="font-bold truncate">Bloqueado</p>
                              </div>
                              <div className="flex flex-col gap-0.5 mt-1 opacity-70">
                                <p className="truncate">{bt.reason || 'Indisponível'}</p>
                                {bt.teacherId && <p className="truncate flex items-center gap-1"><User className="w-2 h-2" />{getTeacherName(bt.teacherId)}</p>}
                              </div>
                            </div>
                          ))}
                          {dayLessons.map(lesson => {
                            const tColor = getTeacherColor(lesson.teacherId);
                            const lessonStart = toDate(lesson.startTime);
                            const needsEvaluation = lessonStart ? checkEvaluationDue(lesson.studentId, lessonStart) : false;
                            
                            return (
                              <div 
                                key={lesson.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (profile.role === 'admin' || profile.role === 'teacher' || (profile.role === 'student' && lesson.notes)) {
                                    setSelectedLessonForLog(lesson);
                                    setLessonLogNotes(lesson.notes || '');
                                    setIsLessonLogModalOpen(true);
                                  }
                                }}
                                title={
                                  lesson.status === 'needs_reschedule' ? 'Aula suspensa aguardando reposição pelo aluno.' :
                                  lesson.status === 'rescheduled' ? 'Aula antiga já reagendada para nova data.' :
                                  lesson.status === 'cancelled' ? 'Aula Cancelada.' :
                                  lesson.isMakeup ? '✅ Aula de Reposição Agendada.' :
                                  'Aula Regular Agendada.'
                                }
                                className={cn(
                                  "p-2 rounded-xl text-[10px] mb-1 shadow-sm border transition-all cursor-pointer hover:scale-[1.02]",
                                  lesson.status === 'needs_reschedule' ? "bg-red-100 border-red-300 text-red-800" :
                                  lesson.status === 'rescheduled' ? "bg-zinc-100 border-zinc-200 text-zinc-400 opacity-60 line-through" :
                                  `${tColor.bg} ${tColor.border} ${tColor.text}`,
                                  needsEvaluation && !['cancelled', 'rescheduled'].includes(lesson.status) && 'ring-2 ring-amber-400 shadow-amber-400/20 z-10 scale-[1.02]',
                                  lesson.status === 'cancelled' && "opacity-50 grayscale"
                                )}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <p className="font-bold truncate flex items-center gap-1">
                                    {getStudentName(lesson.studentId)}
                                    {needsEvaluation && !['cancelled', 'rescheduled'].includes(lesson.status) && <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500 animate-pulse shrink-0" title="Ciclo Fechado: Avaliar Aluno" />}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    {lesson.notes && <FileText className="w-2.5 h-2.5 shrink-0 text-orange-500" title="Possui anotações" />}
                                    {lesson.status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-0.5 mt-1 opacity-70">
                                  <p className="truncate flex items-center gap-1">
                                    <Music className="w-2 h-2" />
                                    {lesson.instrument || 'Instrumento'}
                                  </p>
                                  <p className="truncate flex items-center gap-1">
                                    <User className="w-2 h-2" />
                                    {getTeacherName(lesson.teacherId)}
                                  </p>
                                </div>
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
      ) : (
        <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] overflow-hidden">
          <div className="overflow-x-auto pb-4">
            <div className="min-w-[800px]">
              {/* Header: Teachers */}
              <div className="grid border-b border-zinc-100" style={{ gridTemplateColumns: `80px repeat(${teachers.length}, 1fr)` }}>
                <div className="p-4 border-r border-zinc-100 bg-zinc-100/50"></div>
                {teachers.map((teacher) => (
                  <div key={teacher.id} className="p-4 text-center border-r border-zinc-100 last:border-r-0 bg-zinc-50/50">
                    <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Professor</p>
                    <p className="text-sm font-bold truncate">{teacher.name}</p>
                  </div>
                ))}
              </div>

              {/* Grid Body */}
              <div className="relative">
                    {timeSlots.map((time, timeIdx) => (
                      <div key={timeIdx} className="grid border-b border-zinc-50 last:border-b-0 group" style={{ gridTemplateColumns: `80px repeat(${teachers.length}, 1fr)` }}>
                        <div className="p-4 border-r border-zinc-100 text-[10px] font-bold text-black text-center bg-zinc-100/50">
                          {time}
                        </div>
                        {teachers.map((teacher) => {
                          const teacherDayLessons = filteredLessons.filter(l => {
                            const lessonDate = toDate(l.startTime);
                            if (!lessonDate) return false;
                            return isSameDay(lessonDate, selectedDate) && 
                                   safeFormat(lessonDate, 'HH:00') === time &&
                                   l.teacherId === teacher.id;
                          });
                          const teacherBlockedTimes = getBlockedTimesForSlot(selectedDate, time, teacher.id);

                          return (
                            <div 
                              key={teacher.id} 
                              onClick={() => handleSlotClick(selectedDate, time, teacher.id)}
                              onDoubleClick={() => handleSlotDoubleClick(selectedDate, time, teacher.id)}
                              className={cn(
                                "p-1 border-r border-zinc-100 last:border-r-0 min-h-[80px] relative transition-colors select-none",
                                isBlockingMode ? "cursor-pointer hover:bg-red-50" : "cursor-pointer group-hover:bg-zinc-50/20"
                              )}
                            >
                              {teacherBlockedTimes.map(bt => (
                                <div 
                                  key={bt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (profile.role === 'admin' || (profile.role === 'teacher' && bt.teacherId === profile.teacherId)) {
                                      handleDeleteBlockedTime(bt.id);
                                    }
                                  }}
                                  className={cn(
                                    "p-2 rounded-xl text-[10px] mb-1 shadow-sm border border-red-100 bg-red-50 text-red-700 transition-all cursor-not-allowed",
                                    (profile.role === 'admin' || (profile.role === 'teacher' && bt.teacherId === profile.teacherId)) && "hover:bg-red-100 cursor-pointer"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="font-bold truncate">Bloqueado</p>
                                  </div>
                                  <div className="flex flex-col gap-0.5 mt-1 opacity-70">
                                    <p className="truncate">{bt.reason || 'Indisponível'}</p>
                                  </div>
                                </div>
                              ))}
                              {teacherDayLessons.map(lesson => {
                                const tColor = getTeacherColor(lesson.teacherId);
                                const lessonStart = toDate(lesson.startTime);
                                const needsEvaluation = lessonStart ? checkEvaluationDue(lesson.studentId, lessonStart) : false;
                                
                                return (
                                  <div 
                                    key={lesson.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (profile.role === 'admin' || profile.role === 'teacher' || (profile.role === 'student' && lesson.notes)) {
                                        setSelectedLessonForLog(lesson);
                                        setLessonLogNotes(lesson.notes || '');
                                        setIsLessonLogModalOpen(true);
                                      }
                                    }}
                                    title={
                                      lesson.status === 'needs_reschedule' ? 'Aula suspensa aguardando reposição pelo aluno.' :
                                      lesson.status === 'rescheduled' ? 'Aula antiga já reagendada para nova data.' :
                                      lesson.status === 'cancelled' ? 'Aula Cancelada.' :
                                      lesson.isMakeup ? '✅ Aula de Reposição Agendada.' :
                                      'Aula Regular Agendada.'
                                    }
                                    className={cn(
                                      "p-2 rounded-xl text-[10px] mb-1 shadow-sm border transition-all cursor-pointer hover:scale-[1.02]",
                                      lesson.status === 'needs_reschedule' ? "bg-red-100 border-red-300 text-red-800" :
                                      lesson.status === 'rescheduled' ? "bg-zinc-100 border-zinc-200 text-zinc-400 opacity-60 line-through" :
                                      `${tColor.bg} ${tColor.border} ${tColor.text}`,
                                      needsEvaluation && !['cancelled', 'rescheduled'].includes(lesson.status) && 'ring-2 ring-amber-400 shadow-amber-400/20 z-10 scale-[1.02]',
                                      lesson.status === 'cancelled' && "opacity-50 grayscale"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="font-bold truncate flex items-center gap-1">
                                        {getStudentName(lesson.studentId)}
                                        {needsEvaluation && !['cancelled', 'rescheduled'].includes(lesson.status) && <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500 animate-pulse shrink-0" title="Ciclo Fechado: Avaliar Aluno" />}
                                      </p>
                                      <div className="flex items-center gap-1">
                                        {lesson.notes && <FileText className="w-2.5 h-2.5 shrink-0 text-orange-500" title="Possui anotações" />}
                                        {lesson.status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-1 opacity-70">
                                      <p className="truncate flex items-center gap-1">
                                        <Music className="w-2 h-2" />
                                        {lesson.instrument || 'Instrumento'}
                                      </p>
                                    </div>
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
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
            <div className="flex items-center justify-between p-5 sm:p-8 border-b border-zinc-100 shrink-0">
              <h3 className="text-xl sm:text-2xl font-medium">Configurações da Agenda</h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 sm:p-8">
              <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Hora Inicial</label>
                  <select 
                    value={schoolSettings.startHour}
                    onChange={e => setSchoolSettings({...schoolSettings, startHour: parseInt(e.target.value)})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Hora Final</label>
                  <select 
                    value={schoolSettings.endHour}
                    onChange={e => setSchoolSettings({...schoolSettings, endHour: parseInt(e.target.value)})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Lotação Padrão (Alunos por Horário)</label>
                <input 
                  type="number"
                  min="1"
                  value={schoolSettings.defaultMaxStudents === undefined ? '' : schoolSettings.defaultMaxStudents}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    setSchoolSettings({...schoolSettings, defaultMaxStudents: isNaN(val) ? ('' as any) : val});
                  }}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-3">Dias de Funcionamento</label>
                <div className="flex flex-wrap gap-2">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-medium border transition-all",
                        schoolSettings.availableDays.includes(idx)
                          ? "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20"
                          : "bg-white text-zinc-500 border-zinc-100 hover:border-zinc-200"
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-zinc-400 italic">
                Ajuste o intervalo de horas e os dias da semana exibidos na grade.
              </p>
                <button 
                  type="submit"
                  className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-md shadow-orange-500/20 mt-4"
                >
                  Salvar Configurações
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
            <div className="flex items-center justify-between p-5 sm:p-8 border-b border-zinc-100 shrink-0">
              <h3 className="text-xl sm:text-2xl font-medium">Agendar Aula</h3>
              <button onClick={() => { setIsModalOpen(false); setFormError(null); }} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 sm:p-8">
              <form onSubmit={handleAddLesson} className="space-y-6">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Aluno</label>
                <select 
                  required
                  value={newLesson.studentId}
                  onChange={e => {
                    const selectedStudentId = e.target.value;
                    const student = students.find(s => s.id === selectedStudentId);
                    let autoTeacherId = newLesson.teacherId;
                    
                    if (student && student.enrollments && student.enrollments.length > 0) {
                      autoTeacherId = student.enrollments[0].teacherId;
                    }
                    
                    setNewLesson({
                      ...newLesson, 
                      studentId: selectedStudentId,
                      teacherId: autoTeacherId
                    });
                  }}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                >
                  <option value="">Selecione um aluno</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Professor</label>
                <select 
                  required
                  value={newLesson.teacherId}
                  onChange={e => setNewLesson({...newLesson, teacherId: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                >
                  <option value="">Selecione um professor</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Data</label>
                  <input 
                    required
                    type="date" 
                    value={newLesson.date}
                    onChange={e => setNewLesson({...newLesson, date: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Hora</label>
                  <input 
                    required
                    type="time" 
                    value={newLesson.time}
                    onChange={e => setNewLesson({...newLesson, time: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>
              </div>
                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98] mt-4"
                >
                  Confirmar Agendamento
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Block Time Modal */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
            <div className="flex items-center justify-between p-5 sm:p-8 border-b border-zinc-100 shrink-0">
              <h3 className="text-xl sm:text-2xl font-bold display-font text-red-500">Bloquear Horário</h3>
              <button onClick={() => setIsBlockModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 sm:p-8">
              <form onSubmit={handleAddBlockedTime} className="space-y-6">
              {profile.role === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Professor</label>
                  <select 
                    required
                    value={newBlockedTime.teacherId}
                    onChange={e => setNewBlockedTime({...newBlockedTime, teacherId: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                  >
                    <option value="all">Todos os Professores (Geral)</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Motivo (Opcional)</label>
                <input 
                  type="text" 
                  value={newBlockedTime.reason}
                  onChange={e => setNewBlockedTime({...newBlockedTime, reason: e.target.value})}
                  placeholder="Ex: Feriado, Férias, Manutenção..."
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Data</label>
                  <input 
                    required
                    type="date" 
                    value={newBlockedTime.date}
                    onChange={e => setNewBlockedTime({...newBlockedTime, date: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Hora Início</label>
                  <input 
                    required
                    type="time" 
                    value={newBlockedTime.startTime}
                    onChange={e => setNewBlockedTime({...newBlockedTime, startTime: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Hora Fim</label>
                  <input 
                    required
                    type="time" 
                    value={newBlockedTime.endTime}
                    onChange={e => setNewBlockedTime({...newBlockedTime, endTime: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                  />
                </div>
              </div>
                <button 
                  type="submit"
                  className="w-full bg-red-500 text-white py-4 rounded-2xl font-bold hover:bg-red-600 transition-all shadow-md shadow-red-500/20 mt-4"
                >
                  Confirmar Bloqueio
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {blockingSlot && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 text-center">
            <h3 className="text-2xl font-bold display-font text-red-500 mb-4">Confirmar Bloqueio</h3>
            <p className="text-zinc-600 mb-6">
              Deseja realmente bloquear o horário das <strong>{blockingSlot.time}</strong> às <strong>{String(parseInt(blockingSlot.time.split(':')[0]) + 1).padStart(2, '0')}:00</strong> no dia <strong>{safeFormat(blockingSlot.date, 'dd/MM/yyyy')}</strong>
              {blockingSlot.teacherId && blockingSlot.teacherId !== 'all' ? ` para o professor ${getTeacherName(blockingSlot.teacherId)}` : ''}?
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex justify-center gap-4">
                <button 
                  onClick={() => setBlockingSlot(null)}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmBlockSlot}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Confirmar
                </button>
              </div>
              <button
                onClick={() => {
                  setNewBlockedTime({
                    date: format(blockingSlot.date, 'yyyy-MM-dd'),
                    startTime: blockingSlot.time,
                    endTime: `${String(parseInt(blockingSlot.time.split(':')[0]) + 1).padStart(2, '0')}:00`,
                    reason: '',
                    teacherId: blockingSlot.teacherId || 'all'
                  });
                  setBlockingSlot(null);
                  setIsBlockingMode(false);
                  setIsBlockModalOpen(true);
                }}
                className="text-sm text-zinc-500 hover:text-black font-medium transition-colors"
              >
                Opções Avançadas (Motivo, Duração...)
              </button>
            </div>
          </div>
        </div>
      )}

      {isAbsenceModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
            <div className="flex items-start sm:items-center justify-between p-5 sm:p-8 pb-4 sm:pb-6 border-b border-zinc-100 shrink-0 gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold display-font text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-6 h-6 shrink-0" />
                  Registrar Ausência em Massa
                </h3>
                <p className="text-sm text-zinc-500 mt-1">Suspende as aulas do período e gera links mágicos de remarcação.</p>
              </div>
              <button 
                onClick={() => setIsAbsenceModalOpen(false)} 
                className="text-zinc-400 hover:text-black transition-colors w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-100 shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-8 pt-4 sm:pt-6">
              <form onSubmit={handleRegisterAbsence} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Professor Ausente</label>
                  <select 
                    required
                    value={newAbsence.teacherId}
                    onChange={e => setNewAbsence({...newAbsence, teacherId: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 text-black"
                  >
                    <option value="">Selecione um professor...</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Data Inicial da Falta</label>
                    <input 
                      required
                      type="date"
                      value={newAbsence.startDate}
                      onChange={e => setNewAbsence({...newAbsence, startDate: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 text-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Data Final da Falta</label>
                    <input 
                      required
                      type="date"
                      value={newAbsence.endDate}
                      onChange={e => setNewAbsence({...newAbsence, endDate: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 text-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Motivo do Cancelamento</label>
                  <input 
                    required
                    type="text"
                    value={newAbsence.reason}
                    onChange={e => setNewAbsence({...newAbsence, reason: e.target.value})}
                    placeholder="Ex: Problemas de saúde"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 text-black"
                  />
                  <p className="text-xs text-zinc-400 mt-1">Este motivo será exibido para o aluno na tela de reposição.</p>
                </div>

                <div className="p-5 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
                   <h4 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
                     <CalendarDays className="w-4 h-4 text-orange-500" />
                     Criar Vagas de Reposição (Mutirão)
                   </h4>
                   <p className="text-[11px] text-zinc-500 mb-4 uppercase tracking-wider font-semibold">Adicione os dias e horários que o professor fará a reposição.</p>
                   
                   <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 sm:gap-2 mb-4">
                      <div className="w-full sm:flex-1">
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Data</label>
                        <input type="date" value={tempSlot.date} onChange={e=>setTempSlot({...tempSlot, date: e.target.value})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm text-black" />
                      </div>
                      <div className="w-full sm:w-24 sm:border-l sm:pl-2 border-zinc-200">
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Hora</label>
                        <input type="time" value={tempSlot.time} onChange={e=>setTempSlot({...tempSlot, time: e.target.value})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm text-black" />
                      </div>
                      <div className="w-full sm:w-24 sm:border-l sm:pl-2 border-zinc-200">
                        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1" title="Capacidade máxima de alunos">Capacidade</label>
                        <input type="number" min="1" value={tempSlot.maxCapacity} onChange={e=>setTempSlot({...tempSlot, maxCapacity: parseInt(e.target.value)||1})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm text-black" />
                      </div>
                      <button type="button" onClick={addCustomSlot} className="w-full sm:w-auto bg-zinc-900 text-white rounded-xl px-4 py-3 sm:py-2 text-sm font-bold hover:bg-zinc-800 transition-colors sm:h-[38px]">
                        Adicionar
                      </button>
                   </div>

                   {newAbsence.teacherId && affectedLessonsCount > 0 && (
                     <div className={cn("mb-4 rounded-xl p-3 border text-sm flex items-start gap-2", hasEnoughSlots ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800")}>
                        {hasEnoughSlots ? (
                          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                        )}
                        <div>
                          <strong>{hasEnoughSlots ? "Excelente!" : "Atenção:"}</strong> O professor possui <strong>{affectedLessonsCount} alunos</strong> agendados neste período. 
                          Você já disponibilizou <strong>{createdSlotsCapacity} vagas</strong> de reposição.
                          {!hasEnoughSlots && <p className="text-xs mt-1 text-amber-900 opacity-90">Abra mais vagas para habilitar o salvamento.</p>}
                        </div>
                     </div>
                   )}

                   <div className="space-y-2 max-h-40 overflow-y-auto pr-1 mt-6">
                      {newAbsence.customSlots.map((slot, idx) => (
                         <div key={idx} className="flex flex-wrap items-center justify-between bg-white p-3 rounded-xl border border-zinc-200 shadow-sm gap-2">
                           <div className="flex flex-wrap items-center gap-2">
                             <span className="font-bold text-sm text-black">{slot.dateLabel}</span>
                             <span className="text-[13px] text-orange-600 font-black">{slot.time}</span>
                             <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded-full">{slot.maxCapacity} Vagas</span>
                           </div>
                           <button type="button" onClick={() => setNewAbsence(prev => ({...prev, customSlots: prev.customSlots.filter((_, i) => i !== idx)}))} className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors ml-auto sm:ml-0">
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </div>
                      ))}
                      {newAbsence.customSlots.length === 0 && <p className="text-[13px] text-zinc-400 font-medium py-2 text-center border border-dashed border-zinc-200 rounded-xl">Nenhum horário de reposição cadastrado ainda.</p>}
                   </div>
                </div>

                {newAbsence.teacherId && (
                  <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 relative mt-4">
                    <span className="absolute -top-3 left-4 bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold px-2 py-1 rounded-full border border-emerald-200">Pré-visualização do WhatsApp</span>
                    <p className="text-sm text-emerald-900 leading-relaxed mt-2 whitespace-pre-wrap">
                      {rescheduleTemplate ? (
                        rescheduleTemplate
                          .replace(/{nome}/g, '[Nome do Aluno]')
                          .replace(/{professor}/g, teachers.find(t => t.id === newAbsence.teacherId)?.name || '...')
                          .replace(/{motivo}/g, newAbsence.reason || '')
                          .replace(/{link}/g, `${window.location.origin}/reposicao/[LINK_ÚNICO]`)
                      ) : (
                        `Olá, [Nome do Aluno]! Informamos que o professor *${teachers.find(t => t.id === newAbsence.teacherId)?.name || '...'}* teve um imprevisto e sua(s) aula(s) precisaram ser suspensas${newAbsence.reason ? ` pelo seguinte motivo: ${newAbsence.reason}` : ''}. Para não sair no prejuízo, por favor, clique no link seguro abaixo para escolher o melhor horário para sua reposição:\n\n🔗 ${window.location.origin}/reposicao/[LINK_ÚNICO]`
                      )}
                    </p>
                  </div>
                )}

                <div className="pt-4 mt-8 border-t border-zinc-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                   <button type="button" onClick={() => setIsAbsenceModalOpen(false)} className="w-full sm:w-auto px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-colors text-center">Cancelar</button>
                   <button 
                     type="submit" 
                     disabled={isSubmittingAbsence || (affectedLessonsCount > 0 && !hasEnoughSlots)}
                     title={affectedLessonsCount > 0 && !hasEnoughSlots ? "Crie vagas suficientes para prosseguir!" : ""}
                     className="w-full sm:w-auto justify-center bg-red-500 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {isSubmittingAbsence ? 'Montando Links...' : 'Registrar Falta e Notificar Alunos'}
                   </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDeleteBlockedTime}
        title="Remover Bloqueio"
        message="Tem certeza que deseja remover este bloqueio de horário?"
        confirmText="Remover"
      />
    </div>

      {/* Lesson Log Modal */}
      {isLessonLogModalOpen && selectedLessonForLog && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[60]">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
            <div className="flex items-center justify-between p-5 sm:p-8 border-b border-zinc-100 shrink-0">
              <h3 className="text-xl sm:text-2xl font-bold display-font text-orange-500">Diário de Aula</h3>
              <button 
                onClick={() => {
                  setIsLessonLogModalOpen(false);
                  setSelectedLessonForLog(null);
                  setLessonLogNotes('');
                }} 
                className="text-zinc-400 hover:text-black transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-5 sm:p-8">
              <div className="bg-zinc-50 p-4 rounded-2xl mb-6 border border-zinc-100 flex flex-col gap-1">
                <p className="font-bold text-black text-lg">{getStudentName(selectedLessonForLog.studentId)}</p>
                <p className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                  <Music className="w-4 h-4" /> {selectedLessonForLog.instrument || 'Instrumento'}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs font-bold text-zinc-400">
                   <Clock className="w-4 h-4" />
                   {safeFormat(toDate(selectedLessonForLog.startTime), 'dd/MM/yyyy HH:mm')}
                </div>
              </div>

              <form onSubmit={handleSaveLessonLog} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Resumo da Aula (O que foi estudado?)</label>
                  {profile.role === 'student' ? (
                    <div className="bg-orange-50 p-6 rounded-2xl italic text-amber-900 border border-orange-100 min-h-[100px] whitespace-pre-wrap">
                      "{lessonLogNotes}"
                    </div>
                  ) : (
                    <>
                      <textarea 
                        autoFocus
                        required
                        value={lessonLogNotes}
                        onChange={e => setLessonLogNotes(e.target.value)}
                        placeholder="Ex: Focamos na transição entre acordes maiores e menores, compasso 4/4 e postura da mão direita."
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all min-h-[150px] resize-y"
                      />
                      <p className="text-xs text-zinc-400 mt-2">As anotações serão salvas no histórico da aula. O status será marcado como <strong>Concluída</strong>.</p>
                    </>
                  )}
                </div>

                {profile.role !== 'student' && (
                  <div className="pt-4 border-t border-zinc-100 flex gap-3">
                    <button 
                      type="submit"
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98]"
                    >
                      Salvar Relatório e Concluir Aula
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
