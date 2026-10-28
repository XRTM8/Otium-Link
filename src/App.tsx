import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Copy,
  Check,
  UploadCloud,
  FileText,
  ShieldCheck,
  RefreshCw,
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
  Link,
  File,
  Send,
  ShieldAlert,
  Tv,
} from 'lucide-react';
import { OtiumLinkLogo } from './components/OtiumLinkLogo';
import { SettingsModal } from './components/SettingsModal';
import { DirectConnectModal } from './components/DirectConnectModal';
import { RadarVisualizer } from './components/RadarVisualizer';
import { SmartCastView } from './components/SmartCastView';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Device, TransferItem } from './core/types';
import { cleanUrl, formatBytes } from './core/urlCleaner';
import { detectSensitiveContent } from './core/sensitiveDetector';
import { loadSettings, AppSettings } from './core/settings';
import { useResponsive } from './core/useResponsive';
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
  launchRemoteCast,
  startCastServer,
  fetchCastInfo,
  openExternalUrl,
} from './core/tauriBridge';

type ActiveTab = 'live' | 'cast' | 'vault';

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
  const { isMobile, isDesktop } = useResponsive();
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [vaultTab, setVaultTab] = useState<'clipboard' | 'transfers'>('clipboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDirectConnectOpen, setIsDirectConnectOpen] = useState(false);

  // Floating Toasts with Deduplication and Throttling
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const lastToastTimeRef = useRef<{ [key: string]: number }>({});
  const recentlyReceivedClipboards = useRef<Map<string, number>>(new Map());
  const lastAutoBroadcastTime = useRef<number>(0);

  const showToast = useCallback(
    (type: 'success' | 'info' | 'warning', title: string, description?: string) => {
      const key = `${type}:${title}:${description || ''}`;
      const now = Date.now();
      if (lastToastTimeRef.current[key] && now - lastToastTimeRef.current[key] < 3000) {
        return; // Drop duplicate toast within 3 seconds to prevent notification storm
      }
      lastToastTimeRef.current[key] = now;

      const id = `toast_${now}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => {
        const next = [...prev, { id, type, title, description }];
        return next.slice(-4);
      });
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

      const success = await transmitClipboard(targetIp, cleanedUrl);

      if (success) {
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
      } else {
        const failedTransfer: TransferItem = {
          id: `tx_${Date.now()}`,
          name: cleanedUrl.length > 35 ? `${cleanedUrl.substring(0, 35)}...` : cleanedUrl,
          size: new Blob([cleanedUrl]).size,
          type: wasCleaned ? 'link' : 'text',
          progress: 0,
          status: 'failed',
          sender: 'هذا الجهاز',
          receiver: targetPeer.name,
          timestamp: Date.now(),
          error: 'تعذر الاتصال بالجهاز المستهدف عبر الشبكة',
        };
        setTransfers((prev) => [failedTransfer, ...prev]);

        if (!isAutomated) {
          showToast(
            'warning',
            'تعذر إرسال النص',
            `تحقق من اتصال ${targetPeer.name} بنفس شبكة Wi-Fi أو استخدم الاتصال المباشر IP`
          );
        }
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
          const exists = prev.some((d) => d.id === newPeer.id || (!d.isSelf && d.ip === newPeer.ip));
          if (exists) {
            return prev.map((d) => (d.id === newPeer.id || (!d.isSelf && d.ip === newPeer.ip) ? newPeer : d));
          }
          showToast('info', 'تم اكتشاف جهاز جديد', `${newPeer.name} (${newPeer.ip})`);
          return [...prev, newPeer];
        });
        setSelectedPeerId((prev) => prev || newPeer.id);
      },
      onPeersUpdated: (freshPeers) => {
        setDevices((prev) => {
          const self = prev.find((d) => d.isSelf);
          const directPeers = prev.filter((d) => !d.isSelf && d.id.startsWith('direct_'));
          const merged = [...freshPeers];
          for (const dp of directPeers) {
            if (!merged.some((p) => p.id === dp.id || p.ip === dp.ip)) {
              merged.push(dp);
            }
          }
          return self ? [self, ...merged] : merged;
        });
        setSelectedPeerId((current) => {
          if (!current) return freshPeers.length > 0 ? freshPeers[0].id : null;
          return current;
        });
      },
      onClipboardReceived: (clip) => {
        const trimmed = clip.text.trim();
        if (!trimmed) return;

        // Register in incoming cache with 20s TTL to suppress native OS clipboard echo loop
        recentlyReceivedClipboards.current.set(trimmed, Date.now());
        const now = Date.now();
        for (const [k, t] of recentlyReceivedClipboards.current.entries()) {
          if (now - t > 20_000) {
            recentlyReceivedClipboards.current.delete(k);
          }
        }

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
        if (!trimmed) return;

        // 1. Guard against local redundant trigger
        if (trimmed === lastAutoSyncedRef.current) return;

        // 2. CRITICAL: Guard against network reflection echo loop
        const receivedTime = recentlyReceivedClipboards.current.get(trimmed);
        if (receivedTime && Date.now() - receivedTime < 20_000) {
          lastAutoSyncedRef.current = trimmed;
          return; // Dropped network reflection!
        }

        // 3. Security Shield: Prevent unintentional automatic broadcast of sensitive keys & cards
        if (appSettings.blockSensitiveAutoSync) {
          const sensitiveCheck = detectSensitiveContent(payload.text);
          if (sensitiveCheck.isSensitive) {
            showToast(
              'warning',
              'درع الحماية: تم تعليق البث التلقائي',
              `تم رصد ${sensitiveCheck.labelArabic}. يمكنك إرساله يدوياً.`
            );
            addClipboardHistoryItem(payload.text, false);
            return;
          }
        }

        const { cleanedUrl, wasCleaned } = appSettings.cleanTrackingLinks
          ? cleanUrl(payload.text)
          : { cleanedUrl: payload.text, wasCleaned: false };

        addClipboardHistoryItem(cleanedUrl, wasCleaned);

        // 4. Rate-limited broadcast
        if (appSettings.autoClipboardSync) {
          const now = Date.now();
          if (now - lastAutoBroadcastTime.current < 2500) {
            return; // Throttled to prevent flooding
          }
          lastAutoBroadcastTime.current = now;
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
      onRemoteCastRequested: async (cmd) => {
        if (!cmd.url || (!cmd.url.startsWith('http://') && !cmd.url.startsWith('https://'))) {
          showToast('warning', 'طلب عرض غير آمن', 'تم حظر الرابط لأسباب أمنية.');
          return;
        }
        showToast('info', `طلب عرض شاشة من ${cmd.sender}`, 'جاري فتح شاشة العرض...');
        await openExternalUrl(cmd.url);
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

  // Global Keyboard Shortcuts (Only active on non-mobile devices)
  useEffect(() => {
    if (isMobile) return;

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
  }, [clipboardText, handleTransmitClipboardText, showToast, isMobile]);

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

  const handleLaunchRemoteCast = useCallback(
    async (targetPeer: Device) => {
      try {
        let info = await fetchCastInfo();
        if (!info.is_running) {
          info = await startCastServer();
        }
        const ok = await launchRemoteCast(targetPeer.ip, targetPeer.port, info.url, info.pin);
        if (ok) {
          showToast('success', `تم إرسال أمر العرض إلى ${targetPeer.name}`, 'شاشة العرض ستفتح تلقائياً');
        } else {
          showToast('warning', `تعذر إرسال أمر العرض إلى ${targetPeer.name}`);
        }
      } catch (err: any) {
        showToast('warning', 'خطأ في تشغيل العرض عن بعد', String(err));
      }
    },
    [showToast]
  );

  const activePeers = devices.filter((d) => !d.isSelf);
  const selfDevice = devices.find((d) => d.isSelf);

  // Filter clipboard history
  const filteredHistory = clipboardHistory.filter((item) => {
    const matchesFilter = clipboardFilter === 'all' || item.type === clipboardFilter;
    const matchesSearch =
      !clipboardSearch.trim() || item.text.toLowerCase().includes(clipboardSearch.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Handle file dispatch
  const handleSendFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const targetPeer = devices.find(
      (d) => !d.isSelf && (!selectedPeerId || d.id === selectedPeerId)
    );
    if (!targetPeer) {
      showToast(
        'warning',
        'لا يوجد جهاز مقترن حالياً',
        'شغّل Otium Link على هاتفك أو حاسوبك الآخر على نفس شبكة Wi-Fi أولاً'
      );
      return;
    }
    const targetIp = targetPeer.ip;
    let successCount = 0;
    let failCount = 0;

    for (const f of files) {
      const filePath = (f as any).path || f.name;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const ok = await transmitFile(targetIp, filePath);
      if (ok) {
        successCount++;
        playSendChime(appSettings.audioFeedback, appSettings.soundVolume);
        setTransfers((prev) => [
          {
            id: txId,
            name: f.name,
            size: f.size,
            type: 'file',
            progress: 1,
            status: 'completed',
            sender: 'هذا الجهاز',
            receiver: targetPeer.name,
            timestamp: Date.now(),
            verified: true,
          },
          ...prev,
        ]);
      } else {
        failCount++;
        setTransfers((prev) => [
          {
            id: txId,
            name: f.name,
            size: f.size,
            type: 'file',
            progress: 0,
            status: 'failed',
            sender: 'هذا الجهاز',
            receiver: targetPeer.name,
            timestamp: Date.now(),
            error: 'تعذر الاتصال بالجهاز لنقل الملف',
          },
          ...prev,
        ]);
      }
    }

    if (successCount > 0 && failCount === 0) {
      showToast('success', `تم إرسال ${successCount} ملفات بنجاح ✓`, `إلى ${targetPeer.name}`);
    } else if (failCount > 0) {
      showToast('warning', `تعذر إرسال ${failCount} ملفات`, `يرجى التحقق من اتصال ${targetPeer.name}`);
    }
  };

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
            handleSendFiles(droppedFiles);
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

      {/* ========================================================= */}
      {/* ADAPTIVE HEADER BAR */}
      {/* ========================================================= */}
      <header className="otium-chrome px-4 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between border-b border-white/[0.08] z-20 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <OtiumLinkLogo size={isMobile ? 30 : 36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                {isMobile ? 'Otium Link' : 'Otium Link | أوتيوم لينك'}
              </h1>
              {!isMobile && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30 shrink-0">
                  v1.6.2 الأوفر هول الشامل
                </span>
              )}
              {isMobile && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
            </div>
            {!isMobile && (
              <p className="text-[11px] text-gray-400 truncate">
                الجسر اللحظي للحافظة والملفات بين حاسوبك وهاتفك عبر الشبكة المحلية
              </p>
            )}
          </div>
        </div>

        {/* Status Pill & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs">
            <Wifi
              className={`w-3.5 h-3.5 ${
                activePeers.length > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
              }`}
            />
            <span className="text-gray-300 font-medium text-[11px] sm:text-xs">
              {activePeers.length > 0
                ? isMobile
                  ? `${activePeers.length} متصل`
                  : `${activePeers.length} أجهزة متصلة`
                : 'الواي فاي جاهز'}
            </span>
          </div>

          <button
            onClick={async () => {
              const peers = await fetchDiscoveredPeers();
              setDevices((prev) => {
                const self = prev.find((d) => d.isSelf);
                const directPeers = prev.filter((d) => !d.isSelf && d.id.startsWith('direct_'));
                const merged = [...peers];
                for (const dp of directPeers) {
                  if (!merged.some((p) => p.id === dp.id || p.ip === dp.ip)) {
                    merged.push(dp);
                  }
                }
                return self ? [self, ...merged] : merged;
              });
              showToast('info', 'تم تحديث قائمة الأجهزة المتصلة');
            }}
            title="تحديث واستكشاف الأجهزة"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors otium-press"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            title="الإعدادات والتفضيلات"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors otium-press"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* NAVIGATION TAB BAR (SIMPLIFIED & CALM) */}
      {/* ========================================================= */}
      <nav className="flex items-center px-3 sm:px-4 pt-2 pb-1 border-b border-white/[0.06] bg-black/25 gap-2 shrink-0 justify-center">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-1.5 sm:gap-2 px-4 py-2 rounded-xl text-xs font-bold otium-tab-transition otium-press flex-1 sm:flex-initial justify-center ${
            activeTab === 'live'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>{isMobile ? 'الرئيسية' : 'الرئيسية والنقل'}</span>
        </button>

        <button
          onClick={() => setActiveTab('cast')}
          className={`flex items-center gap-1.5 sm:gap-2 px-4 py-2 rounded-xl text-xs font-bold otium-tab-transition otium-press flex-1 sm:flex-initial justify-center ${
            activeTab === 'cast'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/15'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Tv className="w-3.5 h-3.5 text-purple-400" />
          <span>{isMobile ? 'العرض' : 'العرض الذكي (Smart Cast)'}</span>
        </button>

        <button
          onClick={() => setActiveTab('vault')}
          className={`flex items-center gap-1.5 sm:gap-2 px-4 py-2 rounded-xl text-xs font-bold otium-tab-transition otium-press flex-1 sm:flex-initial justify-center ${
            activeTab === 'vault'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>{isMobile ? 'الخزينة' : 'السجل والخزينة'}</span>
          {clipboardHistory.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
              {clipboardHistory.length}
            </span>
          )}
        </button>
      </nav>

      {/* ========================================================= */}
      {/* MAIN CONTENT WORKSPACE */}
      {/* ========================================================= */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 overscroll-contain">
        {/* ========================================================= */}
        {/* TAB 1: LIVE RADAR & HUB (ADAPTIVE DESKTOP & MOBILE) */}
        {/* ========================================================= */}
        {activeTab === 'live' && (
          <div key="tab-live" className="animate-otium-enter">
            {/* Desktop Command Center Grid Layout (2 Columns on wide screens) */}
            <div className={`${isDesktop ? 'grid grid-cols-12 gap-4' : 'space-y-3.5'}`}>
              {/* Column 1: Radar & Peer Discovery (Desktop 5 cols / Mobile full) */}
              <div className={`${isDesktop ? 'col-span-5 space-y-4' : 'space-y-3.5'}`}>
                {/* Visual Radar Scanner */}
                <RadarVisualizer
                  devices={devices}
                  selectedPeerId={selectedPeerId}
                  onSelectPeer={(id) => {
                    setSelectedPeerId(id);
                    playDropChime(appSettings.audioFeedback, appSettings.soundVolume);
                  }}
                  onOpenDirectConnect={() => setIsDirectConnectOpen(true)}
                  onLaunchRemoteCast={handleLaunchRemoteCast}
                />

                {/* Quick Info Badge on Desktop */}
                {isDesktop && (
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-400 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-300">الجهاز النشط:</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {devices.find((d) => d.id === selectedPeerId)?.name || 'الكل'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-300">بروتوكول البث:</span>
                      <span className="text-gray-400 font-mono">P2P Mesh (UDP 42424 / TCP 42425)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: Live Universal Clipboard & File Dispatch (Desktop 7 cols / Mobile full) */}
              <div className={`${isDesktop ? 'col-span-7 space-y-4' : 'space-y-3.5'}`}>
                {/* Live Universal Clipboard Section */}
                <section className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                      <Copy className="w-4 h-4 text-emerald-400" />
                      <span>الحافظة الحية التلقائية (Live Clipboard Bridge)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Clean link privacy indicator */}
                      <div
                        title="درع الخصوصية لتطهير الروابط"
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-semibold"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>درع الخصوصية</span>
                      </div>

                      <div
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          appSettings.autoClipboardSync
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-white/5 text-gray-400 border-white/10'
                        }`}
                      >
                        {appSettings.autoClipboardSync ? 'المزامنة نشطة' : 'المزامنة يدوية'}
                      </div>
                    </div>
                  </div>

                  {/* Clean Link Stripped Notification */}
                  {cleanUrl(clipboardText).wasCleaned && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>تم تطهير بارامترات التتبع بنجاح (UTM / Tracking params)</span>
                    </div>
                  )}

                  {/* Textarea / Live Content Display */}
                  <div className="relative">
                    <textarea
                      value={clipboardText}
                      onChange={(e) => setClipboardText(e.target.value)}
                      placeholder="الصق أو اكتب أي نص هنا للإرسال اللحظي..."
                      rows={isMobile ? 3 : 4}
                      className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs sm:text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 font-sans resize-none transition-all"
                    />
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                      <span>{clipboardText.length} حرفاً</span>
                      <span>•</span>
                      <span>{new Blob([clipboardText]).size} B</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2.5 pt-0.5">
                    <button
                      onClick={() => handleTransmitClipboardText(clipboardText, false)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all otium-press"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isMobile ? 'إرسال للجهاز المقترن فوراً' : 'إرسال للجهاز المقترن فوراً (Ctrl+Enter)'}</span>
                    </button>

                    <button
                      onClick={() => handleCopyClipboard()}
                      className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 text-xs sm:text-sm font-semibold flex items-center gap-2 border border-white/[0.08] transition-colors otium-press shrink-0"
                    >
                      {copiedSuccess ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>نسخ الحافظة</span>
                        </>
                      )}
                    </button>
                  </div>
                </section>

                {/* Touch & Drag-and-Drop File Dispatch Section */}
                <section
                  onClick={() => fileInputRef.current?.click()}
                  className="otium-card rounded-2xl p-5 sm:p-6 border-2 border-dashed border-white/15 hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-2 group otium-press"
                >
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-8 h-8" />
                  </div>

                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      {isMobile ? 'اختيار ملفات أو صور للإرسال' : 'اسحب وأفلت أي ملف أو صورة للإرسال الفوري'}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm">
                      {isMobile
                        ? 'انقر لتحديد ملفات من هاتفك ونقلها بأعلى سرعة دون أي ضغط أو خوادم وسيطة'
                        : 'بدون أي ضغط للجودة، مع فحص سلامة البيانات بنظام CRC32 ونقل متدفق مباشر'}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="mt-1 px-4 py-2 rounded-xl bg-white/[0.06] group-hover:bg-emerald-500/20 text-gray-200 group-hover:text-emerald-300 text-xs font-semibold border border-white/[0.08] group-hover:border-emerald-500/30 transition-all otium-press"
                  >
                    <span>{isMobile ? 'تصفح الملفات في الهاتف' : 'أو اختر ملفاً من جهازك (Ctrl+O)'}</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      handleSendFiles(files);
                    }}
                  />
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: THE VAULT & HISTORY (CLIPBOARD & FILE TRANSFERS) */}
        {/* ========================================================= */}
        {activeTab === 'vault' && (
          <div key="tab-vault" className="animate-otium-enter space-y-4">
            {/* Vault Mode Sub-toggle */}
            <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10 max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => setVaultTab('clipboard')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all otium-press flex items-center justify-center gap-1.5 ${
                  vaultTab === 'clipboard'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>خزينة الحافظة ({clipboardHistory.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setVaultTab('transfers')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all otium-press flex items-center justify-center gap-1.5 ${
                  vaultTab === 'transfers'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>سجل الملفات ({transfers.length})</span>
              </button>
            </div>

            {vaultTab === 'clipboard' && (
              <section className="otium-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] space-y-4">
              {/* Header & Controls */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">خزينة سجل الحافظة المشفر محلياً</span>
                  <span className="text-xs text-gray-400 font-mono">({clipboardHistory.length} عنصر)</span>
                </div>

                {/* Search bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={clipboardSearch}
                    onChange={(e) => setClipboardSearch(e.target.value)}
                    placeholder="بحث في سجل الحافظة..."
                    className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setClipboardFilter('all')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors otium-press shrink-0 ${
                    clipboardFilter === 'all'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  الكل ({clipboardHistory.length})
                </button>
                <button
                  onClick={() => setClipboardFilter('url')}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg font-semibold transition-colors otium-press shrink-0 ${
                    clipboardFilter === 'url'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  <Link className="w-3 h-3" />
                  <span>روابط</span>
                </button>
                <button
                  onClick={() => setClipboardFilter('text')}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg font-semibold transition-colors otium-press shrink-0 ${
                    clipboardFilter === 'text'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>نصوص</span>
                </button>
                <button
                  onClick={() => setClipboardFilter('code')}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg font-semibold transition-colors otium-press shrink-0 ${
                    clipboardFilter === 'code'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  <Code className="w-3 h-3" />
                  <span>أكواد برمجية</span>
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3 text-xs hover:bg-white/[0.04] transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          item.type === 'url'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : item.type === 'code'
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-cyan-500/10 text-cyan-400'
                        }`}
                      >
                        {item.type === 'url' ? (
                          <Link className="w-3.5 h-3.5" />
                        ) : item.type === 'code' ? (
                          <Code className="w-3.5 h-3.5" />
                        ) : (
                          <FileText className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="text-right min-w-0 flex-1">
                        <span className="font-sans text-gray-200 block truncate">{item.text}</span>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          <span>{formatTimestamp(item.timestamp)}</span>
                          {item.isCleanedUrl && (
                            <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-semibold">
                              تطهير UTM
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleTransmitClipboardText(item.text, false)}
                        title="إرسال للجهاز المقترن"
                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors otium-press"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleCopyClipboard(item.text, item.id)}
                        title="نسخ النص"
                        className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors otium-press"
                      >
                        {copiedHistoryId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          removeClipboardHistoryItem(item.id);
                          setClipboardHistory(loadClipboardHistory());
                        }}
                        title="حذف هذا العنصر"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-white/5 transition-colors otium-press"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

            {vaultTab === 'transfers' && (
            <section className="otium-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>سجل النقل اللحظي والملفات المتبادلة</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openDownloadsFolder()}
                    title="فتح مجلد التنزيلات"
                    className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-emerald-400 hover:text-emerald-300 transition-colors text-[11px] font-semibold flex items-center gap-1.5 otium-press"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>مجلد التنزيلات</span>
                  </button>
                  <span className="text-[10px] text-gray-400 font-mono">{transfers.length} عناصر</span>
                  <button
                    onClick={handleClearHistory}
                    title="مسح السجل"
                    className="p-1 rounded-md text-gray-500 hover:text-rose-400 hover:bg-white/[0.05] transition-colors text-[10px] flex items-center gap-1 otium-press"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>مسح</span>
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
                                className="bg-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${Math.round(item.progress * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 mr-3">
                      {item.path && (
                        <>
                          <button
                            onClick={() => openLocalFile(item.path!)}
                            title="فتح الملف مباشرة"
                            className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors otium-press"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDownloadsFolder()}
                            title="عرض في مجلد التنزيلات"
                            className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-emerald-400 hover:text-emerald-300 transition-colors otium-press"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {item.type !== 'file' && (
                        <button
                          onClick={() => handleCopyClipboard(item.name)}
                          title="نسخ مجدداً"
                          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white transition-colors otium-press"
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
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SMART CAST & PRESENTATION (CLASSROOM & SMART BOARD) */}
        {/* ========================================================= */}
        {activeTab === 'cast' && (
          <div key="tab-cast" className="animate-otium-enter">
            <SmartCastView showToast={showToast} isMobile={isMobile} />
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* ADAPTIVE FOOTER INFO */}
      {/* ========================================================= */}
      <footer className="otium-chrome px-4 py-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-gray-400 shrink-0 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-1.5 text-emerald-400/90 font-medium truncate">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">
            {isMobile
              ? 'تشفير محلي تام • رخصة GNU GPL v3'
              : 'منظومة Otium — تشفير محلي تام بدون أي خوادم سحابية | رخصة GNU GPL v3'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              openDownloadsFolder();
              showToast('info', 'تم فتح مجلد التنزيلات');
            }}
            className="flex items-center gap-1 hover:text-emerald-400 transition-colors otium-press"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{isMobile ? 'التنزيلات' : 'مجلد التنزيلات (Ctrl+D)'}</span>
          </button>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}
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

      <DirectConnectModal
        isOpen={isDirectConnectOpen}
        onClose={() => setIsDirectConnectOpen(false)}
        onAddDirectPeer={handleDirectPeerAdded}
        selfDevice={selfDevice}
      />
    </div>
  );
};
