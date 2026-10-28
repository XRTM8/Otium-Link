import { describe, it, expect } from 'vitest';
import { parseClipboardFilePath, parseQRPairingUri } from '../filePathHelper';

describe('File Path Heuristic (LocalSend PR #3515)', () => {
  it('detects Windows absolute file path with double quotes', () => {
    const res = parseClipboardFilePath('"C:\\Users\\mjd20\\Documents\\Book.pdf"');
    expect(res.isFilePath).toBe(true);
    expect(res.fileName).toBe('Book.pdf');
    expect(res.extension).toBe('pdf');
    expect(res.filePath).toBe('C:\\Users\\mjd20\\Documents\\Book.pdf');
  });

  it('detects unquoted Windows path with forward slashes', () => {
    const res = parseClipboardFilePath('D:/Media/video.mp4');
    expect(res.isFilePath).toBe(true);
    expect(res.fileName).toBe('video.mp4');
    expect(res.extension).toBe('mp4');
  });

  it('detects Android / Linux file paths', () => {
    const res = parseClipboardFilePath('/storage/emulated/0/Download/document.docx');
    expect(res.isFilePath).toBe(true);
    expect(res.fileName).toBe('document.docx');
    expect(res.extension).toBe('docx');
  });

  it('rejects ordinary text messages', () => {
    const res = parseClipboardFilePath('Hello world, this is a plain message.');
    expect(res.isFilePath).toBe(false);
  });

  it('rejects web URLs with protocols', () => {
    const res = parseClipboardFilePath('https://example.com/file.pdf');
    expect(res.isFilePath).toBe(false);
  });

  it('rejects multiline text containing a path', () => {
    const res = parseClipboardFilePath('Line 1\nC:\\test.pdf');
    expect(res.isFilePath).toBe(false);
  });

  it('rejects paths without extension or unsupported extension', () => {
    const res = parseClipboardFilePath('C:\\Users\\mjd20\\somefolder');
    expect(res.isFilePath).toBe(false);
  });
});

describe('QR Pairing URI Parser (LocalSend PR #3437)', () => {
  it('parses custom otium://connect URI with full params', () => {
    const uri = 'otium://connect?ip=192.168.1.55&port=42425&name=Samsung%20S24&os=android';
    const parsed = parseQRPairingUri(uri);
    expect(parsed).not.toBeNull();
    expect(parsed?.ip).toBe('192.168.1.55');
    expect(parsed?.port).toBe(42425);
    expect(parsed?.name).toBe('Samsung S24');
    expect(parsed?.os).toBe('android');
  });

  it('parses raw IP address string', () => {
    const parsed = parseQRPairingUri('192.168.1.120');
    expect(parsed).not.toBeNull();
    expect(parsed?.ip).toBe('192.168.1.120');
    expect(parsed?.port).toBe(42425);
  });

  it('parses IP:port string', () => {
    const parsed = parseQRPairingUri('10.0.0.15:5000');
    expect(parsed).not.toBeNull();
    expect(parsed?.ip).toBe('10.0.0.15');
    expect(parsed?.port).toBe(5000);
  });

  it('returns null for invalid strings', () => {
    expect(parseQRPairingUri('invalid-ip-address')).toBeNull();
    expect(parseQRPairingUri('999.999.999.999')).toBeNull();
  });
});
