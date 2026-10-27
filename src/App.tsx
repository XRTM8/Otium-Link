import React, { useEffect, useState, useRef } from 'react';
import {
  Laptop,
  Smartphone,
  Copy,
  Check,
  UploadCloud,
  FileText,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  ArrowRightLeft,
  Settings as SettingsIcon,
  Wifi,
} from 'lucide-react';
import { OtiumLinkLogo } from './components/OtiumLinkLogo';
import { SettingsModal } from './components/SettingsModal';
import { Device, TransferItem } from './core/types';
import { cleanUrl, formatBytes } from './core/urlCleaner';
import { loadSettings, saveSettings, AppSettings } from './core/settings';
import { playReceiveChime, playSendChime } from './core/audioFeedback';
import {
  fetchDiscoveredPeers,
  fetchSelfDevice,
  setupNativeListeners,
  transmitClipboard,
  transmitFile,
} from './core/tauriBridge';

export const App: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [clipboardText, setClipboardText] = useState(
    'https://youtu.be/dQw4w9WgXcQ?si=f50sX9e821&utm_source=share'
  );
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastAutoSyncedRef = useRef<string>('');

  // Transfer history
  const [transfers, setTransfers] = useState<TransferItem[]>([
    {
      id: 'tx_init',
      name: 'جاهز للاستقبال والإرسال اللحظي',
      size: 0,
      type: 'text',
      progress: 1,
      status: 'completed',
      sender: 'النظام المحلي',
      receiver: 'هذا الجهاز',
      timestamp: Date.now(),
    },
  ]);

  // Synchronize with external settings changes
  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail;
      if (detail) setAppSettings(detail);
    };
    window.addEventListener('otium-settings-changed', handleSettingsUpdate);
    return () => window.removeEventListener('otium-settings-changed', handleSettingsUpdate);
  }, []);

  // Load initial devices and setup Tauri event listeners
  useEffect(() => {
    let isMounted = true;

    async function init() {
      const self = await fetchSelfDevice();
      const peers = await fetchDiscoveredPeers();
      if (!isMounted) return;

      const initialDevices: Device[] = [];
      if (self) {
        if (appSettings.deviceName) {
          self.name = appSettings.deviceName;
        }
        initialDevices.push(self);
      }
      initialDevices.push(...peers);
      setDevices(initialDevices);

      if (peers.length > 0) {
        setSelectedPeerId(peers[0].id);
      }
    }

    init();

    // Listen for live P2P network discoveries and incoming transfers
    let cleanupListeners: (() => void) | null = null;
    setupNativeListeners(
      (newPeer) => {
        setDevices((prev) => {
          const exists = prev.some((d) => d.id === newPeer.id);
          if (exists) {
            return prev.map((d) => (d.id === newPeer.id ? newPeer : d));
          }
          return [...prev, newPeer];
        });
        setSelectedPeerId((prev) => prev || newPeer.id);
      },
      (clip) => {
        setClipboardText(clip.text);
        lastAutoSyncedRef.current = clip.text;
        playReceiveChime(appSettings.audioFeedback);

        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(clip.text).catch(() => {});
        }
        setTransfers((prev) => [
          {
            id: `tx_${Date.now()}`,
            name: clip.text.length > 40 ? `${clip.text.substring(0, 40)}...` : clip.text,
            size: new Blob([clip.text]).size,
            type: 'text',
            progress: 1,
            status: 'completed',
            sender: clip.sender,
            receiver: 'هذا الجهاز',
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      },
      (file) => {
        playReceiveChime(appSettings.audioFeedback);
        setTransfers((prev) => [
          {
            id: `tx_${Date.now()}`,
            name: file.name,
            size: file.size,
            type: 'file',
            progress: 1,
            status: 'completed',
            sender: file.sender,
            receiver: 'هذا الجهاز',
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      }
    ).then((cleanup) => {
      cleanupListeners = cleanup;
    });

    return () => {
      isMounted = false;
      if (cleanupListeners) cleanupListeners();
    };
  }, [appSettings.audioFeedback, appSettings.deviceName]);

  // Automatic Background Clipboard Poller when focused or periodically
  useEffect(() => {
    if (!appSettings.autoClipboardSync) return;

    const checkClipboard = async () => {
      if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.readText) {
        return;
      }
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim() && text !== lastAutoSyncedRef.current) {
          lastAutoSyncedRef.current = text;
          setClipboardText(text);

          const targetPeer = devices.find((d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId));
          if (targetPeer) {
            const { cleanedUrl } = appSettings.cleanTrackingLinks
              ? cleanUrl(text)
              : { cleanedUrl: text };

            await transmitClipboard(targetPeer.ip, cleanedUrl);
            playSendChime(appSettings.audioFeedback);
          }
        }
      } catch {
        // Clipboard read permission might require user interaction
      }
    };

    const handleFocus = () => {
      checkClipboard();
    };

    window.addEventListener('focus', handleFocus);
    const interval = setInterval(checkClipboard, 3000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [appSettings.autoClipboardSync, appSettings.cleanTrackingLinks, appSettings.audioFeedback, devices, selectedPeerId]);

  const handleCopyClipboard = () => {
    const textToCopy = appSettings.cleanTrackingLinks
      ? cleanUrl(clipboardText).cleanedUrl
      : clipboardText;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    }
  };

  const handleManualSendText = async () => {
    if (!clipboardText.trim()) return;

    const targetPeer = devices.find((d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId));
    const targetIp = targetPeer?.ip || '127.0.0.1';

    const { cleanedUrl, wasCleaned } = appSettings.cleanTrackingLinks
      ? cleanUrl(clipboardText)
      : { cleanedUrl: clipboardText, wasCleaned: false };

    await transmitClipboard(targetIp, cleanedUrl);
    playSendChime(appSettings.audioFeedback);

    const newTransfer: TransferItem = {
      id: `tx_${Date.now()}`,
      name: cleanedUrl.length > 35 ? `${cleanedUrl.substring(0, 35)}...` : cleanedUrl,
      size: new Blob([cleanedUrl]).size,
      type: wasCleaned ? 'link' : 'text',
      progress: 1,
      status: 'completed',
      sender: 'هذا الجهاز',
      receiver: targetPeer?.name || 'الجهاز المقترن',
      timestamp: Date.now(),
    };
    setTransfers((prev) => [newTransfer, ...prev]);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  const activePeers = devices.filter((d) => !d.isSelf);
  const selfDevice = devices.find((d) => d.isSelf);

  return (
    <div className="flex flex-col h-screen w-full bg-[#07090e] text-[#f0f6fc] select-none overflow-hidden font-tajawal">
      {/* Top Header Bar */}
      <header className="otium-chrome px-4 py-3 flex items-center justify-between border-b border-white/[0.08] z-20">
        <div className="flex items-center gap-3">
          <OtiumLinkLogo size={34} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">Otium Link | أوتيوم لينك</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                v0.2.0
              </span>
            </div>
            <p className="text-[11px] text-gray-400">الجسر اللحظي للحافظة والملفات بين حاسوبك وهاتفك</p>
          </div>
        </div>

        {/* Status Pill & Settings Action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs">
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-gray-300 font-medium">الواي فاي المحلي جاهز</span>
          </div>

          <button
            onClick={async () => {
              const peers = await fetchDiscoveredPeers();
              setDevices((prev) => {
                const self = prev.find((d) => d.isSelf);
                return self ? [self, ...peers] : peers;
              });
            }}
            title="تحديث قائمة الأجهزة"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            title="الإعدادات والتخصيص"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Device Pairing Radar */}
        <section className="otium-card rounded-2xl p-4 border border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
              <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
              <span>الأجهزة المقترنة على الشبكة المحلية</span>
            </div>
            <span className="text-[11px] text-gray-400">
              {devices.length} أجهزة متصلة (تشفير نظير لنظير P2P)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {devices.map((device) => {
              const isSelected = !device.isSelf && device.id === selectedPeerId;
              return (
                <div
                  key={device.id}
                  onClick={() => !device.isSelf && setSelectedPeerId(device.id)}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    device.isSelf
                      ? 'bg-white/[0.03] border-white/[0.08] cursor-default'
                      : isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                      : 'bg-emerald-500/[0.04] border-emerald-500/20 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-xl ${
                        device.os === 'windows' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {device.os === 'windows' ? <Laptop className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-white block">{device.name}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{device.ip}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{device.isSelf ? 'جهازك الحالي' : isSelected ? 'المستهدف ✓' : 'متصل'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {activePeers.length === 0 && (
            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center text-xs text-gray-400">
              جارٍ الاستكشاف التلقائي عبر المنفذ 42424... شغّل Otium Link على الهاتف أو الحاسوب الآخر على نفس شبكة Wi-Fi للاتصال فوراً.
            </div>
          )}
        </section>

        {/* Live Universal Clipboard Section */}
        <section className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
              <Copy className="w-4 h-4 text-emerald-400" />
              <span>الحافظة الحية التلقائية (Live Clipboard)</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Clean link toggle */}
              <button
                onClick={() => {
                  const updated = { ...appSettings, cleanTrackingLinks: !appSettings.cleanTrackingLinks };
                  setAppSettings(updated);
                  saveSettings(updated);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 transition-colors ${
                  appSettings.cleanTrackingLinks
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-white/[0.04] text-gray-400 border-white/[0.08]'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>درع الخصوصية</span>
              </button>

              {/* Auto sync switch */}
              <button
                onClick={() => {
                  const updated = { ...appSettings, autoClipboardSync: !appSettings.autoClipboardSync };
                  setAppSettings(updated);
                  saveSettings(updated);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition-colors ${
                  appSettings.autoClipboardSync
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : 'bg-white/[0.06] text-gray-400 border-white/[0.08]'
                }`}
              >
                <span>{appSettings.autoClipboardSync ? 'المزامنة نشطة' : 'المزامنة متوقفة'}</span>
              </button>
            </div>
          </div>

          {/* Current Clipboard Box */}
          <div className="bg-black/40 border border-white/[0.08] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>المحتوى في الحافظة حالياً:</span>
              {appSettings.cleanTrackingLinks && cleanUrl(clipboardText).wasCleaned && (
                <span className="text-emerald-400 font-semibold text-[10px]">
                  ✓ تم تطهير بارامترات التتبع (UTM/si) بنجاح
                </span>
              )}
            </div>

            <textarea
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              rows={2}
              className="w-full bg-transparent text-xs text-gray-200 outline-none resize-none font-mono"
              placeholder="انسخ أي نص أو رابط في أي مكان على جهازك وسيظهر هنا وتتم مزامنته فوراً..."
            />

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.05]">
              <button
                onClick={handleCopyClipboard}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSuccess ? 'تم النسخ!' : 'نسخ للحافظة'}</span>
              </button>
              <button
                onClick={handleManualSendText}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>إرسال للجهاز المقترن فوراً</span>
              </button>
            </div>
          </div>
        </section>

        {/* High Speed File Drop Area */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragging(false);
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) {
              const targetPeer = devices.find((d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId));
              const targetIp = targetPeer?.ip || '127.0.0.1';

              for (const f of droppedFiles) {
                // If native file path is available in Tauri/Electron webview
                const filePath = (f as any).path || f.name;
                await transmitFile(targetIp, filePath);
                playSendChime(appSettings.audioFeedback);
              }

              const newItems: TransferItem[] = droppedFiles.map((f) => ({
                id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: f.name,
                size: f.size,
                type: 'file',
                progress: 1,
                status: 'completed',
                sender: 'هذا الجهاز',
                receiver: activePeers[0]?.name || 'الجهاز المقترن',
                timestamp: Date.now(),
              }));
              setTransfers((prev) => [...newItems, ...prev]);
            }
          }}
          className={`otium-card rounded-2xl p-6 border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-3 cursor-pointer ${
            isDragging
              ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
              : 'border-white/[0.12] hover:border-emerald-500/40 hover:bg-white/[0.02]'
          }`}
        >
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <UploadCloud className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-1">
              اسحب وأفلت أي ملف أو صورة للإرسال الفوري
            </h3>
            <p className="text-[11px] text-gray-400">
              بدون أي ضغط للجودة وبسرعة الواي فاي المباشرة (تصل إلى 100 ميجابايت/ثانية)
            </p>
          </div>
          <label className="mt-1 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 text-xs font-semibold cursor-pointer border border-white/[0.08] transition-colors">
            <span>أو اختر ملفاً من جهازك</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length > 0) {
                  const targetPeer = devices.find((d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId));
                  const targetIp = targetPeer?.ip || '127.0.0.1';

                  for (const f of files) {
                    const filePath = (f as any).path || f.name;
                    await transmitFile(targetIp, filePath);
                    playSendChime(appSettings.audioFeedback);
                  }

                  const newItems: TransferItem[] = files.map((f) => ({
                    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    name: f.name,
                    size: f.size,
                    type: 'file',
                    progress: 1,
                    status: 'completed',
                    sender: 'هذا الجهاز',
                    receiver: activePeers[0]?.name || 'الجهاز المقترن',
                    timestamp: Date.now(),
                  }));
                  setTransfers((prev) => [...newItems, ...prev]);
                }
              }}
            />
          </label>
        </section>

        {/* Transfer History */}
        <section className="otium-card rounded-2xl p-4 border border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>سجل التحويلات والملفات المتبادلة</span>
            </span>
            <span className="text-[10px] text-gray-400">{transfers.length} عناصر مكتملة</span>
          </div>

          <div className="space-y-2">
            {transfers.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-gray-200 block truncate max-w-[220px] sm:max-w-xs">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {item.size > 0 ? `${formatBytes(item.size)} • ` : ''}من {item.sender} إلى {item.receiver}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                  <Check className="w-3 h-3" />
                  <span>تم بنجاح</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer Info */}
      <footer className="otium-chrome px-4 py-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-gray-400">
        <div className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>منظومة Otium — تشفير محلي تام بدون سحابة</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="hover:text-emerald-400 transition-colors"
          >
            مجلد التحميلات (OtiumLink)
          </button>
        </div>
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentDeviceName={selfDevice?.name || 'هذا الجهاز'}
        onDeviceNameUpdated={(newName) => {
          setDevices((prev) =>
            prev.map((d) => (d.isSelf ? { ...d, name: newName } : d))
          );
        }}
      />
    </div>
  );
};
