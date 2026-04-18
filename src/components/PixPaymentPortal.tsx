import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Music2, Copy, CheckCircle2, QrCode, AlertTriangle } from 'lucide-react';
import { InterBankSimulate } from './PixPaymentPortalSimulate';
import { QRCodeSVG } from 'qrcode.react';

export default function PixPaymentPortal({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [simulatedAdminClicks, setSimulatedAdminClicks] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!id) throw new Error('ID da fatura não fornecido.');
        
        const payRef = doc(db, 'payments', id);
        const paySnap = await getDoc(payRef);
        if (!paySnap.exists()) {
          throw new Error('Fatura não encontrada.');
        }
        setPayment({ id: paySnap.id, ...paySnap.data() });

        const setRef = doc(db, 'settings', 'integrations');
        const setSnap = await getDoc(setRef);
        if (setSnap.exists()) {
          setSettings(setSnap.data());
        }
        
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const formatPixField = (id: string, value: string) => {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const generateBRCode = () => {
    if (!settings?.pixKey || !payment?.amount || !settings?.pixName) return '';
    
    const gui = formatPixField('00', 'br.gov.bcb.pix');
    const key = formatPixField('01', settings.pixKey);
    const field26 = formatPixField('26', gui + key);
    
    const field52 = formatPixField('52', '0000');
    const field53 = formatPixField('53', '986');
    const field54 = formatPixField('54', payment.amount.toFixed(2));
    const field58 = formatPixField('58', 'BR');
    const field59 = formatPixField('59', settings.pixName.substring(0, 25));
    const field60 = formatPixField('60', (settings.pixCity || 'Caruaru').substring(0, 15));
    
    const txId = formatPixField('05', 'AVANCE');
    const field62 = formatPixField('62', txId);
    
    let payload = formatPixField('00', '01') + 
                  formatPixField('01', '11') + 
                  field26 + field52 + field53 + field54 + field58 + field59 + field60 + field62;
                  
    payload += '6304'; // CRC start
    
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    const crcHex = ((crc & 0xFFFF) >>> 0).toString(16).toUpperCase().padStart(4, '0');
    return payload + crcHex;
  };

  const brCode = generateBRCode();

  const handleCopy = () => {
    navigator.clipboard.writeText(brCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAdminTrick = () => {
    setSimulatedAdminClicks(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin text-orange-500">
           <QrCode className="w-8 h-8" />
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl text-center max-w-sm w-full shadow-lg border border-red-100">
           <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
           <p className="font-bold text-lg mb-2">Erro ao carregar fatura</p>
           <p className="text-zinc-500 text-sm">{error || "Não foi possível carregar as informações."}</p>
        </div>
      </div>
    );
  }

  if (payment.status === 'paid') {
     return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl text-center max-w-sm w-full shadow-lg border border-emerald-100">
             <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
             </div>
             <p className="font-bold text-2xl mb-2 text-zinc-900">Pagamento Confirmado!</p>
             <p className="text-zinc-500 text-sm">Sua mensalidade já foi baixada em nosso sistema. Muito obrigado!</p>
          </div>
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col pt-8 md:pt-16 pb-10 px-4">
      <div className="max-w-md w-full mx-auto">
        <div className="text-center mb-10" onClick={handleAdminTrick}>
           <div className="w-16 h-16 bg-gradient-to-tr from-black to-zinc-800 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-black/20 mb-4 transform -rotate-6">
              <Music2 className="text-orange-500 w-8 h-8" />
           </div>
           <h1 className="text-2xl font-black display-font">Pagamento Avance</h1>
        </div>

        <div className="bg-white rounded-[32px] p-6 shadow-xl ring-1 ring-zinc-950/5 relative overflow-hidden">
           {/* Decorator */}
           <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-[100px] -z-10 blur-xl"></div>
           
           <div className="text-center mb-8">
              <p className="text-zinc-500 text-sm font-medium mb-1">Valor da Fatura</p>
              <h2 className="text-5xl font-black tracking-tighter text-zinc-900 mb-2">R$ {payment.amount.toFixed(2)}</h2>
              <p className="text-sm font-semibold px-3 py-1 bg-zinc-100 text-black inline-flex rounded-full">
                 Ref: {payment.month}/{payment.year}
              </p>
           </div>

           {!settings?.pixKey ? (
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-red-800 text-sm flex gap-3 mb-6">
                 <AlertTriangle className="w-5 h-5 shrink-0" />
                 <p>Por favor, avise à secretaria que a "Chave PIX" global não está configurada no painel.</p>
              </div>
           ) : (
              <>
                 <div className="bg-white p-3 rounded-2xl ring-1 ring-zinc-950/5 mx-auto w-fit mb-6 shadow-sm border border-zinc-100">
                    <QRCodeSVG value={brCode} size={180} />
                 </div>
                 <p className="text-xs text-zinc-400 mt-4 font-medium uppercase tracking-widest text-center">Escaneie o código acima usando o App do seu Banco</p>

                 <div className="space-y-3 mt-6">
                    <p className="text-sm font-bold text-center text-zinc-800">Ou utilize a função Copia e Cola:</p>
                    <button 
                       onClick={handleCopy}
                       className="w-full relative bg-zinc-100 text-zinc-800 p-4 rounded-xl flex items-center justify-between hover:bg-zinc-200 transition-colors border border-zinc-200 font-mono text-xs"
                    >
                       <span className="truncate w-full text-left opacity-60">
                         {brCode}
                       </span>
                       <div className={`absolute right-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 ${copied ? 'bg-emerald-500 text-white' : 'bg-white border border-zinc-200'}`}>
                          {copied ? (
                             <><CheckCircle2 className="w-3 h-3" /> Copiado</>
                          ) : (
                             <><Copy className="w-3 h-3" /> Copiar</>
                          )}
                       </div>
                    </button>
                 </div>
              </>
           )}

           <div className="mt-8 pt-6 border-t border-zinc-100 flex items-center justify-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Ambiente Seguro</span>
              <div className="w-1 h-1 bg-zinc-300 rounded-full"></div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">Pagamento Imediato</span>
           </div>
        </div>

        {simulatedAdminClicks >= 5 && (
           <InterBankSimulate paymentId={payment.id} />
        )}
      </div>
    </div>
  );
}
