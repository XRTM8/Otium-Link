import React from 'react';
import { Laptop, Smartphone, Radio, Plus, Check } from 'lucide-react';
import { Device } from '../core/types';

interface RadarVisualizerProps {
  devices: Device[];
  selectedPeerId: string | null;
  onSelectPeer: (id: string) => void;
  onOpenDirectConnect: () => void;
}

export const RadarVisualizer: React.FC<RadarVisualizerProps> = ({
  devices,
  selectedPeerId,
  onSelectPeer,
  onOpenDirectConnect,
}) => {
  const activePeers = devices.filter((d) => !d.isSelf);
  const selfDevice = devices.find((d) => d.isSelf);

  // Position peers in concentric orbit around center
  const getPeerCoordinates = (index: number, total: number) => {
    if (total === 1) return { x: 50, y: 22 };
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radius = 33; // Percentage from center
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x, y };
  };

  return (
    <div className="relative w-full rounded-2xl bg-gradient-to-b from-[#090e18]/90 to-[#07090e]/95 border border-white/[0.08] p-3.5 sm:p-4 overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">رادار الشبكة المحلية (P2P Mesh)</h3>
            <span className="text-[10px] text-gray-400">
              {activePeers.length > 0
                ? `${activePeers.length} أجهزة متصلة في النطاق`
                : 'جارٍ المسح والبحث التلقائي في الشبكة...'}
            </span>
          </div>
        </div>

        <button
          onClick={onOpenDirectConnect}
          title="الاتصال المباشر عبر عنوان IP عند وجود عزل في الراوتر"
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-gray-300 hover:text-white transition-all otium-press shadow-sm"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          <span>اتصال مباشر IP</span>
        </button>
      </div>

      {/* Circular Radar Graphic Area (Responsive: compact on mobile, expanded on desktop) */}
      <div className="relative w-full max-w-[210px] sm:max-w-[260px] mx-auto aspect-square my-2 flex items-center justify-center">
        {/* Radar Concentric Rings */}
        <div className="absolute inset-0 rounded-full border border-emerald-500/10" />
        <div className="absolute inset-6 sm:inset-8 rounded-full border border-emerald-500/15" />
        <div className="absolute inset-12 sm:inset-16 rounded-full border border-dashed border-emerald-500/20" />
        <div className="absolute inset-18 sm:inset-24 rounded-full border border-emerald-500/25" />

        {/* Crosshair Axes */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-px h-px bg-emerald-500/10" />
        <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-emerald-500/10" />

        {/* Radar Rotating Sweep Beam */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(16, 185, 129, 0.22) 0deg, transparent 65deg, transparent 360deg)',
            animation: 'radar-sweep 4.5s linear infinite',
          }}
        />

        {/* Center Device Blip (This Device) */}
        <div className="relative z-10 flex flex-col items-center justify-center p-2 rounded-2xl bg-[#0b1320] border border-emerald-500/40 shadow-lg shadow-emerald-500/20 text-emerald-400 gpu-layer animate-blip-pulse">
          {selfDevice?.os === 'windows' ? (
            <Laptop className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
          <span className="text-[9px] font-bold text-white mt-0.5 max-w-[60px] sm:max-w-[70px] truncate text-center">
            {selfDevice?.name || 'هذا الجهاز'}
          </span>
        </div>

        {/* Discovered Peer Blips positioned around radar */}
        {activePeers.map((peer, idx) => {
          const { x, y } = getPeerCoordinates(idx, activePeers.length);
          const isSelected = peer.id === selectedPeerId;

          return (
            <button
              key={peer.id}
              onClick={() => onSelectPeer(peer.id)}
              style={{ top: `${y}%`, left: `${x}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center p-1.5 sm:p-2 rounded-xl transition-all otium-press gpu-layer ${
                isSelected
                  ? 'bg-emerald-500/25 border-2 border-emerald-400 shadow-xl shadow-emerald-500/30 scale-110'
                  : 'bg-white/10 hover:bg-white/20 border border-white/20 hover:scale-105'
              }`}
            >
              <div
                className={`p-1 rounded-lg ${
                  peer.os === 'windows' ? 'text-cyan-400' : 'text-emerald-400'
                }`}
              >
                {peer.os === 'windows' ? (
                  <Laptop className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </div>
              <span className="text-[8px] sm:text-[9px] font-semibold text-white max-w-[55px] sm:max-w-[65px] truncate mt-0.5">
                {peer.name}
              </span>
              {isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-[7px] font-black shadow-md">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Discovered Peers Cards Grid below Radar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 relative z-10">
        {devices.map((device) => {
          const isSelected = !device.isSelf && device.id === selectedPeerId;
          return (
            <div
              key={device.id}
              onClick={() => !device.isSelf && onSelectPeer(device.id)}
              className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer otium-press ${
                device.isSelf
                  ? 'bg-white/[0.02] border-white/[0.06] cursor-default'
                  : isSelected
                  ? 'bg-emerald-500/15 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                  : 'bg-white/[0.03] border-white/[0.08] hover:border-emerald-500/40'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    device.os === 'windows'
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {device.os === 'windows' ? (
                    <Laptop className="w-4 h-4" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                </div>
                <div className="text-right min-w-0">
                  <span className="text-xs font-bold text-white block truncate">
                    {device.name}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono block truncate">
                    {device.ip}
                  </span>
                </div>
              </div>

              <div className="shrink-0 mr-2">
                {device.isSelf ? (
                  <span className="text-[10px] font-semibold text-gray-400 bg-white/5 px-2 py-0.5 rounded-md">
                    جهازك
                  </span>
                ) : isSelected ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-md">
                    <Check className="w-3 h-3" />
                    <span>المستهدف</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400 hover:text-white bg-white/5 px-2 py-0.5 rounded-md">
                    انقر للاستهداف
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activePeers.length === 0 && (
        <div className="mt-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          <span>
            جارٍ الاستكشاف التلقائي عبر الشبكة... شغّل Otium Link على هاتفك أو حاسوبك الآخر
          </span>
        </div>
      )}
    </div>
  );
};
