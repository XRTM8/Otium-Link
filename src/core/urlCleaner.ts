/**
 * Otium Link — Privacy Shield & Smart URL Cleaner
 * Strips surveillance, affiliate, and analytics trackers across all platforms.
 */

export const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Analytics & Marketing
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',

  // Meta / Facebook / Instagram
  'fbclid',
  'fbadid',
  'igshid',
  'ig_rid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',

  // Twitter / X
  'twclid',
  'ref_src',
  'ref_url',

  // YouTube & Google
  'si',
  'feature',
  'pp',
  'ved',
  'ei',
  'sei',

  // TikTok
  '_r',
  '_t',
  'checksum',
  'is_from_webapp',
  'sender_device',

  // Amazon & E-commerce
  'tag',
  'linkCode',
  'ref_',
  'pf_rd_r',
  'pf_rd_m',
  'pf_rd_t',
  'pf_rd_i',
  'pf_rd_p',
  'pf_rd_s',

  // Email & Newsletter Marketing
  'mc_cid',
  'mc_eid',
  'vero_id',
  'wickedid',
  '_hsenc',
  '_hsmi',
]);

export interface CleanUrlResult {
  cleanedUrl: string;
  wasCleaned: boolean;
  strippedParams: string[];
}

export function cleanUrl(rawUrl: string): CleanUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { cleanedUrl: '', wasCleaned: false, strippedParams: [] };
  }

  const trimmed = rawUrl.trim();

  // If the input doesn't look like a URL with query parameters, return immediately
  if (!trimmed.includes('?') && !trimmed.includes('&')) {
    return { cleanedUrl: trimmed, wasCleaned: false, strippedParams: [] };
  }

  try {
    // Add protocol if missing to enable URL parsing for plain domains
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const urlToParse = hasProtocol ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlToParse);

    const strippedParams: string[] = [];
    const keys = Array.from(parsed.searchParams.keys());

    for (const key of keys) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_') || lower.startsWith('pf_rd_')) {
        parsed.searchParams.delete(key);
        strippedParams.push(key);
      }
    }

    const wasCleaned = strippedParams.length > 0;
    let result = parsed.toString();

    // If user originally provided URL without protocol, strip artificial protocol
    if (!hasProtocol) {
      result = result.replace(/^https:\/\//i, '');
    }

    // Clean trailing question mark if search params became completely empty
    if (result.endsWith('?')) {
      result = result.slice(0, -1);
    }

    return {
      cleanedUrl: result,
      wasCleaned,
      strippedParams,
    };
  } catch {
    return { cleanedUrl: trimmed, wasCleaned: false, strippedParams: [] };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(1).replace(/\.0$/, '');
  return `${formatted} ${units[i]}`;
}
