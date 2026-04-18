import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { UserProfile, Lesson, Student } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Clock, User, FileText, CheckCircle2, AlertCircle, Camera, X, ImageIcon, Loader2, Link, Trash } from 'lucide-react';
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
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [selectedLessonId, setSelectedLessonId] = useState<string>(initialLessonId || '');
  
  const [notes, setNotes] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{isOpen: boolean, type: 'success' | 'error' | 'warning', title: string, message: string}>({ isOpen: false, type: 'success', title: '', message: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Determine which teacher logic to apply based on role
    const isTeacher = profile.role === 'teacher';
    const teacherId = profile.teacherId;

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

    return () => {
      unsubscribeStudents();
      unsubscribeLessons();
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
  const studentLessons = selectedStudentId 
    ? lessons.filter(l => l.studentId === selectedStudentId && l.status !== 'cancelled')
             .sort((a, b) => {
                const dateA = toDate(a.startTime)?.getTime() || 0;
                const dateB = toDate(b.startTime)?.getTime() || 0;
                return dateB - dateA; // newest first
             })
    : [];

  const completedLessons = studentLessons.filter(l => l.status === 'completed' || !!l.notes);
  const pendingLessons = studentLessons.filter(l => l.status !== 'completed' && !l.notes);

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

      setFeedback({ isOpen: true, type: 'success', title: 'Sucesso!', message: 'Diário de aula salvo com sucesso.' });
      
      setSelectedPhotos([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Keep lesson selected if user wants to review, or we can reset to empty
      // setSelectedLessonId('');
      // setNotes('');
    } catch (err: any) {
      console.error(err);
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar: ' + err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearDiary = async () => {
    if (!selectedLesson) return;
    if (!window.confirm('Tem certeza que deseja zerar este diário? As fotos e o texto serão permanentemente apagados.')) return;

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
            
            <div className="w-full md:w-80">
              <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">Filtrar por Aluno</label>
              <select
                value={selectedStudentId}
                onChange={(e) => {
                  setSelectedStudentId(e.target.value);
                  setSelectedLessonId('');
                  setNotes('');
                  setSelectedPhotos([]);
                }}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-black"
              >
                <option value="">Selecione um aluno...</option>
                {students.filter(s => {
                  if (profile.role === 'admin') return true;
                  if (profile.role === 'teacher' && profile.teacherId) {
                    const isEnrolledWithTeacher = s.enrollments?.some(e => e.teacherId === profile.teacherId);
                    const hasLessonsWithTeacher = lessons.some(l => l.studentId === s.id);
                    return isEnrolledWithTeacher || hasLessonsWithTeacher;
                  }
                  return false;
                }).map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.status !== 'active' ? '(Inativo)' : ''}</option>
                ))}
              </select>
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
            <div className="flex flex-col gap-10">
              
              {/* Top Section: Form */}
              <div className="max-w-4xl mx-auto w-full space-y-6">
                <div className="bg-zinc-50 rounded-3xl p-6 border border-zinc-100">
                  <h3 className="text-lg font-bold display-font mb-4">Preencher Relatório</h3>
                  
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Aula Selecionada</label>
                  <select
                    value={selectedLessonId}
                    onChange={(e) => {
                      setSelectedLessonId(e.target.value);
                      const lesson = lessons.find(l => l.id === e.target.value);
                      setNotes(lesson?.notes || '');
                      setSelectedPhotos([]);
                    }}
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-black mb-6"
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
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="relative group rounded-xl overflow-hidden shadow-sm border border-zinc-100 w-16 h-16 flex-shrink-0 bg-zinc-100 block cursor-pointer">
                                  <img src={url} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover group-hover:opacity-75 transition-opacity" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                     <Link className="w-4 h-4 text-white" />
                                  </div>
                                </a>
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
