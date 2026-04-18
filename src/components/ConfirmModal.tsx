import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'success' | 'primary';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger'
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-zinc-100"
          >
            <div className="flex items-center justify-between mb-6">
              <div className={
                 variant === 'danger' ? "w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500" :
                 variant === 'warning' ? "w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500" :
                 variant === 'success' ? "w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500" :
                 "w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500"
              }>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <button onClick={onClose} className="text-zinc-400 hover:text-black transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <h3 className="text-xl font-bold display-font text-black mb-2">{title}</h3>
            <p className="text-zinc-500 mb-8 leading-relaxed">{message}</p>
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 rounded-2xl text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-all border border-zinc-100"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={
                  variant === 'danger' ? "flex-1 px-6 py-3 rounded-2xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20" :
                  variant === 'warning' ? "flex-1 px-6 py-3 rounded-2xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20" :
                  variant === 'success' ? "flex-1 px-6 py-3 rounded-2xl text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20" :
                  "flex-1 px-6 py-3 rounded-2xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                }
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
