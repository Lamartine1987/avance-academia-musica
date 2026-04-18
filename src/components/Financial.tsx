import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Payment, IntegrationsSettings } from '../types';
import { Loader2, DollarSign, Wallet, AlertCircle, Save, CheckCircle2, PlayCircle, Search, Filter, BarChart3, Users as UsersIcon, TrendingUp } from 'lucide-react';
import { format, isThisMonth, isPast, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import ConfirmModal from './ConfirmModal';
import FeedbackModal from './FeedbackModal';

export default function Financial({ profile }: { profile?: any }) {
  const [activeTab, setActiveTab] = useState<'panel' | 'payments' | 'reports'>(profile?.role === 'student' ? 'payments' : 'panel');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reportStats, setReportStats] = useState({ totalActiveStudents: 0, totalMRR: 0, averageTicket: 0 });
  const [chartPeriod, setChartPeriod] = useState<6 | 12>(6);
  const [settings, setSettings] = useState<IntegrationsSettings>({ zapiInstance: '', zapiToken: '' });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState(false);

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

  // Filters
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterNotification, setFilterNotification] = useState('all');

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
        sSnap.forEach(d => {
          const data = d.data();
          activeCount++;
          mrr += Math.max(0, (Number(data.courseValue) || 0) - (Number(data.discount) || 0));
        });
        setReportStats({
          totalActiveStudents: activeCount,
          totalMRR: mrr,
          averageTicket: activeCount > 0 ? mrr / activeCount : 0
        });
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
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

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const thisMonthPayments = payments.filter(p => isThisMonth(new Date(p.dueDate + 'T12:00:00')));
  const totalReceived = thisMonthPayments.filter(p => p.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
  const totalPending = thisMonthPayments.filter(p => p.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpectedThisMonth = thisMonthPayments.filter(p => p.status !== 'cancelled').reduce((acc, curr) => acc + curr.amount, 0);
  const totalOverdue = payments.filter(p => p.status === 'overdue' || (p.status === 'pending' && isPast(new Date(p.dueDate + 'T12:00:00')))).reduce((acc, curr) => acc + curr.amount, 0);

  const defaultRate = totalExpectedThisMonth > 0 ? (totalOverdue / totalExpectedThisMonth) * 100 : 0;

  const generateChartData = () => {
    const data = [];
    const now = new Date();
    for (let i = chartPeriod - 1; i >= 0; i--) {
      const targetMonth = subMonths(now, i);
      const monthStr = format(targetMonth, 'yyyy-MM');
      const monthPayments = payments.filter(p => p.dueDate.startsWith(monthStr));
      
      const esperado = monthPayments.filter(p => p.status !== 'cancelled').reduce((acc, curr) => acc + curr.amount, 0);
      const recebido = monthPayments.filter(p => p.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);

      data.push({
        name: format(targetMonth, 'MMM/yy', { locale: ptBR }).toUpperCase(),
        Esperado: esperado,
        Recebido: recebido
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
          <div className="flex justify-end">
            <button
              onClick={handleRunRoutine}
              disabled={runningRoutine}
              className="px-6 py-3 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-black/20 disabled:bg-zinc-300 disabled:shadow-none"
            >
              {runningRoutine ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
              Gerar Faturas & WhatsApp Agora
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-emerald-50 rounded-[32px] p-8 border border-emerald-100 flex flex-col items-center justify-center text-center">
              <span className="text-emerald-600 font-semibold mb-2 text-sm tracking-widest uppercase">Recebido este Mês</span>
              <span className="text-4xl font-black text-emerald-950">
                {formatCurrency(totalReceived)}
              </span>
            </div>
            <div className="bg-orange-50 rounded-[32px] p-8 border border-orange-100 flex flex-col items-center justify-center text-center">
              <span className="text-orange-600 font-semibold mb-2 text-sm tracking-widest uppercase">Pendente este Mês</span>
              <span className="text-4xl font-black text-orange-950">
                {formatCurrency(totalPending)}
              </span>
            </div>
            <div className="bg-red-50 rounded-[32px] p-8 border border-red-100 flex flex-col items-center justify-center text-center">
              <span className="text-red-600 font-semibold mb-2 text-sm tracking-widest uppercase">Atrasado (Geral)</span>
              <span className="text-4xl font-black text-red-950">
                {formatCurrency(totalOverdue)}
              </span>
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
                  <Area type="monotone" dataKey="Esperado" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorEsperado)" />
                  <Area type="monotone" dataKey="Recebido" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRecebido)" />
                </AreaChart>
              </ResponsiveContainer>
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
                    <td className="py-4 px-6 font-medium text-sm">{payment.studentName}</td>
                    <td className="py-4 px-6 font-bold text-sm text-black">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {format(new Date(payment.dueDate + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
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
                    <td colSpan={profile?.role === 'student' ? 5 : 6} className="py-12 text-center text-sm text-zinc-400">Nenhuma mensalidade encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        );
      })()}

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
