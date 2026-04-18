import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Loader2 } from 'lucide-react';

export function InterBankSimulate({ paymentId }: { paymentId: string }) {
  const [loading, setLoading] = useState(false);

  const handleSimulatePayment = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'paid',
        paidAt: serverTimestamp()
      });
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Erro ao forçar pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-10 p-6 bg-zinc-900 rounded-[32px] text-white">
      <h3 className="font-bold text-lg mb-2">Simulador (Dev Tools)</h3>
      <p className="text-zinc-400 text-sm mb-6">Você revelou o módulo secreto de desenvolvedor. Utilize o botão abaixo para simular o recebimento do Webhook do Banco Inter.</p>
      
      <button 
        onClick={handleSimulatePayment}
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Marcar como Pago (Webhook Fake)"}
      </button>
    </div>
  );
}
