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
    }, 400);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[#090d14]/98 border border-white/10 shadow-2xl text-slate-100 overflow-hidden font-tajawal flex flex-col max-h-[85vh] gpu-layer">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-base font-bold text-white">
                إعدادات وتفضيلات Otium Link
              </h2>
              <span className="text-[11px] text-slate-400">التحكم في الهوية والصوت والأتمتة والخصوصية</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق الإعدادات"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors otium-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Section 1: Device Identity */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
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
                placeholder="مثال: حاسوبي المحمول"
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-sm transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-emerald-400" />
                <span>مجلد حفظ الملفات المستلمة</span>
              </label>
              <input
                type="text"
                value={downloadPathInput}
                onChange={(e) => setDownloadPathInput(e.target.value)}
                placeholder="Downloads/OtiumLink"
                className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-xs font-mono dir-ltr text-left transition-all"
              />
            </div>
          </div>

          {/* Section 2: Audio & Feedback */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>الصوت والنغمات الهارمونية</span>
            </h3>

            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">تفعيل التنبيهات الصوتية</div>
                  <div className="text-xs text-slate-400">نغمات لطيفة استوديو عند إرسال أو استلام العناصر</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleOption('audioFeedback')}
                  aria-label="تبديل التنبيهات الصوتية"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
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

              {settings.audioFeedback && (
                <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                      <span>مستوى الصوت</span>
                      <span className="font-mono text-emerald-400">
                        {Math.round(settings.soundVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.soundVolume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleTestChime}
                    title="تجربة الصوت الآن"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors shrink-0 otium-press"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>اختبار</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Automation & Privacy */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>الأتمتة ودرع الخصوصية</span>
            </h3>

            {/* Auto Clipboard Sync */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">المزامنة التلقائية للحافظة</div>
                  <div className="text-xs text-slate-400">مراقبة الحافظة في الخلفية وبث النصوص لحظياً</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('autoClipboardSync')}
                aria-label="تبديل المزامنة التلقائية للحافظة"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
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
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">درع تنظيف الروابط (Privacy Shield)</div>
                  <div className="text-xs text-slate-400">تجريد بارامترات التجسس والتتبع (UTM, fbclid, ?si=) تلقائياً</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleOption('cleanTrackingLinks')}
                aria-label="تبديل درع تنظيف الروابط"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors otium-press ${
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

            {/* Confirmation before receiving files */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
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
                  settings.requireFileConfirmation ? 'bg-emerald-500' : 'bg-slate-700'
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
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
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
                  settings.blockSensitiveAutoSync ? 'bg-emerald-500' : 'bg-slate-700'
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
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              <span>إدارة الذاكرة والسجل</span>
            </h3>

            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div>
                <div className="text-sm font-semibold text-white">مسح سجل التحويلات والحافظة</div>
                <div className="text-xs text-slate-400">حذف كافة العناصر المخزنة محلياً في الذاكرة الحالية</div>
              </div>
              <button
                type="button"
                onClick={handleClearAllHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors otium-press"
              >
                {historyCleared ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">تم المسح</span>
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
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                الإصدار الحالي: v{APP_CURRENT_VERSION}
              </span>
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديثات التطبيق (منظومة Otium)</span>
              </h3>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <div className="text-right">
                <span className="text-xs font-semibold text-white block">نظام التحديثات المباشر عند الطلب</span>
                <span className="text-[10px] text-slate-400 block mt-0.5 leading-relaxed">
                  فحص آمن 100% بدون أي تتبع في الخلفية عبر نظام الاستكشاف الثلاثي المقاوم لحجب الـ API
                </span>
              </div>

              {!isCheckingUpdate && !updateResult && !updateError && (
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all otium-press"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>التحقق من وجود تحديثات الآن</span>
                </button>
              )}

              {isCheckingUpdate && (
                <div className="text-center py-3 space-y-2 bg-black/30 rounded-xl border border-white/[0.05]">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin mx-auto" />
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
                <div className="space-y-3 p-3 bg-emerald-950/30 border border-emerald-500/35 rounded-xl text-right">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {updateResult.publishedAt ? new Date(updateResult.publishedAt).toLocaleDateString('ar-EG') : ''}
                    </span>
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-xs">
                      <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>يتوفر إصدار جديد: v{updateResult.latestVersion}</span>
                    </div>
                  </div>

                  {updateResult.releaseNotes && (
                    <div className="max-h-24 overflow-y-auto p-2 bg-black/40 rounded-lg text-[11px] text-slate-300 font-mono dir-ltr text-left border border-white/5 whitespace-pre-wrap">
                      {updateResult.releaseNotes}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {updateResult.matchedAsset && (
                      <button
                        type="button"
                        onClick={() => openExternalUrl(updateResult.matchedAsset!.downloadUrl)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all otium-press"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل التحديث ({updateResult.matchedAsset.name})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openExternalUrl(updateResult.releaseUrl)}
                      className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition-all otium-press"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>عرض في GitHub</span>
                    </button>
                  </div>
                </div>
              )}

              {updateResult && !updateResult.hasUpdate && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleCheckUpdate}
                    className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-colors otium-press"
                    title="إعادة الفحص"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span>أنت تستخدم أحدث إصدار متاح حالياً (v{APP_CURRENT_VERSION})</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 6: Protocol & Legal */}
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <HardDrive className="w-4 h-4" />
              <span>بروتوكول Otium المباشر — Zero Cloud</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              منفذ البث التلقائي: <code className="text-emerald-300 font-mono">UDP 42424</code> • منفذ النقل اللحظي:{' '}
              <code className="text-emerald-300 font-mono">TCP 42425</code> • التحقق من سلامة البايتات بنظام CRC32.
            </p>
            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-500">
              <Info className="w-3 h-3" />
              <span>مشروع حر ومفتوح المصدر تحت ترخيص GNU GPL v3.0</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-white/10 bg-white/[0.02] shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors otium-press"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all otium-press"
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
