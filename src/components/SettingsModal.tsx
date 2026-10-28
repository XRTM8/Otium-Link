import React, { useState, useEffect } from 'react';
import {
  X,
  Laptop,
  Folder,
  Volume2,
  ShieldCheck,
  Zap,
  HardDrive,
  Check,
  Trash2,
  Play,
  FileCheck2,
  Info,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { AppSettings, loadSettings, saveSettings } from '../core/settings';
import { updateDeviceName, updateDownloadDir, fetchDownloadDir, openExternalUrl } from '../core/tauriBridge';
import { playReceiveChime } from '../core/audioFeedback';
import { checkForAppUpdates, UpdateCheckResult, APP_CURRENT_VERSION } from '../core/updater';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeviceName: string;
  onDeviceNameUpdated: (newName: string) => void;
  onClearHistory?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentDeviceName,
  onDeviceNameUpdated,
  onClearHistory,
}) => {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [deviceNameInput, setDeviceNameInput] = useState(currentDeviceName);
  const [downloadPathInput, setDownloadPathInput] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);

  // Update Checker State (Otium 3-Tier Failover System)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const res = await checkForAppUpdates();
      setUpdateResult(res);
    } catch (err: any) {
      setUpdateError(err.message || 'تعذر الاتصال بخوادم التحديثات. يرجى التحقق من اتصالك بالإنترنت.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const s = loadSettings();
      setSettings(s);
      setDeviceNameInput(s.deviceName || currentDeviceName);
      fetchDownloadDir().then((dir) => {
        setDownloadPathInput(s.downloadDir || dir);
      });
      setIsSaved(false);
      setHistoryCleared(false);
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
    }, 350);
  };

  const toggleOption = (key: keyof AppSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleVolumeChange = (newVolume: number) => {
    const updated = { ...settings, soundVolume: newVolume };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleTestChime = () => {
    playReceiveChime(true, settings.soundVolume);
  };

  const handleClearAllHistory = () => {
    if (onClearHistory) {
      onClearHistory();
    }
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-[#090d14]/98 border border-white/10 shadow-2xl text-slate-100 overflow-hidden font-tajawal flex flex-col max-h-[92vh] sm:max-h-[85vh] gpu-layer">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-sm sm:text-base font-bold text-white">
                إعدادات وتفضيلات Otium Link
              </h2>
              <span className="text-[11px] text-slate-400">التحكم في الهوية والصوت والأتمتة والخصوصية</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق الإعدادات"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors otium-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body with Safe Bottom Padding */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 pb-32 overscroll-contain">
          {/* Section 1: Device Identity */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5" />
              <span>هوية الجهاز والتخزين المحلي</span>
            </h3>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                اسم هذا الجهاز (كما يظهر للأجهزة المقترنة)
              </label>
              <input
                type="text"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="مثال: حاسوبي المحمول أو هاتف Otium"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-blue-400" />
                  <span>مجلد حفظ الملفات المستلمة</span>
                </label>
                <button
                  type="button"
                  onClick={() => setDownloadPathInput('Downloads/OtiumLink')}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                  title="استعادة المجلد الافتراضي"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>الافتراضي</span>
                </button>
              </div>
              <input
                type="text"
                value={downloadPathInput}
                onChange={(e) => setDownloadPathInput(e.target.value)}
                placeholder="Downloads/OtiumLink"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 text-xs font-mono dir-ltr text-left transition-all truncate"
              />
            </div>
          </div>

          {/* Section 2: Audio & Feedback */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>الصوت والنغمات الهارمونية</span>
            </h3>

            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">تفعيل التنبيهات الصوتية</div>
                  <div className="text-xs text-slate-400">نغمات لطيفة عند إرسال أو استلام العناصر</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleOption('audioFeedback')}
                  aria-label="تبديل التنبيهات الصوتية"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
                    settings.audioFeedback ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.audioFeedback ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {settings.audioFeedback && (
                <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-slate-400 shrink-0">مستوى الصوت:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(settings.soundVolume * 100)}
                      onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10) / 100)}
                      className="w-full accent-blue-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs font-mono text-blue-400 shrink-0 w-8 text-left">
                      {Math.round(settings.soundVolume * 100)}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestChime}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-colors otium-press shrink-0"
                  >
                    <Play className="w-3 h-3 fill-blue-300" />
                    <span>اختبار</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Automation & Privacy Shields */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>الأتمتة ودرع الخصوصية</span>
            </h3>

            {/* Auto Clipboard Sync */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">المزامنة التلقائية للحافظة</div>
                  <div className="text-xs text-slate-400">مراقبة الحافظة في الخلفية وبث النصوص لحظياً للأجهزة المقترنة</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('autoClipboardSync')}
                aria-label="تبديل المزامنة التلقائية"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
                  settings.autoClipboardSync ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoClipboardSync ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Clean Tracking Links */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">درع تنظيف الروابط (Privacy Shield)</div>
                  <div className="text-xs text-slate-400">تجريد بارامترات التتبع والتجسس (UTM, fbclid, ?si=) تلقائياً</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('cleanTrackingLinks')}
                aria-label="تبديل درع تنظيف الروابط"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
                  settings.cleanTrackingLinks ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.cleanTrackingLinks ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Confirmation before receiving files */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                  <FileCheck2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">طلب تأكيد قبل استلام الملفات</div>
                  <div className="text-xs text-slate-400">تنبيه يدوي قبل قبول وتنزيل الملفات الكبيرة</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('requireFileConfirmation')}
                aria-label="تبديل طلب التأكيد قبل الاستلام"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
                  settings.requireFileConfirmation ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.requireFileConfirmation ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Sensitive Data Shield */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">درع حماية البيانات الحساسة</div>
                  <div className="text-xs text-slate-400">حجب البث التلقائي للبطاقات البنكية، مفاتيح API، وبيانات المرور</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('blockSensitiveAutoSync')}
                aria-label="تبديل درع حماية البيانات الحساسة"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
                  settings.blockSensitiveAutoSync ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.blockSensitiveAutoSync ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Section 4: History & Vault Management */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              <span>إدارة الذاكرة والسجل</span>
            </h3>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
              <div>
                <div className="text-sm font-semibold text-white">مسح سجل التحويلات والحافظة</div>
                <div className="text-xs text-slate-400">حذف كافة العناصر المخزنة محلياً في الذاكرة الحالية</div>
              </div>
              <button
                type="button"
                onClick={handleClearAllHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors otium-press"
              >
                {historyCleared ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-blue-400">تم المسح</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>مسح السجل</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 5: App Updates (Otium Ecosystem 3-Tier Failover Updater) */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold">
                الإصدار الحالي: v{APP_CURRENT_VERSION}
              </span>
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديثات التطبيق (منظومة Otium)</span>
              </h3>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <div className="text-right">
                <span className="text-xs font-semibold text-white block">نظام التحديثات المباشر عند الطلب</span>
                <span className="text-[10px] text-slate-400 block mt-0.5 leading-relaxed">
                  فحص آمن 100% بدون أي تتبع في الخلفية عبر نظام الاستكشاف التلقائي المقاوم لحجب الـ API
                </span>
              </div>

              {!isCheckingUpdate && !updateResult && !updateError && (
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all otium-press"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>التحقق من وجود تحديثات الآن</span>
                </button>
              )}

              {isCheckingUpdate && (
                <div className="text-center py-3 space-y-2 bg-black/30 rounded-xl border border-white/[0.05]">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin mx-auto" />
                  <p className="text-xs text-slate-300 font-medium">جارٍ فحص خوادم التحديثات (GitHub Releases)...</p>
                </div>
              )}

              {updateError && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{updateError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckUpdate}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition-colors otium-press"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>إعادة المحاولة</span>
                  </button>
                </div>
              )}

              {updateResult && updateResult.hasUpdate && (
                <div className="p-3.5 rounded-xl bg-blue-500/15 border border-blue-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-300 border border-blue-500/40 font-bold">
                      جديد: v{updateResult.latestVersion}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      <span>يتوفر إصدار أحدث جاهز للتحميل!</span>
                    </div>
                  </div>

                  {updateResult.releaseNotes && (
                    <div className="p-2.5 bg-black/40 rounded-lg border border-white/5 text-[11px] text-slate-300 max-h-24 overflow-y-auto font-sans leading-relaxed text-right">
                      {updateResult.releaseNotes}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openExternalUrl(updateResult.releaseUrl)}
                      className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 transition-all otium-press"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل التحديث المباشر</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternalUrl(updateResult.releaseUrl)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors otium-press"
                      title="فتح صفحة الإصدار"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {updateResult && !updateResult.hasUpdate && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleCheckUpdate}
                    className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors otium-press"
                    title="إعادة الفحص"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span>أنت تستخدم أحدث إصدار متاح حالياً (v{APP_CURRENT_VERSION})</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 6: Protocol & Legal */}
          <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-blue-400">
              <HardDrive className="w-4 h-4" />
              <span>بروتوكول Otium MESH المباشر — Zero Cloud</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              منفذ البث التلقائي: <code className="text-blue-300 font-mono">UDP 42424</code> • منفذ النقل اللحظي:{' '}
              <code className="text-blue-300 font-mono">TCP 42425</code> • التحقق من سلامة البيانات بنظام CRC32.
            </p>
            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-500">
              <Info className="w-3 h-3" />
              <span>مشروع حر ومفتوح المصدر تحت ترخيص GNU GPL v3.0</span>
            </div>
          </div>
        </div>

        {/* Sticky Solid Footer Actions (Never Clips Content) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 px-5 sm:px-6 py-3.5 border-t border-white/10 bg-[#090d14]/98 backdrop-blur-xl shrink-0 shadow-2xl z-30">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors otium-press"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all otium-press"
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
