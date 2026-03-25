import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Payment, IntegrationsSettings } from '../types';
import { Loader2, DollarSign, Wallet, AlertCircle, Save, CheckCircle2, PlayCircle, Search, Filter } from 'lucide-react';
import { format, isThisMonth, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Financial() {
  const [activeTab, setActiveTab] = useState<'panel' | 'payments'>('panel');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<IntegrationsSettings>({ zapiInstance: '', zapiToken: '' });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState(false);

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
      // Fetch Payments
      const pSnap = await getDocs(query(collection(db, 'payments')));
      const pList: Payment[] = [];
      pSnap.forEach(d => pList.push({ id: d.id, ...d.data() } as Payment));
      setPayments(pList.sort((a, b) => b.createdAt?.toDate().getTime() - a.createdAt?.toDate().getTime()));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const markAsPaid = async (paymentId: string) => {
    const confirmation = window.confirm('Tem certeza que deseja marcar esta fatura como paga? Esta ação não pode ser desfeita e irá interromper os alertas de cobrança desta fatura.');
    if (!confirmation) return;
    
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'paid',
        paidAt: new Date()
      });
      fetchData(); // reload
    } catch (error) {
      console.error(error);
      alert('Erro ao marcar pagamento.');
    }
  };

  const handleRunRoutine = async () => {
    if (!window.confirm('Isto fará com que o sistema valide todas as faturas em aberto e envie as mensagens devidas no WhatsApp na mesma hora. Quer prosseguir?')) return;
    
    setRunningRoutine(true);
    try {
      const fn = getFunctions();
      const runRoutine = httpsCallable(fn, 'manualFinancialRoutine');
      await runRoutine();
      alert('Rotina executada com sucesso! As faturas e mensagens foram atualizadas.');
      fetchData();
    } catch (e) {
      console.error('Error running manual routine:', e);
      alert('Erro ao executar retinas. Consulte o log.');
    } finally {
      setRunningRoutine(false);
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
  const totalReceived = thisMonthPayments.filter(p => p.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
  const totalPending = thisMonthPayments.filter(p => p.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
  const totalOverdue = payments.filter(p => p.status === 'overdue' || (p.status === 'pending' && isPast(new Date(p.dueDate + 'T12:00:00')))).reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 p-2 shadow-sm flex flex-col sm:flex-row gap-2">
        <button 
          onClick={() => setActiveTab('panel')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'panel' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
        >
          <Wallet className="w-4 h-4" />
          Painel Resumo
        </button>
        <button 
          onClick={() => setActiveTab('payments')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'payments' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
        >
          <DollarSign className="w-4 h-4" />
          Mensalidades
        </button>
      </div>

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
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceived)}
            </span>
          </div>
          <div className="bg-orange-50 rounded-[32px] p-8 border border-orange-100 flex flex-col items-center justify-center text-center">
            <span className="text-orange-600 font-semibold mb-2 text-sm tracking-widest uppercase">Pendente este Mês</span>
            <span className="text-4xl font-black text-orange-950">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPending)}
            </span>
          </div>
          <div className="bg-red-50 rounded-[32px] p-8 border border-red-100 flex flex-col items-center justify-center text-center">
            <span className="text-red-600 font-semibold mb-2 text-sm tracking-widest uppercase">Atrasado (Geral)</span>
            <span className="text-4xl font-black text-red-950">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOverdue)}
            </span>
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
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredPayments.map(payment => (
                  <tr key={payment.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-sm">{payment.studentName}</td>
                    <td className="py-4 px-6 font-bold text-sm text-black">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payment.amount)}
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
                  </tr>
                ))}
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-zinc-400">Nenhuma mensalidade encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        );
      })()}
    </div>
  );
}
