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
    expect(s.cleanTrackingLinks).toBe(true);
    expect(s.requireFileConfirmation).toBe(false);
  });

  it('saves and updates individual settings', () => {
    saveSettings({ deviceName: 'حاسوب العمل', audioFeedback: false });
    const s = loadSettings();
    expect(s.deviceName).toBe('حاسوب العمل');
    expect(s.audioFeedback).toBe(false);
    expect(s.autoClipboardSync).toBe(true); // default preserved
  });

  it('persists changes across multiple partial updates', () => {
    saveSettings({ downloadDir: 'D:/CustomDownloads' });
    saveSettings({ cleanTrackingLinks: false });
    const s = loadSettings();
    expect(s.downloadDir).toBe('D:/CustomDownloads');
    expect(s.cleanTrackingLinks).toBe(false);
  });
});
