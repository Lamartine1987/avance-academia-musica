import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Material, Student } from '../types';
import { BookOpen, Plus, Trash2, X, FileText, Video, Headphones, ExternalLink, Users, PlayCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import ConfirmModal from './ConfirmModal';

interface MaterialsProps {
  profile: UserProfile;
}

export default function Materials({ profile }: MaterialsProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // Form Activity
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'pdf' | 'audio' | 'video' | 'link'>('link');
  const [description, setDescription] = useState('');
  const [shareWithAll, setShareWithAll] = useState(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null);

  const isAdmin = profile.role === 'admin';
  const isTeacher = profile.role === 'teacher';
  const isStudent = profile.role === 'student';

  useEffect(() => {
    // Fetch students if user can create materials
    if (isAdmin || isTeacher) {
      const fetchStudents = async () => {
        const q = query(collection(db, 'students'), where('status', '==', 'active'));
        const snap = await getDocs(q);
        let activeStudents = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).sort((a, b) => a.name.localeCompare(b.name));
        
        if (isTeacher && profile.teacherId) {
          activeStudents = activeStudents.filter(s => s.enrollments.some(e => e.teacherId === profile.teacherId));
        }
        setStudents(activeStudents);
      };
      fetchStudents();
    }
  }, [isAdmin, isTeacher]);

  useEffect(() => {
    // Determine which materials to subscribe to based on role
    const materialsRef = collection(db, 'materials');
    let queries: any[] = [];
    
    if (isAdmin || isTeacher) {
      queries.push(query(materialsRef, orderBy('createdAt', 'desc')));
    } else if (isStudent && profile.studentId) {
      // Students need explicit queries to pass Firestore security rules
      queries.push(query(materialsRef, where('studentIds', '==', [])));
      queries.push(query(materialsRef, where('studentIds', 'array-contains', profile.studentId)));
    }

    if (queries.length === 0) return;

    let unsubscribes: any[] = [];
    let combinedMaterials: Map<string, Material> = new Map();
    let pendingQueries = queries.length;

    queries.forEach((q) => {
      const unsub = onSnapshot(q, (snap) => {
        snap.docs.forEach(d => {
          combinedMaterials.set(d.id, { id: d.id, ...d.data() } as Material);
        });
        
        // Handle removals
        snap.docChanges().forEach(change => {
           if (change.type === 'removed') {
             combinedMaterials.delete(change.doc.id);
           }
        });

        let fetched = Array.from(combinedMaterials.values())
           .sort((a, b) => new Date(b.createdAt?.toDate?.() || 0).getTime() - new Date(a.createdAt?.toDate?.() || 0).getTime());
        
        // Hide private materials from other teachers (Only admin sees all, or teacher sees their own, or global)
        if (isTeacher && profile.teacherId) {
          fetched = fetched.filter(m => m.studentIds.length === 0 || m.teacherId === profile.teacherId || m.teacherId === profile.uid);
        }

        setMaterials(fetched);
        
        pendingQueries = Math.max(0, pendingQueries - 1);
        if (pendingQueries === 0) setLoading(false);
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(u => u());
  }, [isAdmin, isTeacher, isStudent, profile.studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !url) return;
    setIsSubmitting(true);

    try {
      let finalUrl = url;
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }

      const materialData = {
        title,
        url: finalUrl,
        type,
        description,
        teacherId: profile.teacherId || profile.uid,
        teacherName: profile.displayName || 'Professor',
        studentIds: shareWithAll ? [] : selectedStudentIds,
        createdAt: serverTimestamp()
      };

      const result = await addDoc(collection(db, 'materials'), materialData);
      
      try {
        const functions = getFunctions();
        const notifyNewMaterial = httpsCallable(functions, 'notifyNewMaterial');
        const studentsToNotify = shareWithAll ? students.map(s => s.id) : selectedStudentIds;
        
        if (studentsToNotify.length > 0) {
          await notifyNewMaterial({
             materialId: result.id,
             studentIds: studentsToNotify,
             originUrl: window.location.origin
          });
        }
      } catch (notifyErr) {
        console.error('Error notifying students', notifyErr);
      }
      
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar material.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setUrl('');
    setType('link');
    setDescription('');
    setShareWithAll(true);
    setSelectedStudentIds([]);
  };

  const handleDelete = async () => {
    if (!materialToDelete) return;
    try {
      await deleteDoc(doc(db, 'materials', materialToDelete.id));
      setMaterialToDelete(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir material.');
    }
  };

  const getTypeIcon = (mType: string) => {
    switch (mType) {
      case 'pdf': return <FileText className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'audio': return <Headphones className="w-5 h-5" />;
      default: return <ExternalLink className="w-5 h-5" />;
    }
  };

  const getTypeColor = (mType: string) => {
    switch (mType) {
      case 'pdf': return 'bg-red-50 text-red-500 ring-red-500/20';
      case 'video': return 'bg-purple-50 text-purple-500 ring-purple-500/20';
      case 'audio': return 'bg-blue-50 text-blue-500 ring-blue-500/20';
      default: return 'bg-zinc-50 text-zinc-500 ring-zinc-500/20';
    }
  };

  const getTypeName = (mType: string) => {
    switch (mType) {
      case 'pdf': return 'Documento / Partitura';
      case 'video': return 'Vídeo';
      case 'audio': return 'Áudio / Backing Track';
      default: return 'Link Externo';
    }
  };

  const handleStudentToggle = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
    } else {
      setSelectedStudentIds(prev => [...prev, studentId]);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5">
        <div>
          <h2 className="text-2xl font-bold display-font text-zinc-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-orange-500" /> Repositório de Materiais
          </h2>
          <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
            {isStudent ? 'Sua biblioteca de estudos, partituras e backing tracks.' : 'Compartilhe partituras, vídeos e links com seus alunos.'}
          </p>
        </div>
        {(isAdmin || isTeacher) && (
          <button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-95 font-medium whitespace-nowrap"
          >
            <Plus className="w-5 h-5" /> Novo Material
          </button>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl relative my-8"
            >
              <button
                onClick={() => setShowForm(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-bold display-font text-zinc-900">Novo Material Didático</h3>
                <p className="text-zinc-500 text-sm mt-1">Insira os dados do link compartilhado.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Título do Material</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                      placeholder="Ex: Partitura de Sweet Child O' Mine"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Tipo de Conteúdo</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    >
                      <option value="pdf">Documento / Partitura (PDF)</option>
                      <option value="video">Vídeo (YouTube / Drive)</option>
                      <option value="audio">Áudio / Backing Track</option>
                      <option value="link">Outro Link Externo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Link Compartilhado (URL)</label>
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                    placeholder="https://drive.google.com/..."
                  />
                  <p className="text-xs text-zinc-400 mt-1 ml-1 tracking-wide">Certifique-se de que o link esteja acessível para seus alunos (permissão de leitura).</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Descrição (Opcional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all h-24 resize-none"
                    placeholder="Dicas sobre como estudar este material..."
                  />
                </div>

                <div className="bg-zinc-50 p-4 rounded-[24px] border border-zinc-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">Privacidade de Acesso</h4>
                      <p className="text-xs text-zinc-500">Quem pode ver este material no portal?</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={shareWithAll}
                        onChange={(e) => setShareWithAll(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      <span className="ml-3 text-sm font-medium text-zinc-700">Visível para Todos</span>
                    </label>
                  </div>

                  {!shareWithAll && (
                    <div className="mt-4 max-h-48 overflow-y-auto space-y-2 pr-2">
                      {students.map(student => (
                        <label key={student.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-xl cursor-pointer transition-colors border border-transparent hover:border-zinc-200">
                          <input 
                            type="checkbox"
                            checked={selectedStudentIds.includes(student.id)}
                            onChange={() => handleStudentToggle(student.id)}
                            className="w-4 h-4 text-orange-500 border-zinc-300 rounded focus:ring-orange-500"
                          />
                          <span className="text-sm font-medium text-zinc-700">{student.name}</span>
                        </label>
                      ))}
                      {students.length === 0 && <p className="text-xs text-zinc-500 italic">Nenhum aluno ativo encontrado.</p>}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-orange-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg hover:shadow-orange-500/25 active:scale-95 flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Material'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materials.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-[32px] border border-dashed border-zinc-200 flex flex-col items-center">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-zinc-300" />
            </div>
            <p className="text-zinc-500 font-medium">Nenhum material compartilhado ainda.</p>
            {isTeacher && <p className="text-sm text-zinc-400 mt-1">Clique em "Novo Material" para começar a adicionar conteúdos.</p>}
          </div>
        ) : (
          materials.map(material => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key={material.id}
              className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5 flex flex-col h-full group transition-all hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ring-1 ${getTypeColor(material.type)}`}>
                  {getTypeIcon(material.type)}
                </div>
                {(isAdmin || (isTeacher && material.teacherId === profile.teacherId)) && (
                  <button
                    onClick={() => setMaterialToDelete(material)}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <h3 className="text-lg font-bold text-zinc-900 mb-2 leading-tight line-clamp-2" title={material.title}>{material.title}</h3>
              <p className="text-sm text-zinc-500 flex-1 line-clamp-3 mb-4 leading-relaxed">{material.description || 'Sem descrição.'}</p>
              
              <div className="pt-4 border-t border-zinc-100 grid grid-cols-2 gap-2 text-xs text-zinc-500 mb-6">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-zinc-400">Tipo</span>
                  <span className="text-zinc-900 font-medium">{getTypeName(material.type)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-zinc-400">Acesso</span>
                  <span className="text-zinc-900 font-medium flex items-center gap-1">
                    {material.studentIds.length === 0 ? <><Users className="w-3 h-3" /> Todos</> : <><Users className="w-3 h-3 text-orange-500" /> Específico</>}
                  </span>
                </div>
              </div>

              <a 
                href={material.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold bg-zinc-50 text-zinc-700 hover:bg-zinc-100 transition-colors border border-zinc-200 mt-auto"
              >
                <PlayCircle className="w-4 h-4" /> Acessar Link Externo
              </a>
            </motion.div>
          ))
        )}
      </div>

      <ConfirmModal
        isOpen={!!materialToDelete}
        onClose={() => setMaterialToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Material"
        message={`Tem certeza que deseja excluir "${materialToDelete?.title}"? O link desaparecerá para todos os alunos associados.`}
        confirmText="Excluir"
      />
    </div>
  );
}
