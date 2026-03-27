import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning';
}

export default function FeedbackModal({ isOpen, onClose, title, message, type = 'success' }: FeedbackModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl overflow-hidden text-center z-10"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex justify-center mb-6">
            <div className={`w-20 h-20 rounded-[32px] flex items-center justify-center shadow-xl ${
              type === 'success' ? 'bg-emerald-100 shadow-emerald-500/20' : 
              type === 'error' ? 'bg-red-100 shadow-red-500/20' : 
              'bg-amber-100 shadow-amber-500/20'
            }`}>
              {type === 'success' && <CheckCircle2 className="w-10 h-10 text-emerald-600" />}
              {type === 'error' && <AlertCircle className="w-10 h-10 text-red-600" />}
              {type === 'warning' && <AlertCircle className="w-10 h-10 text-amber-600" />}
            </div>
          </div>

          <h3 className="text-2xl font-bold text-zinc-900 mb-2 display-font tracking-tight">{title}</h3>
          <p className="text-zinc-500 text-sm leading-relaxed mb-8">{message}</p>

          <button
            onClick={onClose}
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all text-white shadow-xl ${
              type === 'success' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 
              type === 'error' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 
              'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
            }`}
          >
            Entendi
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
