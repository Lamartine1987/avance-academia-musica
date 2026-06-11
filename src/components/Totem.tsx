import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { CheckCircle2, User, ShieldCheck } from 'lucide-react';
import { Student } from '../types';

export default function Totem() {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  // const [showScanner, setShowScanner] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const docSnap = await getDoc(doc(db, 'settings', 'school'));
      if (docSnap.exists()) {
        setSchoolSettings(docSnap.data());
      }
    };
    fetchSettings();
  }, []);

  /*
  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
      scanner.render(async (decodedText) => {
        scanner.clear();
        setShowScanner(false);
        await processCheckIn(decodedText);
      }, (error) => {
        // ignore scan errors
      });

      return () => {
        scanner.clear().catch(e => console.error(e));
      };
    }
  }, [showScanner]);
  */

  const sendApizMessage = async (student: Student) => {
    if (!schoolSettings || schoolSettings.whatsappEngine !== 'apiz' || !schoolSettings.apizUrl || !schoolSettings.apizToken) return;

    if (!student.responsiblePhone) return;

    const phoneStr = student.responsiblePhone.replace(/\D/g, '');
    let finalPhone = phoneStr;
    if (phoneStr.length === 11 && phoneStr.startsWith('55')) {
       // already has 55
    } else if (phoneStr.length === 11 || phoneStr.length === 10) {
       finalPhone = '55' + phoneStr;
    }

    const messageText = `Olá! Informamos que o aluno(a) *${student.name}* acabou de realizar o check-in na recepção e já está presente na escola para a aula de hoje. 🏫🎵\n\nAtt,\n${schoolSettings.tradingName || 'Avance'}`;

    try {
      const baseUrl = schoolSettings.apizUrl.replace(/\/send-text\/?$/, '').replace(/\/$/, '');
      await fetch(`${baseUrl}/message/sendText/${schoolSettings.apizInstanceName || 'teste-crm'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': schoolSettings.apizToken || ''
        },
        body: JSON.stringify({
          number: finalPhone,
          text: messageText
        })
      });
      console.log("Notificação via APIZ enviada ao responsável!");
    } catch (e) {
      console.error("Erro ao enviar mensagem via APIZ:", e);
    }
  };

  const processCheckIn = async (studentId: string) => {
    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const totemCheckInFn = httpsCallable(functions, 'totemCheckIn');
      const result = await totemCheckInFn({ studentIdInput: studentId });
      const data = result.data as any;
      
      setStatus({ type: 'success', message: data.message });
      setStudentIdInput('');

      // Auto clear success message after 5 seconds
      setTimeout(() => {
        setStatus({ type: 'idle', message: '' });
      }, 6000);

    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: err.message || 'Erro ao processar check-in.' });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdInput.trim()) return;
    processCheckIn(studentIdInput.trim());
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/10 rounded-full blur-[120px]"></div>

      <div className="w-full max-w-4xl relative z-10 flex flex-col items-center">
        {schoolSettings?.logoUrl ? (
           <img src={schoolSettings.logoUrl} alt="Logo" className="h-24 object-contain mb-8 filter brightness-0 invert" />
        ) : (
           <h1 className="text-4xl font-black text-white tracking-tighter mb-8">
              AVANCE<span className="text-orange-500">.</span>
           </h1>
        )}

        <div className="bg-white w-full rounded-[40px] p-10 md:p-14 shadow-2xl overflow-hidden relative">
           <h2 className="text-3xl font-bold text-center text-zinc-900 mb-2">Check-in do Aluno</h2>
           <p className="text-zinc-500 text-center mb-10 text-lg">Registre sua presença para as aulas de hoje</p>

           {status.type === 'success' && (
             <div className="absolute inset-0 bg-emerald-500 z-50 flex flex-col items-center justify-center text-white p-10 animate-in fade-in zoom-in duration-300">
                <CheckCircle2 className="w-24 h-24 mb-6" />
                <h3 className="text-3xl font-bold text-center mb-4">{status.message}</h3>
                <p className="text-emerald-100 text-xl flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6" />
                  Presença confirmada no sistema
                </p>
             </div>
           )}

           <div className="flex flex-col items-center justify-center relative max-w-md mx-auto">
              {/* Manual Input Section */}
              <div className="flex flex-col items-center justify-center space-y-6 w-full">
                 <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 mb-2">
                   <User className="w-10 h-10" />
                 </div>
                 <h3 className="text-xl font-bold text-zinc-900 text-center">Digitar Matrícula</h3>
                 <p className="text-zinc-500 text-center text-sm">Digite o código da sua matrícula manualmente para registrar presença</p>

                 <form onSubmit={handleManualSubmit} className="w-full space-y-4">
                   <div>
                     <input 
                       type="text" 
                       value={studentIdInput}
                       onChange={e => setStudentIdInput(e.target.value.toUpperCase())}
                       placeholder="Ex: 5JK89MN..."
                       className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-6 py-4 text-center font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all uppercase"
                     />
                   </div>
                   <button 
                     type="submit"
                     disabled={loading || !studentIdInput.trim()}
                     className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 active:scale-[0.98]"
                   >
                     {loading ? 'Processando...' : 'Confirmar Presença'}
                   </button>
                 </form>

                 {status.type === 'error' && (
                    <div className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl text-center w-full animate-in fade-in slide-in-from-bottom-2">
                       {status.message}
                    </div>
                 )}
              </div>
           </div>
        </div>
        <p className="text-zinc-600 mt-8 text-sm font-medium">Totem Inteligente • Avance Academia de Música</p>
      </div>
    </div>
  );
}
