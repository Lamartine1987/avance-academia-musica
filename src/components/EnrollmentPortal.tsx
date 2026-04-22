import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Music2, Loader2, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function EnrollmentPortal({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollmentData, setEnrollmentData] = useState<any>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    rg: '',
    birthDate: '',
    nationality: 'Brasileiro(a)',
    maritalStatus: 'Solteiro(a)',
    profession: '',
    cep: '',
    address: '',
    addressNumber: '',
    neighborhood: '',
    city: '',
    state: '',
    isMinor: false,
    responsibleName: '',
    responsibleCpf: '',
    responsibleRg: '',
    responsiblePhone: '',
    responsibleKinship: '',
    level: 'beginner',
    fatherName: '',
    motherName: ''
  });

  useEffect(() => {
    const fetchEnrollment = async () => {
      try {
        const docRef = doc(db, 'pending_enrollments', token);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'completed') {
            setError('Esta matrícula já foi processada e concluída.');
          } else {
            setEnrollmentData(data);
            if (data.studentData) {
               setFormData(prev => ({ ...prev, ...data.studentData }));
            }
          }
          
          const settingsSnap = await getDoc(doc(db, 'settings', 'school'));
          if (settingsSnap.exists()) {
            setSchoolSettings(settingsSnap.data());
          } else {
            setSchoolSettings({});
          }
        } else {
          setError('Link de matrícula inválido ou expirado.');
        }
      } catch (err: any) {
        setError('Erro ao carregar link: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEnrollment();
  }, [token]);

  const fetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            address: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf
          }));
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      }
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
       const updated = { ...prev, [field]: value };
       if (field === 'birthDate' && value) {
         const birth = new Date(value);
         const today = new Date();
         let age = today.getFullYear() - birth.getFullYear();
         const m = today.getMonth() - birth.getMonth();
         if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
           age--;
         }
         updated.isMinor = age < 18;
       }
       return updated;
    });
  };

  const proceedToContract = () => {
    if (!formData.name || !formData.cpf || !formData.cep || !formData.addressNumber) {
      alert("Por favor, preencha todos os campos obrigatórios (Nome, CPF, CEP, Número residencial).");
      return;
    }
    setStep(2);
  };

  const handleSignContract = async () => {
    setIsSubmitting(true);
    try {
      const payload: any = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        cpf: formData.cpf,
        rg: formData.rg,
        birthDate: formData.birthDate,
        nationality: formData.nationality,
        maritalStatus: formData.maritalStatus,
        profession: formData.profession,
        cep: formData.cep,
        address: formData.address,
        addressNumber: formData.addressNumber,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        status: 'pending_approval',
        enrollmentDate: new Date().toISOString().split('T')[0],
        enrollments: enrollmentData.enrollments || [],
        courseValue: enrollmentData.courseValue || 0,
        dueDate: enrollmentData.dueDate || 10,
        classType: enrollmentData.classType || 'group',
        level: formData.level || 'beginner',
        fatherName: formData.fatherName || '',
        motherName: formData.motherName || '',
        extraNotes: enrollmentData.extraNotes ? `Matriculado via Self-Service Portal\n\nObs: ${enrollmentData.extraNotes}` : 'Matriculado via Self-Service Portal',
        discount: enrollmentData.discount || 0,
        isScholarship: enrollmentData.isScholarship || false,
        imageRightsGranted: (document.getElementById('chk-image') as HTMLInputElement)?.checked || false
      };

      if (formData.isMinor) {
        payload.responsibleName = formData.responsibleName;
        payload.responsibleCpf = formData.responsibleCpf;
        payload.responsibleRg = formData.responsibleRg || '';
        payload.responsiblePhone = formData.responsiblePhone;
        payload.responsibleKinship = formData.responsibleKinship;
      }

      const names = payload.name.trim().split(' ').map((n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const firstTwo = names.slice(0, 2).join('.');
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const generatedEmail = formData.email || `${firstTwo}.${randomSuffix}@avance.com`;
      const generatedPassword = '123456';

      // Contract is stored natively as data
      let userIp = 'Desconhecido';
      try {
         const ipRes = await fetch('https://api.ipify.org?format=json');
         const ipData = await ipRes.json();
         userIp = ipData.ip;
      } catch (e) {
         console.warn("Could not fetch IP", e);
      }
      payload.signatureIp = userIp;
      const docRef = await addDoc(collection(db, 'students'), {
        ...payload,
        systemLogin: generatedEmail,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'pending_enrollments', token), {
        status: 'completed',
        studentId: docRef.id,
        completedAt: serverTimestamp()
      });

      try {
        const fn = getFunctions();
        const createStudentUser = httpsCallable(fn, 'createStudentUser');
        await createStudentUser({
          email: generatedEmail,
          password: generatedPassword,
          displayName: payload.name,
          studentId: docRef.id
        });
      } catch (err) {
        console.error("Auth erro:", err);
      }

      setSuccess(true);
    } catch (e: any) {
      alert("Erro ao finalizar matrícula: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-zinc-50">
         <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
       </div>
     );
  }

  if (error || success) {
     return (
       <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
         <div className="max-w-md w-full bg-white rounded-[32px] p-8 shadow-xl text-center">
            {success ? (
               <>
                 <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                   <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                 </div>
                 <h2 className="text-2xl font-bold text-zinc-900 mb-2">Parabéns!</h2>
                 <p className="text-zinc-500 mb-6">Sua solicitação de matrícula na Avance Academia de Música foi recebida com sucesso. A secretaria realizará a ativação assim que validar suas informações.</p>
                 <p className="text-sm font-bold text-zinc-800 bg-zinc-50 p-4 rounded-xl text-left">
                   Em breve, você receberá uma mensagem no WhatsApp com a confirmação e as informações de acesso à sua área do aluno.
                 </p>
               </>
            ) : (
               <>
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                   <AlertTriangle className="w-8 h-8 text-red-600" />
                 </div>
                 <h2 className="text-xl font-bold text-zinc-900 mb-2">Aviso</h2>
                 <p className="text-zinc-500">{error}</p>
               </>
            )}
         </div>
       </div>
     );
  }

  const getFormattedDate = () => {
    const today = new Date();
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;
  };

  const ContractPreview = () => {
    
    const renderClauses = () => {
      if (schoolSettings === null) return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>;

      if (!schoolSettings.contractTemplate) {
         return (
           <div className="pl-4 space-y-4 text-justify">
             <p><strong>CLÁUSULA PRIMEIRA</strong> - O objeto do presente instrumento é a prestação, pela CONTRATADA, em favor do(a) CONTRATANTE, dos serviços de ensino de música (CNAE 8592-9/03), por meio de aulas de música e prática de instrumentos na modalidade <strong>{enrollmentData?.courseNames || 'Curso de Música'}</strong>.</p>
             
             <p className="ml-4"><strong>Parágrafo 1º</strong> - O curso compreende aulas teóricas e práticas, ministradas por professores qualificados e sempre que necessário, a critério dos professores, a utilização de equipamentos de som e imagem. <strong>AS AULAS SERÃO EM {enrollmentData?.classType === 'individual' ? 'FORMATO INDIVIDUAL' : 'GRUPO (ATÉ DOIS ALUNOS POR TURMA)'}.</strong></p>
             
             <p className="ml-4"><strong>Parágrafo 2º</strong> - As aulas são intransferíveis, ministradas <strong>{enrollmentData?.classesPerWeek || 1} vez por semana</strong>, com duração de <strong>{enrollmentData?.classDuration || 60} (sessenta) minutos</strong> em dia e horário fixo, escolhido no ato da matrícula de acordo com a disponibilidade de horário do curso contratado.</p>
             
             <p><strong>CLÁUSULA SEGUNDA</strong> - Caso o(a) CONTRATANTE não compareça a aula, computar-se-á a aula no pacote mensal do(a) CONTRATANTE, salvo nos casos de enfermidade ou internação hospitalar, devidamente comprovadas por atestado médico. <strong>A tolerância para atraso do aluno será de 20 minutos.</strong></p>
             
             <p className="ml-4"><strong>Parágrafo 1º</strong> - Deveres do Contratante(aluno): comportar-se com civilidade, observando os preceitos de disciplina e boa educação, respeito aos colegas e professores, sendo passível de rescisão deste contrato o comportamento inadequado do aluno. Não é permitida a entrada de acompanhantes, crianças(dependentes) e ou animais domésticos em sala de aula (exceto em casos de alunos portadores de necessidades especiais) <strong>NÃO É PERMITIDO O CONSUMO DE BEBIDAS ALCOÓLICAS E ALIMENTOS NAS SALAS DE AULA E NAS DEPENDÊNCIAS DA ESCOLA.</strong></p>
             
             <p className="ml-4 uppercase"><strong>Parágrafo 2º - TODO DANO OU PREJUÍZO CAUSADO PELO ALUNO NA ESTRUTURA FÍSICA DESTE ESTABELECIMENTO DE ENSINO, OS PAIS OU RESPONSÁVEIS DEVERÃO RESSARCIR AS DESPESAS À CONTRATADA, NO PRAZO DE 10 DIAS.</strong></p>
             
             <p className="ml-4"><strong>Parágrafo 3º</strong> - Durante o período de recesso(datas disponíveis no calendário da Escola) essas aulas não serão repostas. Aulas que porventura caiam em feriados <strong>(Nacional, Estadual e Municipal), não serão repostas, assim como em datas especiais: Dia do Professor</strong>.</p>
             
             <p><strong>CLÁUSULA TERCEIRA</strong> - Em contrapartida aos serviços prestados, o(a) CONTRATANTE pagará em favor da CONTRATADA o valor certo e ajustado de <strong>R$ {Number(enrollmentData?.courseValue || 0).toFixed(2).replace('.',',')}</strong>, o qual será pago mensalmente igual e sucessivamente, sendo que a primeira vencerá no dia <strong>{enrollmentData?.dueDate || 10} de {getFormattedDate().split(' ').slice(2).join(' ')}</strong>.</p>
             
             <p className="ml-4"><strong>Parágrafo 1º</strong> - No caso de inadimplência de quaisquer das parcelas, haverá a incidência de multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês ou fração sobre o valor vencido e não pago.</p>
             <p className="ml-4"><strong>Parágrafo 2º</strong> - No caso de inadimplência por mais de 20(vinte) dias, o pacote do (a) CONTRATANTE será suspenso até a liquidação das pendências financeiras.</p>
             <p className="ml-4"><strong>Parágrafo 3º</strong> - O contratante (responsável), deve fornecer um número para contato e e-mail atualizados. Autoriza também receber através do aplicativo WhatsApp e do e-mail, avisos e cobranças. (Que podem ser feitos através de qualquer plataforma ou banco utilizados pela escola).</p>
             
             <p><strong>CLÁUSULA QUARTA</strong> - Pelo presente instrumento, o(a) CONTRATANTE cede em favor da CONTRATADA os direitos de utilização de sua imagem e voz em eventos da escola.</p>
             <p><strong>CLÁUSULA QUINTA</strong> - O(A) CONTRATANTE poderá optar pela resilição do presente contrato antes do seu término, devendo, para tanto, comunicar tal intenção à CONTRATADA com antecedência mínima de 30 (trinta) dias.</p>
             <p><strong>CLÁUSULA SEXTA</strong> - As partes elegem o Foro da Comarca <strong>Caruaru</strong>, como o único competente para dirimir toda e qualquer dúvida, controvérsia e litígio, decorrente do exato cumprimento deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja ou venha a ser.</p>
             
             <p>E assim, por estarem justas e contratadas, as partes assinam o presente em duas (02) vias de igual teor, valor e forma, após lido e achado conforme.</p>
           </div>
         );
      }

      const frequency = enrollmentData?.classesPerWeek ? enrollmentData.classesPerWeek + ' vez(es) por semana' : '1 vez(es) por semana';
      const duration = enrollmentData?.classDuration ? enrollmentData.classDuration + ' minutos' : '60 minutos';
      const format = enrollmentData?.classType === 'individual' ? 'FORMATO INDIVIDUAL' : 'EM GRUPO';
      const course = enrollmentData?.courseNames || 'Curso de Música';
      const value = enrollmentData?.courseValue ? Number(enrollmentData.courseValue).toFixed(2).replace('.',',') : '0,00';
      const dueDay = enrollmentData?.dueDate || 10;
      const dueMonth = getFormattedDate().split(' ').slice(2).join(' ');
      
      let text = schoolSettings.contractTemplate;
      text = text.replace(/\{\{curso\}\}/g, course);
      text = text.replace(/\{\{formato\}\}/g, format);
      text = text.replace(/\{\{frequencia\}\}/g, frequency);
      text = text.replace(/\{\{duracao\}\}/g, duration);
      text = text.replace(/\{\{valor\}\}/g, value);
      text = text.replace(/\{\{vencimento\}\}/g, dueDay + ' ' + dueMonth);
      text = text.replace(/&nbsp;/g, ' ');

      return (
        <div 
          className="pl-4 space-y-4 text-justify break-words [&_p]:mb-4 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4"
          dangerouslySetInnerHTML={{ __html: text }} 
        />
      );
    };

    return (
    <div id="contract-document" className="bg-white p-6 md:p-10 border border-zinc-200 rounded-lg text-[13px] text-zinc-800 leading-relaxed max-w-4xl mx-auto shadow-inner h-[60vh] overflow-y-auto font-serif">
      <div className="flex items-center justify-between mb-6 border-b border-zinc-300 pb-4">
         <div className="flex items-center gap-4">
           {schoolSettings?.logoUrl ? (
             <img src={schoolSettings.logoUrl} alt="Logo" className="h-16 object-contain" />
           ) : (
             <img src="/logo-avance.png" alt="Logo Avance" className="h-16 object-contain" />
           )}
           {!schoolSettings?.logoUrl && (
             <h1 className="text-2xl font-black text-orange-600 tracking-tighter">
                AVANCE
                <span className="block text-[8px] tracking-widest text-zinc-400 mt-1 uppercase">Academia de Música</span>
             </h1>
           )}
         </div>
         <h2 className="text-xl text-zinc-500 font-bold italic">{schoolSettings?.tradingName || 'Avance Academia de Música'}</h2>
      </div>

      <div className="text-center mb-8">
         <h2 className="text-xl font-bold uppercase tracking-wide">CONTRATO DE PRESTAÇÃO DE SERVIÇO</h2>
         <p className="text-sm">390/{new Date().getFullYear()}</p>
      </div>
      
      <p className="mb-4 text-justify">
        <strong>CONTRATANTE:</strong> 
        {formData.isMinor ? (
          <>
            <strong>{formData.name}</strong>, menor impúbere, neste ato, representado pelo(a) Responsável/Contratante, <strong>{formData.responsibleName}</strong>, brasileiro(a), portador(a) da carteira de identidade RG de n.º <strong>{formData.responsibleRg || '___'}</strong>, inscrito(a) no CPF/MF sob o n.º <strong>{formData.responsibleCpf}</strong>,
          </>
        ) : (
          <>
             <strong>{formData.name}</strong>, brasileiro(a), portador(a) da carteira de identidade RG de n.º <strong>{formData.rg}</strong>, inscrito(a) no CPF/MF sob o n.º <strong>{formData.cpf}</strong>,
          </>
        )}
        {' '}residente e domiciliado(a) em <strong>{formData.address}, {formData.addressNumber}</strong>, bairro <strong>{formData.neighborhood}</strong>, CEP <strong>{formData.cep}</strong> em <strong>{formData.city} - {formData.state}</strong>.
      </p>

      <p className="mb-4 text-justify">
        <strong>CONTRATADA: {schoolSettings?.companyName || 'B. Salvador da Silva Braz Costa'}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o n.º <strong>{schoolSettings?.cnpj || '39.487.516/0001-48'}</strong>, com sede à <strong>{schoolSettings?.address || 'Avenida Oswaldo Cruz, 217'}</strong>, CEP <strong>{schoolSettings?.cep || '55.012-040'}</strong> em <strong>{schoolSettings?.city || 'Caruaru'}{schoolSettings?.state ? ` - ${schoolSettings?.state}` : ''};</strong>
      </p>

      <p className="mb-6 text-justify">
        As partes acima qualificadas têm entre si, justo e contratado, o presente contrato de prestação de serviços de ensino de música, o qual se regerá pelas seguintes cláusulas e condições.
      </p>

      {renderClauses()}

      <div className="mt-12 text-center">
         <p className="font-bold mb-16">Caruaru - PE, {getFormattedDate()}</p>
         
         <div className="flex justify-between items-end mt-8 gap-10">
           <div className="flex-1 text-center">
             <div className="border-t border-black w-full mb-1"></div>
             <p className="font-bold uppercase">{schoolSettings?.tradingName || 'Avance Academia de Música'}</p>
             <p className="font-bold">CONTRATADA</p>
           </div>
           
           <div className="flex-1 text-center">
             <div className="border-t border-black w-full mb-1"></div>
             <p className="font-bold uppercase">{formData.isMinor ? formData.responsibleName : formData.name}</p>
             <p className="font-bold">CONTRATANTE</p>
           </div>
         </div>
      </div>

      <div className="mt-16 flex justify-between items-center text-[10px] text-zinc-500 font-sans tracking-wide">
         <p>1ª via Cliente - 2ª via {schoolSettings?.tradingName || 'Avance Academia de Música'}</p>
         <p>Contrato 390/{new Date().getFullYear()} - Pág.1/1</p>
      </div>
      
      <div className="text-center text-[10px] text-zinc-500 font-sans mt-2 tracking-wide font-bold">
         <p>{schoolSettings?.address || 'Avenida Oswaldo Cruz, 217'}, {schoolSettings?.city || 'Caruaru'} - {schoolSettings?.cep || '55.012-040'}{schoolSettings?.state ? ` - ${schoolSettings?.state}` : ''}</p>
         <p>{schoolSettings?.website || 'avanceacademiademusica.com.br'} {schoolSettings?.email ? `- E-mail ${schoolSettings?.email}` : ''}</p>
         <p>Fones {schoolSettings?.phone || '(81) 99676-7783'}</p>
      </div>
    </div>
  );
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 pb-20">
       <header className="bg-zinc-950 p-6 flex flex-col items-center justify-center text-white sticky top-0 z-10 shadow-lg shadow-black/20">
         <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center mb-3">
           <Music2 className="w-6 h-6 text-white" />
         </div>
         <h1 className="text-xl font-bold display-font">Avance</h1>
         <p className="text-[10px] uppercase tracking-widest text-orange-500 font-semibold">Matrícula Digital</p>
       </header>

       <main className="max-w-4xl mx-auto px-4 pt-8">
         <div className="flex flex-col md:flex-row items-center justify-center mb-8 gap-4">
           <div className={cn("px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-all", step === 1 ? "bg-orange-500 text-white ring-4 ring-orange-500/20" : "bg-white text-zinc-400 border border-zinc-200")}>1. Ficha de Dados</div>
           <div className="hidden md:block w-10 h-px bg-zinc-300"></div>
           <div className={cn("px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-all", step === 2 ? "bg-orange-500 text-white ring-4 ring-orange-500/20" : "bg-white text-zinc-400 border border-zinc-200")}>2. Revisar e Assinar Modalidade</div>
         </div>

         {step === 1 && (
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[32px] p-6 md:p-10 shadow-xl shadow-black/5 ring-1 ring-zinc-950/5">
             <h2 className="text-2xl font-bold mb-6 text-zinc-900">Preencha sua ficha para o Contrato</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo do Aluno *</label>
                  <input type="text" placeholder="Fulano Silva..." value={formData.name} onChange={e => handleInputChange('name', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CPF *</label>
                  <input type="text" value={formData.cpf} onChange={e => handleInputChange('cpf', e.target.value)} placeholder="000.000.000-00" className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 font-medium" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">RG Civil</label>
                  <input type="text" value={formData.rg} onChange={e => handleInputChange('rg', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Data de Nascimento (Opcional)</label>
                  <input type="date" value={formData.birthDate} onChange={e => handleInputChange('birthDate', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">WhatsApp / Telefone *</label>
                  <input type="tel" placeholder="(00) 00000-0000" value={formData.phone} onChange={e => handleInputChange('phone', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nível de Experiência Musical</label>
                  <select value={formData.level} onChange={e => handleInputChange('level', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20">
                     <option value="beginner">Sem experiência (Iniciante)</option>
                     <option value="intermediate">Já possuo alguma experiência (Intermediário)</option>
                     <option value="advanced">Já toco bem (Avançado)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome da Mãe (Opcional)</label>
                  <input type="text" value={formData.motherName} onChange={e => handleInputChange('motherName', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Pai (Opcional)</label>
                  <input type="text" value={formData.fatherName} onChange={e => handleInputChange('fatherName', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
             </div>

             <h3 className="text-lg font-bold mt-10 mb-4 border-b border-zinc-100 pb-2">Endereço Documental</h3>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CEP *</label>
                  <input type="text" placeholder="00000-000" value={formData.cep} onChange={e => { handleInputChange('cep', e.target.value); fetchCep(e.target.value); }} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-orange-600" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Rua / Logradouro *</label>
                  <input type="text" value={formData.address} onChange={e => handleInputChange('address', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Número *</label>
                  <input type="text" placeholder="Ex: 215" value={formData.addressNumber} onChange={e => handleInputChange('addressNumber', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 font-bold" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Bairro *</label>
                  <input type="text" value={formData.neighborhood} onChange={e => handleInputChange('neighborhood', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Cidade</label>
                  <input type="text" value={formData.city} onChange={e => handleInputChange('city', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Estatdo (UF)</label>
                  <input type="text" value={formData.state} onChange={e => handleInputChange('state', e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20" />
                </div>
             </div>

             <div className="mt-8 p-6 bg-orange-50 rounded-2xl border border-orange-100/60 flex items-start gap-4 hover:bg-orange-100/50 transition-colors shadow-sm">
                <input type="checkbox" id="isMinor" checked={formData.isMinor} onChange={e => handleInputChange('isMinor', e.target.checked)} className="mt-1 w-6 h-6 outline-none cursor-pointer accent-orange-500 rounded border-orange-300" />
                <div>
                   <label htmlFor="isMinor" className="font-bold text-orange-900 cursor-pointer text-base">O aluno é menor de idade (Impúbere)?</label>
                   <p className="text-orange-700/80 text-sm mt-1">Marque se um "Responsável Financeiro / Contratante" irá assinar o documento da matrícula no lugar do aluno.</p>
                </div>
             </div>

             {formData.isMinor && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 p-6 md:p-8 bg-zinc-50 rounded-2xl border-2 border-zinc-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 bg-zinc-300 h-full"></div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Responsável Legal Contratante *</label>
                    <input type="text" value={formData.responsibleName} onChange={e => handleInputChange('responsibleName', e.target.value)} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-400 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">CPF do Responsável *</label>
                    <input type="text" value={formData.responsibleCpf} onChange={e => handleInputChange('responsibleCpf', e.target.value)} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-400 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">RG Civil do Responsável *</label>
                    <input type="text" value={formData.responsibleRg} onChange={e => handleInputChange('responsibleRg', e.target.value)} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-400 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone do Responsável *</label>
                    <input type="tel" value={formData.responsiblePhone} onChange={e => handleInputChange('responsiblePhone', e.target.value)} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-400 outline-none" placeholder="(00) 00000-0000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Grau de Parentesco *</label>
                    <select value={formData.responsibleKinship} onChange={e => handleInputChange('responsibleKinship', e.target.value)} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-zinc-400 outline-none">
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
             )}

             <button 
               onClick={proceedToContract} 
               disabled={formData.isMinor && (!formData.responsibleName || !formData.responsibleCpf || !formData.responsibleRg || !formData.responsiblePhone || !formData.responsibleKinship)}
               className="w-full mt-10 bg-gradient-to-r from-zinc-900 to-black text-white py-4 md:py-5 rounded-2xl font-bold flex items-center justify-center gap-2 hover:from-black hover:to-zinc-900 transition-all shadow-xl shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
               Continuar para Assinatura <ChevronRight className="w-5 h-5" />
             </button>
           </motion.div>
         )}

         {step === 2 && (
           <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="bg-orange-50 p-4 rounded-[24px] border border-orange-100 text-orange-900 flex items-center gap-4 shadow-sm">
                 <AlertTriangle className="w-6 h-6 shrink-0 text-orange-500" />
                 <p className="text-sm font-medium">Por favor, revise atentamente as cláusulas do documento que firmará nossa parceria. A via final rubricada eletronicamente será gerada a seguir.</p>
              </div>

              <ContractPreview />

              <div className="bg-white p-6 md:p-8 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl">
                 <div className="space-y-4 mb-8">
                   <label className="flex items-start gap-4 cursor-pointer p-4 md:p-6 bg-zinc-50 border border-zinc-200 hover:border-orange-300 rounded-2xl transition-colors">
                     <input type="checkbox" className="mt-1 w-6 h-6 accent-orange-500 shrink-0" required id="chk-agree" />
                     <span className="font-bold text-zinc-800 leading-snug">Eu declaro que as informações preenchidas são de livre exatidão governamental, e declaro ter lido e CONCORDO com todas as cláusulas do Contrato de Prestação de Serviço, reconhecendo esta ação como minha Assinatura Digital com Validade Legal.</span>
                   </label>

                   <label className="flex items-start gap-4 cursor-pointer p-4 md:p-6 bg-zinc-50 border border-zinc-200 hover:border-orange-300 rounded-2xl transition-colors">
                     <input type="checkbox" className="mt-1 w-6 h-6 accent-orange-500 shrink-0" required id="chk-lgpd" />
                     <span className="font-bold text-zinc-800 leading-snug">LI, COMPREENDI E CONCORDO com a Cláusula de Privacidade e Proteção de Dados (LGPD). Autorizo a coleta, o tratamento e o armazenamento em nuvem dos meus dados e/ou dos dados do aluno para fins estritamente educacionais, financeiros e administrativos da Escola.</span>
                   </label>

                   <label className="flex items-start gap-4 cursor-pointer p-4 md:p-6 bg-zinc-50 border border-zinc-200 hover:border-orange-300 rounded-2xl transition-colors">
                     <input type="checkbox" className="mt-1 w-6 h-6 accent-orange-500 shrink-0" id="chk-image" />
                     <div className="flex flex-col">
                       <span className="font-bold text-zinc-800 leading-snug">Autorizo o Uso de Imagem e Voz (Opcional)</span>
                       <span className="text-sm text-zinc-600 mt-1">Autorizo o uso, de forma gratuita, da imagem e voz do ALUNO captadas durante as atividades, para fins de divulgação em campanhas institucionais e publicação nas redes sociais da Avance.</span>
                     </div>
                   </label>
                 </div>
                 
                 <div className="flex flex-col-reverse md:flex-row gap-4">
                    <button onClick={() => setStep(1)} className="px-6 py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all text-sm">Voltar e Corrigir Ficha</button>
                    <button onClick={() => {
                        if (!(document.getElementById('chk-agree') as HTMLInputElement).checked) {
                          alert("Atenção: Você precisa marcar a caixa principal atestando sua concordância para assinar digitalmente.");
                          return;
                        }
                        if (!(document.getElementById('chk-lgpd') as HTMLInputElement).checked) {
                          alert("Atenção: Pela nova legislação, você precisa concordar com os termos de Proteção de Dados (LGPD) para prosseguir com a matrícula.");
                          return;
                        }
                        handleSignContract();
                      }}
                      disabled={isSubmitting} 
                      className="flex-1 bg-emerald-500 text-white py-4 md:py-5 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50 active:scale-[0.98]">
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Assinar Matrícula e Confirmar"}
                    </button>
                 </div>
              </div>
           </motion.div>
         )}
       </main>
    </div>
  );
}
