import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTransferProgress,
  formatEtaArabic,
  clearTransferTracker,
} from '../transferSpeed';

describe('Real-Time Transfer Speed & ETA Calculator', () => {
  beforeEach(() => {
    clearTransferTracker('tx_test');
  });

  it('formats Arabic ETA strings accurately', () => {
    expect(formatEtaArabic(null)).toBe('متبقي لحظات...');
    expect(formatEtaArabic(0)).toBe('متبقي لحظات...');
    expect(formatEtaArabic(1)).toBe('متبقي أقل من ثانية');
    expect(formatEtaArabic(2)).toBe('متبقي ثانيتان');
    expect(formatEtaArabic(5)).toBe('متبقي 5 ثوانٍ');
    expect(formatEtaArabic(45)).toBe('متبقي 45 ثانية');
    expect(formatEtaArabic(60)).toBe('متبقي دقيقة واحدة');
    expect(formatEtaArabic(120)).toBe('متبقي دقيقتان');
    expect(formatEtaArabic(180)).toBe('متبقي 3 دقائق');
    expect(formatEtaArabic(3600)).toBe('متبقي ساعة واحدة');
    expect(formatEtaArabic(7200)).toBe('متبقي ساعتان');
    expect(formatEtaArabic(10800)).toBe('متبقي 3 ساعات');
    expect(formatEtaArabic(3660)).toBe('متبقي ساعة و 1 دقيقة');
  });

  it('computes instantaneous smoothed throughput and dynamic ETA', () => {
    const id = 'tx_test';
    const total = 10_000_000; // 10MB
    const t0 = 1000;

    // Initial sample
    const s0 = recordTransferProgress(id, 0, total, t0);
    expect(s0.speedBytesPerSec).toBe(0);

    // After 1 second, 2MB transferred -> speed approx 2MB/s
    const s1 = recordTransferProgress(id, 2_000_000, total, t0 + 1000);
    expect(s1.speedBytesPerSec).toBeCloseTo(2_000_000, -3);
    expect(s1.formattedSpeed).toContain('MB/s');
    expect(s1.etaSeconds).toBe(4); // 8MB remaining / 2MB/s = 4s
    expect(s1.formattedEta).toBe('متبقي 4 ثوانٍ');

    // Upon completion, tracker cleans up and returns 'مكتمل'
    const sDone = recordTransferProgress(id, total, total, t0 + 5000);
    expect(sDone.formattedEta).toBe('مكتمل');
  });
});
