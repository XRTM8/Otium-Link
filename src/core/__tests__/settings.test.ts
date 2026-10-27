import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings } from '../settings';

describe('Settings Management', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    (globalThis as any).window = {
      dispatchEvent: () => true,
    };
    (globalThis as any).localStorage = mockStorage;
  });

  it('loads default settings when storage is empty', () => {
    const s = loadSettings();
    expect(s.autoClipboardSync).toBe(true);
    expect(s.audioFeedback).toBe(true);
    expect(s.soundVolume).toBe(0.8);
    expect(s.cleanTrackingLinks).toBe(true);
    expect(s.requireFileConfirmation).toBe(false);
    expect(Array.isArray(s.trustedPeers)).toBe(true);
  });

  it('saves and updates individual settings', () => {
    saveSettings({ deviceName: 'حاسوب العمل', soundVolume: 0.5 });
    const s = loadSettings();
    expect(s.deviceName).toBe('حاسوب العمل');
    expect(s.soundVolume).toBe(0.5);
    expect(s.autoClipboardSync).toBe(true); // default preserved
  });

  it('manages trusted peers whitelist', () => {
    saveSettings({ trustedPeers: ['peer_android_123456'] });
    const s = loadSettings();
    expect(s.trustedPeers).toContain('peer_android_123456');
  });
});
