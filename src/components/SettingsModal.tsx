import React, { useState, useEffect } from 'react';
import { X, Laptop, Folder, Volume2, ShieldCheck, Zap, HardDrive, Check } from 'lucide-react';
import { AppSettings, loadSettings, saveSettings } from '../core/settings';
import { updateDeviceName, updateDownloadDir, fetchDownloadDir } from '../core/tauriBridge';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeviceName: string;
  onDeviceNameUpdated: (newName: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentDeviceName,
  onDeviceNameUpdated,
}) => {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [deviceNameInput, setDeviceNameInput] = useState(currentDeviceName);
  const [downloadPathInput, setDownloadPathInput] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const s = loadSettings();
      setSettings(s);
      setDeviceNameInput(s.deviceName || currentDeviceName);
      fetchDownloadDir().then((dir) => {
        setDownloadPathInput(s.downloadDir || dir);
      });
      setIsSaved(false);
    }
  }, [isOpen, currentDeviceName]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmedName = deviceNameInput.trim();
    if (trimmedName && trimmedName !== currentDeviceName) {
      await updateDeviceName(trimmedName);
      onDeviceNameUpdated(trimmedName);
    }

    const trimmedPath = downloadPathInput.trim();
    if (trimmedPath) {
      await updateDownloadDir(trimmedPath);
    }

    saveSettings({
      ...settings,
      deviceName: trimmedName || currentDeviceName,
      downloadDir: trimmedPath,
    });

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 450);
  };

  const toggleOption = (key: keyof AppSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    saveSettings(updated);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[#090d14]/95 border border-white/10 shadow-2xl text-slate-100 overflow-hidden font-tajawal">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Laptop className="w-4 h-4" />
            </div>
            <h2 id="settings-dialog-title" className="text-lg font-bold text-white">إعدادات Otium Link</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق الإعدادات"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Device Name Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Laptop className="w-4 h-4 text-emerald-400" />
              اسم هذا الجهاز (كما يظهر لبقية الأجهزة)
            </label>
            <input
              type="text"
              value={deviceNameInput}
              onChange={(e) => setDeviceNameInput(e.target.value)}
              placeholder="مثال: حاسوبي المحمول"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-sm transition-all"
            />
          </div>

          {/* Download Path Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-emerald-400" />
              مجلد حفظ الملفات المستلمة
            </label>
            <input
              type="text"
              value={downloadPathInput}
              onChange={(e) => setDownloadPathInput(e.target.value)}
              placeholder="Downloads/OtiumLink"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-sm font-mono dir-ltr text-left transition-all"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            {/* Auto Clipboard Sync */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">المزامنة التلقائية للحافظة</div>
                  <div className="text-xs text-slate-400">إرسال النصوص المنسوخة فوراً للأجهزة المتصلة</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('autoClipboardSync')}
                aria-label="تبديل المزامنة التلقائية للحافظة"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.autoClipboardSync ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoClipboardSync ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Privacy Link Shield */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">درع تنظيف روابط التتبع (Privacy Shield)</div>
                  <div className="text-xs text-slate-400">إزالة رموز التتبع (UTM, fbclid, ?si=) تلقائياً</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('cleanTrackingLinks')}
                aria-label="تبديل درع تنظيف روابط التتبع"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.cleanTrackingLinks ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.cleanTrackingLinks ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Audio Feedback */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">تنبيهات صوتية هادئة</div>
                  <div className="text-xs text-slate-400">نغمة هارمونية فور استلام نصوص أو ملفات</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('audioFeedback')}
                aria-label="تبديل التنبيهات الصوتية الهادئة"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.audioFeedback ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.audioFeedback ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Network Info Banner */}
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <HardDrive className="w-4 h-4" />
              <span>اتصال محلي مباشر 100% (Zero Cloud)</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              منفذ البث التلقائي: <code className="text-emerald-300 font-mono">UDP 42424</code> • منفذ النقل اللحظي:{' '}
              <code className="text-emerald-300 font-mono">TCP 42425</code>
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" />
                <span>تم الحفظ</span>
              </>
            ) : (
              <span>حفظ الإعدادات</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
