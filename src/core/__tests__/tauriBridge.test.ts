import { describe, it, expect } from 'vitest';
import { isTauriEnvironment, fetchSelfDevice, fetchDiscoveredPeers, transmitClipboard, transmitFile } from '../tauriBridge';

describe('Tauri Bridge & Fallback Safety', () => {
  it('detects non-Tauri environment in Node/Web gracefully', () => {
    expect(isTauriEnvironment()).toBe(false);
  });

  it('provides fallback self device in web preview mode', async () => {
    const self = await fetchSelfDevice();
    expect(self).not.toBeNull();
    expect(self?.isSelf).toBe(true);
    expect(self?.ip).toBe('127.0.0.1');
    expect(self?.port).toBe(42425);
  });

  it('returns empty peers list in web preview mode', async () => {
    const peers = await fetchDiscoveredPeers();
    expect(Array.isArray(peers)).toBe(true);
    expect(peers.length).toBe(0);
  });

  it('handles clipboard transmission mock safely in web mode', async () => {
    const result = await transmitClipboard('127.0.0.1', 'Hello Otium');
    expect(result).toBe(true);
  });

  it('handles file transmission mock safely in web mode', async () => {
    const result = await transmitFile('127.0.0.1', 'demo.pdf');
    expect(result).toBe(true);
  });

  it('safely handles empty target IP gracefully', async () => {
    const result = await transmitClipboard('', 'test');
    expect(typeof result).toBe('boolean');
  });
});
