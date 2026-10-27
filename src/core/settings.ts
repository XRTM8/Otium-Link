/**
 * Otium Link — Persistent Settings & Preferences Vault
 */

export interface AppSettings {
  deviceName: string;
  autoClipboardSync: boolean;
  audioFeedback: boolean;
  soundVolume: number; // 0.0 to 1.0
  cleanTrackingLinks: boolean;
  requireFileConfirmation: boolean;
  blockSensitiveAutoSync: boolean;
  downloadDir: string;
  trustedPeers: string[];
}

const SETTINGS_KEY = 'otium_link_settings_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  deviceName: '',
  autoClipboardSync: true,
  audioFeedback: true,
  soundVolume: 0.8,
  cleanTrackingLinks: true,
  requireFileConfirmation: false,
  blockSensitiveAutoSync: true,
  downloadDir: '',
  trustedPeers: [],
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const updated: AppSettings = { ...current, ...settings };
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('otium-settings-changed', { detail: updated }));
      }
    } catch {
      // LocalStorage quota or access denied guard
    }
  }
  return updated;
}
