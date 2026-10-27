import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectContentType,
  loadClipboardHistory,
  addClipboardHistoryItem,
  clearClipboardHistory,
  removeClipboardHistoryItem,
} from '../clipboardHistory';

describe('Clipboard History Vault', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (globalThis as any).window = { dispatchEvent: () => true };
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
    };
  });

  it('detects URLs accurately', () => {
    expect(detectContentType('https://otium.dev')).toBe('url');
    expect(detectContentType('github.com/XRTM8/Otium-Link')).toBe('url');
  });

  it('detects code snippets accurately', () => {
    expect(detectContentType('const add = (a, b) => a + b;')).toBe('code');
    expect(detectContentType('def calculate(): return 42')).toBe('code');
    expect(detectContentType('SELECT * FROM users;')).toBe('code');
  });

  it('detects phone numbers accurately', () => {
    expect(detectContentType('+966 50 123 4567')).toBe('number');
    expect(detectContentType('0551234567')).toBe('number');
  });

  it('detects standard text', () => {
    expect(detectContentType('مرحباً بك في أوتيوم لينك')).toBe('text');
  });

  it('adds items, prevents consecutive duplicates, and caps history', () => {
    addClipboardHistoryItem('نص تجريبي 1');
    addClipboardHistoryItem('نص تجريبي 1'); // Duplicate should be ignored
    const list = loadClipboardHistory();
    expect(list.length).toBe(1);
    expect(list[0].text).toBe('نص تجريبي 1');

    addClipboardHistoryItem('نص تجريبي 2');
    const updated = loadClipboardHistory();
    expect(updated.length).toBe(2);
    expect(updated[0].text).toBe('نص تجريبي 2');
  });

  it('removes single item and clears history', () => {
    const items = addClipboardHistoryItem('العنصر المراد حذفه');
    const id = items[0].id;
    const remaining = removeClipboardHistoryItem(id);
    expect(remaining.length).toBe(0);

    addClipboardHistoryItem('نص 1');
    addClipboardHistoryItem('نص 2');
    clearClipboardHistory();
    expect(loadClipboardHistory().length).toBe(0);
  });

  it('truncates excessively long text to protect localStorage quota', () => {
    const hugeText = 'A'.repeat(30_000);
    const items = addClipboardHistoryItem(hugeText);
    expect(items[0].text.length).toBeLessThan(30_000);
    expect(items[0].text).toContain('[مقتطع للحفظ المحلي]');
  });
});
