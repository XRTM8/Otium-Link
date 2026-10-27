import { describe, it, expect } from 'vitest';
import { formatBytes } from '../urlCleaner';

describe('formatBytes Utility', () => {
  it('formats zero bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats small bytes in B', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('formats megabytes with precision', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('formats gigabytes cleanly for large lossless transfers', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB');
  });

  it('safely handles sub-byte fractions without negative index undefined bug', () => {
    expect(formatBytes(0.5)).toBe('0.5 B');
    expect(formatBytes(0.1)).toBe('0.1 B');
  });
});
