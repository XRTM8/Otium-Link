import { describe, it, expect } from 'vitest';
import { cleanUrl, formatBytes } from './urlCleaner';

describe('Smart URL Cleaner & Privacy Shield', () => {
  it('strips tracking parameters from YouTube URLs', () => {
    const dirty = 'https://youtu.be/dQw4w9WgXcQ?si=f50sX9e821&utm_source=share';
    const { cleanedUrl, wasCleaned, strippedParams } = cleanUrl(dirty);
    expect(wasCleaned).toBe(true);
    expect(cleanedUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(strippedParams).toContain('si');
    expect(strippedParams).toContain('utm_source');
  });

  it('strips Meta, Instagram, and TikTok tracking tags', () => {
    const metaDirty = 'https://instagram.com/p/C12345?igshid=abcdef&fbclid=12345';
    const { cleanedUrl: metaClean, wasCleaned: metaCleaned } = cleanUrl(metaDirty);
    expect(metaCleaned).toBe(true);
    expect(metaClean).toBe('https://instagram.com/p/C12345');

    const tiktokDirty = 'https://tiktok.com/@user/video/12345?_r=1&_t=8abcd&is_from_webapp=1';
    const { cleanedUrl: tiktokClean, wasCleaned: tiktokCleaned } = cleanUrl(tiktokDirty);
    expect(tiktokCleaned).toBe(true);
    expect(tiktokClean).toBe('https://tiktok.com/@user/video/12345');
  });

  it('strips Amazon referral and tag parameters', () => {
    const amazonDirty = 'https://amazon.com/dp/B08N5WRWNW?tag=myaffiliate-20&ref_=as_li_ss_tl';
    const { cleanedUrl, wasCleaned } = cleanUrl(amazonDirty);
    expect(wasCleaned).toBe(true);
    expect(cleanedUrl).toBe('https://amazon.com/dp/B08N5WRWNW');
  });

  it('preserves clean non-tracking query parameters', () => {
    const legitimate = 'https://duckduckgo.com/?q=otium+reader&kl=wt-wt';
    const { cleanedUrl, wasCleaned } = cleanUrl(legitimate);
    expect(wasCleaned).toBe(false);
    expect(cleanedUrl).toBe(legitimate);
  });

  it('formats bytes into clean human readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 4.5)).toBe('4.5 MB');
  });
});
