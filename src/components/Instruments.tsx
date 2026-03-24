import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Instrument } from '../types';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Plus, Trash2, X, Music2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function Instruments({ profile }: { profile: UserProfile }) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [instrumentToDelete, setInstrumentToDelete] = useState<string | null>(null);
  const [newInstrument, setNewInstrument] = useState({
    name: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'instruments'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Instrument));
      setInstruments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'instruments');
    });

    return () => unsubscribe();
  }, []);

  const handleAddInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'instruments'), {
        name: newInstrument.name,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewInstrument({ name: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'instruments');
    }
  };

  const handleDeleteInstrument = async (id: string) => {
    setInstrumentToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!instrumentToDelete) return;
    try {
      await deleteDoc(doc(db, 'instruments', instrumentToDelete));
      setInstrumentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `instruments/${instrumentToDelete}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {profile.role === 'admin' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:from-orange-600 hover:to-amber-600 transition-all font-bold shadow-lg shadow-orange-500/25 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Novo Instrumento
          </button>
        )}
      </div>

      <div className="bg-white rounded-[32px] ring-1 ring-zinc-950/5 shadow-xl shadow-black/[0.03] overflow-hidden flex flex-col">
        <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h3 className="text-xl font-medium">Instrumentos Ensinados</h3>
          <span className="text-zinc-400 text-sm">{instruments.length} instrumentos cadastrados</span>
        </div>
        <div className="px-8 pb-8 overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead>
              <tr className="text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-50">
                <th className="py-4 font-medium">Nome do Instrumento</th>
                <th className="py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {instruments.map(instrument => (
                <tr key={instrument.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/80 transition-colors group">
                  <td className="py-5 font-bold text-black flex items-center gap-3">
                    <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
                      <Music2 className="w-4 h-4 text-zinc-400" />
                    </div>
                    {instrument.name}
                  </td>
                  <td className="py-5 text-right">
                    {profile.role === 'admin' && (
                      <button 
                        onClick={() => handleDeleteInstrument(instrument.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-zinc-400 italic">
                    Nenhum instrumento cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl shadow-black/10 ring-1 ring-zinc-950/5">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold display-font">Novo Instrumento</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddInstrument} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Nome do Instrumento</label>
                <input 
                  required
                  type="text" 
                  placeholder="Ex: Piano, Violino, Saxofone"
                  value={newInstrument.name}
                  onChange={e => setNewInstrument({...newInstrument, name: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98]"
              >
                Cadastrar Instrumento
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Excluir Instrumento"
        message="Tem certeza que deseja excluir este instrumento? Esta ação não pode ser desfeita."
        confirmText="Excluir"
      />
    </div>
  );
}
