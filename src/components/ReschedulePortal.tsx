import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Calendar, Clock, User, CheckCircle2, AlertCircle, Loader2, Music2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import FeedbackModal from './FeedbackModal';

export default function ReschedulePortal({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<any[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectObservation, setRejectObservation] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [feedback, setFeedback] = useState<{isOpen: boolean, type: 'success' | 'error' | 'warning', title: string, message: string}>({ isOpen: false, type: 'success', title: '', message: '' });

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    try {
      const fn = getFunctions();
      const getData = httpsCallable(fn, 'getRescheduleData');
      const res = await getData({ token });
      setData(res.data);
    } catch (err: any) {
      console.error(err);
      setError('Link inválido, espirado ou sistema indisponível.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedSlots.length !== (data?.credits || 1)) return;
    setConfirming(true);
    try {
      const fn = getFunctions();
      const confirmData = httpsCallable(fn, 'confirmReschedule');
      await confirmData({ token, slotIds: selectedSlots.map(s => s.id) });
      setSuccess(true);
    } catch (err: any) {
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: err.message || 'Erro ao confirmar. Talvez a vaga já tenha sido preenchida. Recarregue a página.' });
      console.error(err);
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      const fn = getFunctions();
      const rejectData = httpsCallable(fn, 'rejectRescheduleSlots');
      await rejectData({ token, observation: rejectObservation });
      setRejected(true);
    } catch (err: any) {
      setFeedback({ isOpen: true, type: 'error', title: 'Erro', message: err.message || 'Erro ao processar. Recarregue a página.' });
      console.error(err);
    } finally {
      setRejecting(false);
    }
  };

  const toggleSlot = (slot: any) => {
    const isSelected = selectedSlots.some(s => s.id === slot.id);
    if (isSelected) {
      setSelectedSlots(selectedSlots.filter(s => s.id !== slot.id));
    } else {
      if (selectedSlots.length < (data?.credits || 1)) {
        setSelectedSlots([...selectedSlots, slot]);
      } else {
        setSelectedSlots([...selectedSlots.slice(0, -1), slot]);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Ops! Algum problema.</h1>
        <p className="text-zinc-500 max-w-sm">{error || "Token não encontrado."}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 bg-emerald-100 rounded-[32px] flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/20"
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </motion.div>
        <h1 className="text-3xl font-bold text-zinc-900 mb-4 display-font tracking-tight">Tudo Certo!</h1>
        <p className="text-zinc-600 max-w-sm leading-relaxed mb-4">
          Sua(s) aula(s) de reposição foram agendadas com sucesso: <br/>
          {selectedSlots.map(s => (
            <strong key={s.id} className="text-black block mt-2">• {s.dateLabel} às {s.time}</strong>
          ))}
        </p>
        <p className="text-sm text-zinc-400">Pode fechar esta página.</p>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 bg-amber-100 rounded-[32px] flex items-center justify-center mb-8 shadow-xl shadow-amber-500/20"
        >
          <CheckCircle2 className="w-10 h-10 text-amber-600" />
        </motion.div>
        <h1 className="text-3xl font-bold text-zinc-900 mb-4 display-font tracking-tight">Obrigado por informar!</h1>
        <p className="text-zinc-600 max-w-sm leading-relaxed mb-4">
          A secretaria foi notificada de que você não possui disponibilidade nos horários sugeridos. Nossa equipe entrará em contato em breve para combinar novas opções.
        </p>
        <p className="text-sm text-zinc-400">Pode fechar esta página.</p>
      </div>
    );
  }

  return (
    <>
      <FeedbackModal 
        isOpen={feedback.isOpen} 
        onClose={() => setFeedback(prev => ({ ...prev, isOpen: false }))}
        title={feedback.title}
        message={feedback.message}
        type={feedback.type}
      />
    <div className="min-h-screen bg-zinc-50 flex justify-center py-12 px-4 sm:px-6">
      <div className="max-w-lg w-full space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/20">
             <Music2 className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 display-font tracking-tight">Avance</h1>
          <p className="text-zinc-500 font-semibold uppercase tracking-widest text-xs mt-1">Reposição de Aula</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-black/[0.03] ring-1 ring-zinc-950/5">
          <div className="mb-8 p-4 bg-orange-50 border border-orange-100 rounded-2xl">
            <h2 className="text-lg font-bold text-orange-900 mb-1">Olá, {data.studentName}!</h2>
            <p className="text-sm text-orange-800 leading-relaxed">
              O professor <strong>{data.teacherName}</strong> precisou suspender {data.credits} aula(s) sua{data.reason ? ` pelo seguinte motivo: ${data.reason}` : ''}. Por favor, selecione abaixo <strong>{data.credits} horário(s)</strong> para a reposição gratuita.
            </p>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4 text-zinc-400" />
              Vagas Disponíveis
            </h3>
            <span className="text-xs font-bold bg-orange-100 text-orange-800 px-3 py-1 rounded-full border border-orange-200">
              Selecionado: {selectedSlots.length} / {data.credits}
            </span>
          </div>

          <div className="space-y-3">
            {data.availableSlots.length > 0 ? (
              data.availableSlots.map((slot: any) => {
                const isSelected = selectedSlots.some(s => s.id === slot.id);
                return (
                  <button
                    key={slot.id}
                    onClick={() => toggleSlot(slot)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected 
                      ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-500/10' 
                      : 'border-zinc-100 bg-white hover:border-orange-200'
                    }`}
                  >
                    <div>
                      <p className={`font-bold ${isSelected ? 'text-orange-900' : 'text-zinc-900'}`}>
                        {slot.dateLabel}
                      </p>
                      <p className={`text-sm ${isSelected ? 'text-orange-700' : 'text-zinc-500'}`}>
                        {slot.time}
                      </p>
                    </div>
                    <div className={`w-6 h-6 rounded-xl border-2 flex items-center justify-center ${
                      isSelected ? 'border-orange-500 bg-orange-500' : 'border-zinc-300'
                    }`}>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-center py-8 px-4 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                <p className="text-sm text-zinc-500">Nenhuma vaga de reposição disponível no momento.</p>
              </div>
            )}
          </div>

          <button
            onClick={handleConfirm}
            disabled={selectedSlots.length !== (data?.credits || 1) || confirming}
            className="w-full mt-8 bg-black hover:bg-zinc-800 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-black shadow-xl shadow-black/20"
          >
            {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Confirmar Reagendamento
          </button>

          {!showRejectForm ? (
            <button
              onClick={() => setShowRejectForm(true)}
              className="w-full mt-4 text-zinc-500 hover:text-zinc-900 py-3 rounded-2xl font-bold flex items-center justify-center transition-all bg-transparent"
            >
              Nenhum destes horários funciona para mim
            </button>
          ) : (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl"
            >
              <label className="block text-sm font-bold text-zinc-900 mb-2">Sugira um melhor dia/horário (opcional)</label>
              <textarea
                value={rejectObservation}
                onChange={(e) => setRejectObservation(e.target.value)}
                placeholder="Ex: Teria algum horário na quinta de manhã?"
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 mb-4 resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="flex-1 py-3 text-zinc-500 hover:bg-zinc-100 rounded-xl font-bold text-sm transition-all"
                >
                  Voltar
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting}
                  className="flex-[2] bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                  Notificar Secretaria
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
