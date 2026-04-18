import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MessageTemplate, IntegrationsSettings } from '../types';
import { Loader2, MessageSquareText, Settings, Plus, Save, Trash2, Edit2, X, Bold, Italic, Strikethrough, Link as LinkIcon, Smile, Play, Upload, Building2, Printer, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import FeedbackModal from './FeedbackModal';
import ConfirmModal from './ConfirmModal';
import { QRCodeSVG } from 'qrcode.react';

const DEFAULT_CONTRACT_TEMPLATE = `CLÁUSULA PRIMEIRA - O objeto do presente instrumento é a prestação, pela CONTRATADA, em favor do(a) CONTRATANTE, dos serviços de ensino de música (CNAE 8592-9/03), por meio de aulas de música e prática de instrumentos na modalidade {{curso}}.

Parágrafo 1º - O curso compreende aulas teóricas e práticas, ministradas por professores qualificados e sempre que necessário, a critério dos professores, a utilização de equipamentos de som e imagem. AS AULAS SERÃO EM {{formato}}.

Parágrafo 2º - As aulas são intransferíveis, ministradas {{frequencia}}, com duração de {{duracao}} (sessenta) minutos em dia e horário fixo, escolhido no ato da matrícula de acordo com a disponibilidade de horário do curso contratado.

CLÁUSULA SEGUNDA - Caso o(a) CONTRATANTE não compareça a aula, computar-se-á a aula no pacote mensal do(a) CONTRATANTE, salvo nos casos de enfermidade ou internação hospitalar, devidamente comprovadas por atestado médico. A tolerância para atraso do aluno será de 20 minutos.

Parágrafo 1º - Deveres do Contratante(aluno): comportar-se com civilidade, observando os preceitos de disciplina e boa educação, respeito aos colegas e professores, sendo passível de rescisão deste contrato o comportamento inadequado do aluno. Não é permitida a entrada de acompanhantes, crianças(dependentes) e ou animais domésticos em sala de aula (exceto em casos de alunos portadores de necessidades especiais) NÃO É PERMITIDO O CONSUMO DE BEBIDAS ALCOÓLICAS E ALIMENTOS NAS SALAS DE AULA E NAS DEPENDÊNCIAS DA ESCOLA.

Parágrafo 2º - TODO DANO OU PREJUÍZO CAUSADO PELO ALUNO NA ESTRUTURA FÍSICA DESTE ESTABELECIMENTO DE ENSINO, OS PAIS OU RESPONSÁVEIS DEVERÃO RESSARCIR AS DESPESAS À CONTRATADA, NO PRAZO DE 10 DIAS.

Parágrafo 3º - Durante o período de recesso(datas disponíveis no calendário da Escola) essas aulas não serão repostas. Aulas que porventura caiam em feriados (Nacional, Estadual e Municipal), não serão repostas, assim como em datas especiais: Dia do Professor.

CLÁUSULA TERCEIRA - Em contrapartida aos serviços prestados, o(a) CONTRATANTE pagará em favor da CONTRATADA o valor certo e ajustado de R$ {{valor}}, o qual será pago mensalmente igual e sucessivamente, sendo que a primeira vencerá no dia {{vencimento}}.

Parágrafo 1º - No caso de inadimplência de quaisquer das parcelas, haverá a incidência de multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês ou fração sobre o valor vencido e não pago.

Parágrafo 2º - No caso de inadimplência por mais de 20(vinte) dias, o pacote do (a) CONTRATANTE será suspenso até a liquidação das pendências financeiras.

Parágrafo 3º - O contratante (responsável), deve fornecer um número para contato e e-mail atualizados. Autoriza também receber através do aplicativo WhatsApp e do e-mail, avisos e cobranças. (Que podem ser feitos através de qualquer plataforma ou banco utilizados pela escola).

CLÁUSULA QUARTA - Pelo presente instrumento, o(a) CONTRATANTE cede em favor da CONTRATADA os direitos de utilização de sua imagem e voz em eventos da escola.

CLÁUSULA QUINTA - O(A) CONTRATANTE poderá optar pela resilição do presente contrato antes do seu término, devendo, para tanto, comunicar tal intenção à CONTRATADA com antecedência mínima de 30 (trinta) dias.

CLÁUSULA SEXTA - As partes elegem o Foro da Comarca Caruaru, como o único competente para dirimir toda e qualquer dúvida, controvérsia e litígio, decorrente do exato cumprimento deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja ou venha a ser.

E assim, por estarem justas e contratadas, as partes assinam o presente em duas (02) vias de igual teor, valor e forma, após lido e achado conforme.`;

const DEFAULT_DECLARATION_TEMPLATE = `Declaramos para os devidos fins que o(a) aluno(a) {{nome}}, portador(a) do CPF {{cpf}}, encontra-se regularmente matriculado(a) nesta instituição de ensino, frequentando as aulas regulares do curso de {{curso}}.

Por ser verdade, firmamos o presente documento.`;

function ApizMonitor({ apizUrl, apizInstanceName, apizWebhook, apizToken }: { apizUrl: string, apizInstanceName: string, apizWebhook: string, apizToken: string }) {
  const [qrCode, setQrCode] = React.useState<string>('');
  const [status, setStatus] = React.useState<string>('STARTING');
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    if (!apizUrl || !apizInstanceName) return;

    // Clean URL in case user mistakenly pasted /send-text
    const baseUrl = apizUrl.replace(/\/send-text\/?$/, '').replace(/\/$/, '');

    let timeout: any;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${baseUrl}/instance/status/${apizInstanceName}`, {
          headers: {
            'x-api-key': apizToken || ''
          }
        });
        if (!res.ok) {
           setStatus('NOT_FOUND');
        } else {
           const data = await res.json();
           setStatus(data.status);
           if (data.qr) {
             setQrCode(data.qr); 
           } else {
             setQrCode('');
           }
        }
      } catch (err) {
        setStatus('DISCONNECTED');
      }
      timeout = setTimeout(fetchStatus, 3000);
    };

    fetchStatus();
    return () => clearTimeout(timeout);
  }, [apizUrl, apizInstanceName, apizToken]);

  const handleCreateInstance = async () => {
    setIsCreating(true);
    try {
      const baseUrl = apizUrl.replace(/\/send-text\/?$/, '').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apizToken || ''
        },
        body: JSON.stringify({
          instanceName: apizInstanceName,
          webhookUrl: apizWebhook || ''
        })
      });
      if (res.ok) {
        setStatus('STARTING');
      }
    } catch (err) {
      console.error("Failed to create instance", err);
    }
    setIsCreating(false);
  };

  if (!apizUrl || !apizInstanceName) return null;

  return (
    <div className="mt-4 p-6 bg-white border border-zinc-200 rounded-3xl flex flex-col items-center">
       <h4 className="font-bold text-zinc-800 mb-4 tracking-widest text-xs uppercase">Conexão do Motor (Em Tempo Real)</h4>
       {status === 'CONNECTED' ? (
         <div className="flex flex-col items-center text-emerald-600">
           <CheckCircle2 className="w-12 h-12 mb-2 bg-emerald-100 rounded-full p-2" />
           <p className="font-bold">ON-LINE</p>
         </div>
       ) : qrCode && status === 'QR_READY' ? (
         <div className="flex flex-col items-center">
            <div className="p-3 bg-white rounded-xl shadow-sm border border-zinc-200 mb-3">
               <QRCodeSVG value={qrCode} size={200} />
            </div>
            <p className="text-zinc-500 text-sm font-medium animate-pulse">Abra o WhatsApp e leia o QR Code...</p>
         </div>
       ) : status === 'NOT_FOUND' ? (
         <div className="flex flex-col items-center text-amber-600 text-center">
            <AlertTriangle className="w-10 h-10 mb-2" />
            <p className="text-sm font-bold mb-3">Instância não existe.</p>
            <button 
              onClick={handleCreateInstance}
              disabled={isCreating}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-sm shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Inicializar e Exibir QR Code
            </button>
         </div>
       ) : (
         <div className="flex flex-col items-center text-zinc-400">
           <Loader2 className="w-10 h-10 animate-spin mb-2" />
           <p className="text-sm font-medium">Sincronizando...</p>
         </div>
       )}
    </div>
  );
}

export default function Communication() {
  const [activeTab, setActiveTab] = useState<'templates' | 'settings' | 'school' | 'declaration'>('templates');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [schoolSettings, setSchoolSettings] = useState({
    defaultCoursePrice: '' as string | number,
    defaultIndividualCoursePrice: '' as string | number,
    contractTemplate: '' as string,
    declarationTemplate: '' as string,
    companyName: '' as string,
    tradingName: '' as string,
    cnpj: '' as string,
    address: '' as string,
    city: '' as string,
    state: '' as string,
    cep: '' as string,
    email: '' as string,
    phone: '' as string,
    website: '' as string,
    logoUrl: '' as string
  });
  const [settings, setSettings] = useState<IntegrationsSettings>({ 
    zapiInstance: '', zapiToken: '', zapiSecurityToken: '',
    remindersEnabled: true, reminderDaysBefore: true, reminderDaysBeforeCount: 3, 
    sendOnDue: true, reminderDaysAfter: true, reminderDaysAfterCount: 1,
    evaluationCycleDays: 90, notifyTeacherDaysBefore: 1
  });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingRoutine, setTestingRoutine] = useState(false);
  const [testingFinancialRoutine, setTestingFinancialRoutine] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [feedback, setFeedback] = useState<{isOpen: boolean, title: string, message: string, type: 'success'|'error'|'warning'}>({ isOpen: false, title: '', message: '', type: 'success' });
  const [confirm, setConfirm] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const showFeedback = (title: string, message: string, type: 'success'|'error'|'warning' = 'success') => setFeedback({ isOpen: true, title, message, type });
  const requestConfirm = (title: string, message: string, onConfirm: () => void) => setConfirm({ isOpen: true, title, message, onConfirm });

  // Template Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<MessageTemplate>>({ type: 'welcome', isAutomatic: false });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const COMMON_EMOJIS = [
    '😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😛','😜','🤪','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸','👍','👎','✊','👊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤙','🎵','🎶','🎸','🎹','🎺','🎻','🥁','✅','❌','⚠️','🔔','📅','📱','💬','✨','🔥','🌟','💯','⏰'
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Templates
      const tSnap = await getDocs(query(collection(db, 'templates')));
      const tList: MessageTemplate[] = [];
      tSnap.forEach(d => tList.push({ id: d.id, ...d.data() } as MessageTemplate));
      setTemplates(tList.sort((a, b) => b.createdAt?.toDate().getTime() - a.createdAt?.toDate().getTime()));

      // Fetch Settings
      const sSnap = await getDoc(doc(db, 'settings', 'integrations'));
      if (sSnap.exists()) {
        setSettings(sSnap.data() as IntegrationsSettings);
      }

      // Fetch School Settings
      const scSnap = await getDoc(doc(db, 'settings', 'school'));
      if (scSnap.exists()) {
        const d = scSnap.data();
        setSchoolSettings({
          defaultCoursePrice: d.defaultCoursePrice ?? '',
          defaultIndividualCoursePrice: d.defaultIndividualCoursePrice ?? '',
          contractTemplate: d.contractTemplate || DEFAULT_CONTRACT_TEMPLATE,
          declarationTemplate: d.declarationTemplate || DEFAULT_DECLARATION_TEMPLATE,
          companyName: d.companyName ?? '',
          tradingName: d.tradingName ?? '',
          cnpj: d.cnpj ?? '',
          address: d.address ?? '',
          city: d.city ?? '',
          state: d.state ?? '',
          cep: d.cep ?? '',
          email: d.email ?? '',
          phone: d.phone ?? '',
          website: d.website ?? '',
          logoUrl: d.logoUrl ?? ''
        });
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'settings', 'integrations'), settings);
      showFeedback('Sucesso', 'Configurações salvas com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      showFeedback('Erro', 'Erro ao salvar as configurações.', 'error');
    }
    setSavingConfig(false);
  };

  const handleSaveSchoolSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'settings', 'school'), {
        defaultCoursePrice: schoolSettings.defaultCoursePrice ? Number(schoolSettings.defaultCoursePrice) : null,
        defaultIndividualCoursePrice: schoolSettings.defaultIndividualCoursePrice ? Number(schoolSettings.defaultIndividualCoursePrice) : null,
        contractTemplate: schoolSettings.contractTemplate || null,
        declarationTemplate: schoolSettings.declarationTemplate || null,
        companyName: schoolSettings.companyName || null,
        tradingName: schoolSettings.tradingName || null,
        cnpj: schoolSettings.cnpj || null,
        address: schoolSettings.address || null,
        city: schoolSettings.city || null,
        state: schoolSettings.state || null,
        cep: schoolSettings.cep || null,
        email: schoolSettings.email || null,
        phone: schoolSettings.phone || null,
        website: schoolSettings.website || null,
        logoUrl: schoolSettings.logoUrl || null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showFeedback('Sucesso', 'Configurações gerais salvas!', 'success');
    } catch (e) {
      console.error(e);
      showFeedback('Erro', 'Erro ao salvar configurações.', 'error');
    }
    setSavingConfig(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file type and size (max 2MB)
    if (!file.type.startsWith('image/')) {
      showFeedback('Erro', 'Por favor, selecione um arquivo de imagem.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showFeedback('Erro', 'A imagem deve ter no máximo 2MB.', 'error');
      return;
    }

    setUploadingLogo(true);
    try {
      const extension = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `school/logo_${Date.now()}.${extension}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      setSchoolSettings(prev => ({ ...prev, logoUrl: url }));
      
      // Auto-save the new logo URL to avoid the user having to click manual save for it
      await setDoc(doc(db, 'settings', 'school'), { logoUrl: url, updatedAt: serverTimestamp() }, { merge: true });
      showFeedback('Sucesso', 'Logotipo atualizado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showFeedback('Erro', 'Falha ao fazer upload da imagem. Verifique as regras de segurança do Storage.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      const isAuto = currentTemplate.type === 'pedagogic_reminder' ? true : currentTemplate.isAutomatic;
      
      if (currentTemplate.id) {
        await updateDoc(doc(db, 'templates', currentTemplate.id), {
          title: currentTemplate.title,
          content: currentTemplate.content,
          type: currentTemplate.type,
          isAutomatic: isAuto
        });
      } else {
        await addDoc(collection(db, 'templates'), {
          ...currentTemplate,
          isAutomatic: isAuto,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      fetchData();
      showFeedback('Sucesso', 'Template salvo com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      showFeedback('Erro', 'Erro ao salvar o template.', 'error');
    }
    setSavingTemplate(false);
  };

  const handleDeleteTemplate = async (id: string) => {
    requestConfirm('Excluir Template', 'Tem certeza que deseja excluir este template?', async () => {
      try {
        await deleteDoc(doc(db, 'templates', id));
        fetchData();
        showFeedback('Sucesso', 'Template excluído com sucesso!', 'success');
      } catch (e) {
        console.error(e);
        showFeedback('Erro', 'Erro ao excluir o template.', 'error');
      }
    });
  };

  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('template-content') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = currentTemplate.content || '';
    
    const selectedText = current.substring(start, end);
    const textToInsert = selectedText.length > 0 ? selectedText : 'texto';
    
    const newText = current.substring(0, start) + prefix + textToInsert + suffix + current.substring(end);
    
    setCurrentTemplate({ ...currentTemplate, content: newText });
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + textToInsert.length);
    }, 0);
  };

  const insertEmoji = (emoji: string) => {
    const textarea = document.getElementById('template-content') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = currentTemplate.content || '';
    
    const newText = current.substring(0, start) + emoji + current.substring(end);
    
    setCurrentTemplate({ ...currentTemplate, content: newText });
    setShowEmojiPicker(false);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  const testPedagogicalRoutine = async () => {
    requestConfirm('Testar Robô Pedagógico', 'Isto disparará a varredura manual em todos os alunos ativos e pode enviar mensagens no WhatsApp dos professores imediatamente. Deseja prosseguir?', async () => {
      setTestingRoutine(true);
      try {
        const functions = getFunctions();
        const manualRoutine = httpsCallable(functions, 'manualPedagogicalRoutine');
        const result = await manualRoutine();
        const data = result.data as any;
        if (data.success) {
          showFeedback('Sucesso', 'Varredura Executada. Professores Notificados!', 'success');
        } else {
          showFeedback('Atenção', 'Erro retornado: ' + data.reason, 'warning');
        }
      } catch (e: any) {
        console.error(e);
        showFeedback('Erro', 'Erro de Execução: ' + e.message, 'error');
      }
      setTestingRoutine(false);
    });
  };

  const testFinancialRoutine = async () => {
    requestConfirm('Testar Robô Financeiro', 'Isto disparará a varredura financeira manual e enviará os avisos de vencimento ou atraso para os alunos. Deseja prosseguir?', async () => {
      setTestingFinancialRoutine(true);
      try {
        const functions = getFunctions();
        const manualRoutine = httpsCallable(functions, 'manualFinancialRoutine');
        const result = await manualRoutine();
        const data = result.data as any;
        if (data.success) {
          showFeedback('Sucesso', 'Varredura Financeira Executada. Alunos Notificados!', 'success');
        } else {
          showFeedback('Atenção', 'Erro retornado: ' + data.reason, 'warning');
        }
      } catch (e: any) {
        console.error(e);
        showFeedback('Erro', 'Erro de Execução: ' + e.message, 'error');
      }
      setTestingFinancialRoutine(false);
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'welcome': return 'Boas-Vindas';
      case 'reschedule': return 'Aviso de Reposição (Ausência)';
      case 'promo': return 'Promoção';
      case 'reminder_predue': return 'Aviso Antecipado';
      case 'reminder_due': return 'Vencimento Hoje';
      case 'reminder_overdue': return 'Mensalidade Atrasada';
      case 'evaluation': return 'Aviso de Nova Avaliação';
      case 'material_added': return 'Novo Material Didático';
      case 'pedagogic_reminder': return 'Lembrete Pedagógico (Professores)';
      case 'enrollment_approved': return 'Matrícula Aprovada';
      case 'enrollment_rejected': return 'Matrícula Reprovada';
      case 'pix_payment': return 'PIX / Faturamento (Baixa Automática)';
      case 'custom': return 'Outros';
      default: return type;
    }
  };

  return (
    <div className="space-y-6 relative print:m-0 print:p-0 print:space-y-0">
      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 p-2 shadow-sm flex flex-col sm:flex-row gap-2 print:hidden">
        <button 
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'templates' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
        >
          <MessageSquareText className="w-4 h-4" />
          Templates de Mensagem
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'settings' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
        >
          <Settings className="w-4 h-4" />
          Configurações Z-API
        </button>
        <button 
          onClick={() => setActiveTab('school')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'school' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
        >
          <Settings className="w-4 h-4" />
          Configurações Gerais
        </button>
        <button 
          onClick={() => setActiveTab('declaration')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'declaration' ? 'bg-zinc-950 text-white shadow-xl shadow-black/10' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'}`}
        >
          <FileText className="w-4 h-4" />
          Declaração
        </button>
      </div>

      {activeTab === 'school' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start print:block print:w-full">
          <div className="bg-white rounded-[32px] p-8 shadow-xl ring-1 ring-zinc-950/5 print:hidden">
            <div className="mb-6 border-l-4 border-orange-500 pl-4">
              <h3 className="text-xl font-bold display-font">Configurações Gerais da Escola</h3>
              <p className="text-zinc-500 text-sm mt-1">
                Defina os padrões globais que serão utilizados no sistema.
              </p>
            </div>
            
            <form onSubmit={handleSaveSchoolSettings} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Valor Geral Padrão (Turma)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={schoolSettings.defaultCoursePrice}
                    onChange={e => setSchoolSettings({...schoolSettings, defaultCoursePrice: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Valor Geral (Individual)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={schoolSettings.defaultIndividualCoursePrice}
                    onChange={e => setSchoolSettings({...schoolSettings, defaultIndividualCoursePrice: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                  />
                </div>
              </div>



              <div className="pt-6 border-t border-zinc-200">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-orange-500" />
                    Dados da Empresa (Contratada)
                  </h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Logotipo Anexado</label>
                    <div className="flex items-center gap-4">
                      {schoolSettings.logoUrl ? (
                        <div className="w-16 h-16 rounded-xl border border-zinc-200 shadow-sm flex items-center justify-center p-1 bg-white overflow-hidden shrink-0">
                          <img src={schoolSettings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl border border-dashed border-zinc-300 flex items-center justify-center bg-zinc-50 shrink-0">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase text-center px-1">Sem Logo</span>
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors rounded-lg text-xs font-bold border border-orange-200 w-fit">
                          {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3"/>}
                          Enviar Imagem
                          <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={handleLogoUpload} />
                        </label>
                        <p className="text-[10px] text-zinc-400 mt-1">PNG ou JPG (Até 2MB). Tam. ideal 400x150</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Razão Social</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Minha Empresa LTDA"
                      value={schoolSettings.companyName}
                      onChange={e => setSchoolSettings({...schoolSettings, companyName: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Nome Fantasia</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Academia de Música"
                      value={schoolSettings.tradingName}
                      onChange={e => setSchoolSettings({...schoolSettings, tradingName: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">CNPJ</label>
                    <input 
                      type="text" 
                      placeholder="00.000.000/0000-00"
                      value={schoolSettings.cnpj}
                      onChange={e => setSchoolSettings({...schoolSettings, cnpj: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Endereço (Rua, Número, Bairro)</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Avenida Principal, 120, Centro"
                      value={schoolSettings.address}
                      onChange={e => setSchoolSettings({...schoolSettings, address: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Cidade / Estado</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Cidade"
                        value={schoolSettings.city}
                        onChange={e => setSchoolSettings({...schoolSettings, city: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                      />
                      <input 
                        type="text" 
                        placeholder="UF"
                        value={schoolSettings.state}
                        onChange={e => setSchoolSettings({...schoolSettings, state: e.target.value})}
                        className="w-20 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium text-center"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">CEP</label>
                    <input 
                      type="text" 
                      placeholder="00000-000"
                      value={schoolSettings.cep}
                      onChange={e => setSchoolSettings({...schoolSettings, cep: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">E-mail</label>
                    <input 
                      type="email" 
                      placeholder="contato@escola.com"
                      value={schoolSettings.email}
                      onChange={e => setSchoolSettings({...schoolSettings, email: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Telefone</label>
                    <input 
                      type="tel" 
                      placeholder="(00) 00000-0000"
                      value={schoolSettings.phone}
                      onChange={e => setSchoolSettings({...schoolSettings, phone: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-2">Site da Escola (Link)</label>
                    <input 
                      type="text" 
                      placeholder="www.minhaescola.com.br"
                      value={schoolSettings.website}
                      onChange={e => setSchoolSettings({...schoolSettings, website: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-200">
                <div className="mb-4">
                   <h4 className="text-lg font-bold text-zinc-900">Cláusulas do Contrato de Prestação de Serviço</h4>
                   <p className="text-sm text-zinc-500 mt-1">O cabeçalho (com os dados do aluno e da escola) será gerado automaticamente. Use este campo exclusivo para descrever as regras e cláusulas do seu contrato.</p>
                   <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-xl text-xs text-orange-800 leading-relaxed">
                     <strong>Variáveis Dinâmicas:</strong> Use estas exatas palavras para que o sistema troque pelos dados do aluno automaticamente:<br/>
                     <div className="grid grid-cols-2 gap-2 mt-2">
                       <span>- <strong>{`{{curso}}`}</strong>: Nome do curso (ex: Curso de Piano)</span>
                       <span>- <strong>{`{{formato}}`}</strong>: FORMATO INDIVIDUAL ou EM GRUPO</span>
                       <span>- <strong>{`{{frequencia}}`}</strong>: Ex: 1 vez(es) por semana</span>
                       <span>- <strong>{`{{duracao}}`}</strong>: Ex: 60 (sessenta) minutos</span>
                       <span>- <strong>{`{{valor}}`}</strong>: Valor do curso (ex: 150,00)</span>
                       <span>- <strong>{`{{vencimento}}`}</strong>: Dia do vencimento (ex: 10 de maio)</span>
                     </div>
                   </div>
                </div>
                <div className="bg-white [&_.ql-toolbar]:rounded-t-2xl [&_.ql-container]:rounded-b-2xl [&_.ql-container]:h-[400px] [&_.ql-editor]:font-serif [&_.ql-editor]:text-base">
                  <ReactQuill 
                    theme="snow"
                    value={schoolSettings.contractTemplate}
                    onChange={val => setSchoolSettings({...schoolSettings, contractTemplate: val})}
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{'list': 'ordered'}, {'list': 'bullet'}],
                        [{ 'align': [] }],
                        ['clean']
                      ]
                    }}
                  />
                </div>
              </div>


              <button
                disabled={savingConfig}
                className="px-8 py-4 bg-black text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                {savingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Salvar Configurações Gerais
              </button>
            </form>
          </div>

          <div className="bg-zinc-200 rounded-[32px] p-4 md:p-8 shadow-inner ring-1 ring-zinc-950/5 sticky top-8 h-[85vh] overflow-y-auto print:bg-transparent print:p-0 print:m-0 print:shadow-none print:ring-0 print:static print:h-auto print:overflow-visible">
            <div className="max-w-[800px] mx-auto flex justify-end mb-4 print:hidden">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-zinc-800 transition-colors"
                title="Imprimir visualização atual"
              >
                <Printer className="w-4 h-4" />
                Imprimir Prévia
              </button>
            </div>
             <div className="bg-white shadow-2xl mx-auto border border-zinc-300 w-full max-w-[800px] min-h-[1130px] h-fit p-8 md:p-12 font-serif text-zinc-900 flex flex-col print:shadow-none print:w-full print:max-w-none print:min-h-0 print:p-0 print:m-0 print:border-none">
               <div className="opacity-50 pointer-events-none select-none mb-6 text-xs bg-zinc-50 p-4 rounded-xl border border-zinc-200 flex flex-col gap-2">
                 <div className="flex items-center justify-between mb-2">
                   {schoolSettings.logoUrl ? (
                     <img src={schoolSettings.logoUrl} alt="Logo" className="h-10 object-contain" />
                   ) : (
                     <h1 className="text-xl font-black text-orange-600 tracking-tighter uppercase">{schoolSettings.tradingName || 'AVANCE'}</h1>
                   )}
                 </div>
                 <div className="text-center mb-4">
                   <h2 className="font-bold uppercase tracking-wide">CONTRATO DE PRESTAÇÃO DE SERVIÇO</h2>
                 </div>
                 <p className="text-justify"><strong>CONTRATANTE:</strong> Aluno de Exemplo da Silva, brasileiro(a), residente e domiciliado(a) em Endereço de Exemplo, 123, Bairro de Exemplo, CEP 55.000-000 em Caruaru - PE.</p>
                 <p className="text-justify"><strong>CONTRATADA: {schoolSettings.companyName || 'B. Salvador da Silva Braz Costa'}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o n.º <strong>{schoolSettings.cnpj || '39.487.516/0001-48'}</strong>...</p>
               </div>

               <div className="space-y-4 text-justify leading-relaxed text-[13px] break-words [&_p]:mb-2 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4 flex-1">
                  {(() => {
                     let text = schoolSettings.contractTemplate || DEFAULT_CONTRACT_TEMPLATE;
                     text = text.replace(/\{\{curso\}\}/g, 'Curso de Piano');
                     text = text.replace(/\{\{formato\}\}/g, 'FORMATO INDIVIDUAL');
                     text = text.replace(/\{\{frequencia\}\}/g, '1 vez(es) por semana');
                     text = text.replace(/\{\{duracao\}\}/g, '60 minutos');
                     text = text.replace(/\{\{valor\}\}/g, '150,00');
                     text = text.replace(/\{\{vencimento\}\}/g, '10 de Maio de 2026');
                     text = text.replace(/&nbsp;/g, ' ');
                     return <div dangerouslySetInnerHTML={{ __html: text }} />;
                  })()}
               </div>
               
               <div className="opacity-50 pointer-events-none select-none mt-16 flex justify-between items-center text-[10px] text-zinc-500 font-sans tracking-wide border-t border-zinc-200 pt-4">
                  <p>1ª via Cliente - 2ª via {schoolSettings.tradingName || 'Avance'}</p>
                  <p>Contrato 390/{new Date().getFullYear()} - Pág.1/1</p>
               </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'declaration' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:block print:w-full">
          <div className="bg-white p-6 md:p-10 rounded-[32px] border border-zinc-200 shadow-xl shadow-black/5 print:hidden">
            <h3 className="text-xl font-bold display-font text-zinc-900 mb-6">Modelo Oficial de Declaração</h3>
            <p className="text-zinc-500 mb-8 max-w-xl">Configure o texto padrão para as declarações emitidas pela secretaria digital.</p>
            
            <form onSubmit={handleSaveSchoolSettings} className="space-y-6">
              <div>
                <div className="mb-4">
                   <h4 className="text-lg font-bold text-zinc-900">Corpo do Texto</h4>
                   <p className="text-sm text-zinc-500 mt-1">Utilizado para gerar certificados e comprovantes dinâmicos solicitados pelos alunos através da secretaria digital.</p>
                   <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-xl text-xs text-orange-800 leading-relaxed">
                     <strong>Variáveis Dinâmicas:</strong><br/>
                     <div className="grid grid-cols-2 gap-2 mt-2">
                       <span>- <strong>{`{{nome}}`}</strong>: Nome do aluno</span>
                       <span>- <strong>{`{{cpf}}`}</strong>: CPF do aluno</span>
                       <span>- <strong>{`{{nascimento}}`}</strong>: Data de Nascimento</span>
                       <span>- <strong>{`{{rg}}`}</strong>: RG do aluno</span>
                       <span>- <strong>{`{{curso}}`}</strong>: Instrumento</span>
                       <span>- <strong>{`{{dias}}`}</strong>: Dias de Aula</span>
                       <span>- <strong>{`{{horarios}}`}</strong>: Horários das Aulas</span>
                     </div>
                   </div>
                </div>
                <div className="bg-white [&_.ql-toolbar]:rounded-t-2xl [&_.ql-container]:rounded-b-2xl [&_.ql-container]:h-[300px] [&_.ql-editor]:font-serif [&_.ql-editor]:text-base">
                  <ReactQuill 
                    theme="snow"
                    value={schoolSettings.declarationTemplate}
                    onChange={val => setSchoolSettings({...schoolSettings, declarationTemplate: val})}
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{'list': 'ordered'}, {'list': 'bullet'}],
                        [{ 'align': [] }],
                        ['clean']
                      ]
                    }}
                  />
                </div>
              </div>

              <button
                disabled={savingConfig}
                className="px-8 py-4 bg-black text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                {savingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Salvar Modelo
              </button>
            </form>
          </div>

          <div className="bg-zinc-200 rounded-[32px] p-4 md:p-8 shadow-inner ring-1 ring-zinc-950/5 sticky top-8 h-[85vh] overflow-y-auto w-full print:bg-transparent print:p-0 print:m-0 print:shadow-none print:ring-0 print:static print:h-auto print:overflow-visible">
            <div className="max-w-[800px] mx-auto flex justify-end mb-4 print:hidden">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-zinc-800 transition-colors"
                title="Imprimir visualização atual"
              >
                <Printer className="w-4 h-4" />
                Imprimir Prévia
              </button>
            </div>
             <div className="bg-white shadow-2xl mx-auto border border-zinc-300 w-full max-w-[800px] min-h-[1130px] h-fit p-16 font-serif text-zinc-900 flex flex-col relative print:shadow-none print:w-full print:max-w-none print:min-h-0 print:p-0 print:m-0 print:border-none">
               {/* Cabeçalho */}
               <div className="flex flex-col items-center text-center pb-8 border-b-2 border-zinc-200 mb-12">
                 {schoolSettings.logoUrl ? (
                   <img src={schoolSettings.logoUrl} alt="Logo" className="h-20 object-contain mb-4" />
                 ) : (
                   <div className="h-20 w-20 bg-zinc-100 rounded-full flex items-center justify-center mb-4 leading-none">
                     <span className="font-bold text-zinc-400 text-xs">LOGO</span>
                   </div>
                 )}
                 <h1 className="text-2xl font-black uppercase tracking-widest text-zinc-800">
                   {schoolSettings.tradingName || 'NOME DA ESCOLA'}
                 </h1>
                 <p className="text-sm text-zinc-500 mt-1 uppercase tracking-widest font-medium">
                   CNPJ: {schoolSettings.cnpj || '00.000.000/0000-00'}
                 </p>
                 <div className="w-16 h-1 bg-orange-500 mt-6 rounded-full mx-auto" />
               </div>
      
               {/* Titulo Central */}
               <h2 className="text-3xl font-black text-center uppercase tracking-widest text-zinc-900 mb-12">
                 Declaração de Vínculo
               </h2>
               
               <div dangerouslySetInnerHTML={{ __html: schoolSettings.declarationTemplate || '<p class="text-center text-zinc-400">Nenhum texto configurado</p>' }} className="prose prose-zinc max-w-none text-justify text-lg leading-loose break-words" />
               
               <div className="mt-8 text-right text-lg text-zinc-700">
                  {schoolSettings.city || 'Cidade'}, {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
               </div>
               
               {/* Autenticador Base (Carimbo) */}
               <div className="mt-auto pt-16 flex justify-center pb-8 opacity-50 pointer-events-none select-none">
                 <div className="flex flex-col items-center">
                    <div className="w-64 border-b-2 border-zinc-800 mb-2"></div>
                    <span className="font-bold text-sm uppercase tracking-wider">{schoolSettings.tradingName || 'Administração'}</span>
                    <span className="text-xs text-zinc-500">Documento Assinado Eletronicamente</span>
                    <span className="text-[10px] text-zinc-400 font-mono mt-1">CODE: VALID-XXXX-1234</span>
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex justify-end">
             <button 
               onClick={() => {
                 setCurrentTemplate({ title: '', content: 'Olá, {nome}! ', type: 'welcome', isAutomatic: false });
                 setIsModalOpen(true);
               }}
               className="bg-black text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-black/20"
             >
               <Plus className="w-5 h-5" />
               Novo Template
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(tpl => (
              <div key={tpl.id} className="bg-white rounded-[32px] p-6 shadow-xl ring-1 ring-zinc-950/5 flex flex-col relative group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-black">{tpl.title}</h3>
                    <div className="flex gap-2 mt-2">
                      <span className="bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider">
                        {getTypeLabel(tpl.type)}
                      </span>
                      {tpl.isAutomatic && (
                        <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                          Automático
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <p className="text-zinc-500 text-sm flex-1 whitespace-pre-wrap line-clamp-4 bg-zinc-50 p-4 rounded-2xl">
                  {tpl.content}
                </p>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-100">
                  <button 
                    onClick={() => {
                      setCurrentTemplate(tpl);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}

            {templates.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500">
                Nenhum template criado. Crie seu primeiro template de mensagem!
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-[32px] p-8 shadow-xl ring-1 ring-zinc-950/5 max-w-5xl mx-auto w-full">
          <div className="mb-6 border-l-4 border-orange-500 pl-4">
            <h3 className="text-xl font-bold display-font">Integração WhatsApp</h3>
            <p className="text-zinc-500 text-sm mt-1">
              Escolha e conecte o motor de disparos que o sistema utilizará para se comunicar com os alunos.
            </p>
          </div>
          
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div>
               <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Motor do WhatsApp</label>
               <select 
                 value={settings.whatsappEngine || 'zapi'}
                 onChange={e => setSettings({...settings, whatsappEngine: e.target.value as 'zapi' | 'apiz'})}
                 className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
               >
                  <option value="zapi">Z-API (Nuvem)</option>
                  <option value="apiz">APIZ (Integração Local/Própria)</option>
               </select>
            </div>

            {settings.whatsappEngine === 'apiz' ? (
              <div className="bg-zinc-50 p-6 rounded-[24px] border border-zinc-100 grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Base URL da APIZ</label>
                    <input 
                      type="text" 
                      value={settings.apizUrl || ''}
                      onChange={e => setSettings({...settings, apizUrl: e.target.value})}
                      placeholder="Ex: https://apiz.com.br"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Nome da Instância</label>
                    <input 
                      type="text" 
                      value={settings.apizInstanceName || ''}
                      onChange={e => setSettings({...settings, apizInstanceName: e.target.value})}
                      placeholder="Ex: escolaAvance"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Global API Key</label>
                    <input 
                      type="password" 
                      value={settings.apizToken || ''}
                      onChange={e => setSettings({...settings, apizToken: e.target.value})}
                      placeholder="Chave secreta do seu servidor"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Webhook URL de Retorno (Opcional)</label>
                    <input 
                      type="text" 
                      value={settings.apizWebhook || ''}
                      onChange={e => setSettings({...settings, apizWebhook: e.target.value})}
                      placeholder="https://seu-dominio.com.br/webhook"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-center border-l-0 md:border-l border-zinc-200 pt-6 md:pt-0 pl-0 md:pl-8">
                  <ApizMonitor 
                     apizUrl={settings.apizUrl || ''} 
                     apizInstanceName={settings.apizInstanceName || ''} 
                     apizWebhook={settings.apizWebhook || ''}
                     apizToken={settings.apizToken || ''}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-6 rounded-[24px] border border-zinc-100">
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Instance ID</label>
                  <input 
                    type="text" 
                    value={settings.zapiInstance || ''}
                    onChange={e => setSettings({...settings, zapiInstance: e.target.value})}
                    placeholder="Ex: 3C22F090CA5A4E..."
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Token da Instância</label>
                  <input 
                    type="text" 
                    value={settings.zapiToken || ''}
                    onChange={e => setSettings({...settings, zapiToken: e.target.value})}
                    placeholder="Ex: 1234abc..."
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Client-Token de Segurança (Opcional)</label>
                  <input 
                    type="text" 
                    value={settings.zapiSecurityToken || ''}
                    onChange={e => setSettings({...settings, zapiSecurityToken: e.target.value})}
                    placeholder="Apenas se ativou o token de segurança"
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
              </div>
            )}
            
            <div>

              <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Telefone da Escola (WhatsApp Central)</label>
              <input 
                type="text" 
                value={settings.schoolPhone || ''}
                onChange={e => setSettings({...settings, schoolPhone: e.target.value})}
                placeholder="Ex: 11999999999 (Apenas números)"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
              <p className="text-xs text-zinc-400 mt-1">
                A secretaria receberá alertas neste número quando alunos utilizarem o portal de reposição.
              </p>
            </div>
            
            <div className="pt-8 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-black">Lembretes de Mensalidade Automáticos</h3>
                  <p className="text-sm text-zinc-500 mt-1">Ative e configure os prazos de lembretes que o robô de WhatsApp enviará.</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.remindersEnabled !== false}
                      onChange={(e) => setSettings({...settings, remindersEnabled: e.target.checked})}
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${settings.remindersEnabled !== false ? 'bg-orange-500' : 'bg-zinc-200'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${settings.remindersEnabled !== false ? 'translate-x-6' : ''}`}></div>
                  </div>
                </label>
              </div>

              {settings.remindersEnabled !== false && (
                <div className="space-y-6 bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                  {/* Aviso Antecipado */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-zinc-900">Aviso Antecipado</p>
                      <p className="text-sm text-zinc-500">Enviar lembrete antes da fatura vencer.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {settings.reminderDaysBefore !== false && (
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            min="1" max="15"
                            value={settings.reminderDaysBeforeCount || 3}
                            onChange={(e) => setSettings({...settings, reminderDaysBeforeCount: Number(e.target.value)})}
                            className="w-16 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                          />
                          <span className="text-sm text-zinc-500 font-medium">dias antes</span>
                        </div>
                      )}
                      <label className="flex items-center cursor-pointer">
                        <div className="relative">
                          <input 
                            type="checkbox" className="sr-only" 
                            checked={settings.reminderDaysBefore !== false}
                            onChange={(e) => setSettings({...settings, reminderDaysBefore: e.target.checked})}
                          />
                          <div className={`block w-12 h-6 rounded-full transition-colors ${settings.reminderDaysBefore !== false ? 'bg-black' : 'bg-zinc-200'}`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.reminderDaysBefore !== false ? 'translate-x-6' : ''}`}></div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Aviso no Dia */}
                  <div className="flex items-center justify-between border-t border-zinc-200/50 pt-4">
                    <div>
                      <p className="font-bold text-zinc-900">Aviso no Dia do Vencimento</p>
                      <p className="text-sm text-zinc-500">Lembrar o aluno que a fatura vence hoje.</p>
                    </div>
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input 
                          type="checkbox" className="sr-only" 
                          checked={settings.sendOnDue !== false}
                          onChange={(e) => setSettings({...settings, sendOnDue: e.target.checked})}
                        />
                        <div className={`block w-12 h-6 rounded-full transition-colors ${settings.sendOnDue !== false ? 'bg-black' : 'bg-zinc-200'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.sendOnDue !== false ? 'translate-x-6' : ''}`}></div>
                      </div>
                    </label>
                  </div>

                  {/* Aviso Atrasado */}
                  <div className="flex items-center justify-between border-t border-zinc-200/50 pt-4">
                    <div>
                      <p className="font-bold text-zinc-900">Aviso Após Vencimento</p>
                      <p className="text-sm text-zinc-500">Cobrar faturas que estão atrasadas.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {settings.reminderDaysAfter !== false && (
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            min="1" max="15"
                            value={settings.reminderDaysAfterCount || 1}
                            onChange={(e) => setSettings({...settings, reminderDaysAfterCount: Number(e.target.value)})}
                            className="w-16 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                          />
                          <span className="text-sm text-zinc-500 font-medium">dias depois</span>
                        </div>
                      )}
                      <label className="flex items-center cursor-pointer">
                        <div className="relative">
                          <input 
                            type="checkbox" className="sr-only" 
                            checked={settings.reminderDaysAfter !== false}
                            onChange={(e) => setSettings({...settings, reminderDaysAfter: e.target.checked})}
                          />
                          <div className={`block w-12 h-6 rounded-full transition-colors ${settings.reminderDaysAfter !== false ? 'bg-black' : 'bg-zinc-200'}`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.reminderDaysAfter !== false ? 'translate-x-6' : ''}`}></div>
                        </div>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-zinc-200/50 mt-4 pt-4">
                    <div>
                      <p className="font-bold text-zinc-900">Teste do Robô de Mensalidades</p>
                      <p className="text-sm text-zinc-500">Acione manualmente a varredura para enviar lembretes e avisos de vencimento agora.</p>
                    </div>
                    <button
                      type="button"
                      onClick={testFinancialRoutine}
                      disabled={testingFinancialRoutine || (!settings.zapiInstance && settings.whatsappEngine !== 'apiz')}
                      className="px-6 py-2.5 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-sm"
                    >
                      {testingFinancialRoutine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Forçar Varredura Agora
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-8 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-black flex items-center gap-2">
                    Cobranças por PIX & Banco Inter 
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">Receba mensalidades no modelo "Copia e Cola" dinâmico ou habilite a API do Baixa Automática.</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={settings.interBankEnabled === true}
                      onChange={(e) => setSettings({...settings, interBankEnabled: e.target.checked})}
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${settings.interBankEnabled === true ? 'bg-orange-500' : 'bg-zinc-200'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${settings.interBankEnabled === true ? 'translate-x-6' : ''}`}></div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Chave PIX da Escola</label>
                  <input 
                    type="text" 
                    value={settings.pixKey || ''}
                    onChange={e => setSettings({...settings, pixKey: e.target.value})}
                    placeholder="CPF/CNPJ, Email ou Celular"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Nome do Beneficiário (Razão Social)</label>
                  <input 
                    type="text" 
                    value={settings.pixName || ''}
                    onChange={e => setSettings({...settings, pixName: e.target.value})}
                    placeholder="Nome atrelado à chave"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Cidade do Beneficiário</label>
                  <input 
                    type="text" 
                    value={settings.pixCity || ''}
                    onChange={e => setSettings({...settings, pixCity: e.target.value})}
                    placeholder="Ex: Sao Paulo"
                    maxLength={15}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
              </div>

              {settings.interBankEnabled && (
                 <div className="mt-4 p-4 rounded-xl bg-orange-50 border border-orange-100 text-orange-800 text-sm flex gap-3">
                   <AlertTriangle className="w-5 h-5 shrink-0" />
                   <p>A integração direta com o Banco Inter será disponibilizada em patch futuro. Atualmente, os relatórios PIX serão gerados para Pagamento Estático ('Cópia e Cola').</p>
                 </div>
              )}
            </div>

            <div className="pt-8 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-black">Ciclo Pedagógico de Boletins</h3>
                  <p className="text-sm text-zinc-500 mt-1">Configure o período ideal para gerar novas avaliações dos alunos.</p>
                </div>
              </div>

              <div className="space-y-6 bg-orange-50/50 p-6 rounded-2xl border border-orange-100/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-zinc-900">Período de Avaliação</p>
                    <p className="text-sm text-zinc-500">A cada quantos dias o aluno deve ser avaliado?</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      min="1" max="365"
                      value={settings.evaluationCycleDays || 90}
                      onChange={(e) => setSettings({...settings, evaluationCycleDays: Number(e.target.value)})}
                      className="w-20 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                    <span className="text-sm text-zinc-500 font-medium">dias</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-orange-200/30 pt-4">
                  <div>
                    <p className="font-bold text-zinc-900">Aviso Prévio ao Professor</p>
                    <p className="text-sm text-zinc-500">Notificar via Z-API quantos dias antes da aula?</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      min="1" max="15"
                      value={settings.notifyTeacherDaysBefore || 1}
                      onChange={(e) => setSettings({...settings, notifyTeacherDaysBefore: Number(e.target.value)})}
                      className="w-16 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-orange-200/30 pt-4">
                  <div>
                    <p className="font-bold text-zinc-900">Teste do Robô Pedagógico</p>
                    <p className="text-sm text-zinc-500">Acione manualmente a varredura para alertar os professores agora mesmo.</p>
                  </div>
                  <button
                    type="button"
                    onClick={testPedagogicalRoutine}
                    disabled={testingRoutine || !settings.zapiInstance || !settings.zapiToken}
                    className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-sm shadow-orange-500/20"
                  >
                    {testingRoutine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Forçar Varredura Agora
                  </button>
                </div>
              </div>
            </div>

            <button
              disabled={savingConfig}
              className="px-8 py-4 bg-black text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center gap-2"
            >
              {savingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Credenciais
            </button>
          </form>
        </div>
      )}

      {/* Template Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-white rounded-[32px] p-8 max-w-2xl w-full z-10 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-bold mb-6 display-font">
                {currentTemplate.id ? 'Editar Template' : 'Novo Template'}
              </h2>

              <form onSubmit={handleSaveTemplate} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Título do Template</label>
                  <input
                    type="text"
                    required
                    value={currentTemplate.title || ''}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, title: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    placeholder="Ex: Boas-vindas para novos alunos"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Tipo de Mensagem</label>
                    <select
                      value={currentTemplate.type || 'welcome'}
                      onChange={(e) => setCurrentTemplate({ ...currentTemplate, type: e.target.value as any })}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    >
                      <option value="welcome">Boas-Vindas</option>
                      <option value="reschedule">Aviso de Reposição (Ausência)</option>
                      <option value="promo">Promoção</option>
                      <option value="reminder_predue">Aviso Antecipado (Cobrança)</option>
                      <option value="reminder_due">Vencimento Hoje (Cobrança)</option>
                      <option value="reminder_overdue">Mensalidade Atrasada (Cobrança)</option>
                      <option value="evaluation">Aviso de Nova Avaliação</option>
                      <option value="material_added">Novo Material Didático</option>
                      <option value="pedagogic_reminder">Lembrete Pedagógico (Professores)</option>
                      <option value="enrollment_approved">Matrícula Aprovada</option>
                      <option value="enrollment_rejected">Matrícula Reprovada</option>
                      <option value="pix_payment">PIX / Faturamento (Baixa Automática)</option>
                      <option value="declaration_issued">Declaração Emitida</option>
                      <option value="custom">Outros</option>
                    </select>
                  </div>
                  
                  
                  {['welcome', 'material_added', 'enrollment_approved', 'enrollment_rejected', 'declaration_issued'].includes(currentTemplate.type || '') && (
                    <div className="flex flex-col justify-center">
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Disparo Automático</label>
                      <label className="flex items-center cursor-pointer">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={currentTemplate.isAutomatic || false}
                            onChange={(e) => setCurrentTemplate({ ...currentTemplate, isAutomatic: e.target.checked })}
                          />
                          <div className={`block w-14 h-8 rounded-full ${currentTemplate.isAutomatic ? 'bg-orange-500' : 'bg-zinc-200'} transition-colors`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${currentTemplate.isAutomatic ? 'transform translate-x-6' : ''}`}></div>
                        </div>
                        <span className="ml-3 text-sm font-medium text-zinc-700">
                          {currentTemplate.isAutomatic ? 'Ligado' : 'Desligado'}
                        </span>
                      </label>
                      <p className="text-xs text-zinc-400 mt-1">
                        {currentTemplate.type === 'welcome' ? 'Envia essa mensagem sozinho na hora do cadastro do aluno.' : 
                         currentTemplate.type === 'declaration_issued' ? 'Envia essa mensagem automaticamente quando a declaração for emitida.' :
                         ['enrollment_approved', 'enrollment_rejected'].includes(currentTemplate.type || '') ? 'O botão Aprovar/Reprovar irá acionar este envio automaticamente.' :
                         'Envia essa mensagem automaticamente quando um novo material for anexado.'}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-baseline justify-between mb-2">
                    <span className="text-sm font-bold text-zinc-700">Conteúdo da Mensagem</span>
                  </label>
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
                    <strong>Dica de Preenchimento:</strong> Você pode usar variáveis que o painel enviará pro WhatsApp do cliente no lugar desse texto. Basta digitar com as chaves, exatamente como mostrado abaixo:<br/>
                    <ul className="list-disc pl-4 mt-2 mb-1 space-y-1">
                      <li><strong>{'{nome}'}</strong> - Primeiro nome do aluno/cliente;</li>
                      {['enrollment_approved', 'enrollment_rejected', 'pix_payment', 'declaration_issued'].includes(currentTemplate.type || '') && (
                        <>
                          {currentTemplate.type === 'enrollment_approved' && <li><strong>{'{login}'}</strong> - Email/Login de acesso;</li>}
                          {currentTemplate.type === 'enrollment_rejected' && <li><strong>{'{admin_reason}'}</strong> - Motivo da Reprovação anotado pela coordenação;</li>}
                          {currentTemplate.type === 'pix_payment' && <li><strong>{'{link_pix}'}</strong> - Link mágico da fatura com QR Code nativo;</li>}
                          {currentTemplate.type === 'declaration_issued' && <li><strong>{'{link_documento}'}</strong> - Link para baixar o PDF da Declaração;</li>}
                        </>
                      )}
                      {currentTemplate.type?.startsWith('reminder') && (
                        <>
                          <li><strong>{'{valor}'}</strong> - Valor da mensalidade (ex: R$ 150,00);</li>
                          <li><strong>{'{vencimento}'}</strong> - Data de vencimento (ex: 15/05/2026);</li>
                        </>
                      )}
                      {currentTemplate.type === 'reschedule' && (
                        <>
                          <li><strong>{'{professor}'}</strong> - O nome do professor que irá se ausentar;</li>
                          <li><strong>{'{motivo}'}</strong> - O motivo exibido no momento de registrar ausências prolongadas;</li>
                          <li><strong>{'{link}'}</strong> - Link seguro onde o aluno fará sua remarcação (OBRIGATÓRIO).</li>
                        </>
                      )}
                      {currentTemplate.type === 'evaluation' && (
                        <>
                          <li><strong>{'{professor}'}</strong> - O nome do professor que realizou a avaliação;</li>
                          <li><strong>{'{link}'}</strong> - Link para o Portal do Aluno acessar a aba de avaliações.</li>
                        </>
                      )}
                      {currentTemplate.type === 'material_added' && (
                        <>
                          <li><strong>{'{aluno}'}</strong> - O primeiro nome do aluno que recebeu o material;</li>
                          <li><strong>{'{professor}'}</strong> - O nome do professor que enviou o material;</li>
                          <li><strong>{'{material}'}</strong> - O título do material enviado;</li>
                          <li><strong>{'{link}'}</strong> - Link para o Portal do Aluno acessar a aba de materiais.</li>
                        </>
                      )}
                      {currentTemplate.type === 'pedagogic_reminder' && (
                        <>
                          <li><strong>{'{aluno}'}</strong> - O primeiro nome do aluno que fará a avaliação;</li>
                          <li><strong>{'{professor}'}</strong> - O primeiro nome do professor que ministrará a aula;</li>
                          <li><strong>{'{dias}'}</strong> - Quantidade de dias da última avaliação até a data atual.</li>
                        </>
                      )}
                    </ul>
                  </div>
                  
                  <div className="flex items-center gap-1 mb-2 bg-zinc-100 p-1.5 rounded-xl border border-zinc-200 w-fit relative">
                    <button type="button" onClick={() => insertFormatting('*', '*')} className="p-1.5 hover:bg-white rounded-lg text-zinc-600 hover:text-black hover:shadow-sm transition-all" title="Negrito">
                      <Bold className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => insertFormatting('_', '_')} className="p-1.5 hover:bg-white rounded-lg text-zinc-600 hover:text-black hover:shadow-sm transition-all" title="Itálico">
                      <Italic className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => insertFormatting('~', '~')} className="p-1.5 hover:bg-white rounded-lg text-zinc-600 hover:text-black hover:shadow-sm transition-all" title="Tachado">
                      <Strikethrough className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-zinc-300 mx-1"></div>
                    <button type="button" onClick={() => insertFormatting('🔗 ')} className="p-1.5 hover:bg-white rounded-lg text-zinc-600 hover:text-black hover:shadow-sm transition-all" title="Inserir Link">
                      <LinkIcon className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-zinc-300 mx-1"></div>
                    <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-1.5 rounded-lg transition-all ${showEmojiPicker ? 'bg-orange-100 text-orange-600 shadow-sm' : 'hover:bg-white text-zinc-600 hover:text-black hover:shadow-sm'}`} title="Inserir Emoji">
                      <Smile className="w-4 h-4" />
                    </button>
                    
                    {showEmojiPicker && (
                      <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-xl shadow-black/10 ring-1 ring-zinc-950/5 p-3 w-64 z-50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Emojis Comuns</span>
                          <button type="button" onClick={() => setShowEmojiPicker(false)} className="text-zinc-400 hover:text-black">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 h-48 overflow-y-auto pr-1">
                          {COMMON_EMOJIS.map((emoji, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => insertEmoji(emoji)}
                              className="text-lg hover:bg-zinc-100 rounded-lg p-1 transition-colors flex items-center justify-center"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <span className="text-xs text-zinc-400 ml-2 mr-2 hidden sm:inline">Formatação para WhatsApp</span>
                  </div>

                  <textarea
                    id="template-content"
                    required
                    rows={6}
                    value={currentTemplate.content || ''}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, content: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all resize-none"
                    placeholder="Olá, {nome}! Bem-vindo à Avance Academia de Música..."
                  />
                </div>

            <div className="pt-8 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 font-semibold text-zinc-500 hover:text-black hover:bg-zinc-100 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingTemplate}
                    className="bg-black text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-black/20"
                  >
                    {savingTemplate ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Salvar Template
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <FeedbackModal
        isOpen={feedback.isOpen}
        onClose={() => setFeedback({ ...feedback, isOpen: false })}
        title={feedback.title}
        message={feedback.message}
        type={feedback.type}
      />
      
      <ConfirmModal
        isOpen={confirm.isOpen}
        onClose={() => setConfirm({ ...confirm, isOpen: false })}
        onConfirm={confirm.onConfirm}
        title={confirm.title}
        message={confirm.message}
      />
    </div>
  );
}
