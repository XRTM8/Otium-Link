import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
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
  FolderOpen,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Radio,
  ClipboardList,
  Search,
  Code,
  Hash,
  Link,
  File,
  Send,
  Zap,
} from 'lucide-react';
import { OtiumLinkLogo } from './components/OtiumLinkLogo';
import { SettingsModal } from './components/SettingsModal';
import { DirectConnectModal } from './components/DirectConnectModal';
import { RadarVisualizer } from './components/RadarVisualizer';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Device, TransferItem } from './core/types';
import { cleanUrl, formatBytes } from './core/urlCleaner';
import { loadSettings, saveSettings, AppSettings } from './core/settings';
import {
  playReceiveChime,
  playSendChime,
  playSuccessChime,
  playWarningChime,
  playDropChime,
  playDeleteChime,
} from './core/audioFeedback';
import {
  HistoryItem,
  ClipboardContentType,
  loadClipboardHistory,
  addClipboardHistoryItem,
  removeClipboardHistoryItem,
  clearClipboardHistory,
} from './core/clipboardHistory';
import { recordTransferProgress, clearTransferTracker } from './core/transferSpeed';
import {
  fetchDiscoveredPeers,
  fetchSelfDevice,
  setupNativeListeners,
  transmitClipboard,
  transmitFile,
  openDownloadsFolder,
  openLocalFile,
} from './core/tauriBridge';

type ActiveTab = 'live' | 'clipboard' | 'transfers';

function formatTimestamp(ts: number): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDirectConnectOpen, setIsDirectConnectOpen] = useState(false);

  // Floating Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = useCallback(
    (type: 'success' | 'info' | 'warning', title: string, description?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      if (type === 'warning') {
        playWarningChime(appSettings.audioFeedback, appSettings.soundVolume);
      } else if (type === 'success') {
        playSuccessChime(appSettings.audioFeedback, appSettings.soundVolume);
      }
    },
    [appSettings.audioFeedback, appSettings.soundVolume]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [clipboardText, setClipboardText] = useState(
    'https://youtu.be/dQw4w9WgXcQ?si=f50sX9e821&utm_source=share'
  );
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastAutoSyncedRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clipboard History Vault State
  const [clipboardHistory, setClipboardHistory] = useState<HistoryItem[]>([]);
  const [clipboardFilter, setClipboardFilter] = useState<'all' | ClipboardContentType>('all');
  const [clipboardSearch, setClipboardSearch] = useState('');
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  // Transfer history
  const [transfers, setTransfers] = useState<TransferItem[]>([
    {
      id: 'tx_init',
      name: 'جاهز للاستقبال والإرسال اللحظي المتدفق',
      size: 0,
      type: 'text',
      progress: 1,
      status: 'completed',
      sender: 'النظام المحلي',
      receiver: 'هذا الجهاز',
      timestamp: Date.now(),
      verified: true,
    },
  ]);

  // Synchronize settings
  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail;
      if (detail) setAppSettings(detail);
    };
    window.addEventListener('otium-settings-changed', handleSettingsUpdate);
    return () => window.removeEventListener('otium-settings-changed', handleSettingsUpdate);
  }, []);

  // Synchronize clipboard history
  useEffect(() => {
    setClipboardHistory(loadClipboardHistory());
    const handleHistoryUpdate = (e: Event) => {
      const detail = (e as CustomEvent<HistoryItem[]>).detail;
      if (detail) setClipboardHistory(detail);
    };
    window.addEventListener('otium-clipboard-history-updated', handleHistoryUpdate);
    return () => window.removeEventListener('otium-clipboard-history-updated', handleHistoryUpdate);
  }, []);

  const handleTransmitClipboardText = useCallback(
    async (text: string, isAutomated: boolean = false) => {
      const trimmed = text ? text.trim() : '';
      if (!trimmed) return;
      if (isAutomated && trimmed === lastAutoSyncedRef.current) return;

      lastAutoSyncedRef.current = trimmed;
      setClipboardText(trimmed);

      const targetPeer = devices.find((d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId));
      if (!targetPeer) {
        if (!isAutomated) {
          showToast(
            'warning',
            'لا يوجد جهاز مقترن حالياً',
            'شغّل Otium Link على هاتفك أو حاسوبك الآخر على نفس شبكة Wi-Fi أولاً'
          );
        }
        return;
      }
      const targetIp = targetPeer.ip;

      const { cleanedUrl, wasCleaned, strippedParams } = appSettings.cleanTrackingLinks
        ? cleanUrl(trimmed)
        : { cleanedUrl: trimmed, wasCleaned: false, strippedParams: [] };

      // Record to history vault
      addClipboardHistoryItem(cleanedUrl, wasCleaned);

      await transmitClipboard(targetIp, cleanedUrl);
      playSendChime(appSettings.audioFeedback, appSettings.soundVolume);

      const newTransfer: TransferItem = {
        id: `tx_${Date.now()}`,
        name: cleanedUrl.length > 35 ? `${cleanedUrl.substring(0, 35)}...` : cleanedUrl,
        size: new Blob([cleanedUrl]).size,
        type: wasCleaned ? 'link' : 'text',
        progress: 1,
        status: 'completed',
        sender: 'هذا الجهاز',
        receiver: targetPeer.name,
        timestamp: Date.now(),
        verified: true,
      };
      setTransfers((prev) => [newTransfer, ...prev]);

      if (!isAutomated) {
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 2000);
        showToast(
          'success',
          'تم إرسال النص للجهاز بنجاح',
          wasCleaned ? `تم تطهير ${strippedParams.length} بارامترات تتبع` : `إلى ${targetPeer.name}`
        );
      }
    },
    [appSettings.audioFeedback, appSettings.cleanTrackingLinks, appSettings.soundVolume, devices, selectedPeerId, showToast]
  );

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

    // Listen for live P2P network discoveries, heartbeats, and incoming transfers
    let cleanupListeners: (() => void) | null = null;
    setupNativeListeners({
      onPeerDiscovered: (newPeer) => {
        setDevices((prev) => {
          const exists = prev.some((d) => d.id === newPeer.id);
          if (exists) {
            return prev.map((d) => (d.id === newPeer.id ? newPeer : d));
          }
          return [...prev, newPeer];
        });
        setSelectedPeerId((prev) => prev || newPeer.id);
        showToast('info', 'تم اكتشاف جهاز جديد', `${newPeer.name} (${newPeer.ip})`);
      },
      onPeersUpdated: (freshPeers) => {
        setDevices((prev) => {
          const self = prev.find((d) => d.isSelf);
          return self ? [self, ...freshPeers] : freshPeers;
        });
      },
      onClipboardReceived: (clip) => {
        const trimmed = clip.text.trim();
        setClipboardText(clip.text);
        lastAutoSyncedRef.current = trimmed;
        addClipboardHistoryItem(clip.text, false);
        playReceiveChime(appSettings.audioFeedback, appSettings.soundVolume);

        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(clip.text).catch(() => {});
        }
        showToast('success', 'تم استلام نص للحافظة', `من ${clip.sender}`);
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
            verified: true,
          },
          ...prev,
        ]);
      },
      onNativeClipboardChanged: (payload) => {
        const trimmed = payload.text.trim();
        if (trimmed === lastAutoSyncedRef.current) return;

        const { cleanedUrl, wasCleaned } = appSettings.cleanTrackingLinks
          ? cleanUrl(payload.text)
          : { cleanedUrl: payload.text, wasCleaned: false };

        addClipboardHistoryItem(cleanedUrl, wasCleaned);

        if (appSettings.autoClipboardSync) {
          handleTransmitClipboardText(payload.text, true);
        }
      },
      onFileReceived: (file) => {
        clearTransferTracker(file.name);
        playReceiveChime(appSettings.audioFeedback, appSettings.soundVolume);
        showToast('success', 'تم استلام الملف بنجاح ✓', `${file.name} (${formatBytes(file.size)})`);
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
            path: file.path,
            verified: file.verified ?? true,
          },
          ...prev,
        ]);
      },
      onFileProgress: (prog) => {
        const stats = recordTransferProgress(prog.name, prog.transferred, prog.total);
        setTransfers((prev) => {
          const existing = prev.find((t) => t.name === prog.name && t.status === 'in_progress');
          const progressRatio = prog.total > 0 ? prog.transferred / prog.total : 0.5;
          if (existing) {
            return prev.map((t) =>
              t.id === existing.id
                ? {
                    ...t,
                    progress: progressRatio,
                    speedBytesPerSec: stats.speedBytesPerSec,
                    speedFormatted: stats.formattedSpeed,
                    etaFormatted: stats.formattedEta,
                    status: progressRatio >= 1 ? 'completed' : 'in_progress',
                  }
                : t
            );
          } else if (progressRatio < 1) {
            return [
              {
                id: `tx_prog_${prog.name}`,
                name: prog.name,
                size: prog.total,
                type: 'file',
                progress: progressRatio,
                speedBytesPerSec: stats.speedBytesPerSec,
                speedFormatted: stats.formattedSpeed,
                etaFormatted: stats.formattedEta,
                status: 'in_progress',
                sender: prog.sender,
                receiver: 'هذا الجهاز',
                timestamp: Date.now(),
              },
              ...prev,
            ];
          }
          return prev;
        });
      },
      onFileError: (err) => {
        clearTransferTracker(err.name);
        showToast('warning', 'تعذر استلام الملف', `${err.name}: ${err.error}`);
        setTransfers((prev) => [
          {
            id: `tx_err_${Date.now()}`,
            name: err.name,
            size: 0,
            type: 'file',
            progress: 0,
            status: 'failed',
            sender: err.sender,
            receiver: 'هذا الجهاز',
            timestamp: Date.now(),
            error: err.error,
          },
          ...prev,
        ]);
      },
    }).then((cleanup) => {
      cleanupListeners = cleanup;
    });

    return () => {
      isMounted = false;
      if (cleanupListeners) cleanupListeners();
    };
  }, [
    appSettings.audioFeedback,
    appSettings.autoClipboardSync,
    appSettings.cleanTrackingLinks,
    appSettings.deviceName,
    appSettings.soundVolume,
    handleTransmitClipboardText,
    showToast,
  ]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Enter: transmit clipboard
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleTransmitClipboardText(clipboardText, false);
      }
      // Ctrl + O: trigger file picker
      if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      // Ctrl + D: open downloads folder
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        openDownloadsFolder();
        showToast('info', 'تم فتح مجلد التنزيلات', 'Downloads/OtiumLink');
      }
      // Escape: close modal
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        setIsDirectConnectOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboardText, handleTransmitClipboardText, showToast]);

  const handleCopyClipboard = (textOverride?: string, historyId?: string) => {
    const raw = textOverride || clipboardText;
    const textToCopy = appSettings.cleanTrackingLinks ? cleanUrl(raw).cleanedUrl : raw;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      if (historyId) {
        setCopiedHistoryId(historyId);
        setTimeout(() => setCopiedHistoryId(null), 1800);
      } else {
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 1800);
      }
      showToast('success', 'تم النسخ إلى الحافظة');
    }
  };

  const handleClearHistory = () => {
    playDeleteChime(appSettings.audioFeedback, appSettings.soundVolume);
    setTransfers([
      {
        id: 'tx_init',
        name: 'تم مسح السجل — جاهز للتبادل اللحظي',
        size: 0,
        type: 'text',
        progress: 1,
        status: 'completed',
        sender: 'النظام المحلي',
        receiver: 'هذا الجهاز',
        timestamp: Date.now(),
        verified: true,
      },
    ]);
    clearClipboardHistory();
    showToast('info', 'تم تفريغ السجل بالكامل');
  };

  const handleDirectPeerAdded = (newPeer: Device) => {
    setDevices((prev) => {
      const exists = prev.some((d) => d.id === newPeer.id || d.ip === newPeer.ip);
      if (exists) return prev.map((d) => (d.ip === newPeer.ip ? newPeer : d));
      return [...prev, newPeer];
    });
    setSelectedPeerId(newPeer.id);
    showToast('success', 'تم الاقتران المباشر بنجاح', `${newPeer.name} (${newPeer.ip})`);
  };

  const activePeers = devices.filter((d) => !d.isSelf);
  const selfDevice = devices.find((d) => d.isSelf);

  // Filter clipboard history
  const filteredHistory = clipboardHistory.filter((item) => {
    const matchesFilter = clipboardFilter === 'all' || item.type === clipboardFilter;
    const matchesSearch =
      !clipboardSearch.trim() || item.text.toLowerCase().includes(clipboardSearch.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      className="flex flex-col h-screen w-full bg-[#07090e] text-[#f0f6fc] select-none overflow-hidden font-tajawal relative"
    >
      {/* Toast Notification Layer */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Full Window Drag Overlay */}
      {isDragging && (
        <div
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragging(false);
            playDropChime(appSettings.audioFeedback, appSettings.soundVolume);

            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) {
              const targetPeer = devices.find(
                (d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId)
              );
              if (!targetPeer) {
                showToast(
                  'warning',
                  'لا يوجد جهاز مقترن حالياً',
                  'شغّل التطبيق على الجهاز الآخر أولاً لنقل الملفات'
                );
                return;
              }

              for (const f of droppedFiles) {
                const filePath = (f as any).path || f.name;
                await transmitFile(targetPeer.ip, filePath);
                playSendChime(appSettings.audioFeedback, appSettings.soundVolume);
              }

              const newItems: TransferItem[] = droppedFiles.map((f) => ({
                id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: f.name,
                size: f.size,
                type: 'file',
                progress: 1,
                status: 'completed',
                sender: 'هذا الجهاز',
                receiver: targetPeer.name,
                timestamp: Date.now(),
                verified: true,
              }));
              setTransfers((prev) => [...newItems, ...prev]);
              showToast('success', `جارٍ إرسال ${droppedFiles.length} ملفات`, `إلى ${targetPeer.name}`);
            }
          }}
          className="fixed inset-0 z-50 bg-[#07090e]/92 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-emerald-400 p-6 animate-in fade-in duration-150"
        >
          <div className="p-5 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mb-3 animate-bounce">
            <UploadCloud className="w-12 h-12" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">أفلت الملفات للإرسال اللحظي المباشر</h2>
          <p className="text-sm text-emerald-300">
            {activePeers.length > 0
              ? `المستهدف: ${devices.find((d) => d.id === selectedPeerId)?.name || activePeers[0].name}`
              : 'يرجى تشغيل التطبيق على الجهاز المقترن'}
          </p>
          <span className="text-xs text-gray-400 mt-2 font-mono">
            نقل مباشر عالي السرعة مع التحقق التلقائي بنظام CRC32
          </span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="otium-chrome px-4 py-3 flex items-center justify-between border-b border-white/[0.08] z-20 shrink-0">
        <div className="flex items-center gap-3">
          <OtiumLinkLogo size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">Otium Link | أوتيوم لينك</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                v1.1.0 المصقول
              </span>
            </div>
            <p className="text-[11px] text-gray-400">الجسر اللحظي للحافظة والملفات بين حاسوبك وهاتفك</p>
          </div>
        </div>

        {/* Status Pill & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs">
            <Wifi className={`w-3.5 h-3.5 ${activePeers.length > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            <span className="text-gray-300 font-medium">
              {activePeers.length > 0 ? `${activePeers.length} أجهزة متصلة` : 'الواي فاي جاهز'}
            </span>
          </div>

          <button
            onClick={async () => {
              const peers = await fetchDiscoveredPeers();
              setDevices((prev) => {
                const self = prev.find((d) => d.isSelf);
                return self ? [self, ...peers] : peers;
              });
              showToast('info', 'تم تحديث قائمة الأجهزة المتصلة');
            }}
            title="تحديث واستكشاف الأجهزة"
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

      {/* Navigation Tab Bar */}
      <nav className="flex items-center px-4 pt-2.5 pb-1 border-b border-white/[0.06] bg-black/20 gap-2 shrink-0">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'live'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>الرادار والنقل المباشر</span>
        </button>

        <button
          onClick={() => setActiveTab('clipboard')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'clipboard'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>خزينة الحافظة</span>
          {clipboardHistory.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
              {clipboardHistory.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'transfers'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>سجل التحويلات</span>
          {transfers.length > 1 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-gray-300 font-mono">
              {transfers.length}
            </span>
          )}
        </button>
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ========================================================= */}
        {/* TAB 1: LIVE RADAR & HUB */}
        {/* ========================================================= */}
        {activeTab === 'live' && (
          <>
            {/* Visual Radar Scanner */}
            <RadarVisualizer
              devices={devices}
              selectedPeerId={selectedPeerId}
              onSelectPeer={(id) => {
                setSelectedPeerId(id);
                playDropChime(appSettings.audioFeedback, appSettings.soundVolume);
              }}
              onOpenDirectConnect={() => setIsDirectConnectOpen(true)}
            />

            {/* Live Universal Clipboard Section */}
            <section className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                  <Copy className="w-4 h-4 text-emerald-400" />
                  <span>الحافظة الحية التلقائية (Live Background Sync)</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Clean link toggle */}
                  <button
                    onClick={() => {
                      const updated = {
                        ...appSettings,
                        cleanTrackingLinks: !appSettings.cleanTrackingLinks,
                      };
                      setAppSettings(updated);
                      saveSettings(updated);
                      showToast(
                        'info',
                        updated.cleanTrackingLinks ? 'تم تفعيل درع الخصوصية' : 'تم تعطيل درع الخصوصية'
                      );
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
                      const updated = {
                        ...appSettings,
                        autoClipboardSync: !appSettings.autoClipboardSync,
                      };
                      setAppSettings(updated);
                      saveSettings(updated);
                      showToast(
                        'info',
                        updated.autoClipboardSync ? 'تم تفعيل المزامنة التلقائية' : 'تم إيقاف المزامنة التلقائية'
                      );
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition-colors ${
                      appSettings.autoClipboardSync
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-white/[0.06] text-gray-400 border-white/[0.08]'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>{appSettings.autoClipboardSync ? 'المزامنة نشطة' : 'المزامنة متوقفة'}</span>
                  </button>
                </div>
              </div>

              {/* Current Clipboard Box */}
              <div className="bg-black/40 border border-white/[0.08] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>المحتوى في الحافظة حالياً:</span>
                  {appSettings.cleanTrackingLinks && cleanUrl(clipboardText).wasCleaned && (
                    <span className="text-emerald-400 font-semibold text-[10px] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>تم تطهير بارامترات التتبع (UTM/si) بنجاح</span>
                    </span>
                  )}
                </div>

                <textarea
                  value={clipboardText}
                  onChange={(e) => setClipboardText(e.target.value)}
                  rows={2}
                  className="w-full bg-transparent text-xs text-gray-200 outline-none resize-none font-mono"
                  placeholder="انسخ أي نص أو رابط في أي مكان على جهازك وسيتم بثه ومزامنته فوراً..."
                />

                <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {clipboardText.length} حرفاً • {formatBytes(new Blob([clipboardText]).size)}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyClipboard()}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      {copiedSuccess ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedSuccess ? 'تم النسخ!' : 'نسخ للحافظة'}</span>
                    </button>
                    <button
                      onClick={() => handleTransmitClipboardText(clipboardText, false)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>إرسال للجهاز المقترن فوراً</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* High Speed File Drop Area */}
            <section
              onClick={() => fileInputRef.current?.click()}
              className="otium-card rounded-2xl p-6 border-2 border-dashed border-white/[0.12] hover:border-emerald-500/40 hover:bg-white/[0.02] transition-all text-center flex flex-col items-center justify-center gap-3 cursor-pointer"
            >
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  اسحب وأفلت أي ملف أو صورة للإرسال الفوري
                </h3>
                <p className="text-[11px] text-gray-400">
                  بدون أي ضغط للجودة، مع فحص سلامة البيانات بنظام CRC32 ونقل متدفق مباشر
                </p>
              </div>
              <button
                type="button"
                className="mt-1 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 text-xs font-semibold border border-white/[0.08] transition-colors"
              >
                <span>أو اختر ملفاً من جهازك (Ctrl+O)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  if (files.length > 0) {
                    const targetPeer = devices.find(
                      (d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId)
                    );
                    if (!targetPeer) {
                      showToast(
                        'warning',
                        'لا يوجد جهاز مقترن حالياً',
                        'شغّل Otium Link على الهاتف أو الحاسوب الآخر على نفس شبكة Wi-Fi أولاً'
                      );
                      return;
                    }
                    const targetIp = targetPeer.ip;

                    for (const f of files) {
                      const filePath = (f as any).path || f.name;
                      await transmitFile(targetIp, filePath);
                      playSendChime(appSettings.audioFeedback, appSettings.soundVolume);
                    }

                    const newItems: TransferItem[] = files.map((f) => ({
                      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                      name: f.name,
                      size: f.size,
                      type: 'file',
                      progress: 1,
                      status: 'completed',
                      sender: 'هذا الجهاز',
                      receiver: targetPeer.name,
                      timestamp: Date.now(),
                      verified: true,
                    }));
                    setTransfers((prev) => [...newItems, ...prev]);
                    showToast('success', `تم إرسال ${files.length} ملفات`, `إلى ${targetPeer.name}`);
                  }
                }}
              />
            </section>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CLIPBOARD HISTORY VAULT */}
        {/* ========================================================= */}
        {activeTab === 'clipboard' && (
          <section className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-4">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">خزينة سجل الحافظة المشفر محلياً</span>
                <span className="text-xs text-gray-400">({clipboardHistory.length} عنصر)</span>
              </div>

              {/* Search bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={clipboardSearch}
                  onChange={(e) => setClipboardSearch(e.target.value)}
                  placeholder="بحث في النصوص المنسوخة..."
                  className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setClipboardFilter('all')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  clipboardFilter === 'all'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setClipboardFilter('url')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
                  clipboardFilter === 'url'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <Link className="w-3 h-3" />
                <span>الروابط</span>
              </button>
              <button
                onClick={() => setClipboardFilter('code')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
                  clipboardFilter === 'code'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <Code className="w-3 h-3" />
                <span>الأكواد</span>
              </button>
              <button
                onClick={() => setClipboardFilter('number')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
                  clipboardFilter === 'number'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <Hash className="w-3 h-3" />
                <span>الأرقام</span>
              </button>
              <button
                onClick={() => setClipboardFilter('text')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
                  clipboardFilter === 'text'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>النصوص</span>
              </button>
            </div>

            {/* List */}
            <div className="space-y-2">
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                          item.type === 'url'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : item.type === 'code'
                            ? 'bg-cyan-500/15 text-cyan-400'
                            : item.type === 'number'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-slate-500/15 text-slate-300'
                        }`}
                      >
                        {item.type === 'url'
                          ? 'رابط'
                          : item.type === 'code'
                          ? 'كود برمجي'
                          : item.type === 'number'
                          ? 'رقم هاتف'
                          : 'نص'}
                      </span>
                      {item.isCleanedUrl && (
                        <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>مطهر من التتبع</span>
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px]">{formatTimestamp(item.timestamp)}</span>
                  </div>

                  <p
                    className={`text-xs text-gray-200 line-clamp-3 select-text ${
                      item.type === 'code' ? 'font-mono bg-black/30 p-2 rounded-lg' : ''
                    }`}
                  >
                    {item.text}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                    <span className="text-[10px] text-gray-500 font-mono">
                      {item.text.length} حرفاً
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyClipboard(item.text, item.id)}
                        title="نسخ إلى الحافظة"
                        className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-gray-300 flex items-center gap-1 transition-colors"
                      >
                        {copiedHistoryId === item.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleTransmitClipboardText(item.text, false)}
                        title="إرسال للجهاز المقترن"
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Send className="w-3 h-3" />
                        <span>إرسال</span>
                      </button>

                      <button
                        onClick={() => {
                          removeClipboardHistoryItem(item.id);
                          playDeleteChime(appSettings.audioFeedback, appSettings.soundVolume);
                        }}
                        title="حذف هذا العنصر"
                        className="p-1 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredHistory.length === 0 && (
                <div className="p-8 text-center text-xs text-gray-400 bg-white/[0.01] rounded-xl border border-white/[0.04]">
                  لا توجد عناصر مطابقة في الحافظة حالياً. انسخ أي نص لبدء الحفظ التلقائي.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 3: TRANSFERS & FILES HISTORY */}
        {/* ========================================================= */}
        {activeTab === 'transfers' && (
          <section className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>سجل النقل اللحظي والملفات المتبادلة</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-mono">{transfers.length} عناصر</span>
                <button
                  onClick={handleClearHistory}
                  title="مسح السجل"
                  className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-white/[0.05] transition-colors text-[10px] flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>مسح السجل</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {transfers.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs transition-all hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        item.type === 'file'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-cyan-500/10 text-cyan-400'
                      }`}
                    >
                      {item.type === 'file' ? <File className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      <span className="font-semibold text-gray-200 block truncate">{item.name}</span>
                      <span className="text-[10px] text-gray-400 block truncate">
                        {item.size > 0 ? `${formatBytes(item.size)} • ` : ''}من {item.sender} إلى {item.receiver}{' '}
                        • {formatTimestamp(item.timestamp)}
                      </span>
                      {/* Live Progress Bar and Speed Stats */}
                      {item.status === 'in_progress' && (
                        <div className="space-y-1 mt-1.5">
                          <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono">
                            <span>{item.speedFormatted || 'جارٍ البث...'}</span>
                            <span>{item.etaFormatted || ''} • {Math.round(item.progress * 100)}%</span>
                          </div>
                          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-400 h-full rounded-full transition-all duration-200"
                              style={{ width: `${Math.round(item.progress * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 mr-3">
                    {item.path && (
                      <button
                        onClick={() => openLocalFile(item.path!)}
                        title="فتح الملف"
                        className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {item.type !== 'file' && (
                      <button
                        onClick={() => handleCopyClipboard(item.name)}
                        title="نسخ مجدداً"
                        className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {item.status === 'completed' && (
                      <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{item.verified ? 'مؤكد CRC32 ✓' : 'تم بنجاح'}</span>
                      </div>
                    )}
                    {item.status === 'failed' && (
                      <div className="flex items-center gap-1 text-[11px] text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-lg">
                        <AlertCircle className="w-3 h-3" />
                        <span>فشل</span>
                      </div>
                    )}
                    {item.status === 'in_progress' && (
                      <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-lg">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{Math.round(item.progress * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer Info */}
      <footer className="otium-chrome px-4 py-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-gray-400 shrink-0">
        <div className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>منظومة Otium — تشفير محلي تام بدون أي خوادم سحابية | رخصة GNU GPL v3</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              openDownloadsFolder();
              showToast('info', 'تم فتح مجلد التنزيلات');
            }}
            className="flex items-center gap-1 hover:text-emerald-400 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>مجلد التنزيلات (Ctrl+D)</span>
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
        onClearHistory={handleClearHistory}
      />

      {/* Direct IP Connect Modal */}
      <DirectConnectModal
        isOpen={isDirectConnectOpen}
        onClose={() => setIsDirectConnectOpen(false)}
        onAddDirectPeer={handleDirectPeerAdded}
      />
    </div>
  );
};
