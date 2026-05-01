import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, where, deleteDoc, orderBy, Timestamp } from 'firebase/firestore';
import { Teacher, Student, TeacherPaymentSettings, TeacherPaymentAdjustment, TeacherPaymentCycle, Lesson } from '../types';
import { Loader2, Plus, Save, Banknote, Calendar, Settings2, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { format, isThisMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ConfirmModal from './ConfirmModal';
import FeedbackModal from './FeedbackModal';

export default function TeacherPayments({ profile }: { profile?: any }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [adjustments, setAdjustments] = useState<TeacherPaymentAdjustment[]>([]);
  const [paidCycles, setPaidCycles] = useState<TeacherPaymentCycle[]>([]);
  const [trialLessons, setTrialLessons] = useState<Lesson[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [settings, setSettings] = useState<TeacherPaymentSettings>({
    paymentDates: [5, 15, 25],
    amountPerStudent: 80.00,
    amountPerTrialLesson: 80.00
  });
  
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  
  // New adjustment form
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [newAdjustment, setNewAdjustment] = useState<Partial<TeacherPaymentAdjustment>>({
    teacherId: '',
    description: '',
    amount: 0,
    date: format(new Date(), 'yyyy-MM-dd')
  });
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [selectedCycleFilter, setSelectedCycleFilter] = useState<1|2|3|null>(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [feedbackModal, setFeedbackModal] = useState<{isOpen: boolean, type: 'success' | 'error', title: string, message: string}>({ isOpen: false, type: 'success', title: '', message: '' });

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Settings
      const settingsSnap = await getDoc(doc(db, 'settings', 'teacher_payments'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data() as TeacherPaymentSettings;
        setSettings({
          paymentDates: data.paymentDates || [5, 15, 25],
          amountPerStudent: data.amountPerStudent || 80.00,
          amountPerTrialLesson: data.amountPerTrialLesson !== undefined ? data.amountPerTrialLesson : 80.00
        });
      }

      // Fetch Teachers
      const tSnap = await getDocs(query(collection(db, 'teachers'), where('isTeacher', '==', true)));
      const tList: Teacher[] = [];
      tSnap.forEach(d => tList.push({ id: d.id, ...d.data() } as Teacher));
      setTeachers(tList.sort((a, b) => a.name.localeCompare(b.name)));

      // Fetch Students (Active)
      const sSnap = await getDocs(query(collection(db, 'students'), where('status', '==', 'active')));
      const sList: Student[] = [];
      sSnap.forEach(d => sList.push({ id: d.id, ...d.data() } as Student));
      setStudents(sList);

      // Fetch this month's adjustments
      const currentMonthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const aSnap = await getDocs(query(collection(db, 'teacher_payment_adjustments')));
      const aList: TeacherPaymentAdjustment[] = [];
      aSnap.forEach(d => {
        const adj = { id: d.id, ...d.data() } as TeacherPaymentAdjustment;
        if (adj.date.startsWith(currentMonthPrefix)) {
          aList.push(adj);
        }
      });
      setAdjustments(aList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      // Fetch paid cycles for this month
      const cSnap = await getDocs(query(
        collection(db, 'teacher_payment_cycles'), 
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear)
      ));
      const cList: TeacherPaymentCycle[] = [];
      cSnap.forEach(d => cList.push({ id: d.id, ...d.data() } as TeacherPaymentCycle));
      setPaidCycles(cList);

      // Fetch Trial Lessons for this month
      const startObj = new Date(selectedYear, selectedMonth - 1, 1);
      const endObj = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
      
      const lSnap = await getDocs(query(
        collection(db, 'lessons'),
        where('startTime', '>=', Timestamp.fromDate(startObj)),
        where('startTime', '<=', Timestamp.fromDate(endObj))
      ));
      
      const trList: Lesson[] = [];
      lSnap.forEach(d => {
        const lesson = { id: d.id, ...d.data() } as Lesson;
        if (lesson.isTrial) {
          trList.push(lesson);
        }
      });
      setTrialLessons(trList);

    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao carregar dados.' });
    }
    setLoading(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      // Sort payment dates
      const sortedDates = [...settings.paymentDates].sort((a, b) => a - b);
      const newSettings = { 
        ...settings, 
        amountPerStudent: Number(settings.amountPerStudent), 
        amountPerTrialLesson: Number(settings.amountPerTrialLesson),
        paymentDates: sortedDates 
      };
      await setDoc(doc(db, 'settings', 'teacher_payments'), newSettings);
      setSettings(newSettings);
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Configurações salvas com sucesso!' });
      setShowSettings(false);
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar configurações.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdjustment.teacherId || !newAdjustment.description || !newAdjustment.amount || !newAdjustment.date) {
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Preencha todos os campos.' });
      return;
    }
    setSavingAdjustment(true);
    try {
      const teacher = teachers.find(t => t.id === newAdjustment.teacherId);
      const adjustmentData = {
        ...newAdjustment,
        amount: Number(newAdjustment.amount),
        teacherName: teacher?.name || 'Desconhecido',
        createdAt: new Date()
      };
      if (editingAdjustmentId) {
        await updateDoc(doc(db, 'teacher_payment_adjustments', editingAdjustmentId), {
          teacherId: newAdjustment.teacherId,
          description: newAdjustment.description,
          amount: Number(newAdjustment.amount),
          date: newAdjustment.date,
          teacherName: teacher?.name || 'Desconhecido'
        });
        setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Lançamento atualizado com sucesso!' });
      } else {
        await addDoc(collection(db, 'teacher_payment_adjustments'), adjustmentData);
        setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Lançamento adicionado com sucesso!' });
      }
      setShowAdjustmentForm(false);
      setEditingAdjustmentId(null);
      setNewAdjustment({ teacherId: '', description: '', amount: 0, date: format(new Date(), 'yyyy-MM-dd') });
      fetchData(); // Reload adjustments
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar lançamento.' });
    } finally {
      setSavingAdjustment(false);
    }
  };

  const executeDeleteAdjustment = async (id: string) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      await deleteDoc(doc(db, 'teacher_payment_adjustments', id));
      setAdjustments(prev => prev.filter(a => a.id !== id));
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Lançamento removido.' });
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao remover lançamento.' });
    }
  };

  const handleDeleteAdjustment = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remover Lançamento',
      message: 'Tem certeza que deseja remover este lançamento?',
      onConfirm: () => executeDeleteAdjustment(id)
    });
  };

  const handleMarkCycleAsPaid = async (teacherId: string, teacherName: string, cycle: 1|2|3, amount: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Marcar como Pago',
      message: `Confirma o pagamento deste ciclo para o professor no valor de ${formatCurrency(amount)}? Isso congelará o valor pago no histórico e gerará uma despesa no seu financeiro.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          // 1. Create the Expense
          const expenseRef = await addDoc(collection(db, 'expenses'), {
            description: `Repasse Prof. ${teacherName} (Ciclo ${cycle}/${selectedMonth})`,
            amount: amount,
            date: format(new Date(), 'yyyy-MM-dd'),
            category: 'Pagamento Professores',
            status: 'paid',
            createdAt: Timestamp.now()
          });

          // 2. Freeze cycle and link expense
          await addDoc(collection(db, 'teacher_payment_cycles'), {
            teacherId,
            cycle,
            month: selectedMonth,
            year: selectedYear,
            amount,
            paidAt: new Date(),
            expenseId: expenseRef.id
          });
          setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Ciclo marcado como pago com sucesso!' });
          fetchData(); // Reload cycles
        } catch (error) {
          console.error(error);
          setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao registrar pagamento.' });
        }
      }
    });
  };

  const handleUndoCyclePayment = async (cycleDoc: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Desfazer Pagamento',
      message: 'Tem certeza que deseja desfazer o pagamento deste ciclo? Ele voltará a calcular o valor atual com base nos alunos ativos e a despesa correspondente no Financeiro será excluída.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDoc(doc(db, 'teacher_payment_cycles', cycleDoc.id));
          if (cycleDoc.expenseId) {
            await deleteDoc(doc(db, 'expenses', cycleDoc.expenseId));
          }
          setFeedbackModal({ isOpen: true, type: 'success', title: 'Desfeito', message: 'Pagamento desfeito com sucesso.' });
          fetchData(); // Reload cycles
        } catch (error) {
          console.error(error);
          setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao desfazer pagamento.' });
        }
      }
    });
  };

  // Helper to determine the cycle of a given day
  const getCycleForDay = (day: number) => {
    const dates = [...settings.paymentDates].sort((a, b) => a - b);
    if (dates.length < 3) return 1; // Fallback
    
    if (day <= dates[0]) return 1;
    if (day <= dates[1]) return 2;
    return 3;
  };

  // Helper to get cycle bounds
  const getCycleBounds = (cycleIndex: number) => {
    const dates = [...settings.paymentDates].sort((a, b) => a - b);
    if (dates.length < 3) return { start: 1, end: 31 };
    
    if (cycleIndex === 1) return { start: 1, end: dates[0] };
    if (cycleIndex === 2) return { start: dates[0] + 1, end: dates[1] };
    if (cycleIndex === 3) return { start: dates[1] + 1, end: 31 };
    return { start: 1, end: 31 };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const currentDate = new Date();
  const isCurrentMonthYear = selectedMonth === (currentDate.getMonth() + 1) && selectedYear === currentDate.getFullYear();
  const currentDay = currentDate.getDate();
  const currentCycle = isCurrentMonthYear ? getCycleForDay(currentDay) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold display-font text-zinc-900 flex items-center gap-2">
            <Banknote className="w-6 h-6 text-orange-500" />
            Pagamentos dos Professores
          </h2>
          <div className="flex items-center gap-2 mt-2">
            <input 
              type="month"
              value={`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-');
                setSelectedYear(parseInt(y, 10));
                setSelectedMonth(parseInt(m, 10));
              }}
              className="px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-sans"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-2 bg-white text-zinc-700 ring-1 ring-zinc-200 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <Settings2 className="w-4 h-4" /> Configurações
          </button>
          <button
            onClick={() => {
              setEditingAdjustmentId(null);
              setNewAdjustment({ teacherId: '', description: '', amount: 0, date: format(new Date(), 'yyyy-MM-dd') });
              setShowAdjustmentForm(!showAdjustmentForm);
            }}
            className="px-4 py-2 bg-black text-white rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-black/20"
          >
            <Plus className="w-4 h-4" /> Lançamento Manual
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-lg mb-4 text-zinc-900">Configurações de Pagamento</h3>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Valor Mensal por Aluno</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={settings.amountPerStudent === 0 ? '' : settings.amountPerStudent}
                  onChange={e => setSettings({...settings, amountPerStudent: e.target.value as any})}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Valor por Aula Teste</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={settings.amountPerTrialLesson === 0 ? '' : settings.amountPerTrialLesson}
                  onChange={e => setSettings({...settings, amountPerTrialLesson: e.target.value as any})}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Datas de Pagamento (Ciclos)</label>
                <div className="flex gap-2">
                  <input
                    type="number" required min="1" max="31"
                    value={settings.paymentDates[0]}
                    onChange={e => setSettings({...settings, paymentDates: [Number(e.target.value), settings.paymentDates[1], settings.paymentDates[2]]})}
                    className="w-1/3 px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-center"
                    title="Ciclo 1"
                  />
                  <input
                    type="number" required min="1" max="31"
                    value={settings.paymentDates[1]}
                    onChange={e => setSettings({...settings, paymentDates: [settings.paymentDates[0], Number(e.target.value), settings.paymentDates[2]]})}
                    className="w-1/3 px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-center"
                    title="Ciclo 2"
                  />
                  <input
                    type="number" required min="1" max="31"
                    value={settings.paymentDates[2]}
                    onChange={e => setSettings({...settings, paymentDates: [settings.paymentDates[0], settings.paymentDates[1], Number(e.target.value)]})}
                    className="w-1/3 px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-center"
                    title="Ciclo 3"
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">Ex: 5, 15, 25. Define o dia exato do repasse.</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {showAdjustmentForm && (
        <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-lg mb-4 text-zinc-900">Novo Lançamento Manual</h3>
          <form onSubmit={handleSaveAdjustment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Professor</label>
                <select
                  required
                  value={newAdjustment.teacherId}
                  onChange={e => setNewAdjustment({...newAdjustment, teacherId: e.target.value})}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  <option value="">Selecione...</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Descrição</label>
                <input
                  type="text" required placeholder="Ex: Aula Teste João"
                  value={newAdjustment.description}
                  onChange={e => setNewAdjustment({...newAdjustment, description: e.target.value})}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Valor (R$)</label>
                <input
                  type="number" required step="0.01"
                  value={newAdjustment.amount === 0 ? '' : newAdjustment.amount}
                  onChange={e => setNewAdjustment({...newAdjustment, amount: e.target.value as any})}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="-10.00 para desconto"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700">Data (afeta o ciclo)</label>
                <input
                  type="date" required
                  value={newAdjustment.date}
                  onChange={e => setNewAdjustment({...newAdjustment, date: e.target.value})}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-sans"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingAdjustment}
                className="px-6 py-3 bg-black text-white rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {savingAdjustment ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} {editingAdjustmentId ? 'Atualizar' : 'Adicionar'} Lançamento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cycle Indicator */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-2">
        {[1, 2, 3].map(cycle => {
          const bounds = getCycleBounds(cycle);
          const isCurrent = cycle === currentCycle;
          return (
            <button 
              key={cycle} 
              onClick={() => setSelectedCycleFilter(selectedCycleFilter === cycle ? null : cycle as 1|2|3)}
              className={`w-full p-4 rounded-2xl border text-left transition-all ${
                selectedCycleFilter === cycle 
                  ? 'bg-orange-500 border-orange-600 shadow-lg shadow-orange-500/25' 
                  : isCurrent 
                    ? 'bg-orange-50 border-orange-200 ring-1 ring-orange-500/20 hover:bg-orange-100' 
                    : 'bg-white border-zinc-100 hover:border-orange-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-bold ${selectedCycleFilter === cycle ? 'text-white' : isCurrent ? 'text-orange-600' : 'text-zinc-500'}`}>Ciclo {cycle} {isCurrent && '(Atual)'}</span>
                <Calendar className={`w-4 h-4 ${selectedCycleFilter === cycle ? 'text-white/80' : isCurrent ? 'text-orange-500' : 'text-zinc-400'}`} />
              </div>
              <p className={`text-xs font-medium ${selectedCycleFilter === cycle ? 'text-orange-100' : isCurrent ? 'text-orange-800' : 'text-zinc-500'}`}>
                Acúmulo: dia {bounds.start} a {bounds.end}
              </p>
              <p className={`text-xs font-black mt-1 ${selectedCycleFilter === cycle ? 'text-white' : isCurrent ? 'text-orange-900' : 'text-zinc-900'}`}>
                Pagamento: dia {settings.paymentDates[cycle - 1]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
          <h3 className="font-bold text-zinc-900">
            Resumo por Professor {selectedCycleFilter ? `(Ciclo ${selectedCycleFilter})` : '(Mês Atual)'}
          </h3>
        </div>
        
        <div className="divide-y divide-zinc-100">
          {teachers.map(teacher => {
            // Find teacher's active students (where they are enrolled)
            const teacherStudents = students.filter(s => 
              s.enrollments && s.enrollments.some(e => e.teacherId === teacher.id)
            );

            const teacherAdjustments = adjustments.filter(a => a.teacherId === teacher.id);

            // Group values by cycle
            const cycleTotals = { 1: 0, 2: 0, 3: 0 };
            const cycleStudents = { 1: [] as Student[], 2: [] as Student[], 3: [] as Student[] };
            const cycleAdjustments = { 1: [] as TeacherPaymentAdjustment[], 2: [] as TeacherPaymentAdjustment[], 3: [] as TeacherPaymentAdjustment[] };
            const cycleTrialLessons = { 1: [] as Lesson[], 2: [] as Lesson[], 3: [] as Lesson[] };

            teacherStudents.forEach(s => {
              const dueDate = s.dueDate || 5;
              const cycle = getCycleForDay(dueDate);
              cycleTotals[cycle as 1|2|3] += settings.amountPerStudent;
              cycleStudents[cycle as 1|2|3].push(s);
            });

            teacherAdjustments.forEach(a => {
              const day = parseInt(a.date.split('-')[2], 10);
              const cycle = getCycleForDay(day);
              cycleTotals[cycle as 1|2|3] += a.amount;
              cycleAdjustments[cycle as 1|2|3].push(a);
            });

            trialLessons.forEach(l => {
              if (l.teacherId === teacher.id) {
                const day = l.startTime.toDate().getDate();
                const cycle = getCycleForDay(day);
                cycleTotals[cycle as 1|2|3] += settings.amountPerTrialLesson; // Automate trial lesson cost
                cycleTrialLessons[cycle as 1|2|3].push(l);
              }
            });

            const cyclePaidStatus = {
              1: paidCycles.find(pc => pc.teacherId === teacher.id && pc.cycle === 1),
              2: paidCycles.find(pc => pc.teacherId === teacher.id && pc.cycle === 2),
              3: paidCycles.find(pc => pc.teacherId === teacher.id && pc.cycle === 3)
            };

            if (cyclePaidStatus[1]) cycleTotals[1] = cyclePaidStatus[1].amount;
            if (cyclePaidStatus[2]) cycleTotals[2] = cyclePaidStatus[2].amount;
            if (cyclePaidStatus[3]) cycleTotals[3] = cyclePaidStatus[3].amount;

            const displayTotal = selectedCycleFilter ? cycleTotals[selectedCycleFilter] : (cycleTotals[1] + cycleTotals[2] + cycleTotals[3]);
            
            // Hide teacher if filtering by cycle and they have zero earnings for that cycle
            if (selectedCycleFilter && displayTotal === 0 && cycleAdjustments[selectedCycleFilter].length === 0 && cycleStudents[selectedCycleFilter].length === 0 && cycleTrialLessons[selectedCycleFilter].length === 0) {
              return null;
            }

            const isExpanded = expandedTeacher === teacher.id;

            return (
              <div key={teacher.id} className="bg-white">
                <div 
                  className="p-6 flex items-center justify-between cursor-pointer hover:bg-zinc-50 transition-colors"
                  onClick={() => setExpandedTeacher(isExpanded ? null : teacher.id)}
                >
                  <div>
                    <h4 className="font-bold text-zinc-900 text-lg">{teacher.name}</h4>
                    <p className="text-sm text-zinc-500">{teacherStudents.length} aluno(s) ativo(s)</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{selectedCycleFilter ? `Total do Ciclo ${selectedCycleFilter}` : 'Total do Mês'}</p>
                      <p className="font-black text-xl text-emerald-600">{formatCurrency(displayTotal)}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-zinc-50/50 p-6 pt-0 pb-6 border-t border-zinc-100">
                    <div className={`grid grid-cols-1 ${selectedCycleFilter ? 'md:grid-cols-1' : 'md:grid-cols-3'} gap-6 mt-6`}>
                      {[1, 2, 3].filter(c => !selectedCycleFilter || c === selectedCycleFilter).map(cycle => {
                        const total = cycleTotals[cycle as 1|2|3];
                        const studList = cycleStudents[cycle as 1|2|3];
                        const adjList = cycleAdjustments[cycle as 1|2|3];
                        const trList = cycleTrialLessons[cycle as 1|2|3];
                        const paidCycleDoc = cyclePaidStatus[cycle as 1|2|3];
                        const isPaid = !!paidCycleDoc;
                        
                        return (
                          <div key={cycle} className={`bg-white p-4 rounded-2xl ring-1 ${isPaid ? 'ring-emerald-500/50 bg-emerald-50/30' : 'ring-zinc-200'}`}>
                            <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-zinc-800 text-sm">Ciclo {cycle}</h5>
                                {isPaid && paidCycleDoc && (
                                  <div className="flex items-center gap-1">
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                                      Pago
                                    </span>
                                    <button 
                                      onClick={() => handleUndoCyclePayment(paidCycleDoc)}
                                      className="p-1 text-emerald-600/50 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                      title="Desfazer Pagamento"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <span className={`font-black ${isPaid ? 'text-emerald-700' : 'text-emerald-600'}`}>{formatCurrency(total)}</span>
                            </div>
                            
                            <div className="space-y-3">
                              {studList.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Alunos ({studList.length}x {formatCurrency(settings.amountPerStudent)})</p>
                                  <ul className="text-xs text-zinc-600 space-y-1">
                                    {studList.map(s => (
                                      <li key={s.id} className="flex justify-between">
                                        <span className="truncate pr-2">{s.name}</span>
                                        <span className="text-zinc-400 shrink-0">venc: {s.dueDate}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {trList.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Aulas Teste ({trList.length}x {formatCurrency(settings.amountPerTrialLesson)})</p>
                                  <ul className="text-xs space-y-1 text-zinc-600">
                                    {trList.map(t => (
                                      <li key={t.id} className="flex justify-between items-center group">
                                        <span className="truncate pr-2">{t.studentName || 'Prospecto'}</span>
                                        <span className="text-zinc-400 shrink-0">{format(t.startTime.toDate(), 'dd/MM')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {adjList.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Lançamentos Manuais</p>
                                  <ul className="text-xs space-y-1">
                                    {adjList.map(a => (
                                      <li key={a.id} className="flex justify-between items-center group">
                                        <span className="truncate pr-2 text-zinc-700">{a.description}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className={`font-medium ${a.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {formatCurrency(a.amount)}
                                          </span>
                                          <button 
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              setEditingAdjustmentId(a.id);
                                              setNewAdjustment({
                                                teacherId: a.teacherId,
                                                description: a.description,
                                                amount: a.amount,
                                                date: a.date
                                              });
                                              setShowAdjustmentForm(true);
                                              window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="text-zinc-400 hover:text-black opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                            title="Editar"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteAdjustment(a.id); }}
                                            className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                            title="Remover"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {studList.length === 0 && adjList.length === 0 && trList.length === 0 && (
                                <p className="text-xs text-zinc-400 italic">Nenhum repasse neste ciclo.</p>
                              )}

                              {!isPaid && total > 0 && (
                                <div className="pt-2 border-t border-zinc-100 mt-2">
                                  <button
                                    onClick={() => handleMarkCycleAsPaid(teacher.id, teacher.name, cycle as 1|2|3, total)}
                                    className="w-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 py-2 rounded-xl text-xs font-bold transition-colors"
                                  >
                                    Marcar como Pago
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          {teachers.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              Nenhum professor cadastrado.
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      
      <FeedbackModal
        isOpen={feedbackModal.isOpen}
        type={feedbackModal.type}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onClose={() => setFeedbackModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
