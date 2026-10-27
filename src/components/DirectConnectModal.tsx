import React, { useState } from 'react';
import { X, Network, Plus, Check, Laptop, Smartphone, AlertCircle, Copy, Radio, ShieldCheck } from 'lucide-react';
import { Device } from '../core/types';
import { addDirectPeer } from '../core/tauriBridge';

interface DirectConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDirectPeer: (peer: Device) => void;
  selfDevice?: Device | null;
}

export const DirectConnectModal: React.FC<DirectConnectModalProps> = ({
  isOpen,
  onClose,
  onAddDirectPeer,
  selfDevice,
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'my_info'>('connect');
  const [ipInput, setIpInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [osType, setOsType] = useState<'windows' | 'android'>('android');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1500);
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
                الاتصال المباشر والاقتران
              </h2>
              <span className="text-[11px] text-slate-400">
                حل فوري لعزل الراوتر (AP Isolation) وتخطي حواجز الشبكة
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

        {/* Tab Toggle */}
        <div className="flex border-b border-white/10 bg-black/30 p-1 gap-1">
          <button
            onClick={() => setActiveTab('connect')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'connect'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            إضافة جهاز عبر IP
          </button>
          <button
            onClick={() => setActiveTab('my_info')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'my_info'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            بيانات جهازي للاقتران
          </button>
        </div>

        {/* Body */}
        {activeTab === 'connect' ? (
          <div className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                عنوان IP للجهاز الآخر (من تبويب "بيانات جهازي" في الجهاز الآخر)
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
        ) : (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>عنوان IP الخاص بهذا الجهاز</span>
                </span>
                <span className="text-[10px] text-gray-400 font-mono">المنفذ: 42425</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-emerald-500/30">
                <span className="font-mono text-sm font-bold text-white tracking-wider dir-ltr">
                  {selfDevice?.ip || '127.0.0.1'}
                </span>
                <button
                  onClick={() => copyToClipboard(selfDevice?.ip || '127.0.0.1', 'ip')}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-emerald-300 flex items-center gap-1 transition-colors"
                >
                  {copiedField === 'ip' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'ip' ? 'تم النسخ' : 'نسخ IP'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                <span>اسم الجهاز:</span>
                <span className="font-bold text-white">{selfDevice?.name || 'Otium Link'}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>كيفية الاقتران إذا كان الراوتر يفصل الأجهزة:</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                افتح تطبيق Otium Link على الجهاز الآخر (الهاتف أو الحاسوب)، اضغط على "اتصال مباشر IP"، واكتب عنوان الـ IP الموضح أعلاه واضغط "إضافة واقتران". سيبدأ تبادل الحافظة والملفات فوراً بدون الحاجة لاكتشاف البث التلقائي.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors otium-press"
          >
            إغلاق
          </button>
          {activeTab === 'connect' && (
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
          )}
        </div>
      </div>
    </div>
  );
};
