import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc, query, where, getDocs, getDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { UserProfile, Student, Teacher, Instrument, CourseEnrollment } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Plus, Trash2, X, Calendar, Clock, User, Pencil, Eye, EyeOff, Loader2, ChevronLeft, Music2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, setHours, setMinutes, isAfter, addYears } from 'date-fns';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import FeedbackModal from './FeedbackModal';
import ContractViewer from './ContractViewer';
import { generateSignedContractPDF } from '../lib/pdf-generator';
import { motion, AnimatePresence } from 'framer-motion';

const DAYS_OF_WEEK = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const applyCpfMask = (value: string) => {
  return value
    .replace(/\D/g, '') // remove tudo que não for número
    .replace(/(\d{3})(\d)/, '$1.$2') // coloca o primeiro ponto
    .replace(/(\d{3})(\d)/, '$1.$2') // coloca o segundo ponto
    .replace(/(\d{3})(\d{1,2})/, '$1-$2') // coloca o hífen
    .replace(/(-\d{2})\d+?$/, '$1'); // limita ao tamanho máximo do CPF
};

const applyCepMask = (value: string) => {
  return value
    .replace(/\D/g, '') // remove tudo que não for número
    .replace(/(\d{5})(\d)/, '$1-$2') // coloca o hífen
    .replace(/(-\d{3})\d+?$/, '$1'); // limita ao tamanho máximo do CEP
};

export default function Students({ profile }: { profile: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState({ 
    defaultMaxStudents: 1,
    defaultCoursePrice: null as number | null,
    defaultIndividualCoursePrice: null as number | null
  });
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'pending_approval'>('all');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterDiscount, setFilterDiscount] = useState<'all' | 'with_discount' | 'without_discount'>('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [studentToReject, setStudentToReject] = useState<Student | null>(null);
  const [viewingContract, setViewingContract] = useState<Student | null>(null);
  const [pixModalData, setPixModalData] = useState<{ student: Student, paymentId: string } | null>(null);
  const [feedbackData, setFeedbackData] = useState<{ title: string, message: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkData, setLinkData] = useState({
     courseNames: '',
     courseValue: 0,
     dueDate: 10,
     classType: 'group' as 'individual' | 'group',
     classesPerWeek: 1,
     classDuration: 60,
     teacherId: '',
     schedules: [{ dayOfWeek: 1, time: '14:00' }],
     isScholarship: false,
     discount: 0,
     extraNotes: ''
  });
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    rg: '',
    nationality: 'Brasileiro(a)',
    maritalStatus: 'Solteiro(a)',
    profession: '',
    cep: '',
    address: '',
    addressNumber: '',
    neighborhood: '',
    city: '',
    state: '',
    birthDate: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    fatherName: '',
    motherName: '',
    level: 'beginner' as Student['level'],
    status: 'active' as const,
    enrollments: [] as CourseEnrollment[],
    courseValue: 0,
    dueDate: 10,
    billingStartDate: new Date().toISOString().split('T')[0],
    responsibleName: '',
    responsibleCpf: '',
    responsiblePhone: '',
    responsibleKinship: '',
    responsibleRg: '',
    isScholarship: false,
    discount: 0,
    extraNotes: '',
    classType: 'group' as 'individual' | 'group'
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
        setSchoolSettings({ 
          ...data,
          defaultMaxStudents: data.defaultMaxStudents || 1,
          defaultCoursePrice: data.defaultCoursePrice || null,
          defaultIndividualCoursePrice: data.defaultIndividualCoursePrice || null
        });
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

  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setNewStudent(prev => ({
          ...prev,
          address: data.logradouro || prev.address,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setCepLoading(false);
    }
  };

  const checkTimeConflict = (teacherId: string, day: number, time: string, duration: number, currentStudentId?: string): string | null => {
    if (!teacherId || !time) return null;

    const teacher = teachers.find(t => t.id === teacherId);
    const capacity = teacher?.maxStudents || schoolSettings.defaultMaxStudents || 1;

    const [hours, minutes] = time.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + duration;

    let overlappingStudentsCount = 0;
    let overlappingNames: string[] = [];
    let hasIndividualOverlap = false;

    // Check conflicts with other students' recurring schedules
    for (const student of students) {
      if (student.id === currentStudentId) continue;
      if (student.status === 'inactive') continue;
      
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
        if (student.classType === 'individual') {
          hasIndividualOverlap = true;
        }
        overlappingStudentsCount++;
        overlappingNames.push(student.name.split(' ')[0]);
      }
    }

    if (newStudent.classType === 'individual' && overlappingStudentsCount > 0) {
      const namesString = overlappingNames.length > 0 ? ` (${overlappingNames.join(', ')})` : '';
      return `Horário incompatível. Alunos individuais requerem horário vazio${namesString}`;
    }

    if (hasIndividualOverlap) {
      return 'Horário bloqueado por um aluno de turma Individual.';
    }

    if (overlappingStudentsCount >= capacity) {
      const namesString = overlappingNames.length > 0 ? ` (${overlappingNames.join(', ')})` : '';
      return `Lotado (${overlappingStudentsCount}/${capacity} vagas)${namesString}`;
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
    
    // Fetch existing future lessons to avoid duplicates
    const now = new Date();
    const futureLessonsQuery = query(
      collection(db, 'lessons'),
      where('studentId', '==', studentId)
    );
    const existingSnap = await getDocs(futureLessonsQuery);
    const existingMatches = existingSnap.docs.map(d => {
       const data = d.data();
       const st = data.startTime?.toDate();
       return st && st > now ? `${data.teacherId}_${data.instrument}_${st.getTime()}` : null;
    }).filter(Boolean);

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
            const matchKey = `${enrollment.teacherId}_${enrollment.instrument}_${lessonStart.getTime()}`;
            if (!existingMatches.includes(matchKey)) {
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
    }
    
    if (count > 0) {
      await batch.commit();
    }
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const pendingPayload = {
         ...linkData,
         enrollments: [{
            instrument: linkData.courseNames,
            teacherId: linkData.teacherId,
            duration: linkData.classDuration,
            schedule: linkData.schedules.map(s => ({
              day: Number(s.dayOfWeek),
              time: s.time
            }))
         }],
         status: 'pending',
         createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'pending_enrollments'), pendingPayload);
      const url = `${window.location.origin}/matricula/${docRef.id}`;
      setGeneratedLink(url);
    } catch(err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
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
      
      if (newStudent.status === 'active') {
        for (const item of enrollment.schedule) {
          const conflictReason = checkTimeConflict(enrollment.teacherId, item.day, item.time, enrollment.duration, editingStudentId || undefined);
          if (conflictReason) {
            const dayName = DAYS_OF_WEEK.find(d => d.value === item.day)?.label;
            alert(`O horário de ${dayName} às ${item.time} para o curso de ${enrollment.instrument} está indisponível: ${conflictReason}`);
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    try {
      let derivedDueDate = 10;
      if (newStudent.billingStartDate) {
        const parts = newStudent.billingStartDate.split('-');
        if (parts.length === 3) {
          derivedDueDate = parseInt(parts[2], 10);
        }
      }

      const payload = {
        ...newStudent,
        courseValue: Number(newStudent.courseValue) || 0,
        dueDate: derivedDueDate
      };

      if (editingStudentId) {
        await updateDoc(doc(db, 'students', editingStudentId), payload);

        // Delete all future scheduled lessons for this student
        // Also delete any future lesson that does not match the new enrollments anymore
        const now = new Date();
        const futureLessonsQuery = query(
          collection(db, 'lessons'),
          where('studentId', '==', editingStudentId)
        );
        const futureLessonsSnapshot = await getDocs(futureLessonsQuery);
        
        const deleteBatch = writeBatch(db);
        let hasDeletes = false;
        
        futureLessonsSnapshot.docs.forEach((docSnap) => {
          const lesson = docSnap.data();
          const startTime = lesson.startTime?.toDate();
          
          if (startTime && startTime > now) {
            if (lesson.status === 'scheduled' && !lesson.isMakeup) {
              // Always refresh future 'scheduled' lessons, EXCEPT makeup classes
              deleteBatch.delete(docSnap.ref);
              hasDeletes = true;
            } else {
              // If the class has notes/completed/makeup status in the future,
              // we only delete it if the student is no longer enrolled with that teacher/instrument!
              const matchesEnrollment = newStudent.enrollments.some(e => 
                e.teacherId === lesson.teacherId && 
                e.instrument === lesson.instrument
              );
              
              if (!matchesEnrollment) {
                deleteBatch.delete(docSnap.ref);
                hasDeletes = true;
              }
            }
          }
        });
        
        if (hasDeletes) {
          await deleteBatch.commit();
        }

        // Generate new lessons based on updated schedule
        if (newStudent.status === 'active') {
          await generateLessonsForYear(editingStudentId, newStudent.enrollments);
        }

        // Sync pending/overdue invoices with new course value and due date
        try {
          if (newStudent.courseValue && newStudent.dueDate) {
            const paymentsRef = collection(db, 'payments');
            const qPending = query(paymentsRef, where('studentId', '==', editingStudentId), where('status', 'in', ['pending', 'overdue']));
            const pendingSnaps = await getDocs(qPending);
            
            if (!pendingSnaps.empty) {
              const syncBatch = writeBatch(db);
              pendingSnaps.docs.forEach(p => {
                const data = p.data();
                if (data.dueDate) {
                  const [y, m] = data.dueDate.split('-');
                  let newD = Number(newStudent.dueDate);
                  const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
                  if (newD > daysInMonth) newD = daysInMonth;
                  
                  const newDueDateStr = `${y}-${m}-${String(newD).padStart(2, '0')}`;
                  
                  syncBatch.update(p.ref, {
                    amount: Math.max(0, Number(newStudent.courseValue) - (Number(newStudent.discount) || 0)),
                    dueDate: newDueDateStr,
                    studentName: newStudent.name
                  });
                }
              });
              await syncBatch.commit();
            }
          }
        } catch (syncErr) {
          console.error("Error syncing invoices:", syncErr);
        }

      } else {
        const names = newStudent.name.trim().split(' ').map(n => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
        const firstTwo = names.slice(0, 2).join('.');
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const generatedEmail = `${firstTwo}.${randomSuffix}@avance.com`;
        const generatedPassword = '123456';

        const docRef = await addDoc(collection(db, 'students'), {
          ...payload,
          systemLogin: generatedEmail,
          createdAt: serverTimestamp()
        });

        try {
          const fn = getFunctions();
          const createStudentUser = httpsCallable(fn, 'createStudentUser');
          await createStudentUser({
            email: generatedEmail,
            password: generatedPassword,
            displayName: newStudent.name,
            studentId: docRef.id
          });
        } catch (authErr) {
          console.error("Erro ao gerar Auth para Aluno:", authErr);
        }

        // Generate lessons for the next 12 months automatically
        if (newStudent.status === 'active') {
          await generateLessonsForYear(docRef.id, newStudent.enrollments);
        }

        // Generate initial payment for the billing start date
        if (newStudent.status === 'active' && newStudent.courseValue && newStudent.billingStartDate) {
          try {
            const [startYearStr, startMonthStr, startDayStr] = newStudent.billingStartDate.split('-');
            const startYear = parseInt(startYearStr, 10);
            const startMonth = parseInt(startMonthStr, 10);
            let dueD = parseInt(startDayStr, 10);
            
            const daysInMonth = new Date(startYear, startMonth, 0).getDate();
            if (dueD > daysInMonth) dueD = daysInMonth;
            
            const dueDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(dueD).padStart(2, '0')}`;
            
            await addDoc(collection(db, 'payments'), {
              studentId: docRef.id,
              studentName: newStudent.name,
              amount: Math.max(0, Number(newStudent.courseValue) - (Number(newStudent.discount) || 0)),
              dueDate: dueDateStr,
              month: startMonth,
              year: startYear,
              status: 'pending',
              whatsappSent: ['pre-due', 'due', 'overdue'], // Evita que o robô envie mensagens automáticas para a 1ª mensalidade
              createdAt: serverTimestamp()
            });
          } catch(err) {
            console.error("Error generating initial payment:", err);
          }
        }

        // Automatic Welcome Message (Z-API)
        if (newStudent.status === 'active' && newStudent.phone) {
          try {
            const tSnap = await getDocs(query(collection(db, 'templates'), where('type', '==', 'welcome'), where('isAutomatic', '==', true)));
            if (!tSnap.empty) {
               const template = tSnap.docs[0].data();
               const sSnap = await getDoc(doc(db, 'settings', 'integrations'));
               if (sSnap.exists()) {
                  const { zapiInstance, zapiToken, zapiSecurityToken } = sSnap.data() as any;
                  if (zapiInstance && zapiToken) {
                     const cleanPhone = newStudent.phone.replace(/\D/g, '');
                     if (cleanPhone.length >= 10) {
                       const number = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
                       let msg = template.content.replace(/{nome}/g, newStudent.name.split(' ')[0]);
                       msg = `🔔 *Aviso do Sistema Avance*\n\n${msg}`;
                       
                       msg += `\n\n📱 *Seu Portal do Aluno*\nAcesse sua agenda e histórico de mensalidades através da nossa plataforma:\n🔗 Link: https://avance-1334e.web.app\n👤 Usuário: ${generatedEmail}\n🔑 Senha provisória: ${generatedPassword}`;
                       
                       const headers: any = { 'Content-Type': 'application/json' };
                       if (zapiSecurityToken) {
                         headers['Client-Token'] = zapiSecurityToken;
                       }
                       
                       const url = zapiToken?.startsWith('http') ? zapiToken : `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`;
                       const payload = {
                         instanceName: zapiInstance,
                         phone: number,
                         message: msg
                       };
                       
                       fetch(url, {
                         method: 'POST',
                         headers: headers,
                         body: JSON.stringify(payload)
                       }).catch(err => console.error("Welcome Error:", err));
                     }
                  }
               }
            }
          } catch(e) {
            console.error("Welcome message flow error:", e);
          }
        }
      }

      setViewMode('list');
      setEditingStudentId(null);
      setNewStudent({ 
        name: '', 
        email: '',
        phone: '',
        cpf: '',
        birthDate: '',
        enrollmentDate: new Date().toISOString().split('T')[0],
        fatherName: '',
        motherName: '',
        level: 'beginner',
        status: 'active',
        enrollments: [],
        courseValue: 0,
        dueDate: 10,
        responsibleName: '',
        responsibleCpf: '',
        responsiblePhone: '',
        responsibleKinship: '',
        isScholarship: false,
        discount: 0,
        extraNotes: '',
        classType: 'group'
      });
    } catch (error) {
      handleFirestoreError(error, editingStudentId ? OperationType.UPDATE : OperationType.CREATE, 'students');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditStudent = (student: Student) => {
    setEditingStudentId(student.id);
    setNewStudent({
      name: student.name,
      email: student.email || '',
      phone: student.phone || '',
      cpf: student.cpf || '',
      birthDate: student.birthDate || '',
      enrollmentDate: student.enrollmentDate || '',
      fatherName: student.fatherName || '',
      motherName: student.motherName || '',
      level: student.level || 'beginner',
      status: student.status,
      enrollments: student.enrollments || [],
      courseValue: student.courseValue || 0,
      dueDate: student.dueDate || 10,
      responsibleName: student.responsibleName || '',
      responsibleCpf: student.responsibleCpf || '',
      responsiblePhone: student.responsiblePhone || '',
      responsibleKinship: student.responsibleKinship || '',
      isScholarship: student.isScholarship || false,
      discount: student.discount || 0,
      extraNotes: student.extraNotes || '',
      classType: student.classType || 'group',
      nationality: student.nationality || '',
      maritalStatus: student.maritalStatus || '',
      profession: student.profession || '',
      cep: student.cep || '',
      address: student.address || '',
      addressNumber: student.addressNumber || '',
      neighborhood: student.neighborhood || '',
      city: student.city || '',
      state: student.state || ''
    });
    setViewMode('form');
  };

  const openAddModal = () => {
    setEditingStudentId(null);
    setNewStudent({ 
      name: '', 
      email: '',
      phone: '',
      cpf: '',
      birthDate: '',
      enrollmentDate: new Date().toISOString().split('T')[0],
      fatherName: '',
      motherName: '',
      level: 'beginner',
      status: 'active',
      enrollments: [],
      courseValue: 0,
      dueDate: 10,
      responsibleName: '',
      responsibleCpf: '',
      responsiblePhone: '',
      responsibleKinship: '',
      isScholarship: false,
      discount: 0,
      extraNotes: '',
      classType: 'group',
      nationality: '',
      maritalStatus: '',
      profession: '',
      cep: '',
      address: '',
      addressNumber: '',
      neighborhood: '',
      city: '',
      state: ''
    });
    setViewMode('form');
  };

  const handleAutoCalculatePrice = (currentEnrollments: CourseEnrollment[], currentClassType: 'group'|'individual') => {
    let total = 0;
    currentEnrollments.forEach(e => {
        if (!e.instrument) return;
        const inst = instruments.find(i => i.name === e.instrument);
        if (inst) {
           if (currentClassType === 'individual') {
               total += (inst.individualPrice || inst.defaultPrice || schoolSettings.defaultIndividualCoursePrice || schoolSettings.defaultCoursePrice || 0);
           } else {
               total += (inst.defaultPrice || schoolSettings.defaultCoursePrice || 0);
           }
        }
    });
    return total;
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
    const remaining = newStudent.enrollments.filter((_, i) => i !== index);
    const newTotal = handleAutoCalculatePrice(remaining, newStudent.classType || 'group');
    setNewStudent({
      ...newStudent,
      enrollments: remaining,
      courseValue: newTotal > 0 ? newTotal : newStudent.courseValue
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

    if (field === 'instrument') {
      const newTotal = handleAutoCalculatePrice(newEnrollments, newStudent.classType || 'group');
      setNewStudent({ ...newStudent, enrollments: newEnrollments, courseValue: newTotal > 0 ? newTotal : newStudent.courseValue });
    } else {
      setNewStudent({ ...newStudent, enrollments: newEnrollments });
    }
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
    if (studentToDelete === 'bulk') {
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
        setStudentToDelete(null);
        setIsConfirmOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'students_bulk');
      }
      return;
    }

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

  const sendMessage = async (phone: string, templateType: string, variables: any) => {
    try {
      const sSnap = await getDoc(doc(db, 'settings', 'integrations'));
      if (!sSnap.exists()) return;
      const settings = sSnap.data() as IntegrationsSettings;
      
      const isApiz = settings.whatsappEngine === 'apiz';
      if (isApiz && (!settings.apizUrl || !settings.apizToken)) return;
      if (!isApiz && (!settings.zapiInstance || !settings.zapiToken)) return;

      const qTemplates = query(collection(db, 'templates'), where('type', '==', templateType));
      const tSnap = await getDocs(qTemplates);
      if (tSnap.empty) {
         if (templateType === 'pix_payment') {
            alert("AVISO: Ops! A fatura não foi enviada para o WhatsApp porque não existe uma mensagem configurada para 'PIX/Faturamento' (pix_payment). Crie a mensagem na aba 'Comunicação > Templates de Mensagem'!");
         }
         return;
      }
      const template = tSnap.docs[0].data();
      
      let message = template.content || '';
      if (!message.trim()) {
         alert("O texto da mensagem dessa notificação está em branco. Preencha lá na aba 'Comunicação'!");
         return;
      }

      for (const [key, val] of Object.entries(variables)) {
        message = message.replace(new RegExp(`{${key}}`, 'gi'), String(val));
      }

      // Add the requested system header Title + Bell Emoji
      message = `🔔 *Aviso do Sistema Avance*\n\n${message}`;

      let cleanedPhone = phone.replace(/\D/g, '');
      if (cleanedPhone.length === 10 || cleanedPhone.length === 11) {
          cleanedPhone = `55${cleanedPhone}`;
      }

      if (isApiz) {
        const baseUrl = settings.apizUrl?.replace(/\/send-text\/?$/, '').replace(/\/$/, '') || '';
        const response = await fetch(`${baseUrl}/send-text`, {
          method: 'POST',
          headers: {
             'Content-Type': 'application/json',
             'x-api-key': settings.apizToken || ''
          },
          body: JSON.stringify({
             instanceName: settings.apizInstanceName || 'teste-crm',
             number: cleanedPhone,
             text: message
          })
        });
        if (!response.ok) {
           const errText = await response.text();
           console.error("APIZ Error Payload:", { phone: cleanedPhone, message, response: errText });
           alert(`Erro da nossa APIZ Própria: ${errText}.`);
        }
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (settings.zapiSecurityToken) {
            headers['Client-Token'] = settings.zapiSecurityToken;
        }

        const response = await fetch(`https://api.z-api.io/instances/${settings.zapiInstance}/token/${settings.zapiToken}/send-text`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            phone: cleanedPhone,
            message: message
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("ZAPI Error 400 Payload:", { phone: cleanedPhone, message, response: errText });
          alert(`Erro da Z-API (400): ${errText}. Verifique se o telefone tem WhatsApp ou se conectou a instância.`);
        }
      }

    } catch (e) {
      console.error("WhatsApp Request Error:", e);
    }
  };

  const handleApproveStudent = async (student: Student) => {
    try {
      await updateDoc(doc(db, 'students', student.id), { status: 'active' });
      if (student.enrollments && student.enrollments.length > 0) {
        await generateLessonsForYear(student.id, student.enrollments);
      }

      // Generate and upload PDF Contract
      try {
        const studentToUpload = { ...student, status: 'active' as const };
        const pdfBlob = await generateSignedContractPDF(studentToUpload, schoolSettings, profile);
        const fileName = `${student.id}_${Date.now()}.pdf`;
        const storageRef = ref(storage, `documents/${fileName}`);
        const uploadTask = await uploadBytesResumable(storageRef, pdfBlob);
        const downloadURL = await getDownloadURL(uploadTask.ref);
        
        await addDoc(collection(db, 'documents'), {
          studentId: student.id,
          studentName: student.name,
          title: `Contrato de Matrícula - ${new Date().getFullYear()}`,
          type: 'contract',
          url: downloadURL,
          createdAt: Timestamp.now()
        });
      } catch (pdfErr) {
        console.error("Erro ao gerar/salvar contrato PDF: ", pdfErr);
      }

      // Generate initial payment for the current month
      if (student.courseValue && student.dueDate) {
        try {
          const today = new Date();
          const currentMonth = today.getMonth() + 1;
          const currentYear = today.getFullYear();
          let dueD = student.dueDate;
          
          const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
          if (dueD > daysInMonth) dueD = daysInMonth;
          
          const dueDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dueD).padStart(2, '0')}`;
          
          const paymentRef = await addDoc(collection(db, 'payments'), {
            studentId: student.id,
            studentName: student.name,
            amount: Math.max(0, Number(student.courseValue) - (Number(student.discount) || 0)),
            dueDate: dueDateStr,
            month: currentMonth,
            year: currentYear,
            status: 'pending',
            whatsappSent: [],
            createdAt: serverTimestamp()
          });

          if (student.phone) {
             setPixModalData({ student, paymentId: paymentRef.id });
          } else {
             setFeedbackData({ title: "Matrícula Aprovada!", message: "A agenda foi preenchida com sucesso." });
          }
        } catch(err) {
          console.error("Error generating initial payment:", err);
        }
      }

      if (student.phone) {
        await sendMessage(student.phone, 'enrollment_approved', {
            nome: student.name.split(' ')[0],
            name: student.name,
            login: student.systemLogin || student.email || ''
        });
      }
      // Se não tiver disparado o Modal PIX (sem telefone ou se não caiu no bloco), avisa!
      if (!student.phone || !student.courseValue) {
        setFeedbackData({ title: "Matrícula Aprovada!", message: "A agenda foi preenchida com sucesso." });
      }
    } catch (e: any) {
      console.error(e);
      alert("Erro ao aprovar a matrícula.");
    }
  };

  const handleRejectStudent = async () => {
    if (!studentToReject || !rejectReason.trim()) return;
    try {
      await updateDoc(doc(db, 'students', studentToReject.id), { status: 'rejected' });
      if (studentToReject.phone) {
        await sendMessage(studentToReject.phone, 'enrollment_rejected', {
          nome: studentToReject.name.split(' ')[0],
          name: studentToReject.name,
          admin_reason: rejectReason
        });
      }
      setIsRejectModalOpen(false);
      setStudentToReject(null);
      setRejectReason('');
      alert("Matrícula reprovada e aluno assinado notificado via WhatsApp.");
    } catch (e: any) {
      console.error(e);
      alert("Erro ao reprovar a matrícula.");
    }
  };

  const filteredStudents = students.filter(student => {
    const matchName = !filterName || student.name.toLowerCase().includes(filterName.toLowerCase());
    const matchStatus = filterStatus === 'all' || student.status === filterStatus;
    const enrollments = student.enrollments || [];
    const matchInstrument = !filterInstrument || enrollments.some(e => e.instrument === filterInstrument);
    const matchTeacher = !filterTeacher || enrollments.some(e => e.teacherId === filterTeacher);
    const hasDiscount = Number(student.discount) > 0;
    const matchDiscount = filterDiscount === 'all' || 
                         (filterDiscount === 'with_discount' && hasDiscount) ||
                         (filterDiscount === 'without_discount' && !hasDiscount);
                         
    let matchDate = true;
    if ((filterStartDate || filterEndDate) && student.enrollmentDate) {
      if (filterStartDate && student.enrollmentDate < filterStartDate) matchDate = false;
      if (filterEndDate && student.enrollmentDate > filterEndDate) matchDate = false;
    } else if (filterStartDate || filterEndDate) {
      matchDate = false;
    }

    return matchName && matchStatus && matchInstrument && matchTeacher && matchDiscount && matchDate;
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
    setStudentToDelete('bulk');
    setIsConfirmOpen(true);
  };

  return (
    <>
      {viewMode === 'list' && (
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
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="w-full sm:w-auto bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-zinc-600 font-medium"
          >
            <option value="all">Filtro de Status</option>
            <option value="pending_approval">Aprovações Pendentes</option>
            <option value="active">Apenas Ativos</option>
            <option value="inactive">Apenas Inativos</option>
          </select>
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
          <select
            value={filterDiscount}
            onChange={(e) => setFilterDiscount(e.target.value as any)}
            className="w-full sm:w-auto bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-zinc-600 font-medium"
          >
            <option value="all">Filtro de Desconto</option>
            <option value="with_discount">Apenas com Desconto</option>
            <option value="without_discount">Sem Desconto</option>
          </select>
          <div className="flex flex-col sm:flex-row items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl p-2 sm:p-1 shadow-sm w-full lg:w-auto">
            <div className="flex items-center px-2 w-full sm:w-auto justify-between sm:justify-center">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Período:</span>
              {(filterStartDate || filterEndDate) && (
                <button
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="sm:hidden p-1 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="flex-1 min-w-0 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-zinc-700 font-medium cursor-pointer"
                title="Data de Início"
              />
              <span className="text-zinc-400 font-medium text-sm">até</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="flex-1 min-w-0 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-zinc-700 font-medium cursor-pointer"
                title="Data Final"
              />
              {(filterStartDate || filterEndDate) && (
                <button
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="hidden sm:block p-2 hover:bg-zinc-200 rounded-xl transition-colors text-zinc-400 hover:text-zinc-700 ml-1 shrink-0"
                  title="Limpar período"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
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
            <>
            <button 
              onClick={() => { setIsLinkModalOpen(true); setGeneratedLink(null); }}
              className="bg-zinc-100 text-zinc-700 px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-zinc-200 transition-all font-bold shadow-sm"
            >
              Pré-Matrícula (Link)
            </button>
            <button 
              onClick={openAddModal}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all font-bold shadow-lg shadow-orange-500/25 active:scale-[0.98]"
            >
              <Plus className="w-5 h-5" />
              Novo Aluno
            </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] overflow-hidden flex flex-col">
        <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h3 className="text-xl font-medium">Lista de Alunos</h3>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPrivacyMode(!isPrivacyMode)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white ring-1 ring-zinc-200 text-zinc-500 hover:text-black hover:ring-zinc-300 transition-all text-sm font-medium shadow-sm"
            >
              {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {isPrivacyMode ? 'Ocultar Detalhes' : 'Ocultar Detalhes'}
            </button>
            <span className="text-zinc-400 text-sm">{filteredStudents.length} de {students.length} alunos</span>
          </div>
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
                <th className="py-4 font-medium">Financeiro</th>
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
                    <td className="py-5">
                      <div className="font-bold text-black display-font">{student.name}</div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {student.classType === 'individual' && (
                          <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">VIP / Individual</span>
                        )}
                        {student.classType === 'group' && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Turma</span>
                        )}
                        {student.isScholarship && (
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Bolsista</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-2 flex flex-col gap-0.5">
                        <span className="font-medium text-emerald-700">Login Acesso: {isPrivacyMode ? '••••••' : student.systemLogin || '(Não salvo na base de dados)'}</span>
                        <span>Matrícula: {student.enrollmentDate ? format(new Date(student.enrollmentDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Não informada'}</span>
                      </div>
                    </td>
                    <td className="py-5">
                      {isPrivacyMode ? (
                        <span className="text-zinc-400">••••••</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {!!student.courseValue && !student.discount && (
                            <span className="text-sm font-medium text-emerald-600">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(student.courseValue)}
                            </span>
                          )}
                          {!!student.courseValue && !!student.discount && (
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-zinc-400 line-through">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(student.courseValue)}
                              </span>
                              <span className="text-sm font-bold text-orange-600">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, student.courseValue - student.discount))}
                                <span className="text-[10px] ml-1 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Com desc.</span>
                              </span>
                            </div>
                          )}
                          {!!student.dueDate && (
                            <span className="text-xs text-zinc-500 mt-1">
                              Vence dia {student.dueDate}
                            </span>
                          )}
                          {!student.courseValue && !student.dueDate && (
                            <span className="text-xs text-zinc-400 italic">Não informado</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td colSpan={3} className="py-5">
                      {isPrivacyMode ? (
                        <span className="text-zinc-400">••••••</span>
                      ) : (
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
                      )}
                    </td>
                    <td className="py-5">
                      {isPrivacyMode ? (
                        <span className="text-zinc-400">••••••</span>
                      ) : (
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium capitalize",
                          student.status === 'active' ? "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20" : 
                          student.status === 'pending_approval' ? "bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-500/30 font-bold" :
                          "bg-zinc-50 text-zinc-600 ring-1 ring-inset ring-zinc-500/20"
                        )}>
                          {student.status === 'active' ? 'Ativo' : student.status === 'pending_approval' ? 'Pendente de Aprovação' : 'Inativo'}
                        </span>
                      )}
                    </td>
                    <td className="py-5 text-right">
                      {profile.role === 'admin' && (
                        <div className="flex items-center justify-end gap-3">
                          {student.status === 'pending_approval' && (
                            <>
                              <button 
                                onClick={() => handleApproveStudent(student)}
                                className="bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl px-4 py-2 text-xs font-bold shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-green-600 transition-all whitespace-nowrap active:scale-[0.98]"
                              >
                                ✅ Aprovar
                              </button>
                              <button 
                                onClick={() => { setStudentToReject(student); setIsRejectModalOpen(true); }}
                                className="bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl px-4 py-2 text-xs font-bold shadow-md shadow-red-500/20 hover:from-red-600 hover:to-rose-600 transition-all whitespace-nowrap active:scale-[0.98]"
                              >
                                ❌ Reprovar
                              </button>
                              {student.status === 'pending_approval' && (
                                <button 
                                  onClick={() => setViewingContract(student)}
                                  className="bg-white border border-zinc-200 text-zinc-600 rounded-xl px-4 py-2 text-xs font-bold shadow-sm hover:bg-zinc-50 transition-all whitespace-nowrap"
                                >
                                  📄 Ver Contrato
                                </button>
                              )}
                            </>
                          )}
                          <button 
                            onClick={() => setViewingStudent(student)}
                            className="text-zinc-400 hover:text-blue-500 transition-colors"
                            title="Visualizar Detalhes"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
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
        </div>
      )}

      {/* Form View (Tela Cheia) */}
      {viewMode === 'form' && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="p-2 bg-white text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-all shadow-sm ring-1 ring-zinc-950/5"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold display-font">
              {editingStudentId ? 'Editar Aluno' : 'Nova Matrícula'}
            </h2>
          </div>
          
          <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-black/[0.03] ring-1 ring-zinc-950/5">
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
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Data de Nascimento</label>
                    <input 
                      type="date" 
                      value={newStudent.birthDate}
                      onChange={e => setNewStudent({...newStudent, birthDate: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Data da Matrícula</label>
                    <input 
                      type="date" 
                      value={newStudent.enrollmentDate}
                      onChange={e => setNewStudent({...newStudent, enrollmentDate: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">E-mail</label>
                    <input 
                      type="email" 
                      value={newStudent.email}
                      onChange={e => setNewStudent({...newStudent, email: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Telefone</label>
                    <input 
                      type="tel" 
                      value={newStudent.phone}
                      onChange={e => setNewStudent({...newStudent, phone: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">CPF</label>
                    <input 
                      type="text" 
                      value={newStudent.cpf}
                      onChange={e => setNewStudent({...newStudent, cpf: applyCpfMask(e.target.value)})}
                      placeholder="000.000.000-00"
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Nome da Mãe</label>
                    <input 
                      type="text" 
                      value={newStudent.motherName}
                      onChange={e => setNewStudent({...newStudent, motherName: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Nome do Pai</label>
                    <input 
                      type="text" 
                      value={newStudent.fatherName}
                      onChange={e => setNewStudent({...newStudent, fatherName: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
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
                    onChange={e => setNewStudent({...newStudent, status: e.target.value as any})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  >
                    <option value="active">Ativo</option>
                    <option value="pending_approval">Pendente de Aprovação</option>
                    <option value="rejected">Reprovado</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Endereço</h4>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      CEP {cepLoading && <Loader2 className="inline w-3 h-3 animate-spin text-orange-500 ml-1" />}
                    </label>
                    <input 
                      type="text" 
                      value={newStudent.cep || ''}
                      onChange={e => {
                        const maskedCep = applyCepMask(e.target.value);
                        setNewStudent({...newStudent, cep: maskedCep});
                        if (maskedCep.length === 9) {
                          fetchAddressByCep(maskedCep);
                        }
                      }}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                      placeholder="00000-000"
                      maxLength={9}
                    />
                  </div>
                  <div className="md:col-span-7">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Rua / Logradouro</label>
                    <input 
                      type="text" 
                      value={newStudent.address || ''}
                      onChange={e => setNewStudent({...newStudent, address: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Número</label>
                    <input 
                      type="text" 
                      value={newStudent.addressNumber || ''}
                      onChange={e => setNewStudent({...newStudent, addressNumber: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Bairro</label>
                    <input 
                      type="text" 
                      value={newStudent.neighborhood || ''}
                      onChange={e => setNewStudent({...newStudent, neighborhood: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Cidade</label>
                    <input 
                      type="text" 
                      value={newStudent.city || ''}
                      onChange={e => setNewStudent({...newStudent, city: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Estado</label>
                    <input 
                      type="text" 
                      value={newStudent.state || ''}
                      onChange={e => setNewStudent({...newStudent, state: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                      placeholder="UF"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Dados do Responsável (Opcional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Nome do Responsável</label>
                    <input 
                      type="text" 
                      value={newStudent.responsibleName}
                      onChange={e => setNewStudent({...newStudent, responsibleName: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">CPF do Responsável</label>
                    <input 
                      type="text" 
                      value={newStudent.responsibleCpf}
                      onChange={e => setNewStudent({...newStudent, responsibleCpf: applyCpfMask(e.target.value)})}
                      placeholder="000.000.000-00"
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Telefone do Responsável</label>
                    <input 
                      type="tel" 
                      value={newStudent.responsiblePhone}
                      onChange={e => setNewStudent({...newStudent, responsiblePhone: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Grau de Parentesco</label>
                    <select 
                      value={newStudent.responsibleKinship}
                      onChange={e => setNewStudent({...newStudent, responsibleKinship: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                    >
                      <option value="">Selecione...</option>
                      <option value="Pai">Pai</option>
                      <option value="Mãe">Mãe</option>
                      <option value="Avô/Avó">Avô/Avó</option>
                      <option value="Tio/Tia">Tio/Tia</option>
                      <option value="Irmão/Irmã">Irmão/Irmã</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                </div>
              </div>


              <div className="space-y-6">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Plano de Ensino & Cursos</h4>
                <div className="bg-zinc-50/50 p-6 rounded-[24px] border border-zinc-100 space-y-8">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Modalidade da Turma</label>
                    <select 
                      value={newStudent.classType || 'group'}
                      onChange={e => {
                        const newType = e.target.value as 'individual' | 'group';
                        const newTotal = handleAutoCalculatePrice(newStudent.enrollments, newType);
                        setNewStudent({
                          ...newStudent, 
                          classType: newType,
                          courseValue: newTotal > 0 ? newTotal : newStudent.courseValue
                        });
                      }}
                      className="w-full bg-white border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-bold text-orange-600 shadow-sm"
                    >
                      <option value="group">Em Grupo (Turma) - Permite múltiplos alunos no horário</option>
                      <option value="individual">Individual / VIP - Bloqueia o horário exclusivamente</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-zinc-100/60">
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-bold text-zinc-800">Matrículas e Calendário</label>
                      <button 
                        type="button"
                        onClick={addEnrollment}
                        className="bg-black text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar Curso
                      </button>
                    </div>

                    <div className="space-y-6">
                      {newStudent.enrollments.map((enrollment, eIdx) => (
                        <div key={eIdx} className="bg-white p-6 rounded-2xl border border-zinc-100 space-y-6 relative shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
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
                                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
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
                                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                              >
                                <option value="">Selecione um professor</option>
                                {teachers
                                  .filter(t => t.isTeacher !== false)
                                  .filter(t => !enrollment.instrument || (t.instruments && t.instruments.includes(enrollment.instrument)))
                                  .map(t => (
                                  <option key={t.id} value={t.id}>{t.name} {(t.instruments && t.instruments.length > 0) ? `(${t.instruments.join(', ')})` : ''}</option>
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
                                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
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
                                const hasConflict = !isSubmitting && !!conflictReason && newStudent.status === 'active';
                                return (
                                  <div key={sIdx} className="flex flex-col gap-1">
                                    <div className={cn(
                                      "flex items-center gap-2 p-2 rounded-xl border",
                                      hasConflict ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-zinc-100"
                                    )}>
                                      <select 
                                        value={item.day}
                                        onChange={e => updateScheduleItem(eIdx, sIdx, 'day', Number(e.target.value))}
                                        className={cn("flex-1 bg-transparent text-xs focus:outline-none font-bold", hasConflict && "text-red-600")}
                                      >
                                        {DAYS_OF_WEEK.map(day => (
                                          <option key={day.value} value={day.value}>{day.label}</option>
                                        ))}
                                      </select>
                                      <input 
                                        type="time" 
                                        value={item.time}
                                        onChange={e => updateScheduleItem(eIdx, sIdx, 'time', e.target.value)}
                                        className={cn("w-20 bg-transparent text-xs focus:outline-none font-bold", hasConflict && "text-red-600")}
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
                        <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 text-sm">
                          O aluno ainda não possui cursos. Adicione acima.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>


              <div className="space-y-6">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Financeiro</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-orange-50/50 p-6 rounded-[24px] border border-orange-100/50">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Valor do Curso (R$)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={newStudent.courseValue || ''}
                      onChange={e => setNewStudent({...newStudent, courseValue: Number(e.target.value)})}
                      className="w-full bg-white border border-orange-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-bold text-orange-600 placeholder:font-normal"
                      placeholder="Ex: 150.00"
                    />
                    <p className="text-[10px] text-orange-600/70 mt-2 ml-1 font-medium">* O valor se auto-preenche com base na Modalidade</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">1º Vencimento (Início da Cobrança)</label>
                    <input 
                      type="date"
                      value={newStudent.billingStartDate || ''}
                      onChange={e => setNewStudent({...newStudent, billingStartDate: e.target.value})}
                      className="w-full bg-white border border-orange-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium font-sans"
                    />
                    <p className="text-[10px] text-orange-600/70 mt-2 ml-1 font-medium">* O dia selecionado se tornará o vencimento fixo dos próximos meses.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Desconto Mensal (R$)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={newStudent.discount || ''}
                      onChange={e => setNewStudent({...newStudent, discount: Number(e.target.value)})}
                      className="w-full bg-white border border-zinc-200 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                      placeholder="Ex: 50.00"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-8">
                    <div className="flex items-center h-5">
                      <input 
                        type="checkbox" 
                        id="isScholarship"
                        checked={newStudent.isScholarship}
                        onChange={e => setNewStudent({...newStudent, isScholarship: e.target.checked})}
                        className="w-5 h-5 rounded border-zinc-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                      />
                    </div>
                    <label htmlFor="isScholarship" className="text-sm font-medium text-zinc-700 cursor-pointer mb-0">Ativar Bolsa de Estudos Integral</label>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Anotações Extras</h4>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <textarea 
                      value={newStudent.extraNotes}
                      onChange={e => setNewStudent({...newStudent, extraNotes: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium min-h-[100px] resize-y"
                      placeholder="Observações adicionais para a secretaria..."
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full justify-center flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
              >
                {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                {isSubmitting ? 'Salvando dados e agenda...' : (editingStudentId ? 'Salvar Alterações' : 'Confirmar Matrícula e Gerar Aulas')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewingStudent && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-start justify-center p-4 pt-12 pb-20 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[32px] p-8 md:p-10 shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 relative my-auto">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold display-font">Detalhes do Aluno</h3>
              <button type="button" onClick={() => setViewingStudent(null)} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-8">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Dados Pessoais</h4>
                <div className="grid grid-cols-2 gap-6 bg-zinc-50 p-6 rounded-[24px] border border-zinc-100">
                  <div className="col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Nome Completo</span>
                    <span className="font-medium text-lg text-black">{viewingStudent.name}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Status</span>
                    <span className={cn("inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", viewingStudent.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                      {viewingStudent.status === 'active' ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {viewingStudent.level && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Nível</span>
                      <span className="font-medium capitalize">{
                        viewingStudent.level === 'beginner' ? 'Iniciante' :
                        viewingStudent.level === 'intermediate' ? 'Intermediário' : 'Avançado'
                      }</span>
                    </div>
                  )}
                  {viewingStudent.birthDate && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Data de Nascimento</span>
                      <span className="font-medium">{format(new Date(viewingStudent.birthDate + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  {viewingStudent.enrollmentDate && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Data da Matrícula</span>
                      <span className="font-medium">{format(new Date(viewingStudent.enrollmentDate + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  {viewingStudent.phone && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Telefone</span>
                      <span className="font-medium">{viewingStudent.phone}</span>
                    </div>
                  )}
                  {viewingStudent.cpf && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">CPF</span>
                      <span className="font-medium">{viewingStudent.cpf}</span>
                    </div>
                  )}
                  {viewingStudent.email && (
                    <div className="col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">E-mail</span>
                      <span className="font-medium">{viewingStudent.email}</span>
                    </div>
                  )}
                  {viewingStudent.motherName && (
                    <div className="col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Nome da Mãe</span>
                      <span className="font-medium">{viewingStudent.motherName}</span>
                    </div>
                  )}
                  {viewingStudent.fatherName && (
                    <div className="col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Nome do Pai</span>
                      <span className="font-medium">{viewingStudent.fatherName}</span>
                    </div>
                  )}
                  {viewingStudent.responsibleName && (
                    <div className="col-span-2 mt-4 pt-4 border-t border-zinc-100">
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Responsável Local ({viewingStudent.responsibleKinship || 'Não especificado'})</span>
                      <span className="font-medium">{viewingStudent.responsibleName}</span>
                      <div className="text-sm text-zinc-500 mt-1 flex gap-4">
                        {viewingStudent.responsibleCpf && <span>CPF: {viewingStudent.responsibleCpf}</span>}
                        {viewingStudent.responsiblePhone && <span>Tel: {viewingStudent.responsiblePhone}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Financeiro</h4>
                <div className="grid grid-cols-2 gap-6 bg-zinc-50 p-6 rounded-[24px] border border-zinc-100">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Valor do Curso</span>
                    <span className="font-bold text-lg text-emerald-600">
                      {viewingStudent.courseValue ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viewingStudent.courseValue) : 'Não informado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Dia de Vencimento</span>
                    <span className="font-medium text-lg">{viewingStudent.dueDate ? `Dia ${viewingStudent.dueDate}` : 'Não informado'}</span>
                  </div>
                  {!!viewingStudent.discount && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Desconto Concedido</span>
                      <span className="font-medium text-lg text-red-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viewingStudent.discount)}</span>
                    </div>
                  )}
                  {viewingStudent.isScholarship && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Programa</span>
                      <span className="inline-flex px-3 py-1 bg-amber-100 text-amber-700 font-bold text-xs rounded-full uppercase tracking-wider mt-1">Aluno Bolsista</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Configurações e Anotações</h4>
                <div className="bg-zinc-50 p-6 rounded-[24px] border border-zinc-100">
                   <div className={viewingStudent.extraNotes ? "mb-6" : ""}>
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Modalidade</span>
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-200 text-zinc-700">
                        {viewingStudent.classType === 'individual' ? 'VIP / Individual' : 'Turma / Em Grupo'}
                      </span>
                   </div>
                   {viewingStudent.extraNotes && (
                     <div>
                       <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 block mb-1">Anotações Extras</span>
                       <div className="text-sm bg-white p-4 rounded-xl border border-zinc-100 whitespace-pre-wrap">{viewingStudent.extraNotes}</div>
                     </div>
                   )}
                </div>
              </div>
              
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Matrículas (Cursos logados)</h4>
                {viewingStudent.enrollments.length === 0 ? (
                  <div className="text-sm text-zinc-500 italic">Nenhum curso matriculado.</div>
                ) : (
                  <div className="space-y-4">
                    {viewingStudent.enrollments.map((enr, i) => {
                      const teacher = teachers.find(t => t.id === enr.teacherId);
                      return (
                        <div key={i} className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="font-bold text-black block display-font">{enr.instrument}</span>
                              <span className="text-xs text-zinc-500">Professor: {teacher?.name || 'Não atribuído'}</span>
                            </div>
                            <span className="text-xs font-medium bg-zinc-200 px-2 py-1 rounded text-zinc-700">{enr.duration} Min</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {enr.schedule.map((sch, j) => (
                              <div key={j} className="flex items-center gap-1.5 text-xs bg-white border border-zinc-200 px-2.5 py-1.5 rounded-lg">
                                <span className="font-medium text-black">{sch.time}</span>
                                <span className="text-zinc-400 font-medium">· {DAYS_OF_WEEK.find(d => d.value === sch.day)?.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-8">
              <button 
                type="button"
                onClick={() => setViewingStudent(null)}
                className="w-full bg-zinc-100 text-black py-4 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDelete}
        title={studentToDelete === 'bulk' ? "Excluir Alunos em Massa" : "Excluir Aluno"}
        message={studentToDelete === 'bulk' 
          ? `Tem certeza que deseja excluir os ${selectedStudents.size} alunos selecionados? Esta ação não pode ser desfeita e TODAS as aulas (horários) associadas a estes alunos também serão excluídas mantendo a agenda limpa.`
          : "Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita e TODAS as aulas (horários) associadas a este aluno também serão excluídas do sistema."}
        confirmText="Excluir"
      />

      <AnimatePresence>
        {isLinkModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-100 shrink-0">
                <h3 className="text-xl font-bold text-zinc-900 leading-tight">Configurar Pré-Matrícula</h3>
                <button
                  onClick={() => setIsLinkModalOpen(false)}
                  className="p-3 bg-zinc-50 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {generatedLink ? (
                  <div className="text-center space-y-6">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Music2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h4 className="font-bold text-xl text-zinc-900">Link de Pré-Matrícula Gerado!</h4>
                    <p className="text-sm text-zinc-500">Envie o link abaixo para o aluno. Ao acessar ele preencherá o contrato digital, e a matrícula final será validada no sistema automaticamente.</p>
                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 break-all select-all text-sm font-medium text-orange-600 text-left">
                       {generatedLink}
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLink);
                        alert("Link copiado para a área de transferência!");
                      }} 
                      className="w-full bg-zinc-900 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
                    >
                      Copiar Link
                    </button>
                    <button onClick={() => setIsLinkModalOpen(false)} className="w-full text-zinc-500 text-sm font-medium hover:underline p-2">Fechar</button>
                  </div>
                ) : (
                  <form onSubmit={handleGenerateLink} className="space-y-4 text-left">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Curso / Instrumento</label>
                      <select 
                        required 
                        value={linkData.courseNames} 
                        onChange={e => {
                          const instName = e.target.value;
                          const inst = instruments.find(i => i.name === instName);
                          let price = linkData.courseValue;
                          if (inst) {
                            price = linkData.classType === 'individual' 
                              ? (Number(inst.individualPrice) || Number(schoolSettings.defaultIndividualCoursePrice) || 0) 
                              : (Number(inst.defaultPrice) || Number(schoolSettings.defaultCoursePrice) || 0);
                          }
                          setLinkData({...linkData, courseNames: instName, courseValue: price});
                        }} 
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                         <option value="">Selecione...</option>
                         {instruments.map(inst => (
                           <option key={inst.id} value={inst.name}>{inst.name}</option>
                         ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Valor Mensal (R$)</label>
                        <input type="number" required value={linkData.courseValue} onChange={e => setLinkData({...linkData, courseValue: Number(e.target.value)})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Dia de Pgto</label>
                        <input type="number" required min="1" max="31" value={linkData.dueDate} onChange={e => setLinkData({...linkData, dueDate: Number(e.target.value)})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-zinc-700 mb-1">Aulas por semana</label>
                         <input type="number" required min="1" value={linkData.classesPerWeek} onChange={e => setLinkData({...linkData, classesPerWeek: Number(e.target.value)})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-zinc-700 mb-1">Duração (minutos)</label>
                         <input type="number" required min="30" step="15" value={linkData.classDuration} onChange={e => setLinkData({...linkData, classDuration: Number(e.target.value)})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                      </div>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo de Modalidade</label>
                       <select 
                         value={linkData.classType} 
                         onChange={e => {
                           const type = e.target.value as 'individual'|'group';
                           const inst = instruments.find(i => i.name === linkData.courseNames);
                           let price = linkData.courseValue;
                           if (inst) {
                             price = type === 'individual' 
                               ? (Number(inst.individualPrice) || Number(schoolSettings.defaultIndividualCoursePrice) || 0) 
                               : (Number(inst.defaultPrice) || Number(schoolSettings.defaultCoursePrice) || 0);
                           }
                           setLinkData({...linkData, classType: type, courseValue: price});
                         }} 
                         className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20"
                       >
                          <option value="group">Aula em Grupo</option>
                          <option value="individual">Aula Individual</option>
                       </select>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-zinc-700 mb-1">Professor</label>
                       <select 
                         required
                         value={linkData.teacherId} 
                         onChange={e => setLinkData({...linkData, teacherId: e.target.value})} 
                         className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20"
                       >
                          <option value="">Selecione um professor</option>
                          {teachers
                            .filter(t => t.isTeacher !== false)
                            .filter(t => !linkData.courseNames || (t.instruments && t.instruments.includes(linkData.courseNames)))
                            .map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                       </select>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-zinc-700">Horários das Aulas</label>
                      {linkData.schedules.map((schedule, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select 
                            required 
                            value={schedule.dayOfWeek} 
                            onChange={e => {
                              const newSchedules = [...linkData.schedules];
                              newSchedules[idx].dayOfWeek = Number(e.target.value);
                              setLinkData({...linkData, schedules: newSchedules});
                            }} 
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20"
                          >
                             {DAYS_OF_WEEK.map(day => (
                                <option key={day.value} value={day.value}>{day.label}</option>
                             ))}
                          </select>
                          <input 
                            type="time" 
                            required 
                            value={schedule.time} 
                            onChange={e => {
                              const newSchedules = [...linkData.schedules];
                              newSchedules[idx].time = e.target.value;
                              setLinkData({...linkData, schedules: newSchedules});
                            }} 
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" 
                          />
                          {linkData.schedules.length > 1 && (
                             <button 
                               type="button"
                               onClick={() => {
                                 const newSchedules = linkData.schedules.filter((_, i) => i !== idx);
                                 setLinkData({...linkData, schedules: newSchedules});
                               }}
                               className="p-3 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                             >
                               <Trash2 className="w-5 h-5" />
                             </button>
                          )}
                        </div>
                      ))}
                      <button 
                        type="button" 
                        onClick={() => setLinkData({...linkData, schedules: [...linkData.schedules, {dayOfWeek: 1, time: '14:00'}]})}
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-zinc-300 text-zinc-500 rounded-xl py-3 text-sm font-medium hover:bg-zinc-50 hover:border-orange-300 hover:text-orange-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar mais um horário
                      </button>
                    </div>

                    <div className="pt-4 flex flex-col gap-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-zinc-700 mb-1">Desconto Mensal (R$)</label>
                          <input type="number" min="0" value={linkData.discount} onChange={e => setLinkData({...linkData, discount: Number(e.target.value)})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                        </div>
                        <div className="flex items-center pt-6">
                           <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-zinc-700">
                             <input type="checkbox" checked={linkData.isScholarship} onChange={e => setLinkData({...linkData, isScholarship: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 w-5 h-5" />
                             Bolsa Integral
                           </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Anotações Extras</label>
                        <textarea value={linkData.extraNotes} onChange={e => setLinkData({...linkData, extraNotes: e.target.value})} rows={2} placeholder="Observações para a secretaria..." className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 resize-none"></textarea>
                      </div>
                    </div>

                    <button type="submit" disabled={isSubmitting} className="w-full mt-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center shadow-lg hover:from-orange-600 hover:to-amber-600 active:scale-[0.98]">
                       {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gerar Link Mágico"}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reject Modal */}
      <AnimatePresence>
        {isRejectModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsRejectModalOpen(false)} className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden ring-1 ring-zinc-950/5 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-zinc-900 display-font">Reprovar Matrícula</h3>
                <button onClick={() => setIsRejectModalOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-zinc-600">Por favor, informe ao aluno o motivo pelo qual o contrato não pôde ser aprovado. Esta mensagem será enviada pelo WhatsApp automaticamente.</p>
                <textarea 
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ex: Faltou enviar o comprovante de residência / RG ilegível..."
                  className="w-full h-32 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-red-500/20 text-sm"
                />
                <button 
                  onClick={handleRejectStudent}
                  disabled={!rejectReason.trim()}
                  className="w-full bg-red-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 transition-colors active:scale-[0.98]"
                >
                  Confirmar Reprovação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contract Viewer Modal */}
      {viewingContract && (
        <ContractViewer student={viewingContract} onClose={() => setViewingContract(null)} />
      )}

      <ConfirmModal
        isOpen={!!pixModalData}
        title="Enviar Fatura PIX"
        message={`Matrícula aprovada! A primeira mensalidade foi gerada.\n\nDeseja enviar a fatura da primeira mensalidade (via PIX) para o Whatsapp do aluno neste momento?`}
        onConfirm={() => {
           if (pixModalData) {
               const protocol = window.location.protocol;
               const host = window.location.host;
               const paymentLink = `${protocol}//${host}/pagamento/${pixModalData.paymentId}`;
               sendMessage(pixModalData.student.phone, 'pix_payment', {
                   nome: pixModalData.student.name.split(' ')[0],
                   link_pix: paymentLink
               });
           }
           setPixModalData(null);
           setFeedbackData({ title: "Fatura Enviada!", message: "A mensalidade do aluno foi enviada via WhatsApp com sucesso." });
        }}
        onClose={() => {
           setPixModalData(null);
           setFeedbackData({ title: "Pronto!", message: "Matrícula concluída sem envio de faturamento PIX." });
        }}
        confirmText="Sim, Enviar Agora"
        cancelText="Não enviar no momento"
        variant="success"
      />

      <FeedbackModal 
        isOpen={!!feedbackData}
        onClose={() => setFeedbackData(null)}
        title={feedbackData?.title || ''}
        message={feedbackData?.message || ''}
        status="success"
      />
    </>
  );
}
