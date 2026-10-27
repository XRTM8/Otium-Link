/**
 * Privacy Link Cleaner Engine for Otium Link.
 * Strips aggressive tracking parameters (UTM, Facebook, TikTok, X/Twitter, Google)
 * so shared links are clean, private, and lightweight.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_eid',
  'igshid',
  'si', // YouTube Share ID
  'feature', // YouTube tracking
  '_hsenc',
  '_hsmi',
  'ref',
  'ref_src',
  's', // Twitter/X share
  't', // Twitter/X timestamp
]);

export function cleanUrl(rawUrl: string): { cleanedUrl: string; wasCleaned: boolean } {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return { cleanedUrl: rawUrl, wasCleaned: false };
    }

    const parsed = new URL(trimmed);
    let removedAny = false;

    // Remove tracking query parameters
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
      removedAny = true;
    }

    return {
      cleanedUrl: parsed.toString(),
      wasCleaned: removedAny,
    };
  } catch {
    return { cleanedUrl: rawUrl, wasCleaned: false };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(1).replace(/\.0$/, '');
  return `${formatted} ${units[i]}`;
}
