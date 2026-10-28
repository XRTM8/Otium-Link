/**
 * Otium Link — Local Clipboard History Vault
 * Stores and categorizes recent clipboard entries with zero telemetry.
 */

export type ClipboardContentType = 'url' | 'code' | 'number' | 'text';

export interface HistoryItem {
  id: string;
  text: string;
  type: ClipboardContentType;
  timestamp: number;
  isCleanedUrl?: boolean;
  isSensitive?: boolean;
  sensitiveLabel?: string;
}

const STORAGE_KEY = 'otium_link_clip_history_v1';
const MAX_HISTORY_ITEMS = 30;
export const MAX_ITEM_TEXT_LENGTH = 20_000;

export function detectContentType(text: string): ClipboardContentType {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed)) {
    return 'url';
  }
  if (/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,15}$/.test(trimmed)) {
    return 'number';
  }
  if (
    trimmed.includes('{') ||
    trimmed.includes('}') ||
    trimmed.includes('function') ||
    trimmed.includes('const ') ||
    trimmed.includes('let ') ||
    trimmed.includes('def ') ||
    trimmed.includes('class ') ||
    trimmed.includes('import ') ||
    trimmed.includes('SELECT ') ||
    trimmed.includes('FROM ')
  ) {
    return 'code';
  }
  return 'text';
}

export function loadClipboardHistory(): HistoryItem[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addClipboardHistoryItem(
  text: string,
  isCleanedUrl?: boolean,
  isSensitive?: boolean,
  sensitiveLabel?: string
): HistoryItem[] {
  if (!text || !text.trim()) return loadClipboardHistory();
  const current = loadClipboardHistory();

  const rawTrimmed = text.trim();
  const safeText =
    rawTrimmed.length > MAX_ITEM_TEXT_LENGTH
      ? rawTrimmed.substring(0, MAX_ITEM_TEXT_LENGTH) + '\n... [مقتطع للحفظ المحلي]'
      : rawTrimmed;

  // Skip if same as the most recent item
  if (current.length > 0 && current[0].text === safeText) {
    return current;
  }

  const newItem: HistoryItem = {
    id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    text: safeText,
    type: detectContentType(safeText),
    timestamp: Date.now(),
    isCleanedUrl,
    isSensitive,
    sensitiveLabel,
  };

  const updated = [newItem, ...current.filter((item) => item.text !== safeText)].slice(
    0,
    MAX_HISTORY_ITEMS
  );

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('otium-clipboard-history-updated', { detail: updated }));
      }
    } catch {
      // Storage quota guard
    }
  }

  return updated;
}

export function clearClipboardHistory(): void {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('otium-clipboard-history-updated', { detail: [] }));
      }
    } catch {
      // Ignore
    }
  }
}

export function removeClipboardHistoryItem(id: string): HistoryItem[] {
  const current = loadClipboardHistory();
  const updated = current.filter((item) => item.id !== id);

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('otium-clipboard-history-updated', { detail: updated }));
      }
    } catch {
      // Ignore
    }
  }

  return updated;
}
