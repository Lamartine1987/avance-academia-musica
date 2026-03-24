import React, { useState } from 'react';
import { User, updateProfile, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { UserCircle, Save, Loader2, Key, Mail } from 'lucide-react';

interface ProfileProps {
  user: User;
  profile: UserProfile;
}

export default function Profile({ user, profile }: ProfileProps) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      if (displayName !== user.displayName) {
        await updateProfile(user, { displayName });
        
        // Update in Firestore
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { displayName });
        
        // If it's a teacher, also update the teacher document name
        if (profile.role === 'teacher' && profile.teacherId) {
          const teacherRef = doc(db, 'teachers', profile.teacherId);
          await updateDoc(teacherRef, { name: displayName });
        }
      }

      if (newPassword) {
        await updatePassword(user, newPassword);
        setNewPassword('');
      }

      setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      let errorMsg = 'Erro ao atualizar perfil.';
      if (error.code === 'auth/requires-recent-login') {
        errorMsg = 'Para alterar a senha, você precisa fazer login novamente.';
      }
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-[32px] p-8 md:p-10 shadow-xl shadow-black/5 ring-1 ring-zinc-950/5">
        <div className="flex items-center gap-6 mb-10">
          <div className="w-24 h-24 bg-zinc-100 rounded-3xl flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            {user.photoURL ? (
              <img src={user.photoURL} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-12 h-12 text-zinc-300" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-black display-font">{displayName || 'Usuário'}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-semibold uppercase tracking-wider">
                {profile.role}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-zinc-400" />
                Nome de Exibição
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                placeholder="Seu nome"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Mail className="w-4 h-4 text-zinc-400" />
                E-mail
              </label>
              <input
                type="email"
                value={user.email || ''}
                readOnly
                disabled
                className="w-full bg-zinc-100 border border-zinc-200 rounded-2xl px-4 py-3 text-sm text-zinc-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-100">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Key className="w-4 h-4 text-zinc-400" />
                Nova Senha
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full md:w-1/2 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                placeholder="Deixe em branco para não alterar"
              />
              <p className="text-xs text-zinc-500 ml-1">Para sua segurança, alterar a senha pode exigir um novo login.</p>
            </div>
          </div>

          {message.text && (
            <div className={`p-4 rounded-2xl text-sm font-medium ${
              message.type === 'success' 
                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20' 
                : 'bg-red-50 text-red-600 ring-1 ring-red-500/20'
            }`}>
              {message.text}
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-8 py-3 rounded-2xl font-bold hover:from-orange-600 hover:to-amber-600 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-orange-500/25 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
