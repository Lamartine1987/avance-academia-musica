import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, Timestamp, addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { UserProfile, StudentDocument, Student, DocumentRequest } from '../types';
import { FileText, Download, Trash2, Search, Filter, Loader2, UploadCloud, X, CheckCircle, File, ChevronRight, Inbox, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from './ConfirmModal';
import { generateDeclarationPDF } from '../lib/pdf-generator';

interface DocumentsProps {
  profile?: UserProfile; 
}

const typeLabels: Record<string, string> = {
  contract: 'Contrato',
  identification: 'Identificação (RG/CPF)',
  proof_of_address: 'Comprovante de Endereço',
  certificate: 'Certificado',
  other: 'Outros'
};

const typeColors: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-700',
  identification: 'bg-emerald-100 text-emerald-700',
  proof_of_address: 'bg-amber-100 text-amber-700',
  certificate: 'bg-purple-100 text-purple-700',
  other: 'bg-zinc-100 text-zinc-700'
};

export default function Documents({ profile }: DocumentsProps) {
  const [activeTab, setActiveTab] = useState<'files'|'requests'>('files');
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  
  const [students, setStudents] = useState<Student[]>([]);
  
  // Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadType, setUploadType] = useState<StudentDocument['type']>('contract');
  const [uploadStudentId, setUploadStudentId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Request State
  const [requestType, setRequestType] = useState('Declaração de Matrícula');
  const [requestObservation, setRequestObservation] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  
  // Admin Request Actions
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);

  // Delete State
  const [docToDelete, setDocToDelete] = useState<StudentDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Preview State
  const [previewReq, setPreviewReq] = useState<DocumentRequest | null>(null);

  useEffect(() => {
    fetchDocumentsLocally();
    if (profile?.role === 'admin') {
      fetchStudents();
    }
  }, [profile]);

  const fetchStudents = async () => {
    try {
      const q = query(collection(db, 'students'), orderBy('name'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(data);
    } catch(err) {
      console.error(err);
    }
  };

  const fetchDocumentsLocally = async () => {
    setLoading(true);
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'school'));
      if(settingsSnap.exists()) setSchoolSettings(settingsSnap.data());

      let qDocs, qReqs;
      
      if (profile?.role === 'admin') {
        qDocs = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
        qReqs = query(collection(db, 'document_requests'), orderBy('requestDate', 'desc'));
      } else if (profile?.studentId) {
        qDocs = query(collection(db, 'documents'), where('studentId', '==', profile.studentId));
        qReqs = query(collection(db, 'document_requests'), where('studentId', '==', profile.studentId));
      } else {
        setDocuments([]);
        setRequests([]);
        setLoading(false);
        return;
      }
      
      const [snapDocs, snapReqs] = await Promise.all([getDocs(qDocs), getDocs(qReqs)]);
      
      const docsData = snapDocs.docs.map(d => ({ id: d.id, ...d.data() } as StudentDocument));
      const reqsData = snapReqs.docs.map(d => ({ id: d.id, ...d.data() } as DocumentRequest));
      
      // If student, sort locally (composite index avoidance)
      if (profile?.role !== 'admin') {
        docsData.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        reqsData.sort((a, b) => b.requestDate.toMillis() - a.requestDate.toMillis());
      }
      setDocuments(docsData);
      setRequests(reqsData);
    } catch(err) {
      console.error("Erro ao buscar documentos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTitle || !uploadStudentId) return;
    
    setIsUploading(true);
    try {
      const student = students.find(s => s.id === uploadStudentId);
      if (!student) throw new Error("Aluno não encontrado");

      const fileExt = uploadFile.name.split('.').pop();
      const fileName = `${uploadStudentId}_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `documents/${fileName}`);
      
      const uploadTask = uploadBytesResumable(storageRef, uploadFile);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error(error);
          alert("Erro no upload");
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const newDoc: Omit<StudentDocument, 'id'> = {
            studentId: uploadStudentId,
            studentName: student.name,
            title: uploadTitle,
            type: uploadType,
            url: downloadURL,
            createdAt: Timestamp.now()
          };
          
          await addDoc(collection(db, 'documents'), newDoc);
          
          setIsUploadModalOpen(false);
          setUploadFile(null);
          setUploadTitle('');
          setUploadStudentId('');
          setUploadProgress(0);
          setIsUploading(false);
          fetchDocumentsLocally();
        }
      );
    } catch(err) {
      console.error(err);
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!docToDelete || !docToDelete.id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'documents', docToDelete.id));
      setDocuments(documents.filter(d => d.id !== docToDelete.id));
    } catch(err) {
      console.error("Erro ao deletar do banco:", err);
    } finally {
      setIsDeleting(false);
      setDocToDelete(null);
    }
  };

  // Student Requests
  const handleRequestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.studentId) return;
    setIsRequesting(true);
    try {
      const studentSnap = await getDoc(doc(db, 'students', profile.studentId));
      const studentName = studentSnap.exists() ? studentSnap.data().name : profile.displayName;
      await addDoc(collection(db, 'document_requests'), {
        studentId: profile.studentId,
        studentName,
        type: requestType,
        observation: requestObservation,
        status: 'pending',
        requestDate: Timestamp.now()
      });

      await addDoc(collection(db, 'notifications'), {
        title: 'Nova Solicitação',
        message: `${studentName} solicitou uma emissão oficial: ${requestType}`,
        type: 'document_request',
        read: false,
        createdAt: Timestamp.now()
      });
      
      setIsRequestModalOpen(false);
      setRequestObservation('');
      setActiveTab('requests');
      fetchDocumentsLocally();
    } catch(err) {
      console.error(err);
    }
    setIsRequesting(false);
  };

  // Admin Actions
  const handleApproveRequest = async (req: DocumentRequest) => {
    if (!req.id || processingReqId) return;
    setProcessingReqId(req.id);
    try {
      const studentSnap = await getDoc(doc(db, 'students', req.studentId));
      if (!studentSnap.exists()) throw new Error("Aluno não encontrado");
      const student = { id: studentSnap.id, ...studentSnap.data() } as Student;
      
      // Generate PDF
      const pdfBlob = await generateDeclarationPDF(student, req, schoolSettings, profile!);
      const fileName = `declaracao_${req.studentId}_${Date.now()}.pdf`;
      const storageRef = ref(storage, `documents/${fileName}`);
      const uploadTask = await uploadBytesResumable(storageRef, pdfBlob);
      const downloadURL = await getDownloadURL(uploadTask.ref);
      
      await updateDoc(doc(db, 'document_requests', req.id), {
        status: 'approved',
        documentUrl: downloadURL,
        approvedBy: profile?.displayName?.split(' ')[0] || 'Admin'
      });
      
      await addDoc(collection(db, 'documents'), {
        studentId: req.studentId,
        studentName: req.studentName,
        title: req.type,
        type: 'certificate',
        url: downloadURL,
        createdAt: Timestamp.now()
      });
      
      fetchDocumentsLocally();
      
      // Envio Automático para WhatsApp
      if (student.phone) {
        try {
          const tSnap = await getDocs(query(collection(db, 'templates'), where('type', '==', 'declaration_issued')));
          const docTpl = tSnap.docs.find(d => d.data().isAutomatic === true);
          if (docTpl) {
            const template = docTpl.data();
            const setSnap = await getDoc(doc(db, 'settings', 'integrations'));
            if (setSnap.exists()) {
              const { whatsappEngine, zapiInstance, zapiToken, zapiSecurityToken, apizUrl, apizToken, apizInstanceName } = setSnap.data() as any;
              
              const cleanPhone = student.phone.replace(/\D/g, '');
              if (cleanPhone.length >= 10) {
                const number = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
                let msg = template.content.replace(/{nome}/g, student.name.split(' ')[0]);
                msg = msg.replace(/{link_documento}/g, downloadURL);
                msg = `🔔 *Aviso do Sistema Avance*\n\n${msg}`;
                
                const isApiz = whatsappEngine === 'apiz';
                
                if (isApiz && apizUrl) {
                   const baseUrl = apizUrl.replace(/\/send-text\/?$/, '').replace(/\/$/, '');
                   fetch(`${baseUrl}/send-text`, {
                     method: 'POST',
                     headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apizToken || ''
                     },
                     body: JSON.stringify({
                        instanceName: apizInstanceName || 'teste-crm',
                        number: number,
                        text: msg
                     })
                   }).catch(console.error);
                } else if (!isApiz && zapiInstance && zapiToken) {
                   const headers: any = { 'Content-Type': 'application/json' };
                   if (zapiSecurityToken) headers['Client-Token'] = zapiSecurityToken;
                   
                   const url = zapiToken?.startsWith('http') ? zapiToken : `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`;
                   fetch(url, {
                     method: 'POST',
                     headers,
                     body: JSON.stringify({ instanceName: zapiInstance, phone: number, message: msg })
                   }).catch(console.error);
                }
              }
            }
          }
        } catch(e) {
          console.error("Erro ao notificar emissão via whatsapp:", e);
        }
      }

    } catch (err) {
      console.error(err);
      alert("Erro ao gerar declaração.");
    } finally {
      setProcessingReqId(null);
    }
  };

  const handleRejectRequest = async (req: DocumentRequest) => {
    if (!req.id || processingReqId) return;
    if (!window.confirm("Tem certeza que deseja recusar esta solicitação?")) return;
    setProcessingReqId(req.id);
    try {
      await updateDoc(doc(db, 'document_requests', req.id), {
        status: 'rejected',
        approvedBy: profile?.displayName?.split(' ')[0] || 'Admin'
      });
      fetchDocumentsLocally();
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingReqId(null);
    }
  };

  const handleDeleteRequest = async (req: DocumentRequest) => {
    if (!req.id) return;
    if (!window.confirm("Apagar histórico de solicitação? A via gerada, caso exista, continuará disponível nos Arquivos Digitais.")) return;
    try {
      await deleteDoc(doc(db, 'document_requests', req.id));
      fetchDocumentsLocally();
    } catch(err) {
      console.error("Erro ao apagar solicitação", err);
    }
  };

  const generatePreviewHtml = (req: DocumentRequest) => {
    const s = students.find(x => x.id === req.studentId);
    let html = schoolSettings?.declarationTemplate || "Nenhum modelo configurado. Vá em Comunicação > Textos para configurar.";
    if (s) {
       const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
       const diasArray = s.enrollments?.flatMap(e => e.schedule?.map(i => diasSemana[i.day])) || [];
       const horariosArray = s.enrollments?.flatMap(e => e.schedule?.map(i => i.time)) || [];
       
       const dias = Array.from(new Set(diasArray)).filter(Boolean).join(', ');
       const horarios = Array.from(new Set(horariosArray)).filter(Boolean).join(', ');

       html = html
            .replace(/{{nome}}/g, s.name)
            .replace(/{{cpf}}/g, s.cpf || 'Não informado')
            .replace(/{{rg}}/g, s.rg || 'Não informado')
            .replace(/{{nascimento}}/g, s.birthDate ? new Date(s.birthDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não informado')
            .replace(/{{curso}}/g, s.enrollments?.map((e: any) => e.instrument).join(', ') || 'Não informado')
            .replace(/{{dias}}/g, dias || 'Não informado')
            .replace(/{{horarios}}/g, horarios || 'Não informado');
    }
    return html;
  };

  const filteredDocs = documents.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.studentName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || d.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-zinc-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold display-font text-zinc-900">
                {profile?.role === 'admin' ? 'Arquivo Geral e Secretaria' : 'Secretaria Digital'}
              </h2>
              <p className="text-zinc-500 text-sm">
                {profile?.role === 'admin' ? 'Gerencie documentos e atenda as solicitações dos alunos.' : 'Baixe seus arquivos oficias ou solicite declarações.'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {profile?.role === 'student' && (
              <button
                onClick={() => setIsRequestModalOpen(true)}
                className="flex justify-center items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg active:scale-[0.98]"
              >
                <Inbox className="w-5 h-5" />
                Solicitar Declaração
              </button>
            )}
            {profile?.role === 'admin' && (
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex justify-center items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg active:scale-[0.98]"
              >
                <UploadCloud className="w-5 h-5" />
                Enviar Documento
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 flex border-b border-zinc-200 overflow-x-auto print:hidden">
          <button 
            className={`whitespace-nowrap pb-4 px-4 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'files' ? 'border-blue-500 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
            onClick={() => setActiveTab('files')}
          >
            <File className="w-4 h-4" />
            Arquivos Oficiais
          </button>
          <button 
            className={`whitespace-nowrap pb-4 px-4 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'requests' ? 'border-orange-500 text-orange-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
            onClick={() => setActiveTab('requests')}
          >
            <Inbox className="w-4 h-4" />
            Solicitações da Secretaria
            {pendingRequests > 0 && profile?.role === 'admin' && (
              <span className="bg-orange-500 text-white px-2 py-0.5 rounded-full text-[10px] shadow-sm animate-pulse">
                {pendingRequests}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'files' && (
          <div className="mt-6 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={profile?.role === 'admin' ? "Buscar pelo nome do aluno ou título..." : "Buscar documento..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pl-12 p-3 transition-colors outline-none"
              />
            </div>
            <div className="md:w-64 relative">
              <Filter className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pl-12 p-3 appearance-none transition-colors outline-none"
              >
                <option value="all">Todos os Tipos</option>
                <option value="contract">Contratos</option>
                <option value="identification">Identificação</option>
                <option value="proof_of_address">Endereço</option>
                <option value="certificate">Certificados</option>
                <option value="other">Outros</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[32px] overflow-hidden border border-zinc-200">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : activeTab === 'requests' ? (
          requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <Inbox className="w-10 h-10 text-orange-300" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Caixa de Entrada Vazia</h3>
              <p className="text-zinc-500 max-w-md">
                {profile?.role === 'admin' ? 'Nenhuma solicitação pendente no momento.' : 'Você ainda não solicitou nenhuma declaração oficial.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 bg-zinc-50/50 uppercase font-semibold">
                  <tr>
                    {profile?.role === 'admin' && <th className="px-6 py-4">Aluno</th>}
                    <th className="px-6 py-4">Documento Exigido</th>
                    <th className="px-6 py-4">Data do Pedido</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {requests.map(req => (
                    <tr key={req.id} className="hover:bg-orange-50/30 transition-colors group">
                      {profile?.role === 'admin' && (
                        <td className="px-6 py-4 font-bold text-zinc-900 border-b border-zinc-100 align-top">
                          {req.studentName}
                          {req.observation && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm font-normal text-blue-900 shadow-sm max-w-xs whitespace-pre-wrap">
                              <strong className="block text-[10px] uppercase tracking-wide mb-1 text-blue-600">Mensagem do Aluno:</strong>
                              {req.observation}
                            </div>
                          )}
                        </td>
                      )}
                      
                      <td className="px-6 py-4 font-semibold text-zinc-800 border-b border-zinc-100 align-top">
                        {req.type}
                        {profile?.role === 'student' && req.observation && (
                           <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm font-normal text-blue-900 shadow-sm max-w-xs whitespace-pre-wrap">
                             <strong className="block text-[10px] uppercase tracking-wide mb-1 text-blue-600">Sua Mensagem:</strong>
                             {req.observation}
                           </div>
                        )}
                      </td>
                      
                      <td className="px-6 py-4 text-zinc-500 border-b border-zinc-100 align-top">
                        {req.requestDate?.toDate ? req.requestDate.toDate().toLocaleDateString('pt-BR') : '-'}
                      </td>
                      
                      <td className="px-6 py-4">
                        {req.status === 'pending' ? (
                          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold border border-orange-200 flex items-center w-fit gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Pendente</span>
                        ) : req.status === 'approved' ? (
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">Emitido por {req.approvedBy}</span>
                        ) : (
                          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-200">Recusado por {req.approvedBy}</span>
                        )}
                      </td>
                      
                      <td className="px-6 py-4 text-right border-b border-zinc-100 align-top">
                        {profile?.role === 'admin' ? (
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            {req.status === 'pending' ? (
                              <>
                                <button
                                   onClick={() => setPreviewReq(req)}
                                   disabled={processingReqId === req.id}
                                   className="px-4 py-2 w-[140px] bg-blue-500 text-white font-bold text-xs rounded-xl shadow hover:bg-blue-600 transition-colors disabled:opacity-50"
                                >
                                   Prévia do Texto
                                </button>
                                <div className="flex justify-end gap-1 mt-1 w-[140px]">
                                  <button
                                    onClick={() => handleApproveRequest(req)}
                                    disabled={processingReqId === req.id}
                                    className="flex-1 px-2 py-2 bg-emerald-500 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1 hover:bg-emerald-600 transition-colors shadow disabled:opacity-50"
                                  >
                                    {processingReqId === req.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Check className="w-3 h-3" />}
                                    Emitir PDF
                                  </button>
                                  <button
                                    onClick={() => handleRejectRequest(req)}
                                    disabled={processingReqId === req.id}
                                    className="px-3 py-2 text-zinc-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors border border-transparent shadow hover:border-red-600 bg-white"
                                    title="Recusar Solicitação"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </>
                            ) : (
                               <div className="flex items-center gap-2">
                                 {req.status === 'approved' && req.documentUrl && (
                                   <a 
                                     href={req.documentUrl} 
                                     target="_blank" 
                                     rel="noopener noreferrer" 
                                     className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 transition-colors"
                                   >
                                     <Download className="w-4 h-4" />
                                   </a>
                                 )}
                                 <button
                                   onClick={() => handleDeleteRequest(req)}
                                   className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-zinc-200"
                                   title="Excluir Histórico da Solicitação"
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                               </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {req.status === 'approved' && req.documentUrl && (
                              <a 
                                href={req.documentUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 font-bold rounded-xl hover:bg-blue-100 transition-colors"
                              >
                                <Download className="w-4 h-4" /> Baixar PDF
                              </a>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-10 h-10 text-zinc-300" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">Nenhum documento encontrado</h3>
            <p className="text-zinc-500 max-w-md">
              {searchTerm || typeFilter !== 'all' 
                ? 'Tente remover os filtros da sua busca para encontrar os arquivos desejados.'
                : 'O arquivo digital está vazio. Documentos recém criados aparecerão aqui.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 bg-zinc-50/50 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Documento</th>
                  {profile?.role === 'admin' && <th className="px-6 py-4">Aluno Associado</th>}
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Data de Criação</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredDocs.map((docItem) => (
                  <tr key={docItem.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${typeColors[docItem.type]}`}>
                        <File className="w-4 h-4" />
                      </div>
                      {docItem.title}
                    </td>
                    {profile?.role === 'admin' && (
                      <td className="px-6 py-4 text-zinc-600">
                        {docItem.studentName}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${typeColors[docItem.type] || typeColors.other}`}>
                        {typeLabels[docItem.type] || docItem.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-500">
                      {docItem.createdAt?.toDate ? docItem.createdAt.toDate().toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a 
                          href={docItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Baixar Arquivo"
                        >
                          <Download className="w-5 h-5" />
                        </a>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => setDocToDelete(docItem)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="Apagar"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsUploadModalOpen(false)} className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-[32px] p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold display-font text-zinc-900">Novo Arquivo Digital</h3>
                <button onClick={() => setIsUploadModalOpen(false)} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleUpload} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Título do Documento</label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    placeholder="Ex: Cópia do RG - João"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Aluno Proprietário</label>
                  <select
                    required
                    value={uploadStudentId}
                    onChange={e => setUploadStudentId(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="">Selecione o aluno...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo de Arquivo</label>
                  <select
                    value={uploadType}
                    onChange={e => setUploadType(e.target.value as any)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="contract">Contrato Assinado</option>
                    <option value="identification">Documento de Identificação</option>
                    <option value="proof_of_address">Comprovante de Endereço</option>
                    <option value="certificate">Certificado Acadêmico</option>
                    <option value="other">Outros Acordos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Arquivo PDF ou Imagem</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                {isUploading && (
                  <div className="w-full bg-zinc-100 rounded-full h-2.5 mb-4 overflow-hidden">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-full mt-6 bg-blue-600 text-white font-bold py-4 rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-75 shadow-lg shadow-blue-500/25"
                >
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Salvar no Arquivo Digital'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRequestModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsRequestModalOpen(false)} className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-[32px] p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold display-font text-zinc-900">Central de Atendimento</h3>
                  <p className="text-zinc-500 text-sm mt-1">Solicite à secretaria documentos oficias com assinatura e validade.</p>
                </div>
                <button onClick={() => setIsRequestModalOpen(false)} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleRequestDocument} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Para qual finalidade é o documento?</label>
                  <select
                    required
                    value={requestType}
                    onChange={e => setRequestType(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500/20 outline-none font-medium"
                  >
                    <option value="Declaração de Matrícula">Comprovar vínculo acadêmico (Declaração de Matrícula)</option>
                    <option value="Declaração de Frequência">Comprovar frequência nas aulas (Estágio/Trabalho)</option>
                    <option value="Certificado de Conclusão">Certificado de Conclusão / Histórico</option>
                    <option value="Outro">Outra finalidade...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Observações Detalhadas (Opcional)</label>
                  <textarea
                    rows={3}
                    value={requestObservation}
                    onChange={e => setRequestObservation(e.target.value)}
                    placeholder="Se for urgente ou precisar de um detalhe específico escrito, avise a coordenação aqui."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500/20 outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isRequesting}
                  className="w-full mt-8 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-4 rounded-xl flex items-center justify-center hover:from-orange-600 hover:to-amber-600 transition-colors disabled:opacity-75 shadow-lg shadow-orange-500/25 active:scale-[0.98]"
                >
                  {isRequesting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Abrir Solicitação Oficial'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewReq && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewReq(null)} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-[32px] p-6 md:p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between mb-8 border-b pb-4">
                 <div>
                   <h3 className="text-xl font-bold display-font text-zinc-900">Prévia do Documento Oficial</h3>
                   <p className="text-sm text-zinc-500 mt-1">Veja como o PDF será gerado para o aluno.</p>
                 </div>
                 <button onClick={() => setPreviewReq(null)} className="p-2 text-zinc-400 hover:text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors"><X className="w-5 h-5"/></button>
              </div>

              <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-8 mb-8 min-h-[400px]">
                {/* Logo or School Header sim */}
                <div className="text-center mb-8 pb-4 border-b border-zinc-200">
                  <h2 className="font-bold uppercase tracking-wider text-lg">{schoolSettings?.tradingName || 'ESCOLA'}</h2>
                  <p className="text-xs text-zinc-500">CNPJ: {schoolSettings?.cnpj}</p>
                </div>
                
                <h3 className="text-xl font-black text-center mb-8 uppercase underline">DECLARAÇÃO</h3>
                
                <div 
                  className="prose prose-zinc max-w-none text-justify leading-loose break-words text-[15px]" 
                  dangerouslySetInnerHTML={{ __html: generatePreviewHtml(previewReq) }} 
                />
              </div>

              <div className="flex justify-end gap-3">
                 <button onClick={() => setPreviewReq(null)} className="px-6 py-3 rounded-xl font-bold text-zinc-600 hover:bg-zinc-100 transition-colors">Fechar Prévia</button>
                 <button 
                   onClick={() => {
                     handleApproveRequest(previewReq);
                     setPreviewReq(null);
                   }}
                   className="px-8 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all flex items-center gap-2"
                 >
                   <Check className="w-5 h-5" />
                   Aprovar e Emitir PDF
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!docToDelete}
        title="Apagar Documento"
        message={`Tem certeza que deseja remover o documento permanentemente do arquivo escolar?\n\nEsta ação não poderá ser desfeita e o aluno perderá acesso a este link oficial.`}
        onConfirm={handleDelete}
        onClose={() => setDocToDelete(null)}
        confirmText={isDeleting ? 'Apagando...' : 'Sim, Apagar Permanentemente'}
      />
    </div>
  );
}
