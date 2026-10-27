import React, { useState } from 'react';
import { X, Network, Plus, Check, Laptop, Smartphone, AlertCircle } from 'lucide-react';
import { Device } from '../core/types';
import { addDirectPeer } from '../core/tauriBridge';

interface DirectConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDirectPeer: (peer: Device) => void;
}

export const DirectConnectModal: React.FC<DirectConnectModalProps> = ({
  isOpen,
  onClose,
  onAddDirectPeer,
}) => {
  const [ipInput, setIpInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [osType, setOsType] = useState<'windows' | 'android'>('android');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async () => {
    const trimmedIp = ipInput.trim();
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    if (!ipRegex.test(trimmedIp)) {
      setErrorMsg('يرجى إدخال عنوان IP صالح (مثال: 192.168.1.105)');
      return;
    }

    const trimmedName = nameInput.trim() || (osType === 'windows' ? 'حاسوب مباشر' : 'هاتف مباشر');
    const peer = await addDirectPeer(trimmedIp, trimmedName, osType);
    if (peer) {
      onAddDirectPeer(peer);
    }
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      setIpInput('');
      setNameInput('');
      setErrorMsg(null);
      onClose();
    }, 450);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-connect-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[#090d14]/98 border border-white/10 shadow-2xl text-slate-100 overflow-hidden font-tajawal gpu-layer">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h2 id="direct-connect-title" className="text-sm font-bold text-white">
                اتصال مباشر عبر عنوان IP
              </h2>
              <span className="text-[11px] text-slate-400">
                مفيد عند تشغيل عزل الأجهزة (AP Isolation) على الراوتر
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors otium-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              عنوان IP للجهاز الآخر (من شاشة التطبيق في الجهاز الآخر)
            </label>
            <input
              type="text"
              value={ipInput}
              onChange={(e) => {
                setIpInput(e.target.value);
                setErrorMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
              placeholder="192.168.1.105"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-sm font-mono dir-ltr text-left transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">اسم توضيحي للجهاز (اختياري)</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
              placeholder="مثال: هاتف سامسونج"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-xs transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">نوع نظام التشغيل</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOsType('android')}
                className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all otium-press ${
                  osType === 'android'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>هاتف / أندرويد</span>
              </button>
              <button
                type="button"
                onClick={() => setOsType('windows')}
                className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all otium-press ${
                  osType === 'windows'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>حاسوب / ويندوز</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors otium-press"
          >
            إلغاء
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all otium-press"
          >
            {isSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>تم الاقتران</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة واقتران</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
