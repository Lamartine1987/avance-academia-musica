import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, getDocs, where, orderBy, getDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { UserProfile, LibraryTopic, Student, Teacher, LibraryModule, Lesson } from '../types';
import { BookOpen, Plus, Trash2, X, FileText, Video, Headphones, ExternalLink, Loader2, ChevronDown, ChevronUp, LockOpen, GraduationCap, Settings, CalendarDays, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';
import StudySession from './StudySession';
import { cn } from '../lib/utils';

interface LibraryProps {
  profile: UserProfile;
}

export default function Library({ profile }: LibraryProps) {
  const [topics, setTopics] = useState<LibraryTopic[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showModulesModal, setShowModulesModal] = useState(false);
  const [libraryModules, setLibraryModules] = useState<LibraryModule[]>([]);
  const [newModuleName, setNewModuleName] = useState('');
  
  // Form Activity
  const [inputType, setInputType] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  const [moduleName, setModuleName] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<MaterialType>('link');
  const [description, setDescription] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<LibraryTopic | null>(null);
  const [editingTopic, setEditingTopic] = useState<LibraryTopic | null>(null);
  const [topicToUnlock, setTopicToUnlock] = useState<LibraryTopic | null>(null);
  const [topicToSchedule, setTopicToSchedule] = useState<LibraryTopic | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [moduleToUnlock, setModuleToUnlock] = useState<string | null>(null);
  const [showModuleUnlockModal, setShowModuleUnlockModal] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedStudentsForSchedule, setSelectedStudentsForSchedule] = useState<string[]>([]);
  const [selectedStudentsForModule, setSelectedStudentsForModule] = useState<string[]>([]);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [tempStudyDate, setTempStudyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [studyDuration, setStudyDuration] = useState('30');
  const [activeTab, setActiveTab] = useState<'library' | 'diary'>('library');
  const [diaryLessons, setDiaryLessons] = useState<Lesson[]>([]);
  const [studyTasks, setStudyTasks] = useState<Lesson[]>([]);
  const [activeSessionTopic, setActiveSessionTopic] = useState<LibraryTopic | null>(null);
  const [activeSessionTask, setActiveSessionTask] = useState<Lesson | null>(null);

  const isAdmin = profile.role === 'admin';
  const isTeacher = profile.role === 'teacher';
  const isStudent = profile.role === 'student';

  const canManageLibrary = isAdmin || (isTeacher && teacherData?.canManageLibrary);

  useEffect(() => {
    if (isTeacher && profile.teacherId) {
      const unsub = onSnapshot(doc(db, 'teachers', profile.teacherId), (doc) => {
        if (doc.exists()) {
          setTeacherData({ id: doc.id, ...doc.data() } as Teacher);
        }
      });
      return () => unsub();
    }
  }, [isTeacher, profile.teacherId]);

  useEffect(() => {
    if (isAdmin || isTeacher) {
      const fetchStudents = async () => {
        const q = query(collection(db, 'students'), where('status', '==', 'active'));
        const snap = await getDocs(q);
        let activeStudents = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).sort((a, b) => a.name.localeCompare(b.name));
        
        if (isTeacher && profile.teacherId) {
          activeStudents = activeStudents.filter(s => s.enrollments.some(e => e.teacherId === profile.teacherId));
        }
        setStudents(activeStudents);
      };
      fetchStudents();
    }
  }, [isAdmin, isTeacher]);

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

  useEffect(() => {
    let unsubTasks: any = () => {};
    if (isStudent && profile.studentId) {
      const qAllLessons = query(collection(db, 'lessons'), where('studentId', '==', profile.studentId));
      unsubTasks = onSnapshot(qAllLessons, (snap) => {
        const allLessons = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson));
        
        // Filter into Study Tasks
        setStudyTasks(allLessons.filter(l => l.isStudyTask));
        
        // Filter into Diary Lessons (past classes that are completed or have notes)
        const pastDiaryLessons = allLessons.filter(l => !l.isStudyTask && (l.status === 'completed' || !!l.notes));
        // Sort from newest to oldest
        pastDiaryLessons.sort((a, b) => {
          const dateA = toDate(a.startTime)?.getTime() || 0;
          const dateB = toDate(b.startTime)?.getTime() || 0;
          return dateB - dateA;
        });
        
        setDiaryLessons(pastDiaryLessons);
      });
    }

    const q = query(collection(db, 'library'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryTopic));
      
      // Se for aluno, só ver o que está liberado pra ele
      if (isStudent && profile.studentId) {
        fetched = fetched.filter(t => t.visibleToStudents?.includes(profile.studentId as string));
      }

      setTopics(fetched);
      
      // Auto expand all modules initially
      const uniqueModules = Array.from(new Set(fetched.map(t => t.moduleName)));
      setExpandedModules(uniqueModules);
      
      setLoading(false);
    });

    const qModules = query(collection(db, 'library_modules'), orderBy('name', 'asc'));
    const unsubModules = onSnapshot(qModules, (snap) => {
       setLibraryModules(snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryModule)));
    });

    return () => { unsub(); unsubModules(); unsubTasks(); };
  }, [isStudent, profile.studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageLibrary) return;
    if (!title || !moduleName) return;
    
    // If we are creating new OR we are editing and user selected 'url'/'upload' and provided a new file/url
    if (!editingTopic) {
      if (inputType === 'url' && !url) return;
      if (inputType === 'upload' && !file) return;
    }

    setIsSubmitting(true);

    try {
      let finalUrl = editingTopic ? editingTopic.url : '';

      if (inputType === 'url' && url) {
        finalUrl = url;
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
          finalUrl = 'https://' + finalUrl;
        }
      } else if (inputType === 'upload' && file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storageRef = ref(storage, `library/${fileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        finalUrl = await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => reject(error),
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            }
          );
        });
      }

      const libraryData: any = {
        moduleName,
        title,
        url: finalUrl,
        type,
        description,
      };

      if (editingTopic) {
        await updateDoc(doc(db, 'library', editingTopic.id), libraryData);
      } else {
        libraryData.createdBy = profile.uid;
        libraryData.createdByName = profile.displayName || 'Admin';
        libraryData.visibleToStudents = [];
        libraryData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'library'), libraryData);
      }
      
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar tópico.');
      setIsSubmitting(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicToUnlock) return;
    
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'library', topicToUnlock.id), {
        visibleToStudents: selectedStudentIds
      });

      const currentIds = topicToUnlock.visibleToStudents || [];
      const newlyAddedIds = selectedStudentIds.filter(id => !currentIds.includes(id));
      const removedIds = currentIds.filter(id => !selectedStudentIds.includes(id));

      // Remove study tasks for students whose access was revoked
      if (removedIds.length > 0) {
        const tasksQuery = query(
          collection(db, 'lessons'),
          where('topicId', '==', topicToUnlock.id),
          where('isStudyTask', '==', true)
        );
        const snap = await getDocs(tasksQuery);
        const batchDelete = writeBatch(db);
        let hasDeletes = false;
        snap.docs.forEach(docSnap => {
          if (removedIds.includes(docSnap.data().studentId)) {
            batchDelete.delete(docSnap.ref);
            hasDeletes = true;
          }
        });
        if (hasDeletes) {
          await batchDelete.commit();
        }
      }

      // WhatsApp Notification
      if (newlyAddedIds.length > 0) {
        try {
          const tSnap = await getDocs(query(collection(db, 'templates'), where('type', '==', 'material_added')));
          const docTpl = tSnap.docs.find(d => d.data().isAutomatic === true);
          
          if (docTpl) {
            const template = docTpl.data();
            const setSnap = await getDoc(doc(db, 'settings', 'integrations'));
            
            if (setSnap.exists()) {
              const { whatsappEngine, zapiInstance, zapiToken, zapiSecurityToken, apizUrl, apizToken, apizInstanceName } = setSnap.data() as any;
              const isApiz = whatsappEngine === 'apiz';
              
              if ((isApiz && apizUrl) || (!isApiz && zapiInstance && zapiToken)) {
                for (const studentId of newlyAddedIds) {
                  const student = students.find(s => s.id === studentId);
                  if (student && student.phone) {
                    const cleanPhone = student.phone.replace(/\D/g, '');
                    if (cleanPhone.length >= 10) {
                      const number = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
                      let msg = template.content.replace(/{nome}/g, student.name.split(' ')[0]);
                      msg = msg.replace(/{aluno}/g, student.name.split(' ')[0]);
                      msg = msg.replace(/{professor}/g, profile.displayName || 'Seu Professor');
                      msg = msg.replace(/{material}/g, topicToUnlock.title);
                      msg = msg.replace(/{material_nome}/g, topicToUnlock.title);
                      msg = msg.replace(/{link}/g, topicToUnlock.url);
                      
                      if (isApiz) {
                         const baseUrl = apizUrl.replace(/\/send-text\/?$/, '').replace(/\/$/, '');
                         fetch(`${baseUrl}/send-text`, {
                           method: 'POST',
                           headers: {
                              'Content-Type': 'application/json',
                              'x-api-key': apizToken || ''
                           },
                           body: JSON.stringify({
                              instanceName: apizInstanceName || 'teste-crm',
                              number: number,
                              text: msg
                           })
                         }).catch(console.error);
                      } else {
                         const headers: any = { 'Content-Type': 'application/json' };
                         if (zapiSecurityToken) headers['Client-Token'] = zapiSecurityToken;
                         
                         const url = zapiToken?.startsWith('http') ? zapiToken : `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`;
                         fetch(url, {
                           method: 'POST',
                           headers,
                           body: JSON.stringify({ instanceName: zapiInstance, phone: number, message: msg })
                         }).catch(console.error);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Erro ao notificar liberação via whatsapp:", e);
        }
      }
      
      setShowUnlockModal(false);
      setTopicToUnlock(null);
      setSelectedStudentIds([]);
    } catch (err) {
      console.error(err);
      alert('Erro ao liberar tópico para alunos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicToSchedule) return;
    
    setIsSubmitting(true);
    try {
      let finalDates = [...studyDates];
      if (finalDates.length === 0 && tempStudyDate) {
        finalDates.push(tempStudyDate);
      }

      if (finalDates.length > 0 && selectedStudentsForSchedule.length > 0) {
        const batch = writeBatch(db);
        const teacherId = isTeacher ? profile.teacherId : profile.uid;
        
        selectedStudentsForSchedule.forEach(studentId => {
          finalDates.forEach(dateStr => {
             const startDateTime = new Date(`${dateStr}T00:00:00`);
             const endDateTime = new Date(`${dateStr}T23:59:59`);
             const taskRef = doc(collection(db, 'lessons'));
             batch.set(taskRef, {
                studentId,
                teacherId: teacherId || '',
                instrument: 'Estudo',
                startTime: Timestamp.fromDate(startDateTime),
                endTime: Timestamp.fromDate(endDateTime),
                status: 'scheduled',
                isStudyTask: true,
                topicId: topicToSchedule.id,
                topicTitle: topicToSchedule.title,
                topicUrl: topicToSchedule.url,
                suggestedDuration: parseInt(studyDuration) || 30,
                createdAt: serverTimestamp()
             });
          });
        });
        await batch.commit();
      }

      setShowScheduleModal(false);
      setTopicToSchedule(null);
      setSelectedStudentsForSchedule([]);
      setStudyDates([]);
    } catch (err) {
      console.error(err);
      alert('Erro ao agendar estudo para alunos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModuleUnlockModal = (moduleName: string) => {
    setModuleToUnlock(moduleName);
    setSelectedStudentsForModule([]);
    setShowModuleUnlockModal(true);
  };

  const handleStudentToggleForModule = (studentId: string) => {
    if (selectedStudentsForModule.includes(studentId)) {
      setSelectedStudentsForModule(prev => prev.filter(id => id !== studentId));
    } else {
      setSelectedStudentsForModule(prev => [...prev, studentId]);
    }
  };

  const handleModuleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleToUnlock) return;
    
    if (selectedStudentsForModule.length === 0) {
      setShowModuleUnlockModal(false);
      setModuleToUnlock(null);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const moduleTopics = topics.filter(t => t.moduleName === moduleToUnlock);
      const batch = writeBatch(db);
      
      for (const topic of moduleTopics) {
        const currentIds = topic.visibleToStudents || [];
        const newIdsSet = new Set([...currentIds, ...selectedStudentsForModule]);
        
        batch.update(doc(db, 'library', topic.id), {
          visibleToStudents: Array.from(newIdsSet)
        });
      }
      
      await batch.commit();
      
      setShowModuleUnlockModal(false);
      setModuleToUnlock(null);
      setSelectedStudentsForModule([]);
    } catch (err) {
      console.error(err);
      alert('Erro ao liberar módulo para alunos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingTopic(null);
    setModuleName('');
    setTitle('');
    setUrl('');
    setType('link');
    setDescription('');
    setInputType('upload');
    setFile(null);
    setUploadProgress(0);
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!topicToDelete) return;
    try {
      await deleteDoc(doc(db, 'library', topicToDelete.id));
      setTopicToDelete(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir tópico.');
    }
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleName.trim()) return;
    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'library_modules'), {
        name: newModuleName.trim(),
        createdAt: serverTimestamp()
      });
      setNewModuleName('');
    } catch (err) {
      console.error(err);
      alert('Erro ao criar módulo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditModule = async (moduleId: string, currentName: string) => {
    const newName = window.prompt('Digite o novo nome do módulo:', currentName);
    if (!newName || !newName.trim() || newName === currentName) return;
    try {
      await updateDoc(doc(db, 'library_modules', moduleId), { name: newName.trim() });
      
      // Update all topics that had this module name
      const batch = writeBatch(db);
      const q = query(collection(db, 'library'), where('moduleName', '==', currentName));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
         batch.update(doc(db, 'library', d.id), { moduleName: newName.trim() });
      });
      await batch.commit();
      
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar módulo.');
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este módulo? (Os tópicos não serão excluídos, mas ficarão sem módulo visível)')) return;
    try {
      await deleteDoc(doc(db, 'library_modules', moduleId));
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir módulo.');
    }
  };

  const toggleModule = (modName: string) => {
    setExpandedModules(prev => 
      prev.includes(modName) ? prev.filter(m => m !== modName) : [...prev, modName]
    );
  };

  const getTypeIcon = (mType: string) => {
    switch (mType) {
      case 'pdf': return <FileText className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'audio': return <Headphones className="w-5 h-5" />;
      case 'interactive_sheet': return <FileText className="w-5 h-5" />;
      default: return <ExternalLink className="w-5 h-5" />;
    }
  };

  const getTypeName = (mType: string) => {
    switch (mType) {
      case 'pdf': return 'Documento / Partitura';
      case 'video': return 'Vídeo';
      case 'audio': return 'Áudio';
      case 'interactive_sheet': return 'Partitura Interativa';
      default: return 'Link Externo';
    }
  };

  const handleStudentToggle = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
    } else {
      setSelectedStudentIds(prev => [...prev, studentId]);
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

  const openEditForm = (topic: LibraryTopic) => {
    setEditingTopic(topic);
    setModuleName(topic.moduleName);
    setTitle(topic.title);
    setUrl(topic.type === 'link' ? topic.url : '');
    setType(topic.type as any);
    setDescription(topic.description || '');
    setInputType(topic.type === 'link' ? 'url' : 'upload');
    setShowForm(true);
  };

  const openUnlockModal = (topic: LibraryTopic) => {
    setTopicToUnlock(topic);
    setSelectedStudentIds(topic.visibleToStudents || []);
    setShowUnlockModal(true);
  };

  const openScheduleModal = (topic: LibraryTopic) => {
    setTopicToSchedule(topic);
    setSelectedStudentsForSchedule([]);
    setStudyDates([]);
    setTempStudyDate(format(new Date(), 'yyyy-MM-dd'));
    setStudyDuration('30');
    setShowScheduleModal(true);
  };

  const handleStudentToggleForSchedule = (studentId: string) => {
    if (selectedStudentsForSchedule.includes(studentId)) {
      setSelectedStudentsForSchedule(prev => prev.filter(id => id !== studentId));
    } else {
      setSelectedStudentsForSchedule(prev => [...prev, studentId]);
    }
  };

  const handleOpenStudySession = (topic: LibraryTopic) => {
    // Find next pending task
    const pendingTasks = studyTasks.filter(t => t.topicId === topic.id && t.status !== 'completed');
    const nextTask = pendingTasks.sort((a,b) => a.startTime.toMillis() - b.startTime.toMillis())[0];
    
    setActiveSessionTopic(topic);
    setActiveSessionTask(nextTask || null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Group topics by module
  const groupedTopics = topics.reduce((acc, topic) => {
    if (!acc[topic.moduleName]) acc[topic.moduleName] = [];
    acc[topic.moduleName].push(topic);
    return acc;
  }, {} as Record<string, LibraryTopic[]>);

  // Get unique module names for autocomplete
  const existingModules = Array.from(new Set(topics.map(t => t.moduleName)));

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5">
        <div>
          <h2 className="text-2xl font-bold display-font text-zinc-900 flex items-center gap-2">
            {isStudent ? <GraduationCap className="w-6 h-6 text-emerald-500" /> : <BookOpen className="w-6 h-6 text-emerald-500" />}
            {isStudent ? 'Sala de Estudos' : 'Biblioteca Oficial'}
          </h2>
          <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
            {isStudent ? 'Acesse os módulos e tópicos liberados pelos seus professores para a sua evolução.' : 'Métodos e Apostilas oficiais organizados por Módulos e Tópicos.'}
          </p>
        </div>
        {canManageLibrary && (
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <button 
                onClick={() => setShowModulesModal(true)}
                className="flex items-center gap-2 bg-white text-zinc-700 border border-zinc-200 px-5 py-3 rounded-2xl hover:bg-zinc-50 transition-all shadow-sm active:scale-95 font-medium whitespace-nowrap"
              >
                <Settings className="w-5 h-5" /> Módulos
              </button>
            )}
            <button 
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 rounded-2xl hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 font-medium whitespace-nowrap"
            >
              <Plus className="w-5 h-5" /> Novo Tópico
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
              className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-bold display-font text-zinc-900">{editingTopic ? 'Editar Tópico' : 'Novo Tópico de Biblioteca'}</h3>
                <p className="text-zinc-500 text-sm mt-1">{editingTopic ? 'Altere as informações do tópico selecionado.' : 'Adicione um novo material ao acervo oficial.'}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Módulo</label>
                  <select
                    required
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                  >
                    <option value="" disabled>Selecione um módulo...</option>
                    {libraryModules.map(m => (
                       <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Título do Tópico</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                      placeholder="Ex: 01 - Escala Maior"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Tipo de Conteúdo</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                    >
                      <option value="pdf">Documento / Partitura (PDF)</option>
                      <option value="video">Vídeo</option>
                      <option value="audio">Áudio</option>
                      <option value="link">Link Externo</option>
                      <option value="interactive_sheet">Partitura Interativa (Guitar Pro/XML)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 mb-4 bg-zinc-100 p-1.5 rounded-2xl w-fit">
                  <button 
                    type="button"
                    onClick={() => setInputType('upload')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${inputType === 'upload' ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-950/5' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    Fazer Upload
                  </button>
                  <button 
                    type="button"
                    onClick={() => setInputType('url')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${inputType === 'url' ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-950/5' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    Link Externo
                  </button>
                </div>

                {inputType === 'url' ? (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">URL Externa</label>
                    <input
                      type="url"
                      required={inputType === 'url'}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Arquivo</label>
                    <input
                      type="file"
                      required={inputType === 'upload'}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-50 file:text-emerald-600 hover:file:bg-emerald-100 cursor-pointer text-zinc-500"
                    />
                    {isSubmitting && uploadProgress > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-zinc-500 mb-1 font-bold">
                          <span>Upload...</span>
                          <span>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="w-full bg-zinc-200 rounded-full h-2.5">
                          <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Descrição (Opcional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all h-24 resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Tópico'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Liberação para Alunos (Professores) */}
      <AnimatePresence>
        {showUnlockModal && topicToUnlock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowUnlockModal(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                  <LockOpen className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">Liberar Tópico</h3>
                <p className="text-zinc-500 text-sm mt-1">Selecione os alunos que terão acesso ao tópico <strong>{topicToUnlock.title}</strong> na Sala de Estudos.</p>
              </div>

              <form onSubmit={handleUnlockSubmit} className="space-y-6">


                <div className="bg-zinc-50 p-4 rounded-[24px] border border-zinc-200">
                  <h4 className="text-sm font-bold text-zinc-900 mb-3 ml-1">Selecione os Alunos</h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {students.map(student => {
                      const isSelected = selectedStudentIds.includes(student.id);
                      return (
                        <label key={student.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border border-transparent hover:bg-white hover:border-zinc-200`}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggle(student.id)}
                            className="w-4 h-4 text-emerald-500 border-zinc-300 rounded focus:ring-emerald-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-zinc-700">{student.name}</span>
                          </div>
                        </label>
                      );
                    })}
                    {students.length === 0 && <p className="text-sm text-zinc-500 italic p-2">Nenhum aluno ativo encontrado na sua base.</p>}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowUnlockModal(false)}
                    className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || (selectedStudentIds.length === 0 && (!topicToUnlock.visibleToStudents || topicToUnlock.visibleToStudents.length === 0))}
                    className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Liberação'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Agendamento (Professores) */}
      <AnimatePresence>
        {showScheduleModal && topicToSchedule && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowScheduleModal(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">Agendar Estudo</h3>
                <p className="text-zinc-500 text-sm mt-1">Crie Tarefas de Estudo baseadas no tópico <strong>{topicToSchedule.title}</strong> para os alunos selecionados.</p>
              </div>

              <form onSubmit={handleScheduleSubmit} className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 mb-3 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    Datas para Praticar
                  </h4>
                  
                  <div className="flex gap-2 mb-4">
                    <input 
                      type="date"
                      value={tempStudyDate}
                      onChange={e => setTempStudyDate(e.target.value)}
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddStudyDate}
                      className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors"
                    >
                      Adicionar Data
                    </button>
                  </div>
                  
                  {studyDates.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {studyDates.map(d => (
                        <div key={d} className="flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                          {format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy')}
                          <button type="button" onClick={() => handleRemoveStudyDate(d)} className="hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mb-6">
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Tempo Sugerido (minutos)</label>
                    <input 
                      type="number"
                      min="5"
                      value={studyDuration}
                      onChange={e => setStudyDuration(e.target.value)}
                      className="w-32 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-[24px] border border-zinc-200">
                  <h4 className="text-sm font-bold text-zinc-900 mb-3 ml-1">Para quais alunos?</h4>
                  <p className="text-xs text-zinc-500 mb-3 ml-1">Apenas alunos que já possuem este material liberado aparecem nesta lista.</p>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {students.filter(s => topicToSchedule.visibleToStudents?.includes(s.id)).map(student => {
                      const isSelected = selectedStudentsForSchedule.includes(student.id);
                      return (
                        <label key={student.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border border-transparent hover:bg-white hover:border-zinc-200`}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggleForSchedule(student.id)}
                            className="w-4 h-4 text-blue-500 border-zinc-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-zinc-700">{student.name}</span>
                          </div>
                        </label>
                      );
                    })}
                    {students.filter(s => topicToSchedule.visibleToStudents?.includes(s.id)).length === 0 && (
                      <p className="text-sm text-zinc-500 italic p-2">Nenhum aluno possui este material liberado. Vá em 'Liberar' primeiro.</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || selectedStudentsForSchedule.length === 0}
                    className="bg-blue-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Agendamento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Liberação de Módulo Inteiro (Lote) */}
      <AnimatePresence>
        {showModuleUnlockModal && moduleToUnlock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl relative my-8 border-t-8 border-emerald-500"
            >
              <button
                onClick={() => setShowModuleUnlockModal(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                  <LockOpen className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">Liberar Módulo</h3>
                <p className="text-zinc-500 text-sm mt-1">Conceda acesso a <strong>todos os tópicos</strong> do módulo <strong>{moduleToUnlock}</strong> de uma vez.</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex gap-3">
                <div className="text-xs text-blue-800 leading-relaxed">
                  <strong>Dica:</strong> Alunos marcados receberão acesso a tudo deste módulo. Alunos desmarcados não sofrerão nenhuma alteração (não perderão acessos que já possuem).
                </div>
              </div>

              <form onSubmit={handleModuleUnlockSubmit} className="space-y-6">
                <div className="bg-zinc-50 p-4 rounded-[24px] border border-zinc-200">
                  <h4 className="text-sm font-bold text-zinc-900 mb-3 ml-1">Selecione os Alunos</h4>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                    {students.map(student => {
                      const isSelected = selectedStudentsForModule.includes(student.id);
                      return (
                        <label key={student.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border border-transparent hover:bg-white hover:border-zinc-200`}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggleForModule(student.id)}
                            className="w-4 h-4 text-emerald-500 border-zinc-300 rounded focus:ring-emerald-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-zinc-700">{student.name}</span>
                          </div>
                        </label>
                      );
                    })}
                    {students.length === 0 && <p className="text-sm text-zinc-500 italic p-2">Nenhum aluno ativo encontrado na sua base.</p>}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModuleUnlockModal(false)}
                    className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar em Lote'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Gerenciamento de Módulos (Admin) */}
      <AnimatePresence>
        {showModulesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowModulesModal(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 bg-zinc-100 text-zinc-600 rounded-2xl flex items-center justify-center mb-4">
                  <Settings className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">Gerenciar Módulos</h3>
                <p className="text-zinc-500 text-sm mt-1">Crie ou exclua os módulos da sua biblioteca.</p>
              </div>

              <form onSubmit={handleAddModule} className="flex gap-3 mb-6">
                <input
                  type="text"
                  required
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  placeholder="Nome do Novo Módulo"
                  className="flex-1 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !newModuleName.trim()}
                  className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-md hover:shadow-emerald-500/25 active:scale-95 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Adicionar'}
                </button>
              </form>

              <div className="bg-zinc-50 border border-zinc-200 rounded-[24px] p-4 max-h-64 overflow-y-auto">
                {libraryModules.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">Nenhum módulo cadastrado.</p>
                ) : (
                  <div className="space-y-2">
                    {libraryModules.map(mod => (
                      <div key={mod.id} className="flex items-center justify-between bg-white border border-zinc-100 p-3 rounded-xl shadow-sm">
                        <span className="font-bold text-zinc-700 text-sm">{mod.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditModule(mod.id, mod.name)}
                            className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Editar Módulo"
                          >
                            <BookOpen className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteModule(mod.id)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir Módulo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isStudent && (
        <div className="flex bg-white p-1.5 rounded-2xl w-full max-w-md mx-auto shadow-sm ring-1 ring-zinc-950/5 relative z-10 mb-6">
          <button
            onClick={() => setActiveTab('library')}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
              activeTab === 'library' ? "bg-emerald-50 text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
            )}
          >
            <BookOpen className="w-4 h-4" />
            Materiais e Prática
          </button>
          <button
            onClick={() => setActiveTab('diary')}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
              activeTab === 'diary' ? "bg-orange-50 text-orange-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
            )}
          >
            <FileText className="w-4 h-4" />
            Meu Diário de Aula
          </button>
        </div>
      )}

      {activeTab === 'library' && (
        <div className="space-y-4">
        {Object.keys(groupedTopics).length === 0 ? (
          <div className="py-16 text-center bg-white rounded-[32px] border border-dashed border-zinc-200 flex flex-col items-center">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-zinc-300" />
            </div>
            <p className="text-zinc-500 font-medium">{isStudent ? 'Sua Sala de Estudos está vazia.' : 'Nenhum módulo criado na Biblioteca Oficial ainda.'}</p>
          </div>
        ) : (
          Object.keys(groupedTopics).sort((a,b) => b.localeCompare(a)).map(moduleName => {
            const isExpanded = expandedModules.includes(moduleName);
            const moduleTopics = groupedTopics[moduleName];

            let moduleProgress: number | null = null;
            let completedCount = 0;
            let totalCount = 0;

            if (isStudent) {
              totalCount = 0;
              completedCount = 0;
              
              moduleTopics.forEach(topic => {
                const topicTasks = studyTasks.filter(t => t.topicId === topic.id);
                if (topicTasks.length > 0) {
                  totalCount += topicTasks.length;
                  completedCount += topicTasks.filter(t => t.status === 'completed').length;
                } else {
                  // Tópico sem tarefa conta como 1 atividade pendente (estudo autônomo)
                  totalCount += 1;
                }
              });

              if (totalCount > 0) {
                moduleProgress = Math.round((completedCount / totalCount) * 100);
              } else {
                moduleProgress = 0;
              }
            }

            return (
              <div key={moduleName} className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5 overflow-hidden transition-all">
                <div
                  onClick={() => toggleModule(moduleName)}
                  className="w-full flex items-center justify-between p-6 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                      <BookOpen className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div className="flex-1 max-w-xl">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl font-bold text-zinc-900 display-font">{moduleName}</h3>
                        {moduleProgress !== null && moduleProgress === 100 && (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                            Concluído
                          </span>
                        )}
                      </div>
                      
                      {moduleProgress !== null ? (
                        <div className="w-full">
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="text-zinc-500 font-medium">{completedCount} de {totalCount} atividades</span>
                            <span className="text-emerald-600 font-bold">{moduleProgress}%</span>
                          </div>
                          <div className="w-full bg-zinc-200/80 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${moduleProgress}%` }}></div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">{moduleTopics.length} tópico{moduleTopics.length !== 1 && 's'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {(isAdmin || isTeacher) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openModuleUnlockModal(moduleName); }}
                        className="hidden md:flex items-center gap-1.5 py-2 px-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all border border-emerald-100"
                        title="Liberar Módulo Inteiro"
                      >
                        <LockOpen className="w-4 h-4" />
                        Liberar Módulo
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-6 h-6 text-zinc-400" /> : <ChevronDown className="w-6 h-6 text-zinc-400" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-zinc-100">
                        {moduleTopics.sort((a, b) => a.title.localeCompare(b.title)).map(topic => (
                          <div key={topic.id} className="bg-zinc-50 p-5 rounded-[24px] border border-zinc-100 flex flex-col group hover:border-emerald-500/30 transition-colors">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm text-emerald-600">
                                {getTypeIcon(topic.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-zinc-900 leading-tight line-clamp-2" title={topic.title}>{topic.title}</h4>
                                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{getTypeName(topic.type)}</span>
                              </div>
                            </div>
                            
                            {topic.description && (
                              <p className="text-xs text-zinc-500 line-clamp-2 mb-4 flex-1">{topic.description}</p>
                            )}

                            {isStudent && studyTasks.some(t => t.topicId === topic.id) && (() => {
                              const topicTasks = studyTasks.filter(t => t.topicId === topic.id).sort((a,b) => a.startTime.toMillis() - b.startTime.toMillis());
                              const completedTopicTasks = topicTasks.filter(t => t.status === 'completed').length;
                              const topicProgress = Math.round((completedTopicTasks / topicTasks.length) * 100);
                              const isAllCompleted = completedTopicTasks === topicTasks.length;

                              return (
                                <div className={`mb-4 rounded-xl p-3 border flex-none transition-all ${isAllCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50/50 border-orange-100'}`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isAllCompleted ? 'text-emerald-700' : 'text-orange-700'}`}>
                                      <CalendarDays className="w-3 h-3" /> Agendamento de Estudo
                                    </h5>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isAllCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>
                                      {topicProgress}%
                                    </span>
                                  </div>
                                  
                                  <div className="w-full bg-black/5 rounded-full h-1 mb-3 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-1000 ${isAllCompleted ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${topicProgress}%` }}></div>
                                  </div>

                                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                                    {topicTasks.map(task => {
                                        const isCompleted = task.status === 'completed';
                                        return (
                                          <div key={task.id} className={`flex justify-between items-center text-xs p-1.5 rounded-lg ${isCompleted ? 'bg-emerald-100/50' : 'bg-white/60'}`}>
                                            <div className="flex items-center gap-2">
                                              {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-orange-300 bg-white" />}
                                              <span className={`font-medium ${isCompleted ? 'text-emerald-800 line-through opacity-70' : 'text-orange-900'}`}>
                                                {task.startTime?.toDate ? format(task.startTime.toDate(), 'dd/MM/yyyy') : 'N/A'}
                                              </span>
                                            </div>
                                            <span className={`font-bold px-2 py-0.5 rounded-md ${isCompleted ? 'text-emerald-700 bg-emerald-200/50' : 'text-orange-800 bg-orange-200/50'}`}>
                                              {task.suggestedDuration || 30} min
                                            </span>
                                          </div>
                                        );
                                    })}
                                  </div>
                                  
                                  {isAllCompleted && (
                                    <div className="mt-2 pt-2 border-t border-emerald-200/50">
                                      <p className="text-[10px] text-emerald-700/90 font-bold leading-tight flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Tópico 100% concluído! Aguardando a avaliação do professor.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
                              {isStudent ? (
                                <button 
                                  onClick={() => handleOpenStudySession(topic)}
                                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 bg-white text-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-100 hover:text-black border border-zinc-200 transition-all"
                                >
                                  Acessar Sala de Prática
                                </button>
                              ) : (
                                <a 
                                  href={topic.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 bg-white text-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-100 hover:text-black border border-zinc-200 transition-all"
                                >
                                  Acessar Link
                                </a>
                              )}
                              
                              {(isAdmin || isTeacher) && (
                                <>
                                  <button
                                    onClick={() => openScheduleModal(topic)}
                                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 px-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all"
                                    title="Agendar Tarefa"
                                  >
                                    <CalendarDays className="w-4 h-4 shrink-0" />
                                    <span>Agendar</span>
                                  </button>
                                  <button
                                    onClick={() => openUnlockModal(topic)}
                                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2.5 px-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
                                    title="Liberar para Alunos"
                                  >
                                    <LockOpen className="w-4 h-4 shrink-0" />
                                    <span>Liberar</span>
                                  </button>
                                </>
                              )}
                              
                              {canManageLibrary && (
                                <div className="flex items-center gap-1 shrink-0 ml-auto">
                                  <button
                                    onClick={() => openEditForm(topic)}
                                    className="p-2.5 text-zinc-400 bg-white border border-zinc-200 rounded-xl hover:text-emerald-500 hover:border-emerald-200 hover:bg-emerald-50 transition-all"
                                    title="Editar Tópico"
                                  >
                                    <BookOpen className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setTopicToDelete(topic)}
                                    className="p-2.5 text-zinc-400 bg-white border border-zinc-200 rounded-xl hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
                                    title="Excluir Tópico"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
      )}

      {activeTab === 'diary' && (
        <div className="w-full space-y-6">
          <div className="bg-white rounded-[32px] p-6 md:p-8 border border-zinc-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-xl font-bold display-font flex items-center gap-2">
                  <FileText className="w-6 h-6 text-orange-500" />
                  Histórico de Aulas
                </h3>
                <p className="text-sm text-zinc-500 mt-1">Confira os resumos e as fotos do quadro deixados pelos seus professores.</p>
              </div>
            </div>

            {diaryLessons.length === 0 ? (
              <div className="py-20 text-center text-zinc-400">
                Nenhum diário de aula registrado ainda.
              </div>
            ) : (
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent">
                {diaryLessons.map((lesson) => {
                  const lessonDate = toDate(lesson.startTime);
                  
                  return (
                    <div key={lesson.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                      {/* Marker */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10 hidden md:flex bg-orange-500 text-white">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>

                      {/* Mobile marker */}
                      <div className="flex md:hidden items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 shadow-sm relative z-10 bg-orange-500 text-white">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>

                      {/* Card */}
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                        <div className="p-5 rounded-2xl border border-zinc-100 bg-white hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                               <span className="font-bold text-black">{safeFormat(lessonDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                               <span className="text-xs text-zinc-500 font-medium">às {safeFormat(lessonDate, 'HH:mm')}</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-600">
                              Aula Presencial
                            </span>
                          </div>
                          
                          {lesson.notes && (
                            <p className="text-sm text-zinc-600 leading-relaxed bg-zinc-50 p-4 rounded-xl border border-zinc-100 italic">
                               "{lesson.notes}"
                            </p>
                          )}

                          {lesson.photoUrls && lesson.photoUrls.length > 0 && (
                            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                              {lesson.photoUrls.map((url, pIdx) => (
                                <button
                                  key={pIdx}
                                  onClick={() => setActiveSessionTopic({
                                    id: lesson.id + pIdx,
                                    moduleName: "Diário de Aula",
                                    title: `Quadro ${pIdx + 1}`,
                                    type: "image",
                                    url: url,
                                    createdBy: lesson.teacherId,
                                    createdByName: "Professor",
                                    createdAt: null
                                  } as any)}
                                  className="shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 shadow-sm block hover:opacity-80 transition-opacity"
                                >
                                  <img src={url} alt={`Quadro ${pIdx + 1}`} className="w-full h-full object-cover" />
                                </button>
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
      )}

      <ConfirmModal
        isOpen={!!topicToDelete}
        onClose={() => setTopicToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Tópico"
        message={`Tem certeza que deseja excluir o tópico "${topicToDelete?.title}"? Alunos que já tinham acesso perderão o link.`}
        confirmText="Excluir"
      />

      {activeSessionTopic && (
        <StudySession 
          topic={activeSessionTopic}
          task={activeSessionTask || undefined}
          isAlreadyCompleted={isStudent && studyTasks.some(t => t.topicId === activeSessionTopic.id && t.status === 'completed')}
          onClose={() => {
            setActiveSessionTopic(null);
            setActiveSessionTask(null);
          }}
          onCompleteAutonomous={async () => {
            if (isStudent && profile.studentId) {
              await addDoc(collection(db, 'lessons'), {
                studentId: profile.studentId,
                teacherId: activeSessionTopic.createdBy || '',
                instrument: 'Estudo',
                startTime: serverTimestamp(),
                endTime: serverTimestamp(),
                status: 'completed',
                isStudyTask: true,
                topicId: activeSessionTopic.id,
                topicTitle: activeSessionTopic.title,
                topicUrl: activeSessionTopic.url,
                suggestedDuration: 30,
                createdAt: serverTimestamp()
              });
            }
          }}
        />
      )}
    </div>
  );
}
