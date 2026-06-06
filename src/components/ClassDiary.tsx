import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, setDoc, writeBatch, getDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../firebase';
import { UserProfile, Lesson, Student, LibraryTopic, LibraryModule, Teacher, Instrument } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Clock, User, FileText, CheckCircle2, AlertCircle, Camera, X, ImageIcon, Loader2, Link, Trash, Headphones, BookOpen, CalendarDays, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import FeedbackModal from './FeedbackModal';

interface ClassDiaryProps {
  profile: UserProfile;
  initialStudentId?: string;
  initialLessonId?: string;
}

export default function ClassDiary({ profile, initialStudentId, initialLessonId }: ClassDiaryProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedStudentLessons, setSelectedStudentLessons] = useState<Lesson[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [selectedLessonId, setSelectedLessonId] = useState<string>(initialLessonId || '');
  const [activeTab, setActiveTab] = useState<'diary' | 'studies'>('diary');
  const [topics, setTopics] = useState<LibraryTopic[]>([]);
  const [libraryModules, setLibraryModules] = useState<LibraryModule[]>([]);
  
  const [notes, setNotes] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedModuleToUnlock, setSelectedModuleToUnlock] = useState<string>('');
  const [selectedTopicsToUnlock, setSelectedTopicsToUnlock] = useState<string[]>([]);
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [tempStudyDate, setTempStudyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [studyDuration, setStudyDuration] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{isOpen: boolean, type: 'success' | 'error' | 'warning', title: string, message: string}>({ isOpen: false, type: 'success', title: '', message: '' });
  const [taskToEdit, setTaskToEdit] = useState<Lesson | null>(null);
  const [editTaskDate, setEditTaskDate] = useState('');
  const [editTaskDuration, setEditTaskDuration] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const studentDropdownRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Determine which teacher logic to apply based on role
    const isTeacher = profile.role === 'teacher';
    const teacherId = profile.teacherId;

    let unsubscribeTeacher = () => {};
    if (isTeacher && teacherId) {
      unsubscribeTeacher = onSnapshot(doc(db, 'teachers', teacherId), (docSnap) => {
        if (docSnap.exists()) {
          setTeacherData({ id: docSnap.id, ...docSnap.data() } as Teacher);
        }
      });
    }

    // Fetch students
    const unsubscribeStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    });

    // Fetch lessons
    let q = query(collection(db, 'lessons'), orderBy('startTime', 'desc'));
    if (isTeacher && teacherId) {
      q = query(collection(db, 'lessons'), where('teacherId', '==', teacherId), orderBy('startTime', 'desc'));
    }

    const unsubscribeLessons = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
      setLessons(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lessons');
    });

    // Fetch topics
    const unsubscribeTopics = onSnapshot(collection(db, 'library'), (snapshot) => {
      setTopics(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryTopic)));
    });

    // Fetch library modules
    const qModules = query(collection(db, 'library_modules'), orderBy('name', 'asc'));
    const unsubscribeModules = onSnapshot(qModules, (snapshot) => {
      setLibraryModules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LibraryModule)));
    });

    // Fetch instruments for fallback filtering
    const unsubscribeInstruments = onSnapshot(collection(db, 'instruments'), (snapshot) => {
      setInstruments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Instrument)));
    });

    return () => {
      unsubscribeTeacher();
      unsubscribeStudents();
      unsubscribeLessons();
      unsubscribeTopics();
      unsubscribeModules();
      unsubscribeInstruments();
    };
  }, [profile]);

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  useEffect(() => {
    if (initialLessonId) {
      const lesson = lessons.find(l => l.id === initialLessonId);
      if (lesson) {
        setSelectedLessonId(initialLessonId);
        setNotes(lesson.notes || '');
      }
    }
  }, [initialLessonId, lessons]);

  useEffect(() => {
    if (selectedStudentId) {
      const student = students.find(s => s.id === selectedStudentId);
      if (student) {
        setStudentSearchTerm(student.name);
      }
    } else {
      setSelectedLessonId('');
    }
  }, [selectedStudentId, students]);

  useEffect(() => {
    if (!selectedStudentId) {
      setSelectedStudentLessons([]);
      return;
    }
    const q = query(collection(db, 'lessons'), where('studentId', '==', selectedStudentId));
    const unsub = onSnapshot(q, (snapshot: any) => {
      setSelectedStudentLessons(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Lesson)));
    }, (error: any) => {
      console.error("Error fetching student lessons:", error);
    });
    return () => unsub();
  }, [selectedStudentId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const safeFormat = (date: Date | any, formatStr: string, options?: any) => {
    try {
      if (!date || isNaN(new Date(date).getTime())) return 'N/A';
      return format(new Date(date), formatStr, options);
    } catch (e) {
      return 'N/A';
    }
  };

  // Lessons for the selected student
  const allStudentRecords = selectedStudentId 
    ? selectedStudentLessons.filter(l => l.status !== 'cancelled')
             .sort((a, b) => {
                const dateA = toDate(a.startTime)?.getTime() || 0;
                const dateB = toDate(b.startTime)?.getTime() || 0;
                return dateB - dateA; // newest first
             })
    : [];

  const studentLessons = allStudentRecords.filter(l => !l.isStudyTask);
  const studentStudyTasks = allStudentRecords.filter(l => l.isStudyTask);

  const filteredStudentLessons = studentLessons.filter(l => {
    const lessonDate = toDate(l.startTime);
    if (!lessonDate) return false;
    return format(lessonDate, 'yyyy-MM') === selectedMonth;
  });

  const completedLessons = filteredStudentLessons.filter(l => l.status === 'completed' || !!l.notes);
  const pendingLessons = filteredStudentLessons.filter(l => l.status !== 'completed' && !l.notes);

  const selectedLesson = studentLessons.find(l => l.id === selectedLessonId) || null;

  // Filter out future lessons from the timeline view (only show today and past OR if it already has notes)
  const timelineLessons = studentLessons.filter(l => {
    const lessonDate = toDate(l.startTime);
    if (!lessonDate) return false;
    
    // Always show if it already has a diary entry or is completed
    if (l.notes || l.status === 'completed') return true;

    // Hide lessons scheduled for strictly after the end of today
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return lessonDate.getTime() <= endOfToday.getTime();
  });

  const visibleStudents = students.filter(s => {
    if (profile.role === 'admin') return true;
    if (profile.role === 'teacher' && profile.teacherId) {
      const isEnrolledWithTeacher = s.enrollments?.some(e => e.teacherId === profile.teacherId);
      const hasLessonsWithTeacher = lessons.some(l => l.studentId === s.id);
      return isEnrolledWithTeacher || hasLessonsWithTeacher;
    }
    return false;
  }).filter(s => s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      const validFiles = filesArray.filter(f => f.type.startsWith('image/'));
      if (validFiles.length !== filesArray.length) {
         setFeedback({ isOpen: true, type: 'warning', title: 'Aviso', message: 'Apenas arquivos de imagem são permitidos.' });
      }
      setSelectedPhotos(prev => [...prev, ...validFiles]);
    }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveSavedPhoto = async (photoUrlToRemove: string) => {
    if (!selectedLesson) return;
    try {
      const newPhotoUrls = (selectedLesson.photoUrls || []).filter(url => url !== photoUrlToRemove);
      await setDoc(doc(db, 'lessons', selectedLesson.id), {
        photoUrls: newPhotoUrls
      }, { merge: true });
      // We don't need to manually update selectedLesson because the onSnapshot will re-render with the new data
      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Foto removida.' });
    } catch (err: any) {
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao remover foto: ' + err.message });
    }
  };

  const handleAddStudyDate = () => {
    if (tempStudyDate && !studyDates.includes(tempStudyDate)) {
      setStudyDates(prev => [...prev, tempStudyDate].sort());
    }
  };

  const handleRemoveStudyDate = (dateToRemove: string) => {
    setStudyDates(prev => prev.filter(d => d !== dateToRemove));
  };

  const visibleModules = libraryModules.filter(m => {
    if (profile.role === 'admin') return true;
    if (teacherData?.canManageLibrary) return true;
    
    const teacherInsts = teacherData?.instruments || [];

    const isExplicitlyVisibleToTeacher = topics.some(t => 
      t.moduleName === m.name && 
      t.visibleToTeachers?.includes(profile.teacherId as string)
    );
    if (isExplicitlyVisibleToTeacher) return true;

    if (m.instrument) {
      return teacherInsts.includes(m.instrument);
    }
    
    // Fallback: If the module doesn't have an explicit instrument set (e.g. older modules),
    // we check if its name contains any known instrument.
    const moduleNameLower = m.name.toLowerCase();
    const hasAnyInstrumentInName = instruments.some(inst => 
      moduleNameLower.includes(inst.name.toLowerCase())
    );

    if (hasAnyInstrumentInName) {
      // It mentions an instrument in the name. Let's see if the teacher teaches THIS instrument.
      return teacherInsts.some(inst => moduleNameLower.includes(inst.toLowerCase()));
    }

    // Generic modules visible to all
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLesson) return;
    if (!notes.trim()) {
      setFeedback({ isOpen: true, type: 'warning', title: 'Aviso', message: 'Por favor, escreva o resumo da aula antes de salvar.' });
      return;
    }

    setIsSubmitting(true);
    try {
      let photoUrls: string[] = selectedLesson.photoUrls || [];

      // Upload photos if any
      if (selectedPhotos.length > 0) {
        for (const file of selectedPhotos) {
          const fileRef = ref(storage, `lesson_photos/${selectedLesson.id}/${Date.now()}_${file.name}`);
          const uploadTask = await uploadBytesResumable(fileRef, file);
          const downloadUrl = await getDownloadURL(uploadTask.ref);
          photoUrls.push(downloadUrl);
        }
      }

      await setDoc(doc(db, 'lessons', selectedLesson.id), {
        status: 'completed',
        notes: notes.trim(),
        photoUrls: photoUrls
      }, { merge: true });

      // Handle Module Unlock if selected
      if (selectedModuleToUnlock) {
        let moduleTopics = topics.filter(t => t.moduleName === selectedModuleToUnlock);
        if (selectedTopicsToUnlock.length > 0) {
          moduleTopics = moduleTopics.filter(t => selectedTopicsToUnlock.includes(t.id));
        }

        if (moduleTopics.length > 0) {
          const batch = writeBatch(db);
          for (const topic of moduleTopics) {
            const currentIds = topic.visibleToStudents || [];
            const newIdsSet = new Set([...currentIds, selectedStudentId]);
            batch.update(doc(db, 'library', topic.id), {
              visibleToStudents: Array.from(newIdsSet)
            });
          }

          // Schedule topics if dates are provided
          let finalDates = [...studyDates];
          if (finalDates.length === 0 && tempStudyDate) {
            finalDates.push(tempStudyDate);
          }

          if (finalDates.length > 0) {
            const assignedTeacherId = profile.role === 'teacher' ? profile.teacherId : selectedLesson.teacherId;
            for (const topic of moduleTopics) {
              for (const dateStr of finalDates) {
                 const startDateTime = new Date(`${dateStr}T00:00:00`);
                 const endDateTime = new Date(`${dateStr}T23:59:59`);
                 const taskRef = doc(collection(db, 'lessons'));
                 batch.set(taskRef, {
                    studentId: selectedStudentId,
                    teacherId: assignedTeacherId || '',
                    instrument: 'Estudo',
                    startTime: Timestamp.fromDate(startDateTime),
                    endTime: Timestamp.fromDate(endDateTime),
                    status: 'scheduled',
                    isStudyTask: true,
                    topicId: topic.id,
                    topicTitle: topic.title,
                    topicUrl: topic.url || '',
                    suggestedDuration: Number(studyDuration) || 30
                 });
              }
            }
          }

          await batch.commit();

          // Send WhatsApp Notification
          const student = students.find(s => s.id === selectedStudentId);
          if (student && student.phone) {
            const settingsDoc = await getDoc(doc(db, 'settings', 'integrations'));
            const whatsappEngine = settingsDoc.exists() ? settingsDoc.data().whatsappEngine : 'api';
            
            const fn = getFunctions();
            const notifyMaterialUnlocked = httpsCallable(fn, 'notifyMaterialUnlocked');
            await notifyMaterialUnlocked({
              studentId: student.id,
              studentName: student.name,
              studentPhone: student.phone,
              topicTitle: `Módulo completo: ${selectedModuleToUnlock}`,
              teacherName: profile.displayName || 'Professor',
              engine: whatsappEngine
            }).catch(console.error);
          }
        }
      }

      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Diário de aula salvo com sucesso.' });
      
      setSelectedMonth(format(new Date(), 'yyyy-MM'));
      setSelectedModuleToUnlock('');
      setSelectedTopicsToUnlock([]);
      setStudyDates([]);
      setSelectedPhotos([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar: ' + err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearDiary = async () => {
    if (!selectedLesson) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Zerar Diário',
      message: 'Tem certeza que deseja zerar este diário? As fotos e o texto serão permanentemente apagados.',
      onConfirm: async () => {
        try {
          await setDoc(doc(db, 'lessons', selectedLesson.id), {
            status: 'scheduled',
            notes: '',
            photoUrls: []
          }, { merge: true });

          setNotes('');
          setSelectedPhotos([]);
          setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'O diário de aula foi resetado.' });
        } catch (err: any) {
          console.error(err);
          setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao zerar: ' + err.message });
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Agendamento',
      message: 'Tem certeza que deseja excluir este agendamento de estudo?',
      onConfirm: async () => {
        try {
          await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(doc(db, 'lessons', taskId)));
          setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Tarefa excluída.' });
        } catch (err: any) {
          console.error(err);
          setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao excluir: ' + err.message });
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleEditTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToEdit || !editTaskDate) return;
    try {
      const startDateTime = new Date(`${editTaskDate}T00:00:00`);
      const endDateTime = new Date(`${editTaskDate}T23:59:59`);
      await setDoc(doc(db, 'lessons', taskToEdit.id), {
        startTime: Timestamp.fromDate(startDateTime),
        endTime: Timestamp.fromDate(endDateTime),
        suggestedDuration: Number(editTaskDuration) || 30
      }, { merge: true });
      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Tarefa atualizada.' });
      setTaskToEdit(null);
    } catch (err: any) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao editar: ' + err.message });
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
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-zinc-500 mb-8">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 bg-zinc-100 text-zinc-700 font-bold py-3 px-4 rounded-2xl hover:bg-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 bg-red-500 text-white font-bold py-3 px-4 rounded-2xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/25"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="bg-white p-6 md:p-8 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03]">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-bold display-font flex items-center gap-2">
                <FileText className="w-6 h-6 text-orange-500" />
                Diário de Aula
              </h2>
              <p className="text-sm text-zinc-500 mt-1">Selecione um aluno para preencher o diário ou visualizar o histórico.</p>
            </div>
            
            <div className="w-full md:w-80 relative" ref={studentDropdownRef}>
              <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">Filtrar por Aluno</label>
              
              <div 
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-orange-500/20 font-medium text-black flex items-center gap-2 cursor-text"
                onClick={() => setIsStudentDropdownOpen(true)}
              >
                <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                <input 
                  type="text"
                  placeholder="Buscar aluno..."
                  value={studentSearchTerm}
                  onChange={(e) => {
                    setStudentSearchTerm(e.target.value);
                    setIsStudentDropdownOpen(true);
                  }}
                  onFocus={() => setIsStudentDropdownOpen(true)}
                  className="bg-transparent border-none outline-none w-full"
                />
                {selectedStudentId && (
                  <button 
                    onClick={(e) => {
                       e.stopPropagation();
                       setSelectedStudentId('');
                       setStudentSearchTerm('');
                       setSelectedLessonId('');
                       setNotes('');
                       setSelectedPhotos([]);
                    }}
                    className="text-zinc-400 hover:text-zinc-600 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isStudentDropdownOpen && (
                <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden z-50 max-h-60 overflow-y-auto">
                  {visibleStudents.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 text-sm">Nenhum aluno encontrado</div>
                  ) : (
                    visibleStudents.map(s => (
                      <div 
                        key={s.id}
                        onClick={() => {
                          setSelectedStudentId(s.id);
                          setStudentSearchTerm(s.name);
                          setIsStudentDropdownOpen(false);
                          setSelectedLessonId('');
                          setNotes('');
                          setSelectedPhotos([]);
                        }}
                        className={cn(
                          "px-4 py-3 cursor-pointer hover:bg-orange-50 transition-colors border-b border-zinc-50 last:border-0",
                          selectedStudentId === s.id ? "bg-orange-50 text-orange-700 font-bold" : "text-zinc-700"
                        )}
                      >
                        {s.name} {s.status !== 'active' && <span className="text-xs text-red-500 ml-2">(Inativo)</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {!selectedStudentId ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <User className="w-10 h-10 text-orange-500 opacity-50" />
              </div>
              <p className="text-zinc-500 font-medium">Por favor, selecione um aluno para visualizar o diário.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              
              <div className="flex bg-zinc-100 p-1 rounded-2xl w-full max-w-md mx-auto relative z-10">
                <button
                  onClick={() => setActiveTab('diary')}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                    activeTab === 'diary' ? "bg-white text-orange-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <FileText className="w-4 h-4" />
                  Aulas e Anotações
                </button>
                <button
                  onClick={() => setActiveTab('studies')}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                    activeTab === 'studies' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <Headphones className="w-4 h-4" />
                  Estudos Práticos
                </button>
              </div>

              {activeTab === 'diary' ? (
                <>
                  {/* Top Section: Form */}
                  <div className="max-w-4xl mx-auto w-full space-y-6">
                <div className="bg-zinc-50 rounded-3xl p-6 border border-zinc-100">
                  <h3 className="text-lg font-bold display-font mb-4">Preencher Relatório</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">Mês Vigente</label>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-black"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">Aula Selecionada</label>
                      <select
                        value={selectedLessonId}
                        onChange={(e) => {
                          setSelectedLessonId(e.target.value);
                          const lesson = lessons.find(l => l.id === e.target.value);
                          setNotes(lesson?.notes || '');
                          setSelectedPhotos([]);
                        }}
                        className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-black"
                      >
                    <option value="">Selecione uma aula...</option>
                    {pendingLessons.length > 0 && <optgroup label="Aulas Pendentes de Relatório">
                      {pendingLessons.map(l => (
                        <option key={l.id} value={l.id}>
                           {safeFormat(toDate(l.startTime), "dd/MM/yyyy 'às' HH:mm")}
                        </option>
                      ))}
                    </optgroup>}
                    {completedLessons.length > 0 && <optgroup label="Aulas com Diário Salvo">
                      {completedLessons.map(l => (
                        <option key={l.id} value={l.id}>
                           {safeFormat(toDate(l.startTime), "dd/MM/yyyy 'às' HH:mm")}
                        </option>
                      ))}
                    </optgroup>}
                  </select>
                  </div>
                </div>

                  {selectedLesson ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2 flex items-center gap-2">
                           Resumo da Aula
                           {selectedLesson.notes && <span className="bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Já preenchido</span>}
                        </label>
                        <textarea 
                          required
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder="O que foi estudado hoje?"
                          className="w-full bg-white border border-zinc-200 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all min-h-[150px] resize-y"
                        />
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-zinc-200">
                        <label className="block text-sm font-medium text-zinc-700 mb-2 flex items-center justify-between">
                           <span>Anexos (Fotos)</span>
                           <button 
                             type="button" 
                             onClick={() => fileInputRef.current?.click()}
                             className="text-orange-500 text-xs font-bold hover:text-orange-600 flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-lg transition-colors"
                           >
                             <Camera className="w-3.5 h-3.5" /> Adicionar
                           </button>
                        </label>
                        
                        <input 
                           type="file" 
                           multiple 
                           accept="image/*" 
                           onChange={handleFileChange} 
                           className="hidden" 
                           ref={fileInputRef}
                        />

                        {/* Existing photos preview safely typed */}
                        {selectedLesson.photoUrls && selectedLesson.photoUrls.length > 0 && (
                          <div className="mb-3">
                            <p className="text-[10px] uppercase font-bold text-zinc-400 mb-2 tracking-wider">Fotos já salvas nesta aula</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedLesson.photoUrls.map((url, idx) => (
                                <div key={idx} className="relative group rounded-xl overflow-hidden shadow-sm border border-zinc-100 w-16 h-16 flex-shrink-0 bg-zinc-100 block">
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full cursor-pointer">
                                    <img src={url} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover group-hover:opacity-75 transition-opacity" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                       <Link className="w-4 h-4 text-white" />
                                    </div>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleRemoveSavedPhoto(url);
                                    }}
                                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    title="Remover foto"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* New selected photos preview */}
                        {selectedPhotos.length > 0 ? (
                           <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-50">
                              {selectedPhotos.map((photo, idx) => (
                                <div key={idx} className="relative group rounded-xl overflow-hidden shadow-sm border border-zinc-200 w-16 h-16 flex-shrink-0 bg-zinc-100">
                                  <img src={URL.createObjectURL(photo)} alt="Preview" className="w-full h-full object-cover" />
                                  <button
                                     type="button"
                                     onClick={() => removePhoto(idx)}
                                     className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                     <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                           </div>
                        ) : (!selectedLesson.photoUrls || selectedLesson.photoUrls.length === 0) && (
                           <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-zinc-100 rounded-xl bg-zinc-50/50">
                             <ImageIcon className="w-8 h-8 text-zinc-300 mb-2" />
                             <p className="text-xs text-zinc-400">Nenhuma foto adicionada ainda.</p>
                           </div>
                        )}
                      </div>

                      <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 mt-6">
                        <label className="block text-sm font-bold text-orange-900 mb-2 flex items-center gap-2">
                           <BookOpen className="w-4 h-4" />
                           Liberar Material de Estudo (Opcional)
                        </label>
                        <p className="text-xs text-orange-700 mb-3">Selecione um módulo e os tópicos específicos. Ao salvar, eles serão liberados para o aluno e ele será notificado no WhatsApp.</p>
                        <select
                          value={selectedModuleToUnlock}
                          onChange={(e) => {
                            const moduleName = e.target.value;
                            setSelectedModuleToUnlock(moduleName);
                            if (moduleName) {
                              const moduleTopics = topics.filter(t => t.moduleName === moduleName);
                              setSelectedTopicsToUnlock(moduleTopics.map(t => t.id));
                            } else {
                              setSelectedTopicsToUnlock([]);
                            }
                          }}
                          className="w-full bg-white border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-black"
                        >
                          <option value="">Nenhum material adicional</option>
                          {visibleModules.map(m => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                        
                        {selectedModuleToUnlock && (
                          <div className="mt-4 pt-4 border-t border-orange-200/50">
                             <label className="block text-sm font-bold text-orange-900 mb-3 flex items-center gap-2">
                               <BookOpen className="w-4 h-4" />
                               Tópicos para Liberar
                             </label>
                             <div className="space-y-2 mb-6">
                               {topics.filter(t => t.moduleName === selectedModuleToUnlock).map(topic => (
                                 <label key={topic.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-orange-100/50 rounded-lg transition-colors">
                                   <input 
                                     type="checkbox" 
                                     checked={selectedTopicsToUnlock.includes(topic.id)}
                                     onChange={(e) => {
                                       if (e.target.checked) {
                                         setSelectedTopicsToUnlock([...selectedTopicsToUnlock, topic.id]);
                                       } else {
                                         setSelectedTopicsToUnlock(selectedTopicsToUnlock.filter(id => id !== topic.id));
                                       }
                                     }}
                                     className="w-4 h-4 text-orange-600 rounded border-orange-300 focus:ring-orange-500"
                                   />
                                   <span className="text-sm font-medium text-zinc-700">{topic.title}</span>
                                 </label>
                               ))}
                             </div>

                             <label className="block text-sm font-bold text-orange-900 mb-3 flex items-center gap-2 pt-4 border-t border-orange-200/50">
                               <CalendarDays className="w-4 h-4" />
                               Agendar Estudo na Sala de Prática
                             </label>
                             <div className="flex flex-col sm:flex-row gap-3 mb-4">
                               <input 
                                 type="date"
                                 value={tempStudyDate}
                                 onChange={e => setTempStudyDate(e.target.value)}
                                 className="flex-1 bg-white border border-orange-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                               />
                               <button
                                 type="button"
                                 onClick={handleAddStudyDate}
                                 className="bg-orange-100 text-orange-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-200 transition-colors"
                               >
                                 Adicionar Data
                               </button>
                             </div>

                             {studyDates.length > 0 && (
                               <div className="flex flex-wrap gap-2 mb-4">
                                 {studyDates.map(d => (
                                   <div key={d} className="flex items-center gap-1 bg-white border border-orange-200 text-orange-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                                     {format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy')}
                                     <button type="button" onClick={() => handleRemoveStudyDate(d)} className="hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                                   </div>
                                 ))}
                               </div>
                             )}

                             <div>
                               <label className="block text-xs font-bold text-orange-700 mb-1">Duração Sugerida (minutos por tópico)</label>
                               <input 
                                 type="number"
                                 min="1"
                                 step="1"
                                 value={studyDuration}
                                 onChange={e => setStudyDuration(e.target.value)}
                                 className="w-full bg-white border border-orange-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                               />
                             </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button 
                          type="submit"
                          disabled={isSubmitting || (profile.role !== 'admin' && selectedLesson.teacherId !== profile.teacherId)}
                          title={profile.role !== 'admin' && selectedLesson.teacherId !== profile.teacherId ? "Apenas o administrador ou o professor da aula podem salvá-la" : ""}
                          className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98] disabled:opacity-50"
                        >
                          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                          {isSubmitting ? 'Salvando...' : 'Salvar Diário de Aula'}
                        </button>

                        {(profile.role === 'admin' || selectedLesson.teacherId === profile.teacherId) && selectedLesson.notes && (
                          <button
                            type="button"
                            onClick={handleClearDiary}
                            className="px-6 py-4 rounded-2xl bg-zinc-100 text-zinc-500 font-bold hover:bg-zinc-200 hover:text-red-500 transition-colors flex items-center justify-center gap-2"
                            title="Desfazer preenchimento e voltar aula para pendente"
                          >
                            <Trash className="w-5 h-5" /> Zerar
                          </button>
                        )}
                      </div>
                    </form>
                  ) : (
                    <div className="py-10 text-center">
                       <p className="text-zinc-400 italic text-sm">Nenhuma aula selecionada para preenchimento.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Section: Timeline History */}
              <div className="w-full">
                <div className="bg-white rounded-3xl p-6 md:p-8 border border-zinc-100 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <h3 className="text-lg font-bold display-font flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-500" />
                        Histórico Acadêmico
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">Exibindo aulas de hoje e passadas em ordem decrescente.</p>
                    </div>
                  </div>

                  {timelineLessons.length === 0 ? (
                    <div className="py-20 text-center text-zinc-400">
                      Nenhuma aula registrada para este aluno.
                    </div>
                  ) : (
                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent">
                      {timelineLessons.map((lesson, idx) => {
                        const isCompleted = lesson.status === 'completed' || !!lesson.notes;
                        const lessonDate = toDate(lesson.startTime);
                        
                        return (
                          <div key={lesson.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                            {/* Marker */}
                            <div className={cn(
                               "flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10 hidden md:flex",
                               isCompleted ? "bg-orange-500 text-white" : "bg-zinc-200 text-zinc-500"
                            )}>
                              {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            </div>

                            {/* Mobile marker */}
                            <div className={cn(
                               "flex md:hidden items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 shadow-sm relative z-10",
                               isCompleted ? "bg-orange-500 text-white" : "bg-zinc-200 text-zinc-500"
                            )}>
                              {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            </div>

                            {/* Card */}
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                              <div className={cn(
                                "p-5 rounded-2xl border transition-all cursor-pointer hover:shadow-md",
                                selectedLessonId === lesson.id ? "ring-2 ring-orange-500 border-orange-100 bg-orange-50/50" : "border-zinc-100 bg-white hover:border-zinc-200"
                              )} onClick={() => {
                                setSelectedLessonId(lesson.id);
                                setNotes(lesson.notes || '');
                                setSelectedPhotos([]);
                              }}>
                                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                     <span className="font-bold text-black">{safeFormat(lessonDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                                     <span className="text-xs text-zinc-500 font-medium">às {safeFormat(lessonDate, 'HH:mm')}</span>
                                  </div>
                                  <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                    isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                                  )}>
                                    {isCompleted ? 'Concluída' : 'Pendente'}
                                  </span>
                                </div>
                                
                                {lesson.notes ? (
                                  <p className="text-sm text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-100 italic">
                                     "{lesson.notes}"
                                  </p>
                                ) : (
                                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    Diário pendente de preenchimento.
                                  </div>
                                )}

                                {/* Render attached photos */}
                                {lesson.photoUrls && lesson.photoUrls.length > 0 && (
                                  <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                    {lesson.photoUrls.map((url, pIdx) => (
                                      <a key={pIdx} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 shadow-sm block hover:opacity-80 transition-opacity">
                                        <img src={url} alt={`Anexo ${pIdx + 1}`} className="w-full h-full object-cover" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              </>
              ) : (
                <div className="w-full">
                  <div className="bg-white rounded-3xl p-6 md:p-8 border border-zinc-100 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-lg font-bold display-font flex items-center gap-2">
                          <Headphones className="w-5 h-5 text-emerald-500" />
                          Estudos Práticos Concluídos
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">Exibindo os estudos que o aluno marcou como concluído na Sala de Prática.</p>
                      </div>
                    </div>

                    {studentStudyTasks.length > 0 && (() => {
                      const totalStudyTasks = studentStudyTasks.length;
                      const completedStudyTasks = studentStudyTasks.filter(t => t.status === 'completed').length;
                      const studyProgress = Math.round((completedStudyTasks / totalStudyTasks) * 100);

                      return (
                        <div className="mb-8 p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-sm font-black">{studyProgress}%</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-bold text-emerald-900">Progresso Geral das Práticas</span>
                            </div>
                            <div className="w-full bg-emerald-200/50 rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${studyProgress}%` }}></div>
                            </div>
                            <p className="text-xs text-emerald-700 mt-2 font-medium">
                              {completedStudyTasks} de {totalStudyTasks} tarefas agendadas foram concluídas.
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {studentStudyTasks.length === 0 ? (
                      <div className="py-20 text-center text-zinc-400">
                        Nenhum estudo agendado para este aluno.
                      </div>
                    ) : (
                      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent">
                        {studentStudyTasks.map((task) => {
                          const isCompleted = task.status === 'completed';
                          const lessonDate = toDate(task.startTime);
                          const topic = topics.find(t => t.id === task.topicId);
                          
                          return (
                            <div key={task.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                              {/* Marker */}
                              <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10 hidden md:flex",
                                isCompleted ? "bg-emerald-500 text-white" : "bg-orange-500 text-white"
                              )}>
                                {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                              </div>

                              {/* Mobile marker */}
                              <div className={cn(
                                "flex md:hidden items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 shadow-sm relative z-10",
                                isCompleted ? "bg-emerald-500 text-white" : "bg-orange-500 text-white"
                              )}>
                                {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                              </div>

                              {/* Card */}
                              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                                <div className={cn("p-5 rounded-2xl border bg-white", isCompleted ? "border-zinc-100" : "border-orange-100 shadow-[0_0_15px_rgba(249,115,22,0.05)]")}>
                                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                       <span className="font-bold text-black">{safeFormat(lessonDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {(!isCompleted && (profile.role === 'admin' || task.teacherId === profile.teacherId)) && (
                                        <>
                                          <button
                                            onClick={() => {
                                              setTaskToEdit(task);
                                              setEditTaskDate(lessonDate ? format(lessonDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
                                              setEditTaskDuration(task.suggestedDuration?.toString() || '30');
                                            }}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-2 py-1 rounded"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="text-xs text-red-600 hover:text-red-800 font-bold bg-red-50 px-2 py-1 rounded"
                                          >
                                            Excluir
                                          </button>
                                        </>
                                      )}
                                      <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700")}>
                                        {isCompleted ? 'Concluído' : 'Pendente'}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className={cn("p-4 rounded-xl border", isCompleted ? "bg-emerald-50 border-emerald-100" : "bg-orange-50 border-orange-100")}>
                                     <p className={cn("text-sm font-bold mb-1", isCompleted ? "text-emerald-900" : "text-orange-900")}>
                                        {topic?.title || 'Material da Biblioteca'}
                                     </p>
                                     {topic?.moduleName && (
                                        <p className={cn("text-[10px] uppercase font-bold tracking-wider mb-2", isCompleted ? "text-emerald-600" : "text-orange-600")}>{topic.moduleName}</p>
                                     )}
                                     {topic?.description && (
                                        <p className="text-xs text-zinc-600 mb-3 line-clamp-2">{topic.description}</p>
                                     )}
                                     <p className={cn("text-xs font-medium flex items-center gap-1.5", isCompleted ? "text-emerald-700" : "text-orange-700")}>
                                        <Clock className="w-3.5 h-3.5" /> {isCompleted ? 'Praticou por' : 'Sugerido:'} {task.suggestedDuration || 30} min
                                     </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {taskToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative my-8">
            <button onClick={() => setTaskToEdit(null)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold display-font text-zinc-900 mb-6">Editar Tarefa</h3>
            <form onSubmit={handleEditTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Nova Data</label>
                <input 
                  type="date"
                  required
                  value={editTaskDate}
                  onChange={(e) => setEditTaskDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Duração Sugerida (min)</label>
                <input 
                  type="number"
                  min="1"
                  required
                  value={editTaskDuration}
                  onChange={(e) => setEditTaskDuration(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors mt-2"
              >
                Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
