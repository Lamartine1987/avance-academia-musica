import React, { useState } from 'react';
import { updatePassword, signOut, User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { KeyRound, ShieldCheck, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';

interface ForcePasswordChangeProps {
  user: User;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

export default function ForcePasswordChange({ user, setProfile }: ForcePasswordChangeProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (newPassword.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    try {
      await updatePassword(user, newPassword);
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { mustChangePassword: false });
      
      setProfile(prev => prev ? { ...prev, mustChangePassword: false } : null);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setError('Por favor, saia e faça login novamente antes de trocar a senha.');
      } else {
        setError('Não foi possível alterar a senha. Tente novamente mais tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 min-h-screen bg-black/80 flex items-center justify-center p-4 md:p-6 z-[100] backdrop-blur-md overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-500 to-amber-500" />
        
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-6">
            <ShieldCheck className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold display-font text-zinc-900 mb-2">Segurança Avance</h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Bem-vindo ao Portal do Aluno! Como este é seu primeiro acesso, é obrigatório cadastrar uma senha pessoal e segura.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-zinc-400" /> Nova Senha
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              placeholder="Sua senha secreta"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-zinc-400" /> Confirmar Nova Senha
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              placeholder="Repita a senha"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-medium ml-1">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl py-4 font-bold hover:from-orange-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Nova Senha'}
          </button>
        </form>

        <button 
          type="button"
          onClick={() => signOut(auth)}
          className="w-full mt-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 transition-colors font-medium"
        >
          Sair da Conta
        </button>
      </motion.div>
    </div>
  );
}
