import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  description?: string;
  duration?: number;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  // Cap visible toasts to maximum 3 to prevent notification flooding/screen takeover
  const visibleToasts = toasts.slice(-3);
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 font-tajawal">
      {visibleToasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 3200);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const isSuccess = toast.type === 'success';
  const isWarning = toast.type === 'warning';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl animate-in slide-in-from-top-3 fade-in duration-200 ${
        isSuccess
          ? 'bg-[#061811]/95 border-emerald-500/40 text-emerald-100 shadow-emerald-500/10'
          : isWarning
          ? 'bg-[#1c1205]/95 border-amber-500/40 text-amber-100 shadow-amber-500/10'
          : 'bg-[#0d131f]/95 border-cyan-500/40 text-cyan-100 shadow-cyan-500/10'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5 shrink-0">
          {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {isWarning && <AlertCircle className="w-4 h-4 text-amber-400" />}
          {!isSuccess && !isWarning && <Info className="w-4 h-4 text-cyan-400" />}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs font-bold leading-snug">{toast.title}</p>
          {toast.description && (
            <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed break-words line-clamp-3">
              {toast.description}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="إغلاق التنبيه"
        className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-opacity shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
