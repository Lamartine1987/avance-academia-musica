import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, db } from '../firebase';
import { UserProfile, Teacher, Instrument } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Plus, Trash2, X, Music, Check, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';

export default function Teachers({ profile }: { profile: UserProfile }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<string | null>(null);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    email: '',
    password: '',
    instruments: [] as string[],
    bio: '',
    role: 'teacher' as 'teacher' | 'admin',
    maxStudents: undefined as number | undefined
  });

  useEffect(() => {
    const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
      setTeachers(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'teachers');
    });

    const unsubInstruments = onSnapshot(collection(db, 'instruments'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Instrument));
      setInstruments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'instruments');
    });

    return () => {
      unsubTeachers();
      unsubInstruments();
    };
  }, []);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeacher.instruments.length === 0) {
      alert('Selecione pelo menos um instrumento.');
      return;
    }
    
    if (!editingTeacherId && !newTeacher.password) {
      alert('Defina uma senha para o professor.');
      return;
    }

    try {
      if (editingTeacherId) {
        await updateDoc(doc(db, 'teachers', editingTeacherId), {
          name: newTeacher.name,
          email: newTeacher.email,
          instruments: newTeacher.instruments,
          bio: newTeacher.bio,
          role: newTeacher.role
        });

        // Update user document if it exists
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('teacherId', '==', editingTeacherId));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          await updateDoc(doc(db, 'users', userDoc.id), {
            displayName: newTeacher.name,
            role: newTeacher.role
          });
        }
      } else {
        // Create user with secondary app
        const secondaryApp = initializeApp(firebaseConfig, "Secondary");
        const secondaryAuth = getAuth(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newTeacher.email, newTeacher.password);
        const newUid = userCredential.user.uid;
        await signOut(secondaryAuth);

        // Create teacher document
        const teacherRef = await addDoc(collection(db, 'teachers'), {
          name: newTeacher.name,
          email: newTeacher.email,
          instruments: newTeacher.instruments,
          bio: newTeacher.bio,
          role: newTeacher.role,
          createdAt: serverTimestamp()
        });

        // Create user document
        await setDoc(doc(db, 'users', newUid), {
          uid: newUid,
          email: newTeacher.email,
          displayName: newTeacher.name,
          role: newTeacher.role,
          teacherId: teacherRef.id,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingTeacherId(null);
      setNewTeacher({ name: '', email: '', password: '', instruments: [], bio: '', role: 'teacher' });
    } catch (error: any) {
      handleFirestoreError(error, editingTeacherId ? OperationType.UPDATE : OperationType.CREATE, 'teachers');
      if (error.message) alert(error.message);
    }
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setNewTeacher({
      name: teacher.name,
      email: teacher.email || '',
      password: '',
      instruments: teacher.instruments,
      bio: teacher.bio || '',
      role: teacher.role || 'teacher',
      maxStudents: teacher.maxStudents
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingTeacherId(null);
    setNewTeacher({ name: '', email: '', password: '', instruments: [], bio: '', role: 'teacher', maxStudents: undefined });
    setIsModalOpen(true);
  };

  const toggleInstrument = (name: string) => {
    const current = newTeacher.instruments;
    if (current.includes(name)) {
      setNewTeacher({ ...newTeacher, instruments: current.filter(i => i !== name) });
    } else {
      setNewTeacher({ ...newTeacher, instruments: [...current, name] });
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    setTeacherToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!teacherToDelete) return;
    try {
      await deleteDoc(doc(db, 'teachers', teacherToDelete));
      setTeacherToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `teachers/${teacherToDelete}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {profile.role === 'admin' && (
          <button 
            onClick={openAddModal}
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all font-bold shadow-lg shadow-orange-500/25 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Novo Professor
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teachers.map(teacher => (
          <div key={teacher.id} className="bg-white p-8 rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] flex flex-col items-center text-center relative group hover:-translate-y-1 transition-all duration-300">
            {profile.role === 'admin' && (
              <div className="absolute top-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handleEditTeacher(teacher)}
                  className="text-zinc-300 hover:text-black transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeleteTeacher(teacher.id)}
                  className="text-zinc-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="w-20 h-20 bg-zinc-100 rounded-full mb-6 flex items-center justify-center">
              <Music className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-bold text-black display-font">{teacher.name}</h3>
            {teacher.role === 'admin' && (
              <span className="bg-black text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded-full mb-2 font-semibold">
                Administrador
              </span>
            )}
            <p className="text-orange-500 text-sm font-medium mb-4">{teacher.instruments.join(', ')}</p>
            <p className="text-zinc-500 text-xs line-clamp-2 mb-6">{teacher.bio || 'Sem biografia disponível.'}</p>
            <button className="w-full py-3 bg-zinc-50 text-black rounded-2xl text-sm font-bold hover:bg-zinc-100 transition-all">
              Ver Perfil
            </button>
          </div>
        ))}
        {teachers.length === 0 && (
          <div className="col-span-full py-20 text-center text-zinc-400 italic">
            Nenhum professor cadastrado.
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold display-font">{editingTeacherId ? 'Editar Professor' : 'Novo Professor'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddTeacher} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Nome Completo</label>
                <input 
                  required
                  type="text" 
                  value={newTeacher.name}
                  onChange={e => setNewTeacher({...newTeacher, name: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">E-mail (para acesso ao sistema)</label>
                <input 
                  type="email" 
                  value={newTeacher.email}
                  onChange={e => setNewTeacher({...newTeacher, email: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  placeholder="exemplo@email.com"
                />
              </div>
              {!editingTeacherId && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Senha Inicial</label>
                  <input 
                    required
                    type="password" 
                    value={newTeacher.password}
                    onChange={e => setNewTeacher({...newTeacher, password: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Nível de Acesso</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="role" 
                      value="teacher"
                      checked={newTeacher.role === 'teacher'}
                      onChange={() => setNewTeacher({...newTeacher, role: 'teacher'})}
                      className="text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm text-zinc-700 font-medium">Professor</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="role" 
                      value="admin"
                      checked={newTeacher.role === 'admin'}
                      onChange={() => setNewTeacher({...newTeacher, role: 'admin'})}
                      className="text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm text-zinc-700 font-medium">Administrador</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Lotação Máxima por Horário (Opcional)</label>
                <input 
                  type="number" 
                  min="1"
                  value={newTeacher.maxStudents || ''}
                  onChange={e => setNewTeacher({...newTeacher, maxStudents: e.target.value ? parseInt(e.target.value) : undefined})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                  placeholder="Ex: 2 (Padrão da escola)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-4">Instrumentos que Ensinam</label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                  {instruments.map(instrument => (
                    <button
                      key={instrument.id}
                      type="button"
                      onClick={() => toggleInstrument(instrument.name)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2",
                        newTeacher.instruments.includes(instrument.name)
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-white text-zinc-500 border-zinc-100 hover:border-zinc-300"
                      )}
                    >
                      {newTeacher.instruments.includes(instrument.name) && <Check className="w-3 h-3" />}
                      {instrument.name}
                    </button>
                  ))}
                  {instruments.length === 0 && (
                    <p className="text-xs text-zinc-400 italic">Cadastre instrumentos na aba "Instrumentos" primeiro.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Biografia</label>
                <textarea 
                  rows={3}
                  value={newTeacher.bio}
                  onChange={e => setNewTeacher({...newTeacher, bio: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all resize-none"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98]"
              >
                {editingTeacherId ? 'Salvar Alterações' : 'Cadastrar Professor'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Excluir Professor"
        message="Tem certeza que deseja excluir este professor? Esta ação não pode ser desfeita."
        confirmText="Excluir"
      />
    </div>
  );
}
