import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Tv,
  Play,
  Square,
  ChevronRight,
  ChevronLeft,
  Send,
  Radio,
  Crosshair,
  FileText,
  Lock,
  UploadCloud,
  RefreshCw,
  QrCode,
  Maximize2,
  PenTool,
  Eraser,
  Clock,
  Sun,
  X,
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
  isMobile?: boolean;
}

export const SmartCastView: React.FC<SmartCastViewProps> = ({ showToast }) => {
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
  const isClickerActive = true;

  // Screen WakeLock State
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  // Lecture Stopwatch State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // QR Code & Modals State
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showTouchpadDrawer, setShowTouchpadDrawer] = useState(false);

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

  // Screen Wake Lock API
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
        showToast('info', 'تم إيقاف العرض على السبورة');
      } else {
        const pinCode = enablePin ? Math.floor(1000 + Math.random() * 9000).toString() : '';
        const info = await startCastServer(pinCode);
        setCastInfo(info);
        setIsTimerRunning(true);
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

  const handleClearDrawings = async () => {
    try {
      await clearCastCanvas();
      showToast('info', 'تم مسح التأشيرات والرسومات من الشاشة');
    } catch {
      showToast('warning', 'تعذر مسح الرسومات');
    }
  };

  // Keyboard Clicker Handler
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [castInfo.is_running, isClickerActive, currentSlideIdx, slides.length]);

  // PDF Import
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsConvertingPdf(true);
    setPdfProgressText('جاري قراءة المحاضرة...');
    try {
      const importedSlides = await convertPdfToSlides(file, (current, total) => {
        setPdfProgressText(`تحويل صفحة ${current} من ${total}...`);
      });

      if (importedSlides.length === 0) {
        showToast('warning', 'لم يتم العثور على صفحات في ملف الـ PDF');
        return;
      }

      setSlides(importedSlides);
      setCurrentSlideIdx(0);
      await setCastSlides(importedSlides);
      await setCastSlideIndex(0);
      showToast('success', 'تم استيراد المحاضرة بنجاح!', `تم تحويل ${importedSlides.length} صفحة.`);
    } catch (err: any) {
      showToast('warning', 'تعذر استيراد ملف الـ PDF', String(err));
    } finally {
      setIsConvertingPdf(false);
      setPdfProgressText('');
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  // Laser / Pen Trackpad Handlers
  const handleTrackpadMove = (clientX: number, clientY: number) => {
    if (!trackpadRef.current) return;
    const rect = trackpadRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    if (interactionMode === 'laser') {
      setLaserPos({ x, y });
      updateCastLaser(x, y, true);
    } else {
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

  const handleBroadcastUrgent = async () => {
    const trimmed = urgentMsg.trim();
    if (!trimmed) return;
    await broadcastCastMessage(trimmed, true);
    showToast('success', 'تم بث التنبيه للسبورة فوراً');
    setUrgentMsg('');
    setShowAlertModal(false);
  };

  const currentSlide = slides[currentSlideIdx];

  // =========================================================
  // VIEW 1: PRE-PRESENTATION SETUP (ZEN & MINIMAL)
  // =========================================================
  if (!castInfo.is_running) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-otium-enter py-2 sm:py-6">
        {/* Hero Welcome Card */}
        <div className="otium-card rounded-3xl p-6 sm:p-8 border border-white/[0.08] text-center space-y-4 relative overflow-hidden shadow-2xl">
          <div className="w-16 h-16 rounded-3xl bg-purple-500/15 border border-purple-500/30 text-purple-400 mx-auto flex items-center justify-center shadow-lg shadow-purple-500/10">
            <Tv className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-white">العرض الذكي على السبورة (Smart Cast)</h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              اعرض شرائحك وأبحاثك على شاشات القاعات والسبورات الذكية لاسلكياً بدون أي كابلات وبدون إنترنت.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <button
              onClick={handleToggleCast}
              disabled={isLoading}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-2.5 mx-auto shadow-xl shadow-blue-600/30 transition-all otium-press"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>بدء البث على السبورة الآن</span>
            </button>
          </div>

          {/* Setup Actions Row */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-3 border-t border-white/[0.06]">
            {/* Direct PDF Import */}
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={isConvertingPdf}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 text-xs font-bold transition-all otium-press"
            >
              {isConvertingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 text-indigo-300" />}
              <span>{isConvertingPdf ? pdfProgressText : 'استيراد المحاضرة (PDF)'}</span>
            </button>

            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />

            {/* PIN Security Toggle */}
            <button
              type="button"
              onClick={() => setEnablePin(!enablePin)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border ${
                enablePin
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{enablePin ? 'رمز PIN مفعّل' : 'حماية برمز PIN'}</span>
            </button>

            {/* Receiver window */}
            <button
              type="button"
              onClick={() => openExternalUrl(castInfo.url)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 flex items-center gap-1.5 transition-colors otium-press"
            >
              <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
              <span>معاينة شاشة العرض</span>
            </button>
          </div>
        </div>

        {/* Slides Quick Deck Summary */}
        <div className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>الشرائح المجهزة للعرض ({slides.length})</span>
            </span>
            <span>جاهزة للبث الفوري</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {slides.map((s, idx) => (
              <div
                key={idx}
                className="shrink-0 w-28 h-20 rounded-xl bg-black/40 border border-white/10 p-2 flex flex-col justify-between text-[10px]"
              >
                <span className="font-bold text-slate-200 truncate">{s.title || `شريحة ${idx + 1}`}</span>
                <span className="font-mono text-blue-400">#{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // VIEW 2: ACTIVE CLASSROOM PRESENTER REMOTE (THE APPLE / MINIMAL REMOTE)
  // =========================================================
  return (
    <div className="max-w-xl mx-auto space-y-4 animate-otium-enter pb-8">
      {/* Top Remote Status Pill Bar */}
      <div className="otium-card rounded-2xl p-3 border border-white/[0.08] flex items-center justify-between gap-2 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <span>البث مباشر</span>
              {isWakeLockActive && <Sun className="w-3 h-3 text-amber-400 animate-spin" />}
            </div>
            <button
              onClick={handleCopyUrl}
              className="text-[11px] text-slate-400 hover:text-blue-400 font-mono truncate block text-right dir-ltr"
            >
              {castInfo.url} {copiedUrl ? '✓' : ''}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Stopwatch */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 font-mono text-xs font-bold text-white">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{formatTimer(timerSeconds)}</span>
          </div>

          {/* QR Button */}
          {qrDataUrl && (
            <button
              onClick={() => setShowQrModal(true)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
              title="باركود الدخول"
            >
              <QrCode className="w-4 h-4 text-blue-400" />
            </button>
          )}

          {/* Stop Cast Button */}
          <button
            onClick={handleToggleCast}
            className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300"
            title="إيقاف البث"
          >
            <Square className="w-4 h-4 fill-rose-300" />
          </button>
        </div>
      </div>

      {/* Hero Slide Canvas (Clean, Focused View) */}
      <div className="otium-card rounded-3xl p-5 sm:p-6 border border-white/[0.08] text-center space-y-3 relative overflow-hidden shadow-2xl min-h-[220px] flex flex-col justify-center items-center">
        <span className="text-[11px] font-mono font-bold text-blue-400 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
          الشريحة {currentSlideIdx + 1} من {slides.length}
        </span>

        {currentSlide?.image_data ? (
          <div className="w-full max-h-56 rounded-2xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center my-1">
            <img src={currentSlide.image_data} alt="الشريحة" className="max-h-56 object-contain" />
          </div>
        ) : (
          <div className="space-y-2 py-4 max-w-md mx-auto">
            <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
              {currentSlide?.title || `شريحة #${currentSlideIdx + 1}`}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed line-clamp-3">
              {currentSlide?.text || 'شريحة عرض تفاعلية'}
            </p>
          </div>
        )}
      </div>

      {/* Massive Ergonomic Thumb Navigation Controls */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handlePrevSlide}
          disabled={currentSlideIdx === 0}
          className="py-4 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-25 disabled:pointer-events-none text-slate-200 font-bold text-sm flex items-center justify-center gap-2 border border-white/10 transition-all otium-press"
        >
          <ChevronRight className="w-5 h-5" />
          <span>السابقة</span>
        </button>

        <button
          onClick={handleNextSlide}
          disabled={currentSlideIdx === slides.length - 1}
          className="py-4 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-25 disabled:pointer-events-none text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all otium-press"
        >
          <span>التالية</span>
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Floating Presentation Tools Bar */}
      <div className="otium-card rounded-2xl p-2.5 border border-white/[0.08] flex items-center justify-around gap-1 text-xs text-slate-300">
        <button
          onClick={() => {
            setInteractionMode('laser');
            setShowTouchpadDrawer(!showTouchpadDrawer || interactionMode !== 'laser');
          }}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 font-bold transition-all ${
            showTouchpadDrawer && interactionMode === 'laser'
              ? 'bg-rose-500 text-white shadow-md'
              : 'hover:bg-white/5 text-slate-300'
          }`}
        >
          <Crosshair className="w-4 h-4 text-rose-400" />
          <span>الليزر</span>
        </button>

        <button
          onClick={() => {
            setInteractionMode('pen');
            setShowTouchpadDrawer(!showTouchpadDrawer || interactionMode !== 'pen');
          }}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 font-bold transition-all ${
            showTouchpadDrawer && interactionMode === 'pen'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'hover:bg-white/5 text-slate-300'
          }`}
        >
          <PenTool className="w-4 h-4 text-indigo-400" />
          <span>القلم</span>
        </button>

        <button
          onClick={() => setShowAlertModal(true)}
          className="flex-1 py-2 rounded-xl hover:bg-white/5 text-slate-300 flex items-center justify-center gap-1.5 font-bold transition-colors"
        >
          <Send className="w-4 h-4 text-amber-400" />
          <span>تنبيه</span>
        </button>

        <button
          onClick={handleClearDrawings}
          className="flex-1 py-2 rounded-xl hover:bg-white/5 text-slate-300 flex items-center justify-center gap-1.5 font-bold transition-colors"
          title="مسح الرسم"
        >
          <Eraser className="w-4 h-4 text-slate-400" />
          <span>مسح</span>
        </button>
      </div>

      {/* Expandable Laser & Pen Touchpad Drawer */}
      {showTouchpadDrawer && (
        <div className="otium-card rounded-2xl p-4 border border-white/[0.08] space-y-3 animate-otium-enter">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-bold flex items-center gap-2">
              {interactionMode === 'laser' ? <Crosshair className="w-4 h-4 text-rose-400" /> : <PenTool className="w-4 h-4 text-indigo-400" />}
              <span>{interactionMode === 'laser' ? 'لوحة تحكم الليزر الحي' : 'لوحة الرسم والتأشير الحي'}</span>
            </span>
            {interactionMode === 'pen' && (
              <div className="flex items-center gap-1.5">
                {['#ef4444', '#10b981', '#f59e0b', '#3b82f6'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPenColor(c)}
                    className={`w-4 h-4 rounded-full transition-transform ${penColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-60'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

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
              interactionMode === 'laser' ? 'border-rose-500/40' : 'border-indigo-500/40'
            }`}
          >
            {isLaserActive && interactionMode === 'laser' && (
              <div
                className="absolute w-4 h-4 rounded-full bg-rose-500 shadow-lg shadow-rose-500 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${laserPos.x * 100}%`, top: `${laserPos.y * 100}%` }}
              />
            )}
            <span className="text-[11px] text-slate-500 pointer-events-none select-none">
              {interactionMode === 'laser' ? 'اسحب إصبعك لتحريك نقطة الليزر على السبورة 🔴' : 'ارسم بإصبعك للتأشير على السبورة ✍️'}
            </span>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && qrDataUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-otium-fade" onClick={() => setShowQrModal(false)}>
          <div className="otium-card max-w-sm w-full p-6 rounded-3xl border border-blue-500/30 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-400" />
                <span>رمز الدخول السريع</span>
              </h3>
              <button onClick={() => setShowQrModal(false)} className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-white rounded-2xl inline-block shadow-2xl">
              <img src={qrDataUrl} alt="QR Code" className="w-52 h-52 mx-auto" />
            </div>
            <p className="text-xs text-slate-400">امسح الكود بكاميرا السبورة أو الهاتف للفتح الفوري</p>
          </div>
        </div>
      )}

      {/* Urgent Message Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-otium-fade" onClick={() => setShowAlertModal(false)}>
          <div className="otium-card max-w-sm w-full p-6 rounded-3xl border border-amber-500/30 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                <span>إرسال تنبيه عاجل للسبورة</span>
              </h3>
              <button onClick={() => setShowAlertModal(false)} className="p-1 rounded-lg bg-white/5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={urgentMsg}
              onChange={(e) => setUrgentMsg(e.target.value)}
              placeholder="اكتب رسالة تظهر فوراً أعلى السبورة..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-500"
              autoFocus
            />
            <button
              onClick={handleBroadcastUrgent}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 otium-press"
            >
              <span>بث للسبورة الآن</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
