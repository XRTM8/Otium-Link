import { Device } from './types';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function fetchSelfDevice(): Promise<Device | null> {
  if (!isTauriEnvironment()) {
    return {
      id: 'web_self',
      name: 'متصفح الويب (تجريبي)',
      os: 'windows',
      ip: '127.0.0.1',
      port: 42425,
      lastSeen: Date.now(),
      status: 'paired',
      isSelf: true,
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<any>('get_self_device');
    return {
      id: raw.id,
      name: raw.name,
      os: raw.os,
      ip: raw.ip,
      port: raw.port,
      lastSeen: raw.last_seen,
      status: 'paired',
      isSelf: true,
    };
  } catch (err) {
    console.warn('Failed to fetch self device:', err);
    return null;
  }
}

export async function fetchDiscoveredPeers(): Promise<Device[]> {
  if (!isTauriEnvironment()) {
    return [];
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const rawList = await invoke<any[]>('get_peers');
    return rawList.map((p) => ({
      id: p.id,
      name: p.name,
      os: p.os,
      ip: p.ip,
      port: p.port,
      lastSeen: p.last_seen,
      status: 'paired',
      isSelf: false,
    }));
  } catch (err) {
    console.warn('Failed to fetch peers:', err);
    return [];
  }
}

export async function transmitClipboard(targetIp: string, text: string): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return true;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('send_clipboard', { targetIp, text });
    return true;
  } catch (err) {
    console.error('Failed to transmit clipboard over TCP:', err);
    return false;
  }
}

export async function transmitFile(targetIp: string, filePath: string): Promise<boolean> {
  if (!isTauriEnvironment()) {
    return true;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('send_file', { targetIp, filePath });
    return true;
  } catch (err) {
    console.error('Failed to stream file over TCP:', err);
    return false;
  }
}

export async function setupNativeListeners(
  onPeerDiscovered: (device: Device) => void,
  onClipboardReceived: (payload: { text: string; sender: string; timestamp: number }) => void,
  onFileReceived: (payload: { name: string; path: string; size: number; sender: string }) => void
): Promise<() => void> {
  if (!isTauriEnvironment()) {
    return () => {};
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');

    const unlistenPeer = await listen<any>('otium-link://peer-discovered', (event) => {
      const p = event.payload;
      onPeerDiscovered({
        id: p.id,
        name: p.name,
        os: p.os,
        ip: p.ip,
        port: p.port,
        lastSeen: p.last_seen,
        status: 'paired',
        isSelf: false,
      });
    });

    const unlistenClip = await listen<any>('otium-link://clipboard-received', (event) => {
      onClipboardReceived(event.payload);
    });

    const unlistenFile = await listen<any>('otium-link://file-received', (event) => {
      onFileReceived(event.payload);
    });

    return () => {
      unlistenPeer();
      unlistenClip();
      unlistenFile();
    };
  } catch {
    return () => {};
  }
}
