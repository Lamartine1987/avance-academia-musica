import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { QrCode, CheckCircle2, User, Camera, ShieldCheck, X } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Student } from '../types';

export default function Totem() {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  const [showScanner, setShowScanner] = useState(false);
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
      let finalStudentId = studentId;

      // Se for uma matrícula curta (digitada manualmente), vamos descobrir o ID real olhando as aulas de hoje
      if (studentId.length < 15) {
         const today = new Date();
         today.setHours(0, 0, 0, 0);
         const tomorrow = new Date(today);
         tomorrow.setDate(tomorrow.getDate() + 1);
         
         const allTodayLessonsQuery = query(
           collection(db, 'lessons'),
           where('startTime', '>=', today),
           where('startTime', '<', tomorrow)
         );
         const lessonsSnap = await getDocs(allTodayLessonsQuery);
         
         const validLessons = lessonsSnap.docs.filter(d => ['scheduled', 'completed'].includes(d.data().status));
         const matchedLesson = validLessons.find(d => d.data().studentId.toUpperCase().startsWith(studentId.toUpperCase()));
         if (matchedLesson) {
            finalStudentId = matchedLesson.data().studentId;
         } else {
            setStatus({ type: 'error', message: 'Nenhuma aula encontrada hoje para esta matrícula.' });
            setLoading(false);
            return;
         }
      }

      // 1. Validate if student exists
      const studentDoc = await getDoc(doc(db, 'students', finalStudentId));
      if (!studentDoc.exists()) {
        setStatus({ type: 'error', message: 'Aluno não encontrado ou matrícula inválida.' });
        setLoading(false);
        return;
      }

      const student = { id: studentDoc.id, ...studentDoc.data() } as Student;

      if (student.status !== 'active') {
         setStatus({ type: 'error', message: 'Matrícula não está ativa.' });
         setLoading(false);
         return;
      }

      // 2. Look for lessons TODAY for this student
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const lessonsQuery = query(
        collection(db, 'lessons'),
        where('studentId', '==', finalStudentId)
      );

      const querySnapshot = await getDocs(lessonsQuery);
      
      // Memory filter for date and status to avoid composite index requirements
      const validLessons = querySnapshot.docs.filter(d => {
         const data = d.data();
         if (!['scheduled', 'completed'].includes(data.status)) return false;
         
         // data.startTime can be a Firestore Timestamp
         const lessonDate = data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime);
         return lessonDate >= today && lessonDate < tomorrow;
      });

      if (validLessons.length === 0) {
        setStatus({ type: 'error', message: `Olá ${student.name}! Você não possui aulas agendadas para o dia de hoje.` });
        setLoading(false);
        return;
      }

      // 3. Mark check-in on the first upcoming lesson (or all of them today)
      for (const lessonDoc of validLessons) {
         if (!lessonDoc.data().checkInTime) {
            await updateDoc(doc(db, 'lessons', lessonDoc.id), {
               checkInTime: serverTimestamp()
            });
         }
      }

      // 4. Send APIZ Notification if underage
      if (student.isUnderage) {
         await sendApizMessage(student);
      }

      setStatus({ type: 'success', message: `Bem-vindo(a) ${student.name}! Seu check-in foi realizado com sucesso. Tenha uma ótima aula!` });
      setStudentIdInput('');

      // Auto clear success message after 5 seconds
      setTimeout(() => {
        setStatus({ type: 'idle', message: '' });
      }, 6000);

    } catch (err: any) {
      setStatus({ type: 'error', message: 'Erro ao processar check-in: ' + err.message });
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

           <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative">
              {/* Divider */}
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-zinc-100 -translate-x-1/2">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-zinc-300 font-bold text-sm uppercase">OU</div>
              </div>

              {/* QR Code Section */}
              <div className="flex flex-col items-center justify-center space-y-6">
                 <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 mb-2">
                   <QrCode className="w-10 h-10" />
                 </div>
                 <h3 className="text-xl font-bold text-zinc-900 text-center">Usar QR Code</h3>
                 <p className="text-zinc-500 text-center text-sm">Abra seu Painel do Aluno no celular e aproxime o QR Code da câmera</p>
                 
                 {!showScanner ? (
                   <button 
                     onClick={() => setShowScanner(true)}
                     className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-xl shadow-black/10 active:scale-[0.98]"
                   >
                     <Camera className="w-5 h-5" />
                     Ativar Câmera
                   </button>
                 ) : (
                   <div className="w-full relative">
                     <div id="reader" className="w-full rounded-2xl overflow-hidden border-2 border-orange-500"></div>
                     <button onClick={() => setShowScanner(false)} className="absolute -top-4 -right-4 bg-white text-zinc-500 p-2 rounded-full shadow-lg border border-zinc-200 hover:text-red-500">
                        <X className="w-5 h-5" />
                     </button>
                   </div>
                 )}
              </div>

              {/* Manual Input Section */}
              <div className="flex flex-col items-center justify-center space-y-6">
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
