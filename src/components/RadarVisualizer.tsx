import React from 'react';
import { Laptop, Smartphone, Plus, Check, Tv, Wifi } from 'lucide-react';
import { Device } from '../core/types';

interface RadarVisualizerProps {
  devices: Device[];
  selectedPeerId: string | null;
  onSelectPeer: (id: string) => void;
  onOpenDirectConnect: () => void;
  onLaunchRemoteCast?: (peer: Device) => void;
}

export const RadarVisualizer: React.FC<RadarVisualizerProps> = ({
  devices,
  selectedPeerId,
  onSelectPeer,
  onOpenDirectConnect,
  onLaunchRemoteCast,
}) => {
  const activePeers = devices.filter((d) => !d.isSelf);
  const selfDevice = devices.find((d) => d.isSelf);
  const selectedPeer = activePeers.find((d) => d.id === selectedPeerId) || (activePeers.length > 0 ? activePeers[0] : null);

  // Calculate peer positions around orbital circle
  const getPeerCoordinates = (index: number, total: number) => {
    if (total === 1) return { x: 50, y: 22 };
    if (total === 2) {
      return index === 0 ? { x: 26, y: 34 } : { x: 74, y: 34 };
    }
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radius = 34; // Percentage from center
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x, y };
  };

  return (
    <div className="relative w-full rounded-3xl bg-[#0d101a]/80 backdrop-blur-2xl border border-white/[0.08] p-4 sm:p-5 overflow-hidden shadow-2xl shadow-black/40">
      {/* Ambient background glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6] animate-pulse" />
          <h3 className="text-xs font-bold text-white tracking-wide">الأجهزة القريبة</h3>
          <span className="text-[11px] text-slate-400 font-medium">
            ({activePeers.length})
          </span>
        </div>

        <button
          onClick={onOpenDirectConnect}
          title="الاتصال المباشر عبر عنوان IP"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-slate-300 hover:text-white transition-all otium-press"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>اتصال IP</span>
        </button>
      </div>

      {/* AirDrop-style Circular Radar Stage */}
      <div className="relative w-full max-w-[240px] sm:max-w-[280px] mx-auto aspect-square my-3 flex items-center justify-center">
        {/* Serene concentric orbital rings */}
        <div className="absolute inset-1 sm:inset-2 rounded-full border border-blue-500/15 shadow-[0_0_60px_-15px_rgba(59,130,246,0.18)]" />
        <div className="absolute inset-12 sm:inset-16 rounded-full border border-dashed border-indigo-500/20" />
        <div className="absolute inset-24 sm:inset-32 rounded-full border border-white/[0.04]" />

        {/* Calm rotating sweep beam */}
        <div
          className="absolute inset-1 sm:inset-2 rounded-full pointer-events-none opacity-25"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(59, 130, 246, 0.25) 0deg, transparent 65deg, transparent 360deg)',
            animation: 'radar-sweep 8s linear infinite',
          }}
        />

        {/* Center Device: This Machine / Phone */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-b from-[#182138] to-[#0f1424] border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-xl shadow-blue-500/20 gpu-layer">
            {selfDevice?.os === 'windows' ? (
              <Laptop className="w-6 h-6 sm:w-7 sm:h-7" />
            ) : (
              <Smartphone className="w-6 h-6 sm:w-7 sm:h-7" />
            )}
          </div>
          <span className="text-[10px] font-bold text-slate-300 mt-1.5 px-2 py-0.5 rounded-full bg-black/40 border border-white/5 truncate max-w-[90px]">
            {selfDevice?.name || 'جهازك'}
          </span>
        </div>

        {/* Orbiting Peer Device Bubbles (AirDrop Style) */}
        {activePeers.map((peer, idx) => {
          const { x, y } = getPeerCoordinates(idx, activePeers.length);
          const isSelected = peer.id === (selectedPeer?.id || selectedPeerId);

          return (
            <button
              key={peer.id}
              onClick={() => onSelectPeer(peer.id)}
              style={{ top: `${y}%`, left: `${x}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center transition-all duration-200 otium-press group ${
                isSelected ? 'scale-110 z-30' : 'hover:scale-105 opacity-90 hover:opacity-100'
              }`}
            >
              <div
                className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/40 ring-4 ring-blue-500/25'
                    : 'bg-[#141b2d] text-slate-300 border border-white/10 hover:border-blue-400/50'
                }`}
              >
                {peer.os === 'windows' ? (
                  <Laptop className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
                )}

                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-blue-600 flex items-center justify-center shadow-md">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </div>

              <span className={`text-[10px] font-bold mt-1 max-w-[75px] truncate px-1.5 py-0.5 rounded-md ${
                isSelected ? 'text-white bg-blue-500/20' : 'text-slate-300 bg-black/30'
              }`}>
                {peer.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Status / Selected Peer Action Bar */}
      {selectedPeer ? (
        <div className="relative z-10 mt-1 p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3 animate-otium-enter">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">
                متصل بـ: {selectedPeer.name}
              </span>
              <span className="text-[10px] text-slate-400 font-mono block truncate">
                {selectedPeer.ip}
              </span>
            </div>
          </div>

          {onLaunchRemoteCast && (
            <button
              type="button"
              onClick={() => onLaunchRemoteCast(selectedPeer)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 otium-press shrink-0"
              title="فتح شاشة العرض الذكي على هذا الجهاز"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>عرض ذكي</span>
            </button>
          )}
        </div>
      ) : (
        <div className="relative z-10 mt-1 py-2 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Wifi className="w-3.5 h-3.5 text-blue-400/80 animate-pulse" />
          <span>البحث عن أجهزة في الشبكة المحلية...</span>
        </div>
      )}
    </div>
  );
};
