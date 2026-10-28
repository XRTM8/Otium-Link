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
    const raw = await invoke<{
      id: string;
      name: string;
      os: string;
      ip: string;
      port: number;
      last_seen: number;
    }>('get_self_device');
    return {
      id: raw.id,
      name: raw.name,
      os: raw.os as Device['os'],
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

export async function updateDeviceName(name: string): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_device_name', { name });
    return true;
  } catch (err) {
    console.error('Failed to set device name:', err);
    return false;
  }
}

export async function fetchDownloadDir(): Promise<string> {
  if (!isTauriEnvironment()) return 'Downloads/OtiumLink';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('get_download_dir');
  } catch {
    return '';
  }
}

export async function updateDownloadDir(path: string): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_download_dir', { path });
    return true;
  } catch (err) {
    console.error('Failed to set download dir:', err);
    return false;
  }
}

export async function openDownloadsFolder(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_downloads_folder');
    return true;
  } catch (err) {
    console.warn('Failed to open downloads folder:', err);
    return false;
  }
}

export async function openLocalFile(filePath: string): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_file', { filePath });
    return true;
  } catch (err) {
    console.warn('Failed to open file:', err);
    return false;
  }
}

export async function fetchDiscoveredPeers(): Promise<Device[]> {
  if (!isTauriEnvironment()) {
    return [];
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const rawList = await invoke<Array<{
      id: string;
      name: string;
      os: string;
      ip: string;
      port: number;
      last_seen: number;
    }>>('get_peers');
    return rawList.map((p) => ({
      id: p.id,
      name: p.name,
      os: p.os as Device['os'],
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

export async function addDirectPeer(
  ip: string,
  name: string,
  os: 'windows' | 'android' | 'macos' | 'linux'
): Promise<Device | null> {
  const trimmedIp = ip.trim();
  const cleanName = name.trim() || (os === 'windows' ? 'حاسوب مباشر' : 'هاتف مباشر');

  if (!isTauriEnvironment()) {
    return {
      id: `direct_${trimmedIp.replace(/\./g, '_')}`,
      name: cleanName,
      os,
      ip: trimmedIp,
      port: 42425,
      lastSeen: Date.now(),
      status: 'paired',
      isSelf: false,
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<{
      id: string;
      name: string;
      os: string;
      ip: string;
      port: number;
      last_seen: number;
    }>('add_direct_peer', { ip: trimmedIp, name: cleanName, os });
    return {
      id: raw.id,
      name: raw.name,
      os: raw.os as Device['os'],
      ip: raw.ip,
      port: raw.port,
      lastSeen: raw.last_seen,
      status: 'paired',
      isSelf: false,
    };
  } catch (err) {
    console.warn('Failed to register direct peer in backend:', err);
    return {
      id: `direct_${trimmedIp.replace(/\./g, '_')}`,
      name: cleanName,
      os,
      ip: trimmedIp,
      port: 42425,
      lastSeen: Date.now(),
      status: 'paired',
      isSelf: false,
    };
  }
}

export async function removeDirectPeer(id: string): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('remove_direct_peer', { id });
    return true;
  } catch (err) {
    console.warn('Failed to remove direct peer:', err);
    return false;
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

export interface NativeListenersConfig {
  onPeerDiscovered: (device: Device) => void;
  onPeersUpdated?: (devices: Device[]) => void;
  onClipboardReceived: (payload: { text: string; sender: string; timestamp: number }) => void;
  onNativeClipboardChanged?: (payload: { text: string; sender: string }) => void;
  onFileReceived: (payload: { name: string; path: string; size: number; sender: string; verified?: boolean }) => void;
  onFileProgress?: (payload: { name: string; transferred: number; total: number; sender: string }) => void;
  onFileError?: (payload: { name: string; sender: string; error: string }) => void;
}

export async function setupNativeListeners(config: NativeListenersConfig): Promise<() => void> {
  if (!isTauriEnvironment()) {
    return () => {};
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisteners: Array<() => void> = [];

    const unlistenPeer = await listen<{
      id: string;
      name: string;
      os: string;
      ip: string;
      port: number;
      last_seen: number;
    }>('otium-link://peer-discovered', (event) => {
      const p = event.payload;
      config.onPeerDiscovered({
        id: p.id,
        name: p.name,
        os: p.os as Device['os'],
        ip: p.ip,
        port: p.port,
        lastSeen: p.last_seen,
        status: 'paired',
        isSelf: false,
      });
    });
    unlisteners.push(unlistenPeer);

    if (config.onPeersUpdated) {
      const unlistenUpdated = await listen<Array<{
        id: string;
        name: string;
        os: string;
        ip: string;
        port: number;
        last_seen: number;
      }>>('otium-link://peers-updated', (event) => {
        const peers = event.payload.map((p) => ({
          id: p.id,
          name: p.name,
          os: p.os as Device['os'],
          ip: p.ip,
          port: p.port,
          lastSeen: p.last_seen,
          status: 'paired' as const,
          isSelf: false,
        }));
        config.onPeersUpdated!(peers);
      });
      unlisteners.push(unlistenUpdated);
    }

    const unlistenClip = await listen<{ text: string; sender: string; timestamp: number }>(
      'otium-link://clipboard-received',
      (event) => {
        config.onClipboardReceived(event.payload);
      }
    );
    unlisteners.push(unlistenClip);

    if (config.onNativeClipboardChanged) {
      const unlistenNativeClip = await listen<{ text: string; sender: string }>(
        'otium-link://native-clipboard-changed',
        (event) => {
          config.onNativeClipboardChanged!(event.payload);
        }
      );
      unlisteners.push(unlistenNativeClip);
    }

    const unlistenFile = await listen<{ name: string; path: string; size: number; sender: string; verified?: boolean }>(
      'otium-link://file-received',
      (event) => {
        config.onFileReceived(event.payload);
      }
    );
    unlisteners.push(unlistenFile);

    if (config.onFileProgress) {
      const unlistenProgress = await listen<{ name: string; transferred: number; total: number; sender: string }>(
        'otium-link://file-progress',
        (event) => {
          config.onFileProgress!(event.payload);
        }
      );
      unlisteners.push(unlistenProgress);
    }

    if (config.onFileError) {
      const unlistenErr = await listen<{ name: string; sender: string; error: string }>(
        'otium-link://file-error',
        (event) => {
          config.onFileError!(event.payload);
        }
      );
      unlisteners.push(unlistenErr);
    }

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  } catch {
    return () => {};
  }
}

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return true;
  } catch {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  }
}

export interface CastInfo {
  is_running: boolean;
  port: number;
  local_ip: string;
  url: string;
  pin: string;
  connected_viewers: number;
  current_slide: number;
  total_slides: number;
}

export interface SlideData {
  index: number;
  total: number;
  title: string;
  text: string;
  image_data?: string | null;
}

export async function startCastServer(pin?: string): Promise<CastInfo> {
  if (!isTauriEnvironment()) {
    return {
      is_running: true,
      port: 42426,
      local_ip: '192.168.1.100',
      url: 'http://192.168.1.100:42426',
      pin: pin || '1234',
      connected_viewers: 1,
      current_slide: 0,
      total_slides: 1,
    };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<CastInfo>('start_cast', { pin: pin || null });
}

export async function stopCastServer(): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_cast');
    return true;
  } catch {
    return false;
  }
}

export async function fetchCastInfo(): Promise<CastInfo> {
  if (!isTauriEnvironment()) {
    return {
      is_running: false,
      port: 42426,
      local_ip: '127.0.0.1',
      url: 'http://127.0.0.1:42426',
      pin: '',
      connected_viewers: 0,
      current_slide: 0,
      total_slides: 1,
    };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<CastInfo>('get_cast_info');
}

export async function setCastSlideIndex(index: number): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_cast_slide_index', { index });
    return true;
  } catch {
    return false;
  }
}

export async function setCastSlides(slides: SlideData[]): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_cast_slides', { slides });
    return true;
  } catch {
    return false;
  }
}

export async function updateCastLaser(x: number, y: number, active: boolean): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('update_cast_laser', { x, y, active });
    return true;
  } catch {
    return false;
  }
}

export async function broadcastCastMessage(text: string, urgent: boolean = true): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('broadcast_cast_message', { text, urgent });
    return true;
  } catch {
    return false;
  }
}
