import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Users, 
  Music, 
  Calendar, 
  LogOut, 
  Music2, 
  Loader2, 
  Plus, 
  Search, 
  UserCircle,
  Menu,
  X,
  Wallet,
  MessageSquareText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { UserProfile, UserRole } from './types';
import { cn } from './lib/utils';

import { ErrorBoundary } from './components/ErrorBoundary';

// Components
import Dashboard from './components/Dashboard';
import Students from './components/Students';
import Teachers from './components/Teachers';
import Schedule from './components/Schedule';
import Instruments from './components/Instruments';
import Profile from './components/Profile';
import Financial from './components/Financial';
import Communication from './components/Communication';

type View = 'dashboard' | 'students' | 'teachers' | 'schedule' | 'instruments' | 'profile' | 'financial' | 'communication';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const existingProfile = profileSnap.data() as UserProfile;
          // If profile name is empty but firebase user has it, update it
          if (!existingProfile.displayName && firebaseUser.displayName) {
            const updatedProfile = { ...existingProfile, displayName: firebaseUser.displayName };
            await setDoc(profileRef, updatedProfile, { merge: true });
            setProfile(updatedProfile);
          } else {
            setProfile(existingProfile);
          }
        } else {
          // Check if user is a teacher
          const teachersRef = collection(db, 'teachers');
          const teacherQuery = query(teachersRef, where('email', '==', firebaseUser.email));
          const teacherSnap = await getDocs(teacherQuery);
          
          let role: UserRole = 'student';
          let teacherId: string | undefined = undefined;
          
          if (firebaseUser.email === 'lamartinecezar3@gmail.com') {
            role = 'admin';
          } else if (!teacherSnap.empty) {
            role = 'teacher';
            teacherId = teacherSnap.docs[0].id;
          }

          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            role,
            createdAt: serverTimestamp(),
          };
          
          if (teacherId) {
            newProfile.teacherId = teacherId;
          }

          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (profile && profile.role === 'teacher' && currentView !== 'schedule') {
      setCurrentView('schedule');
    }
  }, [profile, currentView]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = 'Ocorreu um erro na autenticação.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'E-mail ou senha incorretos.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      }
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tl from-emerald-500/10 to-teal-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-md w-full bg-white/70 backdrop-blur-xl rounded-[32px] p-12 shadow-2xl shadow-black/5 ring-1 ring-zinc-950/5 z-10"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/20">
              <Music2 className="w-8 h-8 text-orange-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-black mb-2 display-font">Avanca</h1>
            <p className="text-zinc-500 leading-relaxed text-sm uppercase tracking-widest font-semibold">
              Academia de Música
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <p className="text-red-500 text-xs mt-2 ml-1">{authError}</p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl py-4 font-bold hover:from-orange-600 hover:to-amber-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-6 shadow-lg shadow-orange-500/25 active:scale-[0.98]"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'schedule', label: 'Agenda', icon: Calendar, roles: ['admin', 'teacher'] },
    { id: 'students', label: 'Alunos', icon: Users, roles: ['admin'] },
    { id: 'teachers', label: 'Professores', icon: Music, roles: ['admin'] },
    { id: 'instruments', label: 'Instrumentos', icon: Music2, roles: ['admin'] },
    { id: 'financial', label: 'Financeiro', icon: Wallet, roles: ['admin'] },
    { id: 'communication', label: 'Comunicação', icon: MessageSquareText, roles: ['admin'] },
  ].filter(item => item.roles.includes(profile.role));

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-zinc-950 text-white p-4 flex items-center justify-between sticky top-0 z-40 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold display-font">Avanca</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:sticky top-0 left-0 h-screen w-72 bg-zinc-950 text-zinc-50 flex flex-col p-6 z-50 transition-transform duration-300 ease-in-out md:translate-x-0 border-r border-white/5 shadow-2xl shadow-black/50",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between mb-12 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Music2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight display-font leading-none">Avanca</span>
              <span className="text-[10px] uppercase tracking-widest text-orange-500 font-semibold mt-1">Academia</span>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-zinc-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.98]",
                currentView === item.id 
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20" 
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <button 
            onClick={() => {
              setCurrentView('profile');
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-xl hover:bg-white/5 transition-all text-left active:scale-[0.98]"
          >
            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-6 h-6 text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
              <p className="text-xs text-zinc-400 truncate capitalize">{profile.role}</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-orange-500 hover:bg-orange-500/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full p-4 md:p-10 relative">
        <header className="sticky top-0 z-30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 md:mb-12 bg-zinc-50/80 backdrop-blur-xl pb-4 pt-2 -mx-4 md:-mx-10 px-4 md:px-10 border-b border-zinc-200/50">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold display-font tracking-tight text-black capitalize">
              {currentView === 'profile' ? 'Seu Perfil' : navItems.find(i => i.id === currentView)?.label}
            </h2>
            <p className="text-zinc-500 mt-1 text-sm md:text-base">Bem-vindo de volta, {user.displayName?.split(' ')[0]}.</p>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="w-full md:w-64 bg-white ring-1 ring-zinc-950/5 shadow-sm rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all"
              />
            </div>
            <button className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-3 rounded-2xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 shrink-0 active:scale-[0.96]">
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {currentView === 'dashboard' && profile.role === 'admin' && <Dashboard profile={profile} />}
            {currentView === 'students' && profile.role === 'admin' && <Students profile={profile} />}
            {currentView === 'teachers' && profile.role === 'admin' && <Teachers profile={profile} />}
            {currentView === 'schedule' && (profile.role === 'admin' || profile.role === 'teacher') && <Schedule profile={profile} />}
            {currentView === 'instruments' && profile.role === 'admin' && <Instruments profile={profile} />}
            {currentView === 'financial' && profile.role === 'admin' && <Financial />}
            {currentView === 'communication' && profile.role === 'admin' && <Communication />}
            {currentView === 'profile' && <Profile user={user} profile={profile} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
    </ErrorBoundary>
  );
}
