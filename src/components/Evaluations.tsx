import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, serverTimestamp, deleteDoc, doc, getDocs, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';
import { UserProfile, Evaluation, Student, EvaluationMetric } from '../types';
import { Award, Plus, Trash2, X, Star, Calendar as CalendarIcon, Loader2, Music2, User, Search, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';

interface EvaluationsProps {
  profile: UserProfile;
}

const DEFAULT_METRICS = [
  { name: 'Técnica', score: 0 },
  { name: 'Teoria', score: 0 },
  { name: 'Ritmo', score: 0 },
  { name: 'Repertório', score: 0 }
];

export default function Evaluations({ profile }: EvaluationsProps) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  
  // Form Activity
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [instrument, setInstrument] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [metrics, setMetrics] = useState<EvaluationMetric[]>([...DEFAULT_METRICS]);
  const [notes, setNotes] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluationToDelete, setEvaluationToDelete] = useState<Evaluation | null>(null);

  const isAdmin = profile.role === 'admin';
  const isTeacher = profile.role === 'teacher';
  const isStudent = profile.role === 'student';

  useEffect(() => {
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
    const evalsRef = collection(db, 'evaluations');
    let q;

    if (isAdmin) {
      q = query(evalsRef, orderBy('createdAt', 'desc'));
    } else if (isTeacher && profile.teacherId) {
      q = query(evalsRef, where('teacherId', '==', profile.teacherId));
    } else if (isStudent && profile.studentId) {
      q = query(evalsRef, where('studentId', '==', profile.studentId));
    }

    if (!q) return;

    const unsubscribe = onSnapshot(q, (snap) => {
      setEvaluations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Evaluation)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, isTeacher, isStudent, profile.studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !instrument || !date) return;
    
    // Validate that at least one metric has a score greater than 0
    if (metrics.every(m => m.score === 0)) {
      alert("Por favor, avalie pelo menos uma métrica.");
      return;
    }

    setIsSubmitting(true);

    try {
      const student = students.find(s => s.id === selectedStudentId);
      if (!student) throw new Error("Student not found");

      const evaluationData = {
        studentId: student.id,
        studentName: student.name,
        teacherId: profile.teacherId || profile.uid,
        teacherName: profile.displayName || 'Professor',
        instrument,
        date,
        metrics: metrics.filter(m => m.name.trim() !== ''),
        notes,
        createdAt: serverTimestamp()
      };

      if (editingEvalId) {
        await updateDoc(doc(db, 'evaluations', editingEvalId), {
          studentId: student.id,
          studentName: student.name,
          instrument,
          date,
          metrics: metrics.filter(m => m.name.trim() !== ''),
          notes
        });
      } else {
        const docRef = await addDoc(collection(db, 'evaluations'), evaluationData);
        
        // Notify student asynchronously via Z-API (only on new evaluations)
        try {
          const fn = getFunctions();
          const notifyFn = httpsCallable(fn, 'notifyStudentEvaluation');
          notifyFn({ evaluationId: docRef.id, originUrl: window.location.origin }).catch(e => console.error('Erro na chamada Z-API:', e));
        } catch (err) {
          console.error('Erro ao iniciar trigger de notificação:', err);
        }
      }

      // Update student's last evaluation date if this one is newer or not set
      if (!student.lastEvaluationDate || date > student.lastEvaluationDate) {
        try {
          await updateDoc(doc(db, 'students', student.id), { lastEvaluationDate: date });
        } catch (err) {
          console.error('Erro ao atualizar data da ultima avaliacao do aluno', err);
        }
      }
      
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar avaliação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedStudentId('');
    setInstrument('');
    setDate(new Date().toISOString().split('T')[0]);
    setMetrics([...DEFAULT_METRICS]);
    setNotes('');
    setEditingEvalId(null);
  };

  const handleEdit = (evaluation: Evaluation) => {
    setSelectedStudentId(evaluation.studentId);
    setInstrument(evaluation.instrument);
    setDate(evaluation.date);
    setMetrics(evaluation.metrics.length > 0 ? evaluation.metrics : [...DEFAULT_METRICS]);
    setNotes(evaluation.notes || '');
    setEditingEvalId(evaluation.id);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!evaluationToDelete) return;
    try {
      await deleteDoc(doc(db, 'evaluations', evaluationToDelete.id));
      setEvaluationToDelete(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir avaliação.');
    }
  };

  const updateMetricScore = (index: number, score: number) => {
    const newMetrics = [...metrics];
    newMetrics[index].score = score;
    setMetrics(newMetrics);
  };

  const updateMetricName = (index: number, name: string) => {
    const newMetrics = [...metrics];
    newMetrics[index].name = name;
    setMetrics(newMetrics);
  };

  const addMetric = () => {
    setMetrics([...metrics, { name: '', score: 0 }]);
  };

  const removeMetric = (index: number) => {
    setMetrics(metrics.filter((_, i) => i !== index));
  };

  // Helper to suggest instruments when a student is selected
  useEffect(() => {
    if (selectedStudentId) {
      const student = students.find(s => s.id === selectedStudentId);
      if (student && student.enrollments.length > 0) {
        setInstrument(student.enrollments[0].instrument);
      }
    }
  }, [selectedStudentId, students]);

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
            <Award className="w-6 h-6 text-orange-500" /> Avaliações de Nivelamento
          </h2>
          <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
            {isStudent ? 'Acompanhe seu progresso e evolução nas aulas.' : 'Registre e acompanhe o progresso técnico e teórico dos alunos.'}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar aluno..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium text-sm"
            />
          </div>
          {(isAdmin || isTeacher) && (
            <button 
              onClick={() => { resetForm(); setShowForm(true); }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg hover:shadow-orange-500/25 active:scale-95 font-bold whitespace-nowrap"
            >
              <Plus className="w-5 h-5" /> Novo Boletim
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-3xl w-full shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setShowForm(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-6">
                  <Award className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-2xl font-bold display-font text-zinc-900">Nova Avaliação do Aluno</h3>
                <p className="text-zinc-500 text-sm mt-1">Preencha as métricas de evolução. Você pode alterar os nomes se desejar.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Aluno</label>
                    <select
                      required
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    >
                      <option value="" disabled>Selecione um aluno na lista</option>
                      {students.map(student => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Data</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Instrumento / Curso</label>
                  <input
                    type="text"
                    required
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                    placeholder="Ex: Violão Clássico"
                  />
                </div>

                <div className="bg-zinc-50/50 p-6 rounded-[24px] border border-zinc-200/60">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-zinc-900 display-font">Métricas de Evolução</h4>
                    <button type="button" onClick={addMetric} className="text-xs font-bold text-orange-500 flex items-center gap-1 hover:text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full">
                      <Plus className="w-3 h-3" /> Adicionar Métrica
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {metrics.map((metric, index) => (
                      <div key={index} className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm ring-1 ring-zinc-950/5 relative group">
                        <div className="flex-1 w-full md:w-auto">
                          <input
                            type="text"
                            value={metric.name}
                            onChange={(e) => updateMetricName(index, e.target.value)}
                            placeholder="Nome da métrica (Ex: Leitura Dinâmica)"
                            className="w-full bg-transparent border-b border-zinc-200 px-2 py-1 text-sm focus:outline-none focus:border-orange-500 font-medium text-zinc-800 placeholder:text-zinc-400"
                            required
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => updateMetricScore(index, star)}
                              className="focus:outline-none transform transition-transform hover:scale-110"
                            >
                              <Star className={`w-6 h-6 ${star <= metric.score ? 'fill-amber-400 text-amber-400' : 'text-zinc-200'}`} />
                            </button>
                          ))}
                        </div>
                        {metrics.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeMetric(index)}
                            className="absolute -top-2 -right-2 bg-red-100 text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Observações do Professor</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all h-24 resize-none"
                    placeholder="Deixe um comentário encorajador ou pontos de melhoria construtivos..."
                  />
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
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Avaliação'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {evaluations.filter(e => e.studentName.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-[32px] border border-dashed border-zinc-200 flex flex-col items-center">
            <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4">
              <Award className="w-8 h-8 text-orange-300" />
            </div>
            <p className="text-zinc-500 font-medium">{evaluations.length === 0 ? 'Nenhum boletim encontrado.' : 'Nenhum boletim encontrado para esta busca.'}</p>
            {isTeacher && evaluations.length === 0 && <p className="text-sm text-zinc-400 mt-1">Clique em "Novo Boletim" para registrar a evolução de um aluno.</p>}
          </div>
        ) : (
          evaluations.filter(e => e.studentName.toLowerCase().includes(searchQuery.toLowerCase())).map(evaluation => {
            const dateStr = new Date(evaluation.date + 'T12:00:00').toLocaleDateString('pt-BR');
            const averageScore = evaluation.metrics.reduce((acc, curr) => acc + curr.score, 0) / (evaluation.metrics.length || 1);
            
            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={evaluation.id}
                className="bg-white p-6 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/5 flex flex-col h-full group"
              >
                <div className="flex justify-between items-start mb-6 border-b border-zinc-100 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900 leading-tight flex items-center gap-2">
                       {evaluation.studentName}
                    </h3>
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1 font-medium bg-zinc-50 w-fit px-2 py-1 rounded-lg">
                      <Music2 className="w-3 h-3 text-orange-500" /> {evaluation.instrument}
                    </p>
                  </div>
                  {(isAdmin || (isTeacher && evaluation.teacherId === profile.teacherId)) && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(evaluation)}
                        className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                        title="Editar avaliação"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEvaluationToDelete(evaluation)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Excluir avaliação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 mb-6 flex-1">
                  {evaluation.metrics.map((metric, i) => (
                    <div key={i} className="flex justify-between items-center bg-zinc-50 px-4 py-2 rounded-xl">
                      <span className="text-sm font-medium text-zinc-700">{metric.name}</span>
                      <div className="flex items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} className={`w-3 h-3 ${star <= metric.score ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {evaluation.notes && (
                  <div className="bg-orange-50 p-4 rounded-2xl mb-6">
                    <p className="text-sm text-amber-900 italic line-clamp-3 relative">
                      <span className="text-xl leading-none text-orange-300 absolute -top-1 -left-1">"</span>
                      <span className="ml-2">{evaluation.notes}</span>
                      <span className="text-xl leading-none text-orange-300 absolute -bottom-2 right-0">"</span>
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs font-semibold text-zinc-500 bg-zinc-50/80 p-3 rounded-2xl border border-zinc-100 mt-auto">
                  <div className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {dateStr}</div>
                  <div className="flex items-center gap-1"><User className="w-3 h-3" /> Prof. {evaluation.teacherName.split(' ')[0]}</div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      <ConfirmModal
        isOpen={!!evaluationToDelete}
        onClose={() => setEvaluationToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Avaliação"
        message={`Tem certeza que deseja excluir o boletim de ${evaluationToDelete?.studentName}?`}
        confirmText="Excluir"
      />
    </div>
  );
}
