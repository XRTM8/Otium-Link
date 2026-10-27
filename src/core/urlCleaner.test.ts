import { describe, expect, it } from 'vitest';
import { cleanUrl, formatBytes } from './urlCleaner';

describe('urlCleaner', () => {
  it('strips tracking parameters from YouTube URLs', () => {
    const dirty = 'https://youtu.be/dQw4w9WgXcQ?si=abcdef123456&feature=shared';
    const { cleanedUrl, wasCleaned } = cleanUrl(dirty);
    expect(wasCleaned).toBe(true);
    expect(cleanedUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('strips UTM and Facebook tracking tags', () => {
    const dirty = 'https://example.com/article?utm_source=twitter&utm_medium=social&fbclid=IwAR123';
    const { cleanedUrl, wasCleaned } = cleanUrl(dirty);
    expect(wasCleaned).toBe(true);
    expect(cleanedUrl).toBe('https://example.com/article');
  });

  it('preserves clean non-tracking query parameters', () => {
    const clean = 'https://example.com/search?q=rust+lang&page=2';
    const { cleanedUrl, wasCleaned } = cleanUrl(clean);
    expect(wasCleaned).toBe(false);
    expect(cleanedUrl).toBe(clean);
  });

  it('formats bytes into human readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 4.5)).toBe('4.5 MB');
  });
});
