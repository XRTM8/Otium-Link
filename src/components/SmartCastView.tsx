import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Tv,
  Play,
  Square,
  Copy,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Image as ImageIcon,
  Send,
  Radio,
  Check,
  Eye,
  Crosshair,
  FileText,
  Lock,
  UploadCloud,
  RefreshCw,
  QrCode,
  Smartphone,
  Sparkles,
  Maximize2,
  PenTool,
  Eraser,
  Clock,
  Pause,
  Sun,
} from 'lucide-react';
import {
  CastInfo,
  SlideData,
  startCastServer,
  stopCastServer,
  fetchCastInfo,
  setCastSlideIndex,
  setCastSlides,
  updateCastLaser,
  broadcastCastMessage,
  openExternalUrl,
  sendCastDraw,
  clearCastCanvas,
} from '../core/tauriBridge';
import { convertPdfToSlides } from '../core/pdfSlideConverter';

interface SmartCastViewProps {
  showToast: (type: 'success' | 'info' | 'warning', title: string, description?: string) => void;
  isMobile: boolean;
}

export const SmartCastView: React.FC<SmartCastViewProps> = ({ showToast, isMobile }) => {
  const [castInfo, setCastInfo] = useState<CastInfo>({
    is_running: false,
    port: 42426,
    local_ip: '127.0.0.1',
    url: 'http://127.0.0.1:42426',
    pin: '',
    connected_viewers: 0,
    current_slide: 0,
    total_slides: 1,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [enablePin, setEnablePin] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMdns, setCopiedMdns] = useState(false);
  const [isClickerActive, setIsClickerActive] = useState(true);

  // Screen WakeLock State
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  // Lecture Stopwatch State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // QR Code State
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);

  // PDF Slide Importer State
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [pdfProgressText, setPdfProgressText] = useState('');

  // Slides State
  const [slides, setSlides] = useState<SlideData[]>([
    {
      index: 0,
      total: 3,
      title: 'مقدمة في هندسة البرمجيات والأنظمة الموزعة',
      text: 'المحاضرة الأولى: بروتوكولات الاتصال اللحظي P2P والأنظمة المستقلة الخالية من الخوادم السحابية.',
      image_data: null,
    },
    {
      index: 1,
      total: 3,
      title: 'مخطط الربط الشبكي (Network Architecture)',
      text: 'استخدام تقنية UDP Broadcast للاكتشاف التلقائي مع خادم TCP متدفق لنقل الملفات والشاشات.',
      image_data: null,
    },
    {
      index: 2,
      total: 3,
      title: 'الخلاصة والنتائج الأكاديمية',
      text: 'تحقيق استقلالية تامة بنسبة 100% وزمن استجابة أقل من 50ms بدون إنترنت.',
      image_data: null,
    },
  ]);

  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);

  // Urgent Broadcast Message State
  const [urgentMsg, setUrgentMsg] = useState('');

  // Laser vs Pen Annotation Mode State
  const [interactionMode, setInteractionMode] = useState<'laser' | 'pen'>('laser');
  const [penColor, setPenColor] = useState('#ef4444');
  const trackpadRef = useRef<HTMLDivElement>(null);
  const [isLaserActive, setIsLaserActive] = useState(false);
  const [laserPos, setLaserPos] = useState({ x: 0.5, y: 0.5 });
  const lastDrawPos = useRef<{ x: number; y: number } | null>(null);

  // Slide Image Input
  const slideImageInputRef = useRef<HTMLInputElement>(null);

  // Initial Cast info fetch
  useEffect(() => {
    fetchCastInfo().then((info) => {
      setCastInfo(info);
      if (info.is_running) {
        setCurrentSlideIdx(info.current_slide);
        setIsTimerRunning(true);
      }
    });
  }, []);

  // Screen Wake Lock API to prevent phone screen dimming/sleeping during classroom presentation
  useEffect(() => {
    let wakeLockSentinel: any = null;
    const requestWake = async () => {
      if (castInfo.is_running && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          setIsWakeLockActive(true);
        } catch {
          setIsWakeLockActive(false);
        }
      }
    };

    if (castInfo.is_running) {
      requestWake();
    } else {
      setIsWakeLockActive(false);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && castInfo.is_running) {
        requestWake();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [castInfo.is_running]);

  // Stopwatch Timer for Presentations
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate QR Code when running
  useEffect(() => {
    if (castInfo.is_running && castInfo.url) {
      QRCode.toDataURL(castInfo.url, {
        margin: 1,
        width: 256,
        color: {
          dark: '#030712',
          light: '#10b981',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    } else {
      setQrDataUrl('');
    }
  }, [castInfo.is_running, castInfo.url]);

  const triggerHaptic = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
    } catch {
      // ignore
    }
  };

  const handleToggleCast = async () => {
    setIsLoading(true);
    try {
      if (castInfo.is_running) {
        await stopCastServer();
        setCastInfo((prev) => ({ ...prev, is_running: false, connected_viewers: 0 }));
        setIsTimerRunning(false);
        showToast('info', 'تم إيقاف العرض على السبورة الذكية');
      } else {
        const pinCode = enablePin
          ? Math.floor(1000 + Math.random() * 9000).toString()
          : '';
        const info = await startCastServer(pinCode);
        setCastInfo(info);
        setIsTimerRunning(true);
        // Upload initial slides
        await setCastSlides(slides);
        showToast('success', 'تم بدء العرض الذكي بنجاح!', `الرابط: ${info.url}`);
      }
    } catch (err: any) {
      showToast('warning', 'تعذر تشغيل العرض الذكي', String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(castInfo.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      showToast('success', 'تم نسخ رابط السبورة الذكية');
    }
  };

  const handleCopyMdns = () => {
    const mdnsUrl = `http://otium.local:${castInfo.port}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mdnsUrl);
      setCopiedMdns(true);
      setTimeout(() => setCopiedMdns(false), 2000);
      showToast('success', 'تم نسخ الرابط المختصر', mdnsUrl);
    }
  };

  const handleNextSlide = async () => {
    if (currentSlideIdx < slides.length - 1) {
      const next = currentSlideIdx + 1;
      setCurrentSlideIdx(next);
      triggerHaptic();
      await setCastSlideIndex(next);
    }
  };

  const handlePrevSlide = async () => {
    if (currentSlideIdx > 0) {
      const prev = currentSlideIdx - 1;
      setCurrentSlideIdx(prev);
      triggerHaptic();
      await setCastSlideIndex(prev);
    }
  };

  const handleSelectSlide = async (idx: number) => {
    setCurrentSlideIdx(idx);
    triggerHaptic();
    await setCastSlideIndex(idx);
  };

  // Keyboard & MediaSession Clicker Controller
  useEffect(() => {
    if (!castInfo.is_running || !isClickerActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        handlePrevSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: slides[currentSlideIdx]?.title || 'شريحة العرض',
          artist: 'Otium Smart Cast',
          album: `شريحة ${currentSlideIdx + 1} من ${slides.length}`,
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          handleNextSlide();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          handlePrevSlide();
        });
      } catch {
        // mediaSession not supported
      }
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [castInfo.is_running, isClickerActive, currentSlideIdx, slides.length]);

  const handleAddSlide = () => {
    const newIdx = slides.length;
    const newSlide: SlideData = {
      index: newIdx,
      total: newIdx + 1,
      title: `شريحة جديدة #${newIdx + 1}`,
      text: 'اكتب نص الشريحة أو ارفع صورة لعرضها على السبورة الذكية.',
      image_data: null,
    };
    const updated = [...slides, newSlide].map((s, i, arr) => ({
      ...s,
      index: i,
      total: arr.length,
    }));
    setSlides(updated);
    setCurrentSlideIdx(newIdx);
    setCastSlides(updated);
    setCastSlideIndex(newIdx);
    showToast('info', `تمت إضافة شريحة #${newIdx + 1}`);
  };

  // Direct PDF Import Handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsConvertingPdf(true);
    setPdfProgressText('جاري قراءة ملف المحاضرة...');
    try {
      const importedSlides = await convertPdfToSlides(file, (current, total) => {
        setPdfProgressText(`تحويل صفحة ${current} من ${total}...`);
      });

      if (importedSlides.length === 0) {
        showToast('warning', 'لم يتم العثور على صفحات قابلة للتحويل في ملف الـ PDF');
        return;
      }

      setSlides(importedSlides);
      setCurrentSlideIdx(0);
      await setCastSlides(importedSlides);
      await setCastSlideIndex(0);
      showToast(
        'success',
        'تم استيراد المحاضرة بنجاح!',
        `تم تحويل ${importedSlides.length} صفحة من ملف "${file.name}" إلى شرائح عرض.`
      );
    } catch (err: any) {
      showToast('warning', 'تعذر استيراد ملف الـ PDF', String(err));
    } finally {
      setIsConvertingPdf(false);
      setPdfProgressText('');
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleDeleteSlide = (idx: number) => {
    if (slides.length <= 1) {
      showToast('warning', 'لا يمكن حذف الشريحة الوحيدة');
      return;
    }
    const updated = slides
      .filter((_, i) => i !== idx)
      .map((s, i, arr) => ({ ...s, index: i, total: arr.length }));
    setSlides(updated);
    const nextIdx = Math.min(currentSlideIdx, updated.length - 1);
    setCurrentSlideIdx(nextIdx);
    setCastSlides(updated);
    setCastSlideIndex(nextIdx);
  };

  const handleUpdateSlideContent = (title: string, text: string) => {
    const updated = slides.map((s, i) =>
      i === currentSlideIdx ? { ...s, title, text } : s
    );
    setSlides(updated);
    setCastSlides(updated);
  };

  // Image Slide Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const updated = slides.map((s, i) =>
        i === currentSlideIdx ? { ...s, image_data: base64 } : s
      );
      setSlides(updated);
      await setCastSlides(updated);
      showToast('success', 'تم تحميل صورة الشريحة للسبورة بنجاح');
    };
    reader.readAsDataURL(file);
  };

  // Virtual Laser & Pen Trackpad Handlers
  const handleTrackpadMove = (clientX: number, clientY: number) => {
    if (!trackpadRef.current) return;
    const rect = trackpadRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    if (interactionMode === 'laser') {
      setLaserPos({ x, y });
      updateCastLaser(x, y, true);
    } else {
      // Pen Annotation Drawing
      if (lastDrawPos.current) {
        sendCastDraw(lastDrawPos.current.x, lastDrawPos.current.y, x, y, penColor, 3.5, false);
      }
      lastDrawPos.current = { x, y };
    }
  };

  const handleTrackpadEnd = () => {
    if (interactionMode === 'laser') {
      setIsLaserActive(false);
      updateCastLaser(laserPos.x, laserPos.y, false);
    } else {
      if (lastDrawPos.current) {
        sendCastDraw(lastDrawPos.current.x, lastDrawPos.current.y, lastDrawPos.current.x, lastDrawPos.current.y, penColor, 3.5, true);
      }
      lastDrawPos.current = null;
    }
  };

  const handleClearDrawings = async () => {
    await clearCastCanvas();
    showToast('info', 'تم مسح التأشيرات والرسومات من السبورة');
  };

  const handleBroadcastUrgent = async () => {
    const trimmed = urgentMsg.trim();
    if (!trimmed) return;
    await broadcastCastMessage(trimmed, true);
    showToast('success', 'تم بث التنبيه للسبورة الذكية فوراً');
    setUrgentMsg('');
  };

  return (
    <div className="space-y-4 animate-otium-enter">
      {/* ========================================================= */}
      {/* SECTION 1: CAST STATUS & CONTROL BANNER */}
      {/* ========================================================= */}
      <section className="otium-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                castInfo.is_running
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                  : 'bg-white/5 border border-white/10 text-slate-400'
              }`}
            >
              <Tv className={`w-6 h-6 ${castInfo.is_running ? 'animate-pulse' : ''}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  العرض اللاسلكي على السبورة الذكية (Smart Cast)
                </h2>
                {castInfo.is_running && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>البث مباشر</span>
                  </span>
                )}
                {isWakeLockActive && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title="شاشة الهاتف ستبقى مضيئة طوال فترة العرض">
                    <Sun className="w-3 h-3 text-amber-400 animate-spin" />
                    <span>الشاشة مضيئة</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {castInfo.is_running
                  ? 'السبورة تستقبل البث الآن — يمكنك التنقل بين الشرائح والتحكم بالليزر والرسم التفاعلي'
                  : 'اعرض أبحاثك وشرائحك على شاشة القاعة بدون أسلاك وبدون إنترنت'}
              </p>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Lecture Stopwatch Pill */}
            {castInfo.is_running && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono font-bold text-white">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{formatTimer(timerSeconds)}</span>
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                  title={isTimerRunning ? 'إيقاف المؤقت مؤقتاً' : 'استئناف المؤقت'}
                >
                  {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white" />}
                </button>
              </div>
            )}

            {!castInfo.is_running && (
              <button
                type="button"
                onClick={() => setEnablePin(!enablePin)}
                className={`py-2 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                  enablePin
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
                title="طلب رمز PIN للأمان لمنع المتطفلين من الاتصال بالسبورة"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{enablePin ? 'رمز PIN مفعّل' : 'تفعيل رمز PIN'}</span>
              </button>
            )}

            <button
              onClick={handleToggleCast}
              disabled={isLoading}
              className={`flex-1 sm:flex-initial py-2.5 px-6 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all otium-press ${
                castInfo.is_running
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 shadow-rose-500/10'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {castInfo.is_running ? (
                <>
                  <Square className="w-4 h-4 fill-rose-300" />
                  <span>إيقاف العرض</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>بدء العرض على السبورة</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live URL & Fast Access Bar (When Running) */}
        {castInfo.is_running && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs text-slate-400">افتح الرابط في متصفح السبورة:</span>

              {/* IP Direct Address */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/50 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold dir-ltr">
                <span>{castInfo.url}</span>
              </div>
              <button
                onClick={handleCopyUrl}
                title="نسخ عنوان الـ IP"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors otium-press"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>

              {/* mDNS Friendly Address */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-mono text-xs dir-ltr">
                <span>otium.local:{castInfo.port}</span>
              </div>
              <button
                onClick={handleCopyMdns}
                title="نسخ الرابط المختصر (mDNS)"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors otium-press"
              >
                {copiedMdns ? <Check className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
              </button>

              {/* Open Receiver Window / Browser */}
              <button
                onClick={() => openExternalUrl(castInfo.url)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors otium-press"
                title="عرض في المتصفح أو ملء الشاشة على هذا الحاسوب"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>شاشة العرض (Receiver)</span>
              </button>

              {/* QR Code Quick Pill */}
              {qrDataUrl && (
                <button
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-colors otium-press"
                  title="إظهار باركود QR للمسح بكاميرا الهاتف أو السبورة"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>رمز QR</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {castInfo.pin && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-slate-400">رمز PIN:</span>
                  <span className="font-mono font-bold text-amber-300">{castInfo.pin}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold">
                <Eye className="w-3.5 h-3.5" />
                <span>{castInfo.connected_viewers} شاشة متصلة</span>
              </div>
            </div>
          </div>
        )}

        {/* Presenter Clicker Mode Banner */}
        {castInfo.is_running && (
          <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>جهاز التحكم (Clicker):</strong> استخدم أزرار الكيبورد (الأسهم / Space) أو ريموت البلوتوث للتنقل مع اهتزاز لمسي.
              </span>
            </div>
            <button
              onClick={() => setIsClickerActive(!isClickerActive)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                isClickerActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/5 text-slate-400 border border-white/10'
              }`}
            >
              {isClickerActive ? 'مفعّل ⚡' : 'معطّل'}
            </button>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* SECTION 2: PRESENTER DECK & SLIDE MANAGER */}
      {/* ========================================================= */}
      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-12'} gap-4`}>
        {/* Slides Controller (7 cols on desktop) */}
        <section className={`${isMobile ? '' : 'col-span-7'} otium-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">شرائح العرض والمستندات</h3>
              <span className="text-xs text-slate-400 font-mono">
                ({currentSlideIdx + 1} / {slides.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Direct PDF Slide Import Button */}
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={isConvertingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-xs font-bold transition-all otium-press"
                title="استيراد ملف المحاضرة بالكامل (PDF) وتحويل كل صفحة لشريحة عرض تلقائياً"
              >
                {isConvertingPdf ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5 text-purple-300" />
                )}
                <span>{isConvertingPdf ? pdfProgressText : 'استيراد PDF للمحاضرة'}</span>
              </button>

              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />

              {/* Add Single Slide */}
              <button
                onClick={handleAddSlide}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors otium-press"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>شريحة جديدة</span>
              </button>
            </div>
          </div>

          {/* Slide Deck Navigation Bar */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <button
              onClick={handlePrevSlide}
              disabled={currentSlideIdx === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-200 text-xs font-bold transition-all otium-press"
            >
              <ChevronRight className="w-4 h-4" />
              <span>السابق</span>
            </button>

            {/* Slide Mini Thumbnails Indicator */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-[200px] sm:max-w-xs py-1">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSlide(idx)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all otium-press shrink-0 flex items-center justify-center ${
                    idx === currentSlideIdx
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 scale-105'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            <button
              onClick={handleNextSlide}
              disabled={currentSlideIdx === slides.length - 1}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-200 text-xs font-bold transition-all otium-press"
            >
              <span>التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Active Slide Content Editor */}
          <div className="space-y-3 p-3.5 rounded-xl bg-black/30 border border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">عنوان الشريحة الحالية:</label>
              <button
                onClick={() => handleDeleteSlide(currentSlideIdx)}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                title="حذف هذه الشريحة"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف</span>
              </button>
            </div>

            <input
              type="text"
              value={slides[currentSlideIdx]?.title || ''}
              onChange={(e) =>
                handleUpdateSlideContent(e.target.value, slides[currentSlideIdx]?.text || '')
              }
              placeholder="مثال: مقدمة في البحث الأكاديمي..."
              className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500/50"
            />

            <label className="text-xs font-semibold text-slate-300 block">نص المحاضرة أو الشرح:</label>
            <textarea
              value={slides[currentSlideIdx]?.text || ''}
              onChange={(e) =>
                handleUpdateSlideContent(slides[currentSlideIdx]?.title || '', e.target.value)
              }
              placeholder="اكتب نقاط الشريحة بالتفصيل..."
              rows={isMobile ? 3 : 4}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none font-sans"
            />

            {/* Image Slide Thumbnail & Upload Button */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => slideImageInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors otium-press"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {slides[currentSlideIdx]?.image_data ? 'تغيير صورة الشريحة' : 'إرفاق صورة للشريحة'}
                  </span>
                </button>

                <input
                  ref={slideImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />

                {slides[currentSlideIdx]?.image_data && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = slides.map((s, i) =>
                        i === currentSlideIdx ? { ...s, image_data: null } : s
                      );
                      setSlides(updated);
                      setCastSlides(updated);
                    }}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    إزالة الصورة
                  </button>
                )}
              </div>

              {/* Render small preview if image exists */}
              {slides[currentSlideIdx]?.image_data && (
                <div className="relative rounded-xl overflow-hidden border border-white/10 max-h-36 bg-black/50 flex items-center justify-center">
                  <img
                    src={slides[currentSlideIdx].image_data!}
                    alt="معاينة الشريحة"
                    className="max-h-36 object-contain"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Laser & Pen Interactive Controller (5 cols on desktop) */}
        <div className={`${isMobile ? '' : 'col-span-5'} space-y-4`}>
          {/* Dual Laser / Pen Trackpad */}
          <section className="otium-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {interactionMode === 'laser' ? (
                  <Crosshair className="w-4 h-4 text-rose-400" />
                ) : (
                  <PenTool className="w-4 h-4 text-emerald-400" />
                )}
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  {interactionMode === 'laser' ? 'مؤشر الليزر الافتراضي' : 'قلم التأشير والرسم الحي'}
                </h3>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setInteractionMode('laser')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    interactionMode === 'laser'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ليزر
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionMode('pen')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    interactionMode === 'pen'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  قلم
                </button>
              </div>
            </div>

            {/* Pen Options (Colors and Clear) */}
            {interactionMode === 'pen' && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">لون القلم:</span>
                  {['#ef4444', '#10b981', '#f59e0b', '#3b82f6'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPenColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        penColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleClearDrawings}
                  className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-semibold transition-colors"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>مسح الرسم</span>
                </button>
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {interactionMode === 'laser'
                ? 'اسحب إصبعك داخل هذه المنطقة، وستتحرك نقطة ليزر حمراء ساطعة على السبورة الذكية في الوقت الحقيقي!'
                : 'ارسم أو ضع دوائر وتأشيرات بإصبعك، وستظهر خطوط الرسم فوراً على شاشة السبورة أمام الطلاب!'}
            </p>

            {/* Touchpad Area */}
            <div
              ref={trackpadRef}
              onMouseDown={(e) => {
                setIsLaserActive(true);
                handleTrackpadMove(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                if (isLaserActive || lastDrawPos.current) handleTrackpadMove(e.clientX, e.clientY);
              }}
              onMouseUp={handleTrackpadEnd}
              onTouchStart={(e) => {
                setIsLaserActive(true);
                if (e.touches[0]) handleTrackpadMove(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchMove={(e) => {
                if (e.touches[0]) handleTrackpadMove(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchEnd={handleTrackpadEnd}
              className={`relative w-full aspect-video rounded-xl bg-black/60 border-2 border-dashed transition-colors cursor-crosshair flex items-center justify-center overflow-hidden touch-none ${
                interactionMode === 'laser'
                  ? 'border-rose-500/30 hover:border-rose-500/60'
                  : 'border-emerald-500/30 hover:border-emerald-500/60'
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                {interactionMode === 'laser' ? (
                  <Crosshair className="w-8 h-8 text-rose-400" />
                ) : (
                  <PenTool className="w-8 h-8 text-emerald-400" />
                )}
              </div>

              {/* Cursor Representation */}
              {isLaserActive && interactionMode === 'laser' && (
                <div
                  className="absolute w-4 h-4 rounded-full bg-rose-500 shadow-lg shadow-rose-500 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${laserPos.x * 100}%`, top: `${laserPos.y * 100}%` }}
                />
              )}

              <span className="text-[11px] text-slate-500 pointer-events-none select-none">
                {interactionMode === 'laser'
                  ? isLaserActive ? 'الليزر نشط على السبورة 🔴' : 'المس واسحب لتحريك الليزر'
                  : 'المس واسحب للرسم الحي على السبورة ✍️'}
              </span>
            </div>
          </section>

          {/* Quick Classroom Announcement */}
          <section className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">تنبيه عاجل على السبورة</h3>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={urgentMsg}
                onChange={(e) => setUrgentMsg(e.target.value)}
                placeholder="اكتب رسالة تظهر فوراً على شاشة القاعة..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
              <button
                type="button"
                onClick={handleBroadcastUrgent}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all otium-press shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>بث</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL: QR CODE ENLARGED VIEW */}
      {/* ========================================================= */}
      {showQrModal && qrDataUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-otium-fade"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="otium-card max-w-sm w-full p-6 rounded-3xl border border-emerald-500/30 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <span>رمز الاستجابة السريعة (QR)</span>
              </h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-white/5"
              >
                إغلاق
              </button>
            </div>

            <p className="text-xs text-slate-400">
              وجّه كاميرا الهاتف أو جهاز السبورة الذكية نحو الرمز لفتح العرض مباشرة:
            </p>

            <div className="p-3 bg-white rounded-2xl inline-block shadow-2xl">
              <img src={qrDataUrl} alt="رابط العرض الذكي" className="w-56 h-56 mx-auto" />
            </div>

            <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-xl border border-emerald-500/20 truncate dir-ltr">
              {castInfo.url}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
