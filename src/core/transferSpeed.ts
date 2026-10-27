/**
 * Otium Link — Real-Time Transfer Speed & ETA Velocity Calculator
 * Sliding-window tracker for ultra-accurate, smoothed bytes/sec throughput and dynamic ETA.
 */

import { formatBytes } from './urlCleaner';

export interface SpeedStats {
  speedBytesPerSec: number;
  formattedSpeed: string;
  etaSeconds: number | null;
  formattedEta: string;
}

interface TransferSample {
  timestamp: number;
  bytes: number;
}

interface TransferTracker {
  samples: TransferSample[];
  lastTransferred: number;
  total: number;
}

const trackers = new Map<string, TransferTracker>();
const WINDOW_MS = 2500; // 2.5 second sliding window for smooth velocity

export function formatEtaArabic(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return 'متبقي لحظات...';
  }
  const s = Math.round(seconds);
  if (s <= 1) return 'متبقي أقل من ثانية';
  if (s === 2) return 'متبقي ثانيتان';
  if (s >= 3 && s <= 10) return `متبقي ${s} ثوانٍ`;
  if (s < 60) return `متبقي ${s} ثانية`;

  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) {
    if (m === 1) return remSec > 0 ? `متبقي دقيقة و ${remSec} ثانية` : 'متبقي دقيقة واحدة';
    if (m === 2) return remSec > 0 ? `متبقي دقيقتان و ${remSec} ثانية` : 'متبقي دقيقتان';
    if (m >= 3 && m <= 10) return `متبقي ${m} دقائق`;
    return `متبقي ${m} دقيقة`;
  }

  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (h === 1) return remMin > 0 ? `متبقي ساعة و ${remMin} دقيقة` : 'متبقي ساعة واحدة';
  if (h === 2) return remMin > 0 ? `متبقي ساعتان و ${remMin} دقيقة` : 'متبقي ساعتان';
  if (h >= 3 && h <= 10) return `متبقي ${h} ساعات`;
  return `متبقي ${h} ساعة`;
}

export function recordTransferProgress(
  id: string,
  transferredBytes: number,
  totalBytes: number,
  now: number = Date.now()
): SpeedStats {
  if (totalBytes <= 0 || transferredBytes >= totalBytes) {
    trackers.delete(id);
    return {
      speedBytesPerSec: 0,
      formattedSpeed: '0 B/s',
      etaSeconds: 0,
      formattedEta: 'مكتمل',
    };
  }

  let tracker = trackers.get(id);
  if (!tracker) {
    tracker = {
      samples: [{ timestamp: now, bytes: transferredBytes }],
      lastTransferred: transferredBytes,
      total: totalBytes,
    };
    trackers.set(id, tracker);
    return {
      speedBytesPerSec: 0,
      formattedSpeed: 'جارٍ الحساب...',
      etaSeconds: null,
      formattedEta: 'جارٍ الحساب...',
    };
  }

  // Push new sample
  tracker.samples.push({ timestamp: now, bytes: transferredBytes });
  tracker.lastTransferred = transferredBytes;
  tracker.total = totalBytes;

  // Prune samples older than the sliding window
  const cutoff = now - WINDOW_MS;
  while (tracker.samples.length > 2 && tracker.samples[0].timestamp < cutoff) {
    tracker.samples.shift();
  }

  const oldest = tracker.samples[0];
  const timeDelta = (now - oldest.timestamp) / 1000;
  const bytesDelta = transferredBytes - oldest.bytes;

  let speed = 0;
  if (timeDelta > 0.2 && bytesDelta > 0) {
    speed = bytesDelta / timeDelta;
  }

  const remainingBytes = Math.max(0, totalBytes - transferredBytes);
  const etaSeconds = speed > 0 ? remainingBytes / speed : null;

  return {
    speedBytesPerSec: Math.round(speed),
    formattedSpeed: speed > 0 ? `${formatBytes(speed)}/s` : 'جارٍ الحساب...',
    etaSeconds: etaSeconds !== null ? Math.round(etaSeconds) : null,
    formattedEta: formatEtaArabic(etaSeconds),
  };
}

export function clearTransferTracker(id: string): void {
  trackers.delete(id);
}
