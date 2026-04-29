import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, where, addDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Payment, IntegrationsSettings, Expense } from '../types';
import { Loader2, DollarSign, Wallet, AlertCircle, Save, CheckCircle2, PlayCircle, Search, Filter, BarChart3, Users as UsersIcon, TrendingUp, Receipt, Plus, Trash2, Edit2, X } from 'lucide-react';
import { format, isThisMonth, isPast, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import ConfirmModal from './ConfirmModal';
import FeedbackModal from './FeedbackModal';

export default function Financial({ profile }: { profile?: any }) {
  const [activeTab, setActiveTab] = useState<'panel' | 'payments' | 'expenses' | 'reports'>(profile?.role === 'student' ? 'payments' : 'panel');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reportStats, setReportStats] = useState({ totalActiveStudents: 0, totalMRR: 0, averageTicket: 0, instrumentData: [] as {name: string, value: number}[] });
  const [chartPeriod, setChartPeriod] = useState<6 | 12>(6);
  const [settings, setSettings] = useState<IntegrationsSettings>({ zapiInstance: '', zapiToken: '' });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState(false);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    description: '',
    amount: 0,
    date: format(new Date(), 'yyyy-MM-dd'),
    category: '',
    status: 'pending'
  });
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  const [statementModal, setStatementModal] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
    dueDate: number | null;
    courseValue: number | null;
    discount: number | null;
    history: Payment[];
  }>({
    isOpen: false,
    studentId: '',
    studentName: '',
    dueDate: null,
    courseValue: null,
    discount: null,
    history: []
  });

  // Filters
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterNotification, setFilterNotification] = useState('all');

  // Expense Filters
  const [expenseFilterCategory, setExpenseFilterCategory] = useState('all');
  const [expenseFilterMonth, setExpenseFilterMonth] = useState('');
  const [expenseFilterStatus, setExpenseFilterStatus] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'payments'));
      if (profile?.role === 'student' && profile?.studentId) {
        q = query(collection(db, 'payments'), where('studentId', '==', profile.studentId));
      }
      const pSnap = await getDocs(q);
      const pList: Payment[] = [];
      pSnap.forEach(d => pList.push({ id: d.id, ...d.data() } as Payment));
      setPayments(pList.sort((a, b) => b.createdAt?.toDate().getTime() - a.createdAt?.toDate().getTime()));

      if (profile?.role === 'admin') {
        const sSnap = await getDocs(query(collection(db, 'students'), where('status', '==', 'active')));
        let activeCount = 0;
        let mrr = 0;
        const instrumentCounts: Record<string, number> = {};

        sSnap.forEach(d => {
          const data = d.data();
          activeCount++;
          mrr += Math.max(0, (Number(data.courseValue) || 0) - (Number(data.discount) || 0));

          if (data.enrollments && Array.isArray(data.enrollments)) {
            data.enrollments.forEach((enrollment: any) => {
              if (enrollment.instrument) {
                 instrumentCounts[enrollment.instrument] = (instrumentCounts[enrollment.instrument] || 0) + 1;
              }
            });
          }
        });

        const instrumentData = Object.keys(instrumentCounts).map(key => ({
           name: key,
           value: instrumentCounts[key]
        })).sort((a, b) => b.value - a.value);

        setReportStats({
          totalActiveStudents: activeCount,
          totalMRR: mrr,
          averageTicket: activeCount > 0 ? mrr / activeCount : 0,
          instrumentData
        });

        const eSnap = await getDocs(query(collection(db, 'expenses')));
        const eList: Expense[] = [];
        eSnap.forEach(d => eList.push({ id: d.id, ...d.data() } as Expense));
        setExpenses(eList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        const settingsSnap = await getDoc(doc(db, 'settings', 'financial'));
        if (settingsSnap.exists() && settingsSnap.data().expenseCategories) {
          setCustomCategories(settingsSnap.data().expenseCategories);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const openStudentStatement = async (studentId: string, studentName: string) => {
    try {
      const studentDoc = await getDoc(doc(db, 'students', studentId));
      let dueDate = null;
      let courseValue = null;
      let discount = null;
      
      if (studentDoc.exists()) {
        const data = studentDoc.data();
        dueDate = data.dueDate || null;
        courseValue = data.courseValue || null;
        discount = data.discount || null;
      }
      
      const history = payments.filter(p => p.studentId === studentId).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      
      setStatementModal({
        isOpen: true,
        studentId,
        studentName,
        dueDate,
        courseValue,
        discount,
        history
      });
    } catch(err) {
      console.error(err);
      alert('Erro ao carregar extrato do aluno.');
    }
  };

  const executeMarkAsPaid = async (paymentId: string) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'paid',
        paidAt: new Date()
      });
      fetchData(); // reload
    } catch (error) {
      console.error(error);
      setFeedbackModal({
        isOpen: true,
        type: 'error',
        title: 'Erro ao Marcar Pagamento',
        message: 'Ocorreu um problema ao comunicar com o servidor. Tente novamente.'
      });
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    const updatedCategories = [...customCategories, newCategoryName.trim()];
    
    try {
      await setDoc(doc(db, 'settings', 'financial'), { expenseCategories: updatedCategories }, { merge: true });
      setCustomCategories(updatedCategories);
      setNewExpense({ ...newExpense, category: newCategoryName.trim() });
      setNewCategoryName('');
      setIsCreatingCategory(false);
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Categoria criada com sucesso!' });
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao criar categoria.' });
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount || !newExpense.date || !newExpense.category) {
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    setSavingExpense(true);
    try {
      if (editingExpenseId) {
        await updateDoc(doc(db, 'expenses', editingExpenseId), {
          description: newExpense.description,
          amount: newExpense.amount,
          date: newExpense.date,
          category: newExpense.category,
          status: newExpense.status
        });
        setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Despesa atualizada com sucesso!' });
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...newExpense,
          createdAt: new Date()
        });
        setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Despesa adicionada com sucesso!' });
      }
      setShowExpenseForm(false);
      setEditingExpenseId(null);
      setNewExpense({
        description: '',
        amount: 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        category: '',
        status: 'pending'
      });
      fetchData();
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao salvar despesa.' });
    } finally {
      setSavingExpense(false);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setNewExpense({
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category,
      status: expense.status
    });
    setEditingExpenseId(expense.id);
    setShowExpenseForm(true);
  };

  const executeDeleteExpense = async (expenseId: string) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
      fetchData();
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao excluir despesa.' });
    }
  };

  const handleDeleteExpense = (expenseId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Despesa',
      message: 'Tem certeza que deseja excluir esta despesa?',
      onConfirm: () => executeDeleteExpense(expenseId)
    });
  };

  const markExpenseAsPaid = async (expenseId: string) => {
    try {
      await updateDoc(doc(db, 'expenses', expenseId), { status: 'paid' });
      fetchData();
    } catch (error) {
      console.error(error);
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Erro', message: 'Erro ao marcar como paga.' });
    }
  };

  const markAsPaid = (paymentId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Pagamento',
      message: 'Tem certeza que deseja marcar esta fatura como paga?\n\nEsta ação mudará o status para PAGO e irá interromper imediatamente os alertas de cobrança desta fatura no WhatsApp.',
      onConfirm: () => executeMarkAsPaid(paymentId)
    });
  };

  const confirmRunRoutine = async () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setRunningRoutine(true);
    try {
      const fn = getFunctions();
      const runRoutine = httpsCallable(fn, 'manualFinancialRoutine');
      await runRoutine();
      setFeedbackModal({
        isOpen: true,
        type: 'success',
        title: 'Rotina Executada!',
        message: 'As faturas foram validadas e as mensagens devidas de WhatsApp foram disparadas com sucesso.'
      });
      fetchData();
    } catch (e) {
      console.error('Error running manual routine:', e);
      setFeedbackModal({
        isOpen: true,
        type: 'error',
        title: 'Erro de Automação',
        message: 'Encontramos um erro ao executar a rotina. Consulte os logs Firebase.'
      });
    } finally {
      setRunningRoutine(false);
    }
  };

  const handleRunRoutine = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Iniciar Automação Financeira?',
      message: 'Isto fará com que o sistema valide todas as faturas em aberto e dispare mensagens corretivas no WhatsApp (Vencimentos, Atrasos) na mesma hora.\n\nVocê tem certeza que deseja prosseguir agora?',
      onConfirm: confirmRunRoutine
    });
  };

  const cleanOrphanPayments = async () => {
    if (!window.confirm('Tem certeza que deseja verificar e apagar todas as faturas de alunos que já foram excluídos do sistema? Essa ação não pode ser desfeita.')) return;
    
    setCleaningOrphans(true);
    try {
      const studentsSnap = await getDocs(collection(db, 'students'));
      const studentIds = new Set(studentsSnap.docs.map(d => d.id));
      
      const paymentsSnap = await getDocs(collection(db, 'payments'));
      
      let deletedCount = 0;
      for (const pDoc of paymentsSnap.docs) {
        const studentId = pDoc.data().studentId;
        if (!studentIds.has(studentId)) {
          await deleteDoc(doc(db, 'payments', pDoc.id));
          deletedCount++;
        }
      }
      
      setFeedbackModal({
        isOpen: true,
        type: 'success',
        title: 'Limpeza Concluída',
        message: `Foram excluídas ${deletedCount} mensalidades de alunos inexistentes.`
      });
      fetchData();
    } catch (err) {
      console.error(err);
      setFeedbackModal({
        isOpen: true,
        type: 'error',
        title: 'Erro',
        message: 'Ocorreu um erro ao tentar limpar as faturas.'
      });
    } finally {
      setCleaningOrphans(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const thisMonthPayments = payments.filter(p => isThisMonth(new Date(p.dueDate + 'T12:00:00')));
  const totalReceived = payments.filter(p => {
    if (p.status !== 'paid') return false;
    if (p.paidAt) {
      const paidDate = p.paidAt?.toDate ? p.paidAt.toDate() : new Date(p.paidAt);
      return isThisMonth(paidDate);
    }
    return isThisMonth(new Date(p.dueDate + 'T12:00:00'));
  }).reduce((acc, curr) => acc + curr.amount, 0);
  
  const totalPending = thisMonthPayments.filter(p => p.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpectedThisMonth = thisMonthPayments.filter(p => p.status !== 'cancelled').reduce((acc, curr) => acc + curr.amount, 0);
  const totalOverdue = payments.filter(p => p.status === 'overdue' || (p.status === 'pending' && isPast(new Date(p.dueDate + 'T12:00:00')))).reduce((acc, curr) => acc + curr.amount, 0);

  const thisMonthExpenses = expenses.filter(e => e.date.startsWith(format(new Date(), 'yyyy-MM')));
  const totalExpenses = thisMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const netBalance = totalReceived - totalExpenses;

  const defaultRate = totalExpectedThisMonth > 0 ? (totalOverdue / totalExpectedThisMonth) * 100 : 0;

  const generateChartData = () => {
    const data = [];
    const now = new Date();
    for (let i = chartPeriod - 1; i >= 0; i--) {
      const targetMonth = subMonths(now, i);
      const monthStr = format(targetMonth, 'yyyy-MM');
      const monthPayments = payments.filter(p => p.dueDate.startsWith(monthStr));
      
      const esperado = monthPayments.filter(p => p.status !== 'cancelled').reduce((acc, curr) => acc + curr.amount, 0);
      const recebido = payments.filter(p => {
        if (p.status !== 'paid') return false;
        if (p.paidAt) {
          const paidDate = p.paidAt?.toDate ? p.paidAt.toDate() : new Date(p.paidAt);
          return format(paidDate, 'yyyy-MM') === monthStr;
        }
        return p.dueDate.startsWith(monthStr);
      }).reduce((acc, curr) => acc + curr.amount, 0);
      const despesas = expenses.filter(e => e.date.startsWith(monthStr)).reduce((acc, curr) => acc + curr.amount, 0);

      data.push({
        name: format(targetMonth, 'MMM/yy', { locale: ptBR }).toUpperCase(),
        Esperado: esperado,
        Recebido: recebido,
        Despesas: despesas,
        Lucro: recebido - despesas
      });
    }
    return data;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6">
      {profile?.role !== 'student' && (
        <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 p-2 shadow-sm flex flex-col sm:flex-row gap-2">
          <button 
            onClick={() => setActiveTab('panel')}
            className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'panel' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
          >
            <Wallet className="w-5 h-5" />
            Painel Geral
          </button>
          <button 
            onClick={() => setActiveTab('payments')}
            className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'payments' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
          >
            <CheckCircle2 className="w-5 h-5" />
            Todas as Faturas
          </button>
          <button 
            onClick={() => setActiveTab('expenses')}
            className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'expenses' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
          >
            <Receipt className="w-5 h-5" />
            Despesas
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'reports' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
          >
            <BarChart3 className="w-5 h-5" />
            Relatórios
          </button>
        </div>
      )}

      {activeTab === 'panel' && (
        <div className="space-y-6">
          <div className="flex justify-end gap-3">
            <button
              onClick={cleanOrphanPayments}
              disabled={cleaningOrphans}
              className="px-4 py-3 bg-red-50 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {cleaningOrphans ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              Limpar Excluídos
            </button>
            <button
              onClick={handleRunRoutine}
              disabled={runningRoutine}
              className="px-6 py-3 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-black/20 disabled:bg-zinc-300 disabled:shadow-none"
            >
              {runningRoutine ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
              Gerar Faturas & WhatsApp Agora
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100 flex flex-col items-center justify-center text-center">
              <span className="text-emerald-600 font-semibold mb-2 text-xs tracking-widest uppercase">Recebido (Mês)</span>
              <span className="text-2xl font-black text-emerald-950">{formatCurrency(totalReceived)}</span>
            </div>
            <div className="bg-rose-50 rounded-3xl p-6 border border-rose-100 flex flex-col items-center justify-center text-center">
              <span className="text-rose-600 font-semibold mb-2 text-xs tracking-widest uppercase">Despesas (Mês)</span>
              <span className="text-2xl font-black text-rose-950">{formatCurrency(totalExpenses)}</span>
            </div>
            <div className={`rounded-3xl p-6 border flex flex-col items-center justify-center text-center ${netBalance >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
              <span className={`font-semibold mb-2 text-xs tracking-widest uppercase ${netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Saldo Líquido</span>
              <span className={`text-2xl font-black ${netBalance >= 0 ? 'text-blue-950' : 'text-red-950'}`}>{formatCurrency(netBalance)}</span>
            </div>
            <div className="bg-orange-50 rounded-3xl p-6 border border-orange-100 flex flex-col items-center justify-center text-center">
              <span className="text-orange-600 font-semibold mb-2 text-xs tracking-widest uppercase">Pendente (Mês)</span>
              <span className="text-2xl font-black text-orange-950">{formatCurrency(totalPending)}</span>
            </div>
            <div className="bg-red-50 rounded-3xl p-6 border border-red-100 flex flex-col items-center justify-center text-center">
              <span className="text-red-600 font-semibold mb-2 text-xs tracking-widest uppercase">Atrasado (Geral)</span>
              <span className="text-2xl font-black text-red-950">{formatCurrency(totalOverdue)}</span>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-6 ring-1 ring-zinc-950/5 shadow-xl mt-8">
            <h2 className="text-xl font-bold display-font text-zinc-900 mb-6">Vencimentos Deste Mês</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500 rounded-tl-xl">Aluno</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Valor</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Vencimento</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500 rounded-tr-xl">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {thisMonthPayments.filter(p => p.status !== 'paid').sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map(payment => (
                    <tr key={payment.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-4 px-4 font-bold text-sm text-zinc-900">
                        <button 
                          onClick={() => openStudentStatement(payment.studentId, payment.studentName)}
                          className="hover:text-emerald-600 hover:underline transition-colors text-left"
                        >
                          {payment.studentName}
                        </button>
                      </td>
                      <td className="py-4 px-4 font-bold text-sm text-emerald-600">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="py-4 px-4 text-sm text-zinc-500 font-medium">
                        {format(new Date(payment.dueDate + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                          payment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {payment.status === 'paid' ? 'Pago' :
                           payment.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {thisMonthPayments.filter(p => p.status !== 'paid').length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-sm font-bold text-emerald-500">
                        🎉 Nenhuma pendência para este mês! Todos os alunos já pagaram.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && profile?.role !== 'student' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold display-font text-zinc-900">Gestão de Despesas</h2>
            <button
              onClick={() => {
                if (showExpenseForm) {
                  setShowExpenseForm(false);
                  setEditingExpenseId(null);
                  setNewExpense({ description: '', amount: 0, date: format(new Date(), 'yyyy-MM-dd'), category: '', status: 'pending' });
                } else {
                  setShowExpenseForm(true);
                }
              }}
              className="px-4 py-2 bg-black text-white rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-black/20"
            >
              {showExpenseForm ? 'Cancelar' : <><Plus className="w-4 h-4" /> Nova Despesa</>}
            </button>
          </div>

          {showExpenseForm && (
            <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl animate-in fade-in slide-in-from-top-4">
              <form onSubmit={handleSaveExpense} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700">Descrição</label>
                    <input
                      type="text"
                      required
                      value={newExpense.description}
                      onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      placeholder="Ex: Conta de Luz"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700">Valor</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={newExpense.amount}
                      onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700">Data</label>
                    <input
                      type="date"
                      required
                      value={newExpense.date}
                      onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-sans"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-zinc-700">Categoria</label>
                      {!isCreatingCategory && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingCategory(true)}
                          className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
                        >
                          + Nova Categoria
                        </button>
                      )}
                    </div>
                    {isCreatingCategory ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          placeholder="Nome da categoria"
                          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleCreateCategory}
                          className="px-4 py-3 bg-zinc-950 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-colors text-sm"
                        >
                          Criar
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCreatingCategory(false)}
                          className="px-4 py-3 bg-zinc-200 text-zinc-700 rounded-2xl font-bold hover:bg-zinc-300 transition-colors text-sm"
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <select
                        required
                        value={newExpense.category}
                        onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="">Selecione...</option>
                        <option value="Operacional">Operacional (Luz, Água, Internet)</option>
                        <option value="Pessoal">Pessoal (Salários, Benefícios)</option>
                        <option value="Marketing">Marketing & Vendas</option>
                        <option value="Infraestrutura">Infraestrutura & Manutenção</option>
                        <option value="Outros">Outros</option>
                        {customCategories.map((cat, idx) => (
                          <option key={`custom-${idx}`} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={savingExpense}
                    className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30 disabled:opacity-50"
                  >
                    {savingExpense ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Salvar Despesa
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <select
              value={expenseFilterCategory}
              onChange={e => setExpenseFilterCategory(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-zinc-700"
            >
              <option value="all">Todas as Categorias</option>
              <option value="Operacional">Operacional (Luz, Água, Internet)</option>
              <option value="Pessoal">Pessoal (Salários, Benefícios)</option>
              <option value="Marketing">Marketing & Vendas</option>
              <option value="Infraestrutura">Infraestrutura & Manutenção</option>
              <option value="Outros">Outros</option>
              {customCategories.map((cat, idx) => (
                <option key={`filter-custom-${idx}`} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              type="month"
              value={expenseFilterMonth}
              onChange={e => setExpenseFilterMonth(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-zinc-700 font-sans"
            />
            <select
              value={expenseFilterStatus}
              onChange={e => setExpenseFilterStatus(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-zinc-700"
            >
              <option value="all">Todos os Status</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
            </select>
          </div>

          <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-zinc-500">Descrição</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-zinc-500">Categoria</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-zinc-500">Data</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-zinc-500">Valor</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-zinc-500">Status</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-zinc-500 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {expenses.filter(expense => {
                    if (expenseFilterCategory !== 'all' && expense.category !== expenseFilterCategory) return false;
                    if (expenseFilterStatus !== 'all' && expense.status !== expenseFilterStatus) return false;
                    if (expenseFilterMonth && !expense.date.startsWith(expenseFilterMonth)) return false;
                    return true;
                  }).map(expense => (
                    <tr key={expense.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-4 px-6 font-medium text-sm text-zinc-900">{expense.description}</td>
                      <td className="py-4 px-6 text-sm text-zinc-500">{expense.category}</td>
                      <td className="py-4 px-6 text-sm text-zinc-500">
                        {format(new Date(expense.date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="py-4 px-6 font-bold text-sm text-zinc-900">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          expense.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {expense.status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {expense.status !== 'paid' && (
                            <button
                              onClick={() => markExpenseAsPaid(expense.id)}
                              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors px-3 py-1.5 rounded-lg"
                            >
                              Pagar
                            </button>
                          )}
                          <button
                            onClick={() => handleEditExpense(expense)}
                            className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Editar despesa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            title="Excluir despesa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-sm text-zinc-400">
                        Nenhuma despesa registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && profile?.role !== 'student' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-6 ring-1 ring-zinc-950/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-zinc-500 text-sm">Alunos Ativos</h3>
              </div>
              <p className="text-3xl font-black text-zinc-900">{reportStats.totalActiveStudents}</p>
            </div>
            
            <div className="bg-white rounded-3xl p-6 ring-1 ring-zinc-950/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-zinc-500 text-sm">MRR (Recorrente)</h3>
              </div>
              <p className="text-3xl font-black text-zinc-900">{formatCurrency(reportStats.totalMRR)}</p>
            </div>

            <div className="bg-white rounded-3xl p-6 ring-1 ring-zinc-950/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-zinc-500 text-sm">Ticket Médio</h3>
              </div>
              <p className="text-3xl font-black text-zinc-900">{formatCurrency(reportStats.averageTicket)}</p>
            </div>

            <div className="bg-white rounded-3xl p-6 ring-1 ring-zinc-950/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-zinc-500 text-sm">Inadimplência</h3>
              </div>
              <p className="text-3xl font-black text-zinc-900">{defaultRate.toFixed(1)}%</p>
              <p className="text-xs text-zinc-400 mt-1">do faturamento deste mês</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <div>
                <h2 className="text-xl font-bold display-font text-zinc-900">Evolução do Faturamento</h2>
                <p className="text-sm text-zinc-500">Comparativo do que era esperado vs o que foi pago.</p>
              </div>
              <div className="bg-zinc-100 p-1 rounded-xl flex">
                <button
                  onClick={() => setChartPeriod(6)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${chartPeriod === 6 ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-black'}`}
                >
                  6 Meses
                </button>
                <button
                  onClick={() => setChartPeriod(12)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${chartPeriod === 12 ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-black'}`}
                >
                  12 Meses
                </button>
              </div>
            </div>

            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={generateChartData()} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRecebido" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorEsperado" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLucro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#71717a', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#71717a', fontSize: 12 }}
                    tickFormatter={(value) => `R$ ${value}`}
                  />
                  <RechartsTooltip 
                    formatter={(value: number) => [formatCurrency(value), '']}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontWeight: 600, fontSize: '13px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="Esperado" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorEsperado)" />
                  <Area type="monotone" dataKey="Recebido" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRecebido)" />
                  <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorDespesas)" />
                  <Area type="monotone" dataKey="Lucro" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorLucro)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold display-font text-zinc-900">Alunos por Instrumento</h2>
              <p className="text-sm text-zinc-500">Distribuição dos alunos ativos matriculados em cada modalidade.</p>
            </div>
            <div className="h-80 w-full flex justify-center">
              {reportStats.instrumentData && reportStats.instrumentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reportStats.instrumentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {reportStats.instrumentData.map((entry, index) => {
                        const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e', '#eab308', '#14b8a6', '#06b6d4'];
                        return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                      })}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number) => [`${value} aluno${value > 1 ? 's' : ''}`, 'Matriculados']}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontWeight: 600, fontSize: '13px', paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                  <BarChart3 className="w-12 h-12 mb-2 opacity-50" />
                  <p>Sem dados suficientes para gerar o gráfico</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (() => {
        const filteredPayments = payments.filter(p => {
          if (filterName && !p.studentName.toLowerCase().includes(filterName.toLowerCase())) return false;
          if (filterStatus !== 'all' && p.status !== filterStatus) return false;
          if (filterMonth && !p.dueDate.startsWith(filterMonth)) return false;
          if (filterNotification !== 'all') {
            if (filterNotification === 'none' && p.whatsappSent && p.whatsappSent.length > 0) return false;
            if (filterNotification !== 'none' && (!p.whatsappSent || !p.whatsappSent.includes(filterNotification))) return false;
          }
          return true;
        });

        return (
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por aluno..."
                  value={filterName}
                  onChange={e => setFilterName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-zinc-700"
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Pendentes</option>
                <option value="paid">Pagos</option>
                <option value="overdue">Atrasados</option>
              </select>
              <input
                type="month"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-zinc-700 font-sans"
              />
              <select
                value={filterNotification}
                onChange={e => setFilterNotification(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-zinc-700"
              >
                <option value="all">Todas Notificações</option>
                <option value="none">Sem Notificações</option>
                <option value="pre-due">Aviso Prévio</option>
                <option value="due">No Vencimento</option>
                <option value="overdue">Cobrança Atraso</option>
              </select>
            </div>

            <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">Aluno</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">Valor</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">Vencimento</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">Data Pgto</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">Notificações</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                  {profile?.role !== 'student' && (
                    <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400 text-right">Ação</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredPayments.map(payment => (
                  <tr key={payment.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-sm">
                      <button 
                        onClick={() => openStudentStatement(payment.studentId, payment.studentName)}
                        className="hover:text-emerald-600 hover:underline transition-colors text-left"
                      >
                        {payment.studentName}
                      </button>
                    </td>
                    <td className="py-4 px-6 font-bold text-sm text-black">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {format(new Date(payment.dueDate + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="py-4 px-6 text-sm text-zinc-500 font-medium">
                      {payment.status === 'paid' && payment.paidAt 
                        ? format(payment.paidAt.toDate ? payment.paidAt.toDate() : new Date(payment.paidAt), "dd/MM/yyyy", { locale: ptBR }) 
                        : '-'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex gap-1.5 flex-wrap">
                        {payment.whatsappSent?.length > 0 ? (
                          payment.whatsappSent.map(n => (
                            <span key={n} className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                              <CheckCircle2 className="w-3 h-3" />
                              {n}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-400">Nenhuma</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                        payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                        payment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {payment.status === 'paid' ? 'Pago' :
                         payment.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                      </span>
                    </td>
                    {profile?.role !== 'student' && (
                      <td className="py-4 px-6 text-right">
                        {payment.status !== 'paid' && (
                          <button 
                            onClick={() => markAsPaid(payment.id)}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors px-3 py-1.5 rounded-lg"
                          >
                            Marcar Pago
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={profile?.role === 'student' ? 6 : 7} className="py-12 text-center text-sm text-zinc-400">Nenhuma mensalidade encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        );
      })()}

      {statementModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl relative my-8 border-t-8 border-emerald-500">
            <button
              onClick={() => setStatementModal({ ...statementModal, isOpen: false })}
              className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-2xl font-bold display-font text-zinc-900 mb-1">Extrato do Aluno</h2>
            <p className="text-zinc-500 mb-8 font-medium">{statementModal.studentName}</p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1">Mensalidade</span>
                <span className="text-2xl font-black text-emerald-600">
                  {statementModal.courseValue ? formatCurrency(Math.max(0, statementModal.courseValue - (statementModal.discount || 0))) : '-'}
                </span>
              </div>
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1">Vencimento Fixo</span>
                <span className="text-2xl font-black text-zinc-900">
                  {statementModal.dueDate ? `Dia ${statementModal.dueDate}` : 'Não definido'}
                </span>
              </div>
            </div>

            <h3 className="text-sm font-bold text-zinc-900 mb-3 ml-1 flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-emerald-500" />
              Próximas Faturas (Projeção)
            </h3>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl overflow-hidden mb-8">
              {(() => {
                const upcoming = [];
                if (statementModal.dueDate) {
                  let baseMonth, baseYear;
                  if (statementModal.history.length > 0) {
                    const latest = statementModal.history[0];
                    baseMonth = latest.month;
                    baseYear = latest.year;
                  } else {
                    const today = new Date();
                    baseMonth = today.getMonth() + 1;
                    baseYear = today.getFullYear();
                    baseMonth--;
                  }

                  for (let i = 1; i <= 3; i++) {
                    let nextM = baseMonth + i;
                    let nextY = baseYear;
                    if (nextM > 12) {
                      nextM -= 12;
                      nextY++;
                    }
                    
                    let dueD = statementModal.dueDate;
                    const daysInMonth = new Date(nextY, nextM, 0).getDate();
                    if (dueD > daysInMonth) dueD = daysInMonth;

                    const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(dueD).padStart(2, '0')}`;
                    upcoming.push(dateStr);
                  }
                }
                return upcoming.length > 0 ? (
                  <ul className="divide-y divide-emerald-100">
                    {upcoming.map((dateStr, i) => (
                      <li key={i} className="p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white text-emerald-600 flex items-center justify-center font-black text-sm shadow-sm">
                            {i + 1}
                          </div>
                          <span className="font-bold text-emerald-950">
                            {format(new Date(dateStr + 'T12:00:00'), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-700">
                          {statementModal.courseValue ? formatCurrency(Math.max(0, statementModal.courseValue - (statementModal.discount || 0))) : '-'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-sm text-emerald-600 font-medium">Não foi possível calcular projeções. Verifique se o aluno tem um dia de vencimento cadastrado.</p>
                );
              })()}
            </div>

            <h3 className="text-sm font-bold text-zinc-900 mb-3 ml-1 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-zinc-400" />
              Últimas Faturas Geradas
            </h3>
            <div className="border border-zinc-100 rounded-2xl overflow-hidden bg-white">
              <ul className="divide-y divide-zinc-50">
                {statementModal.history.slice(0, 3).map((payment) => (
                  <li key={payment.id} className="p-4 flex justify-between items-center hover:bg-zinc-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${payment.status === 'paid' ? 'bg-emerald-500' : payment.status === 'overdue' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                      <div>
                        <p className="font-bold text-zinc-900 text-sm">
                          {format(new Date(payment.dueDate + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mt-0.5">
                          {payment.status === 'paid' ? 'Pago' : payment.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-zinc-900 text-sm">
                      {formatCurrency(payment.amount)}
                    </span>
                  </li>
                ))}
                {statementModal.history.length === 0 && (
                  <li className="p-6 text-sm text-zinc-400 text-center font-medium">Nenhum histórico de faturas encontrado para este aluno.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
      />

      <FeedbackModal
        isOpen={feedbackModal.isOpen}
        onClose={() => setFeedbackModal(prev => ({ ...prev, isOpen: false }))}
        type={feedbackModal.type}
        title={feedbackModal.title}
        message={feedbackModal.message}
      />
    </div>
  );
}
