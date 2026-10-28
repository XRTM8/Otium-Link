import { describe, it, expect } from 'vitest';
import { isNewerVersion, detectDevicePlatform, APP_CURRENT_VERSION } from '../updater';

describe('Otium Link Updater & Version Comparator', () => {
  it('correctly compares semantic versions', () => {
    expect(isNewerVersion('1.5.1', '1.5.0')).toBe(true);
    expect(isNewerVersion('v1.5.1', '1.5.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.5.0')).toBe(true);
    expect(isNewerVersion('1.6.0', '1.5.9')).toBe(true);

    expect(isNewerVersion('1.5.0', '1.5.0')).toBe(false);
    expect(isNewerVersion('1.4.9', '1.5.0')).toBe(false);
    expect(isNewerVersion('1.4.0', '1.5.0')).toBe(false);
    expect(isNewerVersion('0.9.9', '1.5.0')).toBe(false);
  });

  it('handles prefixes and whitespace cleanly', () => {
    expect(isNewerVersion(' v1.5.2 ', 'v1.5.0')).toBe(true);
    expect(isNewerVersion('V2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('v1.5.0', '1.5.0')).toBe(false);
  });

  it('detects a valid client platform', () => {
    const platform = detectDevicePlatform();
    expect(['windows', 'android', 'macos', 'linux']).toContain(platform);
  });

  it('exports valid current version matching package version', () => {
    expect(APP_CURRENT_VERSION).toBe('1.7.0');
  });
});
