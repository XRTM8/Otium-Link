/**
 * Otium Link — File Path & QR Heuristic Helpers
 * Inspired by community innovations in LocalSend (PR #3515 & PR #3437)
 */

export interface ClipboardPathResult {
  isFilePath: boolean;
  filePath: string;
  fileName: string;
  extension: string;
}

export function parseClipboardFilePath(rawText: string): ClipboardPathResult {
  if (!rawText) {
    return { isFilePath: false, filePath: '', fileName: '', extension: '' };
  }

  const text = rawText.trim();

  // Guard: Multi-line text is ordinary prose, not a single file path
  if (text.includes('\n') || text.includes('\r')) {
    return { isFilePath: false, filePath: '', fileName: '', extension: '' };
  }

  // Guard: URLs and protocols are not local filesystem paths
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    return { isFilePath: false, filePath: '', fileName: '', extension: '' };
  }

  // Strip single or double quotes surrounding the path (e.g. "C:\Path\to\file.pdf")
  let cleanPath = text;
  if (
    (cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
    (cleanPath.startsWith("'") && cleanPath.endsWith("'"))
  ) {
    cleanPath = cleanPath.slice(1, -1).trim();
  }

  // Windows path: C:\... or \\server\...
  const isWindowsPath = /^[a-zA-Z]:[/\\]/.test(cleanPath) || /^\\\\[^/\\]+[/\\]/.test(cleanPath);
  // Unix / Android path: /storage/... or /home/... or /sdcard/...
  const isUnixPath = cleanPath.startsWith('/') && !cleanPath.startsWith('//');

  if (!isWindowsPath && !isUnixPath) {
    return { isFilePath: false, filePath: '', fileName: '', extension: '' };
  }

  // Extract filename & extension
  const normalized = cleanPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || '';

  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === fileName.length - 1) {
    return { isFilePath: false, filePath: '', fileName: '', extension: '' };
  }

  const extension = fileName.slice(dotIdx + 1).toLowerCase();

  // Known media, document, archive, and code extensions
  const validExtensions = new Set([
    'pdf', 'epub', 'mobi', 'cbz', 'cbr', 'djvu',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic',
    'mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'flac', 'm4a', 'aac',
    'zip', 'rar', '7z', 'tar', 'gz', 'apk', 'exe', 'msi',
    'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'json'
  ]);

  if (!validExtensions.has(extension)) {
    return { isFilePath: false, filePath: '', fileName: '', extension: '' };
  }

  return {
    isFilePath: true,
    filePath: cleanPath,
    fileName,
    extension,
  };
}

/**
 * Parses Otium Direct Connect QR link or raw IP
 * Format: otium://connect?ip=192.168.1.10&port=42425&name=Phone&os=android
 * Also supports: http://192.168.1.10:42425
 */
export interface QRPairingInfo {
  ip: string;
  port: number;
  name?: string;
  os?: 'windows' | 'android';
}

export function parseQRPairingUri(raw: string): QRPairingInfo | null {
  if (!raw) return null;
  const text = raw.trim();

  // Check otium:// scheme or http://
  if (text.startsWith('otium://connect') || text.startsWith('http://') || text.startsWith('https://')) {
    try {
      const url = new URL(text.replace('otium://connect', 'http://otium.local'));
      const ip = url.searchParams.get('ip') || (url.hostname !== 'otium.local' ? url.hostname : null);
      if (!ip) return null;
      const port = parseInt(url.searchParams.get('port') || url.port || '42425', 10);
      const name = url.searchParams.get('name') || undefined;
      const osParam = url.searchParams.get('os');
      const os = (osParam === 'windows' || osParam === 'android') ? osParam : undefined;
      return { ip, port, name, os };
    } catch {
      return null;
    }
  }

  // Direct IP:port match
  const ipPortMatch = text.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$/);
  if (ipPortMatch) {
    const octets = ipPortMatch[1].split('.').map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return {
        ip: ipPortMatch[1],
        port: ipPortMatch[2] ? parseInt(ipPortMatch[2], 10) : 42425,
      };
    }
  }

  return null;
}
