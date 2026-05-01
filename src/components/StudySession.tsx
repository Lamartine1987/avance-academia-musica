import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, Square, CheckCircle2, RotateCcw, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { LibraryTopic, Lesson } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import AlphaTabPlayer from './AlphaTabPlayer';

interface StudySessionProps {
  topic: LibraryTopic;
  task?: Lesson; // Optional, if there's a scheduled task to mark as completed
  isAlreadyCompleted?: boolean;
  onClose: () => void;
  onComplete?: () => void;
  onCompleteAutonomous?: () => Promise<void>;
}

export default function StudySession({ topic, task, isAlreadyCompleted, onClose, onComplete, onCompleteAutonomous }: StudySessionProps) {
  // Timer State
  const initialTime = (task?.suggestedDuration || 30) * 60; // in seconds
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Metronome State
  const [bpm, setBpm] = useState(100);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatInBarRef = useRef<number>(0);
  const timerIDRef = useRef<number | null>(null);

  // --- TIMER LOGIC ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => setIsTimerRunning(!isTimerRunning);
  const resetTimer = () => {
    setIsTimerRunning(false);
    setTimeLeft(initialTime);
  };

  // --- METRONOME LOGIC ---
  const playClick = (time: number, isAccent: boolean) => {
    if (!audioContextRef.current) return;
    const osc = audioContextRef.current.createOscillator();
    const envelope = audioContextRef.current.createGain();
    
    osc.frequency.value = isAccent ? 1200 : 800; // High pitch for beat 1, lower for others
    envelope.gain.value = 1;
    envelope.gain.exponentialRampToValueAtTime(1, time + 0.001);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    
    osc.connect(envelope);
    envelope.connect(audioContextRef.current.destination);
    
    osc.start(time);
    osc.stop(time + 0.1);
  };

  const scheduler = useCallback(() => {
    if (!audioContextRef.current) return;
    
    // While there are notes that will need to play before the next interval,
    // schedule them and advance the pointer.
    while (nextNoteTimeRef.current < audioContextRef.current.currentTime + 0.1) {
      // Play the note
      const isAccent = currentBeatInBarRef.current === 0;
      playClick(nextNoteTimeRef.current, isAccent);
      
      // Advance time by a 16th note... wait, we are just doing quarter notes here.
      const secondsPerBeat = 60.0 / bpm;
      nextNoteTimeRef.current += secondsPerBeat;
      
      // Advance the beat number, wrap to zero
      currentBeatInBarRef.current = (currentBeatInBarRef.current + 1) % beatsPerMeasure;
    }
    timerIDRef.current = requestAnimationFrame(scheduler);
  }, [bpm, beatsPerMeasure]);

  useEffect(() => {
    if (isMetronomePlaying) {
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      nextNoteTimeRef.current = audioContextRef.current.currentTime + 0.05;
      currentBeatInBarRef.current = 0;
      scheduler();
    } else {
      if (timerIDRef.current !== null) {
        cancelAnimationFrame(timerIDRef.current);
        timerIDRef.current = null;
      }
    }
    
    return () => {
      if (timerIDRef.current !== null) {
        cancelAnimationFrame(timerIDRef.current);
      }
    };
  }, [isMetronomePlaying, scheduler]);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  const toggleMetronome = () => {
    setIsMetronomePlaying(!isMetronomePlaying);
  };

  // --- COMPLETION LOGIC ---
  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      if (task) {
        await updateDoc(doc(db, 'lessons', task.id), {
          status: 'completed'
        });
        if (onComplete) onComplete();
      } else if (onCompleteAutonomous && !isAlreadyCompleted) {
        await onCompleteAutonomous();
        if (onComplete) onComplete();
      }
      onClose();
    } catch (error) {
      console.error(error);
      alert('Erro ao marcar como concluído.');
      setIsCompleting(false);
    }
  };

  // --- RENDER MATERIAL ---
  const renderMaterial = () => {
    if (topic.type === 'video' || topic.url.includes('youtube.com/embed')) {
      return (
        <iframe 
          src={topic.url} 
          className="w-full h-full rounded-2xl border-0 shadow-inner bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      );
    }
    if (topic.type === 'pdf') {
      return (
        <iframe 
          src={topic.url} 
          className="w-full h-full rounded-2xl border-0 shadow-inner bg-zinc-100"
        ></iframe>
      );
    }
    if (topic.type === 'audio') {
      return (
        <div className="flex items-center justify-center h-full bg-zinc-50 rounded-2xl border border-zinc-200">
           <audio controls src={topic.url} className="w-full max-w-md"></audio>
        </div>
      );
    }
    if (topic.type === 'image') {
      return (
        <div className="flex items-center justify-center h-full bg-black rounded-2xl overflow-hidden p-2">
          <img src={topic.url} alt={topic.title} className="max-w-full max-h-full object-contain rounded-xl" />
        </div>
      );
    }
    if (topic.type === 'interactive_sheet') {
      return (
        <div className="w-full h-full">
          <AlphaTabPlayer url={topic.url} />
        </div>
      );
    }
    
    // Generic link
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-50 rounded-2xl border border-zinc-200 p-8 text-center">
        <ExternalLink className="w-16 h-16 text-zinc-300 mb-4" />
        <h4 className="text-xl font-bold text-zinc-700 mb-2">Material Externo</h4>
        <p className="text-zinc-500 mb-6 max-w-sm">Este material é um link externo. Clique no botão abaixo para abri-lo em uma nova aba com segurança.</p>
        <a 
          href={topic.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 flex items-center gap-2"
        >
          <ExternalLink className="w-5 h-5" />
          Acessar Link
        </a>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed inset-0 z-50 bg-white flex flex-col md:flex-row overflow-hidden"
      >
        {/* Main Content Area (Left) */}
        <div className="flex-1 p-4 md:p-6 bg-zinc-50 flex flex-col min-h-0">
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
               <button 
                 onClick={onClose}
                 className="p-2 bg-white rounded-full border border-zinc-200 text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors"
               >
                 <X className="w-5 h-5" />
               </button>
               <div>
                 <h2 className="text-xl font-bold text-zinc-900 display-font leading-tight">{topic.title}</h2>
                 <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{topic.moduleName}</p>
               </div>
             </div>
           </div>
           
           <div className="flex-1 min-h-0 rounded-2xl shadow-sm border border-zinc-200 bg-white p-2">
             {renderMaterial()}
           </div>
        </div>

        {/* Sidebar Tools (Right) */}
        <div className="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-zinc-200 p-6 flex flex-col overflow-y-auto shrink-0 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
             Ferramentas de Estudo
          </h3>
          
          {/* Cronômetro */}
          <div className="bg-zinc-50 rounded-[24px] p-5 border border-zinc-100 mb-6">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Cronômetro</h4>
            <div className="text-center mb-4">
              <span className={`text-4xl font-black display-font tracking-tight ${timeLeft === 0 ? 'text-red-500' : 'text-zinc-900'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={toggleTimer}
                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isTimerRunning ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
              >
                {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isTimerRunning ? 'Pausar' : 'Iniciar'}
              </button>
              <button 
                onClick={resetTimer}
                className="p-3 bg-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-300 transition-colors"
                title="Zerar"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Metrônomo */}
          <div className="bg-zinc-50 rounded-[24px] p-5 border border-zinc-100 mb-6">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Metrônomo</h4>
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-zinc-700">BPM</span>
              <span className="text-xl font-black text-zinc-900">{bpm}</span>
            </div>
            
            <input 
              type="range" 
              min="40" 
              max="240" 
              value={bpm} 
              onChange={(e) => setBpm(parseInt(e.target.value))}
              className="w-full accent-orange-500 mb-6"
            />
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-zinc-700">Compasso</span>
              <select 
                value={beatsPerMeasure}
                onChange={(e) => setBeatsPerMeasure(parseInt(e.target.value))}
                className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-sm font-bold outline-none"
              >
                <option value={2}>2/4</option>
                <option value={3}>3/4</option>
                <option value={4}>4/4</option>
                <option value={6}>6/8</option>
              </select>
            </div>

            <button 
              onClick={toggleMetronome}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isMetronomePlaying ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
            >
              {isMetronomePlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isMetronomePlaying ? 'Parar Metrônomo' : 'Tocar Metrônomo'}
            </button>
          </div>

          <div className="mt-auto pt-6">
            {task && (
              <div className="bg-emerald-50 rounded-2xl p-4 mb-4 border border-emerald-100">
                <p className="text-xs text-emerald-700 font-medium mb-2">Você está estudando para a tarefa agendada.</p>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-wider bg-emerald-100/50 px-2 py-1 rounded">
                    DATA: {task.startTime?.toDate ? format(task.startTime.toDate(), 'dd/MM/yyyy') : 'N/A'}
                  </span>
                  <span className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-wider bg-emerald-100/50 px-2 py-1 rounded">
                    TEMPO: {task.suggestedDuration} MIN
                  </span>
                </div>
              </div>
            )}
            
            <button 
              onClick={handleComplete}
              disabled={isCompleting || (!task && isAlreadyCompleted)}
              className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCompleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {task 
                ? 'Marcar como Concluído' 
                : isAlreadyCompleted 
                  ? 'Tópico Concluído' 
                  : 'Marcar como Concluído'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
