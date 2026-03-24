import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Student, Teacher, Instrument, CourseEnrollment } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Plus, Trash2, X, Calendar, Clock, User, Pencil } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, setHours, setMinutes, isAfter, addYears } from 'date-fns';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';

const DAYS_OF_WEEK = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

export default function Students({ profile }: { profile: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [schoolSettings, setSchoolSettings] = useState({ defaultMaxStudents: 1 });
  const [filterName, setFilterName] = useState('');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [newStudent, setNewStudent] = useState({
    name: '',
    level: 'beginner' as Student['level'],
    status: 'active' as const,
    enrollments: [] as CourseEnrollment[]
  });

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
      setTeachers(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'teachers');
    });

    const unsubInstruments = onSnapshot(collection(db, 'instruments'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Instrument));
      setInstruments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'instruments');
    });

    const unsubBlockedTimes = onSnapshot(collection(db, 'blocked_times'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBlockedTimes(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blocked_times');
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'school'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSchoolSettings({ defaultMaxStudents: data.defaultMaxStudents || 1 });
      }
    });

    return () => {
      unsubStudents();
      unsubTeachers();
      unsubInstruments();
      unsubBlockedTimes();
      unsubSettings();
    };
  }, []);

  const checkTimeConflict = (teacherId: string, day: number, time: string, duration: number, currentStudentId?: string): string | null => {
    if (!teacherId || !time) return null;

    const teacher = teachers.find(t => t.id === teacherId);
    const capacity = teacher?.maxStudents || schoolSettings.defaultMaxStudents || 1;

    const [hours, minutes] = time.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + duration;

    let overlappingStudentsCount = 0;

    // Check conflicts with other students' recurring schedules
    for (const student of students) {
      if (student.id === currentStudentId) continue;
      
      let studentOverlaps = false;

      for (const enrollment of student.enrollments || []) {
        if (enrollment.teacherId !== teacherId) continue;

        for (const item of enrollment.schedule) {
          if (item.day !== day) continue;

          const [itemHours, itemMinutes] = item.time.split(':').map(Number);
          const itemStartMinutes = itemHours * 60 + itemMinutes;
          const itemEndMinutes = itemStartMinutes + enrollment.duration;

          // Check for overlap
          if (startMinutes < itemEndMinutes && endMinutes > itemStartMinutes) {
            studentOverlaps = true;
            break;
          }
        }
        if (studentOverlaps) break;
      }

      if (studentOverlaps) {
        overlappingStudentsCount++;
      }
    }

    if (overlappingStudentsCount >= capacity) {
      return `Lotado (${overlappingStudentsCount}/${capacity} vagas Ocupadas)`;
    }

    // Check conflicts with blocked times
    const now = new Date();
    for (const bt of blockedTimes) {
      if (bt.teacherId && bt.teacherId !== teacherId) continue;

      const btStart = bt.startTime?.toDate();
      const btEnd = bt.endTime?.toDate();
      
      if (!btStart || !btEnd) continue;
      
      // Only consider future blocked times
      if (btEnd < now) continue;

      // Check if the blocked time falls on the same day of the week
      if (getDay(btStart) !== day) continue;

      const btStartMinutes = btStart.getHours() * 60 + btStart.getMinutes();
      const btEndMinutes = btEnd.getHours() * 60 + btEnd.getMinutes();

      // Check for overlap
      if (startMinutes < btEndMinutes && endMinutes > btStartMinutes) {
        return 'Professor bloqueado neste horário';
      }
    }

    return null;
  };

  const generateLessonsForYear = async (studentId: string, enrollments: CourseEnrollment[]) => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(addYears(new Date(), 1));
    const days = eachDayOfInterval({ start, end });
    const batch = writeBatch(db);
    let count = 0;

    for (const day of days) {
      const dayOfWeek = getDay(day);
      
      for (const enrollment of enrollments) {
        const scheduleItems = enrollment.schedule.filter((s: any) => s.day === dayOfWeek);

        for (const item of scheduleItems) {
          const [hours, minutes] = item.time.split(':').map(Number);
          const lessonStart = setMinutes(setHours(day, hours), minutes);
          const lessonEnd = new Date(lessonStart.getTime() + enrollment.duration * 60000);

          // Only generate lessons that are in the future
          if (isAfter(lessonStart, new Date())) {
            const lessonRef = doc(collection(db, 'lessons'));
            batch.set(lessonRef, {
              studentId,
              teacherId: enrollment.teacherId,
              instrument: enrollment.instrument,
              startTime: Timestamp.fromDate(lessonStart),
              endTime: Timestamp.fromDate(lessonEnd),
              status: 'scheduled',
              createdAt: serverTimestamp()
            });
            count++;
          }
        }
      }
    }
    
    if (count > 0) {
      await batch.commit();
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStudent.enrollments.length === 0) {
      alert('Adicione pelo menos uma matrícula (curso).');
      return;
    }

    for (const enrollment of newStudent.enrollments) {
      if (!enrollment.instrument) {
        alert('Selecione o instrumento para todas as matrículas.');
        return;
      }
      if (!enrollment.teacherId) {
        alert('Selecione o professor para todas as matrículas.');
        return;
      }
      if (enrollment.schedule.length === 0) {
        alert(`Adicione pelo menos um horário para o curso de ${enrollment.instrument}.`);
        return;
      }
      
      for (const item of enrollment.schedule) {
        const conflictReason = checkTimeConflict(enrollment.teacherId, item.day, item.time, enrollment.duration, editingStudentId || undefined);
        if (conflictReason) {
          const dayName = DAYS_OF_WEEK.find(d => d.value === item.day)?.label;
          alert(`O horário de ${dayName} às ${item.time} para o curso de ${enrollment.instrument} está indisponível: ${conflictReason}`);
          return;
        }
      }
    }

    try {
      if (editingStudentId) {
        await updateDoc(doc(db, 'students', editingStudentId), {
          ...newStudent
        });

        // Delete all future scheduled lessons for this student
        const now = new Date();
        const futureLessonsQuery = query(
          collection(db, 'lessons'),
          where('studentId', '==', editingStudentId),
          where('status', '==', 'scheduled')
        );
        const futureLessonsSnapshot = await getDocs(futureLessonsQuery);
        
        const deleteBatch = writeBatch(db);
        let hasDeletes = false;
        
        futureLessonsSnapshot.docs.forEach((docSnap) => {
          const startTime = docSnap.data().startTime?.toDate();
          if (startTime && startTime > now) {
            deleteBatch.delete(docSnap.ref);
            hasDeletes = true;
          }
        });
        
        if (hasDeletes) {
          await deleteBatch.commit();
        }

        // Generate new lessons based on updated schedule
        await generateLessonsForYear(editingStudentId, newStudent.enrollments);
      } else {
        const docRef = await addDoc(collection(db, 'students'), {
          ...newStudent,
          createdAt: serverTimestamp()
        });

        // Generate lessons for the next 12 months automatically
        await generateLessonsForYear(docRef.id, newStudent.enrollments);
      }

      setIsModalOpen(false);
      setEditingStudentId(null);
      setNewStudent({ 
        name: '', 
        level: 'beginner',
        status: 'active',
        enrollments: []
      });
    } catch (error) {
      handleFirestoreError(error, editingStudentId ? OperationType.UPDATE : OperationType.CREATE, 'students');
    }
  };

  const handleEditStudent = (student: Student) => {
    setEditingStudentId(student.id);
    setNewStudent({
      name: student.name,
      level: student.level || 'beginner',
      status: student.status,
      enrollments: student.enrollments || []
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingStudentId(null);
    setNewStudent({ 
      name: '', 
      level: 'beginner',
      status: 'active',
      enrollments: []
    });
    setIsModalOpen(true);
  };

  const addEnrollment = () => {
    setNewStudent({
      ...newStudent,
      enrollments: [
        ...newStudent.enrollments,
        { instrument: '', teacherId: '', duration: 60, schedule: [] }
      ]
    });
  };

  const removeEnrollment = (index: number) => {
    setNewStudent({
      ...newStudent,
      enrollments: newStudent.enrollments.filter((_, i) => i !== index)
    });
  };

  const updateEnrollment = (index: number, field: keyof CourseEnrollment, value: any) => {
    const newEnrollments = [...newStudent.enrollments];
    const enrollment = { ...newEnrollments[index], [field]: value };
    
    // If instrument changes, clear teacher if they don't teach the new instrument
    if (field === 'instrument' && enrollment.teacherId) {
      const teacher = teachers.find(t => t.id === enrollment.teacherId);
      if (teacher && !teacher.instruments.includes(value)) {
        enrollment.teacherId = '';
      }
    }
    
    newEnrollments[index] = enrollment;
    setNewStudent({ ...newStudent, enrollments: newEnrollments });
  };

  const addScheduleItem = (enrollmentIndex: number) => {
    const newEnrollments = [...newStudent.enrollments];
    newEnrollments[enrollmentIndex].schedule.push({ day: 1, time: '14:00' });
    setNewStudent({ ...newStudent, enrollments: newEnrollments });
  };

  const removeScheduleItem = (enrollmentIndex: number, scheduleIndex: number) => {
    const newEnrollments = [...newStudent.enrollments];
    newEnrollments[enrollmentIndex].schedule = newEnrollments[enrollmentIndex].schedule.filter((_, i) => i !== scheduleIndex);
    setNewStudent({ ...newStudent, enrollments: newEnrollments });
  };

  const updateScheduleItem = (enrollmentIndex: number, scheduleIndex: number, field: 'day' | 'time', value: any) => {
    const newEnrollments = [...newStudent.enrollments];
    newEnrollments[enrollmentIndex].schedule[scheduleIndex] = { 
      ...newEnrollments[enrollmentIndex].schedule[scheduleIndex], 
      [field]: value 
    };
    setNewStudent({ ...newStudent, enrollments: newEnrollments });
  };

  const handleDeleteStudent = async (id: string) => {
    setStudentToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!studentToDelete) return;
    try {
      // 1. Delete associated lessons
      const lessonsQuery = query(collection(db, 'lessons'), where('studentId', '==', studentToDelete));
      const lessonsSnapshot = await getDocs(lessonsQuery);
      
      const batch = writeBatch(db);
      lessonsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 2. Delete the student
      batch.delete(doc(db, 'students', studentToDelete));
      
      await batch.commit();
      
      setStudentToDelete(null);
      setIsConfirmOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${studentToDelete}`);
    }
  };

  const filteredStudents = students.filter(student => {
    const matchName = !filterName || student.name.toLowerCase().includes(filterName.toLowerCase());
    const enrollments = student.enrollments || [];
    const matchInstrument = !filterInstrument || enrollments.some(e => e.instrument === filterInstrument);
    const matchTeacher = !filterTeacher || enrollments.some(e => e.teacherId === filterTeacher);
    return matchName && matchInstrument && matchTeacher;
  });

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const toggleSelectStudent = (id: string) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStudents(newSet);
  };

  const handleBulkDelete = async () => {
    if (selectedStudents.size === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedStudents.size} alunos selecionados? (Todas as aulas cadastradas também serão apagadas)`)) return;
    
    try {
      const batch = writeBatch(db);
      for (const studentId of Array.from(selectedStudents) as string[]) {
        const lessonsQuery = query(collection(db, 'lessons'), where('studentId', '==', studentId));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        lessonsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
        batch.delete(doc(db, 'students', studentId));
      }
      await batch.commit();
      setSelectedStudents(new Set());
    } catch (error) {
      console.error(error);
      alert('Erro ao excluir alunos em massa.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 bg-white p-4 rounded-[32px] ring-1 ring-zinc-950/5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <input 
            type="text" 
            placeholder="Buscar por nome..." 
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="w-full sm:w-auto bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium placeholder-zinc-400"
          />
          <select
            value={filterInstrument}
            onChange={(e) => setFilterInstrument(e.target.value)}
            className="w-full sm:w-auto bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-zinc-600 font-medium"
          >
            <option value="">Qualquer instrumento</option>
            {instruments.map(i => (
              <option key={i.id} value={i.name}>{i.name}</option>
            ))}
          </select>
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="w-full sm:w-auto bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-zinc-600 font-medium"
          >
            <option value="">Qualquer professor</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-3 self-end lg:self-auto">
          {selectedStudents.size > 0 && profile.role === 'admin' && (
            <button 
              onClick={handleBulkDelete}
              className="text-white bg-red-500 font-bold text-sm px-5 py-3 rounded-2xl hover:bg-red-600 transition-all shadow-md shadow-red-500/20 flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Excluir Selecionados ({selectedStudents.size})
            </button>
          )}
          {profile.role === 'admin' && (
            <button 
              onClick={openAddModal}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all font-bold shadow-lg shadow-orange-500/25 active:scale-[0.98]"
            >
              <Plus className="w-5 h-5" />
              Novo Aluno
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] overflow-hidden flex flex-col">
        <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h3 className="text-xl font-medium">Lista de Alunos</h3>
          <span className="text-zinc-400 text-sm">{filteredStudents.length} de {students.length} alunos</span>
        </div>
        <div className="px-8 pb-8 overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-50">
                <th className="py-4 font-medium pl-6 w-12">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    onChange={toggleSelectAll}
                    checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length}
                  />
                </th>
                <th className="py-4 font-medium">Nome</th>
                <th className="py-4 font-medium">Curso</th>
                <th className="py-4 font-medium">Professor</th>
                <th className="py-4 font-medium">Horário</th>
                <th className="py-4 font-medium">Status</th>
                <th className="py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredStudents.map(student => {
                return (
                  <tr key={student.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/80 transition-colors group">
                    <td className="py-5 pl-6 w-12">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500 cursor-pointer opacity-50 group-hover:opacity-100 checked:opacity-100 transition-opacity"
                        checked={selectedStudents.has(student.id)}
                        onChange={() => toggleSelectStudent(student.id)}
                      />
                    </td>
                    <td className="py-5 font-bold text-black display-font">{student.name}</td>
                    <td colSpan={3} className="py-5">
                      <div className="space-y-3">
                        {(student.enrollments || []).map((enrollment, eIdx) => {
                          const teacher = teachers.find(t => t.id === enrollment.teacherId);
                          return (
                            <div key={eIdx} className="grid grid-cols-3 gap-4 items-start">
                              <div className="text-zinc-500">
                                <span className="bg-zinc-100 px-2 py-0.5 rounded text-[10px] font-medium text-zinc-600">
                                  {enrollment.instrument}
                                </span>
                              </div>
                              <div className="text-zinc-500 text-xs">
                                {teacher?.name || 'Não atribuído'}
                              </div>
                              <div className="text-zinc-500">
                                <div className="flex flex-col gap-1">
                                  {(enrollment.schedule || []).map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-[11px]">
                                      <span className="font-bold text-black">{item.time}</span>
                                      <span className="text-[9px] uppercase tracking-wide bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-500">
                                        {DAYS_OF_WEEK.find(day => day.value === item.day)?.label}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium capitalize",
                        student.status === 'active' ? "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20" : "bg-zinc-50 text-zinc-600 ring-1 ring-inset ring-zinc-500/20"
                      )}>
                        {student.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-5 text-right">
                      {profile.role === 'admin' && (
                        <div className="flex items-center justify-end gap-3">
                          <button 
                            onClick={() => handleEditStudent(student)}
                            className="text-zinc-400 hover:text-black transition-colors"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteStudent(student.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-zinc-400 italic">
                    Nenhum aluno cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[32px] p-8 shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 my-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold display-font">{editingStudentId ? 'Editar Aluno' : 'Matrícula de Aluno'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-8">
              <div className="space-y-6">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Dados Pessoais</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Nome Completo</label>
                    <input 
                      required
                      type="text" 
                      value={newStudent.name}
                      onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Nível</label>
                    <select 
                      value={newStudent.level}
                      onChange={e => setNewStudent({...newStudent, level: e.target.value as Student['level']})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                    >
                      <option value="beginner">Iniciante</option>
                      <option value="intermediate">Intermediário</option>
                      <option value="advanced">Avançado</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Status</label>
                  <select 
                    value={newStudent.status}
                    onChange={e => setNewStudent({...newStudent, status: e.target.value as 'active' | 'inactive'})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Matrículas (Cursos)</h4>
                  <button 
                    type="button"
                    onClick={addEnrollment}
                    className="bg-zinc-100 text-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-zinc-200 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Curso
                  </button>
                </div>

                <div className="space-y-6">
                  {newStudent.enrollments.map((enrollment, eIdx) => (
                    <div key={eIdx} className="bg-zinc-50 p-6 rounded-[24px] border border-zinc-100 space-y-6 relative">
                      <button 
                        type="button"
                        onClick={() => removeEnrollment(eIdx)}
                        className="absolute top-4 right-4 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">Instrumento / Curso</label>
                          <select 
                            required
                            value={enrollment.instrument}
                            onChange={e => updateEnrollment(eIdx, 'instrument', e.target.value)}
                            className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                          >
                            <option value="">Selecione um instrumento</option>
                            {instruments.map(i => (
                              <option key={i.id} value={i.name}>{i.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">Professor</label>
                          <select 
                            required
                            value={enrollment.teacherId}
                            onChange={e => updateEnrollment(eIdx, 'teacherId', e.target.value)}
                            className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                          >
                            <option value="">Selecione um professor</option>
                            {teachers
                              .filter(t => !enrollment.instrument || t.instruments.includes(enrollment.instrument))
                              .map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.instruments.join(', ')})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-2">Duração da Aula</label>
                          <select 
                            value={enrollment.duration}
                            onChange={e => updateEnrollment(eIdx, 'duration', Number(e.target.value))}
                            className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                          >
                            <option value={30}>30 Minutos</option>
                            <option value={45}>45 Minutos</option>
                            <option value={60}>1 Hora</option>
                            <option value={90}>1 Hora e 30 Minutos</option>
                            <option value={120}>2 Horas</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-400">Agenda deste Curso</label>
                          <button 
                            type="button"
                            onClick={() => addScheduleItem(eIdx)}
                            className="text-orange-500 text-[10px] font-bold flex items-center gap-1 hover:underline"
                          >
                            <Plus className="w-3 h-3" />
                            Adicionar Horário
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {enrollment.schedule.map((item, sIdx) => {
                            const conflictReason = checkTimeConflict(enrollment.teacherId, item.day, item.time, enrollment.duration, editingStudentId || undefined);
                            const hasConflict = !!conflictReason;
                            return (
                              <div key={sIdx} className="flex flex-col gap-1">
                                <div className={cn(
                                  "flex items-center gap-2 p-2 rounded-xl border",
                                  hasConflict ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-zinc-100"
                                )}>
                                  <select 
                                    value={item.day}
                                    onChange={e => updateScheduleItem(eIdx, sIdx, 'day', Number(e.target.value))}
                                    className={cn("flex-1 bg-transparent text-xs focus:outline-none", hasConflict && "text-red-600")}
                                  >
                                    {DAYS_OF_WEEK.map(day => (
                                      <option key={day.value} value={day.value}>{day.label}</option>
                                    ))}
                                  </select>
                                  <input 
                                    type="time" 
                                    value={item.time}
                                    onChange={e => updateScheduleItem(eIdx, sIdx, 'time', e.target.value)}
                                    className={cn("w-20 bg-transparent text-xs focus:outline-none", hasConflict && "text-red-600")}
                                  />
                                  <button 
                                    type="button"
                                    onClick={() => removeScheduleItem(eIdx, sIdx)}
                                    className={cn("hover:text-red-600", hasConflict ? "text-red-400" : "text-zinc-400")}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {hasConflict && (
                                  <span className="text-[10px] text-red-500 font-medium px-1">
                                    {conflictReason}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {newStudent.enrollments.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-zinc-100 rounded-[24px] text-zinc-400 text-sm">
                      Nenhum curso adicionado. Clique em "Adicionar Curso".
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98]"
              >
                {editingStudentId ? 'Salvar Alterações' : 'Confirmar Matrícula e Gerar Aulas'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Excluir Aluno"
        message="Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita e TODAS as aulas (horários) associadas a este aluno também serão excluídas do sistema."
        confirmText="Excluir"
      />
    </div>
  );
}
