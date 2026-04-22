import React, { useState, useEffect, useRef } from 'react';
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
  getDocs,
  onSnapshot,
  orderBy,
  limit
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
  MessageSquareText,
  Bell,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Award,
  Settings,
  Folder
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { UserProfile, UserRole } from './types';
import { cn } from './lib/utils';

import { ErrorBoundary } from './components/ErrorBoundary';

// Components
import ForcePasswordChange from './components/ForcePasswordChange';
import Dashboard from './components/Dashboard';
import Students from './components/Students';
import Teachers from './components/Teachers';
import Schedule from './components/Schedule';
import Instruments from './components/Instruments';
import Profile from './components/Profile';
import Financial from './components/Financial';
import Communication from './components/Communication';
import ReschedulePortal from './components/ReschedulePortal';
import Materials from './components/Materials';
import Evaluations from './components/Evaluations';
import ClassDiary from './components/ClassDiary';
import EnrollmentPortal from './components/EnrollmentPortal';
import PixPaymentPortal from './components/PixPaymentPortal';
import Documents from './components/Documents';
import LandingPage from './components/LandingPage';

type View = 'dashboard' | 'students' | 'teachers' | 'schedule' | 'instruments' | 'profile' | 'financial' | 'communication' | 'materials' | 'evaluations' | 'diary' | 'documents';

export default function App() {
  const pathname = window.location.pathname;
  if (pathname.startsWith('/reposicao/')) {
    const token = pathname.replace('/reposicao/', '');
    return <ReschedulePortal token={token} />;
  }

  if (pathname.startsWith('/matricula/')) {
    const token = pathname.replace('/matricula/', '');
    return <EnrollmentPortal token={token} />;
  }

  if (pathname.startsWith('/pagamento/')) {
    const paymentId = pathname.replace('/pagamento/', '');
    return <PixPaymentPortal id={paymentId} />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [diaryInitialLesson, setDiaryInitialLesson] = useState<{ studentId: string, lessonId: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopMenuExpanded, setIsDesktopMenuExpanded] = useState(true);
  const [showLogin, setShowLogin] = useState(window.location.hash === '#login');
  
  useEffect(() => {
    const onHashChange = () => setShowLogin(window.location.hash === '#login');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Reset password states
  const [isResetting, setIsResetting] = useState(false);
  const [resetCpf, setResetCpf] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  
  // Pending approvals counter
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [pendingDocsCount, setPendingDocsCount] = useState(0);
  const lastPendingCount = useRef(-1);
  const lastUnreadCount = useRef(-1);
  const lastPendingDocsCount = useRef(-1);

  const applyCpfMask = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  
  // Derived state to ensure real-time synchronization with notifications array
  const unreadCount = notifications.filter((n) => !n.read).length;

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
    if (profile && profile.role === 'teacher' && !['schedule', 'profile', 'materials', 'evaluations'].includes(currentView)) {
      setCurrentView('schedule');
    }
    if (profile && profile.role === 'student' && !['schedule', 'financial', 'profile', 'materials', 'evaluations', 'documents'].includes(currentView)) {
      setCurrentView('schedule');
    }
  }, [profile, currentView]);

  useEffect(() => {
    if (!profile || profile.role !== 'admin') {
      setNotifications([]);
      return;
    }

    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(notifs);
      
      const currentUnread = notifs.filter((n: any) => !n.read).length;
      if (lastUnreadCount.current !== -1 && currentUnread > lastUnreadCount.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
      }
      lastUnreadCount.current = currentUnread;
    });

    const pendingQ = query(collection(db, 'students'), where('status', '==', 'pending_approval'));
    const pendingUnsubscribe = onSnapshot(pendingQ, (snap) => {
       const count = snap.docs.length;
       if (lastPendingCount.current !== -1 && count > lastPendingCount.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
       }
       lastPendingCount.current = count;
       setPendingApprovalsCount(count);
    });

    const pendingDocsQ = query(collection(db, 'document_requests'), where('status', '==', 'pending'));
    const pendingDocsUnsubscribe = onSnapshot(pendingDocsQ, (snap) => {
       const count = snap.docs.length;
       if (lastPendingDocsCount.current !== -1 && count > lastPendingDocsCount.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
       }
       lastPendingDocsCount.current = count;
       setPendingDocsCount(count);
    });

    const settingsUnsubscribe = onSnapshot(doc(db, 'settings', 'school'), (docSnap) => {
      if (docSnap.exists()) {
        setSchoolSettings(docSnap.data());
      }
    });

    return () => {
      unsubscribe();
      pendingUnsubscribe();
      pendingDocsUnsubscribe();
      settingsUnsubscribe();
    };
  }, [profile]);

  const markNotificationsRead = async () => {
    if (unreadCount === 0) return;
    notifications.filter(n => !n.read).forEach((n) => {
      setDoc(doc(db, 'notifications', n.id), { read: true }, { merge: true }).catch(console.error);
    });
  };

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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);
    setResetLoading(true);

    try {
      const fn = getFunctions();
      const requestPasswordResetWhatsApp = httpsCallable(fn, 'requestPasswordResetWhatsApp');
      await requestPasswordResetWhatsApp({ cpf: resetCpf });
      setResetSuccess(true);
    } catch (err: any) {
      console.error(err);
      setResetError(err.message || 'Erro ao tentar recuperar a senha.');
    } finally {
      setResetLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user || !profile) {
    if (!showLogin) {
      return <LandingPage onLoginClick={() => window.location.hash = '#login'} />;
    }

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
            <h1 className="text-3xl font-bold tracking-tight text-black mb-2 display-font">Avance</h1>
            <p className="text-zinc-500 leading-relaxed text-sm uppercase tracking-widest font-semibold">
              Academia de Música
            </p>
          </div>

          {isResetting ? (
            <div className="space-y-4">
              {resetSuccess ? (
                <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl border border-emerald-100/50 text-sm text-center">
                  <p className="font-bold mb-1">Sucesso!</p>
                  <p>Iniciamos a recuperação da sua conta. Se o CPF for válido e você possuir WhatsApp cadastrado, uma senha provisória chegará no seu número em até 2 minutos.</p>
                  <button 
                    onClick={() => {
                      setIsResetting(false);
                      setResetSuccess(false);
                      setResetCpf('');
                    }}
                    className="mt-4 text-emerald-700 font-bold hover:underline"
                  >
                    Voltar para o Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1 ml-1">Criei minha conta com CPF</label>
                    <input
                      type="text"
                      required
                      value={resetCpf}
                      onChange={(e) => setResetCpf(applyCpfMask(e.target.value))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  
                  {resetError && (
                    <p className="text-red-500 text-xs mt-2 ml-1">{resetError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={resetLoading || resetCpf.length < 14}
                    className="w-full bg-zinc-900 text-white rounded-2xl py-4 font-bold hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-6 shadow-lg shadow-black/25 active:scale-[0.98]"
                  >
                    {resetLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Recuperar via WhatsApp'
                    )}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsResetting(false)}
                    className="w-full text-zinc-400 font-medium text-sm hover:text-zinc-600 py-2"
                  >
                    Voltar
                  </button>
                </form>
              )}
            </div>
          ) : (
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
              
              <div className="text-center pt-4 flex flex-col gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsResetting(true)}
                  className="text-orange-500/80 hover:text-orange-600 text-sm font-medium transition-colors"
                >
                  Esqueci minha senha
                </button>
                <button 
                  type="button" 
                  onClick={() => window.location.hash = ''}
                  className="text-zinc-400 hover:text-zinc-600 text-sm font-medium transition-colors"
                >
                  Voltar à Página Inicial
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'schedule', label: 'Minha Agenda', icon: Calendar, roles: ['admin', 'teacher', 'student'] },
    { id: 'students', label: 'Alunos', icon: Users, roles: ['admin'] },
    { id: 'teachers', label: 'Professores', icon: Music, roles: ['admin'] },
    { id: 'diary', label: 'Diário de Aula', icon: BookOpen, roles: ['admin', 'teacher'] },
    { id: 'instruments', label: 'Instrumentos', icon: Music2, roles: ['admin'] },
    { id: 'materials', label: 'Materiais', icon: BookOpen, roles: ['admin', 'teacher', 'student'] },
    { id: 'documents', label: 'Documentos', icon: Folder, roles: ['admin', 'student'] },
    { id: 'evaluations', label: 'Avaliações', icon: Award, roles: ['admin', 'teacher', 'student'] },
    { id: 'financial', label: 'Meu Histórico Financeiro', icon: Wallet, roles: ['admin', 'student'] },
    { id: 'communication', label: 'Configurações', icon: Settings, roles: ['admin'] },
  ].filter(item => item.roles.includes(profile.role));

  return (
    <ErrorBoundary>
      {profile.mustChangePassword ? (
        <ForcePasswordChange user={user} setProfile={setProfile} />
      ) : null}
      
      <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-zinc-950 text-white p-4 flex items-center justify-between sticky top-0 z-40 border-b border-white/5 print:hidden">
        <div className="flex items-center gap-2">
          {schoolSettings?.logoUrl ? (
            <img src={schoolSettings.logoUrl} alt="Logo" className="h-8 object-contain bg-white rounded-md p-1" />
          ) : (
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <Music2 className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="text-lg font-bold display-font uppercase truncate">{schoolSettings?.tradingName || 'Avance'}</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:sticky top-0 left-0 h-screen bg-zinc-950 text-zinc-50 flex flex-col p-4 md:p-6 z-50 transition-all duration-300 ease-in-out border-r border-white/5 shadow-2xl shadow-black/50 overflow-visible shrink-0 print:hidden",
        isMobileMenuOpen ? "translate-x-0 w-72" : "-translate-x-full md:translate-x-0",
        !isMobileMenuOpen && (isDesktopMenuExpanded ? "md:w-72" : "md:w-24")
      )}>
        {/* Desktop Toggle Button */}
        <button 
          onClick={() => setIsDesktopMenuExpanded(!isDesktopMenuExpanded)} 
          className="hidden md:flex absolute -right-4 top-8 w-8 h-8 bg-zinc-800 text-white rounded-full items-center justify-center ring-4 ring-zinc-50 hover:bg-orange-500 transition-colors z-50"
        >
          {isDesktopMenuExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className={cn("flex items-center justify-between mb-12", isDesktopMenuExpanded ? "px-2" : "px-0 md:justify-center")}>
          <div className="flex items-center gap-3">
            {schoolSettings?.logoUrl ? (
              <img src={schoolSettings.logoUrl} alt="Logo" className="w-10 h-10 object-contain bg-white rounded-xl p-1 shrink-0 shadow-lg" />
            ) : (
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                <Music2 className="w-6 h-6 text-white" />
              </div>
            )}
            <div className={cn("flex flex-col flex-1 min-w-0 justify-center", !isDesktopMenuExpanded && "md:hidden")}>
              <span className="text-xl font-bold tracking-tight display-font leading-none uppercase truncate">
                {schoolSettings?.tradingName?.split(' ')[0] || 'AVANCE'}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-orange-500 font-semibold mt-1 truncate">
                {schoolSettings?.tradingName?.split(' ').length > 1 
                  ? schoolSettings?.tradingName.split(' ').slice(1).join(' ') 
                  : 'ACADEMIA DE MÚSICA'}
              </span>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-zinc-400 hover:text-white shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                setIsMobileMenuOpen(false);
              }}
              title={!isDesktopMenuExpanded ? item.label : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.98]",
                currentView === item.id 
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20" 
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
                !isDesktopMenuExpanded && "md:justify-center md:px-0"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className={cn("truncate", !isDesktopMenuExpanded && "md:hidden")}>{item.label}</span>
              {item.id === 'students' && pendingApprovalsCount > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-sm shadow-orange-500/50">
                  {pendingApprovalsCount}
                </span>
              )}
              {item.id === 'documents' && pendingDocsCount > 0 && profile?.role === 'admin' && (
                <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-sm shadow-blue-500/50">
                  {pendingDocsCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <button 
            onClick={() => {
              setCurrentView('profile');
              setIsMobileMenuOpen(false);
            }}
            title={!isDesktopMenuExpanded ? "Meu Perfil" : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-xl hover:bg-white/5 transition-all text-left active:scale-[0.98]",
              !isDesktopMenuExpanded && "md:justify-center md:px-0"
            )}
          >
            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center overflow-hidden shrink-0">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-6 h-6 text-zinc-400 shrink-0" />
              )}
            </div>
            <div className={cn("flex-1 min-w-0", !isDesktopMenuExpanded && "md:hidden")}>
              <p className="text-sm font-medium text-white truncate">{profile?.displayName || user.displayName || 'Usuário'}</p>
              <p className="text-xs text-zinc-400 truncate capitalize">{profile.role}</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            title={!isDesktopMenuExpanded ? "Sair" : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-orange-500 hover:bg-orange-500/10 transition-all",
              !isDesktopMenuExpanded && "md:justify-center md:px-0"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={cn(!isDesktopMenuExpanded && "md:hidden")}>Sair</span>
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
      <main className="flex-1 overflow-y-auto w-full p-4 md:p-10 relative print:overflow-visible print:p-0 print:m-0">
        <header className="sticky top-0 z-30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 md:mb-12 bg-zinc-50/80 backdrop-blur-xl pb-4 pt-2 -mx-4 md:-mx-10 px-4 md:px-10 border-b border-zinc-200/50 print:hidden">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold display-font tracking-tight text-black capitalize">
              {currentView === 'profile' ? 'Seu Perfil' : navItems.find(i => i.id === currentView)?.label}
            </h2>
            <p className="text-zinc-500 mt-1 text-sm md:text-base">Bem-vindo de volta, {(profile?.displayName || user.displayName || '').split(' ')[0]}.</p>
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

            {profile.role === 'admin' && (
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    if (!showNotifications) markNotificationsRead();
                  }}
                  className="relative p-3 rounded-2xl bg-white ring-1 ring-zinc-950/5 hover:bg-zinc-50 transition-all text-zinc-600 shadow-sm outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <Bell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                  )}
                </button>

                {/* Dropdown Notificacoes */}
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-[24px] shadow-2xl ring-1 ring-zinc-950/5 overflow-hidden z-50 text-left backdrop-blur-xl"
                    >
                      <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                        <h3 className="font-bold text-zinc-900">Notificações</h3>
                      </div>
                      <div className="max-h-[70vh] overflow-y-auto w-full">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
                            <Bell className="w-6 h-6 text-zinc-300" />
                            Nenhuma notificação nova.
                          </div>
                        ) : (
                          notifications.map(notif => (
                            <div key={notif.id} className={`p-4 border-b border-zinc-50 hover:bg-zinc-50 transition-colors ${!notif.read ? 'bg-orange-50/20' : ''}`}>
                              <p className="font-bold text-sm text-zinc-900 mb-1 leading-tight">{notif.title}</p>
                              <p className="text-xs text-zinc-600 leading-relaxed">{notif.message}</p>
                              <span className="text-[10px] text-zinc-400 mt-2 block font-medium">
                                {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString('pt-BR') : 'Agora'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
            {currentView === 'schedule' && (profile.role === 'admin' || profile.role === 'teacher' || profile.role === 'student') && <Schedule profile={profile} onNavigateToDiary={(studentId, lessonId) => { setDiaryInitialLesson({ studentId, lessonId }); setCurrentView('diary'); }} />}
            {currentView === 'diary' && (profile.role === 'admin' || profile.role === 'teacher') && <ClassDiary profile={profile} initialStudentId={diaryInitialLesson?.studentId} initialLessonId={diaryInitialLesson?.lessonId} />}
            {currentView === 'instruments' && profile.role === 'admin' && <Instruments profile={profile} />}
            {currentView === 'financial' && (profile.role === 'admin' || profile.role === 'student') && <Financial profile={profile} />}
            {currentView === 'communication' && profile.role === 'admin' && <Communication />}
            {currentView === 'materials' && <Materials profile={profile} />}
            {currentView === 'documents' && (profile.role === 'admin' || profile.role === 'student') && <Documents profile={profile} />}
            {currentView === 'evaluations' && <Evaluations profile={profile} />}
            {currentView === 'profile' && <Profile user={user} profile={profile} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
    </ErrorBoundary>
  );
}
