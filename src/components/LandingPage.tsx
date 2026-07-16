import React, { useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { Music2, ChevronRight, UserCircle, Play, Mic2, Speaker, Sparkles, X, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function LandingPage({ onLoginClick, schoolSettings }: { onLoginClick: () => void, schoolSettings?: any }) {
  const { scrollYProgress } = useScroll();

  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  const whatsappLink = `https://wa.me/55${(schoolSettings?.phone || '81999999999').replace(/\D/g, '')}`;

  // Parallax constraints for Hero
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, 80]);

  return (
    <div className="bg-black text-white min-h-screen overflow-x-hidden selection:bg-orange-500 selection:text-white font-sans">
      
      {/* Global Navigation (Apple Style Nav) */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#161617]/80 backdrop-blur-md border-b border-white/10 transition-all text-xs font-medium tracking-wide">
        <div className="max-w-[1000px] mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white hover:text-orange-500 transition-colors cursor-pointer">
            {schoolSettings?.logoUrl ? (
              <img src={schoolSettings.logoUrl} alt="Logo" className="h-6 object-contain brightness-0 invert" />
            ) : (
              <Music2 className="w-4 h-4" />
            )}
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-zinc-300">
            <a href="#cursos" className="hover:text-white transition-colors cursor-pointer">Cursos</a>
            <a href="#metodologia" className="hover:text-white transition-colors cursor-pointer">Metodologia</a>
            <a href="#estudios" className="hover:text-white transition-colors cursor-pointer">Estrutura</a>
            <a href="#contato" className="hover:text-white transition-colors cursor-pointer">Matrículas</a>
          </div>

          <div className="flex items-center">
            <button 
              onClick={onLoginClick}
              className="text-zinc-300 hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
              title="Acessar painel do aluno e sistema administrativo"
            >
              <UserCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Sistema</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Sub Navigation (Product Title Nav) */}
      <div className="sticky top-12 z-40 bg-black/80 backdrop-blur-md border-b border-white/10 hidden md:block">
        <div className="max-w-[1000px] mx-auto px-4 h-14 flex items-center justify-end text-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.open(`https://wa.me/55${(schoolSettings?.phone || '81999999999').replace(/\\D/g, '')}`, '_blank')}
              className="bg-white text-black px-4 py-1 rounded-full font-bold text-xs hover:bg-zinc-200 transition-colors"
            >
              Inscreva-se
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative h-[90vh] md:h-screen flex items-center justify-center pt-24 overflow-hidden bg-black">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1552422535-c45813c61732?q=80&w=2670&auto=format&fit=crop" 
            alt="Cello" 
            className="w-full h-full object-cover opacity-30 object-center scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/80" />
          {/* Luz radial no centro */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_60%)]" />
        </div>

        <motion.div 
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
          className="relative z-10 text-center px-4 w-full flex flex-col items-center justify-center mt-[-10vh]"
        >
          {schoolSettings?.logoUrl && (
            <motion.img 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              src={schoolSettings.logoUrl} 
              alt="Logo da Escola" 
              className="h-24 md:h-32 object-contain mb-8 drop-shadow-2xl brightness-0 invert" 
            />
          )}
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="text-5xl md:text-8xl font-semibold tracking-tighter leading-none mb-4 text-white drop-shadow-2xl"
          >
            A música <br className="md:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-500">
              redefinida.
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="text-xl md:text-3xl text-zinc-300 font-medium tracking-tight mb-8 max-w-2xl mx-auto"
          >
            Aprenda, crie e fascine. <br/>A academia de música mais avançada da região.
          </motion.p>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="text-lg text-zinc-500 mb-8"
          >
            Disponível a partir de amanhã na sua agenda.
          </motion.p>
        </motion.div>
      </section>

      {/* Overview Section - "The Specs" */}
      <section id="metodologia" className="bg-black py-24 md:py-40">
        <div className="max-w-[1000px] mx-auto px-6">
          <div className="text-center mb-20 md:mb-32">
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, margin: "-10%" }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-6xl font-bold tracking-tighter mb-6 leading-tight"
            >
              Potência máxima. <br/>No seu talento.
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: false, margin: "-10%" }}
              transition={{ duration: 1, delay: 0.2 }}
              className="text-xl text-zinc-400 max-w-2xl mx-auto"
            >
              Nossa metodologia exclusiva, baseada em absorção imersiva, acelera o aprendizado em até 3x. Da teoria brilhante à prática de tirar o fôlego.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false, margin: "-5%" }}
              className="bg-[#111] border border-white/5 rounded-[2rem] p-10 md:p-14 flex flex-col justify-between overflow-hidden relative group"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 rounded-full blur-[100px] group-hover:bg-orange-500/30 transition-colors" />
              <div className="relative z-10 mb-20">
                <Sparkles className="w-8 h-8 text-orange-500 mb-6" />
                <h3 className="text-3xl font-semibold tracking-tight mb-4">Acompanhamento<br/>Digital</h3>
                <p className="text-zinc-400 text-lg">Um diário mágico que grava toda a sua evolução aula a aula direto no seu celular.</p>
              </div>
            </motion.div>

            <motion.div 
              id="estudios"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false, margin: "-5%" }}
              transition={{ delay: 0.1 }}
              className="bg-[#111] border border-white/5 rounded-[2rem] p-10 md:p-14 flex flex-col justify-between overflow-hidden relative group"
            >
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] group-hover:bg-blue-500/20 transition-colors" />
              <div className="relative z-10 mb-20">
                <Speaker className="w-8 h-8 text-blue-500 mb-6" />
                <h3 className="text-3xl font-semibold tracking-tight mb-4">Acústica<br/>Pro-Level</h3>
                <p className="text-zinc-400 text-lg">Salas projetadas meticulosamente para a melhor fidelidade sonora e absorção.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Cursos - Grids */}
      <section id="cursos" className="py-24 bg-[#0a0a0b] border-y border-white/5">
        <div className="max-w-[1000px] mx-auto px-6">
           <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-16 text-center">
             Escolha a sua voz.
           </h2>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
             {[
               { name: "Piano", img: "https://images.unsplash.com/photo-1552422535-c45813c61732?q=80&w=800&auto=format&fit=crop", desc: "Clássico e Popular" },
               { name: "Guitarra", img: "https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?q=80&w=800&auto=format&fit=crop", desc: "Rock, Blues & Jazz" },
               { name: "Violão", img: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?q=80&w=800&auto=format&fit=crop", desc: "Acústico e Erudito" },
               { name: "Bateria", img: "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?q=80&w=800&auto=format&fit=crop", desc: "Ritmo e Precisão" },
               { name: "Canto", img: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800&auto=format&fit=crop", desc: "Técnica Vocal Avançada" },

             ].map((curso, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, margin: "-10%" }}
                  transition={{ delay: idx * 0.1 }}
                  className="group relative h-96 rounded-3xl overflow-hidden cursor-pointer"
                >
                  <img src={curso.img} className="w-full h-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-105" alt={curso.name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-8 w-full">
                     <h3 className="text-3xl font-bold tracking-tight text-white mb-1 group-hover:text-orange-400 transition-colors">{curso.name}</h3>
                     <p className="text-zinc-400 font-medium">{curso.desc}</p>
                  </div>
                </motion.div>
             ))}
           </div>
        </div>
      </section>

      {/* Footer & Final CTA */}
      <section id="contato" className="bg-black py-40 text-center px-4 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(249,115,22,0.15)_0%,transparent_50%)]" />
        <div className="relative z-10">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 max-w-4xl mx-auto leading-tight">
            Seu palco. <br className="md:hidden"/> Suas regras.
          </h2>
          <p className="text-xl text-zinc-400 mb-12 font-medium">Matrix de aprendizado adaptativa inclusa em todos os planos.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => window.open(`https://wa.me/55${(schoolSettings?.phone || '81999999999').replace(/\\D/g, '')}`, '_blank')}
              className="bg-white text-black px-8 py-4 rounded-full font-bold hover:scale-105 hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              Inscreva-se hoje
            </button>
            <button 
              onClick={onLoginClick}
              className="text-white flex items-center gap-2 hover:underline decoration-white/30 underline-offset-8 transition-all px-8 py-4"
            >
              Acessar Sistema <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Strict Apple-like Micro Footer */}
      <footer className="bg-[#111] py-8 text-xs text-zinc-500 font-medium">
        <div className="max-w-[1000px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
            <p>{schoolSettings?.tradingName || 'Avance Academia de Música'} &copy; {new Date().getFullYear()}</p>
            <span className="hidden md:inline text-zinc-700">|</span>
            <p>
              Feito por <a href="https://wa.me/5581999694866?text=Ol%C3%A1!%20Vi%20o%20sistema%20da%20Avance%20e%20gostaria%20de%20falar%20sobre%20um%20projeto." target="_blank" rel="noopener noreferrer" className="text-zinc-300 font-bold hover:text-emerald-400 transition-colors">LamaTech</a>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsPrivacyModalOpen(true)} className="hover:text-zinc-300 transition-colors">Privacidade</button>
            <span>|</span>
            <button onClick={() => setIsTermsModalOpen(true)} className="hover:text-zinc-300 transition-colors">Termos Gerais</button>
            <span>|</span>
            <button onClick={() => window.open(`https://wa.me/55${(schoolSettings?.phone || '81999999999').replace(/\\D/g, '')}`, '_blank')} className="hover:text-zinc-300 transition-colors">Fale Conosco</button>
            <span>|</span>
            <a 
              href={whatsappLink} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-1.5"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        </div>
      </footer>

      {/* Contact Modal */}


      {/* Privacy Modal */}
      <AnimatePresence>
        {isPrivacyModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsPrivacyModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl shadow-2xl p-8"
            >
              <button 
                onClick={() => setIsPrivacyModalOpen(false)}
                className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-2xl font-bold mb-4">Política de Privacidade</h3>
              <div className="text-zinc-400 text-sm space-y-4 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                <p>
                  A <strong>{schoolSettings?.tradingName || 'Avance Academia de Música'}</strong> coleta dados pessoais básicos (como nome, telefone e e-mail) com a finalidade exclusiva de prestar serviços educacionais, gerenciar matrículas, agendamento de aulas e processamento de pagamentos.
                </p>
                <p>
                  Seus dados são armazenados de forma segura e não são compartilhados com terceiros sem sua autorização prévia, exceto para o cumprimento de obrigações legais ou processamento de pagamentos através de parceiros certificados.
                </p>
                <p>
                  Nosso sistema utiliza cookies e tecnologias semelhantes apenas para manter a sua sessão ativa, garantir a segurança da plataforma e analisar métricas anônimas de uso para melhorar nossos serviços.
                </p>
              </div>
              <button 
                onClick={() => setIsPrivacyModalOpen(false)}
                className="mt-8 w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 transition-colors"
              >
                Entendi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Terms Modal */}
      <AnimatePresence>
        {isTermsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsTermsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl shadow-2xl p-8"
            >
              <button 
                onClick={() => setIsTermsModalOpen(false)}
                className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-2xl font-bold mb-4">Termos Gerais de Uso</h3>
              <div className="text-zinc-400 text-sm space-y-4 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                <p>
                  Ao utilizar os serviços e o sistema da <strong>{schoolSettings?.tradingName || 'Avance Academia de Música'}</strong>, você concorda em cumprir com as regras de agendamento, cancelamento e reagendamento de aulas estabelecidas pela secretaria e detalhadas no contrato de matrícula.
                </p>
                <p>
                  O acesso ao portal do aluno é pessoal e intransferível. A segurança da sua senha é de sua responsabilidade.
                </p>
                <p>
                  A academia reserva-se o direito de atualizar a matriz curricular, horários dos professores e valores das mensalidades com aviso prévio, garantindo sempre a qualidade do ensino.
                </p>
                <p>
                  Em caso de atraso prolongado no pagamento ou violação destas regras, o acesso às aulas e ao sistema poderá ser suspenso temporariamente até a regularização.
                </p>
              </div>
              <button 
                onClick={() => setIsTermsModalOpen(false)}
                className="mt-8 w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 transition-colors"
              >
                Entendi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
