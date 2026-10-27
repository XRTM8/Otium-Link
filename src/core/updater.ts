/**
 * Otium Link — On-Demand GitHub Releases Update Checker.
 * 100% Private & Polite: Never polls the network in the background.
 * Only executes when explicitly requested by the user.
 */

export const APP_CURRENT_VERSION = '1.6.0';

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  matchedAsset?: ReleaseAsset;
  allAssets: ReleaseAsset[];
}

/**
 * Compares two semantic version strings (e.g. "1.5.1" vs "1.5.0").
 * Returns true if vCandidate is strictly greater than vCurrent.
 */
export function isNewerVersion(vCandidate: string, vCurrent: string): boolean {
  const cleanCand = vCandidate.trim().replace(/^v/i, '').trim();
  const cleanCurr = vCurrent.trim().replace(/^v/i, '').trim();

  const partsCand = cleanCand.split('.').map((p) => parseInt(p, 10) || 0);
  const partsCurr = cleanCurr.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsCand.length, partsCurr.length);
  for (let i = 0; i < maxLen; i++) {
    const c = partsCand[i] || 0;
    const cur = partsCurr[i] || 0;
    if (c > cur) return true;
    if (c < cur) return false;
  }
  return false;
}

/**
 * Detects the platform of the client.
 */
export function detectDevicePlatform(): 'windows' | 'android' | 'macos' | 'linux' {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
}

/**
 * Checks for updates using a 3-tier failover discovery system:
 * Tier 1: GitHub API (api.github.com/repos/XRTM8/Otium-Link/releases/latest)
 * Tier 2: GitHub Web Releases Redirect (github.com/XRTM8/Otium-Link/releases/latest) -> 0 rate limit
 * Tier 3: Raw Git package.json (raw.githubusercontent.com/XRTM8/Otium-Link/main/package.json) -> 0 rate limit
 */
export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  let tag: string | null = null;
  let releaseNotes = '';
  let publishedAt: string | undefined = undefined;
  let releaseUrl = 'https://github.com/XRTM8/Otium-Link/releases';
  let matchedAsset: ReleaseAsset | undefined = undefined;
  let allAssets: ReleaseAsset[] = [];
  const platform = detectDevicePlatform();

  // =========================================================================
  // TIER 1: Official GitHub Releases API
  // =========================================================================
  try {
    const GITHUB_API_URL = 'https://api.github.com/repos/XRTM8/Otium-Link/releases/latest';
    const response = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    }).catch(() => null);

    if (response && response.ok) {
      const apiData = await response.json().catch(() => null);
      if (apiData && (apiData.tag_name || apiData.name)) {
        tag = (apiData.tag_name || apiData.name).replace(/^v/i, '').trim();
        releaseNotes = apiData.body || '';
        publishedAt = apiData.published_at;
        releaseUrl = apiData.html_url || releaseUrl;

        if (Array.isArray(apiData.assets)) {
          allAssets = apiData.assets.map((a: any) => ({
            name: a.name,
            size: a.size,
            downloadUrl: a.browser_download_url,
          }));
        }
      }
    }
  } catch (err) {
    console.warn('Tier 1 GitHub API check failed, proceeding to Tier 2:', err);
  }

  // =========================================================================
  // TIER 2: GitHub Web Releases Redirect (100% immune to API rate limits)
  // =========================================================================
  if (!tag) {
    try {
      const webRes = await fetch('https://github.com/XRTM8/Otium-Link/releases/latest', {
        redirect: 'manual',
      }).catch(() => null);

      if (webRes) {
        const location = webRes.headers.get('location') || webRes.url;
        const match = location?.match(/tag\/v?([0-9]+\.[0-9]+\.[0-9]+)/i);
        if (match && match[1]) {
          tag = match[1].trim();
          releaseUrl = `https://github.com/XRTM8/Otium-Link/releases/tag/v${tag}`;
        }
      }
    } catch (err) {
      console.warn('Tier 2 GitHub web redirect check failed, proceeding to Tier 3:', err);
    }
  }

  // =========================================================================
  // TIER 3: Raw Repository package.json (Direct from Git raw, 0 rate limit)
  // =========================================================================
  if (!tag) {
    try {
      const RAW_PKG_URL = 'https://raw.githubusercontent.com/XRTM8/Otium-Link/main/package.json';
      const rawRes = await fetch(RAW_PKG_URL).catch(() => null);
      if (rawRes && rawRes.ok) {
        const pkgText = await rawRes.text().catch(() => null);
        if (pkgText) {
          const pkg = JSON.parse(pkgText);
          if (pkg && pkg.version) {
            tag = pkg.version.replace(/^v/i, '').trim();
            releaseUrl = `https://github.com/XRTM8/Otium-Link/releases/tag/v${tag}`;
          }
        }
      }
    } catch (err) {
      console.warn('Tier 3 Raw package.json check failed:', err);
    }
  }

  if (!tag) {
    throw new Error('تعذر الاتصال بخوادم التحديثات. يرجى التحقق من اتصالك بالإنترنت.');
  }

  const hasUpdate = isNewerVersion(tag, APP_CURRENT_VERSION);

  // Match best asset for client platform
  if (platform === 'windows') {
    matchedAsset =
      allAssets.find((a) => a.name.endsWith('.msi') || a.name.endsWith('.exe')) ||
      allAssets[0];
  } else if (platform === 'android') {
    matchedAsset =
      allAssets.find((a) => a.name.endsWith('.apk')) ||
      allAssets[0];
  } else {
    matchedAsset = allAssets[0];
  }

  return {
    hasUpdate,
    currentVersion: APP_CURRENT_VERSION,
    latestVersion: tag || APP_CURRENT_VERSION,
    releaseUrl,
    releaseNotes,
    publishedAt,
    matchedAsset,
    allAssets,
  };
}
