export type DeviceOS = 'windows' | 'android' | 'macos' | 'linux';

export interface Device {
  id: string;
  name: string;
  os: DeviceOS;
  ip: string;
  port: number;
  lastSeen: number;
  status: 'paired' | 'discovered' | 'connecting';
  isSelf?: boolean;
}

export type TransferType = 'file' | 'text' | 'link' | 'image';
export type TransferStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TransferItem {
  id: string;
  name: string;
  size: number;
  type: TransferType;
  progress: number; // 0 to 1
  speedBytesPerSec?: number;
  status: TransferStatus;
  sender: string;
  receiver: string;
  timestamp: number;
  path?: string;
  verified?: boolean;
  previewUrl?: string;
  error?: string;
}

export interface ClipboardItem {
  id: string;
  text: string;
  cleanedText?: string;
  isCleaned: boolean;
  copiedAt: number;
  sourceDevice: string;
}

export interface LinkSettings {
  autoSyncClipboard: boolean;
  stripTrackingTokens: boolean;
  notifyOnReceived: boolean;
  deviceName: string;
  savePath?: string;
}
