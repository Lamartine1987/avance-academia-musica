import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MessageTemplate, IntegrationsSettings } from '../types';
import { Loader2, MessageSquareText, Settings, Plus, Save, Trash2, Edit2, X, Bold, Italic, Strikethrough, Link as LinkIcon, Smile, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function Communication() {
  const [activeTab, setActiveTab] = useState<'templates' | 'settings'>('templates');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [settings, setSettings] = useState<IntegrationsSettings>({ 
    zapiInstance: '', zapiToken: '', zapiSecurityToken: '',
    remindersEnabled: true, reminderDaysBefore: true, reminderDaysBeforeCount: 3, 
    sendOnDue: true, reminderDaysAfter: true, reminderDaysAfterCount: 1,
    evaluationCycleDays: 90, notifyTeacherDaysBefore: 1
  });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingRoutine, setTestingRoutine] = useState(false);

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
      alert('Configurações salvas com sucesso!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar as configurações.');
    }
    setSavingConfig(false);
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
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar o template.');
    }
    setSavingTemplate(false);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      await deleteDoc(doc(db, 'templates', id));
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir template.');
    }
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
    if (!window.confirm('Isto disparará a varredura manual em todos os alunos ativos e pode enviar mensagens no WhatsApp dos professores imediatamente. Deseja prosseguir?')) return;
    
    setTestingRoutine(true);
    try {
      const functions = getFunctions();
      const manualRoutine = httpsCallable(functions, 'manualPedagogicalRoutine');
      const result = await manualRoutine();
      const data = result.data as any;
      if (data.success) {
        alert('✅ Varredura Executada. Professores Notificados!');
      } else {
        alert('Erro retornado: ' + data.reason);
      }
    } catch (e: any) {
      console.error(e);
      alert('Erro de Execução: ' + e.message);
    }
    setTestingRoutine(false);
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
      case 'pedagogic_reminder': return 'Lembrete Pedagógico (Professores)';
      case 'custom': return 'Outros';
      default: return type;
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 p-2 shadow-sm flex flex-col sm:flex-row gap-2">
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
      </div>

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
        <div className="bg-white rounded-[32px] p-8 shadow-xl ring-1 ring-zinc-950/5 max-w-2xl">
          <div className="mb-6 border-l-4 border-orange-500 pl-4">
            <h3 className="text-xl font-bold display-font">Credenciais Z-API</h3>
            <p className="text-zinc-500 text-sm mt-1">
              Forneça os dados da sua instância Z-API. Esta configuração é global e será usada para o envio das faturas e também dos templates de mensagens desta área.
            </p>
          </div>
          
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Instance ID</label>
              <input 
                type="text" 
                required
                value={settings.zapiInstance}
                onChange={e => setSettings({...settings, zapiInstance: e.target.value})}
                placeholder="Ex: 3C22F090CA5A4E..."
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Token da Instância</label>
              <input 
                type="text" 
                required
                value={settings.zapiToken}
                onChange={e => setSettings({...settings, zapiToken: e.target.value})}
                placeholder="Ex: 1234abc... (Aquele que fica na URL)"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold uppercase tracking-widest text-zinc-600 mb-2">Client-Token de Segurança (Opcional)</label>
              <input 
                type="text" 
                value={settings.zapiSecurityToken || ''}
                onChange={e => setSettings({...settings, zapiSecurityToken: e.target.value})}
                placeholder="Ex: F0639f... (Apenas se você ativou o token de segurança na Z-API)"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

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
                      <option value="pedagogic_reminder">Lembrete Pedagógico (Professores)</option>
                      <option value="custom">Outros</option>
                    </select>
                  </div>
                  
                  {currentTemplate.type === 'welcome' && (
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
                          {currentTemplate.isAutomatic ? 'Ligado na Matrícula' : 'Desligado'}
                        </span>
                      </label>
                      <p className="text-xs text-zinc-400 mt-1">Envia essa mensagem sozinho na hora do cadastro do aluno.</p>
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

                <div className="pt-4 flex justify-end gap-3">
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
    </div>
  );
}
